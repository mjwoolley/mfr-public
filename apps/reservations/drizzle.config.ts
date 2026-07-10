import { defineConfig } from 'drizzle-kit'

if (!process.env.DIRECT_DATABASE_URL) {
  throw new Error('DIRECT_DATABASE_URL is not set (needed for drizzle-kit migrations)')
}

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DIRECT_DATABASE_URL,
  },
})
