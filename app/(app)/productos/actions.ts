"use server"

import { revalidatePath } from "next/cache"

import { registrar } from "@/lib/bitacora"
import { FAMILIA_POR_ASIGNAR, familiaDe, skuDe } from "@/lib/catalogo"
import { obtenerSesion } from "@/lib/sesion"
import { crearClienteAdmin } from "@/lib/supabase/admin"
import { crearClienteServidor } from "@/lib/supabase/server"

import type { CambioImportacion } from "./datos-cliente"
import { claveProducto, leerCatalogo } from "./importar"

export type ResultadoProducto = { ok?: boolean; error?: string; errores?: Record<string, string> } | null

const texto = (f: FormData, k: string) => String(f.get(k) ?? "").trim()
const dinero = (f: FormData, k: string) => {
  const v = texto(f, k).replace(/[$,\s]/g, "")
  return v === "" ? null : Number(v)
}
const entero = (f: FormData, k: string) => {
  const v = texto(f, k)
  return v === "" ? null : Number(v)
}

/** Crea o edita un producto con sus protocolos por etapa (PDF en Storage privado). */
export async function guardarProducto(_prev: ResultadoProducto, form: FormData): Promise<ResultadoProducto> {
  const sesion = await obtenerSesion()
  if (sesion.perfil !== "administrador") return { error: "Solo el administrador puede editar productos." }

  const id = texto(form, "id") || null
  const datos = {
    nombre: texto(form, "nombre"),
    presentacion: texto(form, "presentacion"),
    familia: texto(form, "familia"),
    sku: (texto(form, "sku") || skuDe(texto(form, "nombre"), texto(form, "presentacion"))).toUpperCase(),
    precio_publico: dinero(form, "precio_publico"),
    precio_medico: dinero(form, "precio_medico"),
    precio_distribuidor: dinero(form, "precio_distribuidor"),
    inyecciones_por_vial: entero(form, "inyecciones_por_vial") ?? 20,
    pagos_por_dosis: entero(form, "pagos_por_dosis") ?? 4,
    visible: texto(form, "visible") === "visible",
  }

  const errores: Record<string, string> = {}
  if (!datos.nombre) errores.nombre = "Escribe el nombre."
  if (!datos.presentacion) errores.presentacion = "Escribe la presentación (ej. 100 mg)."
  if (!datos.familia) errores.familia = "Elige o escribe una familia."
  for (const k of ["precio_publico", "precio_medico", "precio_distribuidor"] as const) {
    const v = datos[k]
    if (v !== null && (!Number.isFinite(v) || v < 0)) errores[k] = "Precio no válido."
  }
  if (!Number.isInteger(datos.inyecciones_por_vial) || datos.inyecciones_por_vial < 1) errores.inyecciones_por_vial = "Número entero mayor a 0."
  if (!Number.isInteger(datos.pagos_por_dosis) || datos.pagos_por_dosis < 1) errores.pagos_por_dosis = "Número entero mayor a 0."
  if (datos.visible && !datos.precio_publico) errores.visible = "Sin precio público el producto queda oculto."

  const etapas = [1, 2, 3].map((etapa) => ({
    etapa,
    piezas: entero(form, `piezas_${etapa}`),
    duracion_dias: entero(form, `duracion_${etapa}`),
    pdf: form.get(`pdf_${etapa}`),
  }))
  for (const e of etapas) {
    if (e.piezas !== null && (!Number.isInteger(e.piezas) || e.piezas < 1)) errores[`piezas_${e.etapa}`] = "Piezas enteras."
    if (e.duracion_dias !== null && (!Number.isInteger(e.duracion_dias) || e.duracion_dias < 1)) errores[`duracion_${e.etapa}`] = "Días enteros."
    if (e.pdf instanceof File && e.pdf.size > 0) {
      if (e.pdf.type !== "application/pdf") errores[`pdf_${e.etapa}`] = "Sube un PDF."
      else if (e.pdf.size > 10 * 1024 * 1024) errores[`pdf_${e.etapa}`] = "Máximo 10 MB."
      if (e.piezas === null) errores[`piezas_${e.etapa}`] = "Indica las piezas de esta etapa."
    }
  }
  if (Object.keys(errores).length) return { errores, error: "Revisa los campos marcados." }

  const supabase = await crearClienteServidor()
  const { data: guardado, error } = id
    ? await supabase.from("productos").update(datos).eq("id", id).select("id").single()
    : await supabase.from("productos").insert(datos).select("id").single()
  if (error || !guardado) {
    if (error?.code === "23505") return { errores: { sku: "Ese SKU ya existe." }, error: "Revisa los campos marcados." }
    return { error: "No se pudo guardar el producto." }
  }
  const productoId = guardado.id

  // Protocolos: los PDF van a Storage privado; solo el servidor los lee.
  const storage = crearClienteAdmin().storage.from("protocolos")
  for (const e of etapas) {
    if (e.piezas === null) {
      if (texto(form, `quitar_${e.etapa}`) === "1") {
        await supabase.from("protocolos").delete().eq("producto_id", productoId).eq("etapa", e.etapa)
        await storage.remove([`${productoId}/etapa-${e.etapa}.pdf`])
      }
      continue
    }
    const fila: Record<string, unknown> = { producto_id: productoId, etapa: e.etapa, piezas: e.piezas, duracion_dias: e.duracion_dias }
    if (e.pdf instanceof File && e.pdf.size > 0) {
      const ruta = `${productoId}/etapa-${e.etapa}.pdf`
      const { error: errPdf } = await storage.upload(ruta, e.pdf, { contentType: "application/pdf", upsert: true })
      if (errPdf) return { error: `No se pudo subir el PDF de la etapa ${e.etapa}.` }
      fila.pdf_path = ruta
    }
    const { error: errProt } = await supabase.from("protocolos").upsert(fila, { onConflict: "producto_id,etapa" })
    if (errProt) return { error: `No se pudo guardar el protocolo de la etapa ${e.etapa}.` }
  }

  await registrar(supabase, sesion, {
    area: "productos",
    accion: `${id ? "editó" : "agregó"} ${datos.nombre} ${datos.presentacion}${datos.visible ? "" : " (oculto)"}`,
    entidad: "producto",
    entidad_id: productoId,
    producto_id: productoId,
  })
  revalidatePath("/productos")
  return { ok: true }
}

