import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db, pool } from '@/lib/db'
import { user } from '@/lib/db/schema'
import { getPlatformOverview } from '@/app/actions/admin'
import AdminDashboard from '@/components/admin-dashboard'
import { DatabaseSetupNotice } from '@/components/database-setup-notice'

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/acceso')
  if (!session.user.emailVerified) redirect('/acceso')
  if ((session.user as { role?: string }).role !== 'admin') redirect('/restaurante')

  if (!pool) return <DatabaseSetupNotice userName={session.user.name || 'Administrador'} />

  // isActive is admin-managed, not part of better-auth's own session — check
  // it directly against the table (see setUserActive in app/actions/admin.ts).
  const [row] = await db.select({ isActive: user.isActive }).from(user).where(eq(user.id, session.user.id)).limit(1)
  if (row && !row.isActive) redirect('/acceso')

  const overview = await getPlatformOverview()

  return <AdminDashboard userName={session.user.name || 'Administrador'} overview={overview} />
}
