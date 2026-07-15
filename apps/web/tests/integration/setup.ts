import postgres from 'postgres'

// Global setup for the web integration suite: truncate the portal roles table
// and the shared identity users table on their dedicated Neon test branches
// before the run. Guarded on TEST_* so we can never hit a real database.
export default async function setup() {
  const portalUrl = process.env.TEST_PORTAL_DATABASE_URL
  if (!portalUrl) {
    throw new Error('TEST_PORTAL_DATABASE_URL is not set — integration tests must run against the portal test branch')
  }
  const identityUrl = process.env.TEST_IDENTITY_DATABASE_URL
  if (!identityUrl) {
    throw new Error('TEST_IDENTITY_DATABASE_URL is not set — integration tests need the identity test branch')
  }

  const portalSql = postgres(portalUrl, { prepare: false })
  await portalSql`TRUNCATE TABLE portal_user_roles, portal_settings, portal_photo_albums, portal_events, portal_meal_rsvps RESTART IDENTITY CASCADE`
  await portalSql.end()

  const identitySql = postgres(identityUrl, { prepare: false })
  await identitySql`TRUNCATE TABLE sessions, accounts, verification_tokens, users RESTART IDENTITY CASCADE`
  await identitySql.end()
}
