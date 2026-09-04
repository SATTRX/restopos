'use client'

import { useMemo, useState, type FormEvent } from 'react'
import {
  BarChart3,
  Check,
  ChevronLeft,
  ClipboardList,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  LogOut,
  Menu,
  Minus,
  Package,
  Palette,
  Pencil,
  Plus,
  Receipt,
  ShoppingBag,
  Trash2,
  TrendingUp,
  UtensilsCrossed,
  X,
} from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { saveCurrentRestaurantBranding, saveTaxSettings } from '@/app/actions/restaurant'
import { registerSale } from '@/app/actions/operations'
import { addTable, addTableItem, changeTableItemQuantity, chargeTable, removeTableItem, sendComanda, type ComandaItem, type OrderItemDTO, type TableDTO } from '@/app/actions/tables'
import { addMenuProduct, deleteMenuProduct, updateMenuProduct, type MenuDTO, type MenuProductDTO } from '@/app/actions/menu'
import { addInventoryItem, deleteInventoryItem, type InventoryItemDTO } from '@/app/actions/inventory'
import { getRestaurantStats, type RestaurantStatsDTO } from '@/app/actions/stats'
import { addShiftExpense, closeShift, getActiveShift, getShiftSummary, listShiftHistory, openShift, type ShiftDTO, type ShiftSummaryDTO } from '@/app/actions/shifts'
import { listRecentSales, type SaleSummaryDTO } from '@/app/actions/receipts'
import { COMMON_PRODUCT_TAGS } from '@/lib/menu-tags'

type Section = 'Inicio' | 'Punto de venta' | 'Carta' | 'Inventario' | 'Facturación' | 'Estadísticas'
type ProductInput = { name: string; description: string; priceCents: number; categoryName: string; tags: string[] }
type Product = { id: string; name: string; category: string; price: number }
type CartLine = { id: string; qty: number }
type TaxSettings = { taxId: string; currency: string; taxRatePercent: number }
// Normalized shape the <Cart> renderer works with, regardless of whether the
// lines come from a DB-backed table order or the local quick-sale cart.
type CartLineView = { id: string; name: string; unitPrice: number; quantity: number }

const PRESET_COLORS = ['#c86b4a', '#2f6f86', '#4d7c55', '#8a4f9e', '#b5453f', '#1c1c1c']

function menuToProducts(menu: MenuDTO): Product[] {
  return menu.products.filter((p) => p.isAvailable).map((p) => ({ id: p.id, name: p.name, category: p.categoryName, price: p.priceCents / 100 }))
}

function productById(products: Product[], id: string) {
  return products.find((p) => p.id === id)!
}

function cartTotal(products: Product[], cart: CartLine[]) {
  return cart.reduce((sum, line) => sum + productById(products, line.id).price * line.qty, 0)
}

function addToCart(cart: CartLine[], id: string): CartLine[] {
  return cart.some((line) => line.id === id)
    ? cart.map((line) => (line.id === id ? { ...line, qty: line.qty + 1 } : line))
    : [...cart, { id, qty: 1 }]
}

function incrementLine(cart: CartLine[], id: string): CartLine[] {
  return cart.map((line) => (line.id === id ? { ...line, qty: line.qty + 1 } : line))
}

function decrementLine(cart: CartLine[], id: string): CartLine[] {
  return cart.flatMap((line) => {
    if (line.id !== id) return [line]
    return line.qty <= 1 ? [] : [{ ...line, qty: line.qty - 1 }]
  })
}

function removeLine(cart: CartLine[], id: string): CartLine[] {
  return cart.filter((line) => line.id !== id)
}

// Picks readable text (near-black or white) for a given brand background color
// so a light custom color (e.g. yellow) never renders invisible white text.
function contrastFor(hex: string): string {
  const value = hex.replace('#', '')
  if (value.length !== 6) return '#ffffff'
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#1c1c1c' : '#ffffff'
}

function initialsOf(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || 'R'
  )
}

function orderItemsTotal(items: OrderItemDTO[]) {
  return items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0) / 100
}

function orderItemsToLines(items: OrderItemDTO[]): CartLineView[] {
  return items.map((i) => ({ id: i.id, name: i.productName, unitPrice: i.unitPriceCents / 100, quantity: i.quantity }))
}

function quickCartToLines(products: Product[], cart: CartLine[]): CartLineView[] {
  return cart.map((l) => {
    const p = productById(products, l.id)
    return { id: l.id, name: p.name, unitPrice: p.price, quantity: l.qty }
  })
}

// Downscales an uploaded image client-side and returns it as a data URL, so a
// logo can be stored directly in Postgres without needing object storage.
function resizeImageFile(file: File, maxDim = 480, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('No se pudo procesar la imagen'))
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('Canvas no soportado')); return }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

