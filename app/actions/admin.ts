'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { inventoryItem, restaurant, restaurantMembership, restaurantStats, restaurantTable, sale, tableOrder, tableOrderItem, user } from '@/lib/db/schema'
import { desc, eq, gte, inArray } from 'drizzle-orm'
import { headers } from 'next/headers'

export type AdminRestaurantDTO = { id: string; name: string; slug: string; primaryColor: string; logoUrl: string | null; occupiedTables: number; totalTables: number }
export type AdminTopProductDTO = { productId: string; name: string; quantitySold: number; revenueCents: number }
export type PlatformOverviewDTO = {
  restaurantCount: number
  todaySalesCents: number
  todayOrders: number
  avgTicketCents: number
  lowStockCount: number
  topProducts: AdminTopProductDTO[]
  restaurants: AdminRestaurantDTO[]
}

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('No autorizado')
  if ((session.user as { role?: string }).role !== 'admin') throw new Error('Solo un administrador puede ver esto')
  return session.user
}

export async function getPlatformOverview(): Promise<PlatformOverviewDTO> {
  await requireAdmin()

  const restaurants = await db.select().from(restaurant)
  const tables = await db.select().from(restaurantTable)
  const openOrders = await db.select({ tableId: tableOrder.tableId, restaurantId: tableOrder.restaurantId }).from(tableOrder).where(eq(tableOrder.status, 'open'))
  const occupiedTableIds = new Set(openOrders.map((o: any) => o.tableId))

  const restaurantList: AdminRestaurantDTO[] = restaurants.map((r: any) => {
    const ownTables = tables.filter((t: any) => t.restaurantId === r.id)
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      primaryColor: r.primaryColor,
      logoUrl: r.logoUrl,
      totalTables: ownTables.length,
      occupiedTables: ownTables.filter((t: any) => occupiedTableIds.has(t.id)).length,
    }
  })

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  // Live `sale` rows only exist for currently-open shifts — a shift closed
  // earlier today already had its rows deleted (see closeShift). Its revenue
  // is folded back in from restaurant_stats.lastClosed* below, which only
  // remembers the most recent close per restaurant: a restaurant closing a
  // second shift later the same day will undercount the first one here — a
  // deliberate trade-off for not keeping a full per-shift history.
  const todayLiveSales = await db.select({ totalCents: sale.totalCents }).from(sale).where(gte(sale.createdAt, startOfToday))
  const todayLastClosed = await db
    .select({ lastClosedTotalCents: restaurantStats.lastClosedTotalCents, lastClosedOrders: restaurantStats.lastClosedOrders })
    .from(restaurantStats)
    .where(gte(restaurantStats.lastClosedAt, startOfToday))
  const closedTodayTotalCents = todayLastClosed.reduce((sum: number, s: any) => sum + (s.lastClosedTotalCents ?? 0), 0)
  const closedTodayOrders = todayLastClosed.reduce((sum: number, s: any) => sum + (s.lastClosedOrders ?? 0), 0)
  const todaySalesCents = todayLiveSales.reduce((sum: number, s: any) => sum + s.totalCents, 0) + closedTodayTotalCents
  const todayOrders = todayLiveSales.length + closedTodayOrders
  const avgTicketCents = todayOrders ? Math.round(todaySalesCents / todayOrders) : 0

  const lowStock = await db.select().from(inventoryItem)
  const lowStockCount = lowStock.filter((i: any) => i.stock <= i.minimumStock).length

  // Top products across every restaurant, from paid (itemized) table orders.
  const paidOrders = await db.select({ id: tableOrder.id }).from(tableOrder).where(eq(tableOrder.status, 'paid'))
  const paidOrderIds = paidOrders.map((o: any) => o.id)
  const items = paidOrderIds.length ? await db.select().from(tableOrderItem).where(inArray(tableOrderItem.orderId, paidOrderIds)) : []
  const byProduct = new Map<string, AdminTopProductDTO>()
  for (const item of items as any[]) {
    const entry = byProduct.get(item.productId) ?? { productId: item.productId, name: item.productName, quantitySold: 0, revenueCents: 0 }
    entry.quantitySold += item.quantity
    entry.revenueCents += item.unitPriceCents * item.quantity
    byProduct.set(item.productId, entry)
  }
  const topProducts = Array.from(byProduct.values())
    .sort((a, b) => b.quantitySold - a.quantitySold)
    .slice(0, 5)

  return { restaurantCount: restaurants.length, todaySalesCents, todayOrders, avgTicketCents, lowStockCount, topProducts, restaurants: restaurantList }
}

export type PlatformAccountDTO = { id: string; name: string; email: string; role: string; emailVerified: boolean; createdAt: string; restaurantName: string | null }

export async function listAllUsers(): Promise<PlatformAccountDTO[]> {
  await requireAdmin()
  const users = await db.select().from(user).orderBy(desc(user.createdAt))
  const memberships = await db
    .select({ userId: restaurantMembership.userId, restaurantId: restaurantMembership.restaurantId })
    .from(restaurantMembership)
    .where(eq(restaurantMembership.isActive, true))
  const restaurants = await db.select({ id: restaurant.id, name: restaurant.name }).from(restaurant)
  const restaurantNameFor = (userId: string) => {
    const membership = memberships.find((m: any) => m.userId === userId)
    return membership ? restaurants.find((r: any) => r.id === membership.restaurantId)?.name ?? null : null
  }

  return users.map((u: any) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    emailVerified: u.emailVerified,
    createdAt: u.createdAt.toISOString(),
    restaurantName: restaurantNameFor(u.id),
  }))
}
