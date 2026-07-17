import postgres from 'postgres'

// Global setup for the web integration suite: truncate the portal feature
// tables and the shared identity users tables on the one unified Neon test
// branch before the run. Guarded on TEST_DATABASE_URL so we can never hit a
// real database.
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set — integration tests must run against the unified test branch',
    )
  }

  const sql = postgres(url, { prepare: false })
  await sql`TRUNCATE TABLE portal_user_roles, portal_settings, portal_photo_albums, portal_events, portal_meal_rsvps RESTART IDENTITY CASCADE`
  await sql`TRUNCATE TABLE sessions, accounts, verification_tokens, users RESTART IDENTITY CASCADE`
  await sql.end()
}
