import postgres from 'postgres'

export default async function setup() {
  const connectionString = process.env.TEST_DIRECT_DATABASE_URL
  if (!connectionString) {
    throw new Error('TEST_DIRECT_DATABASE_URL is not set')
  }

  const sql = postgres(connectionString, { prepare: false })

  // Truncate in dependency order, resetting to a known-empty state before
  // the integration run begins. RESTART IDENTITY is harmless here (no
  // serial/identity columns in this schema; all PKs are uuid or the fixed
  // booking_rules singleton) but included for safety if that ever changes.
  await sql`TRUNCATE TABLE activity_log, reservations, blocked_dates, booking_rules, sessions, accounts, verification_tokens, users RESTART IDENTITY CASCADE`

  await sql.end()
}
