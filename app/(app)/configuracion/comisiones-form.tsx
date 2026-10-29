"use client"

import { useActionState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { enviarSinLimpiar } from "@/lib/formulario"

import { guardarComisiones } from "./actions"
import type { Resultado } from "./tipos"

const FILAS = [
  { name: "directa", titulo: "Venta directa de un distribuidor o comisionista", detalle: "a quien vendió" },
  { name: "equipo", titulo: "… y al distribuidor de ese comisionista", detalle: "no recibe otro 13%" },
] as const

export function ComisionesForm({ directa, equipo }: { directa: number; equipo: number }) {
  const [estado, enviar, enviando] = useActionState(async (prev: Resultado, form: FormData) => {
    const r = await guardarComisiones(prev, form)
    if (r?.ok) toast.success("Comisiones guardadas")
    return r
  }, null)
  const valores = { directa, equipo }
  return (
    <form onSubmit={enviarSinLimpiar(enviar)} className="flex flex-col gap-3">
      {FILAS.map((f) => (
        <div key={f.name} className="flex items-center gap-3 text-[13.5px]">
          <label htmlFor={`comision-${f.name}`} className="flex-1">
            <b className="font-semibold">{f.titulo}</b>
            <span className="block text-[11.5px] text-muted-foreground">{f.detalle}</span>
          </label>
          <div className="relative w-24">
            <Input id={`comision-${f.name}`} name={f.name} inputMode="decimal" defaultValue={valores[f.name]} className="num pr-7 text-right font-bold" />
            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[12px] text-muted-foreground">%</span>
          </div>
        </div>
      ))}
      {estado?.error && (
        <p role="alert" className="text-[12px] font-semibold text-crit">
          {estado.error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <span className="flex-1 text-[11.5px] text-muted-foreground">Fijas para todos. Se calculan sobre la venta sin IVA.</span>
        <Button type="submit" disabled={enviando}>
          {enviando && <Loader2 className="animate-spin" aria-hidden />}
          Guardar
        </Button>
      </div>
    </form>
  )
}
