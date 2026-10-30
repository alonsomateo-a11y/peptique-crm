"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { ArrowRight, Plus, Search, ShoppingBag } from "lucide-react"

import { Estado } from "@/components/app/estado"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatoFecha, formatoMoneda } from "@/lib/format"
import { cn } from "@/lib/utils"

import type { ClienteMostrador, ProductoMostrador } from "../../(mostrador)/mostrador/tipos"
import { PedidoDrawer } from "./pedido-drawer"
import { ligaVenta, NOMBRE_CANAL, NOMBRE_ESTADO, TIPO_ESTADO, type EstadoVenta, type VentaFila } from "./tipos"

const COLUMNAS: EstadoVenta[] = ["esperando_pago", "por_cobrar", "pagada", "entregada"]
const TODOS = "todos"

export function VentasVista({ ventas, productos, clientes }: { ventas: VentaFila[]; productos: ProductoMostrador[]; clientes: ClienteMostrador[] }) {
  const [vista, setVista] = useState<"lista" | "tablero">("lista")
  const [q, setQ] = useState("")
  const [canal, setCanal] = useState(TODOS)
  const [estado, setEstado] = useState(TODOS)
  const [vendedor, setVendedor] = useState(TODOS)
  const [mes, setMes] = useState(TODOS)
  const [abierto, setAbierto] = useState(false)
  const [vuelta, setVuelta] = useState(0)

  const vendedores = useMemo(() => [...new Map(ventas.map((v) => [v.vendedorId, v.vendedor])).entries()].sort((a, b) => a[1].localeCompare(b[1], "es")), [ventas])
  const meses = useMemo(() => [...new Set(ventas.map((v) => v.creado_en.slice(0, 7)))].sort().reverse(), [ventas])

  const filas = useMemo(() => {
    const t = q.trim().toLowerCase()
    return ventas.filter(
      (v) =>
        (!t || `${v.folio} ${v.cliente} ${v.productos}`.toLowerCase().includes(t)) &&
        (canal === TODOS || v.canal === canal) &&
        (estado === TODOS || v.estado === estado || (estado === "con_saldo" && v.saldo > 0)) &&
        (vendedor === TODOS || v.vendedorId === vendedor) &&
        (mes === TODOS || v.creado_en.slice(0, 7) === mes),
    )
  }, [ventas, q, canal, estado, vendedor, mes])

  function nuevoPedido() {
    setVuelta((v) => v + 1)
    setAbierto(true)
  }

  const nombreMes = (m: string) => new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-15T00:00:00Z`))

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Ver ventas" className="inline-flex rounded-[11px] bg-hueso p-1">
          {(["lista", "tablero"] as const).map((v) => (
            <button key={v} role="tab" type="button" aria-selected={vista === v} onClick={() => setVista(v)} className={cn("rounded-lg px-3 py-1.5 text-[13px] font-semibold text-[#5c544c]", vista === v && "bg-card text-foreground shadow-sm")}>
              {v === "lista" ? "Lista" : "Tablero"}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-taupe" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Folio, cliente o producto" aria-label="Buscar ventas" className="h-9 bg-card pl-9" />
        </div>
        <Filtro etiqueta="Canal" valor={canal} onChange={setCanal} opciones={Object.entries(NOMBRE_CANAL)} />
        {vista === "lista" && <Filtro etiqueta="Estado" valor={estado} onChange={setEstado} opciones={[["con_saldo", "Con saldo"], ...Object.entries(NOMBRE_ESTADO)]} />}
        <Filtro etiqueta="Vendedor" valor={vendedor} onChange={setVendedor} opciones={vendedores} />
        <Filtro etiqueta="Mes" valor={mes} onChange={setMes} opciones={meses.map((m) => [m, nombreMes(m)])} />
        <div className="flex-1" />
        <Button size="lg" onClick={nuevoPedido}>
          <Plus aria-hidden />
          Nuevo pedido
        </Button>
      </div>

      {ventas.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card px-6 py-14 text-center">
          <span className="inline-flex size-11 items-center justify-center rounded-xl bg-hueso">
            <ShoppingBag className="size-5" aria-hidden />
          </span>
          <h2 className="text-xl font-medium">Aún no hay ventas</h2>
          <p className="max-w-md text-sm text-muted-foreground">Las ventas del mostrador y de la red aparecen aquí solas. Los pedidos de médicos y distribuidores se crean con “Nuevo pedido” y se cobran después.</p>
        </div>
      ) : vista === "lista" ? (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-hueso-2 hover:bg-hueso-2">
                <TableHead>Folio</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Productos</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Vendió</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>
                  <span className="sr-only">Abrir</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((v) => (
                <TableRow key={v.id} className={cn(v.estado === "cancelada" && "text-muted-foreground")}>
                  <TableCell className="font-mono text-[12px]">{v.folio}</TableCell>
                  <TableCell className="text-[13px] whitespace-nowrap">{formatoFecha(new Date(v.creado_en))}</TableCell>
                  <TableCell className="font-semibold">{v.cliente}</TableCell>
                  <TableCell className="max-w-56 truncate text-[12.5px]" title={v.productos}>
                    {v.productos}
                  </TableCell>
                  <TableCell className="text-[13px]">{NOMBRE_CANAL[v.canal]}</TableCell>
                  <TableCell className="text-[13px]">{v.vendedor}</TableCell>
                  <TableCell className={cn("num text-right font-semibold", v.estado === "cancelada" && "line-through")}>{formatoMoneda(v.total)}</TableCell>
                  <TableCell className={cn("num text-right", v.saldo > 0 && "font-semibold text-crit")}>{v.saldo > 0 ? formatoMoneda(v.saldo) : "—"}</TableCell>
                  <TableCell>
                    <Estado tipo={TIPO_ESTADO[v.estado]}>{v.porDosis && v.estado === "por_cobrar" ? "Plan por dosis" : NOMBRE_ESTADO[v.estado]}</Estado>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="link" size="sm" asChild>
                      <Link href={ligaVenta(v.folio)} aria-label={`Ver venta ${v.folio}`}>
                        Ver <ArrowRight aria-hidden />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                    Ninguna venta coincide con los filtros.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNAS.map((col) => {
            const suyas = filas.filter((v) => v.estado === col)
            const visibles = col === "entregada" ? suyas.slice(0, 12) : suyas
            return (
              <section key={col} aria-label={NOMBRE_ESTADO[col]} className="flex flex-col gap-2 rounded-2xl bg-hueso p-2.5">
                <div className="flex items-center gap-2 px-1">
                  <Estado tipo={TIPO_ESTADO[col]}>{NOMBRE_ESTADO[col]}</Estado>
                  <span className="flex-1 text-[11.5px] text-muted-foreground">{suyas.length}</span>
                  <b className="num text-[13px]">{formatoMoneda(suyas.reduce((s, v) => s + (col === "por_cobrar" || col === "esperando_pago" ? v.saldo : v.total), 0))}</b>
                </div>
                {visibles.map((v) => (
                  <Link key={v.id} href={ligaVenta(v.folio)} className="flex flex-col gap-1 rounded-xl border bg-card px-3 py-2.5 hover:border-espresso focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 font-mono text-[11.5px] text-muted-foreground">{v.folio}</span>
                      <span className="text-[11px] text-muted-foreground">{NOMBRE_CANAL[v.canal]}</span>
                    </div>
                    <b className="text-[13.5px]">{v.cliente}</b>
                    <span className="truncate text-[12px] text-muted-foreground">{v.productos}</span>
                    <div className="flex items-center">
                      <b className="num flex-1">{formatoMoneda(v.total)}</b>
                      {v.saldo > 0 && <span className="text-[11.5px] font-semibold text-crit">saldo {formatoMoneda(v.saldo)}</span>}
                    </div>
                  </Link>
                ))}
                {col === "entregada" && suyas.length > visibles.length && <span className="px-1 text-[11.5px] text-muted-foreground">y {suyas.length - visibles.length} más en la lista</span>}
                {suyas.length === 0 && <span className="px-1 py-3 text-center text-[12px] text-muted-foreground">Nada aquí</span>}
              </section>
            )
          })}
        </div>
      )}

      <PedidoDrawer key={vuelta} abierto={abierto} onOpenChange={setAbierto} productos={productos} clientes={clientes} />
    </>
  )
}

function Filtro({ etiqueta, valor, onChange, opciones }: { etiqueta: string; valor: string; onChange: (v: string) => void; opciones: [string, string][] }) {
  return (
    <Select value={valor} onValueChange={onChange}>
      <SelectTrigger aria-label={etiqueta} className="h-9 bg-card data-[activo=true]:border-espresso" data-activo={valor !== TODOS}>
        <span className="text-muted-foreground">{etiqueta}</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TODOS}>Todos</SelectItem>
        {opciones.map(([v, t]) => (
          <SelectItem key={v} value={v}>
            {t}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
