'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { cashShift, comanda, restaurant, restaurantMembership, restaurantStats, restaurantTable, sale, shiftMovement, tableOrder } from '@/lib/db/schema'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { sendShiftReportEmail, type EmailAttachment } from '@/lib/email'
import { getPublicReceipt } from '@/app/actions/receipts'
import { renderReceiptImage } from '@/lib/receipt-image'
import { renderShiftSummaryImage } from '@/lib/shift-summary-image'

// Bounds how many per-sale receipt images we render for one shift-close
// email — each render costs real time (satori + resvg), and a very busy
// shift shouldn't stall closeShift for minutes. The email's total-sales line
// always covers every sale regardless of this cap.
const MAX_RECEIPT_IMAGES = 40

// `cash_shift` only ever holds the currently open shift (see schema.ts) — a
// closed one is emailed in full then deleted, so this DTO carries none of the
// close-time fields; those exist only transiently inside closeShift below.
export type ShiftDTO = { id: string; shiftNumber: number | null; openedByName: string; openingCashCents: number; openedAt: string }

export type ShiftExpenseDTO = { id: string; description: string; amountCents: number; createdByName: string; createdAt: string }

export type ShiftSummaryDTO = {
  shift: ShiftDTO
  cashSalesCents: number
  cardSalesCents: number
  transferSalesCents: number
  expensesCents: number
  expectedCashCents: number
  expenses: ShiftExpenseDTO[]
  openTableLabels: string[]
}

export type CloseShiftResultDTO = { shiftNumber: number | null; totalSalesCents: number; differenceCents: number }

async function requireMembership() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('No autorizado')
  const rows = await db
    .select({ restaurantId: restaurantMembership.restaurantId, branchId: restaurantMembership.branchId })
    .from(restaurantMembership)
    .where(and(eq(restaurantMembership.userId, session.user.id), eq(restaurantMembership.isActive, true)))
    .limit(1)
  if (!rows.length || !rows[0].branchId) throw new Error('No tienes un restaurante asignado')
  return {
    userId: session.user.id,
    userName: session.user.name as string | undefined,
    userEmail: session.user.email as string,
    restaurantId: rows[0].restaurantId,
    branchId: rows[0].branchId as string,
  }
}

function toDTO(row: any): ShiftDTO {
  return { id: row.id, shiftNumber: row.shiftNumber, openedByName: row.openedByName, openingCashCents: row.openingCashCents, openedAt: row.openedAt.toISOString() }
}

// At most one row per restaurant ever exists here — no status filter needed.
async function getOpenShiftRow(restaurantId: string) {
  const [row] = await db.select().from(cashShift).where(eq(cashShift.restaurantId, restaurantId)).limit(1)
  return row ?? null
}

// Table labels with an open (unpaid) account — a shift can't close while any exist.
async function getOpenTableLabels(restaurantId: string): Promise<string[]> {
  const openOrders = await db.select({ tableId: tableOrder.tableId }).from(tableOrder).where(and(eq(tableOrder.restaurantId, restaurantId), eq(tableOrder.status, 'open')))
  if (!openOrders.length) return []
  const tableIds = openOrders.map((o: any) => o.tableId)
  const tables = await db.select({ label: restaurantTable.label }).from(restaurantTable).where(inArray(restaurantTable.id, tableIds))
  return tables.map((t: any) => t.label)
}

// Live totals for the currently open shift — used by both the header badge
// (via getActiveShift) and the "cierre de caja" screen (via getShiftSummary).
async function computeLiveTotals(shiftId: string) {
  const sales = await db.select({ totalCents: sale.totalCents, paymentMethod: sale.paymentMethod }).from(sale).where(eq(sale.shiftId, shiftId))
  const sumBy = (method: string) => sales.filter((s: any) => s.paymentMethod === method).reduce((sum: number, s: any) => sum + s.totalCents, 0)
  const cashSalesCents = sumBy('cash')
  const cardSalesCents = sumBy('card')
  const transferSalesCents = sumBy('transfer')

  const movements = await db.select().from(shiftMovement).where(eq(shiftMovement.shiftId, shiftId)).orderBy(shiftMovement.createdAt)
  const expensesCents = movements.reduce((sum: number, m: any) => sum + m.amountCents, 0)

  return {
    cashSalesCents,
    cardSalesCents,
    transferSalesCents,
    expensesCents,
    expenses: movements.map((m: any) => ({ id: m.id, description: m.description, amountCents: m.amountCents, createdByName: m.createdByName, createdAt: m.createdAt.toISOString() })),
  }
}

export async function getActiveShift(): Promise<ShiftDTO | null> {
  const { restaurantId } = await requireMembership()
  const row = await getOpenShiftRow(restaurantId)
  return row ? toDTO(row) : null
}

