'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { cashShift, restaurantMembership, sale } from '@/lib/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

export type ShiftDTO = {
  id: string
  openedByName: string
  openingCashCents: number
  openedAt: string
  status: 'open' | 'closed'
  closedByName: string | null
  closingCashCents: number | null
  expectedCashCents: number | null
  differenceCents: number | null
  closedAt: string | null
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
    openedByName: row.openedByName,
    openingCashCents: row.openingCashCents,
    openedAt: row.openedAt.toISOString(),
    status: row.status,
    closedByName: row.closedByName,
    closingCashCents: row.closingCashCents,
    expectedCashCents: row.expectedCashCents,
    differenceCents: row.differenceCents,
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
  }
}

export async function getActiveShift(): Promise<ShiftDTO | null> {
  const { restaurantId } = await requireMembership()
  const [row] = await db.select().from(cashShift).where(and(eq(cashShift.restaurantId, restaurantId), eq(cashShift.status, 'open'))).limit(1)
  return row ? toDTO(row) : null
}

export async function openShift(openingCashCents: number): Promise<ShiftDTO> {
  const { userId, userName, restaurantId, branchId } = await requireMembership()
  if (!Number.isFinite(openingCashCents) || openingCashCents < 0) throw new Error('Monto de apertura inválido')
  const existing = await db.select({ id: cashShift.id }).from(cashShift).where(and(eq(cashShift.restaurantId, restaurantId), eq(cashShift.status, 'open'))).limit(1)
  if (existing.length) throw new Error('Ya hay un turno abierto')

  const id = crypto.randomUUID()
  await db.insert(cashShift).values({
    id,
    restaurantId,
    branchId,
    openedByUserId: userId,
    openedByName: userName?.trim() || 'Equipo',
    openingCashCents: Math.round(openingCashCents),
  })
  revalidatePath('/restaurante')
  const [row] = await db.select().from(cashShift).where(eq(cashShift.id, id))
  return toDTO(row)
}

export async function closeShift(closingCashCents: number): Promise<ShiftDTO> {
  const { userId, userName, restaurantId } = await requireMembership()
  if (!Number.isFinite(closingCashCents) || closingCashCents < 0) throw new Error('Monto de cierre inválido')
  const [shift] = await db.select().from(cashShift).where(and(eq(cashShift.restaurantId, restaurantId), eq(cashShift.status, 'open'))).limit(1)
  if (!shift) throw new Error('No hay un turno abierto')

  // Only cash sales affect the physical drawer count.
  const cashSales = await db.select({ totalCents: sale.totalCents }).from(sale).where(and(eq(sale.shiftId, shift.id), eq(sale.paymentMethod, 'cash')))
  const cashSalesCents = cashSales.reduce((sum: number, s: any) => sum + s.totalCents, 0)
  const expectedCashCents = shift.openingCashCents + cashSalesCents
  const differenceCents = Math.round(closingCashCents) - expectedCashCents

  await db
    .update(cashShift)
    .set({
      status: 'closed',
      closedByUserId: userId,
      closedByName: userName?.trim() || 'Equipo',
      closingCashCents: Math.round(closingCashCents),
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
