import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db, pool } from '@/lib/db'
import { user as userTable } from '@/lib/db/schema'
import { ensureRestaurantWorkspace, getRestaurantAccess } from '@/app/actions/restaurant'
import { ensureDefaultTables, listZones } from '@/app/actions/tables'
import { listMenu } from '@/app/actions/menu'
import { listInventory } from '@/app/actions/inventory'
import { getActiveShift } from '@/app/actions/shifts'
import RestaurantWorkspace from '@/components/restaurant-workspace'
import { DatabaseSetupNotice } from '@/components/database-setup-notice'
import { SuspendedNotice } from '@/components/suspended-notice'

export default async function RestaurantPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/acceso')
  if (!session.user.emailVerified) redirect('/acceso')
  if ((session.user as { role?: string }).role === 'admin') redirect('/')

  // Restaurant data (unlike auth) has no in-memory fallback — it needs a
  // real Postgres database. Show a clear message instead of crashing.
  if (!pool) return <DatabaseSetupNotice userName={session.user.name || 'Equipo del restaurante'} />

  // isActive is admin-managed, not part of better-auth's own session — check
  // it directly against the table (see setUserActive in app/actions/admin.ts).
  const [userRow] = await db.select({ isActive: userTable.isActive }).from(userTable).where(eq(userTable.id, session.user.id)).limit(1)
  if (userRow && !userRow.isActive) redirect('/acceso')

  await ensureRestaurantWorkspace()
  const [restaurant, tables, zones, menu, inventory, shift] = await Promise.all([
    getRestaurantAccess().then((rows) => rows[0]),
    ensureDefaultTables(),
    listZones(),
    listMenu(),
    listInventory(),
    getActiveShift(),
  ])

  if (restaurant && !restaurant.isActive) return <SuspendedNotice />

  return (
    <RestaurantWorkspace
      initialName={restaurant?.name ?? session.user.name ?? 'Mi restaurante'}
      initialAccent={restaurant?.primaryColor ?? '#c86b4a'}
      initialReceiptFooter={restaurant?.receiptFooter ?? ''}
      initialLogoUrl={restaurant?.logoUrl ?? ''}
      initialTaxSettings={{
        taxId: restaurant?.taxId ?? '',
        currency: restaurant?.currency ?? 'MXN',
        taxRatePercent: (restaurant?.taxRate ?? 1600) / 100,
      }}
      restaurantSlug={restaurant?.slug ?? ''}
      initialTables={tables}
      initialZones={zones}
      initialMenu={menu}
      initialInventory={inventory}
      initialShift={shift}
      userName={session.user.name || 'Equipo del restaurante'}
    />
  )
}
