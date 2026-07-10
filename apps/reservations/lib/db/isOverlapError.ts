interface ErrorWithCause {
  cause?: {
    code?: string
    message?: string
  }
}

export function isOverlapError(err: unknown): boolean {
  const cause = (err as ErrorWithCause)?.cause
  if (!cause) return false
  if (cause.code === '23P01') return true
  if (cause.message?.includes('reservation_overlaps_blocked_date')) return true
  if (cause.message?.includes('blocked_date_overlaps_reservation')) return true
  return false
}
