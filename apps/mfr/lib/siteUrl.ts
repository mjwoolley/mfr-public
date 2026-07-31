// The one place APP_BASE_URL is read.
//
// The merged app serves everything from a single origin, with reservations and
// accounting under /reservations and /accounting. Their email helpers each
// append their own section prefix (lib/reservations/email.ts,
// lib/accounting/email.ts); portal-level links — /admin/users, the home page —
// have no prefix and use `siteUrl` directly.

/** The bare origin, no trailing slash. Falls back to localhost in dev/tests. */
export function siteOrigin(): string {
  return (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '')
}

/**
 * An absolute URL for a portal-level path: `siteUrl('/admin/users')`.
 *
 * A plain string join, not `new URL(path, base)` — that constructor treats a
 * leading-slash path as absolute and would discard any path already on the
 * base.
 */
export function siteUrl(path: string): string {
  return `${siteOrigin()}${path.startsWith('/') ? path : `/${path}`}`
}
