"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Estado } from "@/components/app/estado"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Segmentado } from "@/components/app/segmentado"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatoMoneda } from "@/lib/format"

import { ligaVenta } from "../ventas/tipos"
import { entregarRed, reflejarPagoRed } from "./actions"

export type VentaRed = {
  id: string
  folio: string
  estado: "esperando_pago" | "pagada"
  total: number
  cliente: string
  vendedor: string
  productos: string
  referencia: string | null
  /** Horas que faltan para liberar el apartado (negativo = ya venció). */
  horasRestantes: number | null
}

export function RedEnCamino({ ventas }: { ventas: VentaRed[] }) {
  const [reflejando, setReflejando] = useState<VentaRed | null>(null)
  const [ocupado, iniciar] = useTransition()

  return (
    <>
      <p className="flex items-center gap-2 text-[13px] font-semibold">Solo se entrega lo que ya se reflejó.</p>
      <div className="overflow-hidden rounded-2xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-hueso-2 hover:bg-hueso-2">
              <TableHead>Venta</TableHead>
              <TableHead>Vendió</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead>Referencia</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Pago</TableHead>
              <TableHead>
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ventas.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="font-mono text-[12px]">
                  <Link href={ligaVenta(v.folio)} className="hover:underline">
                    {v.folio}
                  </Link>
                </TableCell>
                <TableCell className="text-[13px]">{v.vendedor}</TableCell>
                <TableCell className="font-semibold">{v.cliente}</TableCell>
                <TableCell className="text-[12.5px]">{v.productos}</TableCell>
                <TableCell className="font-mono text-[12px]">{v.referencia ?? "—"}</TableCell>
                <TableCell className="num text-right font-semibold">{formatoMoneda(v.total)}</TableCell>
                <TableCell>
                  {v.estado === "pagada" ? (
                    <Estado tipo="ok">Reflejado</Estado>
                  ) : v.horasRestantes !== null && v.horasRestantes <= 6 ? (
                    <Estado tipo="crit">{`Se libera en ${Math.max(Math.ceil(v.horasRestantes), 0)} h`}</Estado>
                  ) : (
                    <Estado tipo="warn">{v.horasRestantes !== null ? `En camino · ${Math.ceil(v.horasRestantes)} h` : "En camino"}</Estado>
                  )}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {v.estado === "esperando_pago" ? (
                    <Button variant="outline" size="sm" onClick={() => setReflejando(v)}>
                      Marcar reflejado
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={ocupado}
                      onClick={() =>
                        iniciar(async () => {
                          const r = await entregarRed(v.id)
                          if (r.error) toast.error(r.error)
                          else toast.success(`${v.folio} entregada a ${v.vendedor}`)
                        })
                      }
                    >
                      Entregar
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {ventas.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  No hay ventas de la red en camino.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-[12px] text-muted-foreground">Si el pago no se refleja en el plazo, el apartado regresa al inventario solo. Mientras no esté conectado el banco, el pago reflejado se marca aquí.</p>
      <ReflejarDialogo venta={reflejando} onClose={() => setReflejando(null)} />
    </>
  )
}

function ReflejarDialogo({ venta, onClose }: { venta: VentaRed | null; onClose: () => void }) {
  const [metodo, setMetodo] = useState<"transferencia" | "tarjeta">("transferencia")
  const [referencia, setReferencia] = useState("")
  const [guardando, iniciar] = useTransition()
  return (
    <Dialog open={!!venta} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pago reflejado · {venta?.folio}</DialogTitle>
          <DialogDescription>
            {venta && `${formatoMoneda(venta.total)} de ${venta.cliente}. Se generan las comisiones y se habilita la entrega a ${venta.vendedor}.`}
          </DialogDescription>
        </DialogHeader>
        <Segmentado
          name="metodo-red"
          etiqueta="Cómo pagó"
          valor={metodo}
          onChange={setMetodo}
          opciones={[
            { valor: "transferencia", texto: "Transferencia" },
            { valor: "tarjeta", texto: "Terminal" },
          ]}
        />
        <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold">
          Referencia del banco o la terminal (opcional)
          <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder={venta?.referencia ?? ""} />
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Volver
          </Button>
          <Button
            disabled={guardando}
            onClick={() =>
              venta &&
              iniciar(async () => {
                const r = await reflejarPagoRed(venta.id, metodo, referencia)
                if (r.error) return void toast.error(r.error)
                toast.success(`${venta.folio} reflejado`)
                setReferencia("")
                onClose()
              })
            }
          >
            {guardando && <Loader2 className="animate-spin" aria-hidden />}
            Marcar reflejado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
