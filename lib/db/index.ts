import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

// Create a PG pool whenever a DATABASE_URL is provided — including in
// development, so pointing at a real database (e.g. Supabase) just works.
// With no DATABASE_URL, `better-auth` falls back to its in-memory adapter.
const shouldUseDatabase = Boolean(process.env.DATABASE_URL)

// Supabase (and most managed Postgres providers) require TLS and present a
// certificate that isn't in Node's default trust store, so relax verification
// for those hosts instead of failing every connection.
const needsRelaxedSsl = /supabase\.co|sslmode=require/i.test(process.env.DATABASE_URL ?? '')

export const pool: Pool | undefined = shouldUseDatabase
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: needsRelaxedSsl ? { rejectUnauthorized: false } : undefined,
    })
  : undefined

// Export `db` when a pool exists; otherwise provide a lightweight `any` fallback
// so TypeScript callers don't fail. In-memory auth adapter will be used when
// `pool` is undefined.
export const db = pool ? drizzle(pool, { schema }) : ({} as any)