export default function RestaurantWorkspace({
  initialName,
  initialAccent,
  initialReceiptFooter,
  initialLogoUrl,
  initialTaxSettings,
  restaurantSlug,
  initialTables,
  initialMenu,
  initialInventory,
  initialShift,
  userName,
}: Readonly<{
  initialName: string
  initialAccent: string
  initialReceiptFooter?: string
  initialLogoUrl?: string
  initialTaxSettings: TaxSettings
  restaurantSlug: string
  initialTables: TableDTO[]
  initialMenu: MenuDTO
  initialInventory: InventoryItemDTO[]
  initialShift: ShiftDTO | null
  userName: string
}>) {
  const [section, setSection] = useState<Section>('Inicio')
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [name, setName] = useState(initialName)
  const [accent, setAccent] = useState(initialAccent)
  const [receiptFooter, setReceiptFooter] = useState(initialReceiptFooter ?? '')
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl ?? '')
  const [showWatermark, setShowWatermark] = useState(true)
  const [notice, setNotice] = useState('')
  const [quickSaleOpen, setQuickSaleOpen] = useState(false)
  const [quickCart, setQuickCart] = useState<CartLine[]>([])
  // Tables/orders, menu and inventory are all persisted in Supabase; each
  // mirrors the server's view and is refreshed with the result of every mutation.
  const [tables, setTables] = useState<TableDTO[]>(initialTables)
  const [activeTableId, setActiveTableId] = useState<string | null>(null)
  const [menu, setMenu] = useState<MenuDTO>(initialMenu)
  const [productModal, setProductModal] = useState<{ product?: MenuProductDTO } | null>(null)
  const [inventory, setInventory] = useState<InventoryItemDTO[]>(initialInventory)
  const [inventoryModalOpen, setInventoryModalOpen] = useState(false)
  const [taxSettings, setTaxSettings] = useState<TaxSettings>(initialTaxSettings)
  const [taxModalOpen, setTaxModalOpen] = useState(false)
  const [stats, setStats] = useState<RestaurantStatsDTO | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [shift, setShift] = useState<ShiftDTO | null>(initialShift)
  const [shiftModal, setShiftModal] = useState<'open' | null>(null)
  const [closeShiftSummary, setCloseShiftSummary] = useState<ShiftSummaryDTO | null>(null)
  const [closeShiftLoading, setCloseShiftLoading] = useState(false)
  const [expenseModalOpen, setExpenseModalOpen] = useState(false)
  const [comanda, setComanda] = useState<{ tableLabel: string; items: ComandaItem[]; sentAt: string; shiftOpenedByName: string | null } | null>(null)
  const [recentSales, setRecentSales] = useState<SaleSummaryDTO[] | null>(null)
  const [salesLoading, setSalesLoading] = useState(false)
  const [shiftHistory, setShiftHistory] = useState<ShiftDTO[] | null>(null)

  const brandForeground = useMemo(() => contrastFor(accent), [accent])
  const initials = useMemo(() => initialsOf(name), [name])
  const brandStyle = { '--brand': accent, '--brand-foreground': brandForeground } as React.CSSProperties
  const availableProducts = useMemo(() => menuToProducts(menu), [menu])

  const flashNotice = (message: string) => {
    setNotice(message)
    setTimeout(() => setNotice(''), 2500)
  }

  const activeTable = tables.find((t) => t.id === activeTableId) ?? null

  // Table/order mutations update local state immediately (optimistic) so the
  // POS feels instant, then reconcile with the authoritative server result;
  // on failure the pre-mutation snapshot is restored.
  const applyTableUpdate = (tableId: string, updater: (items: OrderItemDTO[]) => OrderItemDTO[]) => (current: TableDTO[]) =>
    current.map((t) => (t.id === tableId ? { ...t, items: updater(t.items) } : t))

  const runOptimisticTable = (optimistic: (current: TableDTO[]) => TableDTO[], action: () => Promise<TableDTO[]>, errorMessage: string) => {
    const previous = tables
    setTables(optimistic)
    action()
      .then(setTables)
      .catch(() => {
        setTables(previous)
        flashNotice(errorMessage)
      })
  }

  const handleAddTable = () => {
    const previous = tables
    const tempId = `temp-table-${Date.now()}`
    setTables((current) => [...current, { id: tempId, label: `Mesa ${current.length + 1}`, orderId: null, items: [] }])
    addTable()
      .then(setTables)
      .catch(() => {
        setTables(previous)
        flashNotice('No se pudo agregar la mesa')
      })
  }

  const handleAddToTable = (tableId: string, product: Product) => {
    const unitPriceCents = Math.round(product.price * 100)
    runOptimisticTable(
      applyTableUpdate(tableId, (items) => {
        const existing = items.find((i) => i.productId === product.id)
        if (existing) return items.map((i) => (i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i))
        return [...items, { id: `temp-${product.id}-${Date.now()}`, productId: product.id, productName: product.name, unitPriceCents, quantity: 1, sentToKitchenAt: null }]
      }),
      () => addTableItem({ tableId, productId: product.id, productName: product.name, unitPriceCents }),
      'No se pudo agregar el producto',
    )
  }

  const handleIncrementTableItem = (tableId: string, itemId: string) =>
    runOptimisticTable(
      applyTableUpdate(tableId, (items) => items.map((i) => (i.id === itemId ? { ...i, quantity: i.quantity + 1 } : i))),
      () => changeTableItemQuantity(itemId, 1),
      'No se pudo actualizar la cantidad',
    )

  const handleDecrementTableItem = (tableId: string, itemId: string) =>
    runOptimisticTable(
      applyTableUpdate(tableId, (items) => items.flatMap((i) => (i.id === itemId ? (i.quantity <= 1 ? [] : [{ ...i, quantity: i.quantity - 1 }]) : [i]))),
      () => changeTableItemQuantity(itemId, -1),
      'No se pudo actualizar la cantidad',
    )

  const handleRemoveTableItem = (tableId: string, itemId: string) =>
    runOptimisticTable(
      applyTableUpdate(tableId, (items) => items.filter((i) => i.id !== itemId)),
      () => removeTableItem(itemId),
      'No se pudo quitar el producto',
    )

  const payTable = (tableId: string, label: string) => {
    const previous = tables
    setTables((current) => current.map((t) => (t.id === tableId ? { ...t, items: [] } : t)))
    setActiveTableId(null)
    chargeTable(tableId)
      .then(({ tables: updated, saleId }) => {
        setTables(updated)
        flashNotice(`${label} cobrada correctamente`)
        window.open(`/boleta/${saleId}`, '_blank', 'noopener')
      })
      .catch((err) => {
        setTables(previous)
        setActiveTableId(tableId)
        flashNotice(err instanceof Error ? err.message : 'No se pudo cobrar la mesa')
      })
  }

  const payQuickSale = async () => {
    if (!quickCart.length) return
    try {
      const { id: saleId } = await registerSale({ totalCents: Math.round(cartTotal(availableProducts, quickCart) * 100), paymentMethod: 'cash' })
      setQuickCart([])
      setQuickSaleOpen(false)
      flashNotice('Venta registrada correctamente')
      window.open(`/boleta/${saleId}`, '_blank', 'noopener')
    } catch (err) {
      flashNotice(err instanceof Error ? err.message : 'No se pudo registrar la venta')
    }
  }

  const handleSendComanda = (tableId: string, tableLabel: string) => {
    sendComanda(tableId)
      .then(({ tables: updated, items, sentAt, shiftOpenedByName }) => {
        setTables(updated)
        setComanda({ tableLabel, items, sentAt, shiftOpenedByName })
      })
      .catch((err) => flashNotice(err instanceof Error ? err.message : 'No se pudo enviar la comanda'))
  }

  const handleOpenShift = async (openingCashCents: number) => {
    const opened = await openShift(openingCashCents)
    setShift(opened)
    setShiftModal(null)
    flashNotice('Turno abierto')
  }

  const openCloseShift = () => {
    setCloseShiftLoading(true)
    getShiftSummary()
      .then(setCloseShiftSummary)
      .catch(() => flashNotice('No se pudo cargar el resumen del turno'))
      .finally(() => setCloseShiftLoading(false))
  }

  const handleAddExpense = async (amountCents: number, description: string) => {
    const summary = await addShiftExpense({ amountCents, description })
    setCloseShiftSummary(summary)
    setExpenseModalOpen(false)
    flashNotice('Gasto registrado')
  }

  const handleCloseShift = async (closingCashCents: number) => {
    const closed = await closeShift(closingCashCents)
    setShift(null)
    setCloseShiftSummary(null)
    const sign = closed.differenceCents !== null && closed.differenceCents < 0 ? '-' : ''
    flashNotice(closed.differenceCents ? `Turno cerrado · diferencia ${sign}$${Math.abs(closed.differenceCents / 100).toFixed(2)}` : 'Turno cerrado sin diferencias')
  }

  const saveBranding = async () => {
    try {
      await saveCurrentRestaurantBranding({ name, primaryColor: accent, receiptFooter, logoUrl: logoUrl || undefined })
      flashNotice('Cambios guardados en Supabase')
      setSettingsOpen(false)
    } catch {
      flashNotice('No se pudo guardar la personalización')
    }
  }

  const handleLogoFile = async (file: File) => {
    try {
      setLogoUrl(await resizeImageFile(file))
    } catch {
      flashNotice('No se pudo procesar la imagen')
    }
  }

  const handleAddProduct = async (input: ProductInput) => {
    setMenu(await addMenuProduct(input))
  }

  const handleUpdateProduct = async (id: string, patch: ProductInput) => {
    setMenu(await updateMenuProduct(id, patch))
  }

  const handleToggleAvailability = async (product: MenuProductDTO) => {
    try {
      setMenu(await updateMenuProduct(product.id, { isAvailable: !product.isAvailable }))
    } catch {
      flashNotice('No se pudo actualizar el producto')
    }
  }

  const handleDeleteProduct = async (product: MenuProductDTO) => {
    try {
      setMenu(await deleteMenuProduct(product.id))
    } catch {
      flashNotice('No se pudo eliminar el producto')
    }
  }

  const handleAddInventoryItem = async (input: { name: string; unit: string; stock: number; minimumStock: number; costCents: number }) => {
    setInventory(await addInventoryItem(input))
  }

  const handleDeleteInventoryItem = async (item: InventoryItemDTO) => {
    try {
      setInventory(await deleteInventoryItem(item.id))
    } catch {
      flashNotice('No se pudo eliminar el insumo')
    }
  }

  const handleSaveTaxSettings = async (input: TaxSettings) => {
    await saveTaxSettings(input)
    setTaxSettings(input)
    flashNotice('Configuración fiscal guardada')
  }

  const signOut = () => authClient.signOut({ fetchOptions: { onSuccess: () => window.location.assign('/acceso') } })

  const nav: { label: Section; icon: typeof BarChart3 }[] = [
    { label: 'Inicio', icon: BarChart3 },
    { label: 'Punto de venta', icon: ShoppingBag },
    { label: 'Carta', icon: UtensilsCrossed },
    { label: 'Inventario', icon: Package },
    { label: 'Estadísticas', icon: TrendingUp },
    { label: 'Facturación', icon: Receipt },
  ]

  const goToSection = (s: Section) => {
    setSection(s)
    setMenuOpen(false)
    if (s !== 'Punto de venta') setActiveTableId(null)
    if (s === 'Estadísticas' && !stats && !statsLoading) {
      setStatsLoading(true)
      Promise.all([getRestaurantStats(), listShiftHistory()])
        .then(([s, h]) => {
          setStats(s)
          setShiftHistory(h)
        })
        .catch(() => flashNotice('No se pudieron cargar las estadísticas'))
        .finally(() => setStatsLoading(false))
    }
    if (s === 'Facturación' && !recentSales && !salesLoading) {
      setSalesLoading(true)
      listRecentSales()
        .then(setRecentSales)
        .catch(() => flashNotice('No se pudieron cargar las boletas'))
        .finally(() => setSalesLoading(false))
    }
  }

  const occupiedTables = tables.filter((t) => t.items.length > 0).length

  return (
    <main style={brandStyle} className="relative min-h-screen bg-background text-foreground">
      {showWatermark && <Watermark text={name} logoUrl={logoUrl} />}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-sidebar transition-transform lg:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-20 items-center gap-3 border-b border-sidebar-border px-6">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="size-9 rounded-xl object-cover" />
          ) : (
            <div className="flex size-9 items-center justify-center rounded-xl bg-[var(--brand)] text-[var(--brand-foreground)]">
              <UtensilsCrossed size={18} />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate font-semibold">{name}</p>
            <p className="text-[11px] text-muted-foreground">Workspace restaurante</p>
          </div>
          <button type="button" aria-label="Cerrar menú" className="ml-auto lg:hidden" onClick={() => setMenuOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-6">
          {nav.map(({ label, icon: Icon }) => (
            <button
              type="button"
              key={label}
              onClick={() => goToSection(label)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${section === label ? 'bg-[var(--brand)] text-[var(--brand-foreground)]' : 'text-muted-foreground hover:bg-sidebar-accent'}`}
            >
              <Icon size={17} />
              {label}
              {label === 'Punto de venta' && occupiedTables > 0 && (
                <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
                  {occupiedTables}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex w-full items-center gap-3 rounded-lg p-3 text-left hover:bg-sidebar-accent"
          >
            <div className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-semibold">{initials}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{userName}</p>
              <p className="text-xs text-muted-foreground">Configuración</p>
            </div>
            <Palette size={16} />
          </button>
        </div>
      </aside>

      {menuOpen && (
        <button type="button" aria-label="Cerrar menú" className="fixed inset-0 z-30 bg-foreground/20 lg:hidden" onClick={() => setMenuOpen(false)} />
      )}

      <section className="relative z-10 lg:pl-64">
        <header className="flex h-20 items-center justify-between border-b border-border bg-card/90 px-5 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <button type="button" aria-label="Abrir menú" className="lg:hidden" onClick={() => setMenuOpen(true)}>
              <Menu size={21} />
            </button>
            <div>
              <p className="text-xs text-muted-foreground">Sucursal principal · Operación</p>
              <h1 className="text-xl font-semibold tracking-tight">{section}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ShiftBadge shift={shift} onOpen={() => setShiftModal('open')} onClose={openCloseShift} onAddExpense={() => setExpenseModalOpen(true)} />
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="hidden items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm sm:flex"
            >
              <Palette size={15} /> Personalizar
            </button>
            <button aria-label="Cerrar sesión" onClick={signOut} className="flex size-10 items-center justify-center rounded-lg border border-border">
              <LogOut size={16} />
            </button>
          </div>
        </header>

        <div className="mx-auto max-w-[1400px] p-5 md:p-8">
          {section === 'Inicio' && (
            <Home name={name} occupiedTables={occupiedTables} totalTables={tables.length} onQuickSale={() => setQuickSaleOpen(true)} onSection={goToSection} />
          )}

          {section === 'Punto de venta' &&
            (!shift ? (
              <ShiftRequired onOpen={() => setShiftModal('open')} />
            ) : activeTable ? (
              <TableOrder
                table={activeTable}
                products={availableProducts}
                onBack={() => setActiveTableId(null)}
                onAdd={(product) => handleAddToTable(activeTable.id, product)}
                onIncrement={(itemId) => handleIncrementTableItem(activeTable.id, itemId)}
                onDecrement={(itemId) => handleDecrementTableItem(activeTable.id, itemId)}
                onRemove={(itemId) => handleRemoveTableItem(activeTable.id, itemId)}
                onPay={() => payTable(activeTable.id, activeTable.label)}
                onSendComanda={() => handleSendComanda(activeTable.id, activeTable.label)}
              />
            ) : (
              <TableGrid tables={tables} onSelect={setActiveTableId} onAddTable={handleAddTable} />
            ))}

          {section === 'Carta' && (
            <Catalog
              menu={menu}
              restaurantSlug={restaurantSlug}
              onOpenCreate={() => setProductModal({})}
              onEdit={(product) => setProductModal({ product })}
              onToggleAvailability={handleToggleAvailability}
              onDelete={handleDeleteProduct}
            />
          )}
          {section === 'Inventario' && <Inventory items={inventory} onOpenCreate={() => setInventoryModalOpen(true)} onDelete={handleDeleteInventoryItem} />}
          {section === 'Estadísticas' && <Stats stats={stats} shiftHistory={shiftHistory} loading={statsLoading} />}
          {section === 'Facturación' && <Billing taxSettings={taxSettings} sales={recentSales} salesLoading={salesLoading} onOpenSettings={() => setTaxModalOpen(true)} />}
        </div>
      </section>

      {notice && <div className="fixed bottom-5 right-5 z-50 rounded-lg bg-foreground px-4 py-3 text-sm text-background">{notice}</div>}

      {settingsOpen && (
        <SettingsDialog
          name={name}
          setName={setName}
          accent={accent}
          setAccent={setAccent}
          receiptFooter={receiptFooter}
          setReceiptFooter={setReceiptFooter}
          logoUrl={logoUrl}
          onLogoFile={handleLogoFile}
          onRemoveLogo={() => setLogoUrl('')}
          showWatermark={showWatermark}
          setShowWatermark={setShowWatermark}
          onClose={() => setSettingsOpen(false)}
          onSave={saveBranding}
        />
      )}

      {quickSaleOpen && (
        <QuickSaleDrawer
          products={availableProducts}
          cart={quickCart}
          onAdd={(id) => setQuickCart((c) => addToCart(c, id))}
          onIncrement={(id) => setQuickCart((c) => incrementLine(c, id))}
          onDecrement={(id) => setQuickCart((c) => decrementLine(c, id))}
          onRemove={(id) => setQuickCart((c) => removeLine(c, id))}
          onClose={() => setQuickSaleOpen(false)}
          onPay={payQuickSale}
        />
      )}

      {productModal && (
        <ProductFormModal
          initial={productModal.product}
          categories={menu.categories.map((c) => c.name)}
          onClose={() => setProductModal(null)}
          onSubmit={(input) => (productModal.product ? handleUpdateProduct(productModal.product.id, input) : handleAddProduct(input))}
        />
      )}

      {inventoryModalOpen && <InventoryFormModal onClose={() => setInventoryModalOpen(false)} onSubmit={handleAddInventoryItem} />}

      {taxModalOpen && <TaxSettingsModal initial={taxSettings} onClose={() => setTaxModalOpen(false)} onSubmit={handleSaveTaxSettings} />}

      {shiftModal === 'open' && <OpenShiftModal onClose={() => setShiftModal(null)} onSubmit={handleOpenShift} />}
      {(closeShiftLoading || closeShiftSummary) && (
        <CloseShiftModal
          summary={closeShiftSummary}
          loading={closeShiftLoading}
          onClose={() => setCloseShiftSummary(null)}
          onAddExpense={() => setExpenseModalOpen(true)}
          onSubmit={handleCloseShift}
        />
      )}
      {expenseModalOpen && <ExpenseModal onClose={() => setExpenseModalOpen(false)} onSubmit={handleAddExpense} />}

      {comanda && (
        <ComandaModal tableLabel={comanda.tableLabel} items={comanda.items} sentAt={comanda.sentAt} shiftOpenedByName={comanda.shiftOpenedByName} onClose={() => setComanda(null)} />
      )}
    </main>
  )
}

function Watermark({ text, logoUrl }: Readonly<{ text: string; logoUrl?: string }>) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 flex select-none items-center justify-center overflow-hidden">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" style={{ width: 'min(46vw, 520px)', height: 'auto', transform: 'rotate(-6deg)' }} className="opacity-[0.06]" />
      ) : (
        <span
          className="whitespace-nowrap font-black uppercase tracking-tight text-[var(--brand)] opacity-[0.05]"
          style={{ fontSize: 'min(22vw, 260px)', transform: 'rotate(-8deg)' }}
        >
          {text}
        </span>
      )}
    </div>
  )
}

function SectionHeader({ title, subtitle, action }: Readonly<{ title: string; subtitle: string; action?: React.ReactNode }>) {
  return (
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div>
        <p className="mb-1 text-sm font-medium text-[var(--brand)]">{subtitle}</p>
        <h2 className="text-3xl font-semibold tracking-tight">{title}</h2>
      </div>
      {action}
    </div>
  )
}

function Home({
  name,
  occupiedTables,
  totalTables,
  onQuickSale,
  onSection,
}: Readonly<{ name: string; occupiedTables: number; totalTables: number; onQuickSale: () => void; onSection: (s: Section) => void }>) {
  return (
    <div className="flex flex-col gap-7">
      <SectionHeader
        title="Tu restaurante, bajo control."
        subtitle={`${name} · Operación de hoy`}
        action={
          <button type="button" onClick={onQuickSale} className="flex h-11 items-center gap-2 rounded-lg bg-[var(--brand)] px-4 text-sm text-[var(--brand-foreground)]">
            <Plus size={17} /> Venta rápida
          </button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ['Mesas ocupadas', `${occupiedTables} / ${totalTables}`],
          ['Pedidos activos', String(occupiedTables)],
          ['Stock por revisar', '4'],
        ].map(([a, b]) => (
          <div key={a} className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">{a}</p>
            <p className="mt-3 text-2xl font-semibold">{b}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="font-semibold">Accesos rápidos</h3>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={() => onSection('Punto de venta')} className="rounded-lg bg-[var(--brand)] px-4 py-3 text-sm text-[var(--brand-foreground)]">
            Abrir punto de venta
          </button>
          <button type="button" onClick={() => onSection('Carta')} className="rounded-lg border border-border px-4 py-3 text-sm">
            Editar carta
          </button>
          <button type="button" onClick={() => onSection('Inventario')} className="rounded-lg border border-border px-4 py-3 text-sm">
            Revisar inventario
          </button>
        </div>
      </div>
    </div>
  )
}

function TableGrid({ tables, onSelect, onAddTable }: Readonly<{ tables: TableDTO[]; onSelect: (id: string) => void; onAddTable: () => void }>) {
  return (
    <div className="flex flex-col gap-7">
      <SectionHeader
        title="Mesas"
        subtitle="Toca una mesa para abrir o continuar su cuenta"
        action={
          <button type="button" onClick={onAddTable} className="flex h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted">
            <Plus size={16} /> Agregar mesa
          </button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tables.map((table) => {
          const occupied = table.items.length > 0
          const itemCount = table.items.reduce((sum, l) => sum + l.quantity, 0)
          return (
            <button
              type="button"
              key={table.id}
              onClick={() => onSelect(table.id)}
              className={`flex flex-col items-start gap-3 rounded-xl border p-5 text-left transition ${
                occupied ? 'border-[var(--brand)] bg-[var(--brand)]/10' : 'border-border bg-card hover:border-[var(--brand)]'
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <span className="font-semibold">{table.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    occupied ? 'bg-[var(--brand)] text-[var(--brand-foreground)]' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {occupied ? 'Ocupada' : 'Libre'}
                </span>
              </div>
              {occupied ? (
                <div className="text-sm text-muted-foreground">
                  <p>{itemCount} producto{itemCount === 1 ? '' : 's'}</p>
                  <p className="mt-0.5 font-semibold text-foreground">$ {orderItemsTotal(table.items).toFixed(2)}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sin cuenta abierta</p>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TableOrder({
  table,
  products,
  onBack,
  onAdd,
  onIncrement,
  onDecrement,
  onRemove,
  onPay,
  onSendComanda,
}: Readonly<{
  table: TableDTO
  products: Product[]
  onBack: () => void
  onAdd: (product: Product) => void
  onIncrement: (itemId: string) => void
  onDecrement: (itemId: string) => void
  onRemove: (itemId: string) => void
  onPay: () => void
  onSendComanda: () => void
}>) {
  const pendingCount = table.items.filter((i) => !i.sentToKitchenAt).length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ChevronLeft size={16} /> Volver a mesas
        </button>
        <button
          type="button"
          onClick={onSendComanda}
          disabled={!pendingCount}
          className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-40"
        >
          <ClipboardList size={15} /> Enviar comanda{pendingCount ? ` (${pendingCount})` : ''}
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div>
          <SectionHeader title={table.label} subtitle="Selecciona productos para agregar a la cuenta" />
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {products.length ? (
              products.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => onAdd(p)}
                  className="rounded-xl border border-border bg-card p-5 text-left transition hover:border-[var(--brand)]"
                >
                  <p className="font-medium">{p.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{p.category}</p>
                  <p className="mt-4 font-semibold">$ {p.price.toFixed(2)}</p>
                </button>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Agrega productos disponibles desde "Carta" para poder venderlos aquí.</p>
            )}
          </div>
        </div>

        <Cart
          title={`Cuenta · ${table.label}`}
          lines={orderItemsToLines(table.items)}
          onIncrement={onIncrement}
          onDecrement={onDecrement}
          onRemove={onRemove}
          onPay={onPay}
          payLabel="Cobrar mesa"
        />
      </div>
    </div>
  )
}

function Cart({
  title = 'Orden actual',
  lines,
  onIncrement,
  onDecrement,
  onRemove,
  onPay,
  payLabel = 'Cobrar venta',
}: Readonly<{
  title?: string
  lines: CartLineView[]
  onIncrement: (id: string) => void
  onDecrement: (id: string) => void
  onRemove: (id: string) => void
  onPay: () => void
  payLabel?: string
}>) {
  const total = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)

  return (
    <div className="h-fit rounded-xl border border-border bg-card p-5">
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-5 flex flex-col gap-4">
        {lines.length ? (
          lines.map((line) => (
            <div key={line.id} className="flex items-center justify-between gap-2 border-b border-border pb-3 last:border-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{line.name}</p>
                <p className="text-xs text-muted-foreground">$ {(line.unitPrice * line.quantity).toFixed(2)}</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={`Quitar una unidad de ${line.name}`}
                  onClick={() => onDecrement(line.id)}
                  className="flex size-7 items-center justify-center rounded-md border border-border hover:bg-muted"
                >
                  <Minus size={13} />
                </button>
                <span className="w-5 text-center text-sm">{line.quantity}</span>
                <button
                  type="button"
                  aria-label={`Agregar una unidad de ${line.name}`}
                  onClick={() => onIncrement(line.id)}
                  className="flex size-7 items-center justify-center rounded-md border border-border hover:bg-muted"
                >
                  <Plus size={13} />
                </button>
                <button
                  type="button"
                  aria-label={`Quitar ${line.name} de la cuenta`}
                  onClick={() => onRemove(line.id)}
                  className="ml-1 flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">Agrega productos para comenzar.</p>
        )}
      </div>
      <div className="mt-6 border-t border-border pt-4">
        <div className="flex justify-between font-semibold">
          <span>Total</span>
          <span>$ {total.toFixed(2)}</span>
        </div>
        <button
          type="button"
          disabled={!lines.length}
          onClick={onPay}
          className="mt-4 h-11 w-full rounded-lg bg-[var(--brand)] text-[var(--brand-foreground)] disabled:opacity-40"
        >
          {payLabel}
        </button>
      </div>
    </div>
  )
}

function QuickSaleDrawer({
  products,
  cart,
  onAdd,
  onIncrement,
  onDecrement,
  onRemove,
  onClose,
  onPay,
}: Readonly<{
  products: Product[]
  cart: CartLine[]
  onAdd: (id: string) => void
  onIncrement: (id: string) => void
  onDecrement: (id: string) => void
  onRemove: (id: string) => void
  onClose: () => void
  onPay: () => void
}>) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-foreground/30">
      <div className="flex h-full w-full max-w-lg flex-col bg-card p-6">
        <div className="flex justify-between">
          <div>
            <p className="text-sm text-[var(--brand)]">Venta rápida</p>
            <h2 className="text-xl font-semibold">Mostrador / para llevar</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar venta rápida">
            <X />
          </button>
        </div>

        <div className="mt-6 grid gap-3">
          {products.length ? (
            products.map((p) => (
              <button type="button" key={p.id} onClick={() => onAdd(p.id)} className="flex justify-between rounded-lg border border-border p-3 text-left hover:border-[var(--brand)]">
                <span>{p.name}</span>
                <span>$ {p.price.toFixed(2)}</span>
              </button>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Agrega productos disponibles desde "Carta".</p>
          )}
        </div>

        <div className="mt-auto pt-6">
          <Cart lines={quickCartToLines(products, cart)} onIncrement={onIncrement} onDecrement={onDecrement} onRemove={onRemove} onPay={onPay} />
        </div>
      </div>
    </div>
  )
}

function Catalog({
  menu,
  restaurantSlug,
  onOpenCreate,
  onEdit,
  onToggleAvailability,
  onDelete,
}: Readonly<{
  menu: MenuDTO
  restaurantSlug: string
  onOpenCreate: () => void
  onEdit: (product: MenuProductDTO) => void
  onToggleAvailability: (product: MenuProductDTO) => void
  onDelete: (product: MenuProductDTO) => void
}>) {
  return (
    <div className="flex flex-col gap-7">
      <SectionHeader
        title="Carta del restaurante"
        subtitle="Productos y categorías"
        action={
          <div className="flex flex-wrap gap-2">
            <a
              href={`/carta/${restaurantSlug}`}
              target="_blank"
              rel="noreferrer"
              className="flex h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted"
            >
              <ExternalLink size={16} /> Ver carta pública
            </a>
            <button type="button" onClick={onOpenCreate} className="flex h-11 items-center gap-2 rounded-lg bg-[var(--brand)] px-4 text-[var(--brand-foreground)]">
              <Plus /> Agregar producto
            </button>
          </div>
        }
      />
      {menu.products.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {menu.products.map((p) => (
            <div key={p.id} className={`flex items-start justify-between gap-3 rounded-xl border p-5 ${p.isAvailable ? 'border-border bg-card' : 'border-border/60 bg-muted/30'}`}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={`font-medium ${p.isAvailable ? '' : 'text-muted-foreground line-through'}`}>{p.name}</p>
                  {p.isPreferred && (
                    <span className="rounded-full bg-[var(--brand)] px-2 py-0.5 text-[10px] font-medium text-[var(--brand-foreground)]">⭐ Preferido</span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {p.categoryName} · $ {(p.priceCents / 100).toFixed(2)}
                </p>
                {p.description && <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>}
                {p.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label={p.isAvailable ? `Marcar ${p.name} como no disponible` : `Marcar ${p.name} como disponible`}
                  onClick={() => onToggleAvailability(p)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${p.isAvailable ? 'bg-[var(--brand)]/10 text-[var(--brand)]' : 'bg-muted text-muted-foreground'}`}
                >
                  {p.isAvailable ? 'Disponible' : 'Oculto'}
                </button>
                <button type="button" aria-label={`Editar ${p.name}`} onClick={() => onEdit(p)} className="flex size-8 items-center justify-center rounded-md hover:bg-muted">
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  aria-label={`Eliminar ${p.name}`}
                  onClick={() => onDelete(p)}
                  className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Todavía no agregaste productos a tu carta.</p>
      )}
    </div>
  )
}

function ProductFormModal({
  initial,
  categories,
  onClose,
  onSubmit,
}: Readonly<{
  initial?: MenuProductDTO
  categories: string[]
  onClose: () => void
  onSubmit: (input: ProductInput) => Promise<void>
}>) {
  const [name, setName] = useState(initial?.name ?? '')
  const [isNewCategory, setIsNewCategory] = useState(categories.length === 0)
  const [category, setCategory] = useState(initial?.categoryName ?? categories[0] ?? 'General')
  const [price, setPrice] = useState(initial ? (initial.priceCents / 100).toFixed(2) : '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [tags, setTags] = useState<string[]>(initial?.tags ?? [])
  const [customTag, setCustomTag] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const toggleTag = (tag: string) => setTags((current) => (current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]))
  const addCustomTag = () => {
    const value = customTag.trim()
    if (value && !tags.includes(value)) setTags((current) => [...current, value])
    setCustomTag('')
  }
  const extraTags = tags.filter((t) => !COMMON_PRODUCT_TAGS.includes(t))

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const priceCents = Math.round(parseFloat(price) * 100)
    if (!name.trim() || !Number.isFinite(priceCents) || priceCents <= 0) {
      setError('Completa el nombre y un precio válido')
      return
    }
    if (!category.trim()) {
      setError('Elige o escribe una categoría')
      return
    }
    setSaving(true)
    try {
      await onSubmit({ name: name.trim(), description, priceCents, categoryName: category.trim(), tags })
      onClose()
    } catch {
      setError('No se pudo guardar el producto')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-5">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-semibold">{initial ? 'Editar producto' : 'Nuevo producto'}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X />
          </button>
        </div>
        <form onSubmit={submit} className="mt-5 flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
          <label className="flex flex-col gap-2 text-sm font-medium">
            Nombre
            <input required value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-lg border border-input bg-background px-3" />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium">
            Categoría
            <select
              value={isNewCategory ? '__new__' : category}
              onChange={(e) => {
                if (e.target.value === '__new__') {
                  setIsNewCategory(true)
                  setCategory('')
                } else {
                  setIsNewCategory(false)
                  setCategory(e.target.value)
                }
              }}
              className="h-11 rounded-lg border border-input bg-background px-3"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value="__new__">+ Nueva categoría</option>
            </select>
          </label>
          {isNewCategory && (
            <label className="flex flex-col gap-2 text-sm font-medium">
              Nombre de la nueva categoría
              <input required value={category} onChange={(e) => setCategory(e.target.value)} placeholder="General" className="h-11 rounded-lg border border-input bg-background px-3" />
            </label>
          )}

          <label className="flex flex-col gap-2 text-sm font-medium">
            Precio
            <input required type="number" step="0.01" min="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="h-11 rounded-lg border border-input bg-background px-3" />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Descripción (opcional)
            <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="resize-none rounded-lg border border-input bg-background p-3 text-sm" />
          </label>

          <div>
            <p className="mb-2 text-sm font-medium">Etiquetas (opcional)</p>
            <div className="flex flex-wrap gap-2">
              {COMMON_PRODUCT_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${tags.includes(tag) ? 'border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]' : 'border-border text-muted-foreground'}`}
                >
                  {tag}
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={customTag}
                onChange={(e) => setCustomTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCustomTag()
                  }
                }}
                placeholder="Otra etiqueta…"
                className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm"
              />
              <button type="button" onClick={addCustomTag} className="rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted">
                Agregar
              </button>
            </div>
            {extraTags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {extraTags.map((tag) => (
                  <span key={tag} className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs">
                    {tag}
                    <button type="button" onClick={() => toggleTag(tag)} aria-label={`Quitar etiqueta ${tag}`}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {error && <p role="alert" className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">{error}</p>}
          <button type="submit" disabled={saving} className="h-11 rounded-lg bg-[var(--brand)] text-[var(--brand-foreground)] disabled:opacity-60">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      </div>
    </div>
  )
}

function Inventory({
  items,
  onOpenCreate,
  onDelete,
}: Readonly<{ items: InventoryItemDTO[]; onOpenCreate: () => void; onDelete: (item: InventoryItemDTO) => void }>) {
  return (
    <div className="flex flex-col gap-7">
      <SectionHeader
        title="Inventario"
        subtitle="Existencias de la sucursal"
        action={
          <button type="button" onClick={onOpenCreate} className="flex h-11 items-center gap-2 rounded-lg bg-[var(--brand)] px-4 text-[var(--brand-foreground)]">
            <Plus /> Agregar insumo
          </button>
        }
      />
      <div className="rounded-xl border border-border bg-card p-5">
        {items.length ? (
          <div className="flex flex-col gap-4">
            {items.map((item) => {
              const low = item.stock <= item.minimumStock
              return (
                <div key={item.id} className="flex items-center justify-between border-b border-border pb-4 last:border-0 last:pb-0">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.stock} {item.unit}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm ${low ? 'text-destructive' : 'text-[var(--brand)]'}`}>{low ? 'Stock bajo' : 'Stock saludable'}</span>
                    <button
                      type="button"
                      aria-label={`Eliminar ${item.name}`}
                      onClick={() => onDelete(item)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Todavía no agregaste insumos.</p>
        )}
      </div>
    </div>
  )
}

function InventoryFormModal({
  onClose,
  onSubmit,
}: Readonly<{ onClose: () => void; onSubmit: (input: { name: string; unit: string; stock: number; minimumStock: number; costCents: number }) => Promise<void> }>) {
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [stock, setStock] = useState('')
  const [minimumStock, setMinimumStock] = useState('')
  const [cost, setCost] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name.trim() || !unit.trim()) {
      setError('Completa el nombre y la unidad')
      return
    }
    setSaving(true)
    try {
      await onSubmit({
        name: name.trim(),
        unit: unit.trim(),
        stock: parseFloat(stock) || 0,
        minimumStock: parseFloat(minimumStock) || 0,
        costCents: Math.round((parseFloat(cost) || 0) * 100),
      })
      onClose()
    } catch {
      setError('No se pudo guardar el insumo')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-5">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-semibold">Nuevo insumo</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X />
          </button>
        </div>
        <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm font-medium">
            Nombre
            <input required value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-lg border border-input bg-background px-3" />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Unidad (kg, paquetes, litros…)
            <input required value={unit} onChange={(e) => setUnit(e.target.value)} className="h-11 rounded-lg border border-input bg-background px-3" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-2 text-sm font-medium">
              Existencias
              <input type="number" step="1" min="0" value={stock} onChange={(e) => setStock(e.target.value)} className="h-11 rounded-lg border border-input bg-background px-3" />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              Stock mínimo
              <input type="number" step="1" min="0" value={minimumStock} onChange={(e) => setMinimumStock(e.target.value)} className="h-11 rounded-lg border border-input bg-background px-3" />
            </label>
          </div>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Costo unitario (opcional)
            <input type="number" step="0.01" min="0" value={cost} onChange={(e) => setCost(e.target.value)} className="h-11 rounded-lg border border-input bg-background px-3" />
          </label>
          {error && <p role="alert" className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">{error}</p>}
          <button type="submit" disabled={saving} className="h-11 rounded-lg bg-[var(--brand)] text-[var(--brand-foreground)] disabled:opacity-60">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      </div>
    </div>
  )
}

function Stats({
  stats,
  shiftHistory,
  loading,
}: Readonly<{ stats: RestaurantStatsDTO | null; shiftHistory: ShiftDTO[] | null; loading: boolean }>) {
  return (
    <div className="flex flex-col gap-7">
      <SectionHeader title="Estadísticas" subtitle="Qué se vende más en tu restaurante" />

      {loading || !stats ? (
        <p className="text-sm text-muted-foreground">{loading ? 'Cargando estadísticas…' : 'Sin datos todavía.'}</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-sm text-muted-foreground">Ventas totales</p>
              <p className="mt-3 text-2xl font-semibold">$ {(stats.totalSalesCents / 100).toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-sm text-muted-foreground">Ventas registradas</p>
              <p className="mt-3 text-2xl font-semibold">{stats.totalOrders}</p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border p-5">
              <h3 className="font-semibold">Productos más pedidos</h3>
              <p className="mt-1 text-xs text-muted-foreground">Según las cuentas de mesa cobradas · los 3 primeros aparecen como "⭐ Preferidos" en tu carta</p>
            </div>
            <div className="p-5">
              {stats.topProducts.length ? (
                <div className="flex flex-col gap-4">
                  {stats.topProducts.map((p, i) => {
                    const max = stats.topProducts[0].quantitySold || 1
                    const width = Math.max(8, Math.round((p.quantitySold / max) * 100))
                    return (
                      <div key={p.productId}>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate font-medium">
                            {i < 3 ? '⭐ ' : ''}
                            {p.name}
                          </span>
                          <span className="shrink-0 text-muted-foreground">
                            {p.quantitySold} vendidos · $ {(p.revenueCents / 100).toFixed(2)}
                          </span>
                        </div>
                        <div className="mt-1.5 h-2 rounded-full bg-muted">
                          <div className="h-2 rounded-full bg-[var(--brand)]" style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Todavía no hay cuentas de mesa cobradas para calcular estadísticas por producto.</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border p-5">
              <h3 className="font-semibold">Turnos recientes</h3>
              <p className="mt-1 text-xs text-muted-foreground">Apertura, cierre y diferencia de caja de cada turno</p>
            </div>
            {shiftHistory?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-5 py-3 font-medium">Abierto por</th>
                      <th className="px-5 py-3 font-medium">Apertura</th>
                      <th className="px-5 py-3 font-medium">Base</th>
                      <th className="px-5 py-3 font-medium">Gastos</th>
                      <th className="px-5 py-3 font-medium">Esperado</th>
                      <th className="px-5 py-3 font-medium">Contado</th>
                      <th className="px-5 py-3 font-medium">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shiftHistory.map((s) => (
                      <tr key={s.id} className="border-t border-border">
                        <td className="px-5 py-4 font-medium">{s.openedByName}</td>
                        <td className="px-5 py-4 text-muted-foreground">{new Date(s.openedAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</td>
                        <td className="px-5 py-4">$ {(s.openingCashCents / 100).toFixed(2)}</td>
                        <td className="px-5 py-4 text-muted-foreground">{s.expensesCents !== null ? `$ ${(s.expensesCents / 100).toFixed(2)}` : '—'}</td>
                        <td className="px-5 py-4 text-muted-foreground">{s.expectedCashCents !== null ? `$ ${(s.expectedCashCents / 100).toFixed(2)}` : '—'}</td>
                        <td className="px-5 py-4">{s.closingCashCents !== null ? `$ ${(s.closingCashCents / 100).toFixed(2)}` : s.status === 'open' ? 'Abierto' : '—'}</td>
                        <td className="px-5 py-4">
                          {s.differenceCents === null ? (
                            '—'
                          ) : (
                            <span className={s.differenceCents === 0 ? 'text-muted-foreground' : s.differenceCents > 0 ? 'text-[var(--brand)]' : 'text-destructive'}>
                              {s.differenceCents > 0 ? '+' : s.differenceCents < 0 ? '-' : ''}$ {Math.abs(s.differenceCents / 100).toFixed(2)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="p-5 text-sm text-muted-foreground">Todavía no hay turnos registrados.</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Billing({
  taxSettings,
  sales,
  salesLoading,
  onOpenSettings,
}: Readonly<{ taxSettings: TaxSettings; sales: SaleSummaryDTO[] | null; salesLoading: boolean; onOpenSettings: () => void }>) {
  const paymentLabel: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia' }

  return (
    <div className="flex flex-col gap-7">
      <SectionHeader
        title="Facturación"
        subtitle="Boletas digitales — no son comprobantes fiscales timbrados"
        action={
          <button type="button" onClick={onOpenSettings} className="flex h-11 items-center gap-2 rounded-lg bg-[var(--brand)] px-4 text-[var(--brand-foreground)]">
            <FileText /> Configurar facturación
          </button>
        }
      />

      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm font-medium">Configuración fiscal actual</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">RFC / Tax ID</p>
            <p className="font-medium">{taxSettings.taxId || 'Sin configurar'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Moneda</p>
            <p className="font-medium">{taxSettings.currency}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Impuesto</p>
            <p className="font-medium">{taxSettings.taxRatePercent}%</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <h3 className="font-semibold">Boletas recientes</h3>
        </div>
        {salesLoading || !sales ? (
          <p className="p-5 text-sm text-muted-foreground">Cargando…</p>
        ) : sales.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Folio</th>
                  <th className="px-5 py-3 font-medium">Fecha</th>
                  <th className="px-5 py-3 font-medium">Pago</th>
                  <th className="px-5 py-3 font-medium">Total</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-5 py-4 font-medium">#{String(s.folio ?? '—').padStart(6, '0')}</td>
                    <td className="px-5 py-4 text-muted-foreground">{new Date(s.createdAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="px-5 py-4 text-muted-foreground">{paymentLabel[s.paymentMethod] ?? s.paymentMethod}</td>
                    <td className="px-5 py-4">$ {(s.totalCents / 100).toFixed(2)}</td>
                    <td className="px-5 py-4 text-right">
                      <a href={`/boleta/${s.id}`} target="_blank" rel="noreferrer" className="text-xs font-medium text-[var(--brand)] hover:underline">
                        Ver boleta
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-5 text-sm text-muted-foreground">Todavía no hay boletas emitidas.</p>
        )}
      </div>
    </div>
  )
}

function TaxSettingsModal({
  initial,
  onClose,
  onSubmit,
}: Readonly<{ initial: TaxSettings; onClose: () => void; onSubmit: (input: TaxSettings) => Promise<void> }>) {
  const [taxId, setTaxId] = useState(initial.taxId)
  const [currency, setCurrency] = useState(initial.currency)
  const [rate, setRate] = useState(String(initial.taxRatePercent))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const taxRatePercent = parseFloat(rate)
    if (!Number.isFinite(taxRatePercent) || taxRatePercent < 0 || taxRatePercent > 100) {
      setError('La tasa de impuesto debe ser un número entre 0 y 100')
      return
    }
    setSaving(true)
    try {
      await onSubmit({ taxId, currency: currency.trim().toUpperCase() || 'MXN', taxRatePercent })
      onClose()
    } catch {
      setError('No se pudo guardar la configuración fiscal')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-5">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-semibold">Configurar facturación</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X />
          </button>
        </div>
        <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm font-medium">
            RFC / Tax ID
            <input value={taxId} onChange={(e) => setTaxId(e.target.value)} className="h-11 rounded-lg border border-input bg-background px-3" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-2 text-sm font-medium">
              Moneda
              <input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} className="h-11 rounded-lg border border-input bg-background px-3 uppercase" />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              Impuesto (%)
              <input type="number" step="0.01" min="0" max="100" value={rate} onChange={(e) => setRate(e.target.value)} className="h-11 rounded-lg border border-input bg-background px-3" />
            </label>
          </div>
          {error && <p role="alert" className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">{error}</p>}
          <button type="submit" disabled={saving} className="h-11 rounded-lg bg-[var(--brand)] text-[var(--brand-foreground)] disabled:opacity-60">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      </div>
    </div>
  )
}

function SettingsDialog({
  name,
  setName,
  accent,
  setAccent,
  receiptFooter,
  setReceiptFooter,
  logoUrl,
  onLogoFile,
  onRemoveLogo,
  showWatermark,
  setShowWatermark,
  onClose,
  onSave,
}: Readonly<{
  name: string
  setName: (v: string) => void
  accent: string
  setAccent: (v: string) => void
  receiptFooter: string
  setReceiptFooter: (v: string) => void
  logoUrl: string
  onLogoFile: (file: File) => void
  onRemoveLogo: () => void
  showWatermark: boolean
  setShowWatermark: (v: boolean) => void
  onClose: () => void
  onSave: () => void
}>) {
  const foreground = contrastFor(accent)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-5">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium" style={{ color: accent }}>
              Personalización
            </p>
            <h2 className="text-xl font-semibold">Configura tu restaurante</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar personalización">
            <X />
          </button>
        </div>

        <div className="mt-6 flex max-h-[70vh] flex-col gap-5 overflow-y-auto pr-1">
          <label className="flex flex-col gap-2 text-sm font-medium">
            Nombre del restaurante
            <input value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-lg border border-input bg-background px-3" />
          </label>

          <div>
            <p className="mb-2 text-sm font-medium">Logo</p>
            <div className="flex items-center gap-4">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Logo del restaurante" className="size-16 rounded-lg border border-border object-cover" />
              ) : (
                <div className="flex size-16 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
                  <ImageIcon size={20} />
                </div>
              )}
              <div className="flex flex-col gap-2">
                <label className="cursor-pointer rounded-lg border border-border px-3 py-2 text-center text-sm font-medium hover:bg-muted">
                  Subir logo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) onLogoFile(file)
                      e.target.value = ''
                    }}
                  />
                </label>
                {logoUrl && (
                  <button type="button" onClick={onRemoveLogo} className="text-xs text-muted-foreground hover:text-destructive">
                    Quitar logo
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Color de marca</p>
            <div className="flex flex-wrap items-center gap-3">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Usar color ${color}`}
                  onClick={() => setAccent(color)}
                  style={{ backgroundColor: color }}
                  className={`size-9 rounded-full ${accent.toLowerCase() === color ? 'ring-2 ring-foreground ring-offset-2' : ''}`}
                />
              ))}
              <label className="relative flex size-9 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground" title="Elegir otro color">
                <input
                  type="color"
                  value={accent}
                  onChange={(e) => setAccent(e.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
                <Palette size={15} />
              </label>
              <span className="text-xs text-muted-foreground">{accent}</span>
            </div>
          </div>

          <label className="flex flex-col gap-2 text-sm font-medium">
            Pie del recibo (opcional)
            <textarea
              value={receiptFooter}
              onChange={(e) => setReceiptFooter(e.target.value)}
              rows={2}
              placeholder="¡Gracias por tu visita! Síguenos en @mirestaurante"
              className="resize-none rounded-lg border border-input bg-background p-3 text-sm"
            />
          </label>

          <label className="flex items-center justify-between gap-3 text-sm font-medium">
            Marca de agua de fondo (logo o nombre del restaurante)
            <input type="checkbox" checked={showWatermark} onChange={(e) => setShowWatermark(e.target.checked)} className="size-4" />
          </label>

          <div>
            <p className="mb-2 text-sm font-medium">Vista previa</p>
            <div className="flex items-center gap-3 rounded-xl border border-border p-4">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="size-10 rounded-lg object-cover" />
              ) : (
                <div className="flex size-10 items-center justify-center rounded-lg" style={{ backgroundColor: accent, color: foreground }}>
                  <UtensilsCrossed size={18} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{name || 'Nombre del restaurante'}</p>
                <p className="text-xs text-muted-foreground">Así se verá tu marca en el workspace y en tu carta pública</p>
              </div>
              <button type="button" className="rounded-lg px-3 py-2 text-xs font-medium" style={{ backgroundColor: accent, color: foreground }}>
                Cobrar venta
              </button>
            </div>
          </div>

          <button type="button" onClick={onSave} className="flex h-11 items-center justify-center gap-2 rounded-lg" style={{ backgroundColor: accent, color: foreground }}>
            <Check size={16} /> Guardar cambios
          </button>
        </div>
      </div>
    </div>
  )
}

function ShiftBadge({
  shift,
  onOpen,
  onClose,
  onAddExpense,
}: Readonly<{ shift: ShiftDTO | null; onOpen: () => void; onClose: () => void; onAddExpense: () => void }>) {
  if (!shift) {
    return (
      <button type="button" onClick={onOpen} className="flex h-10 items-center gap-2 rounded-lg border border-dashed border-border px-3 text-xs font-medium text-muted-foreground hover:bg-muted">
        Sin turno abierto
      </button>
    )
  }
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onClose}
        className="flex h-10 items-center gap-2 rounded-lg border border-[var(--brand)] bg-[var(--brand)]/10 px-3 text-xs font-medium text-[var(--brand)]"
      >
        Turno abierto · $ {(shift.openingCashCents / 100).toFixed(2)} · {shift.openedByName.split(/\s+/)[0]}
      </button>
      <button type="button" onClick={onAddExpense} aria-label="Registrar gasto de caja" title="Registrar gasto de caja" className="flex size-10 items-center justify-center rounded-lg border border-border hover:bg-muted">
        <Minus size={15} />
      </button>
    </div>
  )
}

function ShiftRequired({ onOpen }: Readonly<{ onOpen: () => void }>) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-card p-10 text-center">
      <ClipboardList size={28} className="text-muted-foreground" />
      <div>
        <h2 className="text-lg font-semibold">Abre un turno para empezar</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Necesitás abrir el turno de caja (indicando con cuánto efectivo empezás) antes de tomar pedidos o cobrar.
        </p>
      </div>
      <button type="button" onClick={onOpen} className="flex h-11 items-center gap-2 rounded-lg bg-[var(--brand)] px-5 text-sm text-[var(--brand-foreground)]">
        Abrir turno
      </button>
    </div>
  )
}

function OpenShiftModal({ onClose, onSubmit }: Readonly<{ onClose: () => void; onSubmit: (openingCashCents: number) => Promise<void> }>) {
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const cents = Math.round((parseFloat(amount) || 0) * 100)
    if (cents < 0) {
      setError('El monto no puede ser negativo')
      return
    }
    setSaving(true)
    try {
      await onSubmit(cents)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir el turno')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-5">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-semibold">Abrir turno</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X />
          </button>
        </div>
        <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm font-medium">
            ¿Con cuánto efectivo abrís la caja?
            <input required autoFocus type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-11 rounded-lg border border-input bg-background px-3" />
          </label>
          {error && <p role="alert" className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">{error}</p>}
          <button type="submit" disabled={saving} className="h-11 rounded-lg bg-[var(--brand)] text-[var(--brand-foreground)] disabled:opacity-60">
            {saving ? 'Abriendo…' : 'Abrir turno'}
          </button>
        </form>
      </div>
    </div>
  )
}

function CloseShiftModal({
  summary,
  loading,
  onClose,
  onAddExpense,
  onSubmit,
}: Readonly<{ summary: ShiftSummaryDTO | null; loading: boolean; onClose: () => void; onAddExpense: () => void; onSubmit: (closingCashCents: number) => Promise<void> }>) {
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const cents = Math.round((parseFloat(amount) || 0) * 100)
    if (cents < 0) {
      setError('El monto no puede ser negativo')
      return
    }
    setSaving(true)
    try {
      await onSubmit(cents)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cerrar el turno')
    } finally {
      setSaving(false)
    }
  }

  const countedCents = Math.round((parseFloat(amount) || 0) * 100)
  const difference = summary && amount !== '' ? countedCents - summary.expectedCashCents : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-5">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-[var(--brand)]">Arqueo de caja</p>
            <h2 className="text-xl font-semibold">Cierre de turno</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X />
          </button>
        </div>

        {loading || !summary ? (
          <p className="mt-5 text-sm text-muted-foreground">Cargando resumen del turno…</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              Abierto por {summary.shift.openedByName} el {new Date(summary.shift.openedAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}.
            </p>

            <div className="mt-5 flex flex-col gap-2 rounded-xl border border-border p-4 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Base de apertura</span><span>$ {(summary.shift.openingCashCents / 100).toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">+ Ventas en efectivo</span><span>$ {(summary.cashSalesCents / 100).toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">− Gastos / retiros de caja</span><span>$ {(summary.expensesCents / 100).toFixed(2)}</span></div>
              <div className="flex justify-between border-t border-dashed border-border pt-2 font-semibold"><span>Efectivo esperado</span><span>$ {(summary.expectedCashCents / 100).toFixed(2)}</span></div>
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>Con tarjeta: $ {(summary.cardSalesCents / 100).toFixed(2)}</span>
                <span>Transferencia: $ {(summary.transferSalesCents / 100).toFixed(2)}</span>
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Gastos y retiros del turno</p>
                <button type="button" onClick={onAddExpense} className="text-xs font-medium text-[var(--brand)] hover:underline">+ Agregar</button>
              </div>
              {summary.expenses.length ? (
                <div className="mt-2 flex flex-col gap-1.5">
                  {summary.expenses.map((e) => (
                    <div key={e.id} className="flex justify-between text-xs text-muted-foreground">
                      <span className="truncate">{e.description} · {e.createdByName}</span>
                      <span className="shrink-0">$ {(e.amountCents / 100).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">Sin gastos registrados en este turno.</p>
              )}
            </div>

            <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
              <label className="flex flex-col gap-2 text-sm font-medium">
                ¿Con cuánto efectivo contaste al cerrar?
                <input required autoFocus type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-11 rounded-lg border border-input bg-background px-3" />
              </label>
              {difference !== null && (
                <p className={`text-sm ${difference === 0 ? 'text-muted-foreground' : difference > 0 ? 'text-[var(--brand)]' : 'text-destructive'}`}>
                  {difference === 0 ? 'Cuadra exacto.' : `Diferencia: ${difference > 0 ? '+' : '-'}$ ${Math.abs(difference / 100).toFixed(2)}`}
                </p>
              )}
              {error && <p role="alert" className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">{error}</p>}
              <button type="submit" disabled={saving} className="h-11 rounded-lg bg-[var(--brand)] text-[var(--brand-foreground)] disabled:opacity-60">
                {saving ? 'Cerrando…' : 'Cerrar turno'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

function ExpenseModal({ onClose, onSubmit }: Readonly<{ onClose: () => void; onSubmit: (amountCents: number, description: string) => Promise<void> }>) {
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const cents = Math.round((parseFloat(amount) || 0) * 100)
    if (cents <= 0) {
      setError('Ingresa un monto válido')
      return
    }
    setSaving(true)
    try {
      await onSubmit(cents, description)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el gasto')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-5">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-semibold">Gasto / retiro de caja</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X />
          </button>
        </div>
        <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm font-medium">
            Monto retirado
            <input required autoFocus type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-11 rounded-lg border border-input bg-background px-3" />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            ¿Para qué fue?
            <input required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Compra de hielo, propina, etc." className="h-11 rounded-lg border border-input bg-background px-3" />
          </label>
          {error && <p role="alert" className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">{error}</p>}
          <button type="submit" disabled={saving} className="h-11 rounded-lg bg-[var(--brand)] text-[var(--brand-foreground)] disabled:opacity-60">
            {saving ? 'Guardando…' : 'Registrar'}
          </button>
        </form>
      </div>
    </div>
  )
}

function ComandaModal({
  tableLabel,
  items,
  sentAt,
  shiftOpenedByName,
  onClose,
}: Readonly<{ tableLabel: string; items: ComandaItem[]; sentAt: string; shiftOpenedByName: string | null; onClose: () => void }>) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-5">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-[var(--brand)]">Comanda · Cocina</p>
            <h2 className="text-xl font-semibold">{tableLabel}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X />
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {new Date(sentAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
          {shiftOpenedByName ? ` · Turno de ${shiftOpenedByName}` : ''}
        </p>
        <div className="mt-5 flex flex-col gap-3">
          {items.map((item, i) => (
            <div key={`${item.productName}-${i}`} className="flex items-center justify-between border-b border-dashed border-border pb-2 text-sm last:border-0">
              <span className="font-medium">{item.productName}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">× {item.quantity}</span>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => window.print()} className="mt-6 h-11 w-full rounded-lg bg-[var(--brand)] text-sm font-medium text-[var(--brand-foreground)]">
          Imprimir
        </button>
        <button type="button" onClick={onClose} className="mt-2 h-11 w-full rounded-lg border border-border text-sm font-medium hover:bg-muted">
          Listo
        </button>
      </div>
    </div>
  )
}
