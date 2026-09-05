'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  account,
  cashShift,
  comanda,
  inventoryItem,
  menuCategory,
  menuProduct,
  productIngredient,
  restaurant,
  restaurantBranch,
  restaurantMembership,
  restaurantSettings,
  restaurantStats,
  restaurantTable,
  restaurantZone,
  sale,
  session,
  shiftMovement,
  tableOrder,
  tableOrderItem,
  user,
  verification,
} from '@/lib/db/schema'
import { desc, eq, gte, inArray } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

export type AdminRestaurantDTO = { id: string; name: string; slug: string; primaryColor: string; logoUrl: string | null; isActive: boolean; occupiedTables: number; totalTables: number }
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
  const authSession = await auth.api.getSession({ headers: await headers() })
  if (!authSession?.user) throw new Error('No autorizado')
  if ((authSession.user as { role?: string }).role !== 'admin') throw new Error('Solo un administrador puede ver esto')
  return authSession.user
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
      isActive: r.isActive,
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

export type PlatformAccountDTO = { id: string; name: string; email: string; role: string; emailVerified: boolean; isActive: boolean; createdAt: string; restaurantId: string | null; restaurantName: string | null }

export async function listAllUsers(): Promise<PlatformAccountDTO[]> {
  await requireAdmin()
  const users = await db.select().from(user).orderBy(desc(user.createdAt))
  const memberships = await db
    .select({ userId: restaurantMembership.userId, restaurantId: restaurantMembership.restaurantId })
    .from(restaurantMembership)
    .where(eq(restaurantMembership.isActive, true))
  const restaurants = await db.select({ id: restaurant.id, name: restaurant.name }).from(restaurant)
  const membershipFor = (userId: string) => memberships.find((m: any) => m.userId === userId)

  return users.map((u: any) => {
    const membership = membershipFor(u.id)
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      emailVerified: u.emailVerified,
      isActive: u.isActive,
      createdAt: u.createdAt.toISOString(),
      restaurantId: membership?.restaurantId ?? null,
      restaurantName: membership ? restaurants.find((r: any) => r.id === membership.restaurantId)?.name ?? null : null,
    }
  })
}

// --- Platform-admin write actions: suspend/restore or permanently delete a
// restaurant or an account. These bypass the usual per-restaurant membership
// checks entirely (an admin isn't a member of anyone's restaurant) — gated
// only by requireAdmin. Destructive actions are also the reason the
// dashboard asks for a typed confirmation before calling them.

// Suspends (or restores) a restaurant without deleting anything: staff lose
// workspace access and the public menu/QR go offline immediately (see
// app/restaurante/page.tsx and app/carta/[slug]/page.tsx), and — on suspend —
// everyone currently signed in under that restaurant is logged out right away.
export async function setRestaurantActive(restaurantId: string, isActive: boolean): Promise<void> {
  await requireAdmin()
  await db.update(restaurant).set({ isActive, updatedAt: new Date() }).where(eq(restaurant.id, restaurantId))
  if (!isActive) {
    const members = await db.select({ userId: restaurantMembership.userId }).from(restaurantMembership).where(eq(restaurantMembership.restaurantId, restaurantId))
    const userIds = members.map((m: any) => m.userId)
    if (userIds.length) await db.delete(session).where(inArray(session.userId, userIds))
  }
  revalidatePath('/')
}

// Permanently deletes a restaurant and every row scoped to it. There are no
// database-level foreign keys in this schema, so this manually clears each
// table — order doesn't matter for correctness (nothing enforces
// referential integrity), only for not leaving anything behind.
export async function deleteRestaurant(restaurantId: string): Promise<void> {
  await requireAdmin()

  const branches = await db.select({ id: restaurantBranch.id }).from(restaurantBranch).where(eq(restaurantBranch.restaurantId, restaurantId))
  const branchIds = branches.map((b: any) => b.id)
  const members = await db.select({ userId: restaurantMembership.userId }).from(restaurantMembership).where(eq(restaurantMembership.restaurantId, restaurantId))
  const userIds = members.map((m: any) => m.userId)
  const orders = await db.select({ id: tableOrder.id }).from(tableOrder).where(eq(tableOrder.restaurantId, restaurantId))
  const orderIds = orders.map((o: any) => o.id)
  const products = await db.select({ id: menuProduct.id }).from(menuProduct).where(eq(menuProduct.restaurantId, restaurantId))
  const productIds = products.map((p: any) => p.id)

  if (orderIds.length) await db.delete(tableOrderItem).where(inArray(tableOrderItem.orderId, orderIds))
  if (productIds.length) await db.delete(productIngredient).where(inArray(productIngredient.productId, productIds))
  if (branchIds.length) await db.delete(inventoryItem).where(inArray(inventoryItem.branchId, branchIds))
  await db.delete(tableOrder).where(eq(tableOrder.restaurantId, restaurantId))
  await db.delete(comanda).where(eq(comanda.restaurantId, restaurantId))
  await db.delete(shiftMovement).where(eq(shiftMovement.restaurantId, restaurantId))
  await db.delete(cashShift).where(eq(cashShift.restaurantId, restaurantId))
  await db.delete(sale).where(eq(sale.restaurantId, restaurantId))
  await db.delete(restaurantTable).where(eq(restaurantTable.restaurantId, restaurantId))
  await db.delete(restaurantZone).where(eq(restaurantZone.restaurantId, restaurantId))
  await db.delete(menuProduct).where(eq(menuProduct.restaurantId, restaurantId))
  await db.delete(menuCategory).where(eq(menuCategory.restaurantId, restaurantId))
  await db.delete(restaurantSettings).where(eq(restaurantSettings.restaurantId, restaurantId))
  await db.delete(restaurantStats).where(eq(restaurantStats.restaurantId, restaurantId))
  await db.delete(restaurantMembership).where(eq(restaurantMembership.restaurantId, restaurantId))
  await db.delete(restaurantBranch).where(eq(restaurantBranch.restaurantId, restaurantId))
  await db.delete(restaurant).where(eq(restaurant.id, restaurantId))
  if (userIds.length) await db.delete(session).where(inArray(session.userId, userIds))

  revalidatePath('/')
}

// Disables (or restores) a single account — blocked from signing in and,
// on disable, logged out immediately. Doesn't touch their restaurant, staff,
// or data; use deleteRestaurant for that.
export async function setUserActive(userId: string, isActive: boolean): Promise<void> {
  const admin = await requireAdmin()
  if (userId === admin.id) throw new Error('No puedes desactivar tu propia cuenta')
  await db.update(user).set({ isActive, updatedAt: new Date() }).where(eq(user.id, userId))
  if (!isActive) await db.delete(session).where(eq(session.userId, userId))
  revalidatePath('/')
}

// Permanently deletes an account's auth records and restaurant membership.
// Does not delete the restaurant itself (it may have other staff) — use
// deleteRestaurant separately if the whole restaurant should go too.
export async function deleteUserAccount(userId: string): Promise<void> {
  const admin = await requireAdmin()
  if (userId === admin.id) throw new Error('No puedes eliminar tu propia cuenta')
  const [target] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId)).limit(1)
  await db.delete(session).where(eq(session.userId, userId))
  await db.delete(account).where(eq(account.userId, userId))
  await db.delete(restaurantMembership).where(eq(restaurantMembership.userId, userId))
  if (target?.email) await db.delete(verification).where(eq(verification.identifier, target.email))
  await db.delete(user).where(eq(user.id, userId))
  revalidatePath('/')
}
