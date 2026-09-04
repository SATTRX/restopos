'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { menuCategory, menuProduct, restaurant, restaurantMembership } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { computeTopProductIds } from '@/app/actions/stats'

export type MenuProductDTO = {
  id: string
  name: string
  description: string | null
  priceCents: number
  isAvailable: boolean
  categoryId: string | null
  categoryName: string
  tags: string[]
  isPreferred: boolean
}
export type MenuDTO = { categories: { id: string; name: string }[]; products: MenuProductDTO[] }
export type PublicMenuDTO = {
  restaurantName: string
  primaryColor: string
  logoUrl: string | null
  categories: { id: string; name: string; products: MenuProductDTO[] }[]
}

async function requireMembership() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('No autorizado')
  const rows = await db
    .select({ restaurantId: restaurantMembership.restaurantId })
    .from(restaurantMembership)
    .where(and(eq(restaurantMembership.userId, session.user.id), eq(restaurantMembership.isActive, true)))
    .limit(1)
  if (!rows.length) throw new Error('No tienes un restaurante asignado')
  return { restaurantId: rows[0].restaurantId }
}

async function loadMenu(restaurantId: string): Promise<MenuDTO> {
  const categories = await db
    .select()
    .from(menuCategory)
    .where(and(eq(menuCategory.restaurantId, restaurantId), eq(menuCategory.isActive, true)))
    .orderBy(menuCategory.sortOrder)
  const productsRaw = await db.select().from(menuProduct).where(eq(menuProduct.restaurantId, restaurantId))
  const preferredIds = new Set(await computeTopProductIds(restaurantId, 3))
  const nameFor = (categoryId: string | null) => categories.find((c: any) => c.id === categoryId)?.name ?? 'General'

  return {
    categories: categories.map((c: any) => ({ id: c.id, name: c.name })),
    products: productsRaw.map((p: any) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      priceCents: p.priceCents,
      isAvailable: p.isAvailable,
      categoryId: p.categoryId,
      categoryName: nameFor(p.categoryId),
      tags: p.tags ?? [],
      isPreferred: preferredIds.has(p.id),
    })),
  }
}

async function getOrCreateCategory(restaurantId: string, name?: string): Promise<string> {
  const label = name?.trim() || 'General'
  const existing = await db
    .select({ id: menuCategory.id })
    .from(menuCategory)
    .where(and(eq(menuCategory.restaurantId, restaurantId), eq(menuCategory.name, label)))
    .limit(1)
  if (existing.length) return existing[0].id
  const id = crypto.randomUUID()
  await db.insert(menuCategory).values({ id, restaurantId, name: label })
  return id
}

export async function listMenu(): Promise<MenuDTO> {
  const { restaurantId } = await requireMembership()
  return loadMenu(restaurantId)
}

export async function addMenuProduct(input: { name: string; description?: string; priceCents: number; categoryName?: string; tags?: string[] }): Promise<MenuDTO> {
  const { restaurantId } = await requireMembership()
  if (!input.name.trim() || !Number.isInteger(input.priceCents) || input.priceCents <= 0) throw new Error('Datos de producto inválidos')
  const categoryId = await getOrCreateCategory(restaurantId, input.categoryName)
  await db.insert(menuProduct).values({
    id: crypto.randomUUID(),
    restaurantId,
    categoryId,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    priceCents: input.priceCents,
    tags: input.tags?.filter((t) => t.trim()) ?? [],
  })
  revalidatePath('/restaurante')
  return loadMenu(restaurantId)
}

export async function updateMenuProduct(
  id: string,
  patch: { name?: string; description?: string; priceCents?: number; isAvailable?: boolean; categoryName?: string; tags?: string[] },
): Promise<MenuDTO> {
  const { restaurantId } = await requireMembership()
  const [existing] = await db.select({ id: menuProduct.id }).from(menuProduct).where(and(eq(menuProduct.id, id), eq(menuProduct.restaurantId, restaurantId))).limit(1)
  if (!existing) throw new Error('Producto no encontrado')

  const categoryId = patch.categoryName !== undefined ? await getOrCreateCategory(restaurantId, patch.categoryName) : undefined
  await db
    .update(menuProduct)
    .set({
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description.trim() || null } : {}),
      ...(patch.priceCents !== undefined ? { priceCents: patch.priceCents } : {}),
      ...(patch.isAvailable !== undefined ? { isAvailable: patch.isAvailable } : {}),
      ...(patch.tags !== undefined ? { tags: patch.tags.filter((t) => t.trim()) } : {}),
      ...(categoryId !== undefined ? { categoryId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(menuProduct.id, id))
  revalidatePath('/restaurante')
  return loadMenu(restaurantId)
}

export async function deleteMenuProduct(id: string): Promise<MenuDTO> {
  const { restaurantId } = await requireMembership()
  await db.delete(menuProduct).where(and(eq(menuProduct.id, id), eq(menuProduct.restaurantId, restaurantId)))
  revalidatePath('/restaurante')
  return loadMenu(restaurantId)
}

// Public, unauthenticated read used by the /carta/[slug] page — only ever
// returns available products, and no internal ids beyond what's needed to key rows.
export async function getPublicMenu(slug: string): Promise<PublicMenuDTO | null> {
  const [rest] = await db.select().from(restaurant).where(eq(restaurant.slug, slug)).limit(1)
  if (!rest) return null
  const menu = await loadMenu(rest.id)
  const available = menu.products.filter((p) => p.isAvailable)
  const preferred = available.filter((p) => p.isPreferred)
  const categories = menu.categories
    .map((c) => ({ ...c, products: available.filter((p) => p.categoryId === c.id) }))
    .filter((c) => c.products.length > 0)
  const withPreferred = preferred.length ? [{ id: '__preferred__', name: '⭐ Preferidos', products: preferred }, ...categories] : categories
  return { restaurantName: rest.name, primaryColor: rest.primaryColor, logoUrl: rest.logoUrl, categories: withPreferred }
}