export async function getShiftSummary(): Promise<ShiftSummaryDTO | null> {
  const { restaurantId } = await requireMembership()
  const row = await getOpenShiftRow(restaurantId)
  if (!row) return null
  const { cashSalesCents, cardSalesCents, transferSalesCents, expensesCents, expenses } = await computeLiveTotals(row.id)
  const expectedCashCents = row.openingCashCents + cashSalesCents - expensesCents
  const openTableLabels = await getOpenTableLabels(restaurantId)
  return { shift: toDTO(row), cashSalesCents, cardSalesCents, transferSalesCents, expensesCents, expectedCashCents, expenses, openTableLabels }
}

export async function openShift(openingCashCents: number): Promise<ShiftDTO> {
  const { userId, userName, restaurantId, branchId } = await requireMembership()
  if (!Number.isFinite(openingCashCents) || openingCashCents < 0) throw new Error('Monto de apertura inválido')
  const existing = await getOpenShiftRow(restaurantId)
  if (existing) throw new Error('Ya hay un turno abierto')

  // Sequential per restaurant ("Turno 1", "Turno 2", ...) via an atomic
  // counter in restaurant_stats — cash_shift rows get deleted on close, so
  // counting them (the old approach) would repeat numbers.
  await db.insert(restaurantStats).values({ restaurantId }).onConflictDoNothing()
  const [counter] = await db
    .update(restaurantStats)
    .set({ totalShiftsOpened: sql`${restaurantStats.totalShiftsOpened} + 1` })
    .where(eq(restaurantStats.restaurantId, restaurantId))
    .returning({ totalShiftsOpened: restaurantStats.totalShiftsOpened })
  const shiftNumber = counter?.totalShiftsOpened ?? 1

  const id = crypto.randomUUID()
  const openedByName = userName?.trim() || 'Equipo'
  const openedAt = new Date()
  await db.insert(cashShift).values({ id, restaurantId, branchId, shiftNumber, openedByUserId: userId, openedByName, openingCashCents: Math.round(openingCashCents), openedAt })
  revalidatePath('/restaurante')
  return { id, shiftNumber, openedByName, openingCashCents: Math.round(openingCashCents), openedAt: openedAt.toISOString() }
}

export async function addShiftExpense(input: { amountCents: number; description: string }): Promise<ShiftSummaryDTO> {
  const { userId, userName, restaurantId } = await requireMembership()
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) throw new Error('Monto inválido')
  if (!input.description.trim()) throw new Error('Describe el gasto o retiro')
  const shift = await getOpenShiftRow(restaurantId)
  if (!shift) throw new Error('No hay un turno abierto')

  await db.insert(shiftMovement).values({
    id: crypto.randomUUID(),
    shiftId: shift.id,
    restaurantId,
    amountCents: Math.round(input.amountCents),
    description: input.description.trim(),
    createdByUserId: userId,
    createdByName: userName?.trim() || 'Equipo',
  })
  revalidatePath('/restaurante')
  const summary = await getShiftSummary()
  if (!summary) throw new Error('No se pudo actualizar el turno')
  return summary
}

type CloseShiftContext = {
  to: string
  restaurantId: string
  shiftId: string
  shiftNumber: number | null
  openedByName: string
  openedAt: Date
  closedByName: string
  closedAt: Date
  cashSalesCents: number
  cardSalesCents: number
  transferSalesCents: number
  expenses: ShiftExpenseDTO[]
  expensesCents: number
  openingCashCents: number
  closingCashCents: number
  expectedCashCents: number
  differenceCents: number
}

// Renders the "factura grande" (whole-shift cash-register summary) and one
// receipt image per sale, then emails them together. Both the cash_shift row
// and every sale/expense/comanda behind this turno are deleted right after
// this runs (see closeShift) — this email is the only place that detail
// survives, per user request to stop accumulating it in the database.
async function emailShiftReport(ctx: CloseShiftContext): Promise<number> {
  const [rest] = await db.select({ name: restaurant.name, logoUrl: restaurant.logoUrl }).from(restaurant).where(eq(restaurant.id, ctx.restaurantId)).limit(1)
  const sales = await db
    .select({ id: sale.id, folio: sale.folio, totalCents: sale.totalCents, paymentMethod: sale.paymentMethod, createdAt: sale.createdAt })
    .from(sale)
    .where(eq(sale.shiftId, ctx.shiftId))

  const receiptImages: EmailAttachment[] = []
  for (const s of sales.slice(0, MAX_RECEIPT_IMAGES)) {
    try {
      const receipt = await getPublicReceipt(s.id)
      if (!receipt) continue
      const content = await renderReceiptImage(receipt)
      receiptImages.push({ filename: `recibo-${receipt.folio ?? s.id.slice(0, 8)}.png`, content, contentType: 'image/png' })
    } catch (err) {
      console.error('No se pudo generar la imagen de un recibo', s.id, err)
    }
  }
  const skippedReceiptImages = Math.max(0, sales.length - MAX_RECEIPT_IMAGES)
  const totalSalesCents = ctx.cashSalesCents + ctx.cardSalesCents + ctx.transferSalesCents

  try {
    const summaryImageBuffer = await renderShiftSummaryImage({
      restaurantName: rest?.name ?? 'Tu restaurante',
      logoUrl: rest?.logoUrl ?? null,
      shiftNumber: ctx.shiftNumber,
      openedByName: ctx.openedByName,
      openedAt: ctx.openedAt,
      closedByName: ctx.closedByName,
      closedAt: ctx.closedAt,
      openingCashCents: ctx.openingCashCents,
      cashSalesCents: ctx.cashSalesCents,
      cardSalesCents: ctx.cardSalesCents,
      transferSalesCents: ctx.transferSalesCents,
      salesCount: sales.length,
      expensesCents: ctx.expensesCents,
      expenses: ctx.expenses,
      expectedCashCents: ctx.expectedCashCents,
      closingCashCents: ctx.closingCashCents,
      differenceCents: ctx.differenceCents,
    })
    await sendShiftReportEmail({
      to: ctx.to,
      restaurantName: rest?.name ?? 'Tu restaurante',
      shiftNumber: ctx.shiftNumber,
      closedAt: ctx.closedAt,
      salesCount: sales.length,
      totalSalesCents,
      differenceCents: ctx.differenceCents,
      summaryImage: { filename: `cierre-turno-${ctx.shiftNumber ?? ctx.shiftId.slice(0, 8)}.png`, content: summaryImageBuffer, contentType: 'image/png' },
      receiptImages,
      skippedReceiptImages,
    })
  } catch (err) {
    // Don't block the shift close on an email-provider hiccup — everything
    // still gets deleted below, so log loudly if this ever fails.
    console.error('No se pudo enviar el reporte de cierre de turno por correo', err)
  }
  return sales.length
}

