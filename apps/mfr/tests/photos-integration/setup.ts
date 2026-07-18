// Vitest global setup for the photos-integration project: resets the tables the
// suite touches on the unified Neon *test* branch. TEST_DIRECT_URL is the guard
// keeping this away from real databases.

import postgres from 'postgres'

export default async function setup() {
  const connectionString = process.env.TEST_DIRECT_URL
  if (!connectionString) {
    throw new Error('TEST_DIRECT_URL is not set')
  }
  const sql = postgres(connectionString, { prepare: false })
  await sql`TRUNCATE TABLE portal_photo_slides, portal_photo_albums, portal_user_roles RESTART IDENTITY CASCADE`
  await sql`TRUNCATE TABLE sessions, accounts, verification_tokens, users RESTART IDENTITY CASCADE`
  await sql.end()
}
