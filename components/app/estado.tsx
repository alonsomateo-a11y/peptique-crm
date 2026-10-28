import { AlertTriangle, Box, Check } from "lucide-react"

import { cn } from "@/lib/utils"

export type TipoEstado = "ok" | "warn" | "crit" | "neutro"

const ESTILOS: Record<TipoEstado, string> = {
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  crit: "bg-crit-bg text-crit",
  neutro: "bg-hueso text-[#5c544c]",
}

const ICONOS: Record<TipoEstado, typeof Check> = { ok: Check, warn: AlertTriangle, crit: AlertTriangle, neutro: Box }

/** Estado siempre con ícono + texto; nunca solo color (WCAG 1.4.1). */
export function Estado({ tipo, children, className }: { tipo: TipoEstado; children: React.ReactNode; className?: string }) {
  const Icono = ICONOS[tipo]
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-semibold whitespace-nowrap",
        ESTILOS[tipo],
        className,
      )}
    >
      <Icono className="size-3" strokeWidth={2.5} aria-hidden />
      {children}
    </span>
  )
}
