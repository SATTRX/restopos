import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { pool } from '@/lib/db'
import { getPlatformOverview } from '@/app/actions/admin'
import AdminDashboard from '@/components/admin-dashboard'
import { DatabaseSetupNotice } from '@/components/database-setup-notice'

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/acceso')
  if (!session.user.emailVerified) redirect('/acceso')
  if ((session.user as { role?: string }).role !== 'admin') redirect('/restaurante')

  if (!pool) return <DatabaseSetupNotice userName={session.user.name || 'Administrador'} />

  const overview = await getPlatformOverview()

  return <AdminDashboard userName={session.user.name || 'Administrador'} overview={overview} />
}
