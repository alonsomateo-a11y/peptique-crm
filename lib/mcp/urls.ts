import "server-only"

/** Origen público del CRM según el proxy (nginx manda x-forwarded-*). */
export function origenPublico(h: Headers) {
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "crm.peptique.com.mx"
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https")
  return `${proto}://${host}`
}

/** Emisor OAuth: Supabase Auth publicado en /auth/v1 (en producción, el mismo dominio del CRM). */
export const emisorOAuth = () => `${(process.env.SUPABASE_URL_PUBLICA ?? "https://crm.peptique.com.mx").replace(/\/$/, "")}/auth/v1`

/** Orígenes de navegador que pueden llamar a /mcp (claude.ai llama desde sus servidores, sin Origin). */
export function origenPermitido(origen: string | null, propio: string) {
  if (!origen) return true
  const lista = ["https://claude.ai", "https://claude.com", propio, ...(process.env.MCP_ORIGENES ?? "").split(",").map((x) => x.trim()).filter(Boolean)]
  return lista.includes(origen)
}
