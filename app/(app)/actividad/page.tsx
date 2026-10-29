import type { Metadata } from "next"
import Link from "next/link"
import { Download, X } from "lucide-react"

import { PageHeader } from "@/components/app/page-header"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatoCuando } from "@/lib/format"
import { PERFIL_INFO } from "@/lib/perfiles"
import { exigirAdmin, iniciales } from "@/lib/sesion"
import { crearClienteServidor } from "@/lib/supabase/server"

import { AREAS, buscarMovimientos, LIMITE, leerFiltros, type Filtros } from "./consulta"
import { NOMBRE_AREA } from "./areas"
import { FiltrosActividad } from "./filtros"

export const metadata: Metadata = { title: "Actividad" }

const MESES = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" })

export default async function Actividad({ searchParams }: PageProps<"/actividad">) {
  await exigirAdmin()
  const filtros = leerFiltros(await searchParams)
  const supabase = await crearClienteServidor()
  const [{ filas, total }, productos, personas] = await Promise.all([
    buscarMovimientos(filtros),
    supabase.from("productos").select("id, nombre, presentacion").order("nombre"),
    supabase.from("personas").select("id, nombre").order("nombre"),
  ])

  const hoy = new Date()
  const meses = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1))
    const valor = d.toISOString().slice(0, 7)
    return { valor, texto: MESES.format(d).replace(/^./, (c) => c.toUpperCase()) }
  })
  const opciones = {
    productos: (productos.data ?? []).map((p) => ({ valor: p.id, texto: `${p.nombre} ${p.presentacion}` })),
    personas: (personas.data ?? []).map((p) => ({ valor: p.id, texto: p.nombre })),
    meses,
  }

  const chips: { clave: keyof Filtros; texto: string }[] = []
  if (filtros.q) chips.push({ clave: "q", texto: `“${filtros.q}”` })
  if (filtros.producto) chips.push({ clave: "producto", texto: `Producto: ${opciones.productos.find((p) => p.valor === filtros.producto)?.texto ?? "—"}` })
  if (filtros.persona) chips.push({ clave: "persona", texto: `Persona: ${opciones.personas.find((p) => p.valor === filtros.persona)?.texto ?? "—"}` })
  if (filtros.perfil) chips.push({ clave: "perfil", texto: `Perfil: ${PERFIL_INFO[filtros.perfil].nombre}` })
  if (filtros.area) chips.push({ clave: "area", texto: `Área: ${NOMBRE_AREA[filtros.area as (typeof AREAS)[number]]}` })
  if (filtros.mes) chips.push({ clave: "mes", texto: meses.find((m) => m.valor === filtros.mes)?.texto ?? filtros.mes })

  const sin = (clave: keyof Filtros) => {
    const p = new URLSearchParams(Object.entries(filtros).filter(([k, v]) => k !== clave && v) as [string, string][])
    return `/actividad${p.size ? `?${p}` : ""}`
  }
  const params = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v) as [string, string][])

  return (
    <>
      <PageHeader
        ruta={[["Inicio", "/inicio"], ["Actividad"]]}
        titulo="Actividad"
        descripcion="Todo lo que pasa en el mostrador, la red y el inventario"
        acciones={
          <Button variant="outline" size="lg" asChild>
            <a href={`/actividad/descargar${params.size ? `?${params}` : ""}`} download>
              <Download aria-hidden />
              Descargar
            </a>
          </Button>
        }
      />

      <FiltrosActividad filtros={filtros} opciones={opciones} />

      <div className="flex flex-wrap items-center gap-2 text-[12px]" aria-live="polite">
        {chips.length > 0 && <span className="font-bold text-muted-foreground">Filtros activos</span>}
        {chips.map((c) => (
          <Link key={c.clave} href={sin(c.clave)} className="inline-flex items-center gap-1.5 rounded-full border bg-card py-0.5 pr-2 pl-2.5 font-semibold hover:border-espresso">
            {c.texto}
            <X className="size-3" aria-label="Quitar filtro" />
          </Link>
        ))}
        <span className="text-muted-foreground">
          {chips.length > 0 && "· "}
          {total === 1 ? "1 resultado" : `${total.toLocaleString("es-MX")} resultados`}
          {total > LIMITE && ` · se muestran los ${LIMITE} más recientes`}
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-hueso-2 hover:bg-hueso-2">
              <TableHead>Cuándo</TableHead>
              <TableHead>Quién</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>Área</TableHead>
              <TableHead>Qué pasó</TableHead>
              <TableHead>Producto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="text-[12.5px] whitespace-nowrap text-muted-foreground">
                  <time dateTime={f.creado_en}>{formatoCuando(new Date(f.creado_en))}</time>
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <span className="inline-flex size-6 items-center justify-center rounded-full bg-bruma text-[9.5px] font-extrabold">{f.persona ? iniciales(f.persona) : "⚙"}</span>
                    <b className="text-[13px] font-semibold">{f.persona ?? "Sistema"}</b>
                  </span>
                </TableCell>
                <TableCell>
                  {f.perfil && <span className="rounded-full bg-hueso px-2.5 py-0.5 text-[11.5px] font-semibold text-[#5c544c]">{PERFIL_INFO[f.perfil].nombre}</span>}
                </TableCell>
                <TableCell className="text-[13px]">{NOMBRE_AREA[f.area as (typeof AREAS)[number]] ?? f.area}</TableCell>
                <TableCell className="max-w-md text-[13px] whitespace-normal">{f.accion}</TableCell>
                <TableCell className="text-[12.5px] text-muted-foreground">{f.producto ?? "—"}</TableCell>
              </TableRow>
            ))}
            {filas.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  {chips.length ? "Nada coincide con estos filtros." : "Todavía no hay actividad registrada."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
