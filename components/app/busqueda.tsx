"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { Loader2, Search } from "lucide-react"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

import { buscarGlobal, type Resultado } from "@/app/(app)/buscar"

/** Buscador global: clientes, folios, red, lotes y productos. Se abre con ⌘K / Ctrl+K. */
export function Busqueda() {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [q, setQ] = useState("")
  const [res, setRes] = useState<Resultado[]>([])
  const [activo, setActivo] = useState(0)
  const [buscando, iniciar] = useTransition()

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setAbierto(true)
      }
    }
    window.addEventListener("keydown", tecla)
    return () => window.removeEventListener("keydown", tecla)
  }, [])

  useEffect(() => {
    if (q.trim().length < 2) return
    const t = setTimeout(
      () =>
        iniciar(async () => {
          setRes(await buscarGlobal(q))
          setActivo(0)
        }),
      220,
    )
    return () => clearTimeout(t)
  }, [q])

  const visibles = q.trim().length >= 2 ? res : []
  function ir(r: Resultado) {
    setAbierto(false)
    setQ("")
    router.push(r.href)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[10px] border bg-card px-3 text-[13px] text-muted-foreground sm:max-w-[380px]"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="truncate">Buscar clientes, ventas, lotes…</span>
        <kbd className="ml-auto hidden rounded-[5px] border bg-hueso-2 px-1.5 text-[11px] sm:inline">⌘K</kbd>
      </button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="top-[12%] translate-y-0 gap-0 p-0 sm:max-w-lg" showCloseButton={false}>
          <DialogTitle className="sr-only">Buscar</DialogTitle>
          <div className="flex items-center gap-2 border-b px-3.5">
            <Search className="size-4 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault()
                  setActivo((a) => Math.min(a + 1, visibles.length - 1))
                } else if (e.key === "ArrowUp") {
                  e.preventDefault()
                  setActivo((a) => Math.max(a - 1, 0))
                } else if (e.key === "Enter" && visibles[activo]) ir(visibles[activo])
              }}
              placeholder="Nombre, WhatsApp, folio, lote o producto"
              aria-label="Buscar en el CRM"
              aria-controls="resultados-busqueda"
              className="h-12 flex-1 bg-transparent text-[15px] outline-none"
            />
            {buscando && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Buscando" />}
          </div>
          <ul id="resultados-busqueda" role="listbox" aria-label="Resultados" className="max-h-[60vh] overflow-y-auto p-1.5">
            {visibles.map((r, i) => (
              <li key={`${r.grupo}-${r.href}-${i}`} role="option" aria-selected={i === activo}>
                {(i === 0 || visibles[i - 1].grupo !== r.grupo) && <span className="block px-2.5 pt-2 pb-1 text-[10.5px] font-bold tracking-[0.08em] text-muted-foreground uppercase">{r.grupo}</span>}
                <button type="button" onMouseEnter={() => setActivo(i)} onClick={() => ir(r)} className={cn("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left", i === activo && "bg-hueso")}>
                  <b className="flex-1 truncate text-[13.5px]">{r.titulo}</b>
                  <span className="truncate text-[12px] text-muted-foreground">{r.detalle}</span>
                </button>
              </li>
            ))}
            {q.trim().length >= 2 && !buscando && !visibles.length && <li className="px-3 py-6 text-center text-[13px] text-muted-foreground">Sin resultados para “{q.trim()}”.</li>}
            {q.trim().length < 2 && <li className="px-3 py-6 text-center text-[13px] text-muted-foreground">Escribe al menos 2 letras.</li>}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}
