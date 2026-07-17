import postgres from 'postgres'
import { personas, MEMBER_SHAREHOLDER_ID, SESSION_EXPIRES } from './personas'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

/**
 * Resets the ONE unified e2e database to a known state and seeds the fixed
 * personas (users + session rows), their portal roles, the deterministic
 * portal fixtures (albums, reunion week), the reservations booking-rules
 * singleton, and one accounting Shareholder linked to the member persona by
 * email.
 *
 * Everything here is destructive — E2E_DIRECT_URL must point at a dedicated
 * branch (an ephemeral CI branch or the local `test` branch), never
 * production. One connection now covers all four former domains (identity,
 * portal, reservations, accounting) since they share a single database.
 */
export default async function globalSetup() {
  const sql = postgres(requireEnv('E2E_DIRECT_URL'), { prepare: false })

  try {
    // Identity: wipe, then seed users + sessions. Roles no longer live here —
    // authorization comes from the portal role table (seeded below).
    await sql`TRUNCATE TABLE sessions, accounts, verification_tokens, users RESTART IDENTITY CASCADE`
    for (const persona of Object.values(personas)) {
      await sql`
        INSERT INTO users (id, email, name, status)
        VALUES (${persona.id}, ${persona.email}, ${persona.name}, ${persona.status})
      `
      await sql`
        INSERT INTO sessions (session_token, user_id, expires)
        VALUES (${persona.sessionToken}, ${persona.id}, ${SESSION_EXPIRES})
      `
    }

    // Portal: wipe roles, then seed each persona's roles — the single source of
    // authorization read by the session callback.
    await sql`TRUNCATE TABLE portal_user_roles RESTART IDENTITY CASCADE`
    // The Photos page test needs at least one album row. CI's ephemeral
    // branches clone production (which has albums), but the local `test`
    // branch loses its rows whenever the integration suite truncates the
    // table — seed one idempotently so the suite is deterministic.
    await sql`
      INSERT INTO portal_photo_albums (year, url) VALUES (2026, '')
      ON CONFLICT (year) DO NOTHING
    `
    // Pin the reunion schedule: the Meals page derives its day grid from
    // these dates, and integration suites elsewhere rewrite the settings
    // singleton — upsert known dates so the meals tests are deterministic.
    await sql`
      INSERT INTO portal_settings (id, reunion_year, reunion_start, reunion_end)
      VALUES ('singleton', 2026, '2026-08-07', '2026-08-14')
      ON CONFLICT (id) DO UPDATE
      SET reunion_year = 2026, reunion_start = '2026-08-07', reunion_end = '2026-08-14'
    `
    // Meal RSVPs are test-mutated state — start each run empty.
    await sql`TRUNCATE TABLE portal_meal_rsvps RESTART IDENTITY CASCADE`
    for (const persona of Object.values(personas)) {
      const { siteOwner, siteManager, accountingManager } = persona.roles
      if (siteOwner || siteManager || accountingManager) {
        await sql`
          INSERT INTO portal_user_roles (identity_user_id, is_site_owner, is_site_manager, is_accounting_manager)
          VALUES (${persona.id}, ${siteOwner}, ${siteManager}, ${accountingManager})
        `
      }
    }

    // Reservations: wipe, then seed the booking-rules singleton the create
    // flow requires (mirrors the integration-test fixture).
    await sql`TRUNCATE TABLE activity_log, reservations, blocked_dates, booking_rules RESTART IDENTITY CASCADE`
    await sql`
      INSERT INTO booking_rules (id, booking_horizon_date, max_consecutive_nights, max_nights_per_user_per_year)
      VALUES (1, '2030-12-31', 14, 60)
    `

    // Accounting: wipe the business tables (same set the integration suite
    // truncates), then seed a Shareholder whose email matches the member
    // persona — the auth extendSession hook links it on first session read.
    // NB: the `AppSettings` and `ContributionGoal` singletons are deliberately
    // NOT truncated. The accounting pages get-or-create the `AppSettings`
    // singleton on load, so an empty table lets concurrent requests race to
    // re-insert id='singleton' and one loses on the primary key (23505) —
    // crashing the page. Leaving these config rows in place (they exist on the
    // test branch / cloned production) keeps the read side deterministic.
    await sql`TRUNCATE TABLE "Shareholder", "Transaction", "LedgerEntry", "TransactionApproval", "Expense" RESTART IDENTITY CASCADE`
    await sql`
      INSERT INTO "Shareholder" (id, name, email, active)
      VALUES (${MEMBER_SHAREHOLDER_ID}, 'E2E Member', ${personas.member.email}, true)
    `
  } finally {
    await sql.end()
  }
}
