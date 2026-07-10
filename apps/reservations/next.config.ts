import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@mfr/auth"],
  // All routes are physically nested under /reservations; make the bare
  // origin (e.g. reservations.millerfamilyreunions.org) land on the app.
  async redirects() {
    return [
      { source: "/", destination: "/reservations", permanent: false },
    ];
  },
  experimental: {
    serverActions: {
      allowedOrigins: ["millerfamilyreunions.org", "mfrweb.vercel.app"],
    },
  },
};

export default nextConfig;
