import { createIdentityDb, type IdentityDb } from './db'

/**
 * Reads IDENTITY_DATABASE_URL from the environment, throws if unset, and
 * constructs the shared identity-DB client. Each app calls this once, at its
 * own module-load time, to build its `identityDb` singleton — this is the
 * boilerplate that used to be copy-pasted byte-for-byte across every app's
 * `identityDb.ts`.
 */
export function createIdentityDbFromEnv(): IdentityDb {
  const connectionString = process.env.IDENTITY_DATABASE_URL
  if (!connectionString) {
    throw new Error('IDENTITY_DATABASE_URL is not set')
  }
  return createIdentityDb(connectionString)
}
