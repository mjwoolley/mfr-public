import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@mfr/auth"],
  experimental: {
    serverActions: {
      allowedOrigins: ["millerfamilyreunions.org", "mfrweb.vercel.app"],
    },
  },
};

export default nextConfig;
