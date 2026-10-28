import { Hammer } from "lucide-react"

import { PageHeader } from "@/components/app/page-header"

/** Pantalla provisional de un módulo que todavía no se construye. */
export function ModuloPendiente({ titulo, descripcion, semana }: { titulo: string; descripcion: string; semana: number }) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader ruta={[["Inicio", "/inicio"], [titulo]]} titulo={titulo} descripcion={descripcion} />
      <div className="flex items-start gap-3 rounded-2xl border bg-card p-5">
        <span className="inline-flex size-9 items-center justify-center rounded-[10px] bg-hueso text-[#5c544c]">
          <Hammer className="size-[18px]" aria-hidden />
        </span>
        <div>
          <b>En construcción · semana {semana}</b>
          <p className="mt-1 text-sm text-muted-foreground">
            El diseño de esta pantalla ya está en el wireframe. Se construye en la semana {semana} del plan.
          </p>
        </div>
      </div>
    </div>
  )
}