export async function closeShift(closingCashCents: number): Promise<CloseShiftResultDTO> {
  const { userName, userEmail, restaurantId } = await requireMembership()
  if (!Number.isFinite(closingCashCents) || closingCashCents < 0) throw new Error('Monto de cierre inválido')
  const shift = await getOpenShiftRow(restaurantId)
  if (!shift) throw new Error('No hay un turno abierto')

  const openTableLabels = await getOpenTableLabels(restaurantId)
  if (openTableLabels.length) throw new Error(`No podés cerrar el turno: quedan cuentas abiertas en ${openTableLabels.join(', ')}`)

  const { cashSalesCents, cardSalesCents, transferSalesCents, expensesCents, expenses } = await computeLiveTotals(shift.id)
  const expectedCashCents = shift.openingCashCents + cashSalesCents - expensesCents
  const roundedClosingCashCents = Math.round(closingCashCents)
  const differenceCents = roundedClosingCashCents - expectedCashCents
  const closedAt = new Date()
  const closedByName = userName?.trim() || 'Equipo'

  const salesCount = await emailShiftReport({
    to: userEmail,
    restaurantId,
    shiftId: shift.id,
    shiftNumber: shift.shiftNumber,
    openedByName: shift.openedByName,
    openedAt: shift.openedAt,
    closedByName,
    closedAt,
    cashSalesCents,
    cardSalesCents,
    transferSalesCents,
    expenses,
    expensesCents,
    openingCashCents: shift.openingCashCents,
    closingCashCents: roundedClosingCashCents,
    expectedCashCents,
    differenceCents,
  })
  const totalSalesCents = cashSalesCents + cardSalesCents + transferSalesCents

  // The email above is now the durable record of this turno — fold its
  // totals into the lifetime counters, then clear out all of its detail
  // rows (sale, shiftMovement, comanda) plus the shift row itself, instead
  // of keeping a growing shift-by-shift history in the database.
  await db.insert(restaurantStats).values({ restaurantId }).onConflictDoNothing()
  await db
    .update(restaurantStats)
    .set({
      totalShiftsClosed: sql`${restaurantStats.totalShiftsClosed} + 1`,
      lifetimeSalesCents: sql`${restaurantStats.lifetimeSalesCents} + ${totalSalesCents}`,
      lifetimeCashSalesCents: sql`${restaurantStats.lifetimeCashSalesCents} + ${cashSalesCents}`,
      lifetimeCardSalesCents: sql`${restaurantStats.lifetimeCardSalesCents} + ${cardSalesCents}`,
      lifetimeTransferSalesCents: sql`${restaurantStats.lifetimeTransferSalesCents} + ${transferSalesCents}`,
      lifetimeExpensesCents: sql`${restaurantStats.lifetimeExpensesCents} + ${expensesCents}`,
      lifetimeSalesCount: sql`${restaurantStats.lifetimeSalesCount} + ${salesCount}`,
      lastClosedAt: closedAt,
      lastClosedTotalCents: totalSalesCents,
      lastClosedOrders: salesCount,
      updatedAt: closedAt,
    })
    .where(eq(restaurantStats.restaurantId, restaurantId))

  await db.delete(sale).where(eq(sale.shiftId, shift.id))
  await db.delete(shiftMovement).where(eq(shiftMovement.shiftId, shift.id))
  await db.delete(comanda).where(eq(comanda.shiftId, shift.id))
  await db.delete(cashShift).where(eq(cashShift.id, shift.id))

  revalidatePath('/restaurante')
  return { shiftNumber: shift.shiftNumber, totalSalesCents, differenceCents }
}
