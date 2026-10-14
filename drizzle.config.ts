import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

config({ path: ['.env.local', '.env'] })

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set (see .env.local)')

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  // Only our tables: Neon Auth keeps its users and sessions in the neon_auth schema.
  schemaFilter: ['public'],
  dbCredentials: { url },
})
