import type { Metadata } from "next"
import Link from "next/link"

import { Estado } from "@/components/app/estado"
import { KpiCard } from "@/components/app/kpi-card"
import { PageHeader } from "@/components/app/page-header"
import { formatoMoneda, formatoPorcentaje } from "@/lib/format"
import { historico, mesActual, mesMas, resumenMes } from "@/lib/reportes"
import { exigirAdmin } from "@/lib/sesion"
import { crearClienteAdmin } from "@/lib/supabase/admin"

import { BarraMargen } from "../productos/barra-margen"
import { ControlesReportes } from "./controles"
import { BarraParte, Cascada, MesesContraPlan } from "./graficas"

export const metadata: Metadata = { title: "Reportes" }

const nombreMes = (m: string) => new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-15T00:00:00Z`))
const cambio = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : null)

export default async function Reportes({ searchParams }: PageProps<"/reportes">) {
  await exigirAdmin()
  const { mes: m, gastos: abrirGastos } = await searchParams
  const actual = mesActual()
  const mes = typeof m === "string" && /^\d{4}-\d{2}$/.test(m) && m <= actual ? m : actual
  const [r, meses, productos, planes] = await Promise.all([
    resumenMes(mes),
    historico(mes, 6),
    crearClienteAdmin().from("productos").select("id, nombre, presentacion").eq("visible", true).order("nombre").order("presentacion"),
    crearClienteAdmin().from("plan_mensual").select("mes, meta, crecimiento").gte("mes", `${mes}-01`).lte("mes", `${mesMas(mes, 3)}-01`),
  ])
  const avance = r.plan.meta ? r.ingreso / r.plan.meta : null
  const vsAnterior = cambio(r.ingreso, r.ingresoAnterior)
  const peores = [...r.porProducto].filter((p) => p.margen !== null).sort((a, b) => (a.margen ?? 0) - (b.margen ?? 0))
  const peor = peores[0]
  const atrasado = r.planProductos.filter((p) => p.vendidas < p.meta).sort((a, b) => a.vendidas / a.meta - b.vendidas / b.meta)[0]
  const ultimo = meses.at(-2)
  const mesCorto = nombreMes(mes).split(" ")[0]
  /** Lista de ventas de este mes que cuentan en el reporte, con filtros extra. */
  const ventasDe = (extra: Record<string, string>, desde: string) =>
    `/ventas?${new URLSearchParams({ mes, estado: "validas", ...extra, desde: `${desde} · ${mesCorto}` })}`

  return (
    <>
      <PageHeader
        ruta={[["Inicio", "/inicio"], ["Reportes"]]}
        titulo="Reportes"
        descripcion={`${nombreMes(mes)} · plan ${r.plan.sugerido ? "sugerido (mes anterior +5%)" : "capturado"} · montos de venta con IVA; utilidad y márgenes sin IVA`}
        acciones={
          <ControlesReportes
            key={`${mes}-${abrirGastos ?? ""}`}
            mes={mes}
            mesActual={actual}
            gastos={r.gastos}
            productos={(productos.data ?? []).map((p) => ({ id: p.id, nombre: `${p.nombre} ${p.presentacion}` }))}
            planProductos={r.planProductos.map((p) => ({ productoId: p.productoId, meta: p.meta }))}
            planMeses={Array.from({ length: 4 }, (_, i) => {
              const mm = mesMas(mes, i)
              const p = planes.data?.find((x) => x.mes.slice(0, 7) === mm)
              return { mes: mm, meta: p ? Number(p.meta) : null, crecimiento: p ? Number(p.crecimiento) : 5 }
            })}
            baseSugerida={r.ingresoAnterior}
            resumen={r}
            abrirGastos={abrirGastos === "1"}
          />
        }
      />

      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          etiqueta={`Ventas de ${nombreMes(mes).split(" ")[0]}`}
          valor={formatoMoneda(r.ingreso)}
          cambio={vsAnterior === null ? undefined : `${Math.abs(vsAnterior)}% vs mes anterior`}
          positivo={(vsAnterior ?? 0) >= 0}
          contexto={r.ventas === 1 ? "1 venta" : `${r.ventas} ventas`}
          tendencia={r.diario.length > 1 ? r.diario.map((d) => d.ventas) : undefined}
          href={ventasDe({}, "Ventas")}
          ayuda="Suma del total con IVA de las ventas creadas en el mes (hora de Monterrey), sin canceladas ni ventas de la red esperando pago. El cambio compara contra el mes anterior completo."
        />
        <KpiCard
          etiqueta="Avance vs plan"
          valor={avance === null ? "—" : formatoPorcentaje(avance)}
          contexto={r.plan.meta ? `Plan del mes ${formatoMoneda(r.plan.meta)}` : "Sin plan: configúralo"}
          href={ventasDe({}, "Avance vs plan")}
          ayuda={`Ventas del mes entre la meta del mes. ${r.plan.sugerido ? "No hay meta capturada: se usa la sugerida, ventas del mes anterior + 5%." : "La meta es la capturada en Configurar plan."}`}
        />
        <KpiCard
          etiqueta="Utilidad estimada"
          valor={formatoMoneda(r.utilidad)}
          positivo={r.utilidad >= 0}
          contexto="Después de producto, red y fijos"
          href="#resultados"
          ayuda="Ingresos sin IVA (ventas ÷ 1.16) menos el costo de cada pieza vendida según su lote, menos comisiones de la red generadas en el mes, menos gastos fijos capturados. Desglose en el estado de resultados."
        />
        <KpiCard
          etiqueta="Margen bruto"
          valor={r.margenBruto === null ? "—" : formatoPorcentaje(r.margenBruto)}
          contexto="Ingreso sin IVA contra costo de cada lote"
          href="#margen"
          ayuda="(Ingresos sin IVA − costo de producto) ÷ ingresos sin IVA. No descuenta comisiones ni gastos fijos. Desglose por producto abajo."
        />
      </section>

      <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr]">
        <section className="flex flex-col gap-2 rounded-2xl border bg-card p-[18px]">
          <h2 className="text-lg font-semibold">
            {ultimo?.plan && ultimo.ventas >= ultimo.plan ? `${nombreMes(ultimo.mes).split(" ")[0].replace(/^./, (c) => c.toUpperCase())} superó el plan` : "Ventas por mes contra el plan"}
            {avance !== null && `; ${nombreMes(mes).split(" ")[0]} va al ${formatoPorcentaje(avance)}`}
          </h2>
          <p className="text-[12.5px] text-muted-foreground">Últimos 6 meses · la raya punteada es el plan</p>
          <MesesContraPlan datos={meses} mesActivo={mes} />
          <span className="text-[11.5px] text-muted-foreground">Clic en un mes para ver su reporte.</span>
        </section>
        <section id="resultados" className="flex scroll-mt-4 flex-col gap-3 rounded-2xl border bg-card p-[18px]">
          <h2 className="text-lg font-semibold">{r.utilidad >= 0 ? `Quedan ${formatoMoneda(r.utilidad)} de utilidad este mes` : `El mes va con pérdida de ${formatoMoneda(-r.utilidad)}`}</h2>
          <p className="text-[12.5px] text-muted-foreground">Estado de resultados, de ingresos a utilidad{r.fijos === 0 && " · sin gastos fijos capturados"}</p>
          <Cascada
            sinIva={r.sinIva}
            costo={r.costo}
            comisiones={r.comisiones}
            fijos={r.fijos}
            utilidad={r.utilidad}
            ligas={{ ingresos: ventasDe({}, "Ingresos"), costo: "#margen", comisiones: ventasDe({ canal: "red" }, "Comisiones de la red"), fijos: `/reportes?mes=${mes}&gastos=1` }}
          />
          <span className="text-[11.5px] text-muted-foreground">Clic en cada renglón para ver de dónde sale.</span>
        </section>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section id="margen" className="flex scroll-mt-4 flex-col gap-2.5 rounded-2xl border bg-card p-[18px]">
          <h2 className="text-lg font-semibold">{peor && (peor.margen ?? 0) < 0 ? `${peor.nombre} deja pérdida` : "Margen por producto"}</h2>
          <p className="text-[12.5px] text-muted-foreground">Lo vendido este mes contra el costo del lote que salió · montos sin IVA · clic para ver sus ventas</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[11.5px] text-muted-foreground">
                  <th className="py-1.5 font-semibold">Producto</th>
                  <th className="py-1.5 text-right font-semibold">Pzas</th>
                  <th className="py-1.5 text-right font-semibold">Ingreso</th>
                  <th className="py-1.5 text-right font-semibold">Costo</th>
                  <th className="w-32 py-1.5 pl-3 font-semibold">Margen</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {r.porProducto.map((p) => (
                  <tr key={p.id} className="hover:bg-hueso-2">
                    <td className="py-1.5">
                      <Link href={ventasDe({ producto: p.id }, p.nombre)} className="font-semibold hover:underline">
                        {p.nombre}
                      </Link>
                    </td>
                    <td className="num py-1.5 text-right">{p.piezas}</td>
                    <td className="num py-1.5 text-right">{formatoMoneda(p.ingreso)}</td>
                    <td className="num py-1.5 text-right">{formatoMoneda(p.costo)}</td>
                    <td className="py-1.5 pl-3">
                      <BarraMargen valor={p.margen === null ? null : Math.round(p.margen * 100)} />
                    </td>
                  </tr>
                ))}
                {r.porProducto.length > 0 && (
                  <tr className="font-bold">
                    <td className="py-1.5">Total</td>
                    <td className="num py-1.5 text-right">{r.porProducto.reduce((s, p) => s + p.piezas, 0)}</td>
                    <td className="num py-1.5 text-right">{formatoMoneda(r.sinIva)}</td>
                    <td className="num py-1.5 text-right">{formatoMoneda(r.costo)}</td>
                    <td className="num py-1.5 pl-3">{r.margenBruto === null ? "—" : formatoPorcentaje(r.margenBruto)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {!r.porProducto.length && <p className="py-4 text-center text-[13px] text-muted-foreground">Sin ventas en este mes.</p>}
        </section>
        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-[18px]">
          <h2 className="text-lg font-semibold">{atrasado ? `${atrasado.nombre} va atrasado contra su plan` : "Productos con plan propio"}</h2>
          <p className="text-[12.5px] text-muted-foreground">Piezas vendidas contra la meta del mes</p>
          {r.planProductos.map((p) => {
            const v = p.vendidas / p.meta
            return (
              <Link key={p.productoId} href={ventasDe({ producto: p.productoId }, p.nombre)} className="-mx-1.5 flex flex-col gap-1.5 rounded-lg px-1.5 py-1 hover:bg-hueso-2">
                <div className="flex items-center gap-2 text-[12.5px]">
                  <b className="flex-1">{p.nombre}</b>
                  <span className="num">
                    {p.vendidas} de {p.meta}
                  </span>
                  {v < 0.6 && <Estado tipo="warn">Atrasado</Estado>}
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-[#efe9e1]" aria-hidden>
                  <div className={v >= 0.6 ? "h-full rounded-full bg-chart-1" : "h-full rounded-full bg-[#b7791f]"} style={{ width: `${Math.min(v, 1) * 100}%` }} />
                </div>
              </Link>
            )
          })}
          {!r.planProductos.length && <p className="py-4 text-center text-[13px] text-muted-foreground">Ningún producto tiene meta propia este mes. Agrégalas en “Configurar plan”.</p>}
        </section>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-[18px]">
          <h2 className="text-lg font-semibold">{r.porCanal[0] ? `${r.porCanal[0].canal} trae ${formatoPorcentaje(r.porCanal[0].monto / r.ingreso)} de las ventas` : "Ventas por canal"}</h2>
          {r.porCanal.map((c) => (
            <BarraParte key={c.clave} etiqueta={c.canal} detalle={c.ventas === 1 ? "1 venta" : `${c.ventas} ventas`} valor={c.monto} maximo={r.porCanal[0].monto} total={r.ingreso} href={ventasDe({ canal: c.clave }, c.canal)} />
          ))}
          {!r.porCanal.length && <p className="text-[13px] text-muted-foreground">Sin ventas en este mes.</p>}
        </section>
        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-[18px]">
          <h2 className="text-lg font-semibold">{r.porPersona[0] ? `${r.porPersona[0].persona} es quien más vende` : "Ventas por persona"}</h2>
          {r.porPersona.slice(0, 8).map((p) => (
            <BarraParte key={p.id} etiqueta={p.persona} detalle={p.ventas === 1 ? "1 venta" : `${p.ventas} ventas`} valor={p.monto} maximo={r.porPersona[0].monto} total={r.ingreso} href={ventasDe({ vendedor: p.id }, p.persona)} />
          ))}
          {!r.porPersona.length && <p className="text-[13px] text-muted-foreground">Sin ventas en este mes.</p>}
        </section>
      </div>
    </>
  )
}
