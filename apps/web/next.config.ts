import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @mfr/ui ships TypeScript source (no build step) — Next transpiles it.
  transpilePackages: ["@mfr/ui"],
};

export default nextConfig;
