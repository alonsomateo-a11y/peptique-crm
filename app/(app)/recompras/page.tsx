import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { KpiCard } from "@/components/app/kpi-card"
import { PageHeader } from "@/components/app/page-header"
import { formatoPorcentaje } from "@/lib/format"
import { inicioPorPerfil, obtenerSesion } from "@/lib/sesion"

import { cargarAvisos } from "./datos"
import { RecomprasVista } from "./recompras-vista"

export const metadata: Metadata = { title: "Recompras" }

export default async function Recompras({ searchParams }: PageProps<"/recompras">) {
  const { pestana } = await searchParams
  const s = await obtenerSesion()
  if (s.perfil !== "administrador" && s.perfil !== "admin_comercial") redirect(inicioPorPerfil(s.perfil))
  const { avisos, diasAviso, hoy } = await cargarAvisos()
  const mes = hoy.slice(0, 7)
  const activos = avisos.filter((a) => a.estado === "por_avisar" || a.estado === "contactado")
  const cerradosMes = avisos.filter((a) => a.seLeAcaba.slice(0, 7) === mes && (a.estado === "recompro" || a.estado === "sin_recompra"))
  const tasa = cerradosMes.length ? cerradosMes.filter((a) => a.estado === "recompro").length / cerradosMes.length : null

  return (
    <>
      <PageHeader
        ruta={[["Inicio", "/inicio"], ["Recompras"]]}
        titulo="Recompras"
        descripcion={`Aviso interno ${diasAviso === 1 ? "1 día" : `${diasAviso} días`} antes de que se le acabe a cada cliente · sin mensajes automáticos`}
      />
      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          etiqueta="Se les acaba esta semana"
          valor={String(activos.filter((a) => a.dias <= 7).length)}
          contexto="avisos internos"
          href="/recompras?pestana=por_avisar"
          ayuda="Avisos por avisar o contactados cuya fecha de término cae en los próximos 7 días. La fecha sale de la venta + la duración del protocolo de su etapa."
        />
        <KpiCard etiqueta="Ya contactados" valor={String(avisos.filter((a) => a.estado === "contactado").length)} contexto="esperando su recompra" href="/recompras?pestana=contactado" ayuda="Avisos que alguien del equipo marcó como contactados y que todavía no recompran." />
        <KpiCard
          etiqueta="Volvieron a comprar"
          valor={tasa === null ? "—" : formatoPorcentaje(tasa)}
          contexto="de los que se les acabó este mes"
          href="/recompras?pestana=recompro"
          ayuda="De los avisos cuya fecha de término cayó este mes, el porcentaje que terminó en recompra (contra los que quedaron sin recompra)."
        />
        <KpiCard
          etiqueta="Sin recompra"
          valor={String(avisos.filter((a) => a.estado === "sin_recompra").length)}
          contexto="se les acabó y no regresaron"
          className="border-[#ebc5c1] bg-crit-bg"
          href="/recompras?pestana=sin_recompra"
          ayuda="Clientes cuya fecha de término ya pasó sin que volvieran a comprar ese producto. Si compran después, salen de aquí solos."
        />
      </section>
      <RecomprasVista key={typeof pestana === "string" ? pestana : ""} avisos={avisos} diasAviso={diasAviso} pestanaInicial={typeof pestana === "string" ? pestana : undefined} />
    </>
  )
}
