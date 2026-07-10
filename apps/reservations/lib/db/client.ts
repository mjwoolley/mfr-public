import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL is not set')
}

// Neon's pooled (pgbouncer) connection is in transaction mode, which does not
// support prepared statements across connections — disable them.
const client = postgres(connectionString, { prepare: false })

export const db = drizzle(client, { schema })
