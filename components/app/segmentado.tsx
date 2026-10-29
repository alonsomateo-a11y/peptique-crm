"use client"

import { cn } from "@/lib/utils"

/** Control segmentado con radios nativos: funciona dentro de <form> y con teclado. */
export function Segmentado<T extends string>({
  name,
  opciones,
  valor,
  onChange,
  deshabilitadas = [],
  etiqueta,
}: {
  name: string
  opciones: { valor: T; texto: string }[]
  valor: T
  onChange?: (v: T) => void
  deshabilitadas?: T[]
  etiqueta: string
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="inline-flex w-fit rounded-[11px] bg-hueso p-1">
      {opciones.map((o) => {
        const off = deshabilitadas.includes(o.valor)
        return (
          <label
            key={o.valor}
            className={cn(
              "relative cursor-pointer rounded-lg px-3.5 py-1.5 text-[13px] font-semibold text-[#5c544c] has-checked:bg-card has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-3 has-focus-visible:ring-ring",
              off && "cursor-not-allowed opacity-45",
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.valor}
              checked={valor === o.valor}
              disabled={off}
              onChange={() => onChange?.(o.valor)}
              className="sr-only"
            />
            {o.texto}
          </label>
        )
      })}
    </div>
  )
}
