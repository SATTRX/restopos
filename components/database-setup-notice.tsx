import { DatabaseZap } from 'lucide-react'
import { SignOutLink } from '@/components/sign-out-link'

export function DatabaseSetupNotice({ userName }: Readonly<{ userName: string }>) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-xl shadow-foreground/5 sm:p-8">
        <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <DatabaseZap size={20} />
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight">Falta conectar la base de datos</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Hola {userName}, tu cuenta ya está verificada, pero MesaFlow todavía no tiene una base de datos Postgres
          configurada (variable <code className="rounded bg-muted px-1 py-0.5">DATABASE_URL</code>). Sin ella no se
          pueden guardar restaurantes, ventas ni inventario.
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          Agrega la cadena de conexión (por ejemplo de Supabase) en <code className="rounded bg-muted px-1 py-0.5">.env.local</code>{' '}
          y reinicia el servidor.
        </p>
        <SignOutLink className="mt-6 inline-block text-sm font-medium text-primary hover:underline" />
      </div>
    </main>
  )
}
