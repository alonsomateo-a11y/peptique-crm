import { atender } from "@/lib/mcp/protocolo"
import { origenPermitido, origenPublico } from "@/lib/mcp/urls"

// Conector de Claude (MCP, Streamable HTTP sin estado). Cada petición trae el token OAuth del usuario.
export const dynamic = "force-dynamic"

const CORS = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "WWW-Authenticate",
}

const cors = (origen: string | null): Record<string, string> => (origen ? { ...CORS, "Access-Control-Allow-Origin": origen, Vary: "Origin" } : {})

export async function POST(request: Request) {
  const propio = origenPublico(request.headers)
  const origen = request.headers.get("origin")
  if (!origenPermitido(origen, propio)) return Response.json({ error: "Origen no permitido" }, { status: 403 })

  let cuerpo: unknown
  try {
    cuerpo = await request.json()
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON no válido" } }, { status: 400, headers: cors(origen) })
  }

  const r = await atender(cuerpo, { autorizacion: request.headers.get("authorization"), headers: request.headers, recurso: `${propio}/mcp` })
  const headers = { ...cors(origen), ...(r.headers ?? {}), "Cache-Control": "no-store" }
  if (r.cuerpo === undefined) return new Response(null, { status: r.status, headers })
  return Response.json(r.cuerpo, { status: r.status, headers })
}

export async function OPTIONS(request: Request) {
  const origen = request.headers.get("origin")
  if (!origenPermitido(origen, origenPublico(request.headers))) return new Response(null, { status: 403 })
  return new Response(null, { status: 204, headers: cors(origen) })
}

// Este servidor no abre streams ni sesiones.
const noPermitido = () => new Response(null, { status: 405, headers: { Allow: "POST, OPTIONS" } })
export const GET = noPermitido
export const DELETE = noPermitido
