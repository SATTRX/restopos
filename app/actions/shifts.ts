'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { cashShift, restaurant, restaurantMembership, restaurantTable, sale, shiftMovement, tableOrder } from '@/lib/db/schema'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { sendShiftReportEmail, type EmailAttachment } from '@/lib/email'
import { getPublicReceipt } from '@/app/actions/receipts'
import { renderReceiptImage } from '@/lib/receipt-image'

// Bounds how many per-sale receipt images we render for one shift-close
// email — each render costs real time (satori + resvg), and a very busy
// shift shouldn't stall closeShift for minutes. The full breakdown table
// in the email body always covers every sale regardless of this cap.
const MAX_RECEIPT_IMAGES = 40

export type ShiftDTO = {
  id: string
  shiftNumber: number | null
  openedByName: string
  openingCashCents: number
  openedAt: string
  status: 'open' | 'closed'
  closedByName: string | null
  closingCashCents: number | null
  cashSalesCents: number | null
  cardSalesCents: number | null
  transferSalesCents: number | null
  expensesCents: number | null
  expectedCashCents: number | null
  differenceCents: number | null
  closedAt: string | null
}

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
  return {
    id: row.id,
    shiftNumber: row.shiftNumber,
    openedByName: row.openedByName,
    openingCashCents: row.openingCashCents,
    openedAt: row.openedAt.toISOString(),
    status: row.status,
    closedByName: row.closedByName,
    closingCashCents: row.closingCashCents,
    cashSalesCents: row.cashSalesCents,
    cardSalesCents: row.cardSalesCents,
    transferSalesCents: row.transferSalesCents,
    expensesCents: row.expensesCents,
    expectedCashCents: row.expectedCashCents,
    differenceCents: row.differenceCents,
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
  }
}

async function getOpenShiftRow(restaurantId: string) {
  const [row] = await db.select().from(cashShift).where(and(eq(cashShift.restaurantId, restaurantId), eq(cashShift.status, 'open'))).limit(1)
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

  const movements = await db.select().from(shiftMovement).where(eq(shiftMovement.shiftId, shiftId)).orderBy(desc(shiftMovement.createdAt))
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

  // Sequential per restaurant ("Turno 1", "Turno 2", ...), same small-race-window
  // caveat as the sale folio — fine for a display number, not a fiscal sequence.
  const previousShifts = await db.select({ id: cashShift.id }).from(cashShift).where(eq(cashShift.restaurantId, restaurantId))
  const shiftNumber = previousShifts.length + 1

  const id = crypto.randomUUID()
  await db.insert(cashShift).values({
    id,
    restaurantId,
    branchId,
    shiftNumber,
    openedByUserId: userId,
    openedByName: userName?.trim() || 'Equipo',
    openingCashCents: Math.round(openingCashCents),
  })
  revalidatePath('/restaurante')
  const [row] = await db.select().from(cashShift).where(eq(cashShift.id, id))
  return toDTO(row)
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

// Sale rows for a closed shift are deleted right after this (see closeShift)
// so the emailed report becomes their durable record — the customer-facing
// /boleta/[id] link stops resolving once its shift closes.
async function emailShiftReport(input: {
  to: string
  restaurantId: string
  shiftId: string
  shiftNumber: number | null
  openedAt: Date
  closedAt: Date
  cashSalesCents: number
  cardSalesCents: number
  transferSalesCents: number
  expensesCents: number
  openingCashCents: number
  closingCashCents: number
  expectedCashCents: number
  differenceCents: number
}) {
  const [rest] = await db.select({ name: restaurant.name }).from(restaurant).where(eq(restaurant.id, input.restaurantId)).limit(1)
  const sales = await db
    .select({ id: sale.id, folio: sale.folio, totalCents: sale.totalCents, paymentMethod: sale.paymentMethod, createdAt: sale.createdAt })
    .from(sale)
    .where(eq(sale.shiftId, input.shiftId))

  // Each sale becomes an attached receipt image — the same look as the
  // public /boleta/[id] page, since that link stops resolving once the
  // sale row underneath it is deleted (see closeShift).
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

  try {
    await sendShiftReportEmail({
      to: input.to,
      restaurantName: rest?.name ?? 'Tu restaurante',
      shiftNumber: input.shiftNumber,
      openedAt: input.openedAt,
      closedAt: input.closedAt,
      sales,
      cashSalesCents: input.cashSalesCents,
      cardSalesCents: input.cardSalesCents,
      transferSalesCents: input.transferSalesCents,
      expensesCents: input.expensesCents,
      openingCashCents: input.openingCashCents,
      closingCashCents: input.closingCashCents,
      expectedCashCents: input.expectedCashCents,
      differenceCents: input.differenceCents,
      receiptImages,
      skippedReceiptImages,
    })
  } catch (err) {
    // Don't block the shift close on an email-provider hiccup — the sales
    // still get deleted below, so log loudly if this ever fails.
    console.error('No se pudo enviar el reporte de cierre de turno por correo', err)
  }
  return sales.length
}

export async function closeShift(closingCashCents: number): Promise<ShiftDTO> {
  const { userId, userName, userEmail, restaurantId } = await requireMembership()
  if (!Number.isFinite(closingCashCents) || closingCashCents < 0) throw new Error('Monto de cierre inválido')
  const shift = await getOpenShiftRow(restaurantId)
  if (!shift) throw new Error('No hay un turno abierto')

  const openTableLabels = await getOpenTableLabels(restaurantId)
  if (openTableLabels.length) throw new Error(`No podés cerrar el turno: quedan cuentas abiertas en ${openTableLabels.join(', ')}`)

  const { cashSalesCents, cardSalesCents, transferSalesCents, expensesCents } = await computeLiveTotals(shift.id)
  const expectedCashCents = shift.openingCashCents + cashSalesCents - expensesCents
  const differenceCents = Math.round(closingCashCents) - expectedCashCents
  const closedAt = new Date()

  // Send the emailed invoice report before deleting the sale rows it summarizes.
  const salesCount = await emailShiftReport({
    to: userEmail,
    restaurantId,
    shiftId: shift.id,
    shiftNumber: shift.shiftNumber,
    openedAt: shift.openedAt,
    closedAt,
    cashSalesCents,
    cardSalesCents,
    transferSalesCents,
    expensesCents,
    openingCashCents: shift.openingCashCents,
    closingCashCents: Math.round(closingCashCents),
    expectedCashCents,
    differenceCents,
  })

  await db
    .update(cashShift)
    .set({
      status: 'closed',
      closedByUserId: userId,
      closedByName: userName?.trim() || 'Equipo',
      closingCashCents: Math.round(closingCashCents),
      cashSalesCents,
      cardSalesCents,
      transferSalesCents,
      expensesCents,
      salesCount,
      expectedCashCents,
      differenceCents,
      closedAt,
    })
    .where(eq(cashShift.id, shift.id))

  // The report above is now the durable record of this shift's invoices —
  // per user request, the sale rows themselves get cleared out on close.
  await db.delete(sale).where(eq(sale.shiftId, shift.id))

  revalidatePath('/restaurante')
  const [row] = await db.select().from(cashShift).where(eq(cashShift.id, shift.id))
  return toDTO(row)
}

export async function listShiftHistory(limit = 10): Promise<ShiftDTO[]> {
  const { restaurantId } = await requireMembership()
  const rows = await db.select().from(cashShift).where(eq(cashShift.restaurantId, restaurantId)).orderBy(desc(cashShift.openedAt)).limit(limit)
  return rows.map(toDTO)
}
