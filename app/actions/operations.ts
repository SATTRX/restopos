'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { inventoryItem, sale } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('No autorizado')
  return session.user.id
}

export async function registerSale(input: { branchId: string; totalCents: number; paymentMethod: 'cash' | 'card' | 'transfer' }) {
  await requireUser()
  if (!Number.isInteger(input.totalCents) || input.totalCents <= 0) throw new Error('Total inválido')
  const id = crypto.randomUUID()
  await db.insert(sale).values({ id, branchId: input.branchId, totalCents: input.totalCents, paymentMethod: input.paymentMethod, status: 'paid' })
  revalidatePath('/')
  return { id }
}

export async function adjustInventory(input: { itemId: string; branchId: string; delta: number }) {
  await requireUser()
  if (!Number.isInteger(input.delta) || input.delta === 0) throw new Error('Movimiento inválido')
  await db.update(inventoryItem).set({ stock: sql`${inventoryItem.stock} + ${input.delta}` }).where(and(eq(inventoryItem.id, input.itemId), eq(inventoryItem.branchId, input.branchId)))
  revalidatePath('/')
}
