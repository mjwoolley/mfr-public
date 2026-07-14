// Cross-app portal URLs — the links that jump between the three apps (home,
// reservations, accounting).
//
// Production values are the defaults, so a plain build with none of these env
// vars set behaves exactly as before. Other environments (e.g. the online
// staging deploy) override them via the matching NEXT_PUBLIC_* variable, which
// Next inlines into each app's bundle at build time. Without this, staging's
// cross-app links would bounce the user back to the production site.
export const HOME_URL = process.env.NEXT_PUBLIC_HOME_URL ?? 'https://millerfamilyreunions.org'

export const RESERVATIONS_URL =
  process.env.NEXT_PUBLIC_RESERVATIONS_URL ??
  'https://reservations.millerfamilyreunions.org/reservations'

export const ACCOUNTING_URL =
  process.env.NEXT_PUBLIC_ACCOUNTING_URL ?? 'https://accounting.millerfamilyreunions.org/accounting'
