'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { inventoryItem, menuProduct, productIngredient, restaurantMembership } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

export type ProductIngredientDTO = { id: string; inventoryItemId: string; inventoryItemName: string; unit: string; quantityPerUnit: number; isOptional: boolean }
export type IngredientLinkInput = { inventoryItemId: string; quantityPerUnit: number; isOptional: boolean }

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

async function assertProductInRestaurant(productId: string, restaurantId: string) {
  const rows = await db.select({ id: menuProduct.id }).from(menuProduct).where(and(eq(menuProduct.id, productId), eq(menuProduct.restaurantId, restaurantId))).limit(1)
  if (!rows.length) throw new Error('Producto no encontrado')
}

export async function listProductIngredients(productId: string): Promise<ProductIngredientDTO[]> {
  const { restaurantId } = await requireMembership()
  await assertProductInRestaurant(productId, restaurantId)
  const rows = await db
    .select({ link: productIngredient, item: inventoryItem })
    .from(productIngredient)
    .innerJoin(inventoryItem, eq(inventoryItem.id, productIngredient.inventoryItemId))
    .where(eq(productIngredient.productId, productId))
  return rows.map(({ link, item }: { link: any; item: any }) => ({
    id: link.id,
    inventoryItemId: item.id,
    inventoryItemName: item.name,
    unit: item.unit,
    quantityPerUnit: link.quantityPerUnit,
    isOptional: link.isOptional,
  }))
}

// Replaces the full ingredient list for a product (simplest way to keep the
// product-form editor and the DB in sync without diffing individual rows).
export async function setProductIngredients(productId: string, links: IngredientLinkInput[]): Promise<ProductIngredientDTO[]> {
  const { restaurantId, branchId } = await requireMembership()
  await assertProductInRestaurant(productId, restaurantId)

  const validItems = await db.select({ id: inventoryItem.id }).from(inventoryItem).where(eq(inventoryItem.branchId, branchId))
  const validIds = new Set(validItems.map((i: any) => i.id))
  const clean = links.filter((l) => validIds.has(l.inventoryItemId) && Number.isFinite(l.quantityPerUnit) && l.quantityPerUnit > 0)

  await db.delete(productIngredient).where(eq(productIngredient.productId, productId))
  if (clean.length) {
    await db.insert(productIngredient).values(
      clean.map((l) => ({ id: crypto.randomUUID(), productId, inventoryItemId: l.inventoryItemId, quantityPerUnit: Math.round(l.quantityPerUnit), isOptional: l.isOptional })),
    )
  }
  revalidatePath('/restaurante')
  return listProductIngredients(productId)
}
