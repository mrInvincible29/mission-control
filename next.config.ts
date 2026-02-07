import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Output standalone for easier deployment
  output: "standalone",
  
  // Allow server actions
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
