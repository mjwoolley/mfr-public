import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'
import { resolveDirectUrl } from './lib/db/directUrl.mjs'

// drizzle-kit is a standalone CLI and does not load Next's .env.local, so load
// it here for local `npm run db:push`.
config({ path: '.env.local' })

// The unified MFR database uses drizzle-kit push (no replayable journal) — same
// convention as the former per-app Drizzle DBs. Push schema changes to the
// dev/test/staging/production branches manually as part of shipping; CI runs no
// Drizzle step. After each push to a fresh/reset branch, also apply the
// push-only objects that drizzle-kit can't emit: `psql "$DIRECT_URL" -f
// lib/db/push-only.sql` (GiST overlap EXCLUDE, booking_rules CHECK, blocked-date
// triggers).
const directUrl = resolveDirectUrl()
if (!directUrl) {
  throw new Error('DIRECT_URL (or DATABASE_URL_UNPOOLED) is not set (needed for drizzle-kit)')
}

export default defineConfig({
  schema: './lib/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: directUrl,
  },
})
