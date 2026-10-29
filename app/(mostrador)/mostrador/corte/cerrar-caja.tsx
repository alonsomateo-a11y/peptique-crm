"use client"

import { useRef, useState, useTransition } from "react"
import { AlertTriangle, Check, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Input } from "@/components/ui/input"
import { formatoMonedaCentavos } from "@/lib/format"
import { cn } from "@/lib/utils"

import { cerrarCaja } from "../actions"

const MANTENER_MS = 1200

export function CerrarCaja({ cajaId, esperado }: { cajaId: string; esperado: number }) {
  const [contado, setContado] = useState("")
  const [progreso, setProgreso] = useState(false)
  const [cerrando, iniciar] = useTransition()
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null)
  const valor = Number(contado.replace(/[$,\s]/g, ""))
  const capturado = contado.trim() !== "" && Number.isFinite(valor)
  const diferencia = capturado ? Math.round((valor - esperado) * 100) / 100 : 0

  function empezar() {
    if (!capturado || cerrando) return
    setProgreso(true)
    reloj.current = setTimeout(() => {
      setProgreso(false)
      iniciar(async () => {
        const r = await cerrarCaja(cajaId, valor)
        if (r.error) toast.error(r.error)
        else toast.success(r.diferencia ? `Caja cerrada con diferencia de ${formatoMonedaCentavos(r.diferencia)}` : "Caja cerrada sin diferencia")
      })
    }, MANTENER_MS)
  }
  function soltar() {
    if (reloj.current) clearTimeout(reloj.current)
    setProgreso(false)
  }

  return (
    <>
      <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold">
        Contaste
        <Input inputMode="decimal" value={contado} onChange={(e) => setContado(e.target.value)} placeholder="$0.00" className="num h-14 bg-card text-[22px] font-extrabold" />
      </label>
      {capturado && (
        <div role="status" className={cn("flex items-center gap-3 rounded-2xl px-4 py-3", diferencia === 0 ? "bg-ok-bg text-ok" : "bg-warn-bg text-warn")}>
          <span className="flex flex-1 items-center gap-2 font-bold">
            {diferencia === 0 ? <Check className="size-4" strokeWidth={2.6} aria-hidden /> : <AlertTriangle className="size-4" aria-hidden />}
            Diferencia
          </span>
          <b className="num">{formatoMonedaCentavos(diferencia)}</b>
        </div>
      )}
      <button
        type="button"
        disabled={!capturado || cerrando}
        onPointerDown={empezar}
        onPointerUp={soltar}
        onPointerLeave={soltar}
        onKeyDown={(e) => {
          if ((e.key === " " || e.key === "Enter") && !e.repeat) {
            e.preventDefault()
            empezar()
          }
        }}
        onKeyUp={soltar}
        aria-describedby="ayuda-cerrar"
        className="relative h-14 overflow-hidden rounded-2xl border border-[#ebc5c1] bg-card font-extrabold text-crit select-none disabled:opacity-50"
      >
        <span className={cn("absolute inset-y-0 left-0 bg-crit-bg", progreso ? "w-full transition-[width] ease-linear" : "w-0")} style={{ transitionDuration: progreso ? `${MANTENER_MS}ms` : "0ms" }} aria-hidden />
        <span className="relative inline-flex items-center gap-2">
          {cerrando && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Mantén presionado para cerrar caja
        </span>
      </button>
      <span id="ayuda-cerrar" className="text-center text-[11.5px] text-muted-foreground">
        Mantén presionado (o la tecla Espacio) para evitar cerrar por error.
      </span>
    </>
  )
}
