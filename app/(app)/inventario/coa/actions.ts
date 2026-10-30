"use server"

import { revalidatePath } from "next/cache"

import { obtenerSesion } from "@/lib/sesion"
import { crearClienteAdmin } from "@/lib/supabase/admin"

import type { Zona } from "./tipos"

const uuid = /^[0-9a-f-]{36}$/
const TIPOS: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg" }

async function soloAdmin() {
  const s = await obtenerSesion()
  return s.perfil === "administrador" && s.personaId !== "demo" ? s : null
}

const zonasValidas = (z: unknown): z is Zona[] =>
  Array.isArray(z) &&
  z.length <= 60 &&
  z.every((r) => r && Number.isInteger(r.pagina) && r.pagina >= 0 && [r.x, r.y, r.w, r.h].every((n) => typeof n === "number" && n >= 0 && n <= 1))

/** Liga temporal (2 min) al COA original, solo para el administrador. */
export async function ligaOriginal(loteId: string): Promise<{ url?: string; tipo?: string; error?: string }> {
  if (!(await soloAdmin()) || !uuid.test(loteId)) return { error: "Solo el administrador." }
  const admin = crearClienteAdmin()
  const { data: l } = await admin.from("lotes").select("coa_original_path").eq("id", loteId).single()
  if (!l?.coa_original_path) return { error: "Este lote no tiene COA original." }
  const { data } = await admin.storage.from("coas").createSignedUrl(l.coa_original_path, 120)
  return data ? { url: data.signedUrl, tipo: l.coa_original_path.split(".").pop() } : { error: "No se pudo abrir el COA." }
}

export async function ligaPublico(loteId: string): Promise<{ url?: string; error?: string }> {
  if (!(await soloAdmin()) || !uuid.test(loteId)) return { error: "Solo el administrador." }
  const admin = crearClienteAdmin()
  const { data: l } = await admin.from("lotes").select("coa_publico_path").eq("id", loteId).single()
  if (!l?.coa_publico_path) return { error: "Aún no hay COA público." }
  const { data } = await admin.storage.from("coas").createSignedUrl(l.coa_publico_path, 300)
  return data ? { url: data.signedUrl } : { error: "No se pudo abrir el COA." }
}

export async function subirOriginal(form: FormData): Promise<{ error?: string }> {
  const s = await soloAdmin()
  const loteId = String(form.get("lote_id") ?? "")
  const archivo = form.get("archivo")
  if (!s || !uuid.test(loteId)) return { error: "Solo el administrador." }
  if (!(archivo instanceof File) || !TIPOS[archivo.type]) return { error: "Sube un PDF, PNG o JPG." }
  if (archivo.size > 10 * 1024 * 1024) return { error: "Máximo 10 MB." }
  const admin = crearClienteAdmin()
  const ruta = `${loteId}/original.${TIPOS[archivo.type]}`
  const { error } = await admin.storage.from("coas").upload(ruta, archivo, { contentType: archivo.type, upsert: true })
  if (error) return { error: "No se pudo subir el archivo." }
  await admin.from("lotes").update({ coa_original_path: ruta, coa_publico_path: null, coa_estado: "por_aprobar" }).eq("id", loteId)
  const { data: l } = await admin.from("lotes").select("codigo").eq("id", loteId).single()
  await admin.from("bitacora").insert({ persona_id: s.personaId, perfil: s.perfil, area: "inventario", accion: `subió el COA original de ${l?.codigo ?? "un lote"}`, entidad: "lote", entidad_id: loteId })
  revalidatePath(`/inventario/coa/${loteId}`)
  revalidatePath("/inventario")
  return {}
}

/** Guarda las zonas (borrador). Sirven también como sugerencia para el siguiente lote. */
export async function guardarZonas(loteId: string, zonas: Zona[]): Promise<{ error?: string }> {
  if (!(await soloAdmin()) || !uuid.test(loteId) || !zonasValidas(zonas)) return { error: "Datos no válidos." }
  const { error } = await crearClienteAdmin()
    .storage.from("coas")
    .upload(`${loteId}/zonas.json`, new Blob([JSON.stringify(zonas)], { type: "application/json" }), { contentType: "application/json", upsert: true })
  return error ? { error: "No se pudo guardar el borrador." } : {}
}

/** Zonas guardadas de este lote o, si no hay, las del COA aprobado más reciente. */
export async function zonasSugeridas(loteId: string): Promise<{ zonas: Zona[]; origen: "propias" | "anterior" | null; lote?: string }> {
  if (!(await soloAdmin()) || !uuid.test(loteId)) return { zonas: [], origen: null }
  const admin = crearClienteAdmin()
  const leer = async (id: string) => {
    const { data } = await admin.storage.from("coas").download(`${id}/zonas.json`)
    if (!data) return null
    try {
      const z = JSON.parse(await data.text())
      return zonasValidas(z) ? z : null
    } catch {
      return null
    }
  }
  const propias = await leer(loteId)
  if (propias) return { zonas: propias, origen: "propias" }
  const { data: otros } = await admin.from("lotes").select("id, codigo").eq("coa_estado", "listo").neq("id", loteId).order("creado_en", { ascending: false }).limit(5)
  for (const o of otros ?? []) {
    const z = await leer(o.id)
    if (z) return { zonas: z, origen: "anterior", lote: o.codigo }
  }
  return { zonas: [], origen: null }
}

/** Recibe el PDF público ya aplanado (generado en el navegador) y lo aprueba. */
export async function aprobarCoa(form: FormData): Promise<{ error?: string }> {
  const s = await soloAdmin()
  const loteId = String(form.get("lote_id") ?? "")
  const archivo = form.get("archivo")
  let zonas: unknown
  try {
    zonas = JSON.parse(String(form.get("zonas") ?? "[]"))
  } catch {
    zonas = null
  }
  if (!s || !uuid.test(loteId)) return { error: "Solo el administrador." }
  if (!(archivo instanceof File) || archivo.type !== "application/pdf" || archivo.size > 10 * 1024 * 1024) return { error: "El PDF público no es válido." }
  if (!zonasValidas(zonas) || !zonas.length) return { error: "Marca al menos una zona." }
  const admin = crearClienteAdmin()
  const ruta = `${loteId}/publico.pdf`
  const { error } = await admin.storage.from("coas").upload(ruta, archivo, { contentType: "application/pdf", upsert: true })
  if (error) return { error: "No se pudo guardar el COA público." }
  await admin.storage.from("coas").upload(`${loteId}/zonas.json`, new Blob([JSON.stringify(zonas)], { type: "application/json" }), { contentType: "application/json", upsert: true })
  await admin.from("lotes").update({ coa_publico_path: ruta, coa_estado: "listo" }).eq("id", loteId)
  const { data: l } = await admin.from("lotes").select("codigo").eq("id", loteId).single()
  await admin.from("bitacora").insert({ persona_id: s.personaId, perfil: s.perfil, area: "inventario", accion: `aprobó el COA público de ${l?.codigo ?? "un lote"} (${zonas.length} zonas tapadas)`, entidad: "lote", entidad_id: loteId })
  revalidatePath(`/inventario/coa/${loteId}`)
  revalidatePath("/inventario")
  return {}
}
