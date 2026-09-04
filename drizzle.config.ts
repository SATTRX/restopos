import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// drizzle-kit runs standalone (not through Next.js), so .env.local isn't
// loaded automatically the way it is for `next dev`/`next build`.
config({ path: '.env.local' })

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required to run drizzle-kit (set it in .env.local)')
}

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL },
  strict: true,
})
