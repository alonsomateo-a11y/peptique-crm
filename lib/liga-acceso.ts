import "server-only"

import { createHash, randomBytes } from "node:crypto"
import { headers } from "next/headers"

import { crearClienteAdmin } from "@/lib/supabase/admin"
import type { Perfil } from "@/lib/perfiles"

export const HORAS_LIGA = 72

const hash = (token: string) => createHash("sha256").update(token).digest("hex")

/** Crea una liga nueva para la persona e invalida las anteriores. Devuelve la URL completa. */
export async function nuevaLigaAcceso(personaId: string, creadaPor: string) {
  const admin = crearClienteAdmin()
  const ahora = new Date()
  await admin.from("ligas_acceso").update({ vence_en: ahora.toISOString() }).eq("persona_id", personaId).is("usada_en", null)
  const token = randomBytes(32).toString("base64url")
  const vence = new Date(ahora.getTime() + HORAS_LIGA * 3600_000)
  const { error } = await admin
    .from("ligas_acceso")
    .insert({ persona_id: personaId, token_hash: hash(token), vence_en: vence.toISOString(), creada_por: creadaPor })
  if (error) return null
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "crm.peptique.com.mx"
  const protocolo = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https"
  return { url: `${protocolo}://${host}/activar/${token}`, vence: vence.toISOString() }
}

export type LigaValida = {
  ligaId: string
  personaId: string
  nombre: string
  perfil: Perfil
  authUserId: string
}

/** Revisa que la liga exista, no esté usada ni vencida y que la persona siga activa. */
export async function revisarLiga(token: string): Promise<LigaValida | "vencida" | "invalida"> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return "invalida"
  const admin = crearClienteAdmin()
  const { data: liga } = await admin
    .from("ligas_acceso")
    .select("id, persona_id, vence_en, usada_en")
    .eq("token_hash", hash(token))
    .maybeSingle()
  if (!liga) return "invalida"
  if (liga.usada_en || new Date(liga.vence_en) <= new Date()) return "vencida"
  const { data: p } = await admin
    .from("personas")
    .select("id, nombre, perfil, estado, auth_user_id")
    .eq("id", liga.persona_id)
    .single()
  if (!p || p.estado !== "activo" || !p.auth_user_id) return "invalida"
  return { ligaId: liga.id, personaId: p.id, nombre: p.nombre, perfil: p.perfil as Perfil, authUserId: p.auth_user_id }
}

/** Marca la liga como usada solo si sigue libre; evita que dos pestañas la canjeen a la vez. */
export async function marcarUsada(ligaId: string) {
  const admin = crearClienteAdmin()
  const { data } = await admin
    .from("ligas_acceso")
    .update({ usada_en: new Date().toISOString() })
    .eq("id", ligaId)
    .is("usada_en", null)
    .gt("vence_en", new Date().toISOString())
    .select("id")
  return (data ?? []).length === 1
}
