"use client"

import { useMemo, useState } from "react"
import { Boxes, Info, Plus, Search } from "lucide-react"

import { Estado, type TipoEstado } from "@/components/app/estado"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatoFecha, formatoMoneda } from "@/lib/format"
import { cn } from "@/lib/utils"

import { BarraMargen } from "../productos/barra-margen"
import { RecibirLoteDrawer } from "./recibir-drawer"
import { NOMBRE_COA, type LoteFila, type ProductoInventario } from "./tipos"

const COA_ESTADO: Record<LoteFila["coa"], TipoEstado> = { falta: "crit", por_aprobar: "warn", listo: "ok" }
const fecha = (d: string) => formatoFecha(new Date(d.length === 10 ? `${d}T12:00:00-06:00` : d))

type Vista = "lote" | "producto"

export function InventarioVista({ lotes, productos, tipoCambio }: { lotes: LoteFila[]; productos: ProductoInventario[]; tipoCambio: number | null }) {
  const [vista, setVista] = useState<Vista>("lote")
  const [buscar, setBuscar] = useState("")
  const [coa, setCoa] = useState("todos")
  const [conPiezas, setConPiezas] = useState("con")
  const [orden, setOrden] = useState("reciente")
  const [abierto, setAbierto] = useState(false)
  const [vuelta, setVuelta] = useState(0)

  const q = buscar.trim().toLowerCase()
  const filasLote = useMemo(() => {
    const lista = lotes.filter(
      (l) =>
        (!q || `${l.codigo} ${l.producto} ${l.lote_origen ?? ""}`.toLowerCase().includes(q)) &&
        (coa === "todos" || l.coa === coa) &&
        (conPiezas === "todos" || (conPiezas === "con" ? l.existencia > 0 : l.existencia === 0)),
    )
    return lista.sort((a, b) =>
      orden === "antiguo" ? a.llegada.localeCompare(b.llegada) : orden === "margen" ? (b.margen ?? -999) - (a.margen ?? -999) : b.llegada.localeCompare(a.llegada) || b.codigo.localeCompare(a.codigo),
    )
  }, [lotes, q, coa, conPiezas, orden])

  const filasProducto = useMemo(
    () => productos.filter((p) => (!q || p.nombre.toLowerCase().includes(q)) && (conPiezas === "todos" || (conPiezas === "con" ? p.existencia > 0 : p.existencia === 0))),
    [productos, q, conPiezas],
  )

  function recibir() {
    setVuelta((v) => v + 1)
    setAbierto(true)
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Ver inventario" className="inline-flex rounded-[11px] bg-hueso p-1">
          {(["lote", "producto"] as const).map((v) => (
            <button key={v} role="tab" type="button" aria-selected={vista === v} onClick={() => setVista(v)} className={cn("rounded-lg px-3 py-1.5 text-[13px] font-semibold text-[#5c544c]", vista === v && "bg-card text-foreground shadow-sm")}>
              {v === "lote" ? "Por lote" : "Por producto"}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-taupe" aria-hidden />
          <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder={vista === "lote" ? "Producto o lote" : "Producto"} aria-label="Buscar en inventario" className="h-9 bg-card pl-9" />
        </div>
        <Filtro etiqueta="Piezas" valor={conPiezas} onChange={setConPiezas} opciones={[["con", "Con piezas"], ["sin", "Agotados"], ["todos", "Todos"]]} />
        {vista === "lote" && (
          <>
            <Filtro etiqueta="COA" valor={coa} onChange={setCoa} opciones={[["todos", "Todos"], ["falta", "Falta COA"], ["por_aprobar", "Por aprobar"], ["listo", "Listo"]]} />
            <Filtro etiqueta="Ordenar" valor={orden} onChange={setOrden} opciones={[["reciente", "Más reciente"], ["antiguo", "Más antiguo"], ["margen", "Mayor margen"]]} />
          </>
        )}
        <div className="flex-1" />
        <Button size="lg" onClick={recibir}>
          <Plus aria-hidden />
          Recibir lote
        </Button>
      </div>

      {lotes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card px-6 py-14 text-center">
          <span className="inline-flex size-11 items-center justify-center rounded-xl bg-hueso">
            <Boxes className="size-5" aria-hidden />
          </span>
          <h2 className="text-xl font-medium">Aún no hay lotes</h2>
          <p className="max-w-md text-sm text-muted-foreground">Registra cada lote que llega con su costo por pieza. Sale primero lo que llegó antes, y el margen se calcula contra ese lote.</p>
          <Button onClick={recibir}>
            <Plus aria-hidden />
            Recibir el primer lote
          </Button>
        </div>
      ) : vista === "lote" ? (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-hueso-2 hover:bg-hueso-2">
                <TableHead>Lote</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Llegó</TableHead>
                <TableHead>Última venta</TableHead>
                <TableHead className="w-40">Vendido</TableHead>
                <TableHead>
                  <abbr title="Venta general · Recurrentes · En tránsito (apartado de la red)" className="no-underline">
                    Gral · Rec · Tráns.
                  </abbr>
                </TableHead>
                <TableHead>Costo</TableHead>
                <TableHead className="w-36">Margen</TableHead>
                <TableHead>COA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filasLote.map((l) => {
                const vendidas = Math.max(l.recibidas - l.existencia, 0)
                return (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-[12px]">
                      {l.codigo}
                      {l.lote_origen && <span className="block font-sans text-[11px] text-muted-foreground">origen {l.lote_origen}</span>}
                    </TableCell>
                    <TableCell className="font-semibold">{l.producto}</TableCell>
                    <TableCell className="text-[13px]">{fecha(l.llegada)}</TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">{l.ultimaVenta ? fecha(l.ultimaVenta) : "aún no"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-hueso" aria-hidden>
                          <i className="block h-full rounded-full bg-chart-1" style={{ width: `${l.recibidas ? (vendidas / l.recibidas) * 100 : 0}%` }} />
                        </div>
                        <span className="num text-[11.5px]">
                          {vendidas}/{l.recibidas}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="num text-[13px]">
                      {l.bolsas.general} · {l.bolsas.recurrentes} · {l.bolsas.transito}
                    </TableCell>
                    <TableCell className="num text-[13px]">{formatoMoneda(l.costo)}</TableCell>
                    <TableCell>
                      <BarraMargen valor={l.margen} />
                    </TableCell>
                    <TableCell>
                      <Estado tipo={COA_ESTADO[l.coa]}>{NOMBRE_COA[l.coa]}</Estado>
                    </TableCell>
                  </TableRow>
                )
              })}
              {filasLote.length === 0 && <SinResultados columnas={9} />}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-hueso-2 hover:bg-hueso-2">
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Venta general</TableHead>
                <TableHead className="text-right">Recurrentes</TableHead>
                <TableHead className="text-right">En tránsito</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Lotes</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filasProducto.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <b className="font-semibold">{p.nombre}</b>
                    <span className="block text-[11.5px] text-muted-foreground">{p.familia}</span>
                  </TableCell>
                  <TableCell className="num text-right">{p.bolsas.general}</TableCell>
                  <TableCell className="num text-right">
                    {p.bolsas.recurrentes}
                    {p.apartadoSugerido > p.bolsas.recurrentes && <span className="block text-[11px] text-warn">faltan {p.apartadoSugerido - p.bolsas.recurrentes}</span>}
                  </TableCell>
                  <TableCell className="num text-right">{p.bolsas.transito}</TableCell>
                  <TableCell className="num text-right font-semibold">{p.existencia}</TableCell>
                  <TableCell className="num text-right">{p.lotes}</TableCell>
                  <TableCell>{p.existencia === 0 ? <Estado tipo={p.visible ? "warn" : "neutro"}>{p.visible ? "Agotado" : "Oculto"}</Estado> : <Estado tipo="ok">Con piezas</Estado>}</TableCell>
                </TableRow>
              ))}
              {filasProducto.length === 0 && <SinResultados columnas={7} />}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="flex items-start gap-1.5 text-[11.5px] text-muted-foreground">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        Un solo inventario con tres bolsas: venta general, apartado para recurrentes (clientes activos × piezas de su siguiente etapa) y en tránsito (apartados de la red esperando pago). Sale primero lo que llegó antes.
      </p>

      <RecibirLoteDrawer key={vuelta} abierto={abierto} onOpenChange={setAbierto} productos={productos} tipoCambio={tipoCambio} />
    </>
  )
}

function SinResultados({ columnas }: { columnas: number }) {
  return (
    <TableRow>
      <TableCell colSpan={columnas} className="py-10 text-center text-sm text-muted-foreground">
        Nada coincide con los filtros.
      </TableCell>
    </TableRow>
  )
}

function Filtro({ etiqueta, valor, onChange, opciones }: { etiqueta: string; valor: string; onChange: (v: string) => void; opciones: [string, string][] }) {
  return (
    <Select value={valor} onValueChange={onChange}>
      <SelectTrigger aria-label={etiqueta} className="h-9 bg-card">
        <span className="text-muted-foreground">{etiqueta}</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {opciones.map(([v, t]) => (
          <SelectItem key={v} value={v}>
            {t}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
