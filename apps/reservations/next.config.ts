import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ["millerfamilyreunions.org", "mfrweb.vercel.app"],
    },
  },
};

export default nextConfig;
