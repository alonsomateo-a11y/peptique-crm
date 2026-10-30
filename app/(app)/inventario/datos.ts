import "server-only"

import { crearClienteServidor } from "@/lib/supabase/server"
import { liberarApartadosVencidos } from "@/lib/ventas"

import { margenDe } from "../productos/datos-cliente"
import type { Bolsas, LoteFila, ProductoInventario } from "./tipos"

const vacias = (): Bolsas => ({ general: 0, recurrentes: 0, transito: 0 })

/**
 * Piezas que conviene apartar para recurrentes de un producto: por cada aviso de recompra
 * pendiente, las piezas de la siguiente etapa de su protocolo (se asume que todos recompran).
 */
export async function apartadoSugerido(supabase: Awaited<ReturnType<typeof crearClienteServidor>>, productoId?: string) {
  let avisos = supabase.from("avisos_recompra").select("producto_id, siguiente_etapa").in("estado", ["por_avisar", "contactado"])
  if (productoId) avisos = avisos.eq("producto_id", productoId)
  const [{ data: a }, { data: p }] = await Promise.all([avisos, supabase.from("protocolos").select("producto_id, etapa, piezas")])
  const piezas = new Map((p ?? []).map((x) => [`${x.producto_id}|${x.etapa}`, x.piezas]))
  const total = new Map<string, number>()
  for (const x of a ?? []) total.set(x.producto_id, (total.get(x.producto_id) ?? 0) + (piezas.get(`${x.producto_id}|${x.siguiente_etapa ?? 1}`) ?? 1))
  return total
}

export async function cargarInventario() {
  await liberarApartadosVencidos()
  const supabase = await crearClienteServidor()
  const [productos, lotes, movimientos, sugerido, ultimoTc] = await Promise.all([
    supabase.from("productos").select("id, nombre, presentacion, familia, visible, precio_publico").order("nombre").order("presentacion"),
    supabase.from("lotes").select("id, codigo, producto_id, lote_origen, llegada, piezas_recibidas, costo_pieza_mxn, coa_estado").order("llegada", { ascending: false }),
    supabase.from("movimientos_inventario").select("lote_id, tipo, bolsa, cantidad, creado_en"),
    apartadoSugerido(supabase),
    supabase.from("lotes").select("tipo_cambio").not("tipo_cambio", "is", null).order("creado_en", { ascending: false }).limit(1).maybeSingle(),
  ])
  if (productos.error) throw productos.error

  const porLote = new Map<string, { bolsas: Bolsas; ultimaVenta: string | null }>()
  for (const m of movimientos.data ?? []) {
    const x = porLote.get(m.lote_id) ?? { bolsas: vacias(), ultimaVenta: null }
    x.bolsas[m.bolsa as keyof Bolsas] += m.cantidad
    if ((m.tipo === "venta" || m.tipo === "entrega") && (!x.ultimaVenta || m.creado_en > x.ultimaVenta)) x.ultimaVenta = m.creado_en
    porLote.set(m.lote_id, x)
  }
  const producto = new Map(productos.data.map((p) => [p.id, p]))

  const filas: LoteFila[] = (lotes.data ?? []).map((l) => {
    const p = producto.get(l.producto_id)
    const x = porLote.get(l.id) ?? { bolsas: vacias(), ultimaVenta: null }
    const costo = Number(l.costo_pieza_mxn)
    return {
      id: l.id,
      codigo: l.codigo,
      producto_id: l.producto_id,
      producto: p ? `${p.nombre} ${p.presentacion}` : "—",
      familia: p?.familia ?? "",
      lote_origen: l.lote_origen,
      llegada: l.llegada,
      recibidas: l.piezas_recibidas,
      bolsas: x.bolsas,
      existencia: x.bolsas.general + x.bolsas.recurrentes + x.bolsas.transito,
      ultimaVenta: x.ultimaVenta,
      costo,
      margen: margenDe(p?.precio_publico === null || p?.precio_publico === undefined ? null : Number(p.precio_publico), costo),
      coa: l.coa_estado,
    }
  })

  const resumen: ProductoInventario[] = productos.data.map((p) => {
    const suyos = filas.filter((f) => f.producto_id === p.id)
    const bolsas = suyos.reduce((b, f) => ({ general: b.general + f.bolsas.general, recurrentes: b.recurrentes + f.bolsas.recurrentes, transito: b.transito + f.bolsas.transito }), vacias())
    return {
      id: p.id,
      nombre: `${p.nombre} ${p.presentacion}`,
      familia: p.familia,
      visible: p.visible,
      bolsas,
      existencia: bolsas.general + bolsas.recurrentes + bolsas.transito,
      lotes: suyos.filter((f) => f.existencia > 0).length,
      apartadoSugerido: sugerido.get(p.id) ?? 0,
    }
  })

  return { lotes: filas, productos: resumen, tipoCambio: ultimoTc.data?.tipo_cambio ? Number(ultimoTc.data.tipo_cambio) : null }
}
