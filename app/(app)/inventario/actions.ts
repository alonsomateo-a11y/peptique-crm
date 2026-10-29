"use server"

import { revalidatePath } from "next/cache"

import { registrar } from "@/lib/bitacora"
import { obtenerSesion } from "@/lib/sesion"
import { crearClienteAdmin } from "@/lib/supabase/admin"
import { crearClienteServidor } from "@/lib/supabase/server"

import { apartadoSugerido } from "./datos"
import type { Resultado } from "./tipos"

const texto = (f: FormData, k: string) => String(f.get(k) ?? "").trim()
const numero = (f: FormData, k: string) => {
  const v = texto(f, k).replace(/[$,\s]/g, "")
  return v === "" ? null : Number(v)
}
const TIPOS_COA = ["application/pdf", "image/png", "image/jpeg"]

/** Siguiente código del año: LOT-MX-2026-001, 002… */
async function siguienteCodigo(supabase: Awaited<ReturnType<typeof crearClienteServidor>>, anio: string) {
  const prefijo = `LOT-MX-${anio}-`
  const { data } = await supabase.from("lotes").select("codigo").like("codigo", `${prefijo}%`).order("codigo", { ascending: false }).limit(1)
  const ultimo = Number(data?.[0]?.codigo.slice(prefijo.length) ?? 0)
  return `${prefijo}${String(ultimo + 1).padStart(3, "0")}`
}

/** Da entrada a un lote: crea el lote, reparte piezas entre venta general y recurrentes y guarda el COA original. */
export async function recibirLote(_prev: Resultado, form: FormData): Promise<Resultado> {
  const sesion = await obtenerSesion()
  if (sesion.perfil !== "administrador") return { error: "Solo el administrador recibe lotes." }

  const productoId = texto(form, "producto_id")
  const moneda = texto(form, "moneda") === "mxn" ? "mxn" : "usd"
  const cantidad = numero(form, "cantidad")
  const usd = numero(form, "costo_usd")
  const tc = numero(form, "tipo_cambio")
  const mxnDirecto = numero(form, "costo_mxn")
  const llegada = texto(form, "llegada")
  const coa = form.get("coa")

  const errores: Record<string, string> = {}
  if (!/^[0-9a-f-]{36}$/.test(productoId)) errores.producto_id = "Elige el producto."
  if (cantidad === null || !Number.isInteger(cantidad) || cantidad < 1) errores.cantidad = "Piezas enteras, mayor a 0."
  if (!/^\d{4}-\d{2}-\d{2}$/.test(llegada)) errores.llegada = "Indica la fecha de llegada."
  if (moneda === "usd") {
    if (usd === null || !(usd > 0)) errores.costo_usd = "Costo en dólares."
    if (tc === null || !(tc > 0) || tc > 100) errores.tipo_cambio = "Tipo de cambio no válido."
  } else if (mxnDirecto === null || !(mxnDirecto > 0)) errores.costo_mxn = "Costo en pesos."
  if (coa instanceof File && coa.size > 0) {
    if (!TIPOS_COA.includes(coa.type)) errores.coa = "Sube PDF, PNG o JPG."
    else if (coa.size > 10 * 1024 * 1024) errores.coa = "Máximo 10 MB."
  }
  if (Object.keys(errores).length) return { errores, error: "Revisa los campos marcados." }

  const costoMxn = moneda === "usd" ? Math.round(usd! * tc! * 100) / 100 : mxnDirecto!
  const supabase = await crearClienteServidor()
  const { data: producto } = await supabase.from("productos").select("nombre, presentacion").eq("id", productoId).single()
  if (!producto) return { errores: { producto_id: "Producto no encontrado." } }

  const sugerido = (await apartadoSugerido(supabase, productoId)).get(productoId) ?? 0
  const { data: susLotes } = await supabase.from("lotes").select("id").eq("producto_id", productoId)
  const { data: actuales } = susLotes?.length
    ? await supabase.from("existencias").select("piezas").eq("bolsa", "recurrentes").in("lote_id", susLotes.map((l) => l.id))
    : { data: [] }
  const yaApartadas = (actuales ?? []).reduce((s, x) => s + x.piezas, 0)
  const recurrentes = Math.min(Math.max(sugerido - yaApartadas, 0), cantidad!)

  // Reintenta si otro lote tomó el mismo código al mismo tiempo.
  let lote: { id: string; codigo: string } | null = null
  for (let intento = 0; intento < 3 && !lote; intento++) {
    const codigo = await siguienteCodigo(supabase, llegada.slice(0, 4))
    const { data, error } = await supabase
      .from("lotes")
      .insert({
        codigo,
        producto_id: productoId,
        lote_origen: texto(form, "lote_origen") || null,
        llegada,
        piezas_recibidas: cantidad,
        costo_pieza_usd: moneda === "usd" ? usd : null,
        tipo_cambio: moneda === "usd" ? tc : null,
        costo_pieza_mxn: costoMxn,
      })
      .select("id, codigo")
      .single()
    if (data) lote = data
    else if (error?.code !== "23505") return { error: "No se pudo guardar el lote." }
  }
  if (!lote) return { error: "No se pudo asignar el código del lote. Intenta de nuevo." }

  const movimientos = [
    { lote_id: lote.id, tipo: "entrada", bolsa: "general", cantidad: cantidad! - recurrentes, persona_id: sesion.personaId === "demo" ? null : sesion.personaId, nota: "recepción" },
    ...(recurrentes > 0 ? [{ lote_id: lote.id, tipo: "entrada", bolsa: "recurrentes", cantidad: recurrentes, persona_id: sesion.personaId === "demo" ? null : sesion.personaId, nota: "apartado para recurrentes" }] : []),
  ]
  const { error: errMov } = await supabase.from("movimientos_inventario").insert(movimientos)
  if (errMov) {
    await supabase.from("lotes").delete().eq("id", lote.id)
    return { error: "No se pudieron registrar las piezas. El lote no se guardó." }
  }

  if (coa instanceof File && coa.size > 0) {
    const ext = coa.type === "application/pdf" ? "pdf" : coa.type === "image/png" ? "png" : "jpg"
    const ruta = `${lote.id}/original.${ext}`
    const { error: errCoa } = await crearClienteAdmin().storage.from("coas").upload(ruta, coa, { contentType: coa.type, upsert: true })
    if (!errCoa) await supabase.from("lotes").update({ coa_original_path: ruta, coa_estado: "por_aprobar" }).eq("id", lote.id)
  }

  await registrar(supabase, sesion, {
    area: "inventario",
    accion: `recibió ${lote.codigo}: ${cantidad} × ${producto.nombre} ${producto.presentacion}${recurrentes ? ` (${recurrentes} apartadas para recurrentes)` : ""}`,
    entidad: "lote",
    entidad_id: lote.id,
    producto_id: productoId,
  })
  revalidatePath("/inventario")
  revalidatePath("/productos")
  return { ok: true, codigo: lote.codigo }
}
