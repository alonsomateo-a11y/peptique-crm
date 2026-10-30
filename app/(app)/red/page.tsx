import type { Metadata } from "next"

import { KpiCard } from "@/components/app/kpi-card"
import { PageHeader } from "@/components/app/page-header"
import { formatoMoneda } from "@/lib/format"

import { sesionRedEscritorio } from "./acceso"
import { cargarRed } from "./datos"
import { RedVista } from "./red-vista"

export const metadata: Metadata = { title: "Red comercial" }

export default async function Red() {
  const s = await sesionRedEscritorio()
  const red = await cargarRed(s.personaId)
  const activos = red.filter((p) => p.estado === "activo")
  const porAprobar = red.filter((p) => p.estado === "por_aprobar")
  const mes = new Intl.DateTimeFormat("es-MX", { month: "long", timeZone: "America/Monterrey" }).format(new Date())

  return (
    <>
      <PageHeader
        ruta={[["Inicio", "/inicio"], ["Red comercial"]]}
        titulo="Red comercial"
        descripcion={`${activos.filter((p) => p.perfil === "distribuidor").length} distribuidores · ${activos.filter((p) => p.perfil === "comisionista").length} comisionistas · comisiones fijas sobre la venta sin IVA`}
      />
      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard etiqueta={`Vendido por la red · ${mes}`} valor={formatoMoneda(red.reduce((t, p) => t + p.vendidoMes, 0))} contexto="pagado y reflejado" />
        <KpiCard etiqueta="Comisiones del mes" valor={formatoMoneda(red.reduce((t, p) => t + p.comisionMes, 0))} contexto="directas y de equipo" />
        <KpiCard etiqueta="Esperando pago" valor={String(red.reduce((t, p) => t + p.esperando, 0))} contexto="apartados en tránsito" />
        <KpiCard etiqueta="Altas por aprobar" valor={String(porAprobar.length)} contexto={s.perfil === "administrador" ? "las decides tú" : "las decide el administrador"} />
      </section>
      <RedVista red={red} esAdmin={s.perfil === "administrador"} />
    </>
  )
}
