"use client"

import { usePathname, useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Loader2, Search } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PERFIL_INFO, PERFILES } from "@/lib/perfiles"

import { NOMBRE_AREA } from "./areas"
import type { Filtros } from "./consulta"


type Opcion = { valor: string; texto: string }
const TODOS = "todos"

export function FiltrosActividad({
  filtros,
  opciones,
}: {
  filtros: Filtros
  opciones: { productos: Opcion[]; personas: Opcion[]; meses: Opcion[] }
}) {
  const router = useRouter()
  const ruta = usePathname()
  const [cargando, iniciar] = useTransition()
  const [q, setQ] = useState(filtros.q ?? "")

  function aplicar(clave: keyof Filtros, valor: string | undefined) {
    const p = new URLSearchParams(Object.entries({ ...filtros, [clave]: valor }).filter(([, v]) => v && v !== TODOS) as [string, string][])
    iniciar(() => router.replace(`${ruta}${p.size ? `?${p}` : ""}`, { scroll: false }))
  }

  const selects: { clave: keyof Filtros; etiqueta: string; opciones: Opcion[] }[] = [
    { clave: "producto", etiqueta: "Producto", opciones: opciones.productos },
    { clave: "persona", etiqueta: "Persona", opciones: opciones.personas },
    { clave: "perfil", etiqueta: "Perfil", opciones: PERFILES.map((p) => ({ valor: p, texto: PERFIL_INFO[p].nombre })) },
    { clave: "area", etiqueta: "Área", opciones: Object.entries(NOMBRE_AREA).map(([valor, texto]) => ({ valor, texto })) },
    { clave: "mes", etiqueta: "Mes", opciones: opciones.meses },
  ]

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        role="search"
        className="relative w-full sm:w-56"
        onSubmit={(e) => {
          e.preventDefault()
          aplicar("q", q.trim() || undefined)
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-taupe" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => q.trim() !== (filtros.q ?? "") && aplicar("q", q.trim() || undefined)} placeholder="Buscar en lo que pasó" aria-label="Buscar en la actividad" className="h-9 bg-card pl-9" />
      </form>
      {selects.map((s) => (
        <Select key={s.clave} value={filtros[s.clave] ?? TODOS} onValueChange={(v) => aplicar(s.clave, v)}>
          <SelectTrigger aria-label={s.etiqueta} className="h-9 bg-card data-[activo=true]:border-espresso" data-activo={!!filtros[s.clave]}>
            <span className="text-muted-foreground">{s.etiqueta}</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos</SelectItem>
            {s.opciones.map((o) => (
              <SelectItem key={o.valor} value={o.valor}>
                {o.texto}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
      {cargando && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Cargando" />}
    </div>
  )
}
