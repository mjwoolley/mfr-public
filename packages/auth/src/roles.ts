import postgres from 'postgres'

/**
 * The portal role model. Stackable booleans (a user can hold several roles at
 * once), stored one row per user in the portal DB's `portal_user_roles` table
 * and attached to every session by `@mfr/auth`'s shared session callback.
 *
 *  - siteOwner:        full power over everything, including user management.
 *  - siteManager:      portal content admin + reservations admin + member
 *                      approval (everything except accounting admin and role
 *                      assignment).
 *  - accountingManager: the capability to enter contributions/expenses
 *                      (what used to be `isAccountingAdmin`).
 */
export interface UserRoles {
  siteOwner: boolean
  siteManager: boolean
  accountingManager: boolean
}

export const NO_ROLES: UserRoles = {
  siteOwner: false,
  siteManager: false,
  accountingManager: false,
}

// ── Derived capabilities ──────────────────────────────────────────────────
// The single definition of what each role can do, shared by every app's gates
// so authorization stays consistent across the portal, accounting and
// reservations.

/** Assign/revoke roles — the highest privilege. Owner only. */
export const canManageUsers = (r: UserRoles): boolean => r.siteOwner

/** Approve/block members (account status). Owner or manager; role assignment
 * stays owner-only (`canManageUsers`). */
export const canApproveMembers = (r: UserRoles): boolean => r.siteOwner || r.siteManager

/** Edit portal content: reunion schedule, photo albums, events, meals. */
export const canManagePortalContent = (r: UserRoles): boolean => r.siteOwner || r.siteManager

/** Reservations admin functions (blocked dates, booking rules, …). */
export const canAdminReservations = (r: UserRoles): boolean => r.siteOwner || r.siteManager

/** Accounting admin functions (enter contributions/expenses, settings). */
export const canAdminAccounting = (r: UserRoles): boolean => r.siteOwner || r.accountingManager

// ── Reader ────────────────────────────────────────────────────────────────

/** A function that resolves a user's roles by their identity user id. */
export type RolesReader = (userId: string) => Promise<UserRoles>

interface RolesRow {
  is_site_owner: boolean
  is_site_manager: boolean
  is_accounting_manager: boolean
}

/** Maps a raw `portal_user_roles` row to `UserRoles`. Pure — unit-tested. */
export function mapRolesRow(row: RolesRow | undefined): UserRoles {
  if (!row) return NO_ROLES
  return {
    siteOwner: row.is_site_owner,
    siteManager: row.is_site_manager,
    accountingManager: row.is_accounting_manager,
  }
}

/**
 * Builds a roles reader over a portal-DB connection string. The session
 * callback runs in every app, so each app constructs one of these (via
 * {@link createRolesReaderFromEnv}) at module-load time — a single lazy
 * postgres client, same pattern as `createIdentityDb`. Reads are keyed by the
 * identity user id (cross-database, no FK); a user with no row has NO_ROLES.
 */
export function createRolesReader(connectionString: string): RolesReader {
  // Neon's pooled connection runs in transaction mode — disable prepared
  // statements (same reason as the identity/reservations clients).
  const sql = postgres(connectionString, { prepare: false })
  return async function getUserRoles(userId: string): Promise<UserRoles> {
    const rows = await sql<RolesRow[]>`
      SELECT is_site_owner, is_site_manager, is_accounting_manager
      FROM portal_user_roles
      WHERE identity_user_id = ${userId}
      LIMIT 1
    `
    return mapRolesRow(rows[0])
  }
}

export function createRolesReaderFromEnv(): RolesReader {
  const connectionString = process.env.PORTAL_DATABASE_URL
  if (!connectionString) {
    throw new Error('PORTAL_DATABASE_URL is not set')
  }
  return createRolesReader(connectionString)
}

/** Resolves the set of identity user ids that hold reservations-admin (site
 * owner or site manager). Used by reservations' notifications to find which
 * users to CC — "who is a reservations admin" now lives in the portal DB, not
 * the identity `users` table. */
export type ReservationsAdminIdsReader = () => Promise<string[]>

export function createReservationsAdminIdsReader(
  connectionString: string,
): ReservationsAdminIdsReader {
  const sql = postgres(connectionString, { prepare: false })
  return async function listReservationsAdminIds(): Promise<string[]> {
    const rows = await sql<{ identity_user_id: string }[]>`
      SELECT identity_user_id
      FROM portal_user_roles
      WHERE is_site_owner OR is_site_manager
    `
    return rows.map((r) => r.identity_user_id)
  }
}

export function createReservationsAdminIdsReaderFromEnv(): ReservationsAdminIdsReader {
  const connectionString = process.env.PORTAL_DATABASE_URL
  if (!connectionString) {
    throw new Error('PORTAL_DATABASE_URL is not set')
  }
  return createReservationsAdminIdsReader(connectionString)
}
