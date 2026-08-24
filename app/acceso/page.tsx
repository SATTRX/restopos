import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { RestaurantAuthForm } from '@/components/restaurant-auth-form'

export default async function RestaurantAccessPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect('/restaurante')
  return <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10"><RestaurantAuthForm /></main>
}
