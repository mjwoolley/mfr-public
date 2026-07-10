import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export type IdentityDb = ReturnType<typeof createIdentityDb>

export function createIdentityDb(connectionString: string) {
  const client = postgres(connectionString, { prepare: false })
  return drizzle(client, { schema })
}
