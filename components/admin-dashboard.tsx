"use client"

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Bell,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  LayoutDashboard,
  Menu,
  Package,
  Plus,
  Receipt,
  Search,
  Settings2,
  ShoppingBag,
  Store,
  UtensilsCrossed,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'

type Section = 'Resumen' | 'Punto de venta' | 'Inventario' | 'Carta' | 'Restaurantes' | 'Reportes' | 'Facturación'

type Product = { name: string; category: string; price: string; sold: number; status: string }

const navItems: { label: Section; icon: typeof LayoutDashboard }[] = [
  { label: 'Resumen', icon: LayoutDashboard },
  { label: 'Punto de venta', icon: ShoppingBag },
  { label: 'Inventario', icon: Package },
  { label: 'Carta', icon: UtensilsCrossed },
  { label: 'Restaurantes', icon: Store },
  { label: 'Reportes', icon: BarChart3 },
  { label: 'Facturación', icon: Receipt },
]

const sales = [42, 58, 48, 72, 63, 86, 74, 94, 82, 104, 97, 116]
const products: Product[] = [
  { name: 'Hamburguesa Clásica', category: 'Hamburguesas', price: '$ 12.50', sold: 84, status: 'Disponible' },
  { name: 'Bowl Mediterráneo', category: 'Bowls', price: '$ 10.00', sold: 63, status: 'Disponible' },
  { name: 'Tacos de Carnitas', category: 'Mexicana', price: '$ 9.50', sold: 52, status: 'Disponible' },
  { name: 'Limonada Natural', category: 'Bebidas', price: '$ 4.00', sold: 41, status: 'Poco stock' },
]

