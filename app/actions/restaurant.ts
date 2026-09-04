'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { restaurant, restaurantBranch, restaurantMembership, restaurantSettings } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

async function getSessionUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('No autorizado')
  return session.user
}

export async function ensureRestaurantWorkspace() {
  const user = await getSessionUser()
  const existing = await db.select({ restaurantId: restaurantMembership.restaurantId }).from(restaurantMembership).where(and(eq(restaurantMembership.userId, user.id), eq(restaurantMembership.isActive, true))).limit(1)
  if (existing.length) return existing[0].restaurantId
  const restaurantId = crypto.randomUUID()
  const branchId = crypto.randomUUID()
  await db.insert(restaurant).values({ id: restaurantId, name: user.name || 'Mi restaurante', slug: `restaurante-${restaurantId.slice(0, 8)}` })
  await db.insert(restaurantBranch).values({ id: branchId, restaurantId, name: 'Sucursal principal' })
  await db.insert(restaurantMembership).values({ id: crypto.randomUUID(), userId: user.id, restaurantId, branchId, role: 'owner' })
  await db.insert(restaurantSettings).values({ restaurantId, accentColor: '#c86b4a' })
  // No revalidatePath here: this runs during the /restaurante page's own
  // render (first visit after sign-up), and Next.js disallows revalidating
  // the path that's currently rendering. The page already reads fresh data
  // this pass; saveCurrentRestaurantBranding revalidates for later edits.
  return restaurantId
}

export async function getRestaurantAccess() {
  const user = await getSessionUser()
  const rows = await db
    .select({ membership: restaurantMembership, restaurant, settings: restaurantSettings })
    .from(restaurantMembership)
    .innerJoin(restaurant, eq(restaurantMembership.restaurantId, restaurant.id))
    .leftJoin(restaurantSettings, eq(restaurantSettings.restaurantId, restaurant.id))
    .where(and(eq(restaurantMembership.userId, user.id), eq(restaurantMembership.isActive, true)))
  return rows.map(({ membership, restaurant: item, settings }: { membership: any; restaurant: any; settings: any }) => ({
    ...item,
    role: membership.role,
    branchId: membership.branchId,
    receiptFooter: settings?.receiptFooter ?? null,
  }))
}

export async function saveCurrentRestaurantBranding(input: { name: string; primaryColor: string; logoUrl?: string; receiptFooter?: string }) {
  const user = await getSessionUser()
  const membership = await db.select({ restaurantId: restaurantMembership.restaurantId }).from(restaurantMembership).where(and(eq(restaurantMembership.userId, user.id), eq(restaurantMembership.isActive, true))).limit(1)
  if (!membership.length) throw new Error('No tienes un restaurante asignado')
  return saveRestaurantBranding({ ...input, restaurantId: membership[0].restaurantId })
}

export async function saveRestaurantBranding(input: { restaurantId: string; name: string; primaryColor: string; logoUrl?: string; receiptFooter?: string }) {
  const user = await getSessionUser()
  if (!input.name.trim() || !/^#[0-9a-f]{6}$/i.test(input.primaryColor)) throw new Error('Datos de personalización inválidos')
  const access = await db.select({ id: restaurantMembership.id }).from(restaurantMembership).where(and(eq(restaurantMembership.userId, user.id), eq(restaurantMembership.restaurantId, input.restaurantId), eq(restaurantMembership.isActive, true))).limit(1)
  if (!access.length) throw new Error('Sin acceso a este restaurante')
  await db.update(restaurant).set({ name: input.name.trim(), primaryColor: input.primaryColor, logoUrl: input.logoUrl || null, updatedAt: new Date() }).where(eq(restaurant.id, input.restaurantId))
  await db.insert(restaurantSettings).values({ restaurantId: input.restaurantId, accentColor: input.primaryColor, logoUrl: input.logoUrl || null, receiptFooter: input.receiptFooter || null }).onConflictDoUpdate({ target: restaurantSettings.restaurantId, set: { accentColor: input.primaryColor, logoUrl: input.logoUrl || null, receiptFooter: input.receiptFooter || null, updatedAt: new Date() } })
  revalidatePath('/restaurante')
  return { ok: true }
}

export async function saveTaxSettings(input: { taxId: string; currency: string; taxRatePercent: number }) {
  const user = await getSessionUser()
  const membership = await db.select({ restaurantId: restaurantMembership.restaurantId }).from(restaurantMembership).where(and(eq(restaurantMembership.userId, user.id), eq(restaurantMembership.isActive, true))).limit(1)
  if (!membership.length) throw new Error('No tienes un restaurante asignado')
  if (!Number.isFinite(input.taxRatePercent) || input.taxRatePercent < 0 || input.taxRatePercent > 100) throw new Error('Tasa de impuesto inválida')
  await db
    .update(restaurant)
    .set({ taxId: input.taxId.trim() || null, currency: input.currency.trim().toUpperCase() || 'MXN', taxRate: Math.round(input.taxRatePercent * 100), updatedAt: new Date() })
    .where(eq(restaurant.id, membership[0].restaurantId))
  revalidatePath('/restaurante')
  return { ok: true }
}
