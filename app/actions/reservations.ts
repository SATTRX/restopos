'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { reservation, restaurant, restaurantMembership } from '@/lib/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

export type ReservationDTO = {
  id: string
  customerName: string
  customerPhone: string
  partySize: number
  reservationAt: string
  notes: string | null
  status: 'pending' | 'confirmed' | 'rejected' | 'cancelled'
  createdAt: string
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

function toDTO(r: any): ReservationDTO {
  return {
    id: r.id,
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    partySize: r.partySize,
    reservationAt: r.reservationAt.toISOString(),
    notes: r.notes,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  }
}

// Public — submitted from /carta/[slug], no auth required. Just a request:
// staff confirm or reject it from "Reservas" in their panel, there's no
// automatic table assignment.
export async function createReservation(
  slug: string,
  input: { customerName: string; customerPhone: string; partySize: number; reservationAt: string; notes?: string },
): Promise<{ ok: true }> {
  const [rest] = await db.select({ id: restaurant.id, isActive: restaurant.isActive }).from(restaurant).where(eq(restaurant.slug, slug)).limit(1)
  if (!rest || !rest.isActive) throw new Error('Restaurante no disponible')
  if (!input.customerName.trim() || !input.customerPhone.trim()) throw new Error('Completa tu nombre y teléfono')
  if (!Number.isInteger(input.partySize) || input.partySize <= 0 || input.partySize > 100) throw new Error('Número de personas inválido')
  const when = new Date(input.reservationAt)
  if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 5 * 60 * 1000) throw new Error('Elige una fecha y hora válidas')

  await db.insert(reservation).values({
    id: crypto.randomUUID(),
    restaurantId: rest.id,
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
  return rows.map(toDTO)
}

export async function setReservationStatus(id: string, status: 'confirmed' | 'rejected' | 'cancelled'): Promise<ReservationDTO[]> {
  const { restaurantId } = await requireMembership()
  await db.update(reservation).set({ status, updatedAt: new Date() }).where(and(eq(reservation.id, id), eq(reservation.restaurantId, restaurantId)))
  revalidatePath('/restaurante')
  const rows = await db.select().from(reservation).where(eq(reservation.restaurantId, restaurantId)).orderBy(desc(reservation.reservationAt))
  return rows.map(toDTO)
}
