import type { NextConfig } from "next";

// Server actions are rejected unless the request Origin is allow-listed. The
// production hosts are the defaults; other environments (e.g. staging on its
// own subdomain) add their host via ADDITIONAL_ALLOWED_ORIGINS (comma-separated)
// so a second environment's hostname never has to be baked into source.
const allowedOrigins = [
  "millerfamilyreunions.org",
  "mfrweb.vercel.app",
  ...(process.env.ADDITIONAL_ALLOWED_ORIGINS?.split(",")
    .map((o) => o.trim())
    .filter(Boolean) ?? []),
];

const nextConfig: NextConfig = {
  // The @mfr/auth workspace package ships TypeScript source (no build step) —
  // Next transpiles it in place.
  transpilePackages: ["@mfr/auth", "@mfr/ui"],
  // All routes are physically nested under /accounting; make the bare
  // origin (e.g. accounting.millerfamilyreunions.org) land on the app.
  async redirects() {
    return [{ source: "/", destination: "/accounting", permanent: false }];
  },
  experimental: {
    serverActions: {
      allowedOrigins,
    },
  },
};

export default nextConfig;
