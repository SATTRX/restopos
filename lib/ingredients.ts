// Internal helper only — NOT a server action (no 'use server' directive), so
// it can't be invoked directly by a client. Callers (chargeTable, registerSale)
// already resolve and verify the caller's restaurant before using this.
import { db } from '@/lib/db'
import { inventoryItem, productIngredient } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'

// Deducts recipe ingredients for a set of sold products. Optional ingredients
// (e.g. takeout packaging) are only deducted when `isTakeout` is true. Stock
// is clamped at 0 rather than going negative.
export async function consumeIngredientsForSale(items: { productId: string; quantity: number }[], isTakeout: boolean) {
  if (!items.length) return
  const productIds = items.map((i) => i.productId)
  const links = await db.select().from(productIngredient)
  const relevant = (links as any[]).filter((l) => productIds.includes(l.productId) && (isTakeout || !l.isOptional))
  if (!relevant.length) return

  const totalsByItem = new Map<string, number>()
  for (const item of items) {
    for (const link of relevant.filter((l) => l.productId === item.productId)) {
      totalsByItem.set(link.inventoryItemId, (totalsByItem.get(link.inventoryItemId) ?? 0) + link.quantityPerUnit * item.quantity)
    }
  }

  for (const [inventoryItemId, amount] of totalsByItem) {
    await db
      .update(inventoryItem)
      .set({ stock: sql`GREATEST(${inventoryItem.stock} - ${amount}, 0)` })
      .where(eq(inventoryItem.id, inventoryItemId))
  }
}
