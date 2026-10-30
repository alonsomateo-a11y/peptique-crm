import type { Metadata } from "next"

import { KpiCard } from "@/components/app/kpi-card"
import { PageHeader } from "@/components/app/page-header"
import { formatoMoneda, formatoPorcentaje } from "@/lib/format"
import { mesActual } from "@/lib/reportes"
import { exigirAdmin } from "@/lib/sesion"

import { ClientesVista } from "./clientes-vista"
import { cargarClientes } from "./datos"

export const metadata: Metadata = { title: "Clientes" }

export default async function Clientes({ searchParams }: PageProps<"/clientes">) {
  await exigirAdmin()
  const sp = await searchParams
  const filtro = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined)
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
        <KpiCard
          etiqueta="Clientes activos"
          valor={String(k.activos)}
          contexto="compraron en los últimos 60 días"
          href="/clientes?ultima=60"
          ayuda="Clientes con al menos una compra en los últimos 60 días (sin canceladas ni ventas de la red esperando pago)."
        />
        <KpiCard etiqueta={`Nuevos · ${mes}`} valor={String(k.nuevosMes)} contexto="dados de alta este mes" href="/clientes?alta=mes" ayuda="Clientes dados de alta este mes, en Clientes, en el mostrador o desde la red." />
        <KpiCard
          etiqueta="Ticket promedio"
          valor={k.ticket === null ? "—" : formatoMoneda(k.ticket)}
          contexto="ventas de este mes"
          href={`/ventas?mes=${mesActual()}&estado=validas&desde=${encodeURIComponent("Ticket promedio")}`}
          ayuda="Total vendido este mes entre el número de ventas de este mes. Mismo criterio que Ventas e Inicio."
        />
        <KpiCard
          etiqueta="Recompra"
          valor={k.recompra === null ? "—" : formatoPorcentaje(k.recompra)}
          contexto="de quienes compraron, volvieron a comprar"
          href="/clientes?compras=2"
          ayuda="De todos los clientes que han comprado alguna vez, cuántos tienen dos o más compras. Distinto a la recompra de Inicio, que mide solo los avisos que vencieron este mes."
        />
      </section>
      <ClientesVista key={JSON.stringify(sp)} clientes={clientes} vendedores={vendedores} ahora={ahora} inicial={{ ultima: filtro("ultima"), alta: filtro("alta"), compras: filtro("compras") }} />
    </>
  )
}
