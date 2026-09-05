"use client"

import { useState, type SubmitEvent } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Eye, KeyRound, LockKeyhole, Mail, UtensilsCrossed } from "lucide-react"
import { authClient } from "@/lib/auth-client"

// Two modes in one page, switched by the presence of `?token=` in the URL:
// no token -> ask for the email and request a reset link; with a token
// (the link from that email lands back here) -> ask for the new password.
// Mirrors the verification-email pattern in restaurant-auth-form.tsx.
export function RecoverPasswordForm() {
  const token = useSearchParams().get("token")
  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl shadow-foreground/5 sm:p-8">
      <div className="mb-7 flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <UtensilsCrossed size={20} />
        </div>
        <div>
          <p className="font-semibold">Mesa<span className="text-primary">Flow</span></p>
          <p className="text-xs text-muted-foreground">Recuperar acceso</p>
        </div>
      </div>
      {token ? <NewPasswordStep token={token} /> : <RequestLinkStep />}
    </div>
  )
}

function RequestLinkStep() {
  const [email, setEmail] = useState("")
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState("")

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPending(true)
    setError("")
    const result = await authClient.requestPasswordReset({ email, redirectTo: "/recuperar" })
    setPending(false)
    // Always show the same "revisa tu correo" outcome regardless of whether
    // the address is registered — otherwise this form could be used to
    // check which emails have an account.
    if (result.error) {
      setError("No pudimos procesar la solicitud. Inténtalo de nuevo en unos minutos.")
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-lg bg-accent px-4 py-3 text-sm text-accent-foreground">
          <p className="font-medium">Revisa tu correo</p>
          <p className="mt-1">
            Si <span className="font-medium">{email}</span> tiene una cuenta, te enviamos un enlace para elegir una nueva contraseña. Expira en 1 hora.
          </p>
        </div>
        <Link href="/acceso" className="w-full text-center text-sm text-primary hover:underline">
          Volver a iniciar sesión
        </Link>
      </div>
    )
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">¿Olvidaste tu contraseña?</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Escribe tu correo y te mandamos un enlace para elegir una nueva.</p>

      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm font-medium">
          Correo electrónico
          <div className="relative">
            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3" placeholder="equipo@restaurante.com" />
          </div>
        </label>

        {error && <p role="alert" className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">{error}</p>}

        <button type="submit" disabled={pending} className="h-11 rounded-lg bg-primary text-sm font-medium text-primary-foreground disabled:opacity-60">
          {pending ? "Enviando…" : "Enviar enlace"}
        </button>
      </form>

      <Link href="/acceso" className="mt-5 block w-full text-center text-sm text-primary hover:underline">
        Volver a iniciar sesión
      </Link>
    </>
  )
}

function NewPasswordStep({ token }: Readonly<{ token: string }>) {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [show, setShow] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres")
      return
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden")
      return
    }
    setPending(true)
    setError("")
    const result = await authClient.resetPassword({ newPassword: password, token })
    setPending(false)
    if (result.error) {
      setError("Este enlace ya expiró o no es válido. Solicita uno nuevo.")
      return
    }
    setDone(true)
    setTimeout(() => router.push("/acceso"), 2000)
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-lg bg-accent px-4 py-3 text-sm text-accent-foreground">
          <p className="font-medium">Contraseña actualizada</p>
          <p className="mt-1">Ya puedes iniciar sesión con tu nueva contraseña. Te llevamos ahí en un momento…</p>
        </div>
        <Link href="/acceso" className="w-full text-center text-sm text-primary hover:underline">
          Ir a iniciar sesión
        </Link>
      </div>
    )
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Elige una nueva contraseña</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Mínimo 8 caracteres.</p>

      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm font-medium">
          Nueva contraseña
          <div className="relative">
            <LockKeyhole size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input required minLength={8} type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-11" placeholder="Mínimo 8 caracteres" />
            <button type="button" aria-label="Mostrar contraseña" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2"><Eye size={16} /></button>
          </div>
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium">
          Confirmar contraseña
          <div className="relative">
            <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input required minLength={8} type={show ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3" placeholder="Repite la contraseña" />
          </div>
        </label>

        {error && <p role="alert" className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">{error}</p>}

        <button type="submit" disabled={pending} className="h-11 rounded-lg bg-primary text-sm font-medium text-primary-foreground disabled:opacity-60">
          {pending ? "Guardando…" : "Guardar nueva contraseña"}
        </button>
      </form>
    </>
  )
}
