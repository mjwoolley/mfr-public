import postgres from 'postgres'
import { personas, MEMBER_SHAREHOLDER_ID, SESSION_EXPIRES } from './personas'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

/**
 * Resets all three e2e databases to a known state and seeds the fixed
 * personas (users + session rows), the reservations booking-rules singleton,
 * and one accounting Shareholder linked to the member persona by email.
 *
 * Everything here is destructive — the E2E_* URLs must point at dedicated
 * branches (ephemeral CI branches or the local `test` branches).
 */
export default async function globalSetup() {
  const identity = postgres(requireEnv('E2E_IDENTITY_DIRECT_URL'), { prepare: false })
  const reservations = postgres(requireEnv('E2E_RESERVATIONS_DIRECT_URL'), { prepare: false })
  const accounting = postgres(requireEnv('E2E_ACCOUNTING_DIRECT_URL'), { prepare: false })
  const portal = postgres(requireEnv('E2E_PORTAL_DIRECT_URL'), { prepare: false })

  try {
    // Identity: wipe, then seed users + sessions. Roles no longer live here —
    // authorization comes from the portal DB (seeded below).
    await identity`TRUNCATE TABLE sessions, accounts, verification_tokens, users RESTART IDENTITY CASCADE`
    for (const persona of Object.values(personas)) {
      await identity`
        INSERT INTO users (id, email, name, status)
        VALUES (${persona.id}, ${persona.email}, ${persona.name}, ${persona.status})
      `
      await identity`
        INSERT INTO sessions (session_token, user_id, expires)
        VALUES (${persona.sessionToken}, ${persona.id}, ${SESSION_EXPIRES})
      `
    }

    // Portal: wipe roles, then seed each persona's roles — the single source of
    // authorization read by every app's session callback.
    await portal`TRUNCATE TABLE portal_user_roles RESTART IDENTITY CASCADE`
    // The Photos page test needs at least one album row. CI's ephemeral
    // branches clone production (which has albums), but the local `test`
    // branches lose theirs whenever apps/web's integration suite truncates
    // the table — seed one idempotently so the suite is deterministic.
    await portal`
      INSERT INTO portal_photo_albums (year, url) VALUES (2026, '')
      ON CONFLICT (year) DO NOTHING
    `
    for (const persona of Object.values(personas)) {
      const { siteOwner, siteManager, accountingManager } = persona.roles
      if (siteOwner || siteManager || accountingManager) {
        await portal`
          INSERT INTO portal_user_roles (identity_user_id, is_site_owner, is_site_manager, is_accounting_manager)
          VALUES (${persona.id}, ${siteOwner}, ${siteManager}, ${accountingManager})
        `
      }
    }

    // Reservations: wipe, then seed the booking-rules singleton the create
    // flow requires (mirrors the integration-test fixture).
    await reservations`TRUNCATE TABLE activity_log, reservations, blocked_dates, booking_rules RESTART IDENTITY CASCADE`
    await reservations`
      INSERT INTO booking_rules (id, booking_horizon_date, max_consecutive_nights, max_nights_per_user_per_year)
      VALUES (1, '2030-12-31', 14, 60)
    `

    // Accounting: wipe business tables (same set the integration suite
    // truncates), then seed a Shareholder whose email matches the member
    // persona — the auth extendSession hook links it on first session read.
    await accounting`TRUNCATE TABLE "Shareholder", "Transaction", "LedgerEntry", "TransactionApproval", "Expense" RESTART IDENTITY CASCADE`
    await accounting`
      INSERT INTO "Shareholder" (id, name, email, active)
      VALUES (${MEMBER_SHAREHOLDER_ID}, 'E2E Member', ${personas.member.email}, true)
    `
  } finally {
    await identity.end()
    await reservations.end()
    await accounting.end()
    await portal.end()
  }
}
