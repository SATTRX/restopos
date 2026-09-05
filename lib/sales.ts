// Shared helpers for turning a charge into a numbered "boleta" (digital
// receipt — see app/boleta/[id]/page.tsx). Not a fiscal/SII/SUNAT-stamped
// document: `folio` is just a per-restaurant sequential counter.
import { db } from '@/lib/db'
import { restaurant, restaurantStats } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'

export async function computeTaxBreakdown(restaurantId: string, totalCents: number) {
  const [rest] = await db.select({ taxRate: restaurant.taxRate }).from(restaurant).where(eq(restaurant.id, restaurantId)).limit(1)
  const taxRateBasisPoints = rest?.taxRate ?? 1600 // stored as percent * 100, e.g. 1600 = 16.00%
  const rate = taxRateBasisPoints / 10000
  const subtotalCents = Math.round(totalCents / (1 + rate))
  const taxCents = totalCents - subtotalCents
  return { subtotalCents, taxCents }
}

// Atomic UPDATE...RETURNING on a single per-restaurant counter row — this
// used to count existing `sale` rows, but those get deleted at shift close
// (see closeShift), which would have reset/repeated folios. The counter in
// `restaurant_stats` survives that deletion, so folios stay unique forever.
export async function nextFolio(restaurantId: string): Promise<number> {
  await db.insert(restaurantStats).values({ restaurantId }).onConflictDoNothing()
  const [row] = await db
    .update(restaurantStats)
    .set({ nextFolio: sql`${restaurantStats.nextFolio} + 1` })
    .where(eq(restaurantStats.restaurantId, restaurantId))
    .returning({ nextFolio: restaurantStats.nextFolio })
  return (row?.nextFolio ?? 2) - 1
}
