'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { reservation, restaurant, restaurantMembership, restaurantTable, restaurantZone } from '@/lib/db/schema'
import { and, desc, eq, gte, inArray, lte, notInArray } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

export type ReservationDTO = {
  id: string
  tableId: string | null
  tableLabel: string | null
  customerName: string
  customerPhone: string
  partySize: number
  reservationAt: string
  notes: string | null
  status: 'pending' | 'confirmed' | 'rejected' | 'cancelled'
  createdAt: string
}

export type TableAvailabilityDTO = { id: string; label: string; zoneId: string | null; available: boolean }
export type ZoneAvailabilityDTO = { zones: { id: string; name: string }[]; tables: TableAvailabilityDTO[] }

// A table is only ever "occupied" by a reservation within this window around
// the requested time — a rough seating-turnover estimate, not a real
// schedule (reservations aren't linked to actual dine-in sessions).
const AVAILABILITY_WINDOW_MS = 2 * 60 * 60 * 1000

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

function toDTO(r: any, tableLabel: string | null = null): ReservationDTO {
  return {
    id: r.id,
    tableId: r.tableId,
    tableLabel,
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    partySize: r.partySize,
    reservationAt: r.reservationAt.toISOString(),
    notes: r.notes,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  }
}

// Reservations reference a table only loosely (the customer's optional
// pick) — resolve labels in one extra query rather than a join, since most
// reservations have no table at all.
async function attachTableLabels(rows: any[]): Promise<ReservationDTO[]> {
  const tableIds = Array.from(new Set(rows.map((r) => r.tableId).filter(Boolean)))
  const tables = tableIds.length ? await db.select({ id: restaurantTable.id, label: restaurantTable.label }).from(restaurantTable).where(inArray(restaurantTable.id, tableIds)) : []
  const labelFor = (tableId: string | null) => (tableId ? tables.find((t: any) => t.id === tableId)?.label ?? null : null)
  return rows.map((r) => toDTO(r, labelFor(r.tableId)))
}

// Public — lets the customer see which zones/tables are free around the
// date and time they picked, before submitting the reservation request.
export async function getReservationAvailability(slug: string, reservationAt: string): Promise<ZoneAvailabilityDTO> {
  const [rest] = await db.select({ id: restaurant.id }).from(restaurant).where(eq(restaurant.slug, slug)).limit(1)
  if (!rest) throw new Error('Restaurante no disponible')
  const when = new Date(reservationAt)
  if (Number.isNaN(when.getTime())) throw new Error('Fecha y hora inválidas')

  const zones = await db.select({ id: restaurantZone.id, name: restaurantZone.name }).from(restaurantZone).where(eq(restaurantZone.restaurantId, rest.id)).orderBy(restaurantZone.position)
  const tables = await db
    .select({ id: restaurantTable.id, label: restaurantTable.label, zoneId: restaurantTable.zoneId })
    .from(restaurantTable)
    .where(and(eq(restaurantTable.restaurantId, rest.id), eq(restaurantTable.isActive, true)))
    .orderBy(restaurantTable.position)

  const windowStart = new Date(when.getTime() - AVAILABILITY_WINDOW_MS)
  const windowEnd = new Date(when.getTime() + AVAILABILITY_WINDOW_MS)
  const overlapping = await db
    .select({ tableId: reservation.tableId })
    .from(reservation)
    .where(
      and(
        eq(reservation.restaurantId, rest.id),
        notInArray(reservation.status, ['rejected', 'cancelled']),
        gte(reservation.reservationAt, windowStart),
        lte(reservation.reservationAt, windowEnd),
      ),
    )
  const occupiedTableIds = new Set(overlapping.map((r: any) => r.tableId).filter(Boolean))

  return { zones, tables: tables.map((t: any) => ({ id: t.id, label: t.label, zoneId: t.zoneId, available: !occupiedTableIds.has(t.id) })) }
}

// Public — submitted from /carta/[slug], no auth required. Just a request:
// staff confirm or reject it from "Reservas" in their panel, there's no
// automatic table assignment beyond the customer's own optional pick.
export async function createReservation(
  slug: string,
  input: { customerName: string; customerPhone: string; partySize: number; reservationAt: string; notes?: string; tableId?: string },
): Promise<{ ok: true }> {
  const [rest] = await db.select({ id: restaurant.id, isActive: restaurant.isActive }).from(restaurant).where(eq(restaurant.slug, slug)).limit(1)
  if (!rest || !rest.isActive) throw new Error('Restaurante no disponible')
  if (!input.customerName.trim() || !input.customerPhone.trim()) throw new Error('Completa tu nombre y teléfono')
  if (!Number.isInteger(input.partySize) || input.partySize <= 0 || input.partySize > 100) throw new Error('Número de personas inválido')
  const when = new Date(input.reservationAt)
  if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 5 * 60 * 1000) throw new Error('Elige una fecha y hora válidas')

  let tableId: string | null = null
  if (input.tableId) {
    const [table] = await db.select({ id: restaurantTable.id }).from(restaurantTable).where(and(eq(restaurantTable.id, input.tableId), eq(restaurantTable.restaurantId, rest.id))).limit(1)
    tableId = table?.id ?? null
  }

  await db.insert(reservation).values({
    id: crypto.randomUUID(),
    restaurantId: rest.id,
    tableId,
    customerName: input.customerName.trim(),
    customerPhone: input.customerPhone.trim(),
    partySize: Math.round(input.partySize),
    reservationAt: when,
    notes: input.notes?.trim() || null,
  })
  return { ok: true }
}

export async function listReservations(): Promise<ReservationDTO[]> {
  const { restaurantId } = await requireMembership()
  const rows = await db.select().from(reservation).where(eq(reservation.restaurantId, restaurantId)).orderBy(desc(reservation.reservationAt))
  return attachTableLabels(rows)
}

export async function setReservationStatus(id: string, status: 'confirmed' | 'rejected' | 'cancelled'): Promise<ReservationDTO[]> {
  const { restaurantId } = await requireMembership()
  await db.update(reservation).set({ status, updatedAt: new Date() }).where(and(eq(reservation.id, id), eq(reservation.restaurantId, restaurantId)))
  revalidatePath('/restaurante')
  const rows = await db.select().from(reservation).where(eq(reservation.restaurantId, restaurantId)).orderBy(desc(reservation.reservationAt))
  return attachTableLabels(rows)
}
