'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { cashShift, inventoryItem, restaurantMembership, sale } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { computeTaxBreakdown, nextFolio } from '@/lib/sales'

async function requireMembership() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('No autorizado')
  const rows = await db
    .select({ restaurantId: restaurantMembership.restaurantId, branchId: restaurantMembership.branchId })
    .from(restaurantMembership)
    .where(and(eq(restaurantMembership.userId, session.user.id), eq(restaurantMembership.isActive, true)))
    .limit(1)
  if (!rows.length || !rows[0].branchId) throw new Error('No tienes un restaurante asignado')
  return { restaurantId: rows[0].restaurantId, branchId: rows[0].branchId as string }
}

// Quick/walk-in sale — not tied to a table, so it has no itemized line items
// (the boleta for these only shows the total). Requires an open cash shift,
// same as chargeTable.
export async function registerSale(input: { totalCents: number; paymentMethod: 'cash' | 'card' | 'transfer' }): Promise<{ id: string }> {
  const { restaurantId, branchId } = await requireMembership()
  if (!Number.isInteger(input.totalCents) || input.totalCents <= 0) throw new Error('Total inválido')

  const [shift] = await db.select({ id: cashShift.id }).from(cashShift).where(and(eq(cashShift.restaurantId, restaurantId), eq(cashShift.status, 'open'))).limit(1)
  if (!shift) throw new Error('Abre un turno de caja antes de cobrar')

  const { subtotalCents, taxCents } = await computeTaxBreakdown(restaurantId, input.totalCents)
  const folio = await nextFolio(restaurantId)
  const id = crypto.randomUUID()
  await db.insert(sale).values({
    id,
    restaurantId,
    branchId,
    shiftId: shift.id,
    folio,
    subtotalCents,
    taxCents,
    totalCents: input.totalCents,
    paymentMethod: input.paymentMethod,
    status: 'paid',
  })
  revalidatePath('/restaurante')
  return { id }
}

export async function adjustInventory(input: { itemId: string; delta: number }) {
  const { branchId } = await requireMembership()
  if (!Number.isInteger(input.delta) || input.delta === 0) throw new Error('Movimiento inválido')
  await db.update(inventoryItem).set({ stock: sql`${inventoryItem.stock} + ${input.delta}` }).where(and(eq(inventoryItem.id, input.itemId), eq(inventoryItem.branchId, branchId)))
  revalidatePath('/restaurante')
}
