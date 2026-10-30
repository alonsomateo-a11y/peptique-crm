import type { Metadata } from "next"
import Link from "next/link"
import { AlertTriangle, ArrowRight, Plus, Store } from "lucide-react"

import { GraficaVentasPlan } from "@/components/app/grafica-ventas-plan"
import { KpiCard } from "@/components/app/kpi-card"
import { Button } from "@/components/ui/button"
import { alertas, PLAN_MES, ventasDiarias, ventasMes, ventasPorCanal } from "@/lib/demo"
import { formatoMoneda, formatoPorcentaje } from "@/lib/format"
import { navPara } from "@/lib/nav"
import { obtenerSesion } from "@/lib/sesion"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Inicio" }

export default async function Inicio() {
  const sesion = await obtenerSesion()
  // Márgenes y alertas de pantallas solo del administrador no se muestran a otros perfiles.
  const esAdmin = sesion.perfil === "administrador"
  const rutas = new Set(navPara(sesion.perfil).flatMap((g) => g.items.map((i) => i.href)))
  const puedeVer = (href: string) => esAdmin || rutas.has(href)
  const actual = ventasMes[ventasMes.length - 1].ventas
  const avance = actual / PLAN_MES
  const promedio = actual / ventasMes.length
  const totalCanales = ventasPorCanal.reduce((s, c) => s + c.monto, 0)
  const maxCanal = Math.max(...ventasPorCanal.map((c) => c.monto))

  return (
    <>
      <div className="flex items-end gap-2.5">
        <div className="flex-1">
          <div className="text-[11.5px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
            Miércoles 28 de octubre · caja abierta por Laura
          </div>
          <h1 className="mt-1 text-[30px] leading-tight font-medium">Buenos días, {sesion.nombre}</h1>
        </div>
        <Button variant="outline" size="lg">
          <Plus aria-hidden />
          Pedido para médico
        </Button>
        <Button size="lg" asChild>
          <Link href="/mostrador">
            <Store aria-hidden />
            Vender en mostrador
          </Link>
        </Button>
      </div>

      <section aria-label="Alertas" className="flex flex-col gap-2">
        {alertas.filter((a) => puedeVer(a.href)).map((a) => (
          <div key={a.titulo} className="flex items-center gap-3 rounded-xl border bg-card px-3.5 py-3">
            <span
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-[9px]",
                a.tipo === "crit" ? "bg-crit-bg text-crit" : "bg-warn-bg text-warn",
              )}
            >
              <AlertTriangle className="size-4" aria-hidden />
            </span>
            <div className="flex-1">
              <b className="text-sm">{a.titulo}</b>
              <div className="text-[11.5px] text-muted-foreground">{a.detalle}</div>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={a.href}>
                {a.accion}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        ))}
      </section>

      <section aria-label="Indicadores" className="flex gap-3">
        <KpiCard
          etiqueta="Ventas de octubre"
          valor={formatoMoneda(actual)}
          cambio="8% vs sep"
          contexto={`Plan del mes ${formatoMoneda(PLAN_MES)} · ${formatoPorcentaje(avance)}`}
          tendencia={ventasMes.slice(-14).map((d) => d.ventas)}
        />
        <KpiCard etiqueta="Ventas de hoy" valor="$4,600" cambio="3 ventas" contexto="Caja abierta por Laura" tendencia={ventasDiarias.slice(-7)} />
        {esAdmin && <KpiCard etiqueta="Margen del mes" valor="46.8%" cambio="1.2 pts" contexto="Después de comisiones de la red" tendencia={[44, 45.1, 44.6, 45.9, 46.2, 46.1, 46.8]} />}
        <KpiCard etiqueta="Recompra" valor="41%" cambio="meta 35%" contexto="15 recompras esta semana" tendencia={[33, 35, 34, 37, 38, 40, 41]} />
      </section>

      <div className="flex items-stretch gap-3">
        <section className="flex min-w-0 flex-1 flex-col gap-1 rounded-2xl border bg-card px-[18px] pt-[18px] pb-2.5">
          <h2 className="text-lg font-semibold">Vamos al {formatoPorcentaje(avance)} del plan con 3 días por delante</h2>
          <p className="text-[12.5px] text-muted-foreground">Ventas acumuladas de octubre contra el plan (+5% sobre septiembre)</p>
          <div className="mt-2 flex gap-4 text-[11.5px] font-bold" aria-hidden>
            <span className="flex items-center gap-1.5">
              <i className="inline-block h-[3px] w-3.5 rounded bg-chart-1" />
              Ventas
            </span>
            <span className="flex items-center gap-1.5">
              <i className="inline-block w-3.5 border-t-2 border-dashed border-taupe" />
              Plan
            </span>
          </div>
          <GraficaVentasPlan datos={ventasMes} />
        </section>
        <section className="flex w-[300px] flex-col gap-3 rounded-2xl border bg-card p-[18px]">
          <h2 className="text-lg font-semibold">Meta del mes</h2>
          <div className="relative mx-auto size-[132px]">
            <Anillo valor={avance} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="num text-[28px] font-extrabold tracking-tight">{formatoPorcentaje(avance)}</span>
              <span className="text-[11.5px] text-muted-foreground">del plan</span>
            </div>
          </div>
          <dl className="flex flex-col gap-1.5 rounded-xl bg-hueso-2 p-3 text-[12.5px]">
            <Fila etiqueta="Faltan" valor={formatoMoneda(PLAN_MES - actual)} />
            <Fila etiqueta="Por día (3 días)" valor={formatoMoneda((PLAN_MES - actual) / 3)} />
            <Fila etiqueta="Promedio diario" valor={formatoMoneda(promedio)} />
          </dl>
        </section>
      </div>

      <section className="flex flex-col gap-3 rounded-2xl border bg-card p-[18px]">
        <div>
          <h2 className="text-lg font-semibold">El mostrador trae 6 de cada 10 pesos</h2>
          <p className="text-[12.5px] text-muted-foreground">Ventas por canal · octubre</p>
        </div>
        {ventasPorCanal.map((c) => (
          <div key={c.canal} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-[12.5px]">
              <b className="flex-1">{c.canal}</b>
              <b className="num">{formatoMoneda(c.monto)}</b>
              <span className="num w-9 text-right text-[11.5px] text-muted-foreground">{formatoPorcentaje(c.monto / totalCanales)}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-[#efe9e1]">
              <div className="h-full rounded-full bg-chart-1" style={{ width: `${(c.monto / maxCanal) * 100}%` }} />
            </div>
          </div>
        ))}
      </section>
    </>
  )
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex">
      <dt className="flex-1 text-muted-foreground">{etiqueta}</dt>
      <dd className="num font-bold">{valor}</dd>
    </div>
  )
}

function Anillo({ valor, tam = 132, grosor = 12 }: { valor: number; tam?: number; grosor?: number }) {
  const r = (tam - grosor) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={tam} height={tam} viewBox={`0 0 ${tam} ${tam}`} role="img" aria-label={`${Math.round(valor * 100)}% del plan`}>
      <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke="#efe9e1" strokeWidth={grosor} />
      <circle
        cx={tam / 2}
        cy={tam / 2}
        r={r}
        fill="none"
        stroke="var(--chart-1)"
        strokeWidth={grosor}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(valor, 1))}
        transform={`rotate(-90 ${tam / 2} ${tam / 2})`}
      />
    </svg>
  )
}
