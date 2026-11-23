import "server-only"

import { z } from "zod"

import { herramientasPara, HERRAMIENTAS, type Herramienta } from "./herramientas"
import { sesionDesdeToken, type SesionMcp } from "./sesion"

/**
 * Servidor MCP sin estado (Streamable HTTP, solo POST con respuesta JSON).
 * - 2026-07-28: sin initialize; versión y capacidades en _meta; server/discover; headers Mcp-Method y Mcp-Name.
 * - 2025-11-25 y anteriores: initialize + notifications/initialized, sin Mcp-Session-Id (modo sin estado).
 */

export const VERSION_ACTUAL = "2026-07-28"
const VERSIONES_ANTERIORES = ["2025-11-25", "2025-06-18", "2025-03-26"]
export const VERSIONES = [VERSION_ACTUAL, ...VERSIONES_ANTERIORES]
const INFO = { name: "peptique-crm", title: "Peptique CRM", version: "1.0.0" }
const META = "io.modelcontextprotocol/"

const INSTRUCCIONES = [
  "Conector del CRM de Peptique. Responde en español de México y con montos en pesos.",
  "Fechas en hora de Monterrey. Solo ves lo que tu perfil ve en el CRM.",
  "Para guardar algo (venta, pago, lote, precio) primero llama a la herramienta proponer_*: no guarda nada y devuelve un resumen y un propuesta_id.",
  "Muestra ese resumen al usuario y espera su sí explícito antes de llamar a confirmar_propuesta. Si duda o cambia algo, haz una propuesta nueva o usa descartar_propuesta.",
  "Para recompras: el aviso al cliente es manual por WhatsApp con un toque; no se manda nada automático.",
].join("\n")

type Id = string | number | null
type Peticion = { jsonrpc: "2.0"; id?: Id; method: string; params?: Record<string, unknown> & { _meta?: Record<string, unknown> } }

export type Respuesta = { status: number; cuerpo?: unknown; headers?: Record<string, string> }

const rpcError = (id: Id, code: number, message: string, data?: unknown, status = 200): Respuesta => ({
  status,
  cuerpo: { jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } },
})
const rpcOk = (id: Id, result: unknown): Respuesta => ({ status: 200, cuerpo: { jsonrpc: "2.0", id, result } })

function definicion(h: Herramienta) {
  const schema = z.toJSONSchema(h.entrada, { target: "draft-2020-12" }) as Record<string, unknown>
  delete schema.$schema
  return {
    name: h.nombre,
    title: h.titulo,
    description: h.descripcion,
    inputSchema: schema,
    annotations: { title: h.titulo, readOnlyHint: h.lectura, destructiveHint: !!h.destructiva, idempotentHint: h.lectura, openWorldHint: false },
  }
}

export type Contexto = { autorizacion: string | null; headers: Headers; recurso: string }

