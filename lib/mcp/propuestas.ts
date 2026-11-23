import "server-only"

import { revalidatePath } from "next/cache"

import { ligaDocumentos } from "@/lib/documentos"
import { formatoMoneda } from "@/lib/format"
import { recibirLote, type DatosLote } from "@/lib/inventario"
import { actualizarPrecios, type Precios } from "@/lib/productos"
import { registrarPago, registrarVenta, type DatosPago, type DatosVenta } from "@/lib/ventas"

import { PERFILES_CONECTOR, type SesionMcp } from "./sesion"

/**
 * "La IA propone y el usuario confirma": cada escritura se guarda primero como propuesta
 * (tabla propuestas_ia, con RLS de la persona) y solo se ejecuta con confirmar_propuesta.
 * Al confirmar se vuelve a validar todo con la lógica del CRM: si algo cambió, no se guarda.
 */

export const VIA = " · vía Claude"

export type DatosPropuesta =
  | { accion: "venta"; datos: Omit<DatosVenta, "vendedor"> }
  | { accion: "pago"; datos: DatosPago & { folio: string } }
  | { accion: "lote"; datos: DatosLote }
  | { accion: "precio"; datos: { productoId: string; cambios: Partial<Precios> } }

/** Qué perfil puede ejecutar cada propuesta (lo mismo que en las pantallas del CRM). */
const PERFILES_ACCION: Record<DatosPropuesta["accion"], string[]> = {
  venta: PERFILES_CONECTOR,
  pago: ["administrador"],
  lote: ["administrador"],
  precio: ["administrador"],
}

export async function crearPropuesta(ctx: SesionMcp, p: DatosPropuesta, resumen: string) {
  const { data, error } = await ctx.supabase
    .from("propuestas_ia")
    .insert({ persona_id: ctx.sesion.personaId, accion: p.accion, datos: p.datos, resumen, cliente_oauth: ctx.clienteOAuth })
    .select("id, vence_en")
    .single()
  if (error || !data) return { ok: false as const, error: "No se pudo guardar la propuesta. Intenta de nuevo." }
  return { ok: true as const, id: data.id as string, vence: data.vence_en as string }
}

export async function descartarPropuesta(ctx: SesionMcp, id: string) {
  const { data } = await ctx.supabase
    .from("propuestas_ia")
    .update({ descartada_en: new Date().toISOString() })
    .eq("id", id)
    .is("usada_en", null)
    .is("descartada_en", null)
    .select("id")
  return (data?.length ?? 0) > 0
}

type Resultado = { ok: true; texto: string; datos: Record<string, unknown> } | { ok: false; error: string }

export async function confirmarPropuesta(ctx: SesionMcp, id: string): Promise<Resultado> {
  // Se marca usada en un solo paso condicionado: dos confirmaciones al mismo tiempo no ejecutan dos veces.
  const { data: tomada } = await ctx.supabase
    .from("propuestas_ia")
    .update({ usada_en: new Date().toISOString() })
    .eq("id", id)
    .is("usada_en", null)
    .is("descartada_en", null)
    .gt("vence_en", new Date().toISOString())
    .select("id, accion, datos, resumen")
    .maybeSingle()

  if (!tomada) {
    const { data: p } = await ctx.supabase.from("propuestas_ia").select("usada_en, descartada_en, vence_en").eq("id", id).maybeSingle()
    if (!p) return { ok: false, error: "No encontré esa propuesta (o no es tuya)." }
    if (p.usada_en) return { ok: false, error: "Esa propuesta ya se confirmó antes. No se guardó dos veces." }
    if (p.descartada_en) return { ok: false, error: "Esa propuesta se descartó." }
    return { ok: false, error: "La propuesta venció (duran 10 minutos). Pide una nueva." }
  }

  const propuesta = { accion: tomada.accion, datos: tomada.datos } as DatosPropuesta
  if (!PERFILES_ACCION[propuesta.accion].includes(ctx.sesion.perfil)) return guardar(ctx, id, { ok: false, error: "Tu perfil no permite esta acción." })
  return guardar(ctx, id, await ejecutar(ctx, propuesta))
}

async function guardar(ctx: SesionMcp, id: string, r: Resultado) {
  await ctx.supabase.from("propuestas_ia").update({ resultado: r.ok ? { ok: true, ...r.datos } : { ok: false, error: r.error } }).eq("id", id)
  return r
}

async function ejecutar(ctx: SesionMcp, p: DatosPropuesta): Promise<Resultado> {
  const { sesion, supabase } = ctx
  switch (p.accion) {
    case "venta": {
      const r = await registrarVenta({ ...p.datos, vendedor: sesion, via: VIA })
      if (!r.ok) return { ok: false, error: `No se guardó: ${r.error}` }
      // Igual que en Vender: la liga de documentos sale en ventas en persona, no en pedidos por cobrar.
      const liga = p.datos.canal === "en_persona" ? await ligaDocumentos(r.venta.ventaId).catch(() => null) : null
      for (const ruta of ["/ventas", "/pagos", "/inventario", "/inicio", "/vender"]) revalidatePath(ruta)
      return {
        ok: true,
        texto: `Venta ${r.venta.folio} guardada para ${r.venta.cliente.nombre} por ${formatoMoneda(r.venta.total)}${r.venta.cobrado ? ` (cobrado ${formatoMoneda(r.venta.cobrado)})` : " (por cobrar)"}.${liga ? ` Liga de documentos para el cliente: ${liga}` : ""}`,
        datos: { folio: r.venta.folio, total: r.venta.total, cobrado: r.venta.cobrado, ligaDocumentos: liga },
      }
    }
    case "pago": {
      const { folio, ...datos } = p.datos
      const r = await registrarPago(sesion, { ...datos, via: VIA })
      if (!r.ok) return { ok: false, error: `No se guardó: ${r.error}` }
      for (const ruta of ["/pagos", "/ventas", `/ventas/${folio}`]) revalidatePath(ruta)
      return { ok: true, texto: `Pago de ${formatoMoneda(datos.monto)} registrado en ${folio}. ${r.saldo > 0 ? `Saldo: ${formatoMoneda(r.saldo)}.` : "La venta quedó liquidada."}`, datos: { folio, saldo: r.saldo } }
    }
    case "lote": {
      const r = await recibirLote(supabase, sesion, p.datos, VIA)
      if (!r.ok) return { ok: false, error: `No se guardó: ${r.error}` }
      for (const ruta of ["/inventario", "/productos"]) revalidatePath(ruta)
      return { ok: true, texto: `Lote ${r.lote.codigo} ingresado. Falta subir el COA original desde Inventario en el CRM.`, datos: { codigo: r.lote.codigo, apartadasRecurrentes: r.recurrentes } }
    }
    case "precio": {
      const r = await actualizarPrecios(supabase, sesion, p.datos.productoId, p.datos.cambios, VIA)
      if (!r.ok) return { ok: false, error: `No se guardó: ${r.error}` }
      revalidatePath("/productos")
      return { ok: true, texto: `Precio de ${r.producto} actualizado.`, datos: { producto: r.producto, precios: r.despues } }
    }
  }
}
