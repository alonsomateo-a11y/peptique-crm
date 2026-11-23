"use server"

import { revalidatePath } from "next/cache"

import { recibirLote as recibirLoteBase, validarLote, type DatosLote } from "@/lib/inventario"
import { obtenerSesion } from "@/lib/sesion"
import { crearClienteAdmin } from "@/lib/supabase/admin"
import { crearClienteServidor } from "@/lib/supabase/server"

import type { Resultado } from "./tipos"

const texto = (f: FormData, k: string) => String(f.get(k) ?? "").trim()
const numero = (f: FormData, k: string) => {
  const v = texto(f, k).replace(/[$,\s]/g, "")
  return v === "" ? null : Number(v)
}
const TIPOS_COA = ["application/pdf", "image/png", "image/jpeg"]

/** Da entrada a un lote: crea el lote, reparte piezas entre venta general y recurrentes y guarda el COA original. */
export async function recibirLote(_prev: Resultado, form: FormData): Promise<Resultado> {
  const sesion = await obtenerSesion()
  if (sesion.perfil !== "administrador") return { error: "Solo el administrador recibe lotes." }

  const datos: DatosLote = {
    productoId: texto(form, "producto_id"),
    moneda: texto(form, "moneda") === "mxn" ? "mxn" : "usd",
    cantidad: numero(form, "cantidad"),
    costoUsd: numero(form, "costo_usd"),
    tipoCambio: numero(form, "tipo_cambio"),
    costoMxn: numero(form, "costo_mxn"),
    llegada: texto(form, "llegada"),
    loteOrigen: texto(form, "lote_origen") || null,
  }
  const coa = form.get("coa")
  const errores = validarLote(datos)
  if (coa instanceof File && coa.size > 0) {
    if (!TIPOS_COA.includes(coa.type)) errores.coa = "Sube PDF, PNG o JPG."
    else if (coa.size > 10 * 1024 * 1024) errores.coa = "Máximo 10 MB."
  }
  if (Object.keys(errores).length) return { errores, error: "Revisa los campos marcados." }

  const supabase = await crearClienteServidor()
  const r = await recibirLoteBase(supabase, sesion, datos)
  if (!r.ok) return "errores" in r ? { errores: r.errores, error: r.error } : { error: r.error }
  const { lote } = r

  if (coa instanceof File && coa.size > 0) {
    const ext = coa.type === "application/pdf" ? "pdf" : coa.type === "image/png" ? "png" : "jpg"
    const ruta = `${lote.id}/original.${ext}`
    const { error: errCoa } = await crearClienteAdmin().storage.from("coas").upload(ruta, coa, { contentType: coa.type, upsert: true })
    if (!errCoa) await supabase.from("lotes").update({ coa_original_path: ruta, coa_estado: "por_aprobar" }).eq("id", lote.id)
  }

  revalidatePath("/inventario")
  revalidatePath("/productos")
  return { ok: true, codigo: lote.codigo }
}
