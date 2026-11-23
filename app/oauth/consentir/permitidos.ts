/**
 * A dónde puede regresar el código de autorización. Cualquiera puede registrarse como cliente OAuth
 * (así se conecta claude.ai), así que solo se permite devolverlo a Claude. En ensayo se agregan
 * más con OAUTH_REDIRECCIONES (separadas por coma), por ejemplo el MCP Inspector local.
 */
const CLAUDE = ["https://claude.ai/api/mcp/auth_callback", "https://claude.com/api/mcp/auth_callback"]

export function redireccionPermitida(uri: string) {
  const extra = (process.env.OAUTH_REDIRECCIONES ?? "").split(",").map((x) => x.trim()).filter(Boolean)
  return [...CLAUDE, ...extra].includes(uri.split("?")[0])
}
