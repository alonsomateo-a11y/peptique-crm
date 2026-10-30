import { formatoCompacto, formatoMoneda, formatoPorcentaje } from "@/lib/format"
import { cn } from "@/lib/utils"

const nombreMes = (m: string, largo = false) =>
  new Intl.DateTimeFormat("es-MX", { month: largo ? "long" : "short", timeZone: "UTC" }).format(new Date(`${m}-15T00:00:00Z`)).replace(".", "")

/** Ventas por mes (barras) con el plan marcado con una raya punteada. Cada barra lleva su monto y su título. */
export function MesesContraPlan({ datos }: { datos: { mes: string; ventas: number; plan: number | null }[] }) {
  const max = Math.max(1, ...datos.flatMap((d) => [d.ventas, d.plan ?? 0])) * 1.12
  return (
    <figure className="flex flex-col gap-2">
      <div className="flex h-48 items-end gap-3 border-b px-1" role="img" aria-label={datos.map((d) => `${nombreMes(d.mes, true)}: ${formatoMoneda(d.ventas)}${d.plan ? ` de ${formatoMoneda(d.plan)} del plan` : ""}`).join("; ")}>
        {datos.map((d) => {
          const alto = (d.ventas / max) * 100
          const plan = d.plan ? (d.plan / max) * 100 : null
          const llego = d.plan ? d.ventas >= d.plan : true
          return (
            <div key={d.mes} className="relative flex h-full flex-1 flex-col justify-end" title={`${nombreMes(d.mes, true)} · ${formatoMoneda(d.ventas)}${d.plan ? ` · plan ${formatoMoneda(d.plan)}` : ""}`}>
              <span className="num mb-1 text-center text-[11px] font-extrabold">{d.ventas ? formatoCompacto(d.ventas) : ""}</span>
              <div className={cn("rounded-t-[4px]", llego ? "bg-chart-1" : "bg-[#8fb089]")} style={{ height: `${alto}%` }} />
              {plan !== null && <div className="absolute inset-x-[-4px] border-t-2 border-dashed border-taupe" style={{ bottom: `${plan}%` }} aria-hidden />}
            </div>
          )
        })}
      </div>
      <div className="flex gap-3 px-1">
        {datos.map((d) => (
          <span key={d.mes} className="flex-1 text-center text-[11.5px] font-semibold text-muted-foreground capitalize">
            {nombreMes(d.mes)}
          </span>
        ))}
      </div>
      <figcaption className="flex gap-4 text-[11.5px] font-bold">
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-2.5 rounded-[3px] bg-chart-1" />
          Ventas
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block w-3.5 border-t-2 border-dashed border-taupe" />
          Plan
        </span>
      </figcaption>
    </figure>
  )
}

/** Estado de resultados en cascada: de ingresos sin IVA a utilidad. */
export function Cascada({ sinIva, costo, comisiones, fijos, utilidad }: { sinIva: number; costo: number; comisiones: number; fijos: number; utilidad: number }) {
  const pasos = [
    { t: "Ingresos sin IVA", v: sinIva, tipo: "total" as const },
    { t: "Costo de producto", v: -costo, tipo: "resta" as const },
    { t: "Comisiones de la red", v: -comisiones, tipo: "resta" as const },
    { t: "Gastos fijos", v: -fijos, tipo: "resta" as const },
    { t: "Utilidad", v: utilidad, tipo: "total" as const },
  ]
  const max = Math.max(1, sinIva)
  let corrido = 0
  return (
    <div className="flex flex-col gap-2.5">
      {pasos.map((p, i) => {
        const desde = p.tipo === "total" ? 0 : corrido + p.v
        const ancho = Math.abs(p.v)
        if (i === 0) corrido = p.v
        else if (p.tipo === "resta") corrido += p.v
        return (
          <div key={p.t} className="flex items-center gap-3 text-[12.5px]">
            <span className={cn("w-40 shrink-0", p.tipo === "total" && "font-bold")}>{p.t}</span>
            <div className="relative h-4 flex-1 rounded bg-hueso-2" aria-hidden>
              <i
                className={cn("absolute inset-y-0 rounded-[4px]", p.tipo === "total" ? (p.v < 0 ? "bg-crit" : "bg-chart-1") : "bg-[#d8cfc3]")}
                style={{ left: `${(Math.max(desde, 0) / max) * 100}%`, width: `${Math.min((ancho / max) * 100, 100)}%` }}
              />
            </div>
            <b className={cn("num w-24 text-right", p.v < 0 && p.tipo === "total" && "text-crit")}>
              {p.tipo === "resta" && p.v !== 0 ? "−" : ""}
              {formatoMoneda(Math.abs(p.v))}
            </b>
          </div>
        )
      })}
    </div>
  )
}

/** Barra horizontal de una parte contra el máximo, con texto (no solo color). */
export function BarraParte({ etiqueta, valor, maximo, total }: { etiqueta: string; valor: number; maximo: number; total: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-[12.5px]">
        <b className="flex-1">{etiqueta}</b>
        <b className="num">{formatoMoneda(valor)}</b>
        <span className="num w-10 text-right text-[11.5px] text-muted-foreground">{total ? formatoPorcentaje(valor / total) : "—"}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-[#efe9e1]" aria-hidden>
        <div className="h-full rounded-full bg-chart-1" style={{ width: `${maximo ? (valor / maximo) * 100 : 0}%` }} />
      </div>
    </div>
  )
}
