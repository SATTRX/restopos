import { ShieldOff } from 'lucide-react'
import { SignOutLink } from '@/components/sign-out-link'

// Shown instead of the workspace when a platform admin has suspended this
// restaurant (see setRestaurantActive in app/actions/admin.ts) — the account
// and its data are untouched, just locked out until an admin restores it.
export function SuspendedNotice() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-xl shadow-foreground/5 sm:p-8">
        <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-destructive text-white">
          <ShieldOff size={20} />
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight">Este restaurante está suspendido</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Un administrador de la plataforma suspendió temporalmente el acceso a este espacio. Tus datos siguen
          guardados — contacta al administrador para reactivarlo.
        </p>
        <SignOutLink className="mt-6 inline-block text-sm font-medium text-primary hover:underline" />
      </div>
    </main>
  )
}
