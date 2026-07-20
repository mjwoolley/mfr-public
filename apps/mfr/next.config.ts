import type { NextConfig } from 'next'
import { parseAllowedOrigins } from './lib/allowedOrigins'

// Production/dev run on a single origin (Origin === Host), so no Server Actions
// allowlist is needed. Per-PR preview deployments — and any proxied host, e.g.
// the OAuth redirect proxy — can serve on a host that differs from the request
// Origin, which Server Actions reject by default. Each preview env sets
// ADDITIONAL_ALLOWED_ORIGINS (e.g. "*.vercel.app") to allow itself; unset in
// prod/dev, so the allowlist is omitted there.
const allowedOrigins = parseAllowedOrigins(process.env.ADDITIONAL_ALLOWED_ORIGINS)

const nextConfig: NextConfig = {
  // @mfr/ui and @mfr/auth ship TypeScript source (no build step) — Next
  // transpiles them.
  transpilePackages: ['@mfr/ui', '@mfr/auth'],
  // Photo-slide images are served from Vercel Blob.
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**.blob.vercel-storage.com' }],
  },
  ...(allowedOrigins.length > 0 ? { experimental: { serverActions: { allowedOrigins } } } : {}),
}

export default nextConfig
