'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { cashShift, comanda, restaurantMembership, restaurantTable, restaurantZone, tableOrder, tableOrderItem, sale } from '@/lib/db/schema'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { computeTaxBreakdown, nextFolio } from '@/lib/sales'
import { consumeIngredientsForSale } from '@/lib/ingredients'

export type OrderItemDTO = { id: string; productId: string; productName: string; unitPriceCents: number; quantity: number; sentToKitchenAt: string | null }
export type TableDTO = { id: string; label: string; zoneId: string | null; orderId: string | null; items: OrderItemDTO[] }
export type ZoneDTO = { id: string; name: string }
export type ChargeResult = { tables: TableDTO[]; saleId: string }
export type ComandaItem = { productName: string; quantity: number }

async function requireMembership() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('No autorizado')
  const rows = await db
    .select({ restaurantId: restaurantMembership.restaurantId, branchId: restaurantMembership.branchId })
    .from(restaurantMembership)
    .where(and(eq(restaurantMembership.userId, session.user.id), eq(restaurantMembership.isActive, true)))
    .limit(1)
  if (!rows.length || !rows[0].branchId) throw new Error('No tienes un restaurante asignado')
  return { userId: session.user.id, restaurantId: rows[0].restaurantId, branchId: rows[0].branchId }
}

export async function listTablesWithOrders(): Promise<TableDTO[]> {
  const { restaurantId } = await requireMembership()
  const tables = await db
    .select()
    .from(restaurantTable)
    .where(and(eq(restaurantTable.restaurantId, restaurantId), eq(restaurantTable.isActive, true)))
    .orderBy(restaurantTable.position)

  const openOrders = await db.select().from(tableOrder).where(and(eq(tableOrder.restaurantId, restaurantId), eq(tableOrder.status, 'open')))
  const orderIds = openOrders.map((o: any) => o.id)
  const items = orderIds.length ? await db.select().from(tableOrderItem).where(inArray(tableOrderItem.orderId, orderIds)) : []

  return tables.map((t: any) => {
    const order = openOrders.find((o: any) => o.tableId === t.id) ?? null
    const orderItems = order ? items.filter((i: any) => i.orderId === order.id) : []
    return {
      id: t.id,
      label: t.label,
      zoneId: t.zoneId,
      orderId: order?.id ?? null,
      items: orderItems.map((i: any) => ({
        id: i.id,
        productId: i.productId,
        productName: i.productName,
        unitPriceCents: i.unitPriceCents,
        quantity: i.quantity,
        sentToKitchenAt: i.sentToKitchenAt ? i.sentToKitchenAt.toISOString() : null,
      })),
    }
  })
}

// Seeds a default set of tables the first time a restaurant opens "Punto de
// venta". No-op afterwards. `onConflictDoNothing` (backed by the unique
// (restaurant_id, label) constraint) makes this safe even if two requests
// race to seed the same restaurant at once.
export async function ensureDefaultTables(): Promise<TableDTO[]> {
  const { restaurantId, branchId } = await requireMembership()
  const existing = await db.select({ id: restaurantTable.id }).from(restaurantTable).where(eq(restaurantTable.restaurantId, restaurantId)).limit(1)
  if (!existing.length) {
    const rows = Array.from({ length: 8 }, (_, i) => ({ id: crypto.randomUUID(), restaurantId, branchId, label: `Mesa ${i + 1}`, position: i }))
    await db.insert(restaurantTable).values(rows).onConflictDoNothing()
  }
  return listTablesWithOrders()
}

export async function addTable(label?: string): Promise<TableDTO[]> {
  const { restaurantId, branchId } = await requireMembership()
  const existing = await db.select({ id: restaurantTable.id }).from(restaurantTable).where(eq(restaurantTable.restaurantId, restaurantId))
  await db.insert(restaurantTable).values({
    id: crypto.randomUUID(),
    restaurantId,
    branchId,
    label: label?.trim() || `Mesa ${existing.length + 1}`,
    position: existing.length,
  })
  revalidatePath('/restaurante')
  return listTablesWithOrders()
}

export async function renameTable(tableId: string, label: string): Promise<TableDTO[]> {
  const { restaurantId } = await requireMembership()
  await assertTableInRestaurant(tableId, restaurantId)
  if (!label.trim()) throw new Error('El nombre de la mesa no puede estar vacío')
  try {
    await db.update(restaurantTable).set({ label: label.trim() }).where(eq(restaurantTable.id, tableId))
  } catch {
    throw new Error('Ya hay otra mesa con ese nombre')
  }
  revalidatePath('/restaurante')
  return listTablesWithOrders()
}

