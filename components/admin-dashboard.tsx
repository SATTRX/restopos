"use client"

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  CircleDollarSign,
  ClipboardList,
  ExternalLink,
  LayoutDashboard,
  Menu,
  Receipt,
  Settings2,
  Store,
  UtensilsCrossed,
  Users,
  X,
} from 'lucide-react'

import { authClient } from '@/lib/auth-client'
import type { PlatformOverviewDTO, PlatformAccountDTO } from '@/app/actions/admin'
import { listAllUsers } from '@/app/actions/admin'

type Section = 'Resumen' | 'Restaurantes' | 'Cuentas' | 'Reportes'

const navItems: { label: Section; icon: typeof LayoutDashboard }[] = [
  { label: 'Resumen', icon: LayoutDashboard },
  { label: 'Restaurantes', icon: Store },
  { label: 'Cuentas', icon: Users },
  { label: 'Reportes', icon: BarChart3 },
]

const money = (cents: number) => `$ ${(cents / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function AdminDashboard({ userName, overview }: Readonly<{ userName: string; overview: PlatformOverviewDTO }>) {
  const [active, setActive] = useState<Section>('Resumen')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [accounts, setAccounts] = useState<PlatformAccountDTO[] | null>(null)
  const [accountsLoading, setAccountsLoading] = useState(false)
  const initials = useMemo(() => userName.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || 'A', [userName])
  const firstName = userName.trim().split(/\s+/)[0] || 'Administrador'

  const openSidebar = () => setSidebarOpen(true)
  const closeSidebar = () => setSidebarOpen(false)
  const handleNavSelect = (label: Section) => {
    setActive(label)
    setSidebarOpen(false)
    if (label === 'Cuentas' && !accounts && !accountsLoading) {
      setAccountsLoading(true)
      listAllUsers()
        .then(setAccounts)
        .catch(() => setAccounts([]))
        .finally(() => setAccountsLoading(false))
    }
  }
  const signOut = () => authClient.signOut({ fetchOptions: { onSuccess: () => window.location.assign('/acceso') } })

  return (
    <main className="min-h-screen bg-background text-foreground">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-sidebar transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-20 items-center gap-3 border-b border-sidebar-border px-6">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"> <UtensilsCrossed size={19} /> </div>
          <div>
            <p className="font-semibold tracking-tight">Mesa<span className="text-primary">Flow</span></p>
            <p className="text-[11px] text-muted-foreground">Panel de administrador</p>
          </div>
          <button type="button" aria-label="Cerrar menú" onClick={closeSidebar} className="ml-auto lg:hidden"><X size={18} /></button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-6">
          {navItems.map(({ label, icon: Icon }) => (
            <button type="button" key={label} onClick={() => handleNavSelect(label)} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${active === label ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}>
              <Icon size={17} />{label}
              {label === 'Restaurantes' && <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">{overview.restaurantCount}</span>}
            </button>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <button type="button" onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-sidebar-accent">
            <div className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">{initials}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{userName}</p>
              <p className="text-xs text-muted-foreground">Administrador</p>
            </div>
            <Settings2 size={16} className="text-muted-foreground" />
          </button>
        </div>
      </aside>

      {sidebarOpen && <button type="button" aria-label="Cerrar menú" onClick={closeSidebar} className="fixed inset-0 z-30 bg-foreground/20 lg:hidden" />}

      <section className="lg:pl-64">
        <header className="flex h-20 items-center justify-between border-b border-border bg-card/90 px-5 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <button type="button" aria-label="Abrir menú" onClick={openSidebar} className="lg:hidden"><Menu size={21} /></button>
            <div>
              <p className="text-xs text-muted-foreground">Vista general · Todos los restaurantes</p>
              <h1 className="text-xl font-semibold tracking-tight">{active}</h1>
            </div>
          </div>
          <div className="hidden size-9 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground sm:flex">{initials}</div>
        </header>

        <div className="mx-auto max-w-[1500px] p-5 md:p-8">
          {active === 'Resumen' && <Dashboard firstName={firstName} overview={overview} onSection={setActive} />}
          {active === 'Restaurantes' && <RestaurantsView restaurants={overview.restaurants} />}
          {active === 'Cuentas' && <AccountsView accounts={accounts} loading={accountsLoading} />}
          {active === 'Reportes' && <Reports overview={overview} />}
        </div>
      </section>
    </main>
  )
}

function Dashboard({ firstName, overview, onSection }: Readonly<{ firstName: string; overview: PlatformOverviewDTO; onSection: (s: Section) => void }>) {
  const tiles = [
    { label: 'Ventas de hoy', value: money(overview.todaySalesCents), icon: CircleDollarSign },
    { label: 'Pedidos de hoy', value: String(overview.todayOrders), icon: ClipboardList },
    { label: 'Ticket promedio', value: money(overview.avgTicketCents), icon: Receipt },
    { label: 'Stock crítico', value: String(overview.lowStockCount), icon: AlertTriangle },
  ]

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="mb-1 text-sm font-medium text-primary">Buenos días, {firstName}</p>
          <h2 className="text-3xl font-semibold tracking-tight text-balance">
            {overview.restaurantCount ? `Gestionando ${overview.restaurantCount} restaurante${overview.restaurantCount === 1 ? '' : 's'}.` : 'Todavía no hay restaurantes registrados.'}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">Datos en vivo desde Supabase, no una muestra.</p>
        </div>
        <button type="button" onClick={() => onSection('Restaurantes')} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
          <Store size={17} /> Ver restaurantes
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map(({ label, value, icon: Icon }, i) => (
          <div key={label} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{label}</p>
              <Icon size={18} className={i === 3 && overview.lowStockCount > 0 ? 'text-primary' : 'text-muted-foreground'} />
            </div>
            <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.45fr_1fr]">
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border p-5">
            <h3 className="font-semibold">Productos más vendidos</h3>
            <p className="mt-1 text-xs text-muted-foreground">Todos los restaurantes · según cuentas de mesa cobradas</p>
          </div>
          {overview.topProducts.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 font-medium">Producto</th>
                    <th className="px-5 py-3 font-medium">Vendidos</th>
                    <th className="px-5 py-3 font-medium">Ingresos</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.topProducts.map((p) => (
                    <tr key={p.productId} className="border-t border-border">
                      <td className="px-5 py-4 font-medium">{p.name}</td>
                      <td className="px-5 py-4">{p.quantitySold}</td>
                      <td className="px-5 py-4 text-muted-foreground">{money(p.revenueCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-5 text-sm text-muted-foreground">Todavía no hay cuentas de mesa cobradas en ningún restaurante.</p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-5 md:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Restaurantes</h3>
              <p className="mt-1 text-xs text-muted-foreground">Mesas ocupadas ahora mismo</p>
            </div>
            <span className="flex size-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">{overview.restaurantCount}</span>
          </div>

          <div className="mt-6 flex flex-col gap-4">
            {overview.restaurants.length ? (
              overview.restaurants.slice(0, 6).map((r) => (
                <div key={r.id} className="flex items-center gap-3">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.primaryColor }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {r.occupiedTables}/{r.totalTables} mesas
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Sin restaurantes todavía.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function RestaurantsView({ restaurants }: Readonly<{ restaurants: PlatformOverviewDTO['restaurants'] }>) {
  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="mb-1 text-sm font-medium text-primary">MesaFlow</p>
          <h2 className="text-3xl font-semibold tracking-tight">Restaurantes</h2>
          <p className="mt-2 text-sm text-muted-foreground">Cada uno gestiona su propia operación desde su cuenta.</p>
        </div>
      </div>

      {restaurants.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {restaurants.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-5">
              <div className="flex min-w-0 items-center gap-3">
                {r.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.logoUrl} alt="" className="size-10 rounded-lg object-cover" />
                ) : (
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg text-white" style={{ backgroundColor: r.primaryColor }}>
                    <UtensilsCrossed size={18} />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {r.occupiedTables}/{r.totalTables} mesas ocupadas
                  </p>
                </div>
              </div>
              <a href={`/carta/${r.slug}`} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted">
                <ExternalLink size={13} /> Carta
              </a>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Todavía no hay restaurantes registrados en la plataforma.</p>
      )}
    </div>
  )
}

function AccountsView({ accounts, loading }: Readonly<{ accounts: PlatformAccountDTO[] | null; loading: boolean }>) {
  const roleLabel: Record<string, string> = { admin: 'Administrador', restaurant: 'Restaurante' }

  return (
    <div className="flex flex-col gap-7">
      <div>
        <p className="mb-1 text-sm font-medium text-primary">MesaFlow</p>
        <h2 className="text-3xl font-semibold tracking-tight">Cuentas</h2>
        <p className="mt-2 text-sm text-muted-foreground">Todas las personas registradas en la plataforma.</p>
      </div>

      <div className="rounded-xl border border-border bg-card">
        {loading || !accounts ? (
          <p className="p-5 text-sm text-muted-foreground">Cargando…</p>
        ) : accounts.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Nombre</th>
                  <th className="px-5 py-3 font-medium">Correo</th>
                  <th className="px-5 py-3 font-medium">Rol</th>
                  <th className="px-5 py-3 font-medium">Restaurante</th>
                  <th className="px-5 py-3 font-medium">Verificado</th>
                  <th className="px-5 py-3 font-medium">Registrado</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="px-5 py-4 font-medium">{a.name}</td>
                    <td className="px-5 py-4 text-muted-foreground">{a.email}</td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${a.role === 'admin' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                        {roleLabel[a.role] ?? a.role}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{a.restaurantName ?? '—'}</td>
                    <td className="px-5 py-4">{a.emailVerified ? 'Sí' : 'No'}</td>
                    <td className="px-5 py-4 text-muted-foreground">{new Date(a.createdAt).toLocaleDateString('es-MX', { dateStyle: 'medium' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-5 text-sm text-muted-foreground">Todavía no hay cuentas registradas.</p>
        )}
      </div>
    </div>
  )
}

function Reports({ overview }: Readonly<{ overview: PlatformOverviewDTO }>) {
  return (
    <div className="flex flex-col gap-3">
      <p className="mb-1 text-sm font-medium text-primary">MesaFlow</p>
      <h2 className="text-3xl font-semibold tracking-tight">Reportes</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Reportes detallados por restaurante y por periodo están en camino. Por ahora, el resumen general está en "Resumen" (
        {overview.restaurantCount} restaurante{overview.restaurantCount === 1 ? '' : 's'}, {overview.todayOrders} pedidos hoy).
      </p>
    </div>
  )
}
