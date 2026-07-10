import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

if (!process.env.IDENTITY_DIRECT_DATABASE_URL) {
  throw new Error('IDENTITY_DIRECT_DATABASE_URL is not set (needed for drizzle-kit migrations)')
}

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.IDENTITY_DIRECT_DATABASE_URL,
  },
})
