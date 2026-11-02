"use client"

import { useState, useTransition } from "react"
import { Plus, X } from "lucide-react"

import { cambiarEtiquetasVenta } from "../actions"

/** Etiquetas de la venta (p. ej. "Mayoreo", "Regalo"). Solo el administrador las cambia. */
export function EtiquetasVenta({ ventaId, folio, iniciales, editable }: { ventaId: string; folio: string; iniciales: string[]; editable: boolean }) {
  const [etiquetas, setEtiquetas] = useState(iniciales)
  const [nueva, setNueva] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [guardando, iniciar] = useTransition()

  function guardar(lista: string[]) {
    const antes = etiquetas
    setEtiquetas(lista)
    setError(null)
    iniciar(async () => {
      const r = await cambiarEtiquetasVenta(ventaId, folio, lista)
      if (r?.error) {
        setEtiquetas(antes)
        setError(r.error)
      }
    })
  }
  function agregar() {
    const e = nueva.trim()
    setNueva("")
    if (e && !etiquetas.includes(e)) guardar([...etiquetas, e])
  }

  if (!editable && etiquetas.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-busy={guardando}>
      {etiquetas.map((e) => (
        <span key={e} className="inline-flex items-center gap-1 rounded-full bg-hueso px-2.5 py-0.5 text-[12px] font-semibold">
          {e}
          {editable && (
            <button type="button" aria-label={`Quitar etiqueta ${e}`} onClick={() => guardar(etiquetas.filter((x) => x !== e))} className="text-muted-foreground hover:text-foreground">
              <X className="size-3" aria-hidden />
            </button>
          )}
        </span>
      ))}
      {editable && (
        <form
          onSubmit={(ev) => {
            ev.preventDefault()
            agregar()
          }}
          className="inline-flex items-center gap-1"
        >
          <input
            value={nueva}
            onChange={(ev) => setNueva(ev.target.value)}
            maxLength={30}
            placeholder="Agregar etiqueta"
            aria-label="Nueva etiqueta"
            className="h-7 w-32 rounded-full border bg-card px-2.5 text-[12px]"
          />
          <button type="submit" aria-label="Agregar etiqueta" disabled={!nueva.trim()} className="inline-flex size-7 items-center justify-center rounded-full border bg-card disabled:opacity-40">
            <Plus className="size-3.5" aria-hidden />
          </button>
        </form>
      )}
      {error && <span role="alert" className="text-[12px] font-semibold text-crit">{error}</span>}
    </div>
  )
}
