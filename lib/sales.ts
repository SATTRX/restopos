// Shared helpers for turning a charge into a numbered "boleta" (digital
// receipt — see app/boleta/[id]/page.tsx). Not a fiscal/SII/SUNAT-stamped
// document: `folio` is just a per-restaurant sequential counter.
import { db } from '@/lib/db'
import { restaurant, sale } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function computeTaxBreakdown(restaurantId: string, totalCents: number) {
  const [rest] = await db.select({ taxRate: restaurant.taxRate }).from(restaurant).where(eq(restaurant.id, restaurantId)).limit(1)
  const taxRateBasisPoints = rest?.taxRate ?? 1600 // stored as percent * 100, e.g. 1600 = 16.00%
  const rate = taxRateBasisPoints / 10000
  const subtotalCents = Math.round(totalCents / (1 + rate))
  const taxCents = totalCents - subtotalCents
  return { subtotalCents, taxCents }
}

// Small race window if two sales for the same restaurant are charged at the
// exact same instant (folio could repeat) — acceptable for a digital-only
// receipt number, not for an official fiscal sequence.
export async function nextFolio(restaurantId: string): Promise<number> {
  const rows = await db.select({ id: sale.id }).from(sale).where(eq(sale.restaurantId, restaurantId))
  return rows.length + 1
}
