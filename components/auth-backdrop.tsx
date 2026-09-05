// Decorative background for the auth pages (/acceso, /recuperar) — soft
// color blobs plus a faint dot grid, instead of the previous flat
// bg-background. Pure CSS (no client JS), safe to render from a server
// component. `aria-hidden` + negative z-index keep it out of the way.
export function AuthBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,var(--border)_1px,transparent_0)] [background-size:28px_28px] opacity-50" />
      <div className="absolute -top-32 -left-24 size-[26rem] rounded-full bg-primary/20 blur-3xl" />
      <div className="absolute -bottom-40 -right-16 size-[30rem] rounded-full bg-[oklch(0.82_0.16_85)]/25 blur-3xl" />
      <div className="absolute top-1/3 left-1/2 size-[18rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
    </div>
  )
}
