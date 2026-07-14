import type { NextConfig } from 'next'

// Server actions are rejected unless the request Origin is allow-listed. The
// production hosts are the defaults; other environments (e.g. staging on its
// own subdomain) add their host via ADDITIONAL_ALLOWED_ORIGINS (comma-separated)
// so a second environment's hostname never has to be baked into source.
const allowedOrigins = [
  'millerfamilyreunions.org',
  'mfrweb.vercel.app',
  ...(process.env.ADDITIONAL_ALLOWED_ORIGINS?.split(',')
    .map((o) => o.trim())
    .filter(Boolean) ?? []),
]

const nextConfig: NextConfig = {
  transpilePackages: ['@mfr/auth', '@mfr/ui'],
  // All routes are physically nested under /reservations; make the bare
  // origin (e.g. reservations.millerfamilyreunions.org) land on the app.
  async redirects() {
    return [{ source: '/', destination: '/reservations', permanent: false }]
  },
  experimental: {
    serverActions: {
      allowedOrigins,
    },
  },
}

export default nextConfig
