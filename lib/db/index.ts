import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

// Create a PG pool only when DATABASE_URL is provided (production or configured dev).
export const pool: Pool | undefined = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : undefined

// If no pool is available (local dev without DATABASE_URL), export a lightweight `db` fallback
// typed as `any` so server code and TypeScript checks continue to work while the app uses
// the better-auth memory adapter for authentication in dev.
export const db = pool ? drizzle(pool, { schema }) : ({} as any)
