import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import AdminDashboard from '@/components/admin-dashboard'

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/acceso')
  if (!session.user.emailVerified) redirect('/acceso')
  if ((session.user as { role?: string }).role !== 'admin') redirect('/restaurante')

  return <AdminDashboard userName={session.user.name || 'Administrador'} />
}
