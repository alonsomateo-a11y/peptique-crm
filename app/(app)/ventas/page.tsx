import type { Metadata } from "next"

import { KpiCard } from "@/components/app/kpi-card"
import { PageHeader } from "@/components/app/page-header"
import { formatoMoneda } from "@/lib/format"
import { mesActual } from "@/lib/reportes"
import { inicioPorPerfil, obtenerSesion } from "@/lib/sesion"
import { redirect } from "next/navigation"
import { crearClienteServidor } from "@/lib/supabase/server"

import { cargarMostrador } from "../../(mostrador)/mostrador/datos"
import { cargarVentas, LIMITE_VENTAS } from "./datos"
import { cuentaParaReportes, type FiltrosVentas } from "./tipos"
import { VentasVista } from "./ventas-vista"

export const metadata: Metadata = { title: "Ventas" }

const leer = (sp: Record<string, string | string[] | undefined>): FiltrosVentas => {
  const v = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, 80) : undefined)
  return { q: v("q"), canal: v("canal"), estado: v("estado"), vendedor: v("vendedor"), mes: v("mes"), dia: v("dia"), producto: v("producto"), desde: v("desde") }
}

export default async function Ventas({ searchParams }: PageProps<"/ventas">) {
  const sesion = await obtenerSesion()
  if (sesion.perfil !== "administrador" && sesion.perfil !== "admin_comercial") redirect(inicioPorPerfil(sesion.perfil))
  const esAdmin = sesion.perfil === "administrador"
  const filtros = leer(await searchParams)
  const supabase = await crearClienteServidor()
  const [ventas, { productos }, clientes] = await Promise.all([
    cargarVentas(),
    cargarMostrador(),
    supabase.from("clientes").select("id, nombre, whatsapp, tipo, waiver_firmado_en").order("nombre"),
  ])
  const mes = mesActual()
  const delMes = ventas.filter((v) => cuentaParaReportes(v.estado) && v.dia.slice(0, 7) === mes)
  const totalMes = delMes.reduce((s, v) => s + v.total, 0)
  // La red que espera pago se sigue en Pagos · Red en camino; aquí solo saldos de ventas ya activas.
  const porCobrar = ventas.filter((v) => v.saldo > 0 && v.estado !== "esperando_pago")
  const porEntregar = ventas.filter((v) => v.estado === "pagada")
  const nombreMes = new Intl.DateTimeFormat("es-MX", { month: "long", timeZone: "America/Monterrey" }).format(new Date())
  const delMesLiga = `/ventas?mes=${mes}&estado=validas&desde=${encodeURIComponent(`Vendido · ${nombreMes}`)}`

  return (
    <>
      <PageHeader ruta={[["Inicio", "/inicio"], ["Ventas"]]} titulo="Ventas" descripcion="Todas las ventas: caja, en persona, pedidos y red · montos con IVA" />
      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          etiqueta={`Vendido · ${nombreMes}`}
          valor={formatoMoneda(totalMes)}
          contexto={delMes.length === 1 ? "1 venta" : `${delMes.length} ventas`}
          href={delMesLiga}
          ayuda="Suma del total (con IVA) de las ventas creadas este mes, hora de Monterrey. No cuenta canceladas ni ventas de la red que siguen esperando su pago. Es el mismo número que en Inicio y Reportes."
        />
        <KpiCard
          etiqueta="Ticket promedio"
          valor={delMes.length ? formatoMoneda(totalMes / delMes.length) : "—"}
          contexto="este mes"
          href={delMesLiga}
          ayuda="Vendido este mes entre el número de ventas de este mes (las mismas que el indicador anterior)."
        />
        <KpiCard
          etiqueta="Por cobrar"
          valor={formatoMoneda(porCobrar.reduce((s, v) => s + v.saldo, 0))}
          contexto={porCobrar.length === 1 ? "1 venta con saldo" : `${porCobrar.length} ventas con saldo`}
          href={`/ventas?estado=con_saldo&desde=${encodeURIComponent("Por cobrar")}`}
          ayuda="Total de cada venta activa menos lo que ya se pagó (las devoluciones no cuentan como pago). Incluye pedidos y planes por dosis, de cualquier mes. Las ventas de la red que esperan su pago no están aquí: se siguen en Pagos · Red en camino."
        />
        <KpiCard
          etiqueta="Por entregar"
          valor={String(porEntregar.length)}
          contexto="pagadas, falta entregar"
          href={`/ventas?estado=pagada&desde=${encodeURIComponent("Por entregar")}`}
          ayuda="Ventas ya pagadas completas que todavía no se marcan como entregadas (pedidos y ventas de la red)."
        />
      </section>
      <VentasVista
        key={JSON.stringify(filtros)}
        ventas={ventas}
        productos={productos}
        clientes={(clientes.data ?? []).map((c) => ({ id: c.id, nombre: c.nombre, whatsapp: c.whatsapp, tipo: c.tipo, waiver: !!c.waiver_firmado_en, planDosis: false }))}
        inicial={filtros}
        truncado={ventas.length >= LIMITE_VENTAS}
        puedeCrear={esAdmin}
      />
    </>
  )
}