/** Liga temporal (1 minuto) para ver el PDF de un protocolo. */
export async function enlaceProtocolo(ruta: string): Promise<string | null> {
  const sesion = await obtenerSesion()
  if (sesion.perfil !== "administrador" || !/^[0-9a-f-]{36}\/etapa-[1-3]\.pdf$/.test(ruta)) return null
  const { data } = await crearClienteAdmin().storage.from("protocolos").createSignedUrl(ruta, 60)
  return data?.signedUrl ?? null
}

export type ResultadoImportacion = { cambios?: CambioImportacion[]; importados?: { nuevos: number; precios: number }; error?: string }

/** Compara el Excel contra el catálogo actual sin guardar nada. */
async function compararCatalogo(form: FormData): Promise<ResultadoImportacion> {
  const archivo = form.get("archivo")
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "Elige el archivo de Excel." }
  if (!/\.xlsx$/i.test(archivo.name)) return { error: "Sube un archivo .xlsx." }
  if (archivo.size > 5 * 1024 * 1024) return { error: "El archivo pesa más de 5 MB." }

  let filas
  try {
    filas = await leerCatalogo(await archivo.arrayBuffer())
  } catch (e) {
    return { error: e instanceof Error && e.message.startsWith("No encontré") ? e.message : "No se pudo leer el Excel." }
  }
  if (!filas.length) return { error: "El Excel no trae productos." }

  const supabase = await crearClienteServidor()
  const { data: actuales } = await supabase.from("productos").select("id, nombre, presentacion, sku, familia, precio_publico, precio_medico, precio_distribuidor")
  const porClave = new Map((actuales ?? []).map((p) => [claveProducto(p.nombre, p.presentacion), p]))
  const igual = (a: number | string | null, b: number | null) => (a === null ? null : Number(a)) === b

  return {
    cambios: filas.map((f) => {
      const p = porClave.get(claveProducto(f.nombre, f.presentacion))
      if (!p) return { ...f, tipo: "nuevo" as const }
      const mismo = igual(p.precio_publico, f.precio_publico) && igual(p.precio_medico, f.precio_medico) && igual(p.precio_distribuidor, f.precio_distribuidor)
      return { ...f, sku: p.sku ?? f.sku, tipo: mismo ? ("igual" as const) : ("precio" as const), id: p.id }
    }),
  }
}

export async function previsualizarCatalogo(form: FormData): Promise<ResultadoImportacion> {
  const sesion = await obtenerSesion()
  if (sesion.perfil !== "administrador") return { error: "Solo el administrador puede importar el catálogo." }
  return compararCatalogo(form)
}

/** Agrega los productos nuevos y actualiza precios. No toca familia, protocolos ni estado de los existentes (salvo ocultar si quedan sin precio). */
export async function importarCatalogo(form: FormData): Promise<ResultadoImportacion> {
  const sesion = await obtenerSesion()
  if (sesion.perfil !== "administrador") return { error: "Solo el administrador puede importar el catálogo." }
  const { cambios, error } = await compararCatalogo(form)
  if (error || !cambios) return { error }

  const supabase = await crearClienteServidor()
  const nuevos = cambios.filter((c) => c.tipo === "nuevo")
  if (nuevos.length) {
    const { error: e } = await supabase.from("productos").insert(
      nuevos.map(({ nombre, presentacion, precio_publico, precio_medico, precio_distribuidor }) => ({
        nombre,
        presentacion,
        familia: familiaDe(nombre),
        sku: skuDe(nombre, presentacion),
        precio_publico,
        precio_medico,
        precio_distribuidor,
        visible: precio_publico !== null,
      })),
    )
    if (e) return { error: "No se pudieron agregar los productos nuevos." }
  }
  const precios = cambios.filter((c) => c.tipo === "precio")
  for (const c of precios) {
    const cambio: Record<string, unknown> = { precio_publico: c.precio_publico, precio_medico: c.precio_medico, precio_distribuidor: c.precio_distribuidor }
    if (c.precio_publico === null) cambio.visible = false
    const { error: e } = await supabase.from("productos").update(cambio).eq("id", c.id!)
    if (e) return { error: `No se pudo actualizar ${c.nombre} ${c.presentacion}.` }
  }

  await registrar(supabase, sesion, {
    area: "productos",
    accion: `importó el catálogo: ${nuevos.length} nuevos, ${precios.length} con precio actualizado`,
  })
  revalidatePath("/productos")
  return { importados: { nuevos: nuevos.length, precios: precios.length } }
}
