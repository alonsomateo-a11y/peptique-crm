"use client"

import { useActionState, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { formatoCuando } from "@/lib/format"
import { cn } from "@/lib/utils"

import { agregarNota } from "../actions"
import { iniciales, type Resultado } from "../tipos"

export type Evento = { id: string; tipo: "ventas" | "pagos" | "notas" | "avisos" | "otros"; cuando: string; quien: string | null; texto: string }

const FILTROS = [
  { valor: "todo", texto: "Todo" },
  { valor: "ventas", texto: "Ventas" },
  { valor: "pagos", texto: "Pagos" },
  { valor: "notas", texto: "Notas" },
  { valor: "avisos", texto: "Avisos" },
] as const

export function ActividadCliente({ clienteId, eventos }: { clienteId: string; eventos: Evento[] }) {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["valor"]>("todo")
  const [nota, setNota] = useState("")
  const [res, enviar, enviando] = useActionState(async (prev: Resultado, form: FormData) => {
    const r = await agregarNota(prev, form)
    if (r?.ok) {
      setNota("")
      toast.success("Nota agregada")
    }
    return r
  }, null)
  const visibles = filtro === "todo" ? eventos : eventos.filter((e) => e.tipo === filtro)

  return (
    <section aria-labelledby="titulo-actividad" className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="titulo-actividad" className="flex-1 text-xl font-medium">
          Actividad
        </h2>
        <div role="tablist" aria-label="Filtrar actividad" className="inline-flex rounded-[11px] bg-hueso p-1">
          {FILTROS.map((f) => (
            <button
              key={f.valor}
              role="tab"
              type="button"
              aria-selected={filtro === f.valor}
              onClick={() => setFiltro(f.valor)}
              className={cn("rounded-lg px-3 py-1 text-[12.5px] font-semibold text-[#5c544c]", filtro === f.valor && "bg-card text-foreground shadow-sm")}
            >
              {f.texto}
            </button>
          ))}
        </div>
      </div>

      <form action={enviar} className="flex flex-col gap-2">
        <input type="hidden" name="cliente_id" value={clienteId} />
        <Textarea name="nota" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} rows={2} placeholder="Agregar una nota interna (ej. prefiere que le escriban por la tarde)" aria-label="Nota interna" />
        {res?.errores?.nota && <span className="text-[11.5px] font-semibold text-crit">{res.errores.nota}</span>}
        <Button type="submit" size="sm" variant="outline" className="self-end" disabled={enviando || !nota.trim()}>
          {enviando && <Loader2 className="animate-spin" aria-hidden />}
          Guardar nota
        </Button>
      </form>

      <ol className="divide-y">
        {visibles.map((e) => (
          <li key={e.id} className="flex items-start gap-3 py-2.5">
            <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-bruma text-[10px] font-extrabold">{e.quien ? iniciales(e.quien) : "⚙"}</span>
            <p className="flex-1 text-[13.5px]">
              <b className="font-semibold">{e.quien ?? "Sistema"}</b> {e.texto}
            </p>
            <time dateTime={e.cuando} className="shrink-0 text-[12px] whitespace-nowrap text-muted-foreground">
              {formatoCuando(new Date(e.cuando))}
            </time>
          </li>
        ))}
        {visibles.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">Sin actividad todavía.</li>}
      </ol>
    </section>
  )
}
