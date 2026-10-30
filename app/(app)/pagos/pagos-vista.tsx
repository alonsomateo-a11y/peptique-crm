"use client"

import Link from "next/link"
import { useMemo, useState, useTransition } from "react"
import { ArrowRight, Search } from "lucide-react"
import { toast } from "sonner"

import { Estado } from "@/components/app/estado"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatoCuando, formatoMoneda, nombreDeMes } from "@/lib/format"
import { PERFIL_INFO, PERFILES, type Perfil } from "@/lib/perfiles"
import { cn } from "@/lib/utils"

import { ligaVenta } from "../ventas/tipos"
import { cambiarPago } from "./actions"
import { RedEnCamino, type VentaRed } from "./red-en-camino"

export type PagoFila = {
  id: string
  monto: number
  metodo: string
  lugar: string
  estado: string
  referencia: string | null
  dosis: number | null
  creado_en: string
  /** Día en hora de Monterrey (YYYY-MM-DD). */
  dia: string
  folio: string
  cliente: string
  cobro: string
  perfil: Perfil | null
}

export type PlanFila = { id: string; folio: string; cliente: string; producto: string; de: number; pagadas: number; aplicadas: number; pagado: number; falta: number }

const METODO: Record<string, string> = { efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia" }
const LUGAR: Record<string, string> = { caja: "Caja", en_persona: "En persona", red: "Red", banco: "Banco" }
const ESTADO: Record<string, [string, "ok" | "warn" | "crit" | "neutro"]> = {
  en_caja: ["En caja", "neutro"],
  por_entregar: ["Por entregar", "warn"],
  por_conciliar: ["Por conciliar", "warn"],
  conciliado: ["Conciliado", "ok"],
  en_camino: ["En camino", "warn"],
  reflejado: ["Reflejado", "ok"],
  devolucion: ["Devolución pendiente", "crit"],
}

type Pestana = "todos" | "red" | "por_conciliar" | "por_entregar" | "planes" | "devolucion"
const PESTANAS_VALIDAS: Pestana[] = ["todos", "red", "por_conciliar", "por_entregar", "planes", "devolucion"]
const TODOS = "todos"

export function PagosVista({
  pagos,
  planes,
  red,
  pestanaInicial,
  mesInicial,
}: {
  pagos: PagoFila[]
  planes: PlanFila[]
  red: VentaRed[]
  pestanaInicial?: string
  mesInicial?: string
}) {
  const [pestana, setPestana] = useState<Pestana>(PESTANAS_VALIDAS.includes(pestanaInicial as Pestana) ? (pestanaInicial as Pestana) : "todos")
  const [q, setQ] = useState("")
  const [metodo, setMetodo] = useState(TODOS)
  const [lugar, setLugar] = useState(TODOS)
  const [perfil, setPerfil] = useState(TODOS)
  const [mes, setMes] = useState(mesInicial ?? TODOS)
  const meses = useMemo(() => [...new Set(pagos.map((p) => p.dia.slice(0, 7)))].sort().reverse(), [pagos])
  const [ocupado, iniciar] = useTransition()

  const cuenta = (e: string) => pagos.filter((p) => p.estado === e).length
  const pestanas: [Pestana, string, number | null][] = [
    ["todos", "Todos", pagos.length],
    ["red", "Red · en camino", red.length],
    ["por_conciliar", "Por conciliar", cuenta("por_conciliar")],
    ["por_entregar", "Efectivo por entregar", cuenta("por_entregar")],
    ["planes", "Planes por dosis", planes.length],
    ["devolucion", "Devoluciones", cuenta("devolucion")],
  ]

  const filas = useMemo(() => {
    const t = q.trim().toLowerCase()
    return pagos.filter(
      (p) =>
        (pestana === "todos" || p.estado === pestana) &&
        (!t || `${p.folio} ${p.cliente} ${p.referencia ?? ""}`.toLowerCase().includes(t)) &&
        (metodo === TODOS || p.metodo === metodo) &&
        (lugar === TODOS || p.lugar === lugar) &&
        (perfil === TODOS || p.perfil === perfil) &&
        (mes === TODOS || p.dia.slice(0, 7) === mes),
    )
  }, [pagos, pestana, q, metodo, lugar, perfil, mes])
  // Igual que el indicador "Cobrado": las devoluciones no suman (salvo en su propia pestaña).
  const totalFiltrado = filas.filter((p) => pestana === "devolucion" || p.estado !== "devolucion").reduce((s, p) => s + p.monto, 0)

  function accion(p: PagoFila, a: "conciliar" | "recibir") {
    iniciar(async () => {
      const r = await cambiarPago(p.id, a)
      if (r.error) toast.error(r.error)
      else toast.success(a === "conciliar" ? `${p.folio} conciliado` : `Efectivo de ${p.cobro} recibido`)
    })
  }

  return (
    <>
      <div role="tablist" aria-label="Pagos" className="flex flex-wrap gap-1 border-b">
        {pestanas.map(([v, t, n]) => (
          <button
            key={v}
            role="tab"
            type="button"
            aria-selected={pestana === v}
            onClick={() => setPestana(v)}
            className={cn("-mb-px inline-flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-[13px] font-semibold text-muted-foreground", pestana === v && "border-espresso text-foreground")}
          >
            {t}
            {n ? <em className="rounded-full bg-hueso px-1.5 text-[11px] not-italic">{n}</em> : null}
          </button>
        ))}
      </div>

      {pestana === "red" ? (
        <RedEnCamino ventas={red} />
      ) : pestana === "planes" ? (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-hueso-2 hover:bg-hueso-2">
                <TableHead>Cliente</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Avance</TableHead>
                <TableHead className="text-right">Pagado</TableHead>
                <TableHead className="text-right">Falta</TableHead>
                <TableHead>
                  <span className="sr-only">Abrir</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {planes.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-semibold">{p.cliente}</TableCell>
                  <TableCell className="text-[13px]">{p.producto}</TableCell>
                  <TableCell>
                    <div className="flex gap-1" aria-hidden>
                      {Array.from({ length: p.de }, (_, i) => i + 1).map((n) => (
                        <i key={n} className={cn("h-2.5 w-6 rounded-full", n <= p.aplicadas ? "bg-chart-1" : n <= p.pagadas ? "bg-[#e8c77d]" : "bg-border")} />
                      ))}
                    </div>
                    <span className="text-[11.5px] text-muted-foreground">
                      {p.pagadas} de {p.de} pagadas · {p.aplicadas} aplicadas
                    </span>
                  </TableCell>
                  <TableCell className="num text-right font-semibold">{formatoMoneda(p.pagado)}</TableCell>
                  <TableCell className="num text-right">{formatoMoneda(p.falta)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="link" size="sm" asChild>
                      <Link href={ligaVenta(p.folio)}>
                        Ver venta <ArrowRight aria-hidden />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {planes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    No hay planes por dosis activos.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <div className="flex flex-wrap gap-4 border-t px-4 py-2.5 text-[11.5px] font-bold">
            {[
              ["bg-chart-1", "Pagada y aplicada"],
              ["bg-[#e8c77d]", "Pagada, por aplicar"],
              ["bg-border", "Falta pagar"],
            ].map(([c, t]) => (
              <span key={t} className="flex items-center gap-1.5">
                <i className={cn("inline-block h-2 w-4 rounded-full", c)} />
                {t}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-56">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-taupe" aria-hidden />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Folio, cliente o referencia" aria-label="Buscar pagos" className="h-9 bg-card pl-9" />
            </div>
            <Filtro etiqueta="Método" valor={metodo} onChange={setMetodo} opciones={Object.entries(METODO)} />
            <Filtro etiqueta="Dónde" valor={lugar} onChange={setLugar} opciones={Object.entries(LUGAR)} />
            <Filtro etiqueta="Perfil" valor={perfil} onChange={setPerfil} opciones={PERFILES.map((p) => [p, PERFIL_INFO[p].nombre])} />
            <Filtro etiqueta="Mes" valor={mes} onChange={setMes} opciones={meses.map((m) => [m, nombreDeMes(m)])} />
          </div>
          <p role="status" className="rounded-xl border bg-hueso-2 px-3.5 py-2.5 text-[13px]">
            Viendo <b>{filas.length === 1 ? "1 pago" : `${filas.length} pagos`}</b> · suma <b className="num">{formatoMoneda(totalFiltrado)}</b>
            {mes !== TODOS && <> · {nombreDeMes(mes)}</>}
            {pestana !== "devolucion" && filas.some((p) => p.estado === "devolucion") && <span className="text-muted-foreground"> · las devoluciones no suman</span>}
          </p>
          <div className="overflow-hidden rounded-2xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-hueso-2 hover:bg-hueso-2">
                  <TableHead>Cuándo</TableHead>
                  <TableHead>Venta</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Dónde</TableHead>
                  <TableHead>Cobró</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>
                    <span className="sr-only">Acción</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-[12.5px] whitespace-nowrap text-muted-foreground">
                      <time dateTime={p.creado_en}>{formatoCuando(new Date(p.creado_en))}</time>
                    </TableCell>
                    <TableCell className="font-mono text-[12px]">
                      <Link href={ligaVenta(p.folio)} className="hover:underline">
                        {p.folio}
                      </Link>
                      {p.dosis && <span className="block font-sans text-[11px] text-muted-foreground">dosis {p.dosis}</span>}
                    </TableCell>
                    <TableCell className="font-semibold">{p.cliente}</TableCell>
                    <TableCell className="text-[13px]">
                      {METODO[p.metodo] ?? p.metodo}
                      {p.referencia && <span className="block font-mono text-[11px] text-muted-foreground">{p.referencia}</span>}
                    </TableCell>
                    <TableCell className="text-[13px]">{LUGAR[p.lugar] ?? p.lugar}</TableCell>
                    <TableCell className="text-[13px]">{p.cobro}</TableCell>
                    <TableCell>{p.perfil && <span className="rounded-full bg-hueso px-2.5 py-0.5 text-[11.5px] font-semibold text-[#5c544c]">{PERFIL_INFO[p.perfil].nombre}</span>}</TableCell>
                    <TableCell className={cn("num text-right font-semibold", p.estado === "devolucion" && "text-crit")}>{formatoMoneda(p.monto)}</TableCell>
                    <TableCell>
                      <Estado tipo={ESTADO[p.estado]?.[1] ?? "neutro"}>{ESTADO[p.estado]?.[0] ?? p.estado}</Estado>
                    </TableCell>
                    <TableCell className="text-right">
                      {p.estado === "por_conciliar" && (
                        <Button variant="outline" size="sm" disabled={ocupado} onClick={() => accion(p, "conciliar")}>
                          Conciliar
                        </Button>
                      )}
                      {p.estado === "por_entregar" && (
                        <Button variant="outline" size="sm" disabled={ocupado} onClick={() => accion(p, "recibir")}>
                          Recibir efectivo
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {filas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                      {pagos.length ? "Ningún pago coincide." : "Aún no hay pagos."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {pestana === "por_conciliar" && <p className="text-[12px] text-muted-foreground">Concilia cuando veas el cargo de la terminal o la transferencia en el banco.</p>}
          {pestana === "por_entregar" && <p className="text-[12px] text-muted-foreground">Efectivo de ventas en persona. “Recibir efectivo” cuando lo entreguen en el mostrador.</p>}
        </>
      )}
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
