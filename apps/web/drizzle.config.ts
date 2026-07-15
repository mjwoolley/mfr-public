import { defineConfig } from 'drizzle-kit'

// The portal DB uses drizzle-kit push (no replayable journal), same as
// reservations/identity — see docs/workflow.md. Push schema changes to the
// production/test/staging branches manually as part of shipping; CI runs no
// Drizzle step.
if (!process.env.PORTAL_DIRECT_DATABASE_URL) {
  throw new Error('PORTAL_DIRECT_DATABASE_URL is not set (needed for drizzle-kit)')
}

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.PORTAL_DIRECT_DATABASE_URL,
  },
})
