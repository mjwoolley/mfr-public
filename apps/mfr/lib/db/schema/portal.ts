// Portal domain schema — the family portal's own tables (roles, settings,
// photo albums, events, meal RSVPs). Reused verbatim from the former
// apps/web/lib/db/schema.ts. Every table keeps its `portal_` prefix. Rows
// reference identity users.id logically (no cross-domain FK).

import {
  pgTable,
  uuid,
  boolean,
  timestamp,
  integer,
  text,
  date,
  unique,
  index,
} from 'drizzle-orm/pg-core'

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
 * lives in accounting (ContributionGoal).
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
 * Admin-curated preview images (stored in Vercel Blob) that power the rotating
 * slideshows on the home hero and the /photos album cards. Additive to the
 * Google Photos albums above — those remain the canonical archive. `collection`
 * is either a 4-digit reunion year (tying slides to that album by value) or the
 * literal "highlights" (the home hero set).
 */
export const portalPhotoSlides = pgTable(
  'portal_photo_slides',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    collection: text('collection').notNull(),
    blobUrl: text('blob_url').notNull(),
    blobPathname: text('blob_pathname').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    uploadedBy: text('uploaded_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('portal_photo_slides_collection_order_idx').on(t.collection, t.sortOrder)],
)
export type PortalPhotoSlideRow = typeof portalPhotoSlides.$inferSelect

/**
 * Member-uploaded gallery photos (backlog §4). Images are stored in Vercel Blob
 * after server-side normalization (HEIC→JPEG, auto-orient, EXIF/GPS stripped,
 * downscaled). `year` buckets the photo into a reunion-year album; `featured`
 * surfaces it in the home-page "Featured" album (capped per user in the action).
 * `uploadedBy` is the identity users.id (text, matching portal_photo_slides).
 */
export const portalPhotos = pgTable(
  'portal_photos',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    year: integer('year').notNull(),
    blobUrl: text('blob_url').notNull(),
    blobPathname: text('blob_pathname').notNull(),
    filename: text('filename').notNull().default(''),
    byteSize: integer('byte_size').notNull().default(0),
    width: integer('width').notNull().default(0),
    height: integer('height').notNull().default(0),
    caption: text('caption'),
    featured: boolean('featured').notNull().default(false),
    featuredAt: timestamp('featured_at', { withTimezone: true }),
    uploadedBy: text('uploaded_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('portal_photos_year_created_idx').on(t.year, t.createdAt),
    index('portal_photos_uploader_created_idx').on(t.uploadedBy, t.createdAt),
    index('portal_photos_featured_idx').on(t.featured, t.featuredAt),
  ],
)
export type PortalPhotoRow = typeof portalPhotos.$inferSelect

/**
 * Durability tracking for photo blob objects: each stored blob is mirrored to an
 * independent store (Cloudflare R2). One row per blob object, keyed by pathname.
 * `deletedAt` is set when the source photo is deleted — it starts a recovery
 * window (BACKUP_RETENTION_DAYS) after which the daily cron purges the backup.
 */
export const portalBlobBackups = pgTable('portal_blob_backups', {
  blobPathname: text('blob_pathname').primaryKey(),
  backupKey: text('backup_key').notNull(),
  byteSize: integer('byte_size').notNull().default(0),
  backedUpAt: timestamp('backed_up_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})
export type PortalBlobBackupRow = typeof portalBlobBackups.$inferSelect

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
