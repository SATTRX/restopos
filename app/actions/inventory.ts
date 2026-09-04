'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { inventoryItem, restaurantMembership } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

export type InventoryItemDTO = { id: string; name: string; unit: string; stock: number; minimumStock: number; costCents: number }

async function requireBranch() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('No autorizado')
  const rows = await db
    .select({ branchId: restaurantMembership.branchId })
    .from(restaurantMembership)
    .where(and(eq(restaurantMembership.userId, session.user.id), eq(restaurantMembership.isActive, true)))
    .limit(1)
  if (!rows.length || !rows[0].branchId) throw new Error('No tienes una sucursal asignada')
  return { branchId: rows[0].branchId as string }
}

async function loadInventory(branchId: string): Promise<InventoryItemDTO[]> {
  const rows = await db.select().from(inventoryItem).where(eq(inventoryItem.branchId, branchId))
  return rows.map((r: any) => ({ id: r.id, name: r.name, unit: r.unit, stock: r.stock, minimumStock: r.minimumStock, costCents: r.costCents }))
}

export async function listInventory(): Promise<InventoryItemDTO[]> {
  const { branchId } = await requireBranch()
  return loadInventory(branchId)
}

export async function addInventoryItem(input: { name: string; unit: string; stock: number; minimumStock: number; costCents: number }): Promise<InventoryItemDTO[]> {
  const { branchId } = await requireBranch()
  if (!input.name.trim() || !input.unit.trim()) throw new Error('Datos de insumo inválidos')
  await db.insert(inventoryItem).values({
    id: crypto.randomUUID(),
    branchId,
    name: input.name.trim(),
    unit: input.unit.trim(),
    stock: Number.isFinite(input.stock) ? Math.max(0, Math.round(input.stock)) : 0,
    minimumStock: Number.isFinite(input.minimumStock) ? Math.max(0, Math.round(input.minimumStock)) : 0,
    costCents: Number.isFinite(input.costCents) ? Math.max(0, Math.round(input.costCents)) : 0,
  })
  revalidatePath('/restaurante')
  return loadInventory(branchId)
}

export async function deleteInventoryItem(id: string): Promise<InventoryItemDTO[]> {
  const { branchId } = await requireBranch()
  await db.delete(inventoryItem).where(and(eq(inventoryItem.id, id), eq(inventoryItem.branchId, branchId)))
  revalidatePath('/restaurante')
  return loadInventory(branchId)
}
