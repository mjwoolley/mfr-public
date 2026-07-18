// Shared constants + result type for the member photo gallery. A plain module
// (no "use server"/"use client") so both the server actions and the client
// upload/edit components can import it.

export type ActionResult = { ok: true } | { error: string }

/** Max size of a single uploaded original, in bytes (~25 MB). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

/** Longest edge, in px, that a stored image is downscaled to. */
export const MAX_DIMENSION = 2560

/** How many photos one member may feature (home-page "Featured" album). */
export const FEATURED_PER_USER = 5

/** Days a deleted photo's backup is retained before the cron purges it. */
export const BACKUP_RETENTION_DAYS = 30

/** Upload content types accepted at the token gate (HEIC/HEIF for iPhones). */
export const ACCEPTED_UPLOAD_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
] as const
