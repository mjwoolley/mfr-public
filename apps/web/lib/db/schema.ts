import { pgTable, uuid, boolean, timestamp, integer, text, date, unique } from 'drizzle-orm/pg-core'

// The portal database is apps/web's own business DB (a dedicated Neon project),
// separate from the shared identity DB (@mfr/auth) and from accounting's and
// reservations' DBs. Rows here reference identity `users.id` logically, not via
// a real FK — Postgres has no cross-database foreign keys.

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

/**
 * Single-row settings (id always 'singleton'), upsert-read like accounting's
 * AppSettings. Drives the reunion window (Meals day list + year labels) and the
 * admin-managed cross-app links. The fundraising goal amount is NOT here — it
 * lives in accounting (ContributionGoal) and is served by its API.
 */
export const portalSettings = pgTable('portal_settings', {
  id: text('id').primaryKey().default('singleton'),
  reunionYear: integer('reunion_year').notNull().default(2026),
  reunionStart: date('reunion_start', { mode: 'string' }),
  reunionEnd: date('reunion_end', { mode: 'string' }),
  highlightsUrl: text('highlights_url').notNull().default(''),
  driveUrl: text('drive_url').notNull().default(''),
  venmoUrl: text('venmo_url').notNull().default(''),
  chatUrl: text('chat_url').notNull().default(''),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
export type PortalSettingsRow = typeof portalSettings.$inferSelect

/** Per-year Google Photos album links, managed in Admin, shown on /photos. */
export const portalPhotoAlbums = pgTable('portal_photo_albums', {
  id: uuid('id').defaultRandom().primaryKey(),
  year: integer('year').notNull().unique(),
  url: text('url').notNull().default(''),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
export type PortalPhotoAlbumRow = typeof portalPhotoAlbums.$inferSelect

/**
 * Upcoming events shown on the home page (sorted by start date). An event is
 * either a single day (with an optional `time`) or a multi-day range
 * (`endDate` set). `endDate` is inclusive; leave it null for a single day.
 */
export const portalEvents = pgTable('portal_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  startDate: date('start_date', { mode: 'string' }),
  endDate: date('end_date', { mode: 'string' }),
  time: text('time').notNull().default(''),
  description: text('description').notNull().default(''),
  meetingLink: text('meeting_link'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
export type PortalEventRow = typeof portalEvents.$inferSelect

/**
 * Meal RSVPs — presence of a row = that user is attending that meal. `dayIndex`
 * is 1-based into the reunion window; `meal` is 'L' (lunch) or 'D' (dinner).
 */
export const portalMealRsvps = pgTable(
  'portal_meal_rsvps',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    identityUserId: uuid('identity_user_id').notNull(),
    dayIndex: integer('day_index').notNull(),
    meal: text('meal').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('portal_meal_rsvps_unique').on(t.identityUserId, t.dayIndex, t.meal)],
)
export type PortalMealRsvpRow = typeof portalMealRsvps.$inferSelect
