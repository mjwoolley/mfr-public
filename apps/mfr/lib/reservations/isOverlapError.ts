// Detects "someone else booked those dates first". App-level validation
// can't catch a concurrent insert, so the database is the final authority
// (see drizzle/0001_overlap_constraints.sql) and this maps its rejections so
// routes can return 409 instead of 500. Drizzle wraps the postgres-js error
// as `cause` on the thrown error.

interface ErrorWithCause {
  cause?: {
    code?: string
    message?: string
  }
}

export function isOverlapError(err: unknown): boolean {
  const cause = (err as ErrorWithCause)?.cause
  if (!cause) return false
  // 23P01 = exclusion_violation: the GiST no-overlap constraint on confirmed
  // reservations.
  if (cause.code === '23P01') return true
  // Cross-table checks (reservation vs blocked_dates) are enforced by
  // triggers, which surface as generic raise_exception — match on the
  // trigger's message text instead.
  if (cause.message?.includes('reservation_overlaps_blocked_date')) return true
  if (cause.message?.includes('blocked_date_overlaps_reservation')) return true
  return false
}
