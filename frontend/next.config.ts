import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    const target = process.env.API_PROXY_TARGET;
    return target
      ? [{ source: "/api/:path*", destination: `${target}/api/:path*` }]
      : [];
  },
};

export default nextConfig;
