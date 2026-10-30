import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"
import { headers } from "next/headers"

/**
 * Ligas firmadas para que el cliente vea el COA público y el protocolo de su compra.
 * La liga lleva la venta y su vencimiento, firmados con una llave del servidor: no se puede
 * cambiar ni adivinar la de otra venta. Nunca da acceso al COA original.
 */

const DIAS = 30

const llave = () => {
  const k = process.env.DOCUMENTOS_SECRET || process.env.SUPABASE_SECRET_KEY
  if (!k) throw new Error("Falta la llave para firmar ligas")
  return k
}

const firma = (cuerpo: string) => createHmac("sha256", llave()).update(`documentos:${cuerpo}`).digest("base64url").slice(0, 22)

export function tokenDocumentos(ventaId: string) {
  const vence = Math.floor(Date.now() / 1000) + DIAS * 86_400
  const cuerpo = `${Buffer.from(ventaId.replace(/-/g, ""), "hex").toString("base64url")}.${vence.toString(36)}`
  return `${cuerpo}.${firma(cuerpo)}`
}

/** Regresa el id de la venta si la liga es válida y no ha vencido. */
export function leerToken(token: string): { ventaId: string; vence: Date } | null {
  const [id, vence, f] = token.split(".")
  if (!id || !vence || !f) return null
  const esperada = Buffer.from(firma(`${id}.${vence}`))
  const recibida = Buffer.from(f)
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null
  const fecha = new Date(parseInt(vence, 36) * 1000)
  if (fecha.getTime() < Date.now()) return null
  const hex = Buffer.from(id, "base64url").toString("hex")
  if (hex.length !== 32) return null
  return { ventaId: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`, vence: fecha }
}

/** Liga completa con el dominio desde el que se usa el CRM. */
export async function ligaDocumentos(ventaId: string) {
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "crm.peptique.com.mx"
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  return `${proto}://${host}/d/${tokenDocumentos(ventaId)}`
}
