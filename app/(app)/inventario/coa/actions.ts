"use server"

import { revalidatePath } from "next/cache"

import { obtenerSesion } from "@/lib/sesion"
import { crearClienteAdmin } from "@/lib/supabase/admin"

import type { Zona } from "./tipos"
import { urlPublica } from "@/lib/supabase/url-publica"

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
  return data ? { url: urlPublica(data.signedUrl), tipo: l.coa_original_path.split(".").pop() } : { error: "No se pudo abrir el COA." }
}

export async function ligaPublico(loteId: string): Promise<{ url?: string; error?: string }> {
  if (!(await soloAdmin()) || !uuid.test(loteId)) return { error: "Solo el administrador." }
  const admin = crearClienteAdmin()
  const { data: l } = await admin.from("lotes").select("coa_publico_path").eq("id", loteId).single()
  if (!l?.coa_publico_path) return { error: "Aún no hay COA público." }
  const { data } = await admin.storage.from("coas").createSignedUrl(l.coa_publico_path, 300)
  return data ? { url: urlPublica(data.signedUrl) } : { error: "No se pudo abrir el COA." }
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
  const { error } = await crearClienteAdmin().from("lotes").update({ coa_zonas: zonas }).eq("id", loteId)
  return error ? { error: "No se pudo guardar el borrador." } : {}
}

export type FormatoCoa = { id: string; nombre: string; zonas: number }
export type Sugerencia = { zonas: Zona[]; origen: "propias" | "formato" | "anterior" | "elegir" | null; lote?: string; formatoId: string | null; formatos: FormatoCoa[] }

const leerZonasJson = (z: unknown): Zona[] | null => (zonasValidas(z) ? z : null)

/** Formatos de laboratorio, ordenados por nombre. */
async function listarFormatos(): Promise<FormatoCoa[]> {
  const { data } = await crearClienteAdmin().from("formatos_coa").select("id, nombre, zonas").order("nombre")
  return (data ?? []).map((f) => ({ id: f.id, nombre: f.nombre, zonas: Array.isArray(f.zonas) ? f.zonas.length : 0 }))
}

/**
 * Qué zonas poner al abrir el editor, en este orden:
 * 1. las guardadas de este lote;
 * 2. las del formato de laboratorio del lote (o, si no tiene, el del último lote del mismo producto);
 * 3. si ya hay formatos, ninguna: se pide elegir el laboratorio (las de otro laboratorio caerían en otro lugar);
 * 4. si aún no hay formatos, las del COA aprobado más reciente.
 */
export async function zonasSugeridas(loteId: string): Promise<Sugerencia> {
  const vacio: Sugerencia = { zonas: [], origen: null, formatoId: null, formatos: [] }
  if (!(await soloAdmin()) || !uuid.test(loteId)) return vacio
  const admin = crearClienteAdmin()
  const formatos = await listarFormatos()
  const { data: lote } = await admin.from("lotes").select("producto_id, formato_coa_id, coa_zonas").eq("id", loteId).single()
  let formatoId: string | null = lote?.formato_coa_id ?? null
  if (!formatoId && lote) {
    // Mismo producto suele venir del mismo laboratorio: se propone su formato.
    const { data: previo } = await admin.from("lotes").select("formato_coa_id").eq("producto_id", lote.producto_id).neq("id", loteId).not("formato_coa_id", "is", null).order("creado_en", { ascending: false }).limit(1).maybeSingle()
    if (previo?.formato_coa_id) {
      formatoId = previo.formato_coa_id
      await admin.from("lotes").update({ formato_coa_id: formatoId }).eq("id", loteId)
    }
  }
  const base = { formatoId, formatos }
  const propias = leerZonasJson(lote?.coa_zonas)
  if (propias) return { ...base, zonas: propias, origen: "propias" }
  if (formatoId) {
    const { data: f } = await admin.from("formatos_coa").select("nombre, zonas").eq("id", formatoId).single()
    const z = leerZonasJson(f?.zonas)
    if (z?.length) return { ...base, zonas: z, origen: "formato", lote: f!.nombre }
  }
  if (formatos.length) return { ...base, zonas: [], origen: "elegir" }
  const { data: otros } = await admin.from("lotes").select("codigo, coa_zonas").eq("coa_estado", "listo").neq("id", loteId).not("coa_zonas", "is", null).order("creado_en", { ascending: false }).limit(5)
  for (const o of otros ?? []) {
    const z = leerZonasJson(o.coa_zonas)
    if (z?.length) return { ...base, zonas: z, origen: "anterior", lote: o.codigo }
  }
  return { ...base, zonas: [], origen: null }
}

