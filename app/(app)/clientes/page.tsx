import type { Metadata } from "next"

import { KpiCard } from "@/components/app/kpi-card"
import { PageHeader } from "@/components/app/page-header"
import { formatoMoneda, formatoPorcentaje } from "@/lib/format"
import { exigirAdmin } from "@/lib/sesion"

import { ClientesVista } from "./clientes-vista"
import { cargarClientes } from "./datos"

export const metadata: Metadata = { title: "Clientes" }

export default async function Clientes() {
  await exigirAdmin()
  const { clientes, indicadores: k, vendedores, ahora } = await cargarClientes()
  const vip = clientes.filter((c) => c.etiquetas.includes("VIP")).length
  const mes = new Intl.DateTimeFormat("es-MX", { month: "long", timeZone: "America/Monterrey" }).format(new Date())

  return (
    <>
      <PageHeader
        ruta={[["Inicio", "/inicio"], ["Clientes"]]}
        titulo="Clientes"
        descripcion={`${clientes.length === 1 ? "1 cliente" : `${clientes.length} clientes`}${vip ? ` · ${vip} con la etiqueta VIP` : ""}`}
      />
      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard etiqueta="Clientes activos" valor={String(k.activos)} contexto="compraron en los últimos 60 días" />
        <KpiCard etiqueta={`Nuevos · ${mes}`} valor={String(k.nuevosMes)} contexto="dados de alta este mes" />
        <KpiCard etiqueta="Ticket promedio" valor={k.ticket === null ? "—" : formatoMoneda(k.ticket)} contexto="ventas de este mes" />
        <KpiCard etiqueta="Recompra" valor={k.recompra === null ? "—" : formatoPorcentaje(k.recompra)} contexto="de quienes compraron, volvieron a comprar" />
      </section>
      <ClientesVista clientes={clientes} vendedores={vendedores} ahora={ahora} />
    </>
  )
}
