'use client'

import { useMemo, useState, type SubmitEvent } from 'react'
import { CalendarDays, Check, ChevronLeft, MapPin, Minus, Plus, ShoppingCart, Store, Truck, UtensilsCrossed, X } from 'lucide-react'
import type { MenuProductDTO, PublicMenuDTO } from '@/app/actions/menu'
import { createReservation, getReservationAvailability, type ZoneAvailabilityDTO } from '@/app/actions/reservations'
import { createPublicOrder } from '@/app/actions/public-orders'
import { iconForTag } from '@/lib/menu-tags'

type CartLine = { product: MenuProductDTO; quantity: number }

const money = (cents: number) => `$ ${(cents / 100).toFixed(2)}`

export function PublicMenuView({ menu, slug }: Readonly<{ menu: PublicMenuDTO; slug: string }>) {
  // Customers land on a choice screen (carta vs. reservar) instead of being
  // dropped straight into the product list — see the 'landing' branch below.
  const [view, setView] = useState<'landing' | 'menu'>('landing')
  const [cart, setCart] = useState<Record<string, number>>({})
  const [cartModalOpen, setCartModalOpen] = useState(false)
  const [reservationModalOpen, setReservationModalOpen] = useState(false)
  const brandStyle = { '--brand': menu.primaryColor } as React.CSSProperties

  const allProducts = useMemo(() => menu.categories.flatMap((c) => c.products), [menu.categories])
  const cartLines: CartLine[] = useMemo(
    () =>
      Object.entries(cart)
        .map(([productId, quantity]) => ({ product: allProducts.find((p) => p.id === productId), quantity }))
        .filter((l): l is CartLine => !!l.product && l.quantity > 0),
    [cart, allProducts],
  )
  const cartCount = cartLines.reduce((sum, l) => sum + l.quantity, 0)
  const cartTotalCents = cartLines.reduce((sum, l) => sum + l.product.priceCents * l.quantity, 0)

  const addToCart = (productId: string) => setCart((c) => ({ ...c, [productId]: (c[productId] ?? 0) + 1 }))
  const removeFromCart = (productId: string) =>
    setCart((c) => {
      const next = { ...c }
      if (next[productId] > 1) next[productId] -= 1
      else delete next[productId]
      return next
    })

  const scrollToCategory = (id: string) => {
    document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <main style={brandStyle} className="relative min-h-screen bg-background text-foreground">
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 flex select-none items-center justify-center overflow-hidden">
        {menu.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={menu.logoUrl} alt="" style={{ width: 'min(46vw, 520px)', height: 'auto', transform: 'rotate(-6deg)' }} className="opacity-[0.06]" />
        ) : (
          <span
            className="whitespace-nowrap font-black uppercase tracking-tight text-[var(--brand)] opacity-[0.05]"
            style={{ fontSize: 'min(22vw, 260px)', transform: 'rotate(-8deg)' }}
          >
            {menu.restaurantName}
          </span>
        )}
      </div>

      <div className="relative z-10 mx-auto max-w-5xl px-5 py-10 md:py-14">
        <header className="flex flex-col items-center gap-4 text-center">
          {menu.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={menu.logoUrl} alt={menu.restaurantName} className="size-16 rounded-2xl border border-border object-cover" />
          ) : (
            <div className="flex size-16 items-center justify-center rounded-2xl bg-[var(--brand)] text-white">
              <UtensilsCrossed size={26} />
            </div>
          )}
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{menu.restaurantName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{view === 'landing' ? '¿Qué te gustaría hacer?' : 'Carta digital'}</p>
          </div>
          {view === 'menu' && (
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => setView('landing')} className="flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted">
                <ChevronLeft size={16} /> Volver
              </button>
              <button
                type="button"
                onClick={() => setReservationModalOpen(true)}
                className="flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted"
              >
                <CalendarDays size={16} /> Reservar mesa
              </button>
            </div>
          )}
        </header>

        {view === 'landing' && (
          <div className="mx-auto mt-10 grid max-w-lg gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setView('menu')}
              className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-8 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--brand)] hover:shadow-md"
            >
              <span className="flex size-14 items-center justify-center rounded-2xl bg-[var(--brand)]/10 text-[var(--brand)]">
                <UtensilsCrossed size={26} />
              </span>
              <span className="font-semibold">Ver la carta</span>
              <span className="text-sm text-muted-foreground">Explora el menú y pide para domicilio o recoger</span>
            </button>
            <button
              type="button"
              onClick={() => setReservationModalOpen(true)}
              className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-8 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--brand)] hover:shadow-md"
            >
              <span className="flex size-14 items-center justify-center rounded-2xl bg-[var(--brand)]/10 text-[var(--brand)]">
                <CalendarDays size={26} />
              </span>
              <span className="font-semibold">Reservar mesa</span>
              <span className="text-sm text-muted-foreground">Elige fecha, hora y zona disponible</span>
            </button>
          </div>
        )}

        {/* Mobile category picker — the sidebar below is desktop-only. */}
        {view === 'menu' && menu.categories.length > 1 && (
          <div className="sticky top-0 z-20 -mx-5 mt-6 flex gap-2 overflow-x-auto border-b border-border bg-background/95 px-5 py-3 backdrop-blur lg:hidden">
            {menu.categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => scrollToCategory(c.id)}
                className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:border-[var(--brand)] hover:text-[var(--brand)]"
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {view === 'menu' && (
        <div className="mt-8 flex items-start gap-8">
          {menu.categories.length > 1 && (
            <aside className="sticky top-8 hidden w-48 shrink-0 flex-col gap-1 lg:flex">
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Categorías</p>
              {menu.categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => scrollToCategory(c.id)}
                  className="rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {c.name}
                </button>
              ))}
            </aside>
          )}

          <div className="flex min-w-0 flex-1 flex-col gap-10">
            {menu.categories.length ? (
              menu.categories.map((category) => (
                <section key={category.id} id={`cat-${category.id}`} className="scroll-mt-24">
                  <h2 className="mb-4 text-lg font-semibold text-[var(--brand)]">{category.name}</h2>
                  <div className="flex flex-col gap-3">
                    {category.products.map((product) => {
                      const qty = cart[product.id] ?? 0
                      return (
                        <div key={product.id} className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-4">
                          <div className="min-w-0">
                            <p className="font-medium">{product.name}</p>
                            {product.description && <p className="mt-1 text-sm text-muted-foreground">{product.description}</p>}
                            {product.tags.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {product.tags.map((tag) => {
                                  const TagIcon = iconForTag(tag)
                                  return (
                                    <span key={tag} className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                      <TagIcon size={11} /> {tag}
                                    </span>
                                  )
                                })}
                              </div>
                            )}
                            <p className="mt-2 font-semibold">{money(product.priceCents)}</p>
                          </div>
                          <div className="shrink-0">
                            {qty === 0 ? (
                              <button
                                type="button"
                                onClick={() => addToCart(product.id)}
                                className="flex h-9 items-center gap-1.5 rounded-lg bg-[var(--brand)] px-3 text-xs font-medium text-white"
                              >
                                <Plus size={14} /> Agregar
                              </button>
                            ) : (
                              <div className="flex items-center gap-2 rounded-lg border border-border px-1.5 py-1">
                                <button type="button" aria-label={`Quitar ${product.name}`} onClick={() => removeFromCart(product.id)} className="flex size-7 items-center justify-center rounded-md hover:bg-muted">
                                  <Minus size={14} />
                                </button>
                                <span className="w-4 text-center text-sm font-semibold">{qty}</span>
                                <button type="button" aria-label={`Agregar otro ${product.name}`} onClick={() => addToCart(product.id)} className="flex size-7 items-center justify-center rounded-md hover:bg-muted">
                                  <Plus size={14} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              ))
            ) : (
              <p className="text-center text-sm text-muted-foreground">Esta carta todavía no tiene productos disponibles.</p>
            )}
          </div>
        </div>
        )}
      </div>

      {view === 'menu' && cartCount > 0 && (
        <button
          type="button"
          onClick={() => setCartModalOpen(true)}
          className="fixed bottom-5 right-5 z-30 flex h-14 items-center gap-2 rounded-full bg-[var(--brand)] px-5 text-sm font-semibold text-white shadow-lg"
        >
          <ShoppingCart size={18} />
          {cartCount} · {money(cartTotalCents)}
        </button>
      )}

      {cartModalOpen && (
        <CartModal
          slug={slug}
          lines={cartLines}
          totalCents={cartTotalCents}
          onAdd={addToCart}
          onRemove={removeFromCart}
          onClose={() => setCartModalOpen(false)}
          onOrdered={() => {
            setCart({})
            setCartModalOpen(false)
          }}
        />
      )}

      {reservationModalOpen && <ReservationModal slug={slug} onClose={() => setReservationModalOpen(false)} />}
    </main>
  )
}

function CartModal({
  slug,
  lines,
  totalCents,
  onAdd,
  onRemove,
  onClose,
  onOrdered,
}: Readonly<{
  slug: string
  lines: CartLine[]
  totalCents: number
  onAdd: (productId: string) => void
  onRemove: (productId: string) => void
  onClose: () => void
  onOrdered: () => void
}>) {
  const [step, setStep] = useState<'cart' | 'checkout' | 'done'>('cart')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [fulfillment, setFulfillment] = useState<'delivery' | 'pickup'>('delivery')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await createPublicOrder(slug, {
        customerName: name,
        customerPhone: phone,
        fulfillment,
        address: fulfillment === 'delivery' ? address : undefined,
        notes: notes.trim() || undefined,
        items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
      })
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar tu pedido')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-5">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-semibold">{step === 'checkout' ? 'Tus datos' : 'Tu pedido'}</h2>
          <button type="button" onClick={step === 'done' ? onOrdered : onClose} aria-label="Cerrar">
            <X />
          </button>
        </div>

        {step === 'cart' && (
          <>
            <div className="mt-4 flex flex-col gap-3 overflow-y-auto">
              {lines.map((l) => (
                <div key={l.product.id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{l.product.name}</p>
                    <p className="text-xs text-muted-foreground">{money(l.product.priceCents)} c/u</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 rounded-lg border border-border px-1.5 py-1">
                    <button type="button" aria-label={`Quitar ${l.product.name}`} onClick={() => onRemove(l.product.id)} className="flex size-7 items-center justify-center rounded-md hover:bg-muted">
                      <Minus size={14} />
                    </button>
                    <span className="w-4 text-center font-semibold">{l.quantity}</span>
                    <button type="button" aria-label={`Agregar otro ${l.product.name}`} onClick={() => onAdd(l.product.id)} className="flex size-7 items-center justify-center rounded-md hover:bg-muted">
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {!lines.length && <p className="text-sm text-muted-foreground">Tu carrito está vacío.</p>}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-dashed border-border pt-4 text-sm font-semibold">
              <span>Total</span>
              <span>{money(totalCents)}</span>
            </div>
            <button
              type="button"
              disabled={!lines.length}
              onClick={() => setStep('checkout')}
              className="mt-4 h-11 rounded-lg bg-[var(--brand)] text-sm font-medium text-white disabled:opacity-60"
            >
              Continuar
            </button>
          </>
        )}

        {step === 'checkout' && (
          <form onSubmit={submit} className="mt-4 flex flex-col gap-3 overflow-y-auto">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Nombre
              <input required value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-lg border border-input bg-background px-3" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Teléfono
              <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11 rounded-lg border border-input bg-background px-3" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFulfillment('delivery')}
                className={`flex h-11 items-center justify-center gap-2 rounded-lg border text-sm font-medium ${fulfillment === 'delivery' ? 'border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]' : 'border-border text-muted-foreground'}`}
              >
                <Truck size={16} /> Domicilio
              </button>
              <button
                type="button"
                onClick={() => setFulfillment('pickup')}
                className={`flex h-11 items-center justify-center gap-2 rounded-lg border text-sm font-medium ${fulfillment === 'pickup' ? 'border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]' : 'border-border text-muted-foreground'}`}
              >
                <Store size={16} /> Recoger
              </button>
            </div>
            {fulfillment === 'delivery' && (
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Dirección de entrega
                <input required value={address} onChange={(e) => setAddress(e.target.value)} className="h-11 rounded-lg border border-input bg-background px-3" />
              </label>
            )}
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Notas (opcional)
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="resize-none rounded-lg border border-input bg-background p-3 text-sm" />
            </label>
            <div className="flex items-center justify-between text-sm font-semibold">
              <span>Total</span>
              <span>{money(totalCents)}</span>
            </div>
            {error && <p role="alert" className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">{error}</p>}
            <button type="submit" disabled={saving} className="h-11 rounded-lg bg-[var(--brand)] text-sm font-medium text-white disabled:opacity-60">
              {saving ? 'Enviando…' : 'Enviar pedido'}
            </button>
          </form>
        )}

        {step === 'done' && (
          <div className="mt-5 flex flex-col items-center gap-3 py-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-[var(--brand)]/10 text-[var(--brand)]">
              <Check size={22} />
            </div>
            <p className="font-medium">¡Pedido enviado!</p>
            <p className="text-sm text-muted-foreground">El restaurante recibió tu pedido y se pondrá en contacto para confirmarlo.</p>
            <button type="button" onClick={onOrdered} className="mt-2 h-11 w-full rounded-lg border border-border text-sm font-medium hover:bg-muted">
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ReservationModal({ slug, onClose }: Readonly<{ slug: string; onClose: () => void }>) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [partySize, setPartySize] = useState('2')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const [availability, setAvailability] = useState<ZoneAvailabilityDTO | null>(null)
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [availabilityError, setAvailabilityError] = useState('')
  const [zoneId, setZoneId] = useState('')
  const [tableId, setTableId] = useState('')

  const checkAvailability = async () => {
    if (!date || !time) {
      setError('Elige una fecha y hora primero')
      return
    }
    setError('')
    setAvailabilityError('')
    setAvailabilityLoading(true)
    setAvailability(null)
    setZoneId('')
    setTableId('')
    try {
      const result = await getReservationAvailability(slug, new Date(`${date}T${time}`).toISOString())
      setAvailability(result)
    } catch (err) {
      setAvailabilityError(err instanceof Error ? err.message : 'No se pudo consultar la disponibilidad')
    } finally {
      setAvailabilityLoading(false)
    }
  }

  const tablesInZone = availability ? availability.tables.filter((t) => (zoneId ? t.zoneId === zoneId : true)) : []

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!date || !time) {
      setError('Elige una fecha y hora')
      return
    }
    setSaving(true)
    setError('')
    try {
      await createReservation(slug, {
        customerName: name,
        customerPhone: phone,
        partySize: Number.parseInt(partySize, 10) || 0,
        reservationAt: new Date(`${date}T${time}`).toISOString(),
        notes: notes.trim() || undefined,
        tableId: tableId || undefined,
      })
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar tu reserva')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-5">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-semibold">Reservar mesa</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X />
          </button>
        </div>

        {done ? (
          <div className="mt-5 flex flex-col items-center gap-3 py-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-[var(--brand)]/10 text-[var(--brand)]">
              <Check size={22} />
            </div>
            <p className="font-medium">¡Solicitud enviada!</p>
            <p className="text-sm text-muted-foreground">El restaurante confirmará tu reserva y se pondrá en contacto contigo.</p>
            <button type="button" onClick={onClose} className="mt-2 h-11 w-full rounded-lg border border-border text-sm font-medium hover:bg-muted">
              Cerrar
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 flex flex-col gap-3 overflow-y-auto">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Nombre
              <input required value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-lg border border-input bg-background px-3" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Teléfono
              <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11 rounded-lg border border-input bg-background px-3" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Fecha
                <input required type="date" value={date} onChange={(e) => { setDate(e.target.value); setAvailability(null) }} className="h-11 rounded-lg border border-input bg-background px-3" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Hora
                <input required type="time" value={time} onChange={(e) => { setTime(e.target.value); setAvailability(null) }} className="h-11 rounded-lg border border-input bg-background px-3" />
              </label>
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Número de personas
              <input required type="number" min="1" max="100" value={partySize} onChange={(e) => setPartySize(e.target.value)} className="h-11 rounded-lg border border-input bg-background px-3" />
            </label>

            {!availability && (
              <button
                type="button"
                onClick={checkAvailability}
                disabled={availabilityLoading}
                className="flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--brand)] bg-[var(--brand)]/10 text-xs font-medium text-[var(--brand)] disabled:opacity-60"
              >
                <MapPin size={14} /> {availabilityLoading ? 'Consultando…' : 'Ver zonas y mesas disponibles'}
              </button>
            )}
            {availabilityError && <p className="text-xs text-destructive">{availabilityError}</p>}

            {availability && (
              <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
                {availability.zones.length > 0 && (
                  <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
                    Zona (opcional)
                    <select value={zoneId} onChange={(e) => { setZoneId(e.target.value); setTableId('') }} className="h-10 rounded-lg border border-input bg-background px-2 text-sm text-foreground">
                      <option value="">Cualquier zona</option>
                      {availability.zones.map((z) => (
                        <option key={z.id} value={z.id}>{z.name}</option>
                      ))}
                    </select>
                  </label>
                )}
                {tablesInZone.length > 0 && (
                  <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
                    Mesa (opcional)
                    <select value={tableId} onChange={(e) => setTableId(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-2 text-sm text-foreground">
                      <option value="">Sin preferencia — que el restaurante elija</option>
                      {tablesInZone.map((t) => (
                        <option key={t.id} value={t.id} disabled={!t.available}>
                          {t.label}{t.available ? '' : ' (no disponible)'}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {!tablesInZone.length && <p className="text-xs text-muted-foreground">Este restaurante todavía no tiene mesas configuradas — se asignará al confirmar.</p>}
              </div>
            )}

            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Notas (opcional)
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="resize-none rounded-lg border border-input bg-background p-3 text-sm" />
            </label>
            {error && <p role="alert" className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">{error}</p>}
            <button type="submit" disabled={saving} className="h-11 rounded-lg bg-[var(--brand)] text-sm font-medium text-white disabled:opacity-60">
              {saving ? 'Enviando…' : 'Solicitar reserva'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
