"use client"

import { usePathname, useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Download, Loader2, Plus, Target, Trash2, Wallet } from "lucide-react"
import { toast } from "sonner"

import { Drawer, DrawerCuerpo, DrawerPie } from "@/components/app/drawer"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatoMoneda } from "@/lib/format"

import { agregarGasto, copiarGastos, guardarPlan, quitarGasto } from "./actions"

type Resumen = {
  mes: string
  ingreso: number
  sinIva: number
  costo: number
  comisiones: number
  fijos: number
  utilidad: number
  porProducto: { nombre: string; piezas: number; ingreso: number; costo: number; margen: number | null }[]
  porCanal: { canal: string; monto: number }[]
  porPersona: { persona: string; monto: number }[]
}

const nombreMes = (m: string) => new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-15T00:00:00Z`)).replace(/^./, (l) => l.toUpperCase())
const mesMas = (mes: string, n: number) => {
  const [a, m] = mes.split("-").map(Number)
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7)
}
const num = (v: string) => Number(v.replace(/[$,\s%]/g, "")) || 0

export function ControlesReportes({
  mes,
  mesActual,
  gastos,
  productos,
  planProductos,
  planMeses,
  baseSugerida,
  resumen,
}: {
  mes: string
  mesActual: string
  gastos: { id: string; concepto: string; monto: number }[]
  productos: { id: string; nombre: string }[]
  planProductos: { productoId: string; meta: number }[]
  planMeses: { mes: string; meta: number | null; crecimiento: number }[]
  baseSugerida: number
  resumen: Resumen
}) {
  const router = useRouter()
  const ruta = usePathname()
  const [plan, setPlan] = useState(false)
  const [fijos, setFijos] = useState(false)
  const meses = Array.from({ length: 12 }, (_, i) => mesMas(mesActual, -i))

  function descargar() {
    const celda = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`
    const filas = [
      ["Reporte", nombreMes(mes)],
      [],
      ["Estado de resultados"],
      ["Ventas con IVA", resumen.ingreso],
      ["Ingresos sin IVA", Math.round(resumen.sinIva)],
      ["Costo de producto", Math.round(resumen.costo)],
      ["Comisiones de la red", Math.round(resumen.comisiones)],
      ["Gastos fijos", Math.round(resumen.fijos)],
      ["Utilidad", Math.round(resumen.utilidad)],
      [],
      ["Producto", "Piezas", "Ingreso sin IVA", "Costo", "Margen"],
      ...resumen.porProducto.map((p) => [p.nombre, p.piezas, Math.round(p.ingreso), Math.round(p.costo), p.margen === null ? "" : `${Math.round(p.margen * 100)}%`]),
      [],
      ["Canal", "Ventas con IVA"],
      ...resumen.porCanal.map((c) => [c.canal, c.monto]),
      [],
      ["Persona", "Ventas con IVA"],
      ...resumen.porPersona.map((p) => [p.persona, p.monto]),
    ]
    const csv = filas.map((f) => f.map((v) => celda(v as string | number)).join(",")).join("\r\n")
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }))
    Object.assign(document.createElement("a"), { href: url, download: `reporte-peptique-${mes}.csv` }).click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Select value={mes} onValueChange={(v) => router.replace(`${ruta}?mes=${v}`)}>
        <SelectTrigger aria-label="Mes" className="h-10 bg-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {meses.map((m) => (
            <SelectItem key={m} value={m}>
              {nombreMes(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="outline" size="lg" onClick={() => setFijos(true)}>
        <Wallet aria-hidden />
        Gastos fijos
      </Button>
      <Button variant="outline" size="lg" onClick={() => setPlan(true)}>
        <Target aria-hidden />
        Configurar plan
      </Button>
      <Button variant="outline" size="lg" onClick={descargar}>
        <Download aria-hidden />
        Descargar
      </Button>
      <PlanDrawer key={`p${String(plan)}`} abierto={plan} onOpenChange={setPlan} mes={mes} planMeses={planMeses} baseSugerida={baseSugerida} productos={productos} planProductos={planProductos} />
      <GastosDrawer key={`g${String(fijos)}`} abierto={fijos} onOpenChange={setFijos} mes={mes} gastos={gastos} />
    </div>
  )
}

