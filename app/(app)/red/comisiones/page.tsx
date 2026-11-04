import type { Metadata } from "next"

import { KpiCard } from "@/components/app/kpi-card"
import { PageHeader } from "@/components/app/page-header"
import { formatoMoneda } from "@/lib/format"

import { sesionRedEscritorio } from "../acceso"
import { ComisionesVista } from "./comisiones-vista"
import { cargarComisiones } from "./datos"

export const metadata: Metadata = { title: "Comisiones por pagar" }

export default async function Comisiones() {
  const s = await sesionRedEscritorio()
  const { porPagar, pagos } = await cargarComisiones()
  const mes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey" }).format(new Date()).slice(0, 7)
  const delMes = pagos.filter((p) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey" }).format(new Date(p.pagadaEn)).startsWith(mes))

  return (
    <>
      <PageHeader
        ruta={[["Inicio", "/inicio"], ["Red comercial", "/red"], ["Comisiones por pagar"]]}
        titulo="Comisiones por pagar"
        descripcion="Lo que se le debe a cada persona de la red. Se genera cuando el pago de la venta se refleja."
      />
      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <KpiCard etiqueta="Por pagar" valor={formatoMoneda(porPagar.reduce((t, p) => t + p.total, 0))} contexto={porPagar.length === 1 ? "a 1 persona" : `a ${porPagar.length} personas`} />
        <KpiCard etiqueta="De equipo" valor={formatoMoneda(porPagar.reduce((t, p) => t + p.equipo, 0))} contexto="incluido en lo por pagar" />
        <KpiCard etiqueta="Pagado este mes" valor={formatoMoneda(delMes.reduce((t, p) => t + p.total, 0))} contexto={delMes.length === 1 ? "1 pago" : `${delMes.length} pagos`} />
      </section>
      <ComisionesVista porPagar={porPagar} pagos={pagos} esAdmin={s.perfil === "administrador"} />
    </>
  )
}