/** Asigna un formato de laboratorio al lote y regresa sus zonas. null = sin formato. */
export async function elegirFormato(loteId: string, formatoId: string | null): Promise<{ zonas?: Zona[]; error?: string }> {
  if (!(await soloAdmin()) || !uuid.test(loteId) || (formatoId !== null && !uuid.test(formatoId))) return { error: "Datos no válidos." }
  const admin = crearClienteAdmin()
  const { error } = await admin.from("lotes").update({ formato_coa_id: formatoId }).eq("id", loteId)
  if (error) return { error: "No se pudo guardar el laboratorio." }
  if (!formatoId) return { zonas: [] }
  const { data: f } = await admin.from("formatos_coa").select("zonas").eq("id", formatoId).single()
  return { zonas: leerZonasJson(f?.zonas) ?? [] }
}

/** Crea un formato de laboratorio con las zonas actuales y lo asigna al lote. */
export async function crearFormato(loteId: string, nombre: string, zonas: Zona[]): Promise<{ formato?: FormatoCoa; error?: string }> {
  const s = await soloAdmin()
  const limpio = nombre.trim().replace(/\s+/g, " ")
  if (!s || !uuid.test(loteId) || !zonasValidas(zonas)) return { error: "Datos no válidos." }
  if (limpio.length < 2 || limpio.length > 60) return { error: "Escribe el nombre del laboratorio (2 a 60 letras)." }
  const admin = crearClienteAdmin()
  const { data, error } = await admin.from("formatos_coa").insert({ nombre: limpio, zonas }).select("id, nombre").single()
  if (error || !data) return { error: error?.code === "23505" ? "Ya existe un formato con ese nombre." : "No se pudo crear el formato." }
  await admin.from("lotes").update({ formato_coa_id: data.id }).eq("id", loteId)
  await admin.from("bitacora").insert({ persona_id: s.personaId, perfil: s.perfil, area: "inventario", accion: `creó el formato de COA «${data.nombre}»`, entidad: "lote", entidad_id: loteId })
  return { formato: { id: data.id, nombre: data.nombre, zonas: zonas.length } }
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
  await admin.from("lotes").update({ coa_publico_path: ruta, coa_estado: "listo", coa_zonas: zonas }).eq("id", loteId)
  const { data: l } = await admin.from("lotes").select("codigo, formato_coa_id, formatos_coa(nombre)").eq("id", loteId).single()
  // El formato del laboratorio aprende de cada COA aprobado: el siguiente ya llega con estas zonas.
  if (l?.formato_coa_id) await admin.from("formatos_coa").update({ zonas, actualizado_en: new Date().toISOString() }).eq("id", l.formato_coa_id)
  const formato = (l?.formatos_coa as unknown as { nombre: string } | null)?.nombre
  await admin.from("bitacora").insert({ persona_id: s.personaId, perfil: s.perfil, area: "inventario", accion: `aprobó el COA público de ${l?.codigo ?? "un lote"} (${zonas.length} zonas tapadas${formato ? `, formato «${formato}»` : ""})`, entidad: "lote", entidad_id: loteId })
  revalidatePath(`/inventario/coa/${loteId}`)
  revalidatePath("/inventario")
  return {}
}
