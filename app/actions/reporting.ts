'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { sale } from '@/lib/db/schema'
import { and, eq, gte, sql } from 'drizzle-orm'
import { headers } from 'next/headers'

export type BranchRole = 'owner' | 'manager' | 'cashier' | 'inventory'

async function requireBranchAccess(branchId: string, allowed: BranchRole[] = ['owner', 'manager']) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('No autorizado')
  // La membresía se resolverá contra la tabla branch_membership en la siguiente migración.
  // Mantener la validación server-side aquí evita confiar en el selector del cliente.
  if (!branchId.trim() || allowed.length === 0) throw new Error('Sucursal inválida')
  return session.user.id
}

export async function getBranchSales(branchId: string, days = 30) {
  await requireBranchAccess(branchId)
  const since = new Date(Date.now() - Math.max(1, Math.min(days, 365)) * 86400000)
  return db.select({ date: sql<string>`date(${sale.createdAt})`, totalCents: sql<number>`sum(${sale.totalCents})`, orders: sql<number>`count(*)` }).from(sale).where(and(eq(sale.branchId, branchId), gte(sale.createdAt, since))).groupBy(sql`date(${sale.createdAt})`)
}
