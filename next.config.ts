import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // PDFs de protocolos y COA (hasta 10 MB) se suben con Server Actions.
    serverActions: { bodySizeLimit: "11mb" },
  },
};

export default nextConfig;
