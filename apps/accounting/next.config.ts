import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The @mfr/auth workspace package ships TypeScript source (no build step) —
  // Next transpiles it in place.
  transpilePackages: ["@mfr/auth"],
  // All routes are physically nested under /accounting; make the bare
  // origin (e.g. accounting.millerfamilyreunions.org) land on the app.
  async redirects() {
    return [{ source: "/", destination: "/accounting", permanent: false }];
  },
  experimental: {
    serverActions: {
      allowedOrigins: ["millerfamilyreunions.org", "mfrweb.vercel.app"],
    },
  },
};

export default nextConfig;
