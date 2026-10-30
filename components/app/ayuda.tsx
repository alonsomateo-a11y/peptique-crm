"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Info } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * “¿Cómo se calcula?”: explica de dónde sale un número. Es un botón (no un tooltip) para que
 * funcione con el dedo en el celular y con el teclado.
 */
export function Ayuda({ texto, className }: { texto: string; className?: string }) {
  const [abierta, setAbierta] = useState(false)
  const id = useId()
  const caja = useRef<HTMLSpanElement>(null)

  // Se cierra con Esc o al tocar fuera.
  useEffect(() => {
    if (!abierta) return
    const fuera = (e: PointerEvent) => !caja.current?.contains(e.target as Node) && setAbierta(false)
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAbierta(false)
    document.addEventListener("pointerdown", fuera)
    document.addEventListener("keydown", tecla)
    return () => {
      document.removeEventListener("pointerdown", fuera)
      document.removeEventListener("keydown", tecla)
    }
  }, [abierta])

  return (
    <span ref={caja} className={cn("relative z-10", className)}>
      <button
        type="button"
        aria-label="Cómo se calcula"
        aria-expanded={abierta}
        aria-controls={id}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setAbierta((v) => !v)
        }}
        className={cn("inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-hueso hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none", abierta && "bg-hueso text-foreground")}
      >
        <Info className="size-3.5" aria-hidden />
      </button>
      {abierta && (
        <span id={id} role="note" className="absolute top-7 right-0 z-20 w-64 rounded-xl border bg-card p-3 text-[12px] leading-snug font-normal text-foreground shadow-lg">
          {texto}
        </span>
      )}
    </span>
  )
}
