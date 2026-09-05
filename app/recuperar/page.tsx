import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { RecoverPasswordForm } from '@/components/recover-password-form'
import { AuthBackdrop } from '@/components/auth-backdrop'

export default async function RecoverPasswordPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user?.emailVerified) {
    redirect((session.user as { role?: string }).role === 'admin' ? '/' : '/restaurante')
  }
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-5 py-10">
      <AuthBackdrop />
      {/* useSearchParams (reading ?token=) requires a Suspense boundary during static generation. */}
      <Suspense fallback={null}>
        <RecoverPasswordForm />
      </Suspense>
    </main>
  )
}
