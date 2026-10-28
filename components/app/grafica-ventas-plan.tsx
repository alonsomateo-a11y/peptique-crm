"use client"

import { Area } from "@/components/charts/area"
import { AreaChart } from "@/components/charts/area-chart"
import { Grid } from "@/components/charts/grid"
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip"
import { XAxis } from "@/components/charts/x-axis"

/** Ventas acumuladas del mes (Sage profundo) contra el plan (Taupe punteado). */
export function GraficaVentasPlan({ datos }: { datos: { date: Date; ventas: number; plan: number }[] }) {
  return (
    <AreaChart data={datos} xDataKey="date" aspectRatio="5 / 2" margin={{ top: 16, right: 16, bottom: 32, left: 16 }}>
      <Grid horizontal numTicksRows={4} />
      <Area dataKey="plan" fill="var(--taupe)" stroke="var(--taupe)" fillOpacity={0} strokeWidth={1.6} dashFromIndex={0} showHighlight={false} />
      <Area dataKey="ventas" fill="var(--chart-1)" stroke="var(--chart-1)" fillOpacity={0.26} strokeWidth={2.2} fadeEdges />
      <XAxis numTicks={6} />
      <ChartTooltip showCrosshair showDatePill />
    </AreaChart>
  )
}
