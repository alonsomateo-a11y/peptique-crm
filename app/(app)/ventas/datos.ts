import "server-only"

import { diaMty } from "@/lib/format"
import { crearClienteAdmin } from "@/lib/supabase/admin"

import type { VentaFila } from "./tipos"

export const LIMITE_VENTAS = 5000

/**
 * Se lee con la llave secreta porque el admin comercial también ve Ventas (sin costos) y por
 * RLS no alcanza partidas ni pagos. La página valida el perfil antes de llamar esto.
 */
export async function cargarVentas(): Promise<VentaFila[]> {
  const supabase = crearClienteAdmin()
  const { data, error } = await supabase
    .from("ventas")
    .select("id, folio, creado_en, canal, estado, forma_pago, total, etiquetas, cliente_id, vendedor_id, clientes(nombre), personas:vendedor_id(nombre), venta_partidas(producto_id, cantidad, precio_unitario, productos(nombre, presentacion)), pagos(monto, estado)")
    .order("creado_en", { ascending: false })
    .limit(LIMITE_VENTAS)
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
    venta_partidas: { producto_id: string; cantidad: number; precio_unitario: number; productos: { nombre: string; presentacion: string } | null }[]
    pagos: { monto: number; estado: string }[]
  }
  return (data as unknown as Fila[]).map((v) => {
    const pagado = v.pagos.filter((p) => p.estado !== "devolucion").reduce((s, p) => s + Number(p.monto), 0)
    // Una partida por lote: se juntan por producto para mostrar.
    const porProducto = new Map<string, { nombre: string; cantidad: number; importe: number }>()
    for (const p of v.venta_partidas) {
      const x = porProducto.get(p.producto_id) ?? { nombre: p.productos ? `${p.productos.nombre} ${p.productos.presentacion}` : "producto", cantidad: 0, importe: 0 }
      x.cantidad += p.cantidad
      x.importe += p.cantidad * Number(p.precio_unitario)
      porProducto.set(p.producto_id, x)
    }
    return {
      id: v.id,
      folio: v.folio,
      creado_en: v.creado_en,
      dia: diaMty(v.creado_en),
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
      productos: [...porProducto.values()].map((x) => `${x.cantidad > 1 ? `${x.cantidad} × ` : ""}${x.nombre}`).join(", "),
      partidas: [...porProducto].map(([productoId, x]) => ({ productoId, ...x })),
      etiquetas: v.etiquetas ?? [],
    }
  })
}
