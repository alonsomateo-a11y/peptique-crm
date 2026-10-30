"use client"

import { useState, useTransition } from "react"
import { AlertTriangle, Ban, Check, Loader2, MessageCircle, PackageCheck, Wallet } from "lucide-react"
import { toast } from "sonner"

import { Campo } from "@/components/app/campo"
import { Drawer, DrawerCuerpo, DrawerPie } from "@/components/app/drawer"
import { Segmentado } from "@/components/app/segmentado"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatoMoneda, formatoMonedaCentavos } from "@/lib/format"
import { ligaWhatsapp } from "@/lib/telefono"
import type { Metodo } from "@/lib/ventas"

import { cancelarVentaAccion, dosisVenta, entregarVenta, registrarPagoVenta } from "../actions"
import type { CanalVenta, EstadoVenta } from "../tipos"

type VentaAcciones = {
  id: string
  folio: string
  estado: EstadoVenta
  canal: CanalVenta
  porDosis: boolean
  saldo: number
  total: number
  pagado: number
  de: number
  pagadas: number
  aplicadas: number[]
}

const MOTIVOS = ["Producto dañado", "El cliente se arrepintió", "Error de captura", "Pago no recibido", "Otro"]
const hoyMty = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey" }).format(new Date())

export function AccionesVenta({ venta, cliente, lotes }: { venta: VentaAcciones; cliente: { nombre: string; whatsapp: string } | null; lotes: string[] }) {
  const [pagoAbierto, setPagoAbierto] = useState(false)
  const [cancelarAbierto, setCancelarAbierto] = useState(false)
  const [ocupado, iniciar] = useTransition()
  const activa = venta.estado !== "cancelada"
  const siguienteAplicar = Array.from({ length: venta.pagadas }, (_, i) => i + 1).find((n) => !venta.aplicadas.includes(n))
  const siguienteCobrar = venta.porDosis && venta.pagadas < venta.de ? venta.pagadas + 1 : null

  const correr = (fn: () => Promise<{ error?: string } | null>, exito: string) =>
    iniciar(async () => {
      const r = await fn()
      if (r?.error) toast.error(r.error)
      else toast.success(exito)
    })

  return (
    <div className="flex flex-wrap gap-2">
      {cliente && (
        <Button variant="outline" size="lg" asChild>
          <a href={ligaWhatsapp(cliente.whatsapp, `Hola ${cliente.nombre.split(" ")[0]}, te compartimos el COA de tu compra ${venta.folio}${lotes.length ? ` (lote ${[...new Set(lotes)].join(", ")})` : ""}.`)} target="_blank" rel="noopener noreferrer">
            <MessageCircle aria-hidden />
            Reenviar COA
          </a>
        </Button>
      )}
      {activa && siguienteAplicar && (
        <Button variant="outline" size="lg" disabled={ocupado} onClick={() => correr(() => dosisVenta(venta.id, venta.folio, "aplicar", siguienteAplicar), `Dosis ${siguienteAplicar} aplicada`)}>
          <Check aria-hidden />
          Aplicar dosis {siguienteAplicar}
        </Button>
      )}
      {activa && siguienteCobrar && (
        <Button size="lg" disabled={ocupado} onClick={() => correr(() => dosisVenta(venta.id, venta.folio, "cobrar", siguienteCobrar), `Dosis ${siguienteCobrar} cobrada en caja`)}>
          {ocupado && <Loader2 className="animate-spin" aria-hidden />}
          Cobrar dosis {siguienteCobrar} · {formatoMoneda(Math.ceil(venta.total / venta.de))}
        </Button>
      )}
      {activa && !venta.porDosis && venta.saldo > 0 && (
        <Button size="lg" onClick={() => setPagoAbierto(true)}>
          <Wallet aria-hidden />
          Registrar pago · {formatoMoneda(venta.saldo)}
        </Button>
      )}
      {venta.estado === "pagada" && (
        <Button size="lg" disabled={ocupado} onClick={() => correr(() => entregarVenta(venta.id, venta.folio), `${venta.folio} entregada`)}>
          <PackageCheck aria-hidden />
          Marcar entregada
        </Button>
      )}
      {activa && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="lg" aria-label="Más acciones">
              ⋯
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="text-crit" onSelect={() => setCancelarAbierto(true)}>
              <Ban aria-hidden />
              Cancelar venta
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <PagoDrawer key={String(pagoAbierto)} abierto={pagoAbierto} onOpenChange={setPagoAbierto} venta={venta} cliente={cliente?.nombre ?? ""} />
      <CancelarDialogo abierto={cancelarAbierto} onOpenChange={setCancelarAbierto} venta={venta} />
    </div>
  )
}

function PagoDrawer({ abierto, onOpenChange, venta, cliente }: { abierto: boolean; onOpenChange: (v: boolean) => void; venta: VentaAcciones; cliente: string }) {
  const [monto, setMonto] = useState(venta.saldo.toFixed(2))
  const [metodo, setMetodo] = useState<Metodo>("transferencia")
  const [lugar, setLugar] = useState("banco")
  const [fecha, setFecha] = useState(hoyMty)
  const [referencia, setReferencia] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [guardando, iniciar] = useTransition()
  const valor = Number(monto.replace(/[$,\s]/g, "")) || 0
  const queda = Math.max(Math.round((venta.saldo - valor) * 100) / 100, 0)

  return (
    <Drawer abierto={abierto} onOpenChange={onOpenChange} titulo="Registrar pago" descripcion={`${venta.folio} · ${cliente} · total ${formatoMoneda(venta.total)} · pagado ${formatoMoneda(venta.pagado)}`}>
      <DrawerCuerpo>
        <div className="flex items-center gap-3 rounded-xl bg-warn-bg px-3.5 py-3">
          <b className="flex-1">Saldo</b>
          <b className="num text-[22px]">{formatoMonedaCentavos(venta.saldo)}</b>
        </div>
        <Campo id="pago-monto" etiqueta="Monto">
          <Input id="pago-monto" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} className="num h-12 text-xl font-bold" />
        </Campo>
        <div className="flex gap-1.5">
          <Button type="button" variant="outline" size="sm" onClick={() => setMonto(venta.saldo.toFixed(2))}>
            Saldo completo
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setMonto((venta.saldo / 2).toFixed(2))}>
            Mitad
          </Button>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold">Método</span>
          <Segmentado
            name="metodo-pago"
            etiqueta="Método"
            valor={metodo}
            onChange={setMetodo}
            opciones={[
              { valor: "efectivo", texto: "Efectivo" },
              { valor: "transferencia", texto: "Transferencia" },
              { valor: "tarjeta", texto: "Tarjeta" },
            ]}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo id="pago-fecha" etiqueta="Fecha del pago">
            <Input id="pago-fecha" type="date" value={fecha} max={hoyMty()} onChange={(e) => setFecha(e.target.value)} />
          </Campo>
          <Campo id="pago-lugar" etiqueta="Dónde">
            <Select value={lugar} onValueChange={setLugar}>
              <SelectTrigger id="pago-lugar" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="banco">Banco</SelectItem>
                <SelectItem value="caja">Caja</SelectItem>
                <SelectItem value="en_persona">En persona</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
        </div>
        <Campo id="pago-ref" etiqueta="Referencia" ayuda="SPEI, autorización de la terminal, etc. Opcional">
          <Input id="pago-ref" value={referencia} onChange={(e) => setReferencia(e.target.value)} autoComplete="off" />
        </Campo>
        {valor > 0 && (
          <p className="flex items-start gap-2 rounded-xl border bg-hueso-2 px-3.5 py-3 text-[13px]">
            <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
            {queda <= 0 ? (
              <span>
                Después de registrar: saldo <b>$0</b> → la venta pasa a <b>Pagada</b>.
              </span>
            ) : (
              <span>
                Después de registrar queda un saldo de <b>{formatoMonedaCentavos(queda)}</b>.
              </span>
            )}
          </p>
        )}
        {error && (
          <p role="alert" className="flex items-center gap-2 rounded-xl bg-crit-bg px-3.5 py-2.5 text-sm font-semibold text-crit">
            <AlertTriangle className="size-4" aria-hidden />
            {error}
          </p>
        )}
      </DrawerCuerpo>
      <DrawerPie>
        <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button
          size="lg"
          disabled={guardando || valor <= 0}
          onClick={() =>
            iniciar(async () => {
              setError(null)
              const r = await registrarPagoVenta({ ventaId: venta.id, folio: venta.folio, monto: valor, metodo, lugar, referencia, fecha })
              if (r?.error) return setError(r.error)
              toast.success("Pago registrado")
              onOpenChange(false)
            })
          }
        >
          {guardando && <Loader2 className="animate-spin" aria-hidden />}
          Registrar {formatoMoneda(valor)}
        </Button>
      </DrawerPie>
    </Drawer>
  )
}

