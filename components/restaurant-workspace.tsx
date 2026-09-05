'use client'

import { useEffect, useMemo, useState, type SubmitEvent } from 'react'
import {
  BarChart3,
  CalendarDays,
  Check,
  ChefHat,
  ChevronLeft,
  ClipboardList,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  LogOut,
  MapPin,
  Menu,
  Minus,
  Package,
  Palette,
  Pencil,
  Phone,
  Plus,
  QrCode,
  Receipt,
  ScanLine,
  Settings2,
  ShoppingBag,
  Sparkles,
  Store,
  Trash2,
  TrendingUp,
  Truck,
  Upload,
  UtensilsCrossed,
  X,
  type LucideIcon,
} from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { saveCurrentRestaurantBranding, saveTaxSettings } from '@/app/actions/restaurant'
import { registerSale } from '@/app/actions/operations'
import {
  addTable,
  addTableItem,
  addZone,
  assignTableZone,
  changeTableItemQuantity,
  chargeTable,
  removeTableItem,
  renameTable,
  sendComanda,
  type ComandaItem,
  type OrderItemDTO,
  type TableDTO,
  type ZoneDTO,
} from '@/app/actions/tables'
import { addMenuProduct, deleteMenuProduct, importMenuProducts, updateMenuProduct, type MenuDTO, type MenuProductDTO } from '@/app/actions/menu'
import { generateMenuDescriptions } from '@/app/actions/ai'
import { addInventoryItem, applyOcrInventoryUpdates, deleteInventoryItem, importInventoryItems, updateInventoryItem, type InventoryItemDTO } from '@/app/actions/inventory'
import { getRestaurantStats, type RestaurantStatsDTO } from '@/app/actions/stats'
import { addShiftExpense, closeShift, getShiftSummary, openShift, type ShiftDTO, type ShiftSummaryDTO } from '@/app/actions/shifts'
import { listRecentSales, type SaleSummaryDTO } from '@/app/actions/receipts'
import { listReservations, setReservationStatus, type ReservationDTO } from '@/app/actions/reservations'
import { listPublicOrders, setPublicOrderStatus, type PublicOrderDTO } from '@/app/actions/public-orders'
import { listProductIngredients, setProductIngredients, type IngredientLinkInput, type ProductIngredientDTO } from '@/app/actions/ingredients'
import { COMMON_PRODUCT_TAGS, iconForTag } from '@/lib/menu-tags'

type Section = 'Inicio' | 'Punto de venta' | 'Carta' | 'Reservas' | 'Pedidos online' | 'Inventario' | 'Facturación' | 'Estadísticas'
type ProductInput = { name: string; description: string; priceCents: number; categoryName: string; tags: string[] }
type Product = { id: string; name: string; category: string; price: number }
type CartLine = { id: string; qty: number }
type TaxSettings = { taxId: string; currency: string; taxRatePercent: number }
type PaymentMethod = 'cash' | 'card' | 'transfer'
type PendingPayment = { kind: 'table'; tableId: string; label: string; totalCents: number } | { kind: 'quick'; totalCents: number }
// Normalized shape the <Cart> renderer works with, regardless of whether the
// lines come from a DB-backed table order or the local quick-sale cart.
type CartLineView = { id: string; name: string; unitPrice: number; quantity: number }

const PRESET_COLORS = ['#ea580c', '#2f6f86', '#4d7c55', '#8a4f9e', '#b5453f', '#1c1c1c']

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

