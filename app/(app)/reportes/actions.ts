"use server"

import { revalidatePath } from "next/cache"

import { registrar } from "@/lib/bitacora"
import { obtenerSesion } from "@/lib/sesion"
import { crearClienteServidor } from "@/lib/supabase/server"

const mesValido = (m: string) => /^\d{4}-\d{2}$/.test(m)

async function soloAdmin() {
  const s = await obtenerSesion()
  return s.perfil === "administrador" ? s : null
}

/** Guarda metas por mes (y su crecimiento) y metas en piezas por producto para un mes. */
export async function guardarPlan(d: {
  meses: { mes: string; meta: number; crecimiento: number }[]
  mesProductos: string
  productos: { productoId: string; metaPiezas: number | null }[]
}): Promise<{ error?: string }> {
  const s = await soloAdmin()
  if (!s) return { error: "Solo el administrador." }
  if (d.meses.some((m) => !mesValido(m.mes) || !(m.meta >= 0) || !Number.isFinite(m.crecimiento))) return { error: "Revisa las metas por mes." }
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from("plan_mensual").upsert(d.meses.map((m) => ({ mes: `${m.mes}-01`, meta: Math.round(m.meta), crecimiento: m.crecimiento })))
  if (error) return { error: "No se pudo guardar el plan." }
  if (mesValido(d.mesProductos)) {
    const conMeta = d.productos.filter((p) => p.metaPiezas && p.metaPiezas > 0)
    await supabase.from("plan_producto").delete().eq("mes", `${d.mesProductos}-01`)
    if (conMeta.length) await supabase.from("plan_producto").insert(conMeta.map((p) => ({ producto_id: p.productoId, mes: `${d.mesProductos}-01`, meta_piezas: p.metaPiezas })))
  }
  await registrar(supabase, s, { area: "configuracion", accion: `actualizó el plan de ventas (${d.meses.map((m) => m.mes).join(", ")})` })
  revalidatePath("/reportes")
  revalidatePath("/inicio")
  return {}
}

export async function agregarGasto(mes: string, concepto: string, monto: number): Promise<{ error?: string }> {
  const s = await soloAdmin()
  if (!s) return { error: "Solo el administrador." }
  if (!mesValido(mes) || concepto.trim().length < 2 || !(monto > 0)) return { error: "Escribe el concepto y un monto mayor a 0." }
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from("gastos_fijos").insert({ mes: `${mes}-01`, concepto: concepto.trim(), monto })
  if (error) return { error: "No se pudo guardar el gasto." }
  await registrar(supabase, s, { area: "configuracion", accion: `agregó el gasto fijo “${concepto.trim()}” a ${mes}` })
  revalidatePath("/reportes")
  return {}
}

export async function quitarGasto(id: string): Promise<{ error?: string }> {
  const s = await soloAdmin()
  if (!s || !/^[0-9a-f-]{36}$/.test(id)) return { error: "Solo el administrador." }
  const supabase = await crearClienteServidor()
  await supabase.from("gastos_fijos").delete().eq("id", id)
  revalidatePath("/reportes")
  return {}
}

/** Copia los gastos fijos del mes anterior al mes indicado. */
export async function copiarGastos(mes: string, desde: string): Promise<{ error?: string; copiados?: number }> {
  const s = await soloAdmin()
  if (!s || !mesValido(mes) || !mesValido(desde)) return { error: "Solo el administrador." }
  const supabase = await crearClienteServidor()
  const { data } = await supabase.from("gastos_fijos").select("concepto, monto").eq("mes", `${desde}-01`)
  if (!data?.length) return { error: "El mes anterior no tiene gastos capturados." }
  await supabase.from("gastos_fijos").insert(data.map((g) => ({ ...g, mes: `${mes}-01` })))
  revalidatePath("/reportes")
  return { copiados: data.length }
}