/** Procesa una petición JSON-RPC ya parseada. */
export async function atender(cuerpo: unknown, c: Contexto): Promise<Respuesta> {
  if (Array.isArray(cuerpo)) return rpcError(null, -32600, "No se aceptan lotes de peticiones (batch).", undefined, 400)
  const p = cuerpo as Peticion
  if (!p || p.jsonrpc !== "2.0" || typeof p.method !== "string") return rpcError(null, -32600, "Petición JSON-RPC no válida.", undefined, 400)
  const id: Id = p.id ?? null
  const esNotificacion = p.id === undefined

  // Versión: en 2026-07-28 viaja en _meta y en el header MCP-Protocol-Version (deben coincidir).
  const meta = p.params?._meta ?? {}
  const versionMeta = meta[`${META}protocolVersion`] as string | undefined
  const versionHeader = c.headers.get("mcp-protocol-version")
  const moderna = !!versionMeta
  const st = (n: number) => (moderna ? n : 200)
  if (moderna) {
    if (!VERSIONES.includes(versionMeta)) return rpcError(id, -32022, "Unsupported protocol version", { supported: VERSIONES, requested: versionMeta }, 400)
    if (versionHeader && versionHeader !== versionMeta) return rpcError(id, -32020, "MCP-Protocol-Version no coincide con _meta", undefined, 400)
    const metodo = c.headers.get("mcp-method")
    if (metodo && metodo !== p.method) return rpcError(id, -32020, "Mcp-Method no coincide con el método", undefined, 400)
    if (p.method === "tools/call") {
      const nombre = c.headers.get("mcp-name")
      if (nombre && nombre !== (p.params?.name as string)) return rpcError(id, -32020, "Mcp-Name no coincide con la herramienta", undefined, 400)
    }
  } else if (versionHeader && !VERSIONES.includes(versionHeader)) {
    return { status: 400, cuerpo: { error: "Versión de MCP no soportada", supported: VERSIONES } }
  }

  if (esNotificacion) return { status: 202 }

  // Todo exige token: sin token se responde 401 para que Claude abra el inicio de sesión OAuth.
  const s = await sesionDesdeToken(c.autorizacion)
  if ("falla" in s) {
    if (s.falla === "sin_permiso") return { status: 403, cuerpo: { error: "insufficient_scope", error_description: s.detalle }, headers: { "WWW-Authenticate": desafio(c.recurso, "insufficient_scope", s.detalle) } }
    return { status: 401, cuerpo: { error: "invalid_token", error_description: s.detalle }, headers: { "WWW-Authenticate": desafio(c.recurso, s.falla === "sin_token" ? null : "invalid_token", s.detalle) } }
  }

  switch (p.method) {
    case "initialize": {
      const pedida = p.params?.protocolVersion as string | undefined
      const version = pedida && VERSIONES_ANTERIORES.includes(pedida) ? pedida : VERSIONES_ANTERIORES[0]
      return rpcOk(id, { protocolVersion: version, capabilities: { tools: { listChanged: false } }, serverInfo: INFO, instructions: INSTRUCCIONES })
    }
    case "server/discover":
      return rpcOk(id, {
        resultType: "complete",
        supportedVersions: VERSIONES,
        capabilities: { tools: {} },
        instructions: INSTRUCCIONES,
        ttlMs: 300_000,
        cacheScope: "private",
        _meta: { [`${META}serverInfo`]: INFO },
      })
    case "ping":
      return rpcOk(id, {})
    case "tools/list":
      return rpcOk(id, {
        ...(moderna ? { resultType: "complete", ttlMs: 300_000, cacheScope: "private" } : {}),
        tools: herramientasPara(s.sesion.perfil).map(definicion),
      })
    case "tools/call":
      return llamar(id, p.params ?? {}, s, moderna, st)
    default:
      return rpcError(id, -32601, `Método no soportado: ${p.method}`, undefined, st(404))
  }
}

async function llamar(id: Id, params: Record<string, unknown>, s: SesionMcp, moderna: boolean, st: (n: number) => number): Promise<Respuesta> {
  const h = HERRAMIENTAS.find((x) => x.nombre === params.name)
  if (!h) return rpcError(id, -32602, `Herramienta desconocida: ${String(params.name)}`, undefined, st(400))
  const base = moderna ? { resultType: "complete" } : {}
  // Mismo criterio que las pantallas: si el perfil no tiene esa pantalla, no tiene la herramienta.
  if (!h.perfiles.includes(s.sesion.perfil))
    return rpcOk(id, { ...base, isError: true, content: [{ type: "text", text: "Tu perfil no tiene permiso para esto en el CRM." }] })
  const args = h.entrada.safeParse(params.arguments ?? {})
  if (!args.success)
    return rpcOk(id, { ...base, isError: true, content: [{ type: "text", text: `Datos no válidos: ${args.error.issues.map((i) => `${i.path.join(".") || "entrada"}: ${i.message}`).join("; ")}` }] })
  try {
    const r = await h.ejecutar(s, args.data as never)
    const content = [{ type: "text", text: r.texto }]
    if (r.datos !== undefined) content.push({ type: "text", text: JSON.stringify(r.datos) })
    return rpcOk(id, { ...base, content, ...(r.datos !== undefined ? { structuredContent: typeof r.datos === "object" && !Array.isArray(r.datos) ? r.datos : { resultado: r.datos } } : {}), isError: !!r.error })
  } catch (e) {
    console.error("[mcp]", h.nombre, e)
    return rpcOk(id, { ...base, isError: true, content: [{ type: "text", text: "Ocurrió un error en el CRM. No se guardó nada nuevo; intenta de nuevo." }] })
  }
}

export function urlMetadatosRecurso(recurso: string) {
  const u = new URL(recurso)
  return `${u.origin}/.well-known/oauth-protected-resource${u.pathname}`
}

// Los headers HTTP van en ASCII: sin acentos ni comillas.
const ascii = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "").replace(/"/g, "'")

function desafio(recurso: string, error: string | null, detalle: string) {
  return [`Bearer resource_metadata="${urlMetadatosRecurso(recurso)}"`, ...(error ? [`error="${error}"`, `error_description="${ascii(detalle)}"`] : [])].join(", ")
}
