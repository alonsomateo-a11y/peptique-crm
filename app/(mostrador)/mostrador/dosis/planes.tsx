"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Segmentado } from "@/components/app/segmentado"
import { Button } from "@/components/ui/button"
import { formatoMoneda } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Metodo } from "@/lib/ventas"

import { aplicarDosisMostrador, cobrarDosisMostrador } from "../actions"

export type Plan = { ventaId: string; folio: string; cliente: string; producto: string; de: number; cuota: number; pagadas: number; aplicadas: number[] }

export function PlanesDosis({ planes }: { planes: Plan[] }) {
  if (!planes.length) return <p className="rounded-2xl border bg-card px-4 py-8 text-center text-[13px] text-muted-foreground">No hay planes por dosis activos.</p>
  return (
    <div className="flex flex-col gap-3">
      {planes.map((p) => (
        <TarjetaPlan key={p.ventaId} plan={p} />
      ))}
    </div>
  )
}

function TarjetaPlan({ plan }: { plan: Plan }) {
  const [cobrando, setCobrando] = useState(false)
  const [metodo, setMetodo] = useState<Metodo>("efectivo")
  const [ocupado, iniciar] = useTransition()
  const siguienteAplicar = Array.from({ length: plan.pagadas }, (_, i) => i + 1).find((n) => !plan.aplicadas.includes(n))
  const siguienteCobrar = plan.pagadas < plan.de ? plan.pagadas + 1 : null

  return (
    <section className="flex flex-col gap-2.5 rounded-2xl border bg-card p-3.5" aria-label={`Plan de ${plan.cliente}`}>
      <div className="flex items-center gap-2">
        <b className="flex-1 text-[15px]">{plan.cliente}</b>
        <span className="text-[12px] text-muted-foreground">{plan.producto}</span>
      </div>
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: plan.de }, (_, i) => i + 1).map((n) => (
          <i key={n} className={cn("h-2.5 w-7 rounded-full", plan.aplicadas.includes(n) ? "bg-chart-1" : n <= plan.pagadas ? "bg-[#e8c77d]" : "bg-border")} />
        ))}
      </div>
      <span className="text-[12px] text-muted-foreground">
        {plan.pagadas} de {plan.de} pagadas · {plan.aplicadas.length} aplicadas · {formatoMoneda(plan.cuota)} por dosis · {plan.folio}
      </span>
      {cobrando && siguienteCobrar && (
        <Segmentado
          name={`metodo-${plan.ventaId}`}
          etiqueta="Método de pago"
          valor={metodo}
          onChange={setMetodo}
          opciones={[
            { valor: "efectivo", texto: "Efectivo" },
            { valor: "tarjeta", texto: "Tarjeta" },
            { valor: "transferencia", texto: "Transf." },
          ]}
        />
      )}
      <div className="flex gap-2">
        {siguienteAplicar && (
          <Button
            className="h-11 flex-1"
            disabled={ocupado}
            onClick={() =>
              iniciar(async () => {
                const r = await aplicarDosisMostrador(plan.ventaId, siguienteAplicar)
                if (r.error) toast.error(r.error)
                else toast.success(`Dosis ${siguienteAplicar} aplicada a ${plan.cliente}`)
              })
            }
          >
            Aplicar dosis {siguienteAplicar}
          </Button>
        )}
        {siguienteCobrar && (
          <Button
            variant={cobrando ? "default" : "outline"}
            className="h-11 flex-1"
            disabled={ocupado}
            onClick={() => {
              if (!cobrando) return setCobrando(true)
              iniciar(async () => {
                const r = await cobrarDosisMostrador(plan.ventaId, metodo)
                if (r.error) toast.error(r.error)
                else {
                  toast.success(`Dosis ${r.numero} cobrada · ${formatoMoneda(r.monto ?? 0)}`)
                  setCobrando(false)
                }
              })
            }}
          >
            {ocupado && <Loader2 className="animate-spin" aria-hidden />}
            {cobrando ? `Cobrar ${formatoMoneda(plan.cuota)}` : `Cobrar dosis ${siguienteCobrar}`}
          </Button>
        )}
      </div>
    </section>
  )
}
