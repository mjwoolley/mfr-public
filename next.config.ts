import type { NextConfig } from "next";
import { withMicrofrontends } from "@vercel/microfrontends/next/config";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ["millerfamilyreunions.org", "mfraccounting.vercel.app", "mfrweb.vercel.app"],
    },
  },
};

export default withMicrofrontends(nextConfig);
