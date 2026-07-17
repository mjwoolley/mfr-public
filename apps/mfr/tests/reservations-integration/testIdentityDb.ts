import { createIdentityDb } from '@mfr/auth'

const connectionString = process.env.TEST_DATABASE_URL
if (!connectionString) {
  throw new Error(
    'TEST_DATABASE_URL is not set — integration tests must run against the unified test branch, never the real database',
  )
}

export const testIdentityDb = createIdentityDb(connectionString)
