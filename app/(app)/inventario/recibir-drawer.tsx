"use client"

import { useActionState, useState } from "react"
import { AlertTriangle, FileText, Loader2, Upload } from "lucide-react"
import { toast } from "sonner"

import { Campo } from "@/components/app/campo"
import { Drawer, DrawerCuerpo, DrawerPie } from "@/components/app/drawer"
import { Segmentado } from "@/components/app/segmentado"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatoMonedaCentavos } from "@/lib/format"
import { enviarSinLimpiar } from "@/lib/formulario"

import { recibirLote } from "./actions"
import type { ProductoInventario, Resultado } from "./tipos"

const hoyMty = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey" }).format(new Date())
const num = (v: string) => Number(v.replace(/[$,\s]/g, "")) || 0

export function RecibirLoteDrawer({
  abierto,
  onOpenChange,
  productos,
  tipoCambio,
}: {
  abierto: boolean
  onOpenChange: (v: boolean) => void
  productos: ProductoInventario[]
  tipoCambio: number | null
}) {
  const [productoId, setProductoId] = useState("")
  const [cantidad, setCantidad] = useState("")
  const [moneda, setMoneda] = useState<"usd" | "mxn">("usd")
  const [usd, setUsd] = useState("")
  const [tc, setTc] = useState(tipoCambio?.toString() ?? "")
  const [mxn, setMxn] = useState("")
  const [archivo, setArchivo] = useState<string | null>(null)
  const [llegada] = useState(hoyMty)

  const [res, enviar, enviando] = useActionState(async (prev: Resultado, form: FormData) => {
    const r = await recibirLote(prev, form)
    if (r?.ok) {
      toast.success(`Lote ${r.codigo} recibido`)
      onOpenChange(false)
    }
    return r
  }, null)
  const err = res?.errores ?? {}
  const id = (k: string) => `lote-${k}`
  const aria = (k: string) => (err[k] ? { "aria-invalid": true, "aria-describedby": `${id(k)}-error` } : {})

  const producto = productos.find((p) => p.id === productoId)
  const piezas = Math.max(Math.floor(num(cantidad)), 0)
  const pendiente = producto ? Math.max(producto.apartadoSugerido - producto.bolsas.recurrentes, 0) : 0
  const aRecurrentes = Math.min(pendiente, piezas)
  const costoMxn = moneda === "usd" ? Math.round(num(usd) * num(tc) * 100) / 100 : num(mxn)
  const familias = [...new Set(productos.map((p) => p.familia))].sort((a, b) => a.localeCompare(b, "es"))

  return (
    <Drawer abierto={abierto} onOpenChange={onOpenChange} titulo="Recibir lote" descripcion="Mercancía que llega del proveedor · el código del lote se asigna solo">
      <form onSubmit={enviarSinLimpiar(enviar)} className="flex min-h-0 flex-1 flex-col">
        <input type="hidden" name="moneda" value={moneda} />
        <DrawerCuerpo>
          {res?.error && (
            <p role="alert" className="flex items-center gap-2 rounded-xl bg-crit-bg px-3.5 py-2.5 text-sm font-semibold text-crit">
              <AlertTriangle className="size-4" aria-hidden />
              {res.error}
            </p>
          )}

          <Campo id={id("producto_id")} etiqueta="Producto" error={err.producto_id}>
            <Select name="producto_id" value={productoId} onValueChange={setProductoId}>
              <SelectTrigger id={id("producto_id")} className="w-full" {...aria("producto_id")}>
                <SelectValue placeholder="Elegir producto" />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {familias.map((f) => (
                  <SelectGroup key={f}>
                    <SelectLabel>{f}</SelectLabel>
                    {productos
                      .filter((p) => p.familia === f)
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nombre}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </Campo>

          <div className="grid grid-cols-3 gap-3">
            <Campo id={id("lote_origen")} etiqueta="Lote de origen" ayuda="Como viene en la caja">
              <Input id={id("lote_origen")} name="lote_origen" placeholder="Ej. US-7802" autoComplete="off" />
            </Campo>
            <Campo id={id("cantidad")} etiqueta="Piezas recibidas" error={err.cantidad}>
              <Input id={id("cantidad")} name="cantidad" inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="num" {...aria("cantidad")} />
            </Campo>
            <Campo id={id("llegada")} etiqueta="Llegó" error={err.llegada}>
              <Input id={id("llegada")} name="llegada" type="date" defaultValue={llegada} max={llegada} {...aria("llegada")} />
            </Campo>
          </div>

          {producto && piezas > 0 && (
            <p className="rounded-xl border bg-hueso-2 px-3.5 py-3 text-[13px]" role="status">
              {aRecurrentes > 0 ? (
                <>
                  <b>{aRecurrentes} se apartan solas para recurrentes</b> · {piezas - aRecurrentes} a venta general. Según los clientes activos y sus protocolos.
                </>
              ) : (
                <>
                  <b>Las {piezas} piezas van a venta general.</b> No hay clientes activos de este producto esperando su siguiente etapa.
                </>
              )}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <span className="text-[12.5px] font-semibold">Costo por pieza</span>
            <Segmentado
              name="_moneda"
              etiqueta="Moneda del costo"
              valor={moneda}
              onChange={setMoneda}
              opciones={[
                { valor: "usd", texto: "En dólares" },
                { valor: "mxn", texto: "En pesos" },
              ]}
            />
            {moneda === "usd" ? (
              <div className="grid grid-cols-2 gap-3">
                <Campo id={id("costo_usd")} etiqueta="Costo (USD)" error={err.costo_usd}>
                  <Input id={id("costo_usd")} name="costo_usd" inputMode="decimal" value={usd} onChange={(e) => setUsd(e.target.value)} placeholder="$0.00" className="num" {...aria("costo_usd")} />
                </Campo>
                <Campo id={id("tipo_cambio")} etiqueta="Tipo de cambio" error={err.tipo_cambio} ayuda={tipoCambio ? "El del último lote" : undefined}>
                  <Input id={id("tipo_cambio")} name="tipo_cambio" inputMode="decimal" value={tc} onChange={(e) => setTc(e.target.value)} placeholder="0.00" className="num" {...aria("tipo_cambio")} />
                </Campo>
              </div>
            ) : (
              <Campo id={id("costo_mxn")} etiqueta="Costo (MXN)" error={err.costo_mxn}>
                <Input id={id("costo_mxn")} name="costo_mxn" inputMode="decimal" value={mxn} onChange={(e) => setMxn(e.target.value)} placeholder="$0.00" className="num" {...aria("costo_mxn")} />
              </Campo>
            )}
          </div>

          <div className="flex items-center gap-3 rounded-xl border bg-hueso-2 px-3.5 py-3">
            <span className="flex-1 text-[13px]">Costo por pieza en México · base del margen del lote</span>
            <b className="num text-xl">{costoMxn > 0 ? formatoMonedaCentavos(costoMxn) : "—"}</b>
          </div>

          <Campo id={id("coa")} etiqueta="COA del lote" error={err.coa} ayuda="Original del proveedor. Solo lo ve el administrador; la versión pública con franjas se prepara después.">
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed px-3.5 py-3 has-focus-visible:ring-3 has-focus-visible:ring-ring">
              <span className="inline-flex size-9 items-center justify-center rounded-lg bg-hueso">{archivo ? <FileText className="size-4" aria-hidden /> : <Upload className="size-4" aria-hidden />}</span>
              <span className="flex-1 truncate text-[13px] font-semibold">{archivo ?? "Elegir PDF o imagen (opcional)"}</span>
              <input id={id("coa")} name="coa" type="file" accept="application/pdf,image/png,image/jpeg" className="sr-only" onChange={(e) => setArchivo(e.currentTarget.files?.[0]?.name ?? null)} />
            </label>
          </Campo>
          <span className="text-[11.5px] text-muted-foreground">Ya no se pide caducidad. Se registra la fecha de llegada.</span>
        </DrawerCuerpo>
        <DrawerPie>
          <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" size="lg" disabled={enviando}>
            {enviando && <Loader2 className="animate-spin" aria-hidden />}
            Guardar lote
          </Button>
        </DrawerPie>
      </form>
    </Drawer>
  )
}
