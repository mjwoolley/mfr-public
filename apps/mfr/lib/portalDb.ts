import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './db/schema'

// apps/web's portal-DB client singleton (module-load time, like identityDb.ts).
// Points at the dedicated portal Neon project via PORTAL_DATABASE_URL — the
// same value @mfr/auth's roles reader uses to attach roles to the session.
const connectionString = process.env.PORTAL_DATABASE_URL
if (!connectionString) {
  throw new Error('PORTAL_DATABASE_URL is not set')
}

// Neon's pooled (pgbouncer) connection is in transaction mode, which does not
// support prepared statements across connections — disable them.
const client = postgres(connectionString, { prepare: false })

export const portalDb = drizzle(client, { schema })
