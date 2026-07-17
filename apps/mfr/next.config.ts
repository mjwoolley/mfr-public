import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // @mfr/ui and @mfr/auth ship TypeScript source (no build step) — Next
  // transpiles them. Single origin now, so no serverActions.allowedOrigins
  // allowlist and no cross-section redirects are needed (routes are already
  // /reservations and /accounting within this one app).
  transpilePackages: ['@mfr/ui', '@mfr/auth'],
}

export default nextConfig
