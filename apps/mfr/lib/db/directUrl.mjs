// Resolves the direct (non-pooled) Postgres URL used for migrations. Local, dev,
// staging, and prod set DIRECT_URL explicitly. Per-PR preview deployments get
// their database from the Neon–Vercel integration, which injects the non-pooled
// URL as DATABASE_URL_UNPOOLED — so fall back to it when DIRECT_URL is unset (or
// empty). Returns undefined when neither is present.
/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {string | undefined}
 */
export function resolveDirectUrl(env = process.env) {
  return env.DIRECT_URL || env.DATABASE_URL_UNPOOLED || undefined
}
