"use client"

import { useActionState, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { enviarSinLimpiar } from "@/lib/formulario"

import { guardarWaiver } from "./actions"
import type { Resultado } from "./tipos"

export function WaiverForm({ pedir: pedirInicial, texto, esBase }: { pedir: boolean; texto: string; esBase: boolean }) {
  const [pedir, setPedir] = useState(pedirInicial)
  const [estado, enviar, enviando] = useActionState(async (prev: Resultado, form: FormData) => {
    const r = await guardarWaiver(prev, form)
    if (r?.ok) toast.success("Waiver guardado")
    return r
  }, null)
  return (
    <form onSubmit={enviarSinLimpiar(enviar)} className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-[13.5px]">
        <label htmlFor="waiver-pedir" className="flex-1">
          <b className="font-semibold">Pedir firma del waiver en la primera compra</b>
          <span className="block text-[11.5px] text-muted-foreground">
            {pedir ? "El mostrador, el admin comercial y la red no pueden venderle a un paciente nuevo sin la firma." : "Se vende sin pedir firma. Los waivers ya firmados se conservan."}
          </span>
        </label>
        <Switch id="waiver-pedir" name="pedir" checked={pedir} onCheckedChange={setPedir} aria-label="Pedir firma del waiver en la primera compra" />
      </div>
      <label htmlFor="waiver-texto" className="text-[12.5px] font-semibold">
        Texto que lee y acepta el cliente
      </label>
      <Textarea id="waiver-texto" name="texto" defaultValue={texto} rows={6} className="text-[13px]" aria-invalid={!!estado?.error} aria-describedby={estado?.error ? "waiver-error" : undefined} />
      {esBase && <p className="rounded-lg bg-warn-bg px-3 py-2 text-[12px] font-semibold text-warn">Texto provisional. Cámbienlo por el que apruebe su abogado.</p>}
      {estado?.error && (
        <p id="waiver-error" role="alert" className="text-[12px] font-semibold text-crit">
          {estado.error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <span className="flex-1 text-[11.5px] text-muted-foreground">Los pedidos de médicos y distribuidores nunca lo piden.</span>
        <Button type="submit" disabled={enviando}>
          {enviando && <Loader2 className="animate-spin" aria-hidden />}
          Guardar
        </Button>
      </div>
    </form>
  )
}