export async function assignTableZone(tableId: string, zoneId: string | null): Promise<TableDTO[]> {
  const { restaurantId } = await requireMembership()
  await assertTableInRestaurant(tableId, restaurantId)
  if (zoneId) {
    const [zone] = await db.select({ id: restaurantZone.id }).from(restaurantZone).where(and(eq(restaurantZone.id, zoneId), eq(restaurantZone.restaurantId, restaurantId))).limit(1)
    if (!zone) throw new Error('Zona no encontrada')
  }
  await db.update(restaurantTable).set({ zoneId }).where(eq(restaurantTable.id, tableId))
  revalidatePath('/restaurante')
  return listTablesWithOrders()
}

export async function listZones(): Promise<ZoneDTO[]> {
  const { restaurantId } = await requireMembership()
  const rows = await db.select().from(restaurantZone).where(eq(restaurantZone.restaurantId, restaurantId)).orderBy(restaurantZone.position)
  return rows.map((z: any) => ({ id: z.id, name: z.name }))
}

export async function addZone(name: string): Promise<ZoneDTO[]> {
  const { restaurantId } = await requireMembership()
  if (!name.trim()) throw new Error('Escribe un nombre para la zona')
  const existing = await db.select({ id: restaurantZone.id }).from(restaurantZone).where(eq(restaurantZone.restaurantId, restaurantId))
  await db.insert(restaurantZone).values({ id: crypto.randomUUID(), restaurantId, name: name.trim(), position: existing.length })
  revalidatePath('/restaurante')
  return listZones()
}

async function getOrCreateOpenOrder(tableId: string, restaurantId: string, branchId: string) {
  const existing = await db.select({ id: tableOrder.id }).from(tableOrder).where(and(eq(tableOrder.tableId, tableId), eq(tableOrder.status, 'open'))).limit(1)
  if (existing.length) return existing[0].id
  const id = crypto.randomUUID()
  await db.insert(tableOrder).values({ id, restaurantId, tableId, branchId })
  return id
}

async function assertTableInRestaurant(tableId: string, restaurantId: string) {
  const rows = await db.select({ id: restaurantTable.id }).from(restaurantTable).where(and(eq(restaurantTable.id, tableId), eq(restaurantTable.restaurantId, restaurantId))).limit(1)
  if (!rows.length) throw new Error('Mesa no encontrada')
}

// Resolves the order an item belongs to and checks it's within the caller's restaurant.
async function assertItemInRestaurant(itemId: string, restaurantId: string) {
  const rows = await db
    .select({ orderId: tableOrderItem.orderId, orderRestaurantId: tableOrder.restaurantId })
    .from(tableOrderItem)
    .innerJoin(tableOrder, eq(tableOrder.id, tableOrderItem.orderId))
    .where(eq(tableOrderItem.id, itemId))
    .limit(1)
  if (!rows.length || rows[0].orderRestaurantId !== restaurantId) throw new Error('Producto no encontrado')
}

export async function addTableItem(input: { tableId: string; productId: string; productName: string; unitPriceCents: number }): Promise<TableDTO[]> {
  const { restaurantId, branchId } = await requireMembership()
  await assertTableInRestaurant(input.tableId, restaurantId)
  const orderId = await getOrCreateOpenOrder(input.tableId, restaurantId, branchId)

  const existingLine = await db
    .select({ id: tableOrderItem.id, quantity: tableOrderItem.quantity })
    .from(tableOrderItem)
    .where(and(eq(tableOrderItem.orderId, orderId), eq(tableOrderItem.productId, input.productId)))
    .limit(1)

  if (existingLine.length) {
    await db.update(tableOrderItem).set({ quantity: existingLine[0].quantity + 1 }).where(eq(tableOrderItem.id, existingLine[0].id))
  } else {
    await db.insert(tableOrderItem).values({
      id: crypto.randomUUID(),
      orderId,
      productId: input.productId,
      productName: input.productName,
      unitPriceCents: input.unitPriceCents,
      quantity: 1,
    })
  }
  revalidatePath('/restaurante')
  return listTablesWithOrders()
}

export async function changeTableItemQuantity(itemId: string, delta: number): Promise<TableDTO[]> {
  const { restaurantId } = await requireMembership()
  await assertItemInRestaurant(itemId, restaurantId)
  const [line] = await db.select({ quantity: tableOrderItem.quantity }).from(tableOrderItem).where(eq(tableOrderItem.id, itemId)).limit(1)
  const nextQty = (line?.quantity ?? 0) + delta
  if (nextQty <= 0) {
    await db.delete(tableOrderItem).where(eq(tableOrderItem.id, itemId))
  } else {
    await db.update(tableOrderItem).set({ quantity: nextQty }).where(eq(tableOrderItem.id, itemId))
  }
  revalidatePath('/restaurante')
  return listTablesWithOrders()
}

export async function removeTableItem(itemId: string): Promise<TableDTO[]> {
  const { restaurantId } = await requireMembership()
  await assertItemInRestaurant(itemId, restaurantId)
  await db.delete(tableOrderItem).where(eq(tableOrderItem.id, itemId))
  revalidatePath('/restaurante')
  return listTablesWithOrders()
}

