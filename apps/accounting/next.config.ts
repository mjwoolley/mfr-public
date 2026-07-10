import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The @mfr/auth workspace package ships TypeScript source (no build step) —
  // Next transpiles it in place.
  transpilePackages: ["@mfr/auth"],
  experimental: {
    serverActions: {
      allowedOrigins: ["millerfamilyreunions.org", "mfrweb.vercel.app"],
    },
  },
};

export default nextConfig;
