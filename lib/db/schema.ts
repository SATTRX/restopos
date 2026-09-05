import { boolean, integer, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core'

// `isActive` is our own admin-managed flag (not a better-auth field) — a
// platform admin can disable an account without deleting it; checked
// server-side on every protected page (see app/page.tsx, app/restaurante/page.tsx).
export const user = pgTable('user', { id: text('id').primaryKey(), name: text('name').notNull(), email: text('email').notNull().unique(), emailVerified: boolean('emailVerified').default(false).notNull(), image: text('image'), role: text('role').default('restaurant').notNull(), isActive: boolean('is_active').default(true).notNull(), createdAt: timestamp('createdAt').defaultNow().notNull(), updatedAt: timestamp('updatedAt').defaultNow().notNull() })
export const session = pgTable('session', { id: text('id').primaryKey(), expiresAt: timestamp('expiresAt').notNull(), token: text('token').notNull().unique(), createdAt: timestamp('createdAt').defaultNow().notNull(), updatedAt: timestamp('updatedAt').defaultNow().notNull(), ipAddress: text('ipAddress'), userAgent: text('userAgent'), userId: text('userId').notNull() })
export const account = pgTable('account', { id: text('id').primaryKey(), issuer: text('issuer').notNull(), accountId: text('accountId').notNull(), providerId: text('providerId').notNull(), userId: text('userId').notNull(), accessToken: text('accessToken'), refreshToken: text('refreshToken'), idToken: text('idToken'), accessTokenExpiresAt: timestamp('accessTokenExpiresAt'), refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'), scope: text('scope'), password: text('password'), createdAt: timestamp('createdAt').defaultNow().notNull(), updatedAt: timestamp('updatedAt').defaultNow().notNull() })
export const verification = pgTable('verification', { id: text('id').primaryKey(), identifier: text('identifier').notNull(), value: text('value').notNull(), expiresAt: timestamp('expiresAt').notNull(), createdAt: timestamp('createdAt').defaultNow().notNull(), updatedAt: timestamp('updatedAt').defaultNow().notNull() })
// `previousCostCents`/`previousCostAt` hold only the *one* prior cost value
// (not a full price-history log, to keep this table from growing unbounded)
// so an edit can show "última compra vs. actual" without a separate table.
export const inventoryItem = pgTable('inventory_item', {
  id: text('id').primaryKey(),
  branchId: text('branch_id').notNull(),
  name: text('name').notNull(),
  unit: text('unit').notNull(),
  stock: integer('stock').default(0).notNull(),
  minimumStock: integer('minimum_stock').default(0).notNull(),
  costCents: integer('cost_cents').default(0).notNull(),
  previousCostCents: integer('previous_cost_cents'),
  previousCostAt: timestamp('previous_cost_at'),
  costUpdatedAt: timestamp('cost_updated_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
// `folio` is a per-restaurant sequential receipt number (not an official tax-authority
// stamp — see the /boleta/[id] page). `tableOrderId` lets the receipt reconstruct line
// items for dine-in sales; quick/walk-in sales leave it null and show only the total.
// `tenderedCents`/`changeCents` only apply to cash payments (how much the customer
// handed over and the change given back) — null for card/transfer. `isTakeout`
// decides whether optional recipe ingredients (e.g. to-go packaging) get consumed.
export const sale = pgTable('sale', { id: text('id').primaryKey(), restaurantId: text('restaurant_id'), branchId: text('branch_id').notNull(), shiftId: text('shift_id'), tableOrderId: text('table_order_id'), folio: integer('folio'), subtotalCents: integer('subtotal_cents'), taxCents: integer('tax_cents'), totalCents: integer('total_cents').notNull(), paymentMethod: text('payment_method').notNull(), tenderedCents: integer('tendered_cents'), changeCents: integer('change_cents'), isTakeout: boolean('is_takeout').default(false).notNull(), status: text('status').default('paid').notNull(), createdAt: timestamp('created_at').defaultNow().notNull() })

// `isActive` (platform-level "suspender") is separate from restaurant_branch's
// own isActive — a platform admin can suspend the whole restaurant, which
// blocks its staff from the workspace and hides its public menu, without
// touching anything else. See setRestaurantActive in app/actions/admin.ts.
export const restaurant = pgTable('restaurant', { id: text('id').primaryKey(), name: text('name').notNull(), slug: text('slug').notNull().unique(), logoUrl: text('logo_url'), primaryColor: text('primary_color').default('#c86b4a').notNull(), secondaryColor: text('secondary_color'), currency: text('currency').default('MXN').notNull(), taxRate: integer('tax_rate').default(1600).notNull(), taxId: text('tax_id'), isActive: boolean('is_active').default(true).notNull(), createdAt: timestamp('created_at').defaultNow().notNull(), updatedAt: timestamp('updated_at').defaultNow().notNull() })
export const restaurantBranch = pgTable('restaurant_branch', { id: text('id').primaryKey(), restaurantId: text('restaurant_id').notNull(), name: text('name').notNull(), address: text('address'), isActive: boolean('is_active').default(true).notNull(), createdAt: timestamp('created_at').defaultNow().notNull() })
export const restaurantMembership = pgTable('restaurant_membership', { id: text('id').primaryKey(), userId: text('user_id').notNull(), restaurantId: text('restaurant_id').notNull(), role: text('role').default('staff').notNull(), branchId: text('branch_id'), isActive: boolean('is_active').default(true).notNull(), createdAt: timestamp('created_at').defaultNow().notNull() })
export const menuCategory = pgTable('menu_category', { id: text('id').primaryKey(), restaurantId: text('restaurant_id').notNull(), name: text('name').notNull(), sortOrder: integer('sort_order').default(0).notNull(), isActive: boolean('is_active').default(true).notNull(), createdAt: timestamp('created_at').defaultNow().notNull() })
// `tags` holds optional labels like "picante" or "con gluten" (empty array by default).
export const menuProduct = pgTable('menu_product', { id: text('id').primaryKey(), restaurantId: text('restaurant_id').notNull(), categoryId: text('category_id'), name: text('name').notNull(), description: text('description'), priceCents: integer('price_cents').default(0).notNull(), imageUrl: text('image_url'), isAvailable: boolean('is_available').default(true).notNull(), tags: text('tags').array().default([]).notNull(), createdAt: timestamp('created_at').defaultNow().notNull(), updatedAt: timestamp('updated_at').defaultNow().notNull() })
export const restaurantSettings = pgTable('restaurant_settings', { restaurantId: text('restaurant_id').primaryKey(), theme: text('theme').default('terracotta').notNull(), accentColor: text('accent_color').default('#c86b4a').notNull(), logoUrl: text('logo_url'), receiptFooter: text('receipt_footer'), updatedAt: timestamp('updated_at').defaultNow().notNull() })

// Recipe / bill-of-materials link: selling one unit of `productId` consumes
// `quantityPerUnit` of `inventoryItemId`. `isOptional` ingredients (e.g. a
// takeout container) are only deducted when the sale is marked "para llevar".
export const productIngredient = pgTable('product_ingredient', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull(),
  inventoryItemId: text('inventory_item_id').notNull(),
  quantityPerUnit: integer('quantity_per_unit').default(1).notNull(),
  isOptional: boolean('is_optional').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Named areas a restaurant can group its tables into (e.g. "Terraza", "Salón").
export const restaurantZone = pgTable('restaurant_zone', {
  id: text('id').primaryKey(),
  restaurantId: text('restaurant_id').notNull(),
  name: text('name').notNull(),
  position: integer('position').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Dine-in tables and their open orders (POS "gestión por mesa"). `zoneId` is
// nullable — a table doesn't have to belong to a zone.
// Unique (restaurant_id, label) doubles as a guard against concurrent
// double-seeding (see ensureDefaultTables' onConflictDoNothing).
export const restaurantTable = pgTable(
  'restaurant_table',
  { id: text('id').primaryKey(), restaurantId: text('restaurant_id').notNull(), branchId: text('branch_id').notNull(), zoneId: text('zone_id'), label: text('label').notNull(), position: integer('position').default(0).notNull(), isActive: boolean('is_active').default(true).notNull(), createdAt: timestamp('created_at').defaultNow().notNull() },
  (table) => [unique('restaurant_table_restaurant_label_key').on(table.restaurantId, table.label)],
)
// One row per dine-in session at a table. `status`: 'open' | 'paid' | 'cancelled'.
export const tableOrder = pgTable('table_order', { id: text('id').primaryKey(), restaurantId: text('restaurant_id').notNull(), tableId: text('table_id').notNull(), branchId: text('branch_id').notNull(), status: text('status').default('open').notNull(), createdAt: timestamp('created_at').defaultNow().notNull(), updatedAt: timestamp('updated_at').defaultNow().notNull(), closedAt: timestamp('closed_at') })
// Line items snapshot product name/price at add-time, independent of the (currently static) menu catalog.
// `sentToKitchenAt`/`comandaId` are null until the item is included in a comanda (kitchen ticket).
export const tableOrderItem = pgTable('table_order_item', { id: text('id').primaryKey(), orderId: text('order_id').notNull(), productId: text('product_id').notNull(), productName: text('product_name').notNull(), unitPriceCents: integer('unit_price_cents').notNull(), quantity: integer('quantity').default(1).notNull(), sentToKitchenAt: timestamp('sent_to_kitchen_at'), comandaId: text('comanda_id'), createdAt: timestamp('created_at').defaultNow().notNull() })

// One row per "Enviar comanda" action. `comandaNumber` is sequential *within
// its shift* (Comanda 1, 2, 3...) and naturally resets to 1 on a new shift
// since it's scoped by shiftId, not globally. Deleted along with the rest of
// the shift's detail once it closes (see closeShift) — only `tableOrderItem`
// (kept for product stats) still remembers what was sent to the kitchen.
export const comanda = pgTable('comanda', {
  id: text('id').primaryKey(),
  restaurantId: text('restaurant_id').notNull(),
  shiftId: text('shift_id').notNull(),
  tableId: text('table_id').notNull(),
  comandaNumber: integer('comanda_number').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// One row per *currently open* cash-register shift ("turno"). Closing a
// shift emails the full cash-register report (see lib/shift-summary-image.tsx
// and closeShift in app/actions/shifts.ts) and then deletes this row — so at
// most one row per restaurant ever exists here, keeping this table tiny by
// design instead of accumulating a permanent shift history. Anything that
// needs to survive the close (the running totals, the next shift number)
// lives in `restaurantStats` below instead.
export const cashShift = pgTable('cash_shift', {
  id: text('id').primaryKey(),
  restaurantId: text('restaurant_id').notNull(),
  branchId: text('branch_id').notNull(),
  // Sequential per restaurant (Turno 1, Turno 2, ...) — shown on comandas so
  // kitchen tickets can be traced back to a specific shift.
  shiftNumber: integer('shift_number'),
  openedByUserId: text('opened_by_user_id').notNull(),
  openedByName: text('opened_by_name').notNull(),
  openingCashCents: integer('opening_cash_cents').default(0).notNull(),
  openedAt: timestamp('opened_at').defaultNow().notNull(),
})

// One row per restaurant holding small running counters that must survive
// shift closes and sale deletions (see closeShift): the next sale folio, the
// next shift number, and lifetime revenue/expense/sales totals. Deliberately
// a single aggregated row instead of a growing table of historical shifts or
// sales — that history is emailed at close time (see lib/email.ts), not kept
// in the database. `lastClosed*` covers the common "one shift per day" case
// for the admin dashboard's "today" figures; a restaurant closing more than
// one shift the same day will undercount today's total for the shifts before
// the most recent one, a deliberate trade-off for not storing per-shift rows.
export const restaurantStats = pgTable('restaurant_stats', {
  restaurantId: text('restaurant_id').primaryKey(),
  nextFolio: integer('next_folio').default(1).notNull(),
  totalShiftsOpened: integer('total_shifts_opened').default(0).notNull(),
  totalShiftsClosed: integer('total_shifts_closed').default(0).notNull(),
  lifetimeSalesCents: integer('lifetime_sales_cents').default(0).notNull(),
  lifetimeCashSalesCents: integer('lifetime_cash_sales_cents').default(0).notNull(),
  lifetimeCardSalesCents: integer('lifetime_card_sales_cents').default(0).notNull(),
  lifetimeTransferSalesCents: integer('lifetime_transfer_sales_cents').default(0).notNull(),
  lifetimeExpensesCents: integer('lifetime_expenses_cents').default(0).notNull(),
  lifetimeSalesCount: integer('lifetime_sales_count').default(0).notNull(),
  lastClosedAt: timestamp('last_closed_at'),
  lastClosedTotalCents: integer('last_closed_total_cents'),
  lastClosedOrders: integer('last_closed_orders'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Cash taken out of the drawer mid-shift for a purchase/expense (e.g. buying
// ice), so the closing cash count can be reconciled against it. Deleted once
// the shift closes — the itemized list is folded into the closing email
// instead (see lib/shift-summary-image.tsx).
export const shiftMovement = pgTable('shift_movement', {
  id: text('id').primaryKey(),
  shiftId: text('shift_id').notNull(),
  restaurantId: text('restaurant_id').notNull(),
  amountCents: integer('amount_cents').notNull(),
  description: text('description').notNull(),
  createdByUserId: text('created_by_user_id').notNull(),
  createdByName: text('created_by_name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
