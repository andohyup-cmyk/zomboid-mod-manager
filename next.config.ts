import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Never serve stale pages from the client router cache: catalog/dashboard data
  // changes after registering or categorizing mods and must show without a manual reload.
  experimental: {
    staleTimes: { dynamic: 0, static: 30 }
  }
};

export default nextConfig;