export default function AdminDashboard({ userName }: Readonly<{ userName: string }>) {
  const [active, setActive] = useState<Section>('Resumen')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [location, setLocation] = useState('Todas las sucursales')
  const [showSale, setShowSale] = useState(false)
  const [query, setQuery] = useState('')
  const filteredProducts = useMemo(() => products.filter((p: Product) => p.name.toLowerCase().includes(query.toLowerCase())), [query])
  const initials = useMemo(() => userName.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || 'A', [userName])
  const firstName = userName.trim().split(/\s+/)[0] || 'Administrador'

  const openSidebar = () => setSidebarOpen(true)
  const closeSidebar = () => setSidebarOpen(false)
  const handleNavSelect = (label: Section) => {
    setActive(label)
    setSidebarOpen(false)
  }
  const openSale = () => setShowSale(true)
  const closeSale = () => setShowSale(false)
  const signOut = () => authClient.signOut({ fetchOptions: { onSuccess: () => window.location.assign('/acceso') } })

  return (
    <main className="min-h-screen bg-background text-foreground">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-sidebar transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-20 items-center gap-3 border-b border-sidebar-border px-6">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"> <UtensilsCrossed size={19} /> </div>
          <div>
            <p className="font-semibold tracking-tight">Mesa<span className="text-primary">Flow</span></p>
            <p className="text-[11px] text-muted-foreground">Operaciones gastronómicas</p>
          </div>
          <button type="button" aria-label="Cerrar menú" onClick={closeSidebar} className="ml-auto lg:hidden"><X size={18} /></button>
        </div>

        <div className="flex flex-1 flex-col gap-7 px-3 py-6">
          <div>
            <p className="px-3 pb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Operación</p>
            <nav className="flex flex-col gap-1">
              {navItems.slice(0, 4).map(({ label, icon: Icon }) => (
                <button type="button" key={label} onClick={() => handleNavSelect(label)} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${active === label ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}>
                  <Icon size={17} />{label}
                  {label === 'Inventario' && <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">3</span>}
                </button>
              ))}
            </nav>
          </div>

          <div>
            <p className="px-3 pb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Administración</p>
            <nav className="flex flex-col gap-1">
              {navItems.slice(4).map(({ label, icon: Icon }) => (
                <button type="button" key={label} onClick={() => handleNavSelect(label)} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${active === label ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}>
                  <Icon size={17} />{label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        <div className="border-t border-sidebar-border p-3">
          <button type="button" onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-sidebar-accent">
            <div className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">{initials}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{userName}</p>
              <p className="text-xs text-muted-foreground">Administradora</p>
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
              <p className="text-xs text-muted-foreground">Jueves, 21 de agosto de 2026</p>
              <h1 className="text-xl font-semibold tracking-tight">{active}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative hidden md:block">
              <Store size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <select value={location} onChange={(e) => setLocation(e.target.value)} className="h-10 w-52 appearance-none rounded-lg border border-input bg-background pl-9 pr-8 text-sm outline-none focus:ring-2 focus:ring-ring">
                <option>Todas las sucursales</option>
                <option>Roma Norte</option>
                <option>Polanco</option>
                <option>Condesa</option>
              </select>
              <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            </div>

            <button type="button" aria-label="Notificaciones" className="relative flex size-10 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted">
              <Bell size={17} />
              <span className="absolute right-2 top-2 size-1.5 rounded-full bg-primary" />
            </button>

            <div className="hidden size-9 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground sm:flex">{initials}</div>
          </div>
        </header>

        <div className="mx-auto max-w-[1500px] p-5 md:p-8">
          {active === 'Resumen' ? <Dashboard firstName={firstName} onSale={openSale} /> : <ModuleView active={active} query={query} setQuery={setQuery} products={filteredProducts} onSale={openSale} />}
        </div>
      </section>

      {showSale && <SaleDrawer onClose={closeSale} />}
    </main>
  )
}

function Dashboard({ firstName, onSale }: Readonly<{ firstName: string; onSale: () => void }>) {
  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="mb-1 text-sm font-medium text-primary">Buenos días, {firstName}</p>
          <h2 className="text-3xl font-semibold tracking-tight text-balance">Todo en orden para hoy.</h2>
          <p className="mt-2 text-sm text-muted-foreground">Aquí tienes el pulso de tus operaciones.</p>
        </div>
        <Button type="button" onClick={onSale} aria-label="Nueva venta" className="inline-flex h-11 items-center justify-center gap-2 px-4">
          <Plus size={17} /> Nueva venta
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[{ label: 'Ventas de hoy', value: '$ 18,642', change: '+12.8%', icon: CircleDollarSign }, { label: 'Pedidos', value: '284', change: '+8.4%', icon: ClipboardList }, { label: 'Ticket promedio', value: '$ 65.64', change: '+4.2%', icon: Receipt }, { label: 'Stock crítico', value: '3', change: 'Requiere atención', icon: AlertTriangle }].map(({ label, value, change, icon: Icon }, i) => (
          <div key={label} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{label}</p>
              <Icon size={18} className={i === 3 ? 'text-primary' : 'text-muted-foreground'} />
            </div>
            <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
            <div className={`mt-2 flex items-center gap-1 text-xs font-medium ${i === 3 ? 'text-primary' : 'text-muted-foreground'}`}>
              {i < 3 && <ArrowUpRight size={13} />}
              {i === 3 ? 'Revisar inventario' : `${change} vs. ayer`}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.45fr_1fr]">
        <div className="rounded-xl border border-border bg-card p-5 md:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Rendimiento de ventas</h3>
              <p className="mt-1 text-xs text-muted-foreground">Ventas netas · Últimos 12 días</p>
            </div>
            <button type="button" className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">Últimos 12 días</button>
          </div>

          <div className="mt-8 flex h-48 items-end gap-2 sm:gap-4">
            {(() => {
              const labels = ['10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', 'Hoy']
              return sales.map((height, i) => {
                const label = labels[i] ?? String(i)
                return (
                  <div key={label} className="flex flex-1 flex-col items-center gap-2">
                    <div className={`w-full rounded-t-md transition hover:opacity-80 ${i === sales.length - 1 ? 'bg-primary' : 'bg-primary/15'}`} style={{ height: `${height}%` }} />
                    <span className="text-[10px] text-muted-foreground">{label}</span>
                  </div>
                )
              })
            })()}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 md:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Alertas</h3>
              <p className="mt-1 text-xs text-muted-foreground">Requieren tu atención</p>
            </div>
            <span className="flex size-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">3</span>
          </div>

          <div className="mt-6 flex flex-col gap-4">
            {[['Stock bajo', 'Limonada Natural', 'Quedan 8 unidades'], ['Factura pendiente', 'Pedido #1048', 'Hace 18 minutos'], ['Cambio de turno', 'Caja 02', 'En 32 minutos']].map(([title, detail, time]) => (
              <div key={title} className="flex gap-3">
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-primary"><AlertTriangle size={15} /></div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{title}</p>
                  <p className="truncate text-xs text-muted-foreground">{detail}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-5">
          <div>
            <h3 className="font-semibold">Productos más vendidos</h3>
            <p className="mt-1 text-xs text-muted-foreground">Hoy · Todas las sucursales</p>
          </div>
          <button type="button" className="text-xs font-medium text-primary hover:underline">Ver reporte</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Producto</th>
                <th className="px-5 py-3 font-medium">Categoría</th>
                <th className="px-5 py-3 font-medium">Precio</th>
                <th className="px-5 py-3 font-medium">Vendidos</th>
                <th className="px-5 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.name} className="border-t border-border">
                  <td className="px-5 py-4 font-medium">{p.name}</td>
                  <td className="px-5 py-4 text-muted-foreground">{p.category}</td>
                  <td className="px-5 py-4">{p.price}</td>
                  <td className="px-5 py-4">{p.sold}</td>
                  <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${p.status === 'Disponible' ? 'bg-muted text-muted-foreground' : 'bg-accent text-accent-foreground'}`}>{p.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function ModuleView({ active, query, setQuery, products, onSale }: Readonly<{ active: Section; query: string; setQuery: (v: string) => void; products: Product[]; onSale: () => void }>) {
  const copy: Record<Section, [string, string]> = {
    'Punto de venta': ['Caja y pedidos', 'Toma pedidos, gestiona mesas y cobra en segundos.'],
    Inventario: ['Control de inventario', 'Existencias, costos y movimientos en tiempo real.'],
    Carta: ['Carta digital', 'Personaliza productos, precios y disponibilidad.'],
    Restaurantes: ['Tus restaurantes', 'Administra grupos, sucursales y equipos.'],
    Reportes: ['Reportes y análisis', 'Entiende el rendimiento de cada operación.'],
    Facturación: ['Facturación', 'Documentos fiscales y comprobantes de tus ventas.'],
    Resumen: ['Resumen', ''],
  }
  const [title, description] = copy[active]

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="mb-1 text-sm font-medium text-primary">{active === 'Inventario' ? '3 alertas activas' : 'MesaFlow'}</p>
          <h2 className="text-3xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        </div>

        <Button type="button" onClick={onSale} aria-label={active === 'Punto de venta' ? 'Nueva venta' : 'Agregar nuevo'} className="inline-flex h-11 items-center justify-center gap-2 px-4">
          <Plus size={17} /> {active === 'Punto de venta' ? 'Nueva venta' : 'Agregar nuevo'}
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar productos, pedidos o registros..." className="h-11 w-full rounded-lg border border-input bg-card pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>

        <button type="button" className="h-11 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted">Filtros <ChevronDown size={15} className="ml-1 inline" /></button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[['Ventas del periodo', '$ 84,290'], ['Registros activos', active === 'Inventario' ? '128 insumos' : '246 elementos'], ['Rendimiento', '+18.6%']].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground"><ArrowUpRight size={13} className="mr-1 inline text-primary" />vs. periodo anterior</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-5">
          {(() => {
            let headerTitle = 'Actividad reciente'
            if (active === 'Carta') headerTitle = 'Productos de la carta'
            else if (active === 'Inventario') headerTitle = 'Insumos y existencias'
            else if (active === 'Restaurantes') headerTitle = 'Restaurantes y sucursales'
            return <h3 className="font-semibold">{headerTitle}</h3>
          })()}
          <button type="button" className="text-xs font-medium text-primary">Exportar CSV</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Nombre</th>
                <th className="px-5 py-3 font-medium">Categoría</th>
                <th className="px-5 py-3 font-medium">Valor</th>
                <th className="px-5 py-3 font-medium">Estado</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.name} className="border-t border-border">
                  <td className="px-5 py-4 font-medium">{p.name}</td>
                  <td className="px-5 py-4 text-muted-foreground">{p.category}</td>
                  <td className="px-5 py-4">{active === 'Inventario' ? `${p.sold + 20} unidades` : p.price}</td>
                  <td className="px-5 py-4"><span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">{p.status}</span></td>
                  <td className="px-5 py-4 text-right"><button type="button" className="text-xs font-medium text-primary">Ver detalle</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function SaleDrawer({ onClose }: Readonly<{ onClose: () => void }>) {
  const [cart, setCart] = useState([{ name: 'Hamburguesa Clásica', price: 12.5, qty: 1 }, { name: 'Limonada Natural', price: 4, qty: 2 }])
  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0)
  const removeItem = (index: number) => setCart((current) => current.filter((_, i) => i !== index))

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-foreground/20">
      <div className="flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border p-5">
          <div>
            <p className="text-xs text-primary">Nueva orden · Mesa 12</p>
            <h2 className="mt-1 text-xl font-semibold">Crear venta</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar venta" className="rounded-lg p-2 hover:bg-muted"><X size={18} /></button>
        </div>

        <div className="flex-1 p-5">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input placeholder="Buscar en la carta..." className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </div>

          <div className="mt-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Orden actual</p>
              <span className="text-xs text-muted-foreground">{cart.length} productos</span>
            </div>

            {cart.map((item, i) => (
              <div key={item.name} className="flex items-center justify-between gap-3 border-b border-border pb-4">
                <div>
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.qty} × $ {item.price.toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-semibold">$ {(item.qty * item.price).toFixed(2)}</p>
                  <button type="button" onClick={() => removeItem(i)} className="text-muted-foreground hover:text-primary"><X size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-border p-5">
          <div className="flex items-center justify-between text-sm text-muted-foreground"><span>Subtotal</span><span>$ {total.toFixed(2)}</span></div>
          <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground"><span>Impuestos</span><span>$ {(total * 0.16).toFixed(2)}</span></div>
          <div className="mt-4 flex items-center justify-between text-lg font-semibold"><span>Total</span><span>$ {(total * 1.16).toFixed(2)}</span></div>
          <button type="button" onClick={onClose} className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:opacity-90"><Receipt size={16} /> Cobrar venta</button>
        </div>
      </div>
    </div>
  )
}
