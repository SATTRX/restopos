import { boolean, integer, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core'

export const user = pgTable('user', { id: text('id').primaryKey(), name: text('name').notNull(), email: text('email').notNull().unique(), emailVerified: boolean('emailVerified').default(false).notNull(), image: text('image'), role: text('role').default('restaurant').notNull(), createdAt: timestamp('createdAt').defaultNow().notNull(), updatedAt: timestamp('updatedAt').defaultNow().notNull() })
export const session = pgTable('session', { id: text('id').primaryKey(), expiresAt: timestamp('expiresAt').notNull(), token: text('token').notNull().unique(), createdAt: timestamp('createdAt').defaultNow().notNull(), updatedAt: timestamp('updatedAt').defaultNow().notNull(), ipAddress: text('ipAddress'), userAgent: text('userAgent'), userId: text('userId').notNull() })
export const account = pgTable('account', { id: text('id').primaryKey(), issuer: text('issuer').notNull(), accountId: text('accountId').notNull(), providerId: text('providerId').notNull(), userId: text('userId').notNull(), accessToken: text('accessToken'), refreshToken: text('refreshToken'), idToken: text('idToken'), accessTokenExpiresAt: timestamp('accessTokenExpiresAt'), refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'), scope: text('scope'), password: text('password'), createdAt: timestamp('createdAt').defaultNow().notNull(), updatedAt: timestamp('updatedAt').defaultNow().notNull() })
export const verification = pgTable('verification', { id: text('id').primaryKey(), identifier: text('identifier').notNull(), value: text('value').notNull(), expiresAt: timestamp('expiresAt').notNull(), createdAt: timestamp('createdAt').defaultNow().notNull(), updatedAt: timestamp('updatedAt').defaultNow().notNull() })
export const inventoryItem = pgTable('inventory_item', { id: text('id').primaryKey(), branchId: text('branch_id').notNull(), name: text('name').notNull(), unit: text('unit').notNull(), stock: integer('stock').default(0).notNull(), minimumStock: integer('minimum_stock').default(0).notNull(), costCents: integer('cost_cents').default(0).notNull(), createdAt: timestamp('created_at').defaultNow().notNull() })
// `folio` is a per-restaurant sequential receipt number (not an official tax-authority
// stamp — see the /boleta/[id] page). `tableOrderId` lets the receipt reconstruct line
// items for dine-in sales; quick/walk-in sales leave it null and show only the total.
// `tenderedCents`/`changeCents` only apply to cash payments (how much the customer
// handed over and the change given back) — null for card/transfer.
export const sale = pgTable('sale', { id: text('id').primaryKey(), restaurantId: text('restaurant_id'), branchId: text('branch_id').notNull(), shiftId: text('shift_id'), tableOrderId: text('table_order_id'), folio: integer('folio'), subtotalCents: integer('subtotal_cents'), taxCents: integer('tax_cents'), totalCents: integer('total_cents').notNull(), paymentMethod: text('payment_method').notNull(), tenderedCents: integer('tendered_cents'), changeCents: integer('change_cents'), status: text('status').default('paid').notNull(), createdAt: timestamp('created_at').defaultNow().notNull() })

export const restaurant = pgTable('restaurant', { id: text('id').primaryKey(), name: text('name').notNull(), slug: text('slug').notNull().unique(), logoUrl: text('logo_url'), primaryColor: text('primary_color').default('#c86b4a').notNull(), secondaryColor: text('secondary_color'), currency: text('currency').default('MXN').notNull(), taxRate: integer('tax_rate').default(1600).notNull(), taxId: text('tax_id'), createdAt: timestamp('created_at').defaultNow().notNull(), updatedAt: timestamp('updated_at').defaultNow().notNull() })
export const restaurantBranch = pgTable('restaurant_branch', { id: text('id').primaryKey(), restaurantId: text('restaurant_id').notNull(), name: text('name').notNull(), address: text('address'), isActive: boolean('is_active').default(true).notNull(), createdAt: timestamp('created_at').defaultNow().notNull() })
export const restaurantMembership = pgTable('restaurant_membership', { id: text('id').primaryKey(), userId: text('user_id').notNull(), restaurantId: text('restaurant_id').notNull(), role: text('role').default('staff').notNull(), branchId: text('branch_id'), isActive: boolean('is_active').default(true).notNull(), createdAt: timestamp('created_at').defaultNow().notNull() })
export const menuCategory = pgTable('menu_category', { id: text('id').primaryKey(), restaurantId: text('restaurant_id').notNull(), name: text('name').notNull(), sortOrder: integer('sort_order').default(0).notNull(), isActive: boolean('is_active').default(true).notNull(), createdAt: timestamp('created_at').defaultNow().notNull() })
// `tags` holds optional labels like "picante" or "con gluten" (empty array by default).
export const menuProduct = pgTable('menu_product', { id: text('id').primaryKey(), restaurantId: text('restaurant_id').notNull(), categoryId: text('category_id'), name: text('name').notNull(), description: text('description'), priceCents: integer('price_cents').default(0).notNull(), imageUrl: text('image_url'), isAvailable: boolean('is_available').default(true).notNull(), tags: text('tags').array().default([]).notNull(), createdAt: timestamp('created_at').defaultNow().notNull(), updatedAt: timestamp('updated_at').defaultNow().notNull() })
export const restaurantSettings = pgTable('restaurant_settings', { restaurantId: text('restaurant_id').primaryKey(), theme: text('theme').default('terracotta').notNull(), accentColor: text('accent_color').default('#c86b4a').notNull(), logoUrl: text('logo_url'), receiptFooter: text('receipt_footer'), updatedAt: timestamp('updated_at').defaultNow().notNull() })

// Dine-in tables and their open orders (POS "gestión por mesa").
// Unique (restaurant_id, label) doubles as a guard against concurrent
// double-seeding (see ensureDefaultTables' onConflictDoNothing).
export const restaurantTable = pgTable(
  'restaurant_table',
  { id: text('id').primaryKey(), restaurantId: text('restaurant_id').notNull(), branchId: text('branch_id').notNull(), label: text('label').notNull(), position: integer('position').default(0).notNull(), isActive: boolean('is_active').default(true).notNull(), createdAt: timestamp('created_at').defaultNow().notNull() },
  (table) => [unique('restaurant_table_restaurant_label_key').on(table.restaurantId, table.label)],
)
// One row per dine-in session at a table. `status`: 'open' | 'paid' | 'cancelled'.
export const tableOrder = pgTable('table_order', { id: text('id').primaryKey(), restaurantId: text('restaurant_id').notNull(), tableId: text('table_id').notNull(), branchId: text('branch_id').notNull(), status: text('status').default('open').notNull(), createdAt: timestamp('created_at').defaultNow().notNull(), updatedAt: timestamp('updated_at').defaultNow().notNull(), closedAt: timestamp('closed_at') })
// Line items snapshot product name/price at add-time, independent of the (currently static) menu catalog.
// `sentToKitchenAt`/`comandaId` are null until the item is included in a comanda (kitchen ticket).
export const tableOrderItem = pgTable('table_order_item', { id: text('id').primaryKey(), orderId: text('order_id').notNull(), productId: text('product_id').notNull(), productName: text('product_name').notNull(), unitPriceCents: integer('unit_price_cents').notNull(), quantity: integer('quantity').default(1).notNull(), sentToKitchenAt: timestamp('sent_to_kitchen_at'), comandaId: text('comanda_id'), createdAt: timestamp('created_at').defaultNow().notNull() })

// One row per "Enviar comanda" action. `comandaNumber` is sequential *within
// its shift* (Comanda 1, 2, 3...) and naturally resets to 1 on a new shift
// since it's scoped by shiftId, not globally.
export const comanda = pgTable('comanda', {
  id: text('id').primaryKey(),
  restaurantId: text('restaurant_id').notNull(),
  shiftId: text('shift_id').notNull(),
  tableId: text('table_id').notNull(),
  comandaNumber: integer('comanda_number').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// One row per cash-register shift ("turno"). `status`: 'open' | 'closed'.
// The sales* / expenses columns are a snapshot filled in at close time, for
// the shift history in Facturación/Estadísticas.
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
  closedByUserId: text('closed_by_user_id'),
  closedByName: text('closed_by_name'),
  closingCashCents: integer('closing_cash_cents'),
  cashSalesCents: integer('cash_sales_cents'),
  cardSalesCents: integer('card_sales_cents'),
  transferSalesCents: integer('transfer_sales_cents'),
  expensesCents: integer('expenses_cents'),
  expectedCashCents: integer('expected_cash_cents'),
  differenceCents: integer('difference_cents'),
  closedAt: timestamp('closed_at'),
  status: text('status').default('open').notNull(),
})

// Cash taken out of the drawer mid-shift for a purchase/expense (e.g. buying
// ice), so the closing cash count can be reconciled against it.
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
