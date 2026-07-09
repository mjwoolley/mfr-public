import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../../lib/db/schema'

const connectionString = process.env.TEST_DATABASE_URL
if (!connectionString) {
  throw new Error('TEST_DATABASE_URL is not set — integration tests must run against the dedicated Neon test branch, never the real database')
}

const client = postgres(connectionString, { prepare: false })

export const testDb = drizzle(client, { schema })
