import { cn } from "@/lib/utils"

/** Barra de margen: verde si es positivo, rojo si se pierde dinero. */
export function BarraMargen({ valor }: { valor: number | null }) {
  if (valor === null) return <span className="text-[12px] text-muted-foreground">—</span>
  const negativo = valor < 0
  return (
    <div className="flex items-center gap-2">
      <div className="h-[7px] flex-1 overflow-hidden rounded-full bg-hueso" aria-hidden>
        <i className={cn("block h-full rounded-full", negativo ? "bg-crit" : "bg-chart-1")} style={{ width: `${Math.min(Math.max(Math.abs(valor), 4), 100)}%` }} />
      </div>
      <b className={cn("num w-10 text-right text-[12px]", negativo && "text-crit")}>{valor}%</b>
    </div>
  )
}
