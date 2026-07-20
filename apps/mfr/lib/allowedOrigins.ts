// Parses ADDITIONAL_ALLOWED_ORIGINS (a comma-separated host allowlist) into the
// array Next's `experimental.serverActions.allowedOrigins` expects. Server
// Actions reject a request whose Origin doesn't match the Host; a per-PR preview
// deployment (or any proxied host, e.g. the OAuth redirect proxy) can present an
// Origin that differs from the deployment's canonical host, so each preview env
// sets this to allow itself (e.g. "*.vercel.app"). Unset in prod/dev → [].
export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
}
