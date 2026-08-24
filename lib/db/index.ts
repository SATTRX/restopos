import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

// Create a PG pool only when DATABASE_URL is provided (production or configured dev).
// In development, prefer the in-memory adapter unless explicitly forced via
// `FORCE_DATABASE=true`. This avoids startup errors when Postgres isn't running
// locally and lets `better-auth` fall back to the memory adapter.
const shouldUseDatabase = Boolean(process.env.DATABASE_URL) && !(process.env.NODE_ENV === 'development' && !process.env.FORCE_DATABASE)
export const pool: Pool | undefined = shouldUseDatabase ? new Pool({ connectionString: process.env.DATABASE_URL }) : undefined

// Export `db` when a pool exists; otherwise provide a lightweight `any` fallback
// so TypeScript callers don't fail. In-memory auth adapter will be used when
// `pool` is undefined.
export const db = pool ? drizzle(pool, { schema }) : ({} as any)
