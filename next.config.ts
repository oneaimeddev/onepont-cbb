import type { NextConfig } from "next";
const config: NextConfig = {
  // The authenticated attachment route still enforces its own streaming byte limit.
  experimental: { proxyClientMaxBodySize: "21mb" },
};
export default config;
