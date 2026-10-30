import type { Metadata } from "next"

import { Estado } from "@/components/app/estado"
import { KpiCard } from "@/components/app/kpi-card"
import { PageHeader } from "@/components/app/page-header"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatoFecha, formatoMoneda } from "@/lib/format"
import { crearClienteAdmin } from "@/lib/supabase/admin"

import { NOMBRE_ESTADO, TIPO_ESTADO, type EstadoVenta } from "../../ventas/tipos"
import { sesionVender } from "../acceso"
import { PestanasVender } from "../pestanas"

export const metadata: Metadata = { title: "Mis ventas" }

const METODO: Record<string, string> = { efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia" }

/** Ventas propias del admin comercial. Se leen con la llave secreta y solo salen campos sin costos. */
export default async function MisVentas() {
  const s = await sesionVender()
  const { data } = await crearClienteAdmin()
    .from("ventas")
    .select("id, folio, creado_en, estado, total, clientes(nombre), venta_partidas(cantidad, productos(nombre, presentacion)), pagos(monto, metodo, estado)")
    .eq("vendedor_id", s.personaId)
    .order("creado_en", { ascending: false })
    .limit(300)

  type V = {
    id: string
    folio: string
    creado_en: string
    estado: EstadoVenta
    total: number
    clientes: { nombre: string } | null
    venta_partidas: { cantidad: number; productos: { nombre: string; presentacion: string } | null }[]
    pagos: { monto: number; metodo: string; estado: string }[]
  }
  const ventas = (data ?? []) as unknown as V[]
  const mes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey" }).format(new Date()).slice(0, 7)
  const delMes = ventas.filter((v) => v.estado !== "cancelada" && v.creado_en.slice(0, 7) === mes)
  const porEntregar = ventas.flatMap((v) => v.pagos).filter((p) => p.estado === "por_entregar")

  return (
    <>
      <PageHeader ruta={[["Inicio", "/inicio"], ["Vender", "/vender"], ["Mis ventas"]]} titulo="Mis ventas" />
      <PestanasVender actual="mis-ventas" />
      <section aria-label="Indicadores" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard etiqueta="Vendido este mes" valor={formatoMoneda(delMes.reduce((t, v) => t + Number(v.total), 0))} contexto={delMes.length === 1 ? "1 venta" : `${delMes.length} ventas`} />
        <KpiCard etiqueta="Efectivo por entregar" valor={formatoMoneda(porEntregar.reduce((t, p) => t + Number(p.monto), 0))} contexto="entrégalo en el mostrador" />
        <KpiCard etiqueta="Ventas totales" valor={String(ventas.filter((v) => v.estado !== "cancelada").length)} contexto="desde que empezaste" />
      </section>
      <div className="overflow-hidden rounded-2xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-hueso-2 hover:bg-hueso-2">
              <TableHead>Folio</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Productos</TableHead>
              <TableHead>Cobro</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ventas.map((v) => {
              const debe = v.pagos.some((p) => p.estado === "por_entregar")
              return (
                <TableRow key={v.id}>
                  <TableCell className="font-mono text-[12px]">{v.folio}</TableCell>
                  <TableCell className="text-[13px]">{formatoFecha(new Date(v.creado_en))}</TableCell>
                  <TableCell className="font-semibold">{v.clientes?.nombre ?? "—"}</TableCell>
                  <TableCell className="text-[12.5px]">{v.venta_partidas.map((p) => `${p.cantidad > 1 ? `${p.cantidad} × ` : ""}${p.productos?.nombre} ${p.productos?.presentacion}`).join(", ")}</TableCell>
                  <TableCell className="text-[13px]">{[...new Set(v.pagos.map((p) => METODO[p.metodo] ?? p.metodo))].join(", ") || "—"}</TableCell>
                  <TableCell className="num text-right font-semibold">{formatoMoneda(Number(v.total))}</TableCell>
                  <TableCell>{debe ? <Estado tipo="warn">Efectivo por entregar</Estado> : <Estado tipo={TIPO_ESTADO[v.estado]}>{NOMBRE_ESTADO[v.estado]}</Estado>}</TableCell>
                </TableRow>
              )
            })}
            {ventas.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  Aún no tienes ventas.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
