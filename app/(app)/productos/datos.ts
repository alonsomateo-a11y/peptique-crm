import "server-only"

import { crearClienteServidor } from "@/lib/supabase/server"

import { margenDe, type ProductoFila } from "./datos-cliente"

export type { ProductoFila } from "./datos-cliente"

/** Colchón de la reposición sugerida. */
const COLCHON = 1.05

export async function cargarProductos(): Promise<ProductoFila[]> {
  const supabase = await crearClienteServidor()
  const hace90 = new Date(Date.now() - 90 * 86_400_000).toISOString()

  const [productos, protocolos, lotes, existencias, partidas] = await Promise.all([
    supabase.from("productos").select("*").order("nombre").order("presentacion"),
    supabase.from("protocolos").select("producto_id, etapa, piezas, duracion_dias, pdf_path"),
    supabase.from("lotes").select("id, codigo, producto_id, llegada, costo_pieza_mxn").order("llegada"),
    supabase.from("existencias").select("lote_id, bolsa, piezas"),
    supabase
      .from("venta_partidas")
      .select("producto_id, cantidad, ventas!inner(creado_en, estado)")
      .gte("ventas.creado_en", hace90)
      .neq("ventas.estado", "cancelada"),
  ])
  if (productos.error) throw productos.error

  const piezasLote = new Map<string, number>()
  const recurrentesLote = new Map<string, number>()
  for (const e of existencias.data ?? []) {
    piezasLote.set(e.lote_id, (piezasLote.get(e.lote_id) ?? 0) + e.piezas)
    if (e.bolsa === "recurrentes") recurrentesLote.set(e.lote_id, (recurrentesLote.get(e.lote_id) ?? 0) + e.piezas)
  }

  const vendidas = new Map<string, number>()
  for (const p of partidas.data ?? []) vendidas.set(p.producto_id, (vendidas.get(p.producto_id) ?? 0) + p.cantidad)

  return productos.data.map((p) => {
    const susLotes = (lotes.data ?? []).filter((l) => l.producto_id === p.id)
    const conPiezas = susLotes
      .map((l) => ({
        id: l.id,
        codigo: l.codigo,
        llegada: l.llegada,
        piezas: piezasLote.get(l.id) ?? 0,
        costo: Number(l.costo_pieza_mxn),
        margen: margenDe(p.precio_publico, Number(l.costo_pieza_mxn)),
      }))
      .filter((l) => l.piezas > 0)
    const recurrentes = susLotes.reduce((s, l) => s + (recurrentesLote.get(l.id) ?? 0), 0)
    const ventaMensual = Math.round((vendidas.get(p.id) ?? 0) / 3)
    const reposicion = ventaMensual || recurrentes ? Math.ceil((recurrentes + ventaMensual) * COLCHON) : null

    return {
      ...p,
      precio_publico: p.precio_publico === null ? null : Number(p.precio_publico),
      precio_medico: p.precio_medico === null ? null : Number(p.precio_medico),
      precio_distribuidor: p.precio_distribuidor === null ? null : Number(p.precio_distribuidor),
      piezas: conPiezas.reduce((s, l) => s + l.piezas, 0),
      lotes: conPiezas,
      protocolos: (protocolos.data ?? [])
        .filter((x) => x.producto_id === p.id)
        .map(({ etapa, piezas, duracion_dias, pdf_path }) => ({ etapa, piezas, duracion_dias, pdf_path })),
      ventaMensual,
      recurrentes,
      reposicion,
    }
  })
}
