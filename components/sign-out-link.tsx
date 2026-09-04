'use client'

import { authClient } from '@/lib/auth-client'

export function SignOutLink({ className }: Readonly<{ className?: string }>) {
  const signOut = () => authClient.signOut({ fetchOptions: { onSuccess: () => window.location.assign('/acceso') } })
  return (
    <button type="button" onClick={signOut} className={className}>
      Cerrar sesión
    </button>
  )
}
