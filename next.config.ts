import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Photos are shrunk on the phone before upload; this leaves headroom.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
