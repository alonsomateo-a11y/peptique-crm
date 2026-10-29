"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, FlaskConical, Plus, Search } from "lucide-react"

import { Estado } from "@/components/app/estado"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatoMoneda } from "@/lib/format"

import type { ProductoFila } from "./datos-cliente"
import { BarraMargen } from "./barra-margen"
import { ProductoDrawer } from "./producto-drawer"

type Orden = "margen_desc" | "margen_asc" | "nombre"
type FiltroEstado = "todos" | "visibles" | "ocultos" | "agotados"

const margenActual = (p: ProductoFila) => p.lotes[0]?.margen ?? null

export function ProductosVista({ productos, familias }: { productos: ProductoFila[]; familias: string[] }) {
  const [buscar, setBuscar] = useState("")
  const [familia, setFamilia] = useState("todas")
  const [estado, setEstado] = useState<FiltroEstado>("todos")
  const [orden, setOrden] = useState<Orden>("margen_desc")
  const [abierto, setAbierto] = useState(false)
  const [editando, setEditando] = useState<ProductoFila | null>(null)

  const filas = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    const lista = productos.filter(
      (p) =>
        (!q || `${p.nombre} ${p.presentacion} ${p.sku ?? ""}`.toLowerCase().includes(q)) &&
        (familia === "todas" || p.familia === familia) &&
        (estado === "todos" ||
          (estado === "visibles" && p.visible) ||
          (estado === "ocultos" && !p.visible) ||
          (estado === "agotados" && p.visible && p.piezas === 0)),
    )
    const m = (p: ProductoFila) => margenActual(p) ?? -Infinity
    return lista.sort((a, b) =>
      orden === "nombre"
        ? `${a.nombre} ${a.presentacion}`.localeCompare(`${b.nombre} ${b.presentacion}`, "es")
        : orden === "margen_desc"
          ? m(b) - m(a)
          : m(a) - m(b),
    )
  }, [productos, buscar, familia, estado, orden])

  function abrir(p: ProductoFila | null) {
    setEditando(p)
    setAbierto(true)
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-60">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-taupe" aria-hidden />
          <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar producto o SKU" aria-label="Buscar producto" className="h-9 bg-card pl-9" />
        </div>
        <Select value={familia} onValueChange={setFamilia}>
          <SelectTrigger aria-label="Familia" className="h-9 bg-card">
            <span className="text-muted-foreground">Familia</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem>
            {familias.map((f) => (
              <SelectItem key={f} value={f}>
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={estado} onValueChange={(v) => setEstado(v as FiltroEstado)}>
          <SelectTrigger aria-label="Estado" className="h-9 bg-card">
            <span className="text-muted-foreground">Estado</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="visibles">Visibles</SelectItem>
            <SelectItem value="ocultos">Ocultos</SelectItem>
            <SelectItem value="agotados">Agotados</SelectItem>
          </SelectContent>
        </Select>
        <Select value={orden} onValueChange={(v) => setOrden(v as Orden)}>
          <SelectTrigger aria-label="Ordenar" className="h-9 bg-card">
            <span className="text-muted-foreground">Ordenar</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="margen_desc">Mayor margen</SelectItem>
            <SelectItem value="margen_asc">Menor margen</SelectItem>
            <SelectItem value="nombre">Nombre</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="lg" onClick={() => abrir(null)}>
          <Plus aria-hidden />
          Producto
        </Button>
      </div>

      {productos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card px-6 py-14 text-center">
          <span className="inline-flex size-11 items-center justify-center rounded-xl bg-hueso">
            <FlaskConical className="size-5" aria-hidden />
          </span>
          <h2 className="text-xl font-medium">Aún no hay productos</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Agrega el catálogo con su precio, presentación y protocolos por etapa. Los productos sin precio quedan ocultos para el mostrador y la red.
          </p>
          <Button onClick={() => abrir(null)}>
            <Plus aria-hidden />
            Agregar el primero
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-hueso-2 hover:bg-hueso-2">
                <TableHead>Producto</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead>Lote que sale</TableHead>
                <TableHead>Costo</TableHead>
                <TableHead className="w-40">Margen del lote</TableHead>
                <TableHead>Lote siguiente</TableHead>
                <TableHead className="text-right">Reposición/mes</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((p) => {
                const [sale, siguiente] = p.lotes
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <b className="font-semibold">
                        {p.nombre} {p.presentacion}
                      </b>
                      <div className="text-[11.5px] text-muted-foreground">{p.familia}</div>
                    </TableCell>
                    <TableCell className="num">{p.precio_publico ? formatoMoneda(p.precio_publico) : <span className="text-muted-foreground">sin precio</span>}</TableCell>
                    <TableCell className="font-mono text-[12px]">{sale ? sale.codigo : <span className="font-sans text-muted-foreground">sin piezas</span>}</TableCell>
                    <TableCell className="num text-[13px]">{sale ? formatoMoneda(sale.costo) : "—"}</TableCell>
                    <TableCell>
                      <BarraMargen valor={sale?.margen ?? null} />
                    </TableCell>
                    <TableCell className="text-[12px] text-muted-foreground">{siguiente ? `${siguiente.codigo} · ${siguiente.margen ?? "—"}%` : "—"}</TableCell>
                    <TableCell className="num text-right">{p.reposicion ?? "—"}</TableCell>
                    <TableCell>
                      {!p.visible ? (
                        <Estado tipo="neutro">Oculto</Estado>
                      ) : p.piezas === 0 ? (
                        <Estado tipo="warn">Visible · agotado</Estado>
                      ) : (
                        <Estado tipo="ok">Visible</Estado>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="link" size="sm" onClick={() => abrir(p)} aria-label={`Editar ${p.nombre} ${p.presentacion}`}>
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
              {filas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                    Ningún producto coincide con los filtros.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="flex items-start gap-1.5 text-[11.5px] text-muted-foreground">
        <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
        El margen se compara contra el lote que está saliendo (el más viejo con piezas), con el precio público sin IVA. Reposición = piezas apartadas para recurrentes + venta promedio mensual (últimos 3 meses) × 1.05.
      </p>

      <ProductoDrawer key={editando?.id ?? "nuevo"} abierto={abierto} onOpenChange={setAbierto} producto={editando} familias={familias} />
    </>
  )
}
