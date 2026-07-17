import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

// The single Drizzle client for the whole unified MFR database — identity,
// portal, reservations, and accounting all query through this one client and
// one DATABASE_URL (replacing the former four per-domain clients + four env
// vars). Cross-domain references stay logical (by value), so a single `schema`
// namespace with disjoint table names is safe.

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL is not set')
}

// Neon's pooled (pgbouncer) connection is transaction-mode, which does not
// support prepared statements across connections — disable them. Cache the
// underlying client on globalThis in dev so Next.js hot reloads don't leak a
// new connection pool per reload.
const globalForDb = globalThis as unknown as { mfrDbClient?: ReturnType<typeof postgres> }
const client = globalForDb.mfrDbClient ?? postgres(connectionString, { prepare: false })
if (process.env.NODE_ENV !== 'production') globalForDb.mfrDbClient = client

export const db = drizzle(client, { schema })
export { schema }
