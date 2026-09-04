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

// Bulk import (e.g. from a restaurant's existing Excel/CSV of ingredients),
// parsed client-side — see components/restaurant-workspace.tsx. Caps the
// batch size so a malformed file can't spam thousands of rows in one call.
export async function importInventoryItems(
  items: { name: string; unit: string; stock: number; minimumStock: number; costCents: number }[],
): Promise<InventoryItemDTO[]> {
  const { branchId } = await requireBranch()
  const clean = items
    .filter((i) => i.name?.trim() && i.unit?.trim())
    .slice(0, 500)
    .map((i) => ({
      id: crypto.randomUUID(),
      branchId,
      name: i.name.trim(),
      unit: i.unit.trim(),
      stock: Number.isFinite(i.stock) ? Math.max(0, Math.round(i.stock)) : 0,
      minimumStock: Number.isFinite(i.minimumStock) ? Math.max(0, Math.round(i.minimumStock)) : 0,
      costCents: Number.isFinite(i.costCents) ? Math.max(0, Math.round(i.costCents)) : 0,
    }))
  if (!clean.length) throw new Error('El archivo no tiene filas válidas (revisa nombre y unidad)')
  await db.insert(inventoryItem).values(clean)
  revalidatePath('/restaurante')
  return loadInventory(branchId)
}
