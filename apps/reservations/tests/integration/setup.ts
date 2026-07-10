import postgres from 'postgres'

export default async function setup() {
  const businessConnectionString = process.env.TEST_DIRECT_DATABASE_URL
  if (!businessConnectionString) {
    throw new Error('TEST_DIRECT_DATABASE_URL is not set')
  }
  const identityConnectionString = process.env.TEST_IDENTITY_DIRECT_DATABASE_URL
  if (!identityConnectionString) {
    throw new Error('TEST_IDENTITY_DIRECT_DATABASE_URL is not set')
  }

  // Truncate in dependency order, resetting to a known-empty state before
  // the integration run begins. RESTART IDENTITY is harmless here (no
  // serial/identity columns in this schema; all PKs are uuid or the fixed
  // booking_rules singleton) but included for safety if that ever changes.
  const businessSql = postgres(businessConnectionString, { prepare: false })
  await businessSql`TRUNCATE TABLE activity_log, reservations, blocked_dates, booking_rules RESTART IDENTITY CASCADE`
  await businessSql.end()

  // users/accounts/sessions/verification_tokens now live in the separate
  // shared identity test branch — truncate it independently.
  const identitySql = postgres(identityConnectionString, { prepare: false })
  await identitySql`TRUNCATE TABLE sessions, accounts, verification_tokens, users RESTART IDENTITY CASCADE`
  await identitySql.end()
}
