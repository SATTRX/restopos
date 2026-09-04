'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { cashShift, restaurantMembership, sale, shiftMovement } from '@/lib/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

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
  return { userId: session.user.id, userName: session.user.name as string | undefined, restaurantId: rows[0].restaurantId, branchId: rows[0].branchId as string }
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
  return { shift: toDTO(row), cashSalesCents, cardSalesCents, transferSalesCents, expensesCents, expectedCashCents, expenses }
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

export async function closeShift(closingCashCents: number): Promise<ShiftDTO> {
  const { userId, userName, restaurantId } = await requireMembership()
  if (!Number.isFinite(closingCashCents) || closingCashCents < 0) throw new Error('Monto de cierre inválido')
  const shift = await getOpenShiftRow(restaurantId)
  if (!shift) throw new Error('No hay un turno abierto')

  const { cashSalesCents, cardSalesCents, transferSalesCents, expensesCents } = await computeLiveTotals(shift.id)
  const expectedCashCents = shift.openingCashCents + cashSalesCents - expensesCents
  const differenceCents = Math.round(closingCashCents) - expectedCashCents

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
      expectedCashCents,
      differenceCents,
      closedAt: new Date(),
    })
    .where(eq(cashShift.id, shift.id))

  revalidatePath('/restaurante')
  const [row] = await db.select().from(cashShift).where(eq(cashShift.id, shift.id))
  return toDTO(row)
}

export async function listShiftHistory(limit = 10): Promise<ShiftDTO[]> {
  const { restaurantId } = await requireMembership()
  const rows = await db.select().from(cashShift).where(eq(cashShift.restaurantId, restaurantId)).orderBy(desc(cashShift.openedAt)).limit(limit)
  return rows.map(toDTO)
}
