import { pgTable, uuid, boolean, timestamp } from 'drizzle-orm/pg-core'

// The portal database is apps/web's own business DB (a dedicated Neon project),
// separate from the shared identity DB (@mfr/auth) and from accounting's and
// reservations' DBs. Rows here reference identity `users.id` logically, not via
// a real FK — Postgres has no cross-database foreign keys.
//
// PR 1 defines only the role model. PR 2 adds the feature tables (reunion
// settings, photo albums, events, meal RSVPs) to this same schema.

/**
 * One row per user who holds any portal role. Absence of a row means the user
 * has no roles (a plain approved member). The columns map to `UserRoles` in
 * `@mfr/auth` — keep the names in sync with that package's raw roles query.
 */
export const portalUserRoles = pgTable('portal_user_roles', {
  identityUserId: uuid('identity_user_id').primaryKey(),
  isSiteOwner: boolean('is_site_owner').notNull().default(false),
  isSiteManager: boolean('is_site_manager').notNull().default(false),
  isAccountingManager: boolean('is_accounting_manager').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type PortalUserRolesRow = typeof portalUserRoles.$inferSelect