// The raw brand color is safe as a background (contrastFor picks the text on
// top of it) but not as *text on a light card* — a pastel/light custom color
// (yellow, mint, etc.) renders as near-invisible labels, badges and links.
// This darkens it just enough to stay legible while keeping its hue, and
// leaves already-dark colors untouched.
function readableAccent(hex: string): string {
  const value = hex.replace('#', '')
  if (value.length !== 6) return hex
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  if (luminance <= 0.55) return hex
  const scale = 0.55 / luminance
  const darken = (channel: number) => Math.round(channel * scale).toString(16).padStart(2, '0')
  return `#${darken(r)}${darken(g)}${darken(b)}`
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

type ImportedInventoryRow = { name: string; unit: string; stock: number; minimumStock: number; costCents: number }

function normalizeHeader(h: string) {
  // Strip accents (decompose then drop combining marks U+0300-U+036F) so
  // "Mínimo" matches "minimo".
  return h
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

function pickField(row: Record<string, unknown>, candidates: string[]): string {
  const keys = Object.keys(row)
  for (const candidate of candidates) {
    const key = keys.find((k) => normalizeHeader(k).includes(candidate))
    if (key && row[key] !== undefined && row[key] !== null) return String(row[key]).trim()
  }
  return ''
}

// Reads an uploaded Excel/CSV of ingredients with flexible column matching
// (Nombre/Name, Unidad/Unit, Existencias/Stock, Mínimo, Costo/Precio), so a
// restaurant's existing spreadsheet doesn't need to match an exact template.
async function parseInventoryFile(file: File): Promise<ImportedInventoryRow[]> {
  const XLSX = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

  return rows
    .map((row) => ({
      name: pickField(row, ['nombre', 'name', 'insumo', 'ingrediente']),
      unit: pickField(row, ['unidad', 'unit']),
      stock: parseFloat(pickField(row, ['existencia', 'stock', 'cantidad'])) || 0,
      minimumStock: parseFloat(pickField(row, ['minimo', 'min'])) || 0,
      costCents: Math.round((parseFloat(pickField(row, ['costo', 'precio', 'cost'])) || 0) * 100),
    }))
    .filter((r) => r.name && r.unit)
}

type OcrIngredientRow = { id: string; name: string; quantity: number; unit: string; matchedItemId: string | null }

const OCR_UNIT_WORDS = [
  'kg', 'kilos', 'kilo', 'g', 'gr', 'gramos', 'l', 'lt', 'litros', 'litro', 'ml', 'mililitros',
  'pza', 'pzas', 'pieza', 'piezas', 'unidad', 'unidades', 'paquete', 'paquetes', 'caja', 'cajas',
  'botella', 'botellas', 'bolsa', 'bolsas', 'docena', 'docenas',
]

function stripAccents(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

function ocrNumberToken(token: string): number | null {
  const digits = token.replace(/[^0-9.,]/g, '').replace(',', '.')
  if (!digits) return null
  const n = Number.parseFloat(digits)
  return Number.isFinite(n) ? n : null
}

const OCR_TRAILING_PUNCTUATION = new Set([' ', ':', '.', '_', ',', '-'])

// Manual trim (no regex) for the ingredient-name tail — sidesteps any
// backtracking concern entirely for text that comes straight from OCR output.
function trimOcrName(s: string): string {
  let end = s.length
  while (end > 0 && OCR_TRAILING_PUNCTUATION.has(s[end - 1])) end--
  return s.slice(0, end).trim()
}

// One photographed inventory line at a time: "Nombre  cantidad  unidad" in
// roughly any order of spacing/punctuation. OCR text is noisy, so this walks
// the line word by word (rather than one big regex, to avoid any backtracking
// risk on adversarial/garbled OCR output) looking for a trailing quantity,
// an optional unit word right after it, and treats everything before as the
// ingredient name — the review table lets a human fix whatever it gets wrong
// before it touches real stock counts.
function parseOcrLine(line: string): { name: string; quantity: number; unit: string } | null {
  const tokens = line
    .replace(/[|_]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (tokens.length < 2) return null

  // Only the last or second-to-last token can be the quantity (last token
  // may instead be a trailing unit word, e.g. "Tomate 12 kg").
  let quantityIndex = -1
  let quantity: number | null = null
  for (let i = tokens.length - 1; i >= Math.max(0, tokens.length - 2); i--) {
    const n = ocrNumberToken(tokens[i])
    if (n !== null) {
      quantityIndex = i
      quantity = n
      break
    }
  }
  if (quantityIndex === -1 || quantity === null) return null

  const unitToken = quantityIndex < tokens.length - 1 ? tokens[quantityIndex + 1].toLowerCase().replace(/[^a-zñáéíóú]/g, '') : ''
  const unit = unitToken && OCR_UNIT_WORDS.some((u) => u.startsWith(unitToken) || unitToken.startsWith(u)) ? unitToken : ''

  const name = trimOcrName(tokens.slice(0, quantityIndex).join(' '))
  if (!name || name.length < 2) return null
  return { name, quantity, unit }
}

function bestInventoryMatch(name: string, items: InventoryItemDTO[]): string | null {
  const target = stripAccents(name)
  const exact = items.find((i) => stripAccents(i.name) === target)
  if (exact) return exact.id
  const partial = items.find((i) => stripAccents(i.name).includes(target) || target.includes(stripAccents(i.name)))
  return partial?.id ?? null
}

// Runs Tesseract.js (loaded on demand, client-side only) over an uploaded
// photo of a stock sheet/shelf label and turns each readable line into a
// candidate row, pre-matched against the existing inventory by name.
async function extractOcrRows(file: File, items: InventoryItemDTO[]): Promise<OcrIngredientRow[]> {
  const Tesseract = await import('tesseract.js')
  const { data } = await Tesseract.recognize(file, 'spa')
  return data.text
    .split(/\r?\n/)
    .map(parseOcrLine)
    .filter((r): r is { name: string; quantity: number; unit: string } => !!r)
    .slice(0, 200)
    .map((r) => ({ id: crypto.randomUUID(), ...r, matchedItemId: bestInventoryMatch(r.name, items) }))
}

type MenuOcrRow = { id: string; name: string; priceCents: number; description: string; categoryName: string }

// One photographed menu line at a time: "Nombre del platillo .... $99.00".
// Same word-by-word approach as parseOcrLine (see above) — walks from the
// end looking for a price token instead of a quantity+unit.
function parseMenuOcrLine(line: string): { name: string; priceCents: number } | null {
  const tokens = line.replace(/[|_]+/g, ' ').split(/\s+/).filter(Boolean)
  if (tokens.length < 2) return null

  let priceIndex = -1
  let priceCents: number | null = null
  for (let i = tokens.length - 1; i >= Math.max(0, tokens.length - 2); i--) {
    const amount = ocrNumberToken(tokens[i])
    if (amount !== null && amount > 0) {
      priceIndex = i
      priceCents = Math.round(amount * 100)
      break
    }
  }
  if (priceIndex === -1 || priceCents === null) return null

  const name = trimOcrName(tokens.slice(0, priceIndex).join(' '))
  if (!name || name.length < 2) return null
  return { name, priceCents }
}

// Turns raw OCR text into candidate menu rows. Menus commonly print a short
// description right under the dish name/price ("Tacos al pastor  $99 / con
// piña, cebolla y cilantro") — so unlike the ingredient OCR (one line = one
// row), this walks the lines with a little state: a line with a price
// starts a new dish, and the next line(s) without one (until the following
// priced line) become its description, when the menu already prints one.
function extractMenuOcrRowsFromText(text: string): MenuOcrRow[] {
  const rows: MenuOcrRow[] = []
  let current: MenuOcrRow | null = null
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const parsed = parseMenuOcrLine(line)
    if (parsed) {
      current = { id: crypto.randomUUID(), name: parsed.name, priceCents: parsed.priceCents, description: '', categoryName: '' }
      rows.push(current)
    } else if (current && !current.description && line.length >= 3 && line.length <= 160) {
      current.description = line
    }
  }
  return rows.slice(0, 200)
}

// Renders every page of a PDF to a canvas and OCRs each one — simpler and
// more robust than trying to also support pdf.js's own text-layer
// extraction (which needs its own line-grouping logic from character
// positions), at the cost of OCR running even on PDFs that already have a
// real text layer. The worker file is copied into public/ on install (see
// scripts/copy-pdf-worker.mjs) so its version always matches pdfjs-dist's.
async function extractTextFromPdf(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  const Tesseract = await import('tesseract.js')

  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  const maxPages = Math.min(pdf.numPages, 10)
  let fullText = ''
  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const context = canvas.getContext('2d')
    if (!context) continue
    await page.render({ canvasContext: context, viewport }).promise
    const { data } = await Tesseract.recognize(canvas, 'spa')
    fullText += `${data.text}\n`
  }
  return fullText
}

// Entry point for the Carta OCR import — accepts either an image (photo of
// a printed menu) or a PDF export, and turns it into candidate product rows.
async function extractMenuOcrRows(file: File): Promise<MenuOcrRow[]> {
  let text: string
  if (file.type === 'application/pdf') {
    text = await extractTextFromPdf(file)
  } else {
    const Tesseract = await import('tesseract.js')
    text = (await Tesseract.recognize(file, 'spa')).data.text
  }
  return extractMenuOcrRowsFromText(text)
}

export default function RestaurantWorkspace({
  initialName,
  initialAccent,
  initialReceiptFooter,
  initialLogoUrl,
  initialTaxSettings,
  restaurantSlug,
  initialTables,
  initialZones,
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
  initialZones: ZoneDTO[]
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
  const [paymentModal, setPaymentModal] = useState<PendingPayment | null>(null)
  // Tables/orders, menu and inventory are all persisted in Supabase; each
  // mirrors the server's view and is refreshed with the result of every mutation.
  const [tables, setTables] = useState<TableDTO[]>(initialTables)
  const [activeTableId, setActiveTableId] = useState<string | null>(null)
  const [zones, setZones] = useState<ZoneDTO[]>(initialZones)
  const [zoneFilter, setZoneFilter] = useState<string | null>(null)
  const [zoneModalOpen, setZoneModalOpen] = useState(false)
  const [tableSettingsTarget, setTableSettingsTarget] = useState<TableDTO | null>(null)
  const [menu, setMenu] = useState<MenuDTO>(initialMenu)
  const [productModal, setProductModal] = useState<{ product?: MenuProductDTO } | null>(null)
  const [inventory, setInventory] = useState<InventoryItemDTO[]>(initialInventory)
  const [inventoryModalOpen, setInventoryModalOpen] = useState(false)
  const [inventoryEditTarget, setInventoryEditTarget] = useState<InventoryItemDTO | null>(null)
  const [importingInventory, setImportingInventory] = useState(false)
  const [ocrModalOpen, setOcrModalOpen] = useState(false)
  const [menuOcrModalOpen, setMenuOcrModalOpen] = useState(false)
  const [qrModalOpen, setQrModalOpen] = useState(false)
  const [taxSettings, setTaxSettings] = useState<TaxSettings>(initialTaxSettings)
  const [taxModalOpen, setTaxModalOpen] = useState(false)
  const [stats, setStats] = useState<RestaurantStatsDTO | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [shift, setShift] = useState<ShiftDTO | null>(initialShift)
  const [shiftModal, setShiftModal] = useState<'open' | null>(null)
  const [closeShiftSummary, setCloseShiftSummary] = useState<ShiftSummaryDTO | null>(null)
  const [closeShiftLoading, setCloseShiftLoading] = useState(false)
  const [expenseModalOpen, setExpenseModalOpen] = useState(false)
  const [comanda, setComanda] = useState<{ tableLabel: string; zoneName: string | null; items: ComandaItem[]; sentAt: string; comandaNumber: number; shiftNumber: number | null } | null>(null)
  const [recentSales, setRecentSales] = useState<SaleSummaryDTO[] | null>(null)
  const [salesLoading, setSalesLoading] = useState(false)
  const [reservations, setReservations] = useState<ReservationDTO[] | null>(null)
  const [reservationsLoading, setReservationsLoading] = useState(false)
  const [publicOrders, setPublicOrders] = useState<PublicOrderDTO[] | null>(null)
  const [publicOrdersLoading, setPublicOrdersLoading] = useState(false)

  const brandForeground = useMemo(() => contrastFor(accent), [accent])
  const brandText = useMemo(() => readableAccent(accent), [accent])
  const initials = useMemo(() => initialsOf(name), [name])
  const brandStyle = { '--brand': accent, '--brand-foreground': brandForeground, '--brand-text': brandText } as React.CSSProperties
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
    setTables((current) => [...current, { id: tempId, label: `Mesa ${current.length + 1}`, zoneId: null, orderId: null, items: [] }])
    addTable()
      .then(setTables)
      .catch(() => {
        setTables(previous)
        flashNotice('No se pudo agregar la mesa')
      })
  }

  const handleAddZone = async (name: string) => {
    setZones(await addZone(name))
    setZoneModalOpen(false)
  }

  const handleRenameTable = async (tableId: string, label: string) => {
    try {
      setTables(await renameTable(tableId, label))
    } catch (err) {
      flashNotice(err instanceof Error ? err.message : 'No se pudo renombrar la mesa')
    }
  }

  const handleAssignZone = async (tableId: string, zoneId: string | null) => {
    try {
      setTables(await assignTableZone(tableId, zoneId))
    } catch (err) {
      flashNotice(err instanceof Error ? err.message : 'No se pudo asignar la zona')
    }
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

  const payTable = (tableId: string, label: string, paymentMethod: PaymentMethod, tenderedCents?: number, isTakeout?: boolean) => {
    const previous = tables
    setTables((current) => current.map((t) => (t.id === tableId ? { ...t, items: [] } : t)))
    setActiveTableId(null)
    chargeTable(tableId, paymentMethod, tenderedCents, isTakeout)
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

  const payQuickSale = async (paymentMethod: PaymentMethod, tenderedCents?: number, isTakeout?: boolean) => {
    if (!quickCart.length) return
    const items = quickCart.map((l) => ({ productId: l.id, quantity: l.qty }))
    const { id: saleId } = await registerSale({ totalCents: Math.round(cartTotal(availableProducts, quickCart) * 100), paymentMethod, tenderedCents, isTakeout, items })
    setQuickCart([])
    setQuickSaleOpen(false)
    flashNotice('Venta registrada correctamente')
    window.open(`/boleta/${saleId}`, '_blank', 'noopener')
  }

  const confirmPayment = async (paymentMethod: PaymentMethod, tenderedCents: number | undefined, isTakeout: boolean) => {
    if (!paymentModal) return
    try {
      if (paymentModal.kind === 'table') {
        payTable(paymentModal.tableId, paymentModal.label, paymentMethod, tenderedCents, isTakeout)
      } else {
        await payQuickSale(paymentMethod, tenderedCents, isTakeout)
      }
      setPaymentModal(null)
    } catch (err) {
      flashNotice(err instanceof Error ? err.message : 'No se pudo registrar el cobro')
    }
  }

  const handleSendComanda = (tableId: string, tableLabel: string, zoneName: string | null) => {
    sendComanda(tableId)
      .then(({ tables: updated, items, sentAt, comandaNumber, shiftNumber }) => {
        setTables(updated)
        setComanda({ tableLabel, zoneName, items, sentAt, comandaNumber, shiftNumber })
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
    const sign = closed.differenceCents < 0 ? '-' : ''
    flashNotice(
      closed.differenceCents
        ? `Turno cerrado · diferencia ${sign}$${Math.abs(closed.differenceCents / 100).toFixed(2)} · reporte enviado por correo`
        : 'Turno cerrado sin diferencias · reporte enviado por correo',
    )
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

  const handleImportMenuOcr = async (items: { name: string; priceCents: number; description?: string; categoryName?: string }[]) => {
    setMenu(await importMenuProducts(items))
    setMenuOcrModalOpen(false)
    flashNotice(`${items.length} producto${items.length === 1 ? '' : 's'} importado${items.length === 1 ? '' : 's'} desde el archivo`)
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

  const handleUpdateInventoryItem = async (input: { name: string; unit: string; stock: number; minimumStock: number; costCents: number }) => {
    if (!inventoryEditTarget) return
    setInventory(await updateInventoryItem(inventoryEditTarget.id, input))
  }

  const handleDeleteInventoryItem = async (item: InventoryItemDTO) => {
    try {
      setInventory(await deleteInventoryItem(item.id))
    } catch {
      flashNotice('No se pudo eliminar el insumo')
    }
  }

  const handleApplyOcrUpdates = async (updates: { itemId: string; stock: number }[]) => {
    setInventory(await applyOcrInventoryUpdates(updates))
    setOcrModalOpen(false)
    flashNotice(`${updates.length} insumo${updates.length === 1 ? '' : 's'} actualizado${updates.length === 1 ? '' : 's'} desde la foto`)
  }

  const handleImportInventory = async (file: File) => {
    setImportingInventory(true)
    try {
      const rows = await parseInventoryFile(file)
      if (!rows.length) {
        flashNotice('No se encontraron filas válidas (revisa nombre y unidad)')
        return
      }
      setInventory(await importInventoryItems(rows))
      flashNotice(`${rows.length} insumo${rows.length === 1 ? '' : 's'} importado${rows.length === 1 ? '' : 's'}`)
    } catch (err) {
      flashNotice(err instanceof Error ? err.message : 'No se pudo importar el archivo')
    } finally {
      setImportingInventory(false)
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
    { label: 'Reservas', icon: CalendarDays },
    { label: 'Pedidos online', icon: Truck },
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
      getRestaurantStats()
        .then(setStats)
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
    if (s === 'Reservas' && !reservations && !reservationsLoading) {
      setReservationsLoading(true)
      listReservations()
        .then(setReservations)
        .catch(() => flashNotice('No se pudieron cargar las reservas'))
        .finally(() => setReservationsLoading(false))
    }
    if (s === 'Pedidos online' && !publicOrders && !publicOrdersLoading) {
      setPublicOrdersLoading(true)
      listPublicOrders()
        .then(setPublicOrders)
        .catch(() => flashNotice('No se pudieron cargar los pedidos'))
        .finally(() => setPublicOrdersLoading(false))
    }
  }

  const handleReservationStatus = async (id: string, status: 'confirmed' | 'rejected' | 'cancelled') => {
    try {
      setReservations(await setReservationStatus(id, status))
    } catch {
      flashNotice('No se pudo actualizar la reserva')
    }
  }

  const handlePublicOrderStatus = async (id: string, status: 'accepted' | 'ready' | 'completed' | 'cancelled') => {
    try {
      setPublicOrders(await setPublicOrderStatus(id, status))
    } catch {
      flashNotice('No se pudo actualizar el pedido')
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
            <p className="truncate font-semibold text-sidebar-foreground">{name}</p>
            <p className="text-[11px] text-sidebar-foreground/65">Workspace restaurante</p>
          </div>
          <button type="button" aria-label="Cerrar menú" className="ml-auto text-sidebar-foreground lg:hidden" onClick={() => setMenuOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-6">
          {nav.map(({ label, icon: Icon }) => (
            <button
              type="button"
              key={label}
              onClick={() => goToSection(label)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${section === label ? 'bg-[var(--brand)] text-[var(--brand-foreground)]' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}
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
            className="flex w-full items-center gap-3 rounded-lg p-3 text-left text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <div className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">{initials}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{userName}</p>
              <p className="text-xs opacity-65">Configuración</p>
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
                onPay={() =>
                  setPaymentModal({ kind: 'table', tableId: activeTable.id, label: activeTable.label, totalCents: Math.round(orderItemsTotal(activeTable.items) * 100) })
                }
                onSendComanda={() => handleSendComanda(activeTable.id, activeTable.label, zones.find((z) => z.id === activeTable.zoneId)?.name ?? null)}
              />
            ) : (
              <TableGrid
                tables={tables}
                zones={zones}
                zoneFilter={zoneFilter}
                onFilterZone={setZoneFilter}
                onSelect={setActiveTableId}
                onAddTable={handleAddTable}
                onAddZone={() => setZoneModalOpen(true)}
                onEditTable={setTableSettingsTarget}
              />
            ))}

          {section === 'Carta' && (
            <Catalog
              menu={menu}
              restaurantSlug={restaurantSlug}
              onOpenCreate={() => setProductModal({})}
              onEdit={(product) => setProductModal({ product })}
              onToggleAvailability={handleToggleAvailability}
              onDelete={handleDeleteProduct}
              onOpenQr={() => setQrModalOpen(true)}
              onOpenOcr={() => setMenuOcrModalOpen(true)}
            />
          )}
          {section === 'Inventario' && (
            <Inventory
              items={inventory}
              onOpenCreate={() => setInventoryModalOpen(true)}
              onEdit={setInventoryEditTarget}
              onDelete={handleDeleteInventoryItem}
              onImportFile={handleImportInventory}
              importing={importingInventory}
              onOpenOcr={() => setOcrModalOpen(true)}
            />
          )}
          {section === 'Reservas' && <Reservations reservations={reservations} loading={reservationsLoading} onSetStatus={handleReservationStatus} />}
          {section === 'Pedidos online' && <PublicOrders orders={publicOrders} loading={publicOrdersLoading} onSetStatus={handlePublicOrderStatus} restaurantSlug={restaurantSlug} />}
          {section === 'Estadísticas' && <Stats stats={stats} loading={statsLoading} />}
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
          onPay={() => setPaymentModal({ kind: 'quick', totalCents: Math.round(cartTotal(availableProducts, quickCart) * 100) })}
        />
      )}

      {productModal && (
        <ProductFormModal
          initial={productModal.product}
          categories={menu.categories.map((c) => c.name)}
          inventory={inventory}
          onClose={() => setProductModal(null)}
          onSubmit={(input) => (productModal.product ? handleUpdateProduct(productModal.product.id, input) : handleAddProduct(input))}
        />
      )}

      {inventoryModalOpen && <InventoryFormModal onClose={() => setInventoryModalOpen(false)} onSubmit={handleAddInventoryItem} />}

      {inventoryEditTarget && (
        <InventoryFormModal initial={inventoryEditTarget} onClose={() => setInventoryEditTarget(null)} onSubmit={handleUpdateInventoryItem} />
      )}

      {qrModalOpen && <QrModal restaurantSlug={restaurantSlug} restaurantName={name} onClose={() => setQrModalOpen(false)} />}

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

      {paymentModal && <PaymentModal totalCents={paymentModal.totalCents} onClose={() => setPaymentModal(null)} onConfirm={confirmPayment} />}

      {ocrModalOpen && <IngredientOcrModal items={inventory} onClose={() => setOcrModalOpen(false)} onApply={handleApplyOcrUpdates} />}

      {menuOcrModalOpen && (
        <MenuOcrModal categories={menu.categories.map((c) => c.name)} onClose={() => setMenuOcrModalOpen(false)} onApply={handleImportMenuOcr} />
      )}

      {zoneModalOpen && <AddZoneModal onClose={() => setZoneModalOpen(false)} onSubmit={handleAddZone} />}

      {tableSettingsTarget && (
        <TableSettingsModal
          table={tableSettingsTarget}
          zones={zones}
          onClose={() => setTableSettingsTarget(null)}
          onRename={(label) => handleRenameTable(tableSettingsTarget.id, label)}
          onAssignZone={(zoneId) => handleAssignZone(tableSettingsTarget.id, zoneId)}
        />
      )}

      {comanda && (
        <ComandaModal
          tableLabel={comanda.tableLabel}
          zoneName={comanda.zoneName}
          items={comanda.items}
          sentAt={comanda.sentAt}
          comandaNumber={comanda.comandaNumber}
          shiftNumber={comanda.shiftNumber}
          onClose={() => setComanda(null)}
        />
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

function SectionHeader({
  title,
  subtitle,
  icon: Icon,
  action,
}: Readonly<{ title: string; subtitle: string; icon?: LucideIcon; action?: React.ReactNode }>) {
  return (
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div className="flex items-center gap-3">
        {Icon && (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)]/12 text-[var(--brand-text)]">
            <Icon size={20} />
          </span>
        )}
        <div>
          <p className="mb-1 text-sm font-medium text-[var(--brand-text)]">{subtitle}</p>
          <h2 className="text-3xl font-semibold tracking-tight">{title}</h2>
        </div>
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
        icon={BarChart3}
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
          <div key={a} className="rounded-xl border border-border bg-card shadow-sm p-5">
            <p className="text-sm text-muted-foreground">{a}</p>
            <p className="mt-3 text-2xl font-semibold">{b}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm p-6">
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

function TableGrid({
  tables,
  zones,
  zoneFilter,
  onFilterZone,
  onSelect,
  onAddTable,
  onAddZone,
  onEditTable,
}: Readonly<{
  tables: TableDTO[]
  zones: ZoneDTO[]
  zoneFilter: string | null
  onFilterZone: (zoneId: string | null) => void
  onSelect: (id: string) => void
  onAddTable: () => void
  onAddZone: () => void
  onEditTable: (table: TableDTO) => void
}>) {
  const visibleTables = zoneFilter ? tables.filter((t) => t.zoneId === zoneFilter) : tables
  const zoneName = (zoneId: string | null) => zones.find((z) => z.id === zoneId)?.name ?? null

  return (
    <div className="flex flex-col gap-7">
      <SectionHeader
        title="Mesas"
        subtitle="Toca una mesa para abrir o continuar su cuenta"
        icon={ShoppingBag}
        action={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onAddZone} className="flex h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted">
              <MapPin size={16} /> Agregar zona
            </button>
            <button type="button" onClick={onAddTable} className="flex h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted">
              <Plus size={16} /> Agregar mesa
            </button>
          </div>
        }
      />

      {zones.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onFilterZone(null)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${!zoneFilter ? 'bg-[var(--brand)] text-[var(--brand-foreground)]' : 'border border-border text-muted-foreground hover:bg-muted'}`}
          >
            Todas
          </button>
          {zones.map((zone) => (
            <button
              key={zone.id}
              type="button"
              onClick={() => onFilterZone(zone.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${zoneFilter === zone.id ? 'bg-[var(--brand)] text-[var(--brand-foreground)]' : 'border border-border text-muted-foreground hover:bg-muted'}`}
            >
              {zone.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {visibleTables.map((table) => {
          const occupied = table.items.length > 0
          const itemCount = table.items.reduce((sum, l) => sum + l.quantity, 0)
          const zone = zoneName(table.zoneId)
          return (
            <div
              key={table.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(table.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onSelect(table.id)
              }}
              className={`relative flex cursor-pointer flex-col items-start gap-3 rounded-xl border p-5 text-left transition ${
                occupied ? 'border-[var(--brand)] bg-[var(--brand)]/10' : 'border-border bg-card hover:border-[var(--brand)]'
              }`}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onEditTable(table)
                }}
                aria-label={`Editar ${table.label}`}
                className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              >
                <Settings2 size={14} />
              </button>
              <div className="flex w-full items-center justify-between pr-6">
                <span className="font-semibold">{table.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    occupied ? 'bg-[var(--brand)] text-[var(--brand-foreground)]' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {occupied ? 'Ocupada' : 'Libre'}
                </span>
              </div>
              {zone && <span className="text-[11px] text-muted-foreground">{zone}</span>}
              {occupied ? (
                <div className="text-sm text-muted-foreground">
                  <p>{itemCount} producto{itemCount === 1 ? '' : 's'}</p>
                  <p className="mt-0.5 font-semibold text-foreground">$ {orderItemsTotal(table.items).toFixed(2)}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sin cuenta abierta</p>
              )}
            </div>
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
                  className="rounded-xl border border-border bg-card shadow-sm p-5 text-left transition hover:border-[var(--brand)]"
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
    <div className="h-fit rounded-xl border border-border bg-card shadow-sm p-5">
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
            <p className="text-sm text-[var(--brand-text)]">Venta rápida</p>
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
  onOpenQr,
  onOpenOcr,
}: Readonly<{
  menu: MenuDTO
  restaurantSlug: string
  onOpenCreate: () => void
  onEdit: (product: MenuProductDTO) => void
  onToggleAvailability: (product: MenuProductDTO) => void
  onDelete: (product: MenuProductDTO) => void
  onOpenQr: () => void
  onOpenOcr: () => void
}>) {
  return (
    <div className="flex flex-col gap-7">
      <SectionHeader
        title="Carta del restaurante"
        subtitle="Productos y categorías"
        icon={UtensilsCrossed}
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
            <button type="button" onClick={onOpenQr} className="flex h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted">
              <QrCode size={16} /> Código QR
            </button>
            <button type="button" onClick={onOpenOcr} className="flex h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted">
              <ScanLine size={16} /> Importar de una foto
            </button>
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
                    {p.tags.map((tag) => {
                      const TagIcon = iconForTag(tag)
                      return (
                        <span key={tag} className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          <TagIcon size={11} /> {tag}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label={p.isAvailable ? `Marcar ${p.name} como no disponible` : `Marcar ${p.name} como disponible`}
                  onClick={() => onToggleAvailability(p)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${p.isAvailable ? 'bg-[var(--brand)]/10 text-[var(--brand-text)]' : 'bg-muted text-muted-foreground'}`}
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
  inventory,
  onClose,
  onSubmit,
}: Readonly<{
  initial?: MenuProductDTO
  categories: string[]
  inventory: InventoryItemDTO[]
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

  const [ingredients, setIngredients] = useState<ProductIngredientDTO[]>([])
  const [newIngredientId, setNewIngredientId] = useState('')
  const [newIngredientQty, setNewIngredientQty] = useState('1')
  const [newIngredientOptional, setNewIngredientOptional] = useState(false)

  useEffect(() => {
    if (!initial) return
    listProductIngredients(initial.id).then(setIngredients).catch(() => {})
  }, [initial])

  const availableForRecipe = inventory.filter((i) => !ingredients.some((link) => link.inventoryItemId === i.id))

  const saveIngredientLinks = async (links: IngredientLinkInput[]) => {
    if (!initial) return
    try {
      setIngredients(await setProductIngredients(initial.id, links))
    } catch {
      setError('No se pudo actualizar la receta')
    }
  }

  const addIngredient = () => {
    if (!newIngredientId) return
    const qty = parseFloat(newIngredientQty)
    if (!Number.isFinite(qty) || qty <= 0) return
    const links: IngredientLinkInput[] = [
      ...ingredients.map((l) => ({ inventoryItemId: l.inventoryItemId, quantityPerUnit: l.quantityPerUnit, isOptional: l.isOptional })),
      { inventoryItemId: newIngredientId, quantityPerUnit: qty, isOptional: newIngredientOptional },
    ]
    saveIngredientLinks(links)
    setNewIngredientId('')
    setNewIngredientQty('1')
    setNewIngredientOptional(false)
  }

  const removeIngredient = (linkId: string) => {
    const links: IngredientLinkInput[] = ingredients
      .filter((l) => l.id !== linkId)
      .map((l) => ({ inventoryItemId: l.inventoryItemId, quantityPerUnit: l.quantityPerUnit, isOptional: l.isOptional }))
    saveIngredientLinks(links)
  }

  // Edits an already-added ingredient in place (quantity or "opcional") —
  // updates local state immediately so the input feels responsive, then
  // persists the full set once the value settles (on blur for the quantity
  // field; immediately for the checkbox, which has no blur moment of its own).
  const updateIngredient = (linkId: string, patch: Partial<Pick<ProductIngredientDTO, 'quantityPerUnit' | 'isOptional'>>) => {
    setIngredients((current) => current.map((l) => (l.id === linkId ? { ...l, ...patch } : l)))
  }

  // `override` lets a caller persist a value it just applied without waiting
  // for the setIngredients above to land (state updates aren't synchronous).
  const persistIngredients = (override?: { linkId: string; patch: Partial<Pick<ProductIngredientDTO, 'quantityPerUnit' | 'isOptional'>> }) => {
    const links: IngredientLinkInput[] = ingredients.map((l) => {
      const merged = override && l.id === override.linkId ? { ...l, ...override.patch } : l
      return { inventoryItemId: merged.inventoryItemId, quantityPerUnit: merged.quantityPerUnit, isOptional: merged.isOptional }
    })
    saveIngredientLinks(links)
  }

  const toggleTag = (tag: string) => setTags((current) => (current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]))
  const addCustomTag = () => {
    const value = customTag.trim()
    if (value && !tags.includes(value)) setTags((current) => [...current, value])
    setCustomTag('')
  }
  const extraTags = tags.filter((t) => !COMMON_PRODUCT_TAGS.includes(t))

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
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
              {COMMON_PRODUCT_TAGS.map((tag) => {
                const TagIcon = iconForTag(tag)
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${tags.includes(tag) ? 'border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand-text)]' : 'border-border text-muted-foreground'}`}
                  >
                    <TagIcon size={13} /> {tag}
                  </button>
                )
              })}
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
                {extraTags.map((tag) => {
                  const TagIcon = iconForTag(tag)
                  return (
                    <span key={tag} className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs">
                      <TagIcon size={12} /> {tag}
                      <button type="button" onClick={() => toggleTag(tag)} aria-label={`Quitar etiqueta ${tag}`}>
                        <X size={12} />
                      </button>
                    </span>
                  )
                })}
              </div>
            )}
          </div>

          <div>
            <p className="mb-1 text-sm font-medium">Receta (ingredientes que consume)</p>
            {initial ? (
              <>
                <p className="mb-2 text-xs text-muted-foreground">
                  Marca "opcional" para insumos que solo se descuentan en ventas "para llevar" (ej. envase).
                </p>
                {ingredients.length > 0 && (
                  <div className="mb-2 flex flex-col gap-1.5">
                    {ingredients.map((link) => (
                      <div key={link.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm shadow-sm">
                        <span className="min-w-0 flex-1 truncate font-medium">{link.inventoryItemName}</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={link.quantityPerUnit}
                          onChange={(e) => updateIngredient(link.id, { quantityPerUnit: Number.parseFloat(e.target.value) || 0 })}
                          onBlur={() => persistIngredients()}
                          aria-label={`Cantidad de ${link.inventoryItemName} por unidad`}
                          className="h-8 w-20 rounded-md border border-input bg-background px-2 text-xs"
                        />
                        <span className="text-xs text-muted-foreground">{link.unit}</span>
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={link.isOptional}
                            onChange={(e) => {
                              const isOptional = e.target.checked
                              updateIngredient(link.id, { isOptional })
                              persistIngredients({ linkId: link.id, patch: { isOptional } })
                            }}
                            className="size-3.5"
                          />
                          Opcional
                        </label>
                        <button type="button" onClick={() => removeIngredient(link.id)} aria-label={`Quitar ${link.inventoryItemName} de la receta`} className="shrink-0 text-muted-foreground hover:text-destructive">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {availableForRecipe.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <select value={newIngredientId} onChange={(e) => setNewIngredientId(e.target.value)} className="h-9 flex-1 rounded-lg border border-input bg-background px-2 text-sm">
                      <option value="">Elegir insumo…</option>
                      {availableForRecipe.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name} ({i.unit})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={newIngredientQty}
                      onChange={(e) => setNewIngredientQty(e.target.value)}
                      className="h-9 w-20 rounded-lg border border-input bg-background px-2 text-sm"
                    />
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input type="checkbox" checked={newIngredientOptional} onChange={(e) => setNewIngredientOptional(e.target.checked)} className="size-3.5" />
                      Opcional
                    </label>
                    <button type="button" onClick={addIngredient} disabled={!newIngredientId} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
                      + Agregar
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {inventory.length ? 'Ya agregaste todos los insumos disponibles.' : 'Agrega insumos en Inventario para poder vincularlos aquí.'}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Guarda el producto primero para poder asignarle una receta.</p>
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

const INVENTORY_TEMPLATE_CSV = 'Nombre,Unidad,Existencias,Stock minimo,Costo unitario\nCarne de res,kg,24,5,120.00\nPan brioche,paquetes,8,3,45.00\n'

function InventoryCard({ item, onEdit, onDelete }: Readonly<{ item: InventoryItemDTO; onEdit: () => void; onDelete: () => void }>) {
  const low = item.stock <= item.minimumStock
  const priceDeltaPct = item.previousCostCents ? Math.round(((item.costCents - item.previousCostCents) / item.previousCostCents) * 100) : null

  return (
    <div className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{item.name}</p>
          <p className="text-sm text-muted-foreground">
            {item.stock} {item.unit}
          </p>
        </div>
        <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          <button type="button" aria-label={`Editar ${item.name}`} onClick={onEdit} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
            <Pencil size={14} />
          </button>
          <button type="button" aria-label={`Eliminar ${item.name}`} onClick={onDelete} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <span className={`w-fit rounded-full px-2.5 py-0.5 text-[11px] font-medium ${low ? 'bg-destructive/10 text-destructive' : 'bg-[var(--brand)]/10 text-[var(--brand-text)]'}`}>
        {low ? 'Stock bajo' : 'Stock saludable'}
      </span>

      <div className="flex items-baseline justify-between border-t border-border pt-3 text-sm">
        <span className="text-muted-foreground">Costo unitario</span>
        <span className="font-semibold">$ {(item.costCents / 100).toFixed(2)}</span>
      </div>
      {priceDeltaPct !== null && item.previousCostCents !== null && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Última compra: $ {(item.previousCostCents / 100).toFixed(2)}</span>
          {priceDeltaPct !== 0 && (
            <span className={priceDeltaPct > 0 ? 'font-medium text-destructive' : 'font-medium text-[var(--brand-text)]'}>
              {priceDeltaPct > 0 ? '↑' : '↓'} {Math.abs(priceDeltaPct)}%
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function Inventory({
  items,
  onOpenCreate,
  onEdit,
  onDelete,
  onImportFile,
  importing,
  onOpenOcr,
}: Readonly<{
  items: InventoryItemDTO[]
  onOpenCreate: () => void
  onEdit: (item: InventoryItemDTO) => void
  onDelete: (item: InventoryItemDTO) => void
  onImportFile: (file: File) => void
  importing: boolean
  onOpenOcr: () => void
}>) {
  return (
    <div className="flex flex-col gap-7">
      <SectionHeader
        title="Inventario"
        subtitle="Existencias de la sucursal"
        icon={Package}
        action={
          <div className="flex flex-wrap gap-2">
            <a
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(INVENTORY_TEMPLATE_CSV)}`}
              download="plantilla-inventario.csv"
              className="flex h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted"
            >
              <FileText size={16} /> Plantilla
            </a>
            <label className={`flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted ${importing ? 'opacity-60' : ''}`}>
              <Upload size={16} /> {importing ? 'Importando…' : 'Importar Excel'}
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                disabled={importing}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) onImportFile(file)
                  e.target.value = ''
                }}
              />
            </label>
            <button type="button" onClick={onOpenOcr} className="flex h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted">
              <ScanLine size={16} /> Actualizar por foto
            </button>
            <button type="button" onClick={onOpenCreate} className="flex h-11 items-center gap-2 rounded-lg bg-[var(--brand)] px-4 text-[var(--brand-foreground)]">
              <Plus /> Agregar insumo
            </button>
          </div>
        }
      />
      {items.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <InventoryCard key={item.id} item={item} onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Todavía no agregaste insumos.</div>
      )}
    </div>
  )
}

function InventoryFormModal({
  initial,
  onClose,
  onSubmit,
}: Readonly<{ initial?: InventoryItemDTO; onClose: () => void; onSubmit: (input: { name: string; unit: string; stock: number; minimumStock: number; costCents: number }) => Promise<void> }>) {
  const [name, setName] = useState(initial?.name ?? '')
  const [unit, setUnit] = useState(initial?.unit ?? '')
  const [stock, setStock] = useState(initial ? String(initial.stock) : '')
  const [minimumStock, setMinimumStock] = useState(initial ? String(initial.minimumStock) : '')
  const [cost, setCost] = useState(initial ? (initial.costCents / 100).toFixed(2) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const newCostCents = Math.round((Number.parseFloat(cost) || 0) * 100)
  const costChanging = !!initial && newCostCents !== initial.costCents

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
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
        stock: Number.parseFloat(stock) || 0,
        minimumStock: Number.parseFloat(minimumStock) || 0,
        costCents: newCostCents,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el insumo')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-5">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-semibold">{initial ? 'Editar insumo' : 'Nuevo insumo'}</h2>
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
          {initial?.previousCostCents !== null && initial?.previousCostCents !== undefined && (
            <p className="text-xs text-muted-foreground">Última compra: $ {(initial.previousCostCents / 100).toFixed(2)}</p>
          )}
          {costChanging && (
            <p className="rounded-lg bg-accent px-3 py-2 text-xs text-accent-foreground">
              El costo actual (${(initial!.costCents / 100).toFixed(2)}) quedará guardado como "última compra" al guardar este cambio.
            </p>
          )}
          {error && <p role="alert" className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">{error}</p>}
          <button type="submit" disabled={saving} className="h-11 rounded-lg bg-[var(--brand)] text-[var(--brand-foreground)] disabled:opacity-60">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      </div>
    </div>
  )
}

function Stats({ stats, loading }: Readonly<{ stats: RestaurantStatsDTO | null; loading: boolean }>) {
  return (
    <div className="flex flex-col gap-7">
      <SectionHeader title="Estadísticas" subtitle="Qué se vende más en tu restaurante" icon={TrendingUp} />

      {loading || !stats ? (
        <p className="text-sm text-muted-foreground">{loading ? 'Cargando estadísticas…' : 'Sin datos todavía.'}</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card shadow-sm p-5 transition hover:shadow-md">
              <p className="text-sm text-muted-foreground">Ventas totales (histórico)</p>
              <p className="mt-3 text-2xl font-semibold">$ {(stats.totalSalesCents / 100).toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card shadow-sm p-5 transition hover:shadow-md">
              <p className="text-sm text-muted-foreground">Ventas registradas</p>
              <p className="mt-3 text-2xl font-semibold">{stats.totalOrders}</p>
            </div>
            <div className="rounded-xl border border-border bg-card shadow-sm p-5 transition hover:shadow-md">
              <p className="text-sm text-muted-foreground">Turnos cerrados</p>
              <p className="mt-3 text-2xl font-semibold">{stats.shiftsClosed}</p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card shadow-sm">
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

          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border p-5">
              <h3 className="font-semibold">Turnos</h3>
              <p className="mt-1 text-xs text-muted-foreground">El detalle de apertura, cierre y arqueo de caja de cada turno se envía por correo</p>
            </div>
            <div className="flex flex-col gap-2 p-5 text-sm text-muted-foreground">
              <p>
                Para no acumular esa información en el sistema, al cerrar un turno te enviamos por correo el reporte completo de caja (base, ventas por
                método de pago, gastos, arqueo) junto con un recibo por cada venta, y luego se elimina del sistema. Revisa tu correo para ver el
                historial de turnos.
              </p>
              {stats.shiftsClosed > 0 && <p className="text-foreground">Llevas {stats.shiftsClosed} turno{stats.shiftsClosed === 1 ? '' : 's'} cerrado{stats.shiftsClosed === 1 ? '' : 's'} en total.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const RESERVATION_STATUS_LABEL: Record<ReservationDTO['status'], string> = { pending: 'Pendiente', confirmed: 'Confirmada', rejected: 'Rechazada', cancelled: 'Cancelada' }
const RESERVATION_STATUS_CLASS: Record<ReservationDTO['status'], string> = {
  pending: 'bg-accent text-accent-foreground',
  confirmed: 'bg-[var(--brand)]/10 text-[var(--brand-text)]',
  rejected: 'bg-destructive/10 text-destructive',
  cancelled: 'bg-muted text-muted-foreground',
}

function Reservations({
  reservations,
  loading,
  onSetStatus,
}: Readonly<{ reservations: ReservationDTO[] | null; loading: boolean; onSetStatus: (id: string, status: 'confirmed' | 'rejected' | 'cancelled') => void }>) {
  return (
    <div className="flex flex-col gap-7">
      <SectionHeader title="Reservas" subtitle="Solicitudes enviadas desde tu carta pública" icon={CalendarDays} />

      {loading || !reservations ? (
        <p className="text-sm text-muted-foreground">{loading ? 'Cargando reservas…' : 'Sin datos todavía.'}</p>
      ) : reservations.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {reservations.map((r) => (
            <div key={r.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{r.customerName}</p>
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Phone size={13} /> {r.customerPhone}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${RESERVATION_STATUS_CLASS[r.status]}`}>{RESERVATION_STATUS_LABEL[r.status]}</span>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <CalendarDays size={14} /> {new Date(r.reservationAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
                <span>{r.partySize} persona{r.partySize === 1 ? '' : 's'}</span>
              </div>
              {r.notes && <p className="text-sm text-muted-foreground">"{r.notes}"</p>}
              {r.status === 'pending' && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => onSetStatus(r.id, 'confirmed')} className="h-9 flex-1 rounded-lg bg-[var(--brand)] text-xs font-medium text-[var(--brand-foreground)]">
                    Confirmar
                  </button>
                  <button type="button" onClick={() => onSetStatus(r.id, 'rejected')} className="h-9 flex-1 rounded-lg border border-border text-xs font-medium hover:bg-muted">
                    Rechazar
                  </button>
                </div>
              )}
              {r.status === 'confirmed' && (
                <button type="button" onClick={() => onSetStatus(r.id, 'cancelled')} className="h-9 rounded-lg border border-border text-xs font-medium hover:bg-muted">
                  Cancelar reserva
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Todavía no hay reservas. Tus clientes pueden reservar mesa desde tu carta pública.
        </div>
      )}
    </div>
  )
}

const ORDER_STATUS_LABEL: Record<PublicOrderDTO['status'], string> = { pending: 'Pendiente', accepted: 'Aceptado', ready: 'Listo', completed: 'Completado', cancelled: 'Cancelado' }
const ORDER_STATUS_CLASS: Record<PublicOrderDTO['status'], string> = {
  pending: 'bg-accent text-accent-foreground',
  accepted: 'bg-[var(--brand)]/10 text-[var(--brand-text)]',
  ready: 'bg-[var(--brand)]/10 text-[var(--brand-text)]',
  completed: 'bg-muted text-muted-foreground',
  cancelled: 'bg-destructive/10 text-destructive',
}

function PublicOrders({
  orders,
  loading,
  onSetStatus,
  restaurantSlug,
}: Readonly<{
  orders: PublicOrderDTO[] | null
  loading: boolean
  onSetStatus: (id: string, status: 'accepted' | 'ready' | 'completed' | 'cancelled') => void
  restaurantSlug: string
}>) {
  return (
    <div className="flex flex-col gap-7">
      <SectionHeader
        title="Pedidos online"
        subtitle="Domicilio y recoger, pedidos desde tu carta pública"
        icon={Truck}
        action={
          <a href={`/carta/${restaurantSlug}`} target="_blank" rel="noreferrer" className="flex h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted">
            <ExternalLink size={16} /> Ver carta pública
          </a>
        }
      />

      {loading || !orders ? (
        <p className="text-sm text-muted-foreground">{loading ? 'Cargando pedidos…' : 'Sin datos todavía.'}</p>
      ) : orders.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {orders.map((o) => (
            <div key={o.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{o.customerName}</p>
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Phone size={13} /> {o.customerPhone}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${ORDER_STATUS_CLASS[o.status]}`}>{ORDER_STATUS_LABEL[o.status]}</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {o.fulfillment === 'delivery' ? <Truck size={14} /> : <Store size={14} />}
                {o.fulfillment === 'delivery' ? o.address : 'Recoger en el restaurante'}
              </div>
              <div className="flex flex-col gap-1 border-t border-dashed border-border pt-3 text-sm">
                {o.items.map((item, i) => (
                  <div key={`${item.productName}-${i}`} className="flex justify-between">
                    <span>{item.quantity} × {item.productName}</span>
                    <span className="text-muted-foreground">$ {((item.unitPriceCents * item.quantity) / 100).toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-dashed border-border pt-1.5 font-semibold">
                  <span>Total</span>
                  <span>$ {(o.totalCents / 100).toFixed(2)}</span>
                </div>
              </div>
              {o.notes && <p className="text-sm text-muted-foreground">"{o.notes}"</p>}
              {o.status === 'pending' && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => onSetStatus(o.id, 'accepted')} className="h-9 flex-1 rounded-lg bg-[var(--brand)] text-xs font-medium text-[var(--brand-foreground)]">
                    Aceptar
                  </button>
                  <button type="button" onClick={() => onSetStatus(o.id, 'cancelled')} className="h-9 flex-1 rounded-lg border border-border text-xs font-medium hover:bg-muted">
                    Rechazar
                  </button>
                </div>
              )}
              {o.status === 'accepted' && (
                <button type="button" onClick={() => onSetStatus(o.id, 'ready')} className="h-9 rounded-lg bg-[var(--brand)] text-xs font-medium text-[var(--brand-foreground)]">
                  Marcar listo
                </button>
              )}
              {o.status === 'ready' && (
                <button type="button" onClick={() => onSetStatus(o.id, 'completed')} className="h-9 rounded-lg border border-border text-xs font-medium hover:bg-muted">
                  Marcar completado
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Todavía no hay pedidos. Tus clientes pueden pedir domicilio o para recoger desde tu carta pública.
        </div>
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
        icon={Receipt}
        action={
          <button type="button" onClick={onOpenSettings} className="flex h-11 items-center gap-2 rounded-lg bg-[var(--brand)] px-4 text-[var(--brand-foreground)]">
            <FileText /> Configurar facturación
          </button>
        }
      />

      <div className="rounded-xl border border-border bg-card shadow-sm p-5">
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

      <div className="rounded-xl border border-border bg-card shadow-sm">
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
                      <a href={`/boleta/${s.id}`} target="_blank" rel="noreferrer" className="text-xs font-medium text-[var(--brand-text)] hover:underline">
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

function QrModal({ restaurantSlug, restaurantName, onClose }: Readonly<{ restaurantSlug: string; restaurantName: string; onClose: () => void }>) {
  const [dataUrl, setDataUrl] = useState('')
  const [error, setError] = useState('')
  const url = typeof window !== 'undefined' ? `${window.location.origin}/carta/${restaurantSlug}` : `/carta/${restaurantSlug}`

  useEffect(() => {
    let cancelled = false
    import('qrcode')
      .then((QRCode) => QRCode.toDataURL(url, { width: 480, margin: 2 }))
      .then((generated) => {
        if (!cancelled) setDataUrl(generated)
      })
      .catch(() => {
        if (!cancelled) setError('No se pudo generar el código QR')
      })
    return () => {
      cancelled = true
    }
  }, [url])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-5">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center">
        <div className="flex items-start justify-between text-left">
          <div>
            <p className="text-sm text-[var(--brand-text)]">Carta pública</p>
            <h2 className="text-xl font-semibold">Código QR</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X />
          </button>
        </div>
        <p className="mt-4 break-all text-xs text-muted-foreground">{url}</p>
        <div className="mt-4 flex justify-center">
          {dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dataUrl} alt={`Código QR de la carta de ${restaurantName}`} className="size-56 rounded-lg border border-border" />
          ) : (
            <div className="flex size-56 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
              {error || 'Generando…'}
            </div>
          )}
        </div>
        {dataUrl && (
          <a href={dataUrl} download={`qr-carta-${restaurantSlug}.png`} className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--brand)] text-sm font-medium text-[var(--brand-foreground)]">
            <QrCode size={16} /> Descargar
          </a>
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

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
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
        className="flex h-10 items-center gap-2 rounded-lg border border-[var(--brand)] bg-[var(--brand)]/10 px-3 text-xs font-medium text-[var(--brand-text)]"
      >
        Turno {shift.shiftNumber ?? '—'} · $ {(shift.openingCashCents / 100).toFixed(2)} · {shift.openedByName.split(/\s+/)[0]}
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

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
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

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
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
            <p className="text-sm text-[var(--brand-text)]">Arqueo de caja</p>
            <h2 className="text-xl font-semibold">Cierre de turno {summary ? summary.shift.shiftNumber ?? '' : ''}</h2>
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
                <button type="button" onClick={onAddExpense} className="text-xs font-medium text-[var(--brand-text)] hover:underline">+ Agregar</button>
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

            {summary.openTableLabels.length > 0 ? (
              <p role="alert" className="mt-5 rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
                No podés cerrar el turno: quedan cuentas abiertas en {summary.openTableLabels.join(', ')}. Cobralas o liberalas primero.
              </p>
            ) : (
              <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
                <label className="flex flex-col gap-2 text-sm font-medium">
                  ¿Con cuánto efectivo contaste al cerrar?
                  <input required autoFocus type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-11 rounded-lg border border-input bg-background px-3" />
                </label>
                {difference !== null && (
                  <p className={`text-sm ${difference === 0 ? 'text-muted-foreground' : difference > 0 ? 'text-[var(--brand-text)]' : 'text-destructive'}`}>
                    {difference === 0 ? 'Cuadra exacto.' : `Diferencia: ${difference > 0 ? '+' : '-'}$ ${Math.abs(difference / 100).toFixed(2)}`}
                  </p>
                )}
                {error && <p role="alert" className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">{error}</p>}
                <p className="text-xs text-muted-foreground">
                  Al cerrar, te enviaremos por correo el reporte completo de caja de este turno junto con un recibo por cada venta, y luego se eliminarán del sistema.
                </p>
                <button type="submit" disabled={saving} className="h-11 rounded-lg bg-[var(--brand)] text-[var(--brand-foreground)] disabled:opacity-60">
                  {saving ? 'Cerrando…' : 'Cerrar turno'}
                </button>
              </form>
            )}
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

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
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

// Update-by-photo for ingredients: OCR reads a stock sheet/shelf label,
// pre-matches each line against the existing inventory, and only ever
// touches items a human confirms in this review table before applying.
function IngredientOcrModal({
  items,
  onClose,
  onApply,
}: Readonly<{ items: InventoryItemDTO[]; onClose: () => void; onApply: (updates: { itemId: string; stock: number }[]) => Promise<void> }>) {
  const [rows, setRows] = useState<OcrIngredientRow[] | null>(null)
  const [scanning, setScanning] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')

  const handleFile = async (file: File) => {
    setScanning(true)
    setError('')
    try {
      const extracted = await extractOcrRows(file, items)
      if (!extracted.length) setError('No pudimos leer filas de la foto. Probá con más luz o de más cerca.')
      setRows(extracted)
    } catch {
      setError('No se pudo procesar la imagen')
    } finally {
      setScanning(false)
    }
  }

  const updateRow = (id: string, patch: Partial<OcrIngredientRow>) => {
    setRows((current) => current?.map((r) => (r.id === id ? { ...r, ...patch } : r)) ?? null)
  }

  const matchedRows = (rows ?? []).filter((r) => r.matchedItemId)

  const apply = async () => {
    if (!matchedRows.length) {
      setError('Asigná al menos un insumo existente para actualizar')
      return
    }
    setApplying(true)
    setError('')
    try {
      await onApply(matchedRows.map((r) => ({ itemId: r.matchedItemId as string, stock: r.quantity })))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo aplicar la actualización')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-5">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold">Actualizar ingredientes por foto</h2>
            <p className="mt-1 text-sm text-muted-foreground">Fotografiá tu hoja de existencias; leemos cada línea y vos confirmás antes de guardar.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X />
          </button>
        </div>

        {!rows && (
          <label className={`mt-5 flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground hover:border-[var(--brand)] ${scanning ? 'opacity-60' : ''}`}>
            <ScanLine size={22} />
            {scanning ? 'Leyendo imagen…' : 'Toca para elegir o tomar una foto'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={scanning}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
                e.target.value = ''
              }}
            />
          </label>
        )}

        {rows && (
          <div className="mt-5 flex flex-col gap-3 overflow-y-auto">
            {rows.map((row) => (
              <div key={row.id} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:gap-3">
                <div className="flex-1 text-sm">
                  <p className="font-medium">{row.name}</p>
                  <p className="text-xs text-muted-foreground">Leído: {row.quantity} {row.unit}</p>
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={row.quantity}
                  onChange={(e) => updateRow(row.id, { quantity: Number.parseFloat(e.target.value) || 0 })}
                  className="h-10 w-24 rounded-lg border border-input bg-background px-2 text-sm"
                  aria-label={`Cantidad para ${row.name}`}
                />
                <select
                  value={row.matchedItemId ?? ''}
                  onChange={(e) => updateRow(row.id, { matchedItemId: e.target.value || null })}
                  className="h-10 flex-1 rounded-lg border border-input bg-background px-2 text-sm"
                  aria-label={`Insumo a actualizar para ${row.name}`}
                >
                  <option value="">Ignorar esta línea</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </div>
            ))}
            {!rows.length && <p className="text-sm text-muted-foreground">No se encontraron líneas legibles.</p>}
          </div>
        )}

        {error && <p role="alert" className="mt-4 rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">{error}</p>}

        <div className="mt-5 flex gap-3">
          {rows && (
            <button type="button" onClick={() => { setRows(null); setError('') }} className="h-11 flex-1 rounded-lg border border-border text-sm font-medium hover:bg-muted">
              Tomar otra foto
            </button>
          )}
          {rows && (
            <button type="button" onClick={apply} disabled={applying} className="h-11 flex-1 rounded-lg bg-[var(--brand)] text-sm font-medium text-[var(--brand-foreground)] disabled:opacity-60">
              {applying ? 'Aplicando…' : `Actualizar ${matchedRows.length || ''}`.trim()}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Import-by-file for the menu: OCR reads a photo or PDF of an existing
// printed menu and turns each dish into a candidate product (name, price,
// and its description when the menu already prints one). Unlike
// IngredientOcrModal above (which updates existing insumos), every row here
// becomes a brand-new product, so there's no match-to-existing step — just
// edit or remove rows before importing, optionally filling in missing
// descriptions with AI first.
function MenuOcrModal({
  categories,
  onClose,
  onApply,
}: Readonly<{
  categories: string[]
  onClose: () => void
  onApply: (items: { name: string; priceCents: number; description?: string; categoryName?: string }[]) => Promise<void>
}>) {
  const [rows, setRows] = useState<MenuOcrRow[] | null>(null)
  const [scanning, setScanning] = useState(false)
  const [generatingDescriptions, setGeneratingDescriptions] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')

  const handleFile = async (file: File) => {
    setScanning(true)
    setError('')
    try {
      const extracted = await extractMenuOcrRows(file)
      if (!extracted.length) setError('No pudimos leer productos del archivo. Probá con más luz, más resolución, o de más cerca.')
      setRows(extracted)
    } catch {
      setError('No se pudo procesar el archivo')
    } finally {
      setScanning(false)
    }
  }

  const updateRow = (id: string, patch: Partial<MenuOcrRow>) => {
    setRows((current) => current?.map((r) => (r.id === id ? { ...r, ...patch } : r)) ?? null)
  }

  const removeRow = (id: string) => {
    setRows((current) => current?.filter((r) => r.id !== id) ?? null)
  }

  const missingDescriptions = (rows ?? []).filter((r) => !r.description.trim())

  const generateDescriptions = async () => {
    if (!missingDescriptions.length) return
    setGeneratingDescriptions(true)
    setError('')
    try {
      const generated = await generateMenuDescriptions(missingDescriptions.map((r) => r.name))
      setRows((current) => current?.map((r) => (!r.description.trim() && generated[r.name] ? { ...r, description: generated[r.name] } : r)) ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron generar descripciones')
    } finally {
      setGeneratingDescriptions(false)
    }
  }

  const apply = async () => {
    if (!rows?.length) {
      setError('No hay productos para importar')
      return
    }
    setApplying(true)
    setError('')
    try {
      await onApply(rows.map((r) => ({ name: r.name, priceCents: r.priceCents, description: r.description.trim() || undefined, categoryName: r.categoryName || undefined })))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo importar la carta')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-5">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold">Importar carta desde un archivo</h2>
            <p className="mt-1 text-sm text-muted-foreground">Sube una foto o un PDF de tu menú impreso; leemos cada platillo y vos confirmás antes de crearlos.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X />
          </button>
        </div>

        {!rows && (
          <label className={`mt-5 flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground hover:border-[var(--brand)] ${scanning ? 'opacity-60' : ''}`}>
            <ScanLine size={22} />
            {scanning ? 'Leyendo archivo…' : 'Toca para elegir una foto o un PDF'}
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              disabled={scanning}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
                e.target.value = ''
              }}
            />
          </label>
        )}

        {rows && (
          <div className="mt-5 flex flex-col gap-3 overflow-y-auto">
            <datalist id="menu-ocr-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>

            {missingDescriptions.length > 0 && (
              <button
                type="button"
                onClick={generateDescriptions}
                disabled={generatingDescriptions}
                className="flex h-10 w-fit items-center gap-2 rounded-lg border border-[var(--brand)] bg-[var(--brand)]/10 px-3 text-xs font-medium text-[var(--brand-text)] disabled:opacity-60"
              >
                <Sparkles size={14} />
                {generatingDescriptions ? 'Generando…' : `Generar descripciones con IA (${missingDescriptions.length})`}
              </button>
            )}

            {rows.map((row) => (
              <div key={row.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <input
                    value={row.name}
                    onChange={(e) => updateRow(row.id, { name: e.target.value })}
                    className="h-10 flex-1 rounded-lg border border-input bg-background px-2 text-sm"
                    aria-label="Nombre del producto"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={(row.priceCents / 100).toFixed(2)}
                    onChange={(e) => updateRow(row.id, { priceCents: Math.round((Number.parseFloat(e.target.value) || 0) * 100) })}
                    className="h-10 w-24 rounded-lg border border-input bg-background px-2 text-sm"
                    aria-label={`Precio de ${row.name}`}
                  />
                  <input
                    list="menu-ocr-categories"
                    value={row.categoryName}
                    onChange={(e) => updateRow(row.id, { categoryName: e.target.value })}
                    placeholder="General"
                    className="h-10 w-32 rounded-lg border border-input bg-background px-2 text-sm"
                    aria-label={`Categoría de ${row.name}`}
                  />
                  <button type="button" onClick={() => removeRow(row.id)} aria-label={`Quitar ${row.name}`} className="shrink-0 text-muted-foreground hover:text-destructive">
                    <X size={16} />
                  </button>
                </div>
                <input
                  value={row.description}
                  onChange={(e) => updateRow(row.id, { description: e.target.value })}
                  placeholder="Descripción (opcional)…"
                  className="h-9 rounded-lg border border-input bg-background px-2 text-xs text-muted-foreground"
                  aria-label={`Descripción de ${row.name}`}
                />
              </div>
            ))}
            {!rows.length && <p className="text-sm text-muted-foreground">No quedan productos por importar.</p>}
          </div>
        )}

        {error && <p role="alert" className="mt-4 rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">{error}</p>}

        <div className="mt-5 flex gap-3">
          {rows && (
            <button type="button" onClick={() => { setRows(null); setError('') }} className="h-11 flex-1 rounded-lg border border-border text-sm font-medium hover:bg-muted">
              Elegir otro archivo
            </button>
          )}
          {rows && rows.length > 0 && (
            <button type="button" onClick={apply} disabled={applying} className="h-11 flex-1 rounded-lg bg-[var(--brand)] text-sm font-medium text-[var(--brand-foreground)] disabled:opacity-60">
              {applying ? 'Importando…' : `Importar ${rows.length} producto${rows.length === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function AddZoneModal({ onClose, onSubmit }: Readonly<{ onClose: () => void; onSubmit: (name: string) => Promise<void> }>) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name.trim()) {
      setError('Escribe un nombre para la zona')
      return
    }
    setSaving(true)
    try {
      await onSubmit(name.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la zona')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-5">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-semibold">Nueva zona</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X />
          </button>
        </div>
        <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm font-medium">
            Nombre de la zona
            <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Terraza, Salón, Barra…" className="h-11 rounded-lg border border-input bg-background px-3" />
          </label>
          {error && <p role="alert" className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">{error}</p>}
          <button type="submit" disabled={saving} className="h-11 rounded-lg bg-[var(--brand)] text-[var(--brand-foreground)] disabled:opacity-60">
            {saving ? 'Creando…' : 'Crear zona'}
          </button>
        </form>
      </div>
    </div>
  )
}

function TableSettingsModal({
  table,
  zones,
  onClose,
  onRename,
  onAssignZone,
}: Readonly<{
  table: TableDTO
  zones: ZoneDTO[]
  onClose: () => void
  onRename: (label: string) => Promise<void>
  onAssignZone: (zoneId: string | null) => Promise<void>
}>) {
  const [label, setLabel] = useState(table.label)
  const [zoneId, setZoneId] = useState(table.zoneId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!label.trim()) {
      setError('El nombre de la mesa no puede estar vacío')
      return
    }
    setSaving(true)
    setError('')
    try {
      if (label.trim() !== table.label) await onRename(label.trim())
      if (zoneId !== table.zoneId) await onAssignZone(zoneId)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-5">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-semibold">Editar mesa</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X />
          </button>
        </div>
        <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm font-medium">
            Nombre de la mesa
            <input required autoFocus value={label} onChange={(e) => setLabel(e.target.value)} className="h-11 rounded-lg border border-input bg-background px-3" />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Zona
            <select value={zoneId ?? ''} onChange={(e) => setZoneId(e.target.value || null)} className="h-11 rounded-lg border border-input bg-background px-3">
              <option value="">Sin zona</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>{zone.name}</option>
              ))}
            </select>
          </label>
          {error && <p role="alert" className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">{error}</p>}
          <button type="submit" disabled={saving} className="h-11 rounded-lg bg-[var(--brand)] text-[var(--brand-foreground)] disabled:opacity-60">
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </form>
      </div>
    </div>
  )
}

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia' }

function PaymentModal({
  totalCents,
  onClose,
  onConfirm,
}: Readonly<{ totalCents: number; onClose: () => void; onConfirm: (method: PaymentMethod, tenderedCents: number | undefined, isTakeout: boolean) => Promise<void> }>) {
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [tendered, setTendered] = useState('')
  const [isTakeout, setIsTakeout] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const tenderedCents = tendered.trim() ? Math.round(parseFloat(tendered) * 100) : undefined
  const change = method === 'cash' && tenderedCents !== undefined ? tenderedCents - totalCents : null

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (method === 'cash' && tenderedCents !== undefined && tenderedCents < totalCents) {
      setError('El monto pagado es menor al total')
      return
    }
    setSaving(true)
    try {
      await onConfirm(method, method === 'cash' ? tenderedCents : undefined, isTakeout)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el cobro')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-5">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-semibold">Cobrar</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X />
          </button>
        </div>
        <p className="mt-2 text-3xl font-semibold">$ {(totalCents / 100).toFixed(2)}</p>

        <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
          <div>
            <p className="mb-2 text-sm font-medium">Método de pago</p>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`rounded-lg border px-2 py-2 text-xs font-medium ${method === m ? 'border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand-text)]' : 'border-border text-muted-foreground'}`}
                >
                  {PAYMENT_METHOD_LABEL[m]}
                </button>
              ))}
            </div>
          </div>

          {method === 'cash' && (
            <label className="flex flex-col gap-2 text-sm font-medium">
              ¿Con cuánto pagó el cliente? (opcional)
              <input type="number" step="0.01" min="0" value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder={(totalCents / 100).toFixed(2)} className="h-11 rounded-lg border border-input bg-background px-3" />
            </label>
          )}
          {change !== null && (
            <p className={`text-sm font-medium ${change < 0 ? 'text-destructive' : 'text-[var(--brand-text)]'}`}>
              {change < 0 ? 'Falta' : 'Cambio'}: $ {Math.abs(change / 100).toFixed(2)}
            </p>
          )}

          <label className="flex items-center justify-between gap-3 text-sm font-medium">
            Para llevar
            <input type="checkbox" checked={isTakeout} onChange={(e) => setIsTakeout(e.target.checked)} className="size-4" />
          </label>

          {error && <p role="alert" className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">{error}</p>}
          <button type="submit" disabled={saving} className="h-11 rounded-lg bg-[var(--brand)] text-[var(--brand-foreground)] disabled:opacity-60">
            {saving ? 'Cobrando…' : 'Confirmar cobro'}
          </button>
        </form>
      </div>
    </div>
  )
}

// Deliberately styled unlike every other modal in the app — a stark
// black-and-white "kitchen ticket" (monospace, dashed perforation, big bold
// numbers) so it reads instantly on a busy pass, distinct from the
// brand-colored screens the front of house uses.
function ComandaModal({
  tableLabel,
  zoneName,
  items,
  sentAt,
  comandaNumber,
  shiftNumber,
  onClose,
}: Readonly<{ tableLabel: string; zoneName: string | null; items: ComandaItem[]; sentAt: string; comandaNumber: number; shiftNumber: number | null; onClose: () => void }>) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-5">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white text-black shadow-2xl">
        <div className="flex items-center justify-between bg-black px-5 py-4 text-white">
          <div className="flex items-center gap-2">
            <ChefHat size={20} />
            <span className="font-mono text-xs font-bold uppercase tracking-widest">Comanda de cocina</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-white/80 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="border-b-2 border-dashed border-black/20 px-5 py-4 font-mono">
          <div className="flex items-baseline justify-between">
            <span className="text-4xl font-black leading-none">#{comandaNumber}</span>
            <span className="text-right text-sm font-bold uppercase">{tableLabel}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] uppercase tracking-wide text-black/60">
            {zoneName && (
              <span className="flex items-center gap-1 rounded border border-black/30 px-1.5 py-0.5">
                <MapPin size={11} /> {zoneName}
              </span>
            )}
            {shiftNumber && <span className="rounded border border-black/30 px-1.5 py-0.5">Turno {shiftNumber}</span>}
            <span>{new Date(sentAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 px-5 py-4 font-mono">
          {items.map((item, i) => (
            <div key={`${item.productName}-${i}`} className="flex items-baseline gap-2 text-sm">
              <span className="text-base font-black">{item.quantity}×</span>
              <span className="flex-1 border-b border-dotted border-black/30 pb-0.5 font-semibold uppercase">{item.productName}</span>
            </div>
          ))}
        </div>

        <div className="border-t-2 border-dashed border-black/20 px-5 py-4">
          <button type="button" onClick={() => window.print()} className="h-11 w-full rounded-lg bg-black text-sm font-bold uppercase tracking-wide text-white hover:bg-black/85">
            Imprimir
          </button>
          <button type="button" onClick={onClose} className="mt-2 h-11 w-full rounded-lg border border-black/20 text-sm font-medium hover:bg-black/5">
            Listo
          </button>
        </div>
      </div>
    </div>
  )
}
