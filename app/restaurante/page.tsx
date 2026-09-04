import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { pool } from '@/lib/db'
import { ensureRestaurantWorkspace, getRestaurantAccess } from '@/app/actions/restaurant'
import { ensureDefaultTables } from '@/app/actions/tables'
import { listMenu } from '@/app/actions/menu'
import { listInventory } from '@/app/actions/inventory'
import RestaurantWorkspace from '@/components/restaurant-workspace'
import { DatabaseSetupNotice } from '@/components/database-setup-notice'

export default async function RestaurantPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/acceso')
  if (!session.user.emailVerified) redirect('/acceso')
  if ((session.user as { role?: string }).role === 'admin') redirect('/')

  // Restaurant data (unlike auth) has no in-memory fallback — it needs a
  // real Postgres database. Show a clear message instead of crashing.
  if (!pool) return <DatabaseSetupNotice userName={session.user.name || 'Equipo del restaurante'} />

  await ensureRestaurantWorkspace()
  const [restaurant, tables, menu, inventory] = await Promise.all([
    getRestaurantAccess().then((rows) => rows[0]),
    ensureDefaultTables(),
    listMenu(),
    listInventory(),
  ])

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
      initialMenu={menu}
      initialInventory={inventory}
      userName={session.user.name || 'Equipo del restaurante'}
    />
  )
}
