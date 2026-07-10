import { createIdentityDb } from '@mfr/auth'

const connectionString = process.env.IDENTITY_DATABASE_URL
if (!connectionString) {
  throw new Error('IDENTITY_DATABASE_URL is not set')
}

export const identityDb = createIdentityDb(connectionString)
