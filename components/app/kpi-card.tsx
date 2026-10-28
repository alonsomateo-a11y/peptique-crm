import { ArrowDown, ArrowUp } from "lucide-react"

import { cn } from "@/lib/utils"

/** Tarjeta de KPI estilo metric-card: etiqueta, cambio, número, sparkline y contexto. */
export function KpiCard({
  etiqueta,
  valor,
  cambio,
  positivo = true,
  contexto,
  tendencia,
  className,
}: {
  etiqueta: string
  valor: string
  cambio?: string
  positivo?: boolean
  contexto?: string
  tendencia?: number[]
  className?: string
}) {
  const Flecha = positivo ? ArrowUp : ArrowDown
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col gap-1.5 rounded-2xl border bg-card px-[18px] py-4 shadow-[0_1px_2px_rgb(43_38_34/0.04)]", className)}>
      <div className="flex items-center gap-2">
        <span className="flex-1 text-xs font-semibold text-muted-foreground">{etiqueta}</span>
        {cambio && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-[7px] text-[11.5px] leading-5 font-bold",
              positivo ? "bg-ok-bg text-ok" : "bg-crit-bg text-crit",
            )}
          >
            <Flecha className="size-3" strokeWidth={2.6} aria-hidden />
            {cambio}
          </span>
        )}
      </div>
      <div className="flex items-end gap-2.5">
        <span className="num text-[25px] leading-tight font-bold tracking-tight whitespace-nowrap">{valor}</span>
        {tendencia && tendencia.length > 1 && <Sparkline valores={tendencia} className="ml-auto" />}
      </div>
      {contexto && <span className="text-[11.5px] text-muted-foreground">{contexto}</span>}
    </div>
  )
}

export function Sparkline({ valores, ancho = 78, alto = 30, className }: { valores: number[]; ancho?: number; alto?: number; className?: string }) {
  const max = Math.max(...valores)
  const min = Math.min(...valores)
  const pts = valores.map((v, i) => [
    (ancho * i) / (valores.length - 1),
    3 + (alto - 6) * (1 - (v - min) / (max - min || 1)),
  ])
  const linea = "M" + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L")
  const id = `sp-${valores.join("-").replace(/\./g, "")}`.slice(0, 40)
  return (
    <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} aria-hidden className={cn("shrink-0", className)}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--chart-1)" stopOpacity=".22" />
          <stop offset="1" stopColor="var(--chart-1)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${linea} L${ancho},${alto} L0,${alto} Z`} fill={`url(#${id})`} />
      <path d={linea} fill="none" stroke="var(--chart-1)" strokeWidth={1.8} strokeLinejoin="round" />
    </svg>
  )
}