function CancelarDialogo({ abierto, onOpenChange, venta }: { abierto: boolean; onOpenChange: (v: boolean) => void; venta: VentaAcciones }) {
  const [motivo, setMotivo] = useState("")
  const [nota, setNota] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [guardando, iniciar] = useTransition()

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <span className="mb-1 inline-flex size-10 items-center justify-center rounded-xl bg-crit-bg text-crit">
            <AlertTriangle className="size-5" aria-hidden />
          </span>
          <DialogTitle className="text-[22px]">¿Cancelar la venta {venta.folio}?</DialogTitle>
          <DialogDescription>Esta acción no se puede deshacer. Pasa lo siguiente:</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1.5 text-[13.5px]">
          <li>· Las piezas regresan a su lote.</li>
          <li>· Se quitan sus avisos de recompra pendientes.</li>
          {venta.pagado > 0 && <li>· Lo pagado ({formatoMoneda(venta.pagado)}) queda como devolución pendiente en Pagos.</li>}
        </ul>
        <Campo id="cancelar-motivo" etiqueta="Motivo (obligatorio)">
          <Select value={motivo} onValueChange={setMotivo}>
            <SelectTrigger id="cancelar-motivo" className="w-full">
              <SelectValue placeholder="Elegir motivo" />
            </SelectTrigger>
            <SelectContent>
              {MOTIVOS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
        <Campo id="cancelar-nota" etiqueta="Nota">
          <Input id="cancelar-nota" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. vial roto al entregar" />
        </Campo>
        {error && (
          <p role="alert" className="text-[12.5px] font-semibold text-crit">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Volver
          </Button>
          <Button
            className="bg-crit text-white hover:bg-crit/90"
            disabled={!motivo || guardando}
            onClick={() =>
              iniciar(async () => {
                setError(null)
                const r = await cancelarVentaAccion(venta.id, venta.folio, motivo, nota)
                if (r?.error) return setError(r.error)
                toast.success(`${venta.folio} cancelada`)
                onOpenChange(false)
              })
            }
          >
            {guardando && <Loader2 className="animate-spin" aria-hidden />}
            Cancelar venta {venta.folio}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
