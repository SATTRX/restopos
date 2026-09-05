'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { inventoryItem, restaurantMembership } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

export type InventoryItemDTO = {
  id: string
  name: string
  unit: string
  stock: number
  minimumStock: number
  costCents: number
  // Only the *one* prior cost survives (see schema.ts) — enough to compare
  // "última compra vs. actual" without keeping a full price-history log.
  previousCostCents: number | null
  previousCostAt: string | null
  costUpdatedAt: string | null
}

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
  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    unit: r.unit,
    stock: r.stock,
    minimumStock: r.minimumStock,
    costCents: r.costCents,
    previousCostCents: r.previousCostCents,
    previousCostAt: r.previousCostAt ? r.previousCostAt.toISOString() : null,
    costUpdatedAt: r.costUpdatedAt ? r.costUpdatedAt.toISOString() : null,
  }))
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
    costUpdatedAt: new Date(),
  })
  revalidatePath('/restaurante')
  return loadInventory(branchId)
}

// Manual edit from the Inventario section — unlike applyOcrInventoryUpdates
// (stock-only, from a photo), this covers every field. When the cost
// changes, the outgoing value is kept as `previousCost*` so the edit form
// can show "última compra vs. actual" (see components/restaurant-workspace.tsx).
export async function updateInventoryItem(
  id: string,
  input: { name: string; unit: string; stock: number; minimumStock: number; costCents: number },
): Promise<InventoryItemDTO[]> {
  const { branchId } = await requireBranch()
  if (!input.name.trim() || !input.unit.trim()) throw new Error('Datos de insumo inválidos')
  const [current] = await db.select().from(inventoryItem).where(and(eq(inventoryItem.id, id), eq(inventoryItem.branchId, branchId))).limit(1)
  if (!current) throw new Error('Insumo no encontrado')

  const newCostCents = Number.isFinite(input.costCents) ? Math.max(0, Math.round(input.costCents)) : 0
  const costChanged = newCostCents !== current.costCents
  const now = new Date()

  await db
    .update(inventoryItem)
    .set({
      name: input.name.trim(),
      unit: input.unit.trim(),
      stock: Number.isFinite(input.stock) ? Math.max(0, Math.round(input.stock)) : 0,
      minimumStock: Number.isFinite(input.minimumStock) ? Math.max(0, Math.round(input.minimumStock)) : 0,
      costCents: newCostCents,
      ...(costChanged ? { previousCostCents: current.costCents, previousCostAt: current.costUpdatedAt ?? current.createdAt, costUpdatedAt: now } : {}),
    })
    .where(and(eq(inventoryItem.id, id), eq(inventoryItem.branchId, branchId)))
  revalidatePath('/restaurante')
  return loadInventory(branchId)
}

export async function deleteInventoryItem(id: string): Promise<InventoryItemDTO[]> {
  const { branchId } = await requireBranch()
  await db.delete(inventoryItem).where(and(eq(inventoryItem.id, id), eq(inventoryItem.branchId, branchId)))
  revalidatePath('/restaurante')
  return loadInventory(branchId)
}

// Applied from the OCR ingredient-photo review screen (components/restaurant-workspace.tsx):
// each row sets an *existing* item's stock to the count read off the photo
// (a recount, not a delta) — unmatched names are handled individually or via
// the Excel import instead. Sequential updates are fine at this batch size.
export async function applyOcrInventoryUpdates(updates: { itemId: string; stock: number }[]): Promise<InventoryItemDTO[]> {
  const { branchId } = await requireBranch()
  const clean = updates.filter((u) => u.itemId && Number.isFinite(u.stock) && u.stock >= 0).slice(0, 200)
  for (const u of clean) {
    await db.update(inventoryItem).set({ stock: Math.round(u.stock) }).where(and(eq(inventoryItem.id, u.itemId), eq(inventoryItem.branchId, branchId)))
  }
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
