import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Servidor propio (Hetzner): imagen de Docker solo con lo necesario para correr.
  output: "standalone",
  experimental: {
    // PDFs de protocolos y COA (hasta 10 MB) se suben con Server Actions.
    serverActions: { bodySizeLimit: "11mb" },
  },
  // Conector de Claude (MCP): descubrimiento OAuth en las rutas estándar.
  async rewrites() {
    return [
      { source: "/.well-known/oauth-protected-resource", destination: "/oauth/recurso" },
      { source: "/.well-known/oauth-protected-resource/:ruta*", destination: "/oauth/recurso" },
      { source: "/.well-known/oauth-authorization-server", destination: "/oauth/metadatos" },
      { source: "/.well-known/oauth-authorization-server/auth/v1", destination: "/oauth/metadatos" },
    ]
  },
};

export default nextConfig;
