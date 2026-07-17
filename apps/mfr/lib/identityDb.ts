import { createIdentityDb } from '@mfr/auth'

// Module-load-time singleton for the @mfr/auth identity tables
// (users/accounts/sessions). Post-merge these live in the one unified
// database, so it's built from the single DATABASE_URL.
const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL is not set')
}

export const identityDb = createIdentityDb(connectionString)
