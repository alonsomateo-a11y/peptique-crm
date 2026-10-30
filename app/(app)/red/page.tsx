import type { Metadata } from "next"

import { KpiCard } from "@/components/app/kpi-card"
import { PageHeader } from "@/components/app/page-header"
import { formatoMoneda } from "@/lib/format"
import { mesActual } from "@/lib/reportes"

import { sesionRedEscritorio } from "./acceso"
import { cargarRed } from "./datos"
import { RedVista } from "./red-vista"

export const metadata: Metadata = { title: "Red comercial" }

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

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
        descripcion={`${plural(activos.filter((p) => p.perfil === "distribuidor").length, "distribuidor", "distribuidores")} · ${plural(activos.filter((p) => p.perfil === "comisionista").length, "comisionista", "comisionistas")} · comisiones fijas sobre la venta sin IVA`}
      />
      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          etiqueta={`Vendido por la red · ${mes}`}
          valor={formatoMoneda(red.reduce((t, p) => t + p.vendidoMes, 0))}
          contexto="pagado y reflejado"
          href={`/ventas?${new URLSearchParams({ canal: "red", mes: mesActual(), estado: "validas", desde: `Vendido por la red · ${mes}` })}`}
          ayuda="Ventas de distribuidores y comisionistas creadas este mes cuyo pago ya se reflejó (pagadas o entregadas)."
        />
        <KpiCard
          etiqueta="Comisiones del mes"
          valor={formatoMoneda(red.reduce((t, p) => t + p.comisionMes, 0))}
          contexto="directas y de equipo"
          ayuda="13% sobre la venta sin IVA a quien vendió y 3% a su distribuidor cuando vende un comisionista. Se generan al reflejarse el pago. El detalle por persona está en la tabla de abajo."
        />
        <KpiCard etiqueta="Esperando pago" valor={String(red.reduce((t, p) => t + p.esperando, 0))} contexto="apartados en tránsito" href={s.perfil === "administrador" ? "/pagos?pestana=red" : undefined} ayuda="Ventas de la red apartadas que todavía no reflejan su pago. Si pasan el plazo, se liberan solas." />
        <KpiCard etiqueta="Altas por aprobar" valor={String(porAprobar.length)} contexto={s.perfil === "administrador" ? "las decides tú" : "las decide el administrador"} href={porAprobar.length ? "#altas" : undefined} />
      </section>
      <RedVista red={red} esAdmin={s.perfil === "administrador"} />
    </>
  )
}
