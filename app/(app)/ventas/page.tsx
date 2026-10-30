import type { Metadata } from "next"

import { KpiCard } from "@/components/app/kpi-card"
import { PageHeader } from "@/components/app/page-header"
import { formatoMoneda } from "@/lib/format"
import { exigirAdmin } from "@/lib/sesion"

import { cargarMostrador } from "../../(mostrador)/mostrador/datos"
import { crearClienteServidor } from "@/lib/supabase/server"
import { cargarVentas } from "./datos"
import { VentasVista } from "./ventas-vista"

export const metadata: Metadata = { title: "Ventas" }

export default async function Ventas() {
  await exigirAdmin()
  const supabase = await crearClienteServidor()
  const [ventas, { productos }, clientes] = await Promise.all([
    cargarVentas(),
    cargarMostrador(),
    supabase.from("clientes").select("id, nombre, whatsapp, tipo, waiver_firmado_en").order("nombre"),
  ])
  const mes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey" }).format(new Date()).slice(0, 7)
  const delMes = ventas.filter((v) => v.estado !== "cancelada" && v.creado_en.slice(0, 7) === mes)
  const porCobrar = ventas.filter((v) => v.saldo > 0)
  const nombreMes = new Intl.DateTimeFormat("es-MX", { month: "long", timeZone: "America/Monterrey" }).format(new Date())

  return (
    <>
      <PageHeader ruta={[["Inicio", "/inicio"], ["Ventas"]]} titulo="Ventas" descripcion="Todas las ventas: caja, en persona, pedidos y red" />
      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard etiqueta={`Vendido · ${nombreMes}`} valor={formatoMoneda(delMes.reduce((s, v) => s + v.total, 0))} contexto={delMes.length === 1 ? "1 venta" : `${delMes.length} ventas`} />
        <KpiCard etiqueta="Ticket promedio" valor={delMes.length ? formatoMoneda(delMes.reduce((s, v) => s + v.total, 0) / delMes.length) : "—"} contexto="este mes" />
        <KpiCard etiqueta="Por cobrar" valor={formatoMoneda(porCobrar.reduce((s, v) => s + v.saldo, 0))} contexto={porCobrar.length === 1 ? "1 venta con saldo" : `${porCobrar.length} ventas con saldo`} />
        <KpiCard etiqueta="Por entregar" valor={String(ventas.filter((v) => v.estado === "pagada").length)} contexto="pagadas, falta entregar" />
      </section>
      <VentasVista
        ventas={ventas}
        productos={productos}
        clientes={(clientes.data ?? []).map((c) => ({ id: c.id, nombre: c.nombre, whatsapp: c.whatsapp, tipo: c.tipo, waiver: !!c.waiver_firmado_en, planDosis: false }))}
      />
    </>
  )
}