function PlanDrawer({
  abierto,
  onOpenChange,
  mes,
  planMeses,
  baseSugerida,
  productos,
  planProductos,
}: {
  abierto: boolean
  onOpenChange: (v: boolean) => void
  mes: string
  planMeses: { mes: string; meta: number | null; crecimiento: number }[]
  baseSugerida: number
  productos: { id: string; nombre: string }[]
  planProductos: { productoId: string; meta: number }[]
}) {
  // Cada mes parte del anterior (el primero, de las ventas del mes pasado) y aplica su crecimiento.
  const [filas, setFilas] = useState(() => {
    let base = baseSugerida
    return planMeses.map((p) => {
      const meta = p.meta ?? Math.round(base * (1 + p.crecimiento / 100))
      const fila = { mes: p.mes, base, crecimiento: String(p.crecimiento), meta: String(meta) }
      base = meta
      return fila
    })
  })
  const [metas, setMetas] = useState<{ productoId: string; meta: string }[]>(planProductos.map((p) => ({ productoId: p.productoId, meta: String(p.meta) })))
  const [nuevo, setNuevo] = useState("")
  const [guardando, iniciar] = useTransition()

  function cambiarCrecimiento(i: number, v: string) {
    setFilas((fs) => {
      const copia = [...fs]
      copia[i] = { ...copia[i], crecimiento: v, meta: String(Math.round(copia[i].base * (1 + num(v) / 100))) }
      for (let j = i + 1; j < copia.length; j++) {
        const base = num(copia[j - 1].meta)
        copia[j] = { ...copia[j], base, meta: String(Math.round(base * (1 + num(copia[j].crecimiento) / 100))) }
      }
      return copia
    })
  }

  return (
    <Drawer abierto={abierto} onOpenChange={onOpenChange} titulo="Configurar plan de ventas" descripcion="Por mes, por producto o ambos · solo administrador">
      <DrawerCuerpo>
        <div className="flex flex-col gap-2">
          <b className="text-[13px]">Por mes</b>
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow className="bg-hueso-2 hover:bg-hueso-2">
                  <TableHead>Mes</TableHead>
                  <TableHead>Base</TableHead>
                  <TableHead>Crecimiento</TableHead>
                  <TableHead className="text-right">Meta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((f, i) => (
                  <TableRow key={f.mes}>
                    <TableCell className="font-semibold">{nombreMes(f.mes).split(" ")[0]}</TableCell>
                    <TableCell className="num text-[12.5px] text-muted-foreground">{formatoMoneda(f.base)}</TableCell>
                    <TableCell>
                      <div className="relative w-20">
                        <Input aria-label={`Crecimiento de ${nombreMes(f.mes)}`} inputMode="decimal" value={f.crecimiento} onChange={(e) => cambiarCrecimiento(i, e.target.value)} className="num h-8 pr-6 text-right font-bold" />
                        <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[12px] text-muted-foreground">%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        aria-label={`Meta de ${nombreMes(f.mes)}`}
                        inputMode="decimal"
                        value={f.meta}
                        onChange={(e) => setFilas((fs) => fs.map((x, j) => (j === i ? { ...x, meta: e.target.value } : x)))}
                        className="num ml-auto h-8 w-28 text-right font-bold"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <span className="text-[11.5px] text-muted-foreground">La base es el mes anterior; el crecimiento sugerido es 5%. Puedes escribir la meta directo.</span>
        </div>

        <div className="flex flex-col gap-2">
          <b className="text-[13px]">Por producto · {nombreMes(mes)}</b>
          {metas.map((m) => (
            <div key={m.productoId} className="flex items-center gap-2 text-[13px]">
              <span className="flex-1 font-semibold">{productos.find((p) => p.id === m.productoId)?.nombre ?? "—"}</span>
              <Input aria-label="Meta en piezas" inputMode="numeric" value={m.meta} onChange={(e) => setMetas((ms) => ms.map((x) => (x.productoId === m.productoId ? { ...x, meta: e.target.value } : x)))} className="num h-8 w-20 text-right font-bold" />
              <span className="text-[12px] text-muted-foreground">pzas</span>
              <button type="button" aria-label="Quitar meta" onClick={() => setMetas((ms) => ms.filter((x) => x.productoId !== m.productoId))} className="rounded p-1 text-muted-foreground hover:text-crit">
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <Select value={nuevo} onValueChange={setNuevo}>
              <SelectTrigger className="flex-1" aria-label="Producto para agregar meta">
                <SelectValue placeholder="Agregar producto" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {productos
                  .filter((p) => !metas.some((m) => m.productoId === p.id))
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nombre}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              disabled={!nuevo}
              onClick={() => {
                setMetas((ms) => [...ms, { productoId: nuevo, meta: "" }])
                setNuevo("")
              }}
            >
              <Plus aria-hidden />
              Agregar
            </Button>
          </div>
        </div>
      </DrawerCuerpo>
      <DrawerPie>
        <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button
          size="lg"
          disabled={guardando}
          onClick={() =>
            iniciar(async () => {
              const r = await guardarPlan({
                meses: filas.map((f) => ({ mes: f.mes, meta: num(f.meta), crecimiento: num(f.crecimiento) })),
                mesProductos: mes,
                productos: metas.map((m) => ({ productoId: m.productoId, metaPiezas: num(m.meta) || null })),
              })
              if (r.error) return void toast.error(r.error)
              toast.success("Plan guardado")
              onOpenChange(false)
            })
          }
        >
          {guardando && <Loader2 className="animate-spin" aria-hidden />}
          Guardar plan
        </Button>
      </DrawerPie>
    </Drawer>
  )
}

function GastosDrawer({ abierto, onOpenChange, mes, gastos }: { abierto: boolean; onOpenChange: (v: boolean) => void; mes: string; gastos: { id: string; concepto: string; monto: number }[] }) {
  const [concepto, setConcepto] = useState("")
  const [monto, setMonto] = useState("")
  const [ocupado, iniciar] = useTransition()
  const total = gastos.reduce((s, g) => s + g.monto, 0)
  const correr = (fn: () => Promise<{ error?: string; copiados?: number }>, exito: string) =>
    iniciar(async () => {
      const r = await fn()
      if (r.error) toast.error(r.error)
      else toast.success(exito)
    })

  return (
    <Drawer abierto={abierto} onOpenChange={onOpenChange} titulo="Gastos fijos" descripcion={`${nombreMes(mes)} · renta, sueldos, servicios… para el estado de resultados`}>
      <DrawerCuerpo>
        <ul className="flex flex-col divide-y rounded-xl border">
          {gastos.map((g) => (
            <li key={g.id} className="flex items-center gap-3 px-3.5 py-2.5 text-[13.5px]">
              <span className="flex-1">{g.concepto}</span>
              <b className="num">{formatoMoneda(g.monto)}</b>
              <button type="button" aria-label={`Quitar ${g.concepto}`} disabled={ocupado} onClick={() => correr(() => quitarGasto(g.id), "Gasto quitado")} className="rounded p-1 text-muted-foreground hover:text-crit">
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
          {!gastos.length && <li className="px-4 py-5 text-center text-[13px] text-muted-foreground">Sin gastos capturados en este mes.</li>}
          {gastos.length > 0 && (
            <li className="flex items-center px-3.5 py-2.5 text-[13.5px] font-bold">
              <span className="flex-1">Total</span>
              <span className="num pr-7">{formatoMoneda(total)}</span>
            </li>
          )}
        </ul>
        {!gastos.length && (
          <Button variant="outline" disabled={ocupado} onClick={() => correr(() => copiarGastos(mes, mesMas(mes, -1)), "Gastos copiados del mes anterior")}>
            Copiar los del mes anterior
          </Button>
        )}
        <form
          className="flex flex-col gap-2 rounded-xl border bg-hueso-2 p-3.5"
          onSubmit={(e) => {
            e.preventDefault()
            correr(async () => {
              const r = await agregarGasto(mes, concepto, num(monto))
              if (!r.error) {
                setConcepto("")
                setMonto("")
              }
              return r
            }, "Gasto agregado")
          }}
        >
          <b className="text-[13px]">Agregar gasto</b>
          <div className="flex gap-2">
            <Input aria-label="Concepto" placeholder="Ej. Renta del local" value={concepto} onChange={(e) => setConcepto(e.target.value)} className="flex-1 bg-card" />
            <Input aria-label="Monto" placeholder="$0" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} className="num w-28 bg-card text-right" />
            <Button type="submit" disabled={ocupado}>
              Agregar
            </Button>
          </div>
        </form>
      </DrawerCuerpo>
      <DrawerPie>
        <Button size="lg" onClick={() => onOpenChange(false)}>
          Listo
        </Button>
      </DrawerPie>
    </Drawer>
  )
}
