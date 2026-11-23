import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { registrar } from "@/lib/bitacora"
import { formatoMoneda } from "@/lib/format"
import type { Sesion } from "@/lib/sesion"

export type Precios = { precio_publico: number | null; precio_medico: number | null; precio_distribuidor: number | null }
export const CAMPOS_PRECIO = ["precio_publico", "precio_medico", "precio_distribuidor"] as const
const NOMBRE_PRECIO = { precio_publico: "público", precio_medico: "médico", precio_distribuidor: "distribuidor" }

/** Reglas de precios del catálogo (pantalla de Productos y conector de Claude). */
export function validarPrecios(p: Precios, visible: boolean): Record<string, string> {
  const errores: Record<string, string> = {}
  for (const k of CAMPOS_PRECIO) {
    const v = p[k]
    if (v !== null && (!Number.isFinite(v) || v < 0)) errores[k] = "Precio no válido."
  }
  if (visible && !p.precio_publico) errores.visible = "Sin precio público el producto queda oculto."
  return errores
}

/** Calcula el cambio de precios de un producto sin guardarlo. Solo cambia los precios que se mandan. */
export async function prepararPrecios(supabase: SupabaseClient, productoId: string, cambios: Partial<Precios>) {
  const { data: p } = await supabase.from("productos").select("id, nombre, presentacion, visible, precio_publico, precio_medico, precio_distribuidor").eq("id", productoId).maybeSingle()
  if (!p) return { ok: false as const, error: "Producto no encontrado." }
  const antes: Precios = { precio_publico: p.precio_publico === null ? null : Number(p.precio_publico), precio_medico: p.precio_medico === null ? null : Number(p.precio_medico), precio_distribuidor: p.precio_distribuidor === null ? null : Number(p.precio_distribuidor) }
  const despues: Precios = { ...antes }
  for (const k of CAMPOS_PRECIO) if (cambios[k] !== undefined) despues[k] = cambios[k]!
  if (CAMPOS_PRECIO.every((k) => despues[k] === antes[k])) return { ok: false as const, error: "No hay ningún precio distinto al actual." }
  const errores = validarPrecios(despues, p.visible)
  if (Object.keys(errores).length) return { ok: false as const, error: Object.values(errores).join(" ") }
  const lista = CAMPOS_PRECIO.filter((k) => despues[k] !== antes[k]).map((k) => ({ precio: NOMBRE_PRECIO[k], antes: antes[k], despues: despues[k] }))
  return { ok: true as const, producto: `${p.nombre} ${p.presentacion}`, antes, despues, lista }
}

/** Actualiza precios con RLS (solo administrador) y deja constancia en Actividad. */
export async function actualizarPrecios(supabase: SupabaseClient, sesion: Sesion, productoId: string, cambios: Partial<Precios>, via = "") {
  if (sesion.perfil !== "administrador") return { ok: false as const, error: "Solo el administrador puede cambiar precios." }
  const prep = await prepararPrecios(supabase, productoId, cambios)
  if (!prep.ok) return prep
  const { error } = await supabase.from("productos").update(prep.despues).eq("id", productoId)
  if (error) return { ok: false as const, error: "No se pudo guardar el precio." }
  const texto = prep.lista.map((x) => `${x.precio} ${x.antes === null ? "sin precio" : formatoMoneda(x.antes)} → ${x.despues === null ? "sin precio" : formatoMoneda(x.despues)}`).join(", ")
  await registrar(supabase, sesion, { area: "productos", accion: `cambió el precio de ${prep.producto}: ${texto}${via}`, entidad: "producto", entidad_id: productoId, producto_id: productoId })
  return { ...prep, ok: true as const }
}
