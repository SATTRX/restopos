'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { cashShift, restaurant, restaurantMembership, restaurantSettings, sale, tableOrderItem } from '@/lib/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'

export type SaleSummaryDTO = { id: string; folio: number | null; totalCents: number; paymentMethod: string; createdAt: string }
export type ReceiptDTO = {
  folio: number | null
  shiftNumber: number | null
  restaurantName: string
  logoUrl: string | null
  taxId: string | null
  currency: string
  receiptFooter: string | null
  subtotalCents: number
  taxCents: number
  totalCents: number
  paymentMethod: string
  tenderedCents: number | null
  changeCents: number | null
  createdAt: string
  items: { productName: string; quantity: number; unitPriceCents: number }[]
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

export async function listRecentSales(limit = 20): Promise<SaleSummaryDTO[]> {
  const { restaurantId } = await requireMembership()
  const rows = await db.select().from(sale).where(eq(sale.restaurantId, restaurantId)).orderBy(desc(sale.createdAt)).limit(limit)
  return rows.map((r: any) => ({ id: r.id, folio: r.folio, totalCents: r.totalCents, paymentMethod: r.paymentMethod, createdAt: r.createdAt.toISOString() }))
}

// Public, unauthenticated read for the /boleta/[id] link — a sale id is an
// unguessable UUID, so this behaves like a typical "view your e-receipt" link.
export async function getPublicReceipt(saleId: string): Promise<ReceiptDTO | null> {
  const [row] = await db.select().from(sale).where(eq(sale.id, saleId)).limit(1)
  if (!row || !row.restaurantId) return null

  const [rest] = await db.select().from(restaurant).where(eq(restaurant.id, row.restaurantId)).limit(1)
  if (!rest) return null
  const [settings] = await db.select({ receiptFooter: restaurantSettings.receiptFooter }).from(restaurantSettings).where(eq(restaurantSettings.restaurantId, rest.id)).limit(1)
  const shiftNumber = row.shiftId ? (await db.select({ shiftNumber: cashShift.shiftNumber }).from(cashShift).where(eq(cashShift.id, row.shiftId)).limit(1))[0]?.shiftNumber ?? null : null

  const items = row.tableOrderId
    ? (await db.select().from(tableOrderItem).where(eq(tableOrderItem.orderId, row.tableOrderId))).map((i: any) => ({
        productName: i.productName,
        quantity: i.quantity,
        unitPriceCents: i.unitPriceCents,
      }))
    : []

  return {
    folio: row.folio,
    shiftNumber,
    restaurantName: rest.name,
    logoUrl: rest.logoUrl,
    taxId: rest.taxId,
    currency: rest.currency,
    receiptFooter: settings?.receiptFooter ?? null,
    subtotalCents: row.subtotalCents ?? row.totalCents,
    taxCents: row.taxCents ?? 0,
    totalCents: row.totalCents,
    paymentMethod: row.paymentMethod,
    tenderedCents: row.tenderedCents,
    changeCents: row.changeCents,
    createdAt: row.createdAt.toISOString(),
    items,
  }
}
