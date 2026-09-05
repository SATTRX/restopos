'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { cashShift, restaurantMembership, sale, tableOrder, tableOrderItem } from '@/lib/db/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { headers } from 'next/headers'

export type ProductStatDTO = { productId: string; name: string; quantitySold: number; revenueCents: number }
export type RestaurantStatsDTO = { totalSalesCents: number; totalOrders: number; topProducts: ProductStatDTO[] }

async function requireRestaurant() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('No autorizado')
  const rows = await db
    .select({ restaurantId: restaurantMembership.restaurantId, branchId: restaurantMembership.branchId })
    .from(restaurantMembership)
    .where(and(eq(restaurantMembership.userId, session.user.id), eq(restaurantMembership.isActive, true)))
    .limit(1)
  if (!rows.length) throw new Error('No tienes un restaurante asignado')
  return { restaurantId: rows[0].restaurantId, branchId: rows[0].branchId as string }
}

// Item-level stats come from paid table orders (dine-in, itemized). Quick/
// walk-in sales are recorded in `sale` as a single total with no line items
// yet, so they count toward revenue/order count but not per-product ranking.
async function topProductsFor(restaurantId: string): Promise<ProductStatDTO[]> {
  const paidOrders = await db.select({ id: tableOrder.id }).from(tableOrder).where(and(eq(tableOrder.restaurantId, restaurantId), eq(tableOrder.status, 'paid')))
  const orderIds = paidOrders.map((o: any) => o.id)
  const items = orderIds.length ? await db.select().from(tableOrderItem).where(inArray(tableOrderItem.orderId, orderIds)) : []

  const byProduct = new Map<string, ProductStatDTO>()
  for (const item of items as any[]) {
    const entry = byProduct.get(item.productId) ?? { productId: item.productId, name: item.productName, quantitySold: 0, revenueCents: 0 }
    entry.quantitySold += item.quantity
    entry.revenueCents += item.unitPriceCents * item.quantity
    byProduct.set(item.productId, entry)
  }
  return Array.from(byProduct.values()).sort((a, b) => b.quantitySold - a.quantitySold)
}

// Closed shifts have their `sale` rows deleted (see closeShift), so their
// revenue only survives as the cashShift snapshot columns filled in at
// close time. Only the currently open shift's sales still live in `sale`.
async function closedShiftTotals(branchId: string) {
  const closed = await db.select().from(cashShift).where(and(eq(cashShift.branchId, branchId), eq(cashShift.status, 'closed')))
  return closed.reduce(
    (acc: { totalCents: number; count: number }, s: any) => ({
      totalCents: acc.totalCents + (s.cashSalesCents ?? 0) + (s.cardSalesCents ?? 0) + (s.transferSalesCents ?? 0),
      count: acc.count + (s.salesCount ?? 0),
    }),
    { totalCents: 0, count: 0 },
  )
}

export async function getRestaurantStats(): Promise<RestaurantStatsDTO> {
  const { restaurantId, branchId } = await requireRestaurant()
  const topProducts = await topProductsFor(restaurantId)
  const liveSales = await db.select({ totalCents: sale.totalCents }).from(sale).where(eq(sale.branchId, branchId))
  const liveTotalCents = liveSales.reduce((sum: number, s: any) => sum + s.totalCents, 0)
  const closed = await closedShiftTotals(branchId)
  return { totalSalesCents: liveTotalCents + closed.totalCents, totalOrders: liveSales.length + closed.count, topProducts }
}

// Product ids to badge as "Preferido": top `limit` by quantity sold, only
// counting products that actually sold at least one unit. Used both by the
// authenticated dashboard and the public menu (via computeTopProductIds).
export async function computeTopProductIds(restaurantId: string, limit = 3): Promise<string[]> {
  const top = await topProductsFor(restaurantId)
  return top
    .filter((p) => p.quantitySold > 0)
    .slice(0, limit)
    .map((p) => p.productId)
}

export async function getPreferredProductIds(limit = 3): Promise<string[]> {
  const { restaurantId } = await requireRestaurant()
  return computeTopProductIds(restaurantId, limit)
}
