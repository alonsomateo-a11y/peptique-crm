import "server-only"

import { crearClienteServidor } from "@/lib/supabase/server"

import type { VentaFila } from "./tipos"

export async function cargarVentas(): Promise<VentaFila[]> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from("ventas")
    .select("id, folio, creado_en, canal, estado, forma_pago, total, etiquetas, cliente_id, vendedor_id, clientes(nombre), personas:vendedor_id(nombre), venta_partidas(cantidad, productos(nombre, presentacion)), pagos(monto, estado)")
    .order("creado_en", { ascending: false })
    .limit(2000)
  if (error) throw error
  type Fila = {
    id: string
    folio: string
    creado_en: string
    canal: VentaFila["canal"]
    estado: VentaFila["estado"]
    forma_pago: string
    total: number
    etiquetas: string[]
    cliente_id: string
    vendedor_id: string
    clientes: { nombre: string } | null
    personas: { nombre: string } | null
    venta_partidas: { cantidad: number; productos: { nombre: string; presentacion: string } | null }[]
    pagos: { monto: number; estado: string }[]
  }
  return (data as unknown as Fila[]).map((v) => {
    const pagado = v.pagos.filter((p) => p.estado !== "devolucion").reduce((s, p) => s + Number(p.monto), 0)
    // Una partida por lote: se juntan por producto para mostrar.
    const porProducto = new Map<string, number>()
    for (const p of v.venta_partidas) {
      const n = p.productos ? `${p.productos.nombre} ${p.productos.presentacion}` : "producto"
      porProducto.set(n, (porProducto.get(n) ?? 0) + p.cantidad)
    }
    return {
      id: v.id,
      folio: v.folio,
      creado_en: v.creado_en,
      canal: v.canal,
      estado: v.estado,
      porDosis: v.forma_pago === "por_dosis",
      total: Number(v.total),
      pagado,
      saldo: v.estado === "cancelada" ? 0 : Math.max(Math.round((Number(v.total) - pagado) * 100) / 100, 0),
      clienteId: v.cliente_id,
      cliente: v.clientes?.nombre ?? "—",
      vendedorId: v.vendedor_id,
      vendedor: v.personas?.nombre ?? "—",
      productos: [...porProducto].map(([n, c]) => `${c > 1 ? `${c} × ` : ""}${n}`).join(", "),
      etiquetas: v.etiquetas ?? [],
    }
  })
}
