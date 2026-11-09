import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Servidor propio (Hetzner): imagen de Docker solo con lo necesario para correr.
  output: "standalone",
  experimental: {
    // PDFs de protocolos y COA (hasta 10 MB) se suben con Server Actions.
    serverActions: { bodySizeLimit: "11mb" },
  },
};

export default nextConfig;