export async function chargeTable(
  tableId: string,
  paymentMethod: 'cash' | 'card' | 'transfer' = 'cash',
  tenderedCents?: number,
  isTakeout = false,
): Promise<ChargeResult> {
  const { restaurantId, branchId } = await requireMembership()
  await assertTableInRestaurant(tableId, restaurantId)

  const [shift] = await db.select({ id: cashShift.id }).from(cashShift).where(eq(cashShift.restaurantId, restaurantId)).limit(1)
  if (!shift) throw new Error('Abre un turno de caja antes de cobrar')

  const [order] = await db.select().from(tableOrder).where(and(eq(tableOrder.tableId, tableId), eq(tableOrder.status, 'open'))).limit(1)
  if (!order) throw new Error('Esta mesa no tiene una cuenta abierta')

  const items = await db.select().from(tableOrderItem).where(eq(tableOrderItem.orderId, order.id))
  const totalCents = items.reduce((sum: number, i: any) => sum + i.unitPriceCents * i.quantity, 0)
  if (!items.length || totalCents <= 0) throw new Error('La mesa no tiene productos que cobrar')

  if (paymentMethod === 'cash' && tenderedCents !== undefined && tenderedCents < totalCents) throw new Error('El monto pagado es menor al total')

  const { subtotalCents, taxCents } = await computeTaxBreakdown(restaurantId, totalCents)
  const folio = await nextFolio(restaurantId)
  const saleId = crypto.randomUUID()
  await db.insert(sale).values({
    id: saleId,
    restaurantId,
    branchId,
    shiftId: shift.id,
    tableOrderId: order.id,
    folio,
    subtotalCents,
    taxCents,
    totalCents,
    paymentMethod,
    tenderedCents: paymentMethod === 'cash' && tenderedCents !== undefined ? Math.round(tenderedCents) : null,
    changeCents: paymentMethod === 'cash' && tenderedCents !== undefined ? Math.round(tenderedCents) - totalCents : null,
    isTakeout,
    status: 'paid',
  })
  await db.update(tableOrder).set({ status: 'paid', closedAt: new Date(), updatedAt: new Date() }).where(eq(tableOrder.id, order.id))
  await consumeIngredientsForSale(
    (items as any[]).map((i) => ({ productId: i.productId, quantity: i.quantity })),
    isTakeout,
  )

  revalidatePath('/restaurante')
  return { tables: await listTablesWithOrders(), saleId }
}

// Marks every not-yet-sent item on a table's open order as sent to the
// kitchen as a new numbered comanda for the current shift (numbering is
// scoped to shiftId, so it naturally restarts at 1 on the next shift), and
// returns exactly those items so the caller can render/print the ticket.
export async function sendComanda(tableId: string): Promise<{ tables: TableDTO[]; items: ComandaItem[]; sentAt: string; comandaNumber: number; shiftNumber: number | null }> {
  const { restaurantId } = await requireMembership()
  await assertTableInRestaurant(tableId, restaurantId)

  const [shift] = await db.select({ id: cashShift.id, shiftNumber: cashShift.shiftNumber }).from(cashShift).where(eq(cashShift.restaurantId, restaurantId)).limit(1)
  if (!shift) throw new Error('Abre un turno de caja antes de enviar comandas')

  const [order] = await db.select({ id: tableOrder.id }).from(tableOrder).where(and(eq(tableOrder.tableId, tableId), eq(tableOrder.status, 'open'))).limit(1)
  if (!order) throw new Error('Esta mesa no tiene una cuenta abierta')

  const pending = await db.select().from(tableOrderItem).where(and(eq(tableOrderItem.orderId, order.id), isNull(tableOrderItem.sentToKitchenAt)))
  if (!pending.length) throw new Error('No hay productos nuevos para enviar a cocina')

  const previousComandas = await db.select({ id: comanda.id }).from(comanda).where(eq(comanda.shiftId, shift.id))
  const comandaNumber = previousComandas.length + 1
  const comandaId = crypto.randomUUID()
  const sentAt = new Date()
  await db.insert(comanda).values({ id: comandaId, restaurantId, shiftId: shift.id, tableId, comandaNumber, createdAt: sentAt })
  await db
    .update(tableOrderItem)
    .set({ sentToKitchenAt: sentAt, comandaId })
    .where(and(eq(tableOrderItem.orderId, order.id), isNull(tableOrderItem.sentToKitchenAt)))

  revalidatePath('/restaurante')
  return {
    tables: await listTablesWithOrders(),
    items: (pending as any[]).map((i) => ({ productName: i.productName, quantity: i.quantity })),
    sentAt: sentAt.toISOString(),
    comandaNumber,
    shiftNumber: shift.shiftNumber,
  }
}
