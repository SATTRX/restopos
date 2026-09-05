'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { menuProduct, publicOrder, publicOrderItem, restaurant, restaurantMembership } from '@/lib/db/schema'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

export type PublicOrderItemDTO = { productName: string; unitPriceCents: number; quantity: number }
export type PublicOrderDTO = {
  id: string
  customerName: string
  customerPhone: string
  fulfillment: 'delivery' | 'pickup'
  address: string | null
  notes: string | null
  totalCents: number
  status: 'pending' | 'accepted' | 'ready' | 'completed' | 'cancelled'
  createdAt: string
  items: PublicOrderItemDTO[]
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

// Public — submitted from /carta/[slug], no auth required. Prices are taken
// from the current menu server-side (never trusted from the client), same
// spirit as chargeTable/registerSale.
export async function createPublicOrder(
  slug: string,
  input: { customerName: string; customerPhone: string; fulfillment: 'delivery' | 'pickup'; address?: string; notes?: string; items: { productId: string; quantity: number }[] },
): Promise<{ ok: true }> {
  const [rest] = await db.select({ id: restaurant.id, isActive: restaurant.isActive }).from(restaurant).where(eq(restaurant.slug, slug)).limit(1)
  if (!rest || !rest.isActive) throw new Error('Restaurante no disponible')
  if (!input.customerName.trim() || !input.customerPhone.trim()) throw new Error('Completa tu nombre y teléfono')
  if (!input.items.length) throw new Error('Tu pedido está vacío')
  if (input.fulfillment === 'delivery' && !input.address?.trim()) throw new Error('Escribe tu dirección de entrega')

  const productIds = Array.from(new Set(input.items.map((i) => i.productId)))
  const products = productIds.length ? await db.select().from(menuProduct).where(and(eq(menuProduct.restaurantId, rest.id), inArray(menuProduct.id, productIds))) : []

  const lineItems = input.items
    .map((i) => {
      const product = products.find((p: any) => p.id === i.productId)
      if (!product || !product.isAvailable || !Number.isFinite(i.quantity) || i.quantity <= 0) return null
      return { productId: product.id, productName: product.name, unitPriceCents: product.priceCents, quantity: Math.round(i.quantity) }
    })
    .filter((i): i is { productId: string; productName: string; unitPriceCents: number; quantity: number } => !!i)
  if (!lineItems.length) throw new Error('Los productos de tu pedido ya no están disponibles')

  const totalCents = lineItems.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0)
  const orderId = crypto.randomUUID()
  await db.insert(publicOrder).values({
    id: orderId,
    restaurantId: rest.id,
    customerName: input.customerName.trim(),
    customerPhone: input.customerPhone.trim(),
    fulfillment: input.fulfillment,
    address: input.fulfillment === 'delivery' ? input.address!.trim() : null,
    notes: input.notes?.trim() || null,
    totalCents,
  })
  await db.insert(publicOrderItem).values(lineItems.map((i) => ({ id: crypto.randomUUID(), orderId, ...i })))
  return { ok: true }
}

async function loadOrders(restaurantId: string): Promise<PublicOrderDTO[]> {
  const orders = await db.select().from(publicOrder).where(eq(publicOrder.restaurantId, restaurantId)).orderBy(desc(publicOrder.createdAt))
  const orderIds = orders.map((o: any) => o.id)
  const items = orderIds.length ? await db.select().from(publicOrderItem).where(inArray(publicOrderItem.orderId, orderIds)) : []
  return orders.map((o: any) => ({
    id: o.id,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    fulfillment: o.fulfillment,
    address: o.address,
    notes: o.notes,
    totalCents: o.totalCents,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
    items: items.filter((i: any) => i.orderId === o.id).map((i: any) => ({ productName: i.productName, unitPriceCents: i.unitPriceCents, quantity: i.quantity })),
  }))
}

export async function listPublicOrders(): Promise<PublicOrderDTO[]> {
  const { restaurantId } = await requireMembership()
  return loadOrders(restaurantId)
}

export async function setPublicOrderStatus(id: string, status: 'accepted' | 'ready' | 'completed' | 'cancelled'): Promise<PublicOrderDTO[]> {
  const { restaurantId } = await requireMembership()
  await db.update(publicOrder).set({ status, updatedAt: new Date() }).where(and(eq(publicOrder.id, id), eq(publicOrder.restaurantId, restaurantId)))
  revalidatePath('/restaurante')
  return loadOrders(restaurantId)
}
