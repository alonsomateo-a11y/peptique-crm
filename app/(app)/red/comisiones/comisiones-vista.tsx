"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { AlertTriangle, Check, Download, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { descargarCsv } from "@/lib/csv"
import { formatoFecha, formatoMoneda } from "@/lib/format"

import { deshacerPagoComisiones, pagarComisiones } from "../actions"
import type { PagoHecho, PorPagar } from "./datos"

const ventas = (n: number) => (n === 1 ? "1 venta" : `${n} ventas`)

function descargar(porPagar: PorPagar[]) {
  descargarCsv("comisiones-por-pagar.csv", [
    ["Persona", "Folio", "Fecha", "Cliente", "Tipo", "Porcentaje", "Venta", "Comisión"],
    ...porPagar.flatMap((p) => p.filas.map((f) => [p.nombre, f.folio, formatoFecha(new Date(f.fecha)), f.cliente, f.tipo === "directa" ? "Directa" : "De equipo", f.porcentaje, f.totalVenta, f.monto])),
  ])
}

export function ComisionesVista({ porPagar, pagos, esAdmin }: { porPagar: PorPagar[]; pagos: PagoHecho[]; esAdmin: boolean }) {
  const [pagando, setPagando] = useState<PorPagar | null>(null)
  const [ocupado, iniciar] = useTransition()

  function confirmar() {
    if (!pagando) return
    iniciar(async () => {
      const r = await pagarComisiones(
        pagando.personaId,
        pagando.filas.map((f) => f.id),
      )
      if (r.error) toast.error(r.error)
      else toast.success(`Comisión de ${pagando.nombre} marcada como pagada`)
      setPagando(null)
    })
  }

  function deshacer(p: PagoHecho) {
    iniciar(async () => {
      const r = await deshacerPagoComisiones(p.personaId, p.pagadaEn)
      if (r.error) toast.error(r.error)
      else toast.success("El pago se deshizo; la comisión vuelve a estar por pagar")
    })
  }

  return (
    <>
      <section aria-labelledby="titulo-por-pagar" className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="titulo-por-pagar" className="flex-1 text-xl font-medium">
            Por persona
          </h2>
          {porPagar.length > 0 && (
            <Button variant="outline" onClick={() => descargar(porPagar)}>
              <Download aria-hidden />
              Descargar
            </Button>
          )}
        </div>
        {porPagar.length === 0 && <p className="py-6 text-center text-[13.5px] text-muted-foreground">No hay comisiones por pagar.</p>}
        <ul className="flex flex-col divide-y">
          {porPagar.map((p) => (
            <li key={p.personaId} className="py-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-40 flex-1">
                  <Link href={`/red/${p.personaId}`} className="text-[14.5px] font-semibold hover:underline">
                    {p.nombre}
                  </Link>
                  <span className="block text-[12px] text-muted-foreground">
                    {p.perfil === "distribuidor" ? "Distribuidor" : "Comisionista"} · {ventas(p.filas.length)}
                    {p.equipo > 0 && ` · ${formatoMoneda(p.equipo)} de su equipo`}
                  </span>
                </div>
                <b className="num text-[17px]">{formatoMoneda(p.total)}</b>
                {esAdmin && (
                  <Button onClick={() => setPagando(p)} disabled={ocupado}>
                    <Check aria-hidden />
                    Marcar pagada
                  </Button>
                )}
              </div>
              <details className="mt-1.5 text-[12.5px]">
                <summary className="cursor-pointer font-semibold text-muted-foreground">Ver ventas</summary>
                <div className="mt-2 overflow-x-auto rounded-xl border">
                  <table className="w-full min-w-[520px]">
                    <thead className="bg-hueso-2 text-left text-[11.5px] text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Venta</th>
                        <th className="px-3 py-2 font-semibold">Fecha</th>
                        <th className="px-3 py-2 font-semibold">Cliente</th>
                        <th className="px-3 py-2 font-semibold">Tipo</th>
                        <th className="px-3 py-2 text-right font-semibold">Comisión</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {p.filas.map((f) => (
                        <tr key={f.id}>
                          <td className="px-3 py-2">
                            <Link href={`/ventas/${f.folio}`} className="font-semibold hover:underline">
                              {f.folio}
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{formatoFecha(new Date(f.fecha))}</td>
                          <td className="px-3 py-2">{f.cliente}</td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {f.tipo === "directa" ? "Directa" : "De equipo"} · {f.porcentaje}% de {formatoMoneda(f.totalVenta)}
                          </td>
                          <td className="num px-3 py-2 text-right">{formatoMoneda(f.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="titulo-pagos" className="flex flex-col gap-2 rounded-2xl border bg-card p-5">
        <h2 id="titulo-pagos" className="text-xl font-medium">
          Ya pagadas
        </h2>
        {pagos.length === 0 && <p className="py-4 text-center text-[13.5px] text-muted-foreground">Aún no se marca ningún pago.</p>}
        <ul className="flex flex-col divide-y">
          {pagos.map((p) => (
            <li key={`${p.personaId}${p.pagadaEn}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-[13.5px]">
              <div className="min-w-40 flex-1">
                <b className="font-semibold">{p.nombre}</b>
                <span className="block text-[12px] text-muted-foreground">
                  {formatoFecha(new Date(p.pagadaEn))} · {ventas(p.ventas)}
                </span>
                {p.canceladas > 0 && (
                  <span className="mt-0.5 flex items-center gap-1 text-[12px] font-semibold text-warn">
                    <AlertTriangle className="size-3.5" aria-hidden />
                    {p.canceladas === 1 ? "1 venta se canceló" : `${p.canceladas} ventas se cancelaron`} después de pagar: descuéntalo a mano.
                  </span>
                )}
              </div>
              <b className="num">{formatoMoneda(p.total)}</b>
              {esAdmin && (
                <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => deshacer(p)}>
                  Deshacer
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <Dialog open={!!pagando} onOpenChange={(a) => !a && !ocupado && setPagando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Marcar como pagada?</DialogTitle>
            <DialogDescription>
              {pagando && `${formatoMoneda(pagando.total)} a ${pagando.nombre} por ${ventas(pagando.filas.length)}. Solo se registra aquí: el CRM no hace la transferencia. La persona lo ve en su app.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPagando(null)} disabled={ocupado}>
              Volver
            </Button>
            <Button onClick={confirmar} disabled={ocupado}>
              {ocupado && <Loader2 className="animate-spin" aria-hidden />}
              Marcar pagada
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
