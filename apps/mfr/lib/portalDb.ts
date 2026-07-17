import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './db/schema'

// Portal feature-data client singleton (portal roles, settings, photo albums,
// events, meal RSVPs). Post-merge these tables live in the one unified
// database, so this reads the single DATABASE_URL like every other client.
const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL is not set')
}

// Neon's pooled (pgbouncer) connection is in transaction mode, which does not
// support prepared statements across connections — disable them.
const client = postgres(connectionString, { prepare: false })

export const portalDb = drizzle(client, { schema })
