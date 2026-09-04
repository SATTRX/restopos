"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { Eye, LockKeyhole, Mail, UtensilsCrossed, UserRound } from "lucide-react"
import { authClient } from "@/lib/auth-client"

type Mode = "restaurant" | "admin"

export function RestaurantAuthForm() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>("restaurant")
  const [create, setCreate] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [show, setShow] = useState(false)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const [awaitingVerification, setAwaitingVerification] = useState(false)
  const [unverifiedEmail, setUnverifiedEmail] = useState("")
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent">("idle")

  const destinationFor = (role?: string) => (role === "admin" ? "/" : "/restaurante")

  const selectRestaurant = () => setMode("restaurant")
  const selectAdmin = () => setMode("admin")
  const toggleCreate = () => {
    setCreate((c) => !c)
    setError("")
    setAwaitingVerification(false)
  }
  const toggleShow = () => setShow((s) => !s)

  async function resendVerification() {
    setResendStatus("sending")
    await authClient.sendVerificationEmail({ email: unverifiedEmail || email, callbackURL: destinationFor(mode) })
    setResendStatus("sent")
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setPending(true)

    if (create) {
      const result = await authClient.signUp.email({ email, password, name: name.trim() || "Administrador", role: mode })
      setPending(false)
      if (result.error) {
        setError(
          result.error.code === "USER_ALREADY_EXISTS"
            ? "Ya existe una cuenta con ese correo. Inicia sesión en su lugar."
            : "No pudimos crear tu cuenta. Verifica tus datos e inténtalo de nuevo.",
        )
        return
      }
      // requireEmailVerification bloquea el inicio de sesión automático:
      // la cuenta queda creada pero inactiva hasta confirmar el correo.
      setUnverifiedEmail(email)
      setAwaitingVerification(true)
      return
    }

    const result = await authClient.signIn.email({ email, password })
    setPending(false)

    if (result.error) {
      if (result.error.code === "EMAIL_NOT_VERIFIED") {
        setUnverifiedEmail(email)
        setError("Tu correo aún no está verificado. Revisa tu bandeja de entrada o reenvía el enlace.")
        return
      }
      setError("No pudimos completar el acceso. Verifica tus datos e inténtalo de nuevo.")
      return
    }

    router.push(destinationFor((result.data?.user as { role?: string } | undefined)?.role))
    router.refresh()
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl shadow-foreground/5 sm:p-8">
      <div className="mb-7 flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <UtensilsCrossed size={20} />
        </div>
        <div>
          <p className="font-semibold">Mesa<span className="text-primary">Flow</span></p>
          <p className="text-xs text-muted-foreground">Acceso seguro</p>
        </div>
      </div>

      <div className="mb-6">
        <p className="mb-2 text-sm font-medium text-primary">Selecciona tu espacio</p>
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
          <button type="button" onClick={selectRestaurant} className={`rounded-md px-3 py-2 text-sm ${mode === "restaurant" ? "bg-card font-medium shadow-sm" : ""}`}>
            Restaurante
          </button>
          <button type="button" onClick={selectAdmin} className={`rounded-md px-3 py-2 text-sm ${mode === "admin" ? "bg-card font-medium shadow-sm" : ""}`}>
            Administrador
          </button>
        </div>
      </div>

      {awaitingVerification ? (
        <div className="mt-6 flex flex-col gap-4">
          <div className="rounded-lg bg-accent px-4 py-3 text-sm text-accent-foreground">
            <p className="font-medium">Revisa tu correo</p>
            <p className="mt-1">
              Enviamos un enlace de confirmación a <span className="font-medium">{unverifiedEmail}</span>. Ábrelo para
              activar tu acceso {mode === "admin" ? "de administrador" : "de restaurante"}.
            </p>
          </div>
          <button
            type="button"
            onClick={resendVerification}
            disabled={resendStatus === "sending"}
            className="h-11 rounded-lg border border-border text-sm font-medium hover:bg-muted disabled:opacity-60"
          >
            {resendStatus === "sent" ? "Correo reenviado" : resendStatus === "sending" ? "Reenviando…" : "Reenviar correo"}
          </button>
          <button type="button" onClick={toggleCreate} className="w-full text-center text-sm text-primary hover:underline">
            Volver a iniciar sesión
          </button>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">{create ? "Crea tu espacio" : "Bienvenido de vuelta"}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{mode === "admin" ? "Gestiona todos tus restaurantes y sucursales." : "Opera ventas, carta, inventario y facturación."}</p>

          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            {create && (
              <label className="flex flex-col gap-2 text-sm font-medium">
                Tu nombre
                <div className="relative">
                  <UserRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input required value={name} onChange={(e) => setName(e.target.value)} className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3" placeholder="Nombre del responsable" />
                </div>
              </label>
            )}

            <label className="flex flex-col gap-2 text-sm font-medium">
              Correo electrónico
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3" placeholder="equipo@restaurante.com" />
              </div>
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium">
              Contraseña
              <div className="relative">
                <LockKeyhole size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input required minLength={8} type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-11" placeholder="Mínimo 8 caracteres" />
                <button type="button" aria-label="Mostrar contraseña" onClick={toggleShow} className="absolute right-3 top-1/2 -translate-y-1/2"><Eye size={16} /></button>
              </div>
            </label>

            {error && (
              <div role="alert" className="flex flex-col gap-2 rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
                <p>{error}</p>
                {!create && unverifiedEmail && (
                  <button
                    type="button"
                    onClick={resendVerification}
                    disabled={resendStatus === "sending"}
                    className="self-start text-sm font-medium underline disabled:opacity-60"
                  >
                    {resendStatus === "sent" ? "Correo reenviado" : resendStatus === "sending" ? "Reenviando…" : "Reenviar correo de verificación"}
                  </button>
                )}
              </div>
            )}

            <button type="submit" disabled={pending} className="h-11 rounded-lg bg-primary text-sm font-medium text-primary-foreground disabled:opacity-60">
              {pending ? "Procesando…" : create ? "Crear espacio" : `Entrar como ${mode === "admin" ? "administrador" : "restaurante"}`}
            </button>
          </form>

          <button type="button" onClick={toggleCreate} className="mt-5 w-full text-center text-sm text-primary hover:underline">{create ? 'Ya tengo una cuenta' : 'Crear una cuenta nueva'}</button>
        </>
      )}
    </div>
  )
}
