"use client"

import { SubmitEvent, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Eye, LockKeyhole, Mail, UtensilsCrossed, UserRound } from "lucide-react"
import { authClient } from "@/lib/auth-client"

type Mode = "restaurant" | "admin"
type ResendStatus = "idle" | "sending" | "sent"

const destinationFor = (role?: string) => (role === "admin" ? "/" : "/restaurante")
const roleLabel = (mode: Mode) => (mode === "admin" ? "administrador" : "restaurante")

function resendButtonLabel(status: ResendStatus, idleLabel: string) {
  if (status === "sent") return "Correo reenviado"
  if (status === "sending") return "Reenviando…"
  return idleLabel
}

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
  const [resendStatus, setResendStatus] = useState<ResendStatus>("idle")

  const toggleCreate = () => {
    setCreate((c) => !c)
    setError("")
    setAwaitingVerification(false)
  }

  async function resendVerification() {
    setResendStatus("sending")
    await authClient.sendVerificationEmail({ email: unverifiedEmail || email, callbackURL: destinationFor(mode) })
    setResendStatus("sent")
  }

  async function createAccount() {
    const result = await authClient.signUp.email({ email, password, name: name.trim() || "Administrador", role: mode })
    if (result.error) {
      const message =
        result.error.code === "USER_ALREADY_EXISTS" ? "Ya existe una cuenta con ese correo. Inicia sesión en su lugar." : "No pudimos crear tu cuenta. Verifica tus datos e inténtalo de nuevo."
      setError(message)
      return
    }
    // requireEmailVerification bloquea el inicio de sesión automático:
    // la cuenta queda creada pero inactiva hasta confirmar el correo.
    setUnverifiedEmail(email)
    setAwaitingVerification(true)
  }

  async function signIn() {
    const result = await authClient.signIn.email({ email, password })
    if (!result.error) {
      router.push(destinationFor((result.data?.user as { role?: string } | undefined)?.role))
      router.refresh()
      return
    }
    if (result.error.code === "EMAIL_NOT_VERIFIED") {
      setUnverifiedEmail(email)
      setError("Tu correo aún no está verificado. Revisa tu bandeja de entrada o reenvía el enlace.")
      return
    }
    setError("No pudimos completar el acceso. Verifica tus datos e inténtalo de nuevo.")
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setPending(true)
    await (create ? createAccount() : signIn())
    setPending(false)
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
          <button type="button" onClick={() => setMode("restaurant")} className={`rounded-md px-3 py-2 text-sm ${mode === "restaurant" ? "bg-card font-medium shadow-sm" : ""}`}>
            Restaurante
          </button>
          <button type="button" onClick={() => setMode("admin")} className={`rounded-md px-3 py-2 text-sm ${mode === "admin" ? "bg-card font-medium shadow-sm" : ""}`}>
            Administrador
          </button>
        </div>
      </div>

      {awaitingVerification ? (
        <VerificationPending mode={mode} email={unverifiedEmail} resendStatus={resendStatus} onResend={resendVerification} onBack={toggleCreate} />
      ) : (
        <AuthFields
          mode={mode}
          create={create}
          name={name}
          setName={setName}
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          show={show}
          setShow={setShow}
          error={error}
          pending={pending}
          unverifiedEmail={unverifiedEmail}
          resendStatus={resendStatus}
          onResend={resendVerification}
          onSubmit={submit}
          onToggleCreate={toggleCreate}
        />
      )}
    </div>
  )
}

function VerificationPending({
  mode,
  email,
  resendStatus,
  onResend,
  onBack,
}: Readonly<{ mode: Mode; email: string; resendStatus: ResendStatus; onResend: () => void; onBack: () => void }>) {
  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="rounded-lg bg-accent px-4 py-3 text-sm text-accent-foreground">
        <p className="font-medium">Revisa tu correo</p>
        <p className="mt-1">
          Enviamos un enlace de confirmación a <span className="font-medium">{email}</span>. Ábrelo para activar tu acceso de {roleLabel(mode)}.
        </p>
      </div>
      <button
        type="button"
        onClick={onResend}
        disabled={resendStatus === "sending"}
        className="h-11 rounded-lg border border-border text-sm font-medium hover:bg-muted disabled:opacity-60"
      >
        {resendButtonLabel(resendStatus, "Reenviar correo")}
      </button>
      <button type="button" onClick={onBack} className="w-full text-center text-sm text-primary hover:underline">
        Volver a iniciar sesión
      </button>
    </div>
  )
}

function AuthFields({
  mode,
  create,
  name,
  setName,
  email,
  setEmail,
  password,
  setPassword,
  show,
  setShow,
  error,
  pending,
  unverifiedEmail,
  resendStatus,
  onResend,
  onSubmit,
  onToggleCreate,
}: Readonly<{
  mode: Mode
  create: boolean
  name: string
  setName: (v: string) => void
  email: string
  setEmail: (v: string) => void
  password: string
  setPassword: (v: string) => void
  show: boolean
  setShow: (v: boolean) => void
  error: string
  pending: boolean
  unverifiedEmail: string
  resendStatus: ResendStatus
  onResend: () => void
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void
  onToggleCreate: () => void
}>) {
  let submitLabel = create ? "Crear espacio" : `Entrar como ${roleLabel(mode)}`
  if (pending) submitLabel = "Procesando…"

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{create ? "Crea tu espacio" : "Bienvenido de vuelta"}</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{mode === "admin" ? "Gestiona todos tus restaurantes y sucursales." : "Opera ventas, carta, inventario y facturación."}</p>

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
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
            <button type="button" aria-label="Mostrar contraseña" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2"><Eye size={16} /></button>
          </div>
          {!create && (
            <Link href="/recuperar" className="self-end text-xs font-medium text-primary hover:underline">
              ¿Olvidaste tu contraseña?
            </Link>
          )}
        </label>

        {error && (
          <div role="alert" className="flex flex-col gap-2 rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
            <p>{error}</p>
            {!create && unverifiedEmail && (
              <button type="button" onClick={onResend} disabled={resendStatus === "sending"} className="self-start text-sm font-medium underline disabled:opacity-60">
                {resendButtonLabel(resendStatus, "Reenviar correo de verificación")}
              </button>
            )}
          </div>
        )}

        <button type="submit" disabled={pending} className="h-11 rounded-lg bg-primary text-sm font-medium text-primary-foreground disabled:opacity-60">
          {submitLabel}
        </button>
      </form>

      <button type="button" onClick={onToggleCreate} className="mt-5 w-full text-center text-sm text-primary hover:underline">
        {create ? "Ya tengo una cuenta" : "Crear una cuenta nueva"}
      </button>
    </>
  )
}
