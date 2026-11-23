import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { registrar } from "@/lib/bitacora"
import type { Sesion } from "@/lib/sesion"

/**
 * Entrada de lotes. La usan la pantalla de Inventario (con su sesión de cookies) y el conector
 * de Claude (con el token del mismo usuario): en los dos casos escribe con RLS, solo administrador.
 */

export type DatosLote = {
  productoId: string
  cantidad: number | null
  moneda: "usd" | "mxn"
  costoUsd: number | null
  tipoCambio: number | null
  costoMxn: number | null
  llegada: string
  loteOrigen: string | null
}

/**
 * Piezas que conviene apartar para recurrentes de un producto: por cada aviso de recompra
 * pendiente, las piezas de la siguiente etapa de su protocolo (se asume que todos recompran).
 */
export async function apartadoSugerido(supabase: SupabaseClient, productoId?: string) {
  let avisos = supabase.from("avisos_recompra").select("producto_id, siguiente_etapa").in("estado", ["por_avisar", "contactado"])
  if (productoId) avisos = avisos.eq("producto_id", productoId)
  const [{ data: a }, { data: p }] = await Promise.all([avisos, supabase.from("protocolos").select("producto_id, etapa, piezas")])
  const piezas = new Map((p ?? []).map((x) => [`${x.producto_id}|${x.etapa}`, x.piezas]))
  const total = new Map<string, number>()
  for (const x of a ?? []) total.set(x.producto_id, (total.get(x.producto_id) ?? 0) + (piezas.get(`${x.producto_id}|${x.siguiente_etapa ?? 1}`) ?? 1))
  return total
}

/** Siguiente código del año: LOT-MX-2026-001, 002… */
async function siguienteCodigo(supabase: SupabaseClient, anio: string) {
  const prefijo = `LOT-MX-${anio}-`
  const { data } = await supabase.from("lotes").select("codigo").like("codigo", `${prefijo}%`).order("codigo", { ascending: false }).limit(1)
  const ultimo = Number(data?.[0]?.codigo.slice(prefijo.length) ?? 0)
  return `${prefijo}${String(ultimo + 1).padStart(3, "0")}`
}

export function validarLote(d: DatosLote): Record<string, string> {
  const errores: Record<string, string> = {}
  if (!/^[0-9a-f-]{36}$/.test(d.productoId)) errores.producto_id = "Elige el producto."
  if (d.cantidad === null || !Number.isInteger(d.cantidad) || d.cantidad < 1) errores.cantidad = "Piezas enteras, mayor a 0."
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.llegada)) errores.llegada = "Indica la fecha de llegada."
  if (d.moneda === "usd") {
    if (d.costoUsd === null || !(d.costoUsd > 0)) errores.costo_usd = "Costo en dólares."
    if (d.tipoCambio === null || !(d.tipoCambio > 0) || d.tipoCambio > 100) errores.tipo_cambio = "Tipo de cambio no válido."
  } else if (d.costoMxn === null || !(d.costoMxn > 0)) errores.costo_mxn = "Costo en pesos."
  return errores
}

/** Valida y calcula el costo en pesos y el reparto entre venta general y recurrentes, sin guardar. */
export async function prepararLote(supabase: SupabaseClient, d: DatosLote) {
  const errores = validarLote(d)
  if (Object.keys(errores).length) return { ok: false as const, errores, error: "Revisa los campos marcados." }

  const costoMxn = d.moneda === "usd" ? Math.round(d.costoUsd! * d.tipoCambio! * 100) / 100 : d.costoMxn!
  const { data: producto } = await supabase.from("productos").select("nombre, presentacion").eq("id", d.productoId).maybeSingle()
  if (!producto) return { ok: false as const, errores: { producto_id: "Producto no encontrado." }, error: "Producto no encontrado." }

  const sugerido = (await apartadoSugerido(supabase, d.productoId)).get(d.productoId) ?? 0
  const { data: susLotes } = await supabase.from("lotes").select("id").eq("producto_id", d.productoId)
  const { data: actuales } = susLotes?.length
    ? await supabase.from("existencias").select("piezas").eq("bolsa", "recurrentes").in("lote_id", susLotes.map((l) => l.id))
    : { data: [] }
  const yaApartadas = (actuales ?? []).reduce((s, x) => s + x.piezas, 0)
  const recurrentes = Math.min(Math.max(sugerido - yaApartadas, 0), d.cantidad!)
  return { ok: true as const, producto, costoMxn, recurrentes, general: d.cantidad! - recurrentes }
}

/** Da entrada a un lote: crea el lote y reparte piezas entre venta general y recurrentes. */
export async function recibirLote(supabase: SupabaseClient, sesion: Sesion, d: DatosLote, via?: string) {
  if (sesion.perfil !== "administrador") return { ok: false as const, error: "Solo el administrador recibe lotes." }
  const prep = await prepararLote(supabase, d)
  if (!prep.ok) return prep
  const { producto, costoMxn, recurrentes } = prep
  const cantidad = d.cantidad!

  // Reintenta si otro lote tomó el mismo código al mismo tiempo.
  let lote: { id: string; codigo: string } | null = null
  for (let intento = 0; intento < 3 && !lote; intento++) {
    const codigo = await siguienteCodigo(supabase, d.llegada.slice(0, 4))
    const { data, error } = await supabase
      .from("lotes")
      .insert({
        codigo,
        producto_id: d.productoId,
        lote_origen: d.loteOrigen || null,
        llegada: d.llegada,
        piezas_recibidas: cantidad,
        costo_pieza_usd: d.moneda === "usd" ? d.costoUsd : null,
        tipo_cambio: d.moneda === "usd" ? d.tipoCambio : null,
        costo_pieza_mxn: costoMxn,
      })
      .select("id, codigo")
      .single()
    if (data) lote = data
    else if (error?.code !== "23505") return { ok: false as const, error: "No se pudo guardar el lote." }
  }
  if (!lote) return { ok: false as const, error: "No se pudo asignar el código del lote. Intenta de nuevo." }

  const persona = sesion.personaId === "demo" ? null : sesion.personaId
  const movimientos = [
    { lote_id: lote.id, tipo: "entrada", bolsa: "general", cantidad: cantidad - recurrentes, persona_id: persona, nota: "recepción" },
    ...(recurrentes > 0 ? [{ lote_id: lote.id, tipo: "entrada", bolsa: "recurrentes", cantidad: recurrentes, persona_id: persona, nota: "apartado para recurrentes" }] : []),
  ]
  const { error: errMov } = await supabase.from("movimientos_inventario").insert(movimientos)
  if (errMov) {
    await supabase.from("lotes").delete().eq("id", lote.id)
    return { ok: false as const, error: "No se pudieron registrar las piezas. El lote no se guardó." }
  }

  await registrar(supabase, sesion, {
    area: "inventario",
    accion: `recibió ${lote.codigo}: ${cantidad} × ${producto.nombre} ${producto.presentacion}${recurrentes ? ` (${recurrentes} apartadas para recurrentes)` : ""}${via ?? ""}`,
    entidad: "lote",
    entidad_id: lote.id,
    producto_id: d.productoId,
  })
  return { ok: true as const, lote, recurrentes }
}
