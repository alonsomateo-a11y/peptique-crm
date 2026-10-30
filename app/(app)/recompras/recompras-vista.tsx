"use client"

import Link from "next/link"
import { useMemo, useState, useTransition } from "react"
import { Check, Download, MessageCircle, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { Estado, type TipoEstado } from "@/components/app/estado"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { descargarCsv } from "@/lib/csv"
import { formatoFecha } from "@/lib/format"
import { formatoWhatsapp, ligaWhatsapp } from "@/lib/telefono"
import { cn } from "@/lib/utils"

import { cambiarAviso } from "./actions"
import type { Aviso, EstadoAviso } from "./datos"

const PESTANAS: [EstadoAviso, string][] = [
  ["por_avisar", "Por avisar"],
  ["contactado", "Contactados"],
  ["recompro", "Recompraron"],
  ["sin_recompra", "Sin recompra"],
  ["no_contactar", "No contactar"],
]

const fecha = (d: string) => formatoFecha(new Date(`${d}T12:00:00-06:00`))

function estadoVisible(a: Aviso, diasAviso: number): [string, TipoEstado] {
  if (a.estado === "contactado") return ["Contactado", "ok"]
  if (a.estado === "recompro") return ["Recompró", "ok"]
  if (a.estado === "sin_recompra") return ["Sin recompra", "crit"]
  if (a.estado === "no_contactar") return ["No contactar", "neutro"]
  if (a.dias <= 0) return ["Hoy", "warn"]
  if (a.dias <= diasAviso) return [a.dias === 1 ? "Mañana" : `En ${a.dias} días`, "warn"]
  return [`En ${a.dias} días`, "neutro"]
}

export function RecomprasVista({ avisos, diasAviso, pestanaInicial }: { avisos: Aviso[]; diasAviso: number; pestanaInicial?: string }) {
  const [pestana, setPestana] = useState<EstadoAviso>(PESTANAS.find(([v]) => v === pestanaInicial)?.[0] ?? "por_avisar")
  const filas = useMemo(() => avisos.filter((a) => a.estado === pestana), [avisos, pestana])
  const [elegidoId, setElegidoId] = useState<string | null>(null)
  const elegido = filas.find((a) => a.id === elegidoId) ?? filas[0] ?? null
  const [ocupado, iniciar] = useTransition()

  function cambiar(a: Aviso, estado: "contactado" | "no_contactar" | "por_avisar", exito: string) {
    iniciar(async () => {
      const r = await cambiarAviso(a.id, estado)
      if (r.error) toast.error(r.error)
      else toast.success(exito)
    })
  }

  function descargar() {
    descargarCsv(`recompras-${pestana}.csv`, [
      ["Cliente", "WhatsApp", "Producto", "Se le acaba", "Siguiente etapa", "Le vendió", "Estado"],
      ...filas.map((a) => [a.cliente, a.whatsapp, a.producto, a.seLeAcaba, a.siguienteEtapa, a.vendedor, estadoVisible(a, diasAviso)[0]]),
    ])
  }

  const mensaje = (a: Aviso) =>
    `Hola ${a.cliente.split(" ")[0]}, te escribimos de Peptique. Tu ${a.producto} está por terminarse${a.dias > 0 ? ` (cerca del ${fecha(a.seLeAcaba)})` : ""}.${a.siguienteEtapa ? ` Te toca la etapa ${a.siguienteEtapa} de tu protocolo.` : ""} ¿Te lo apartamos?`

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Estado del aviso" className="flex flex-1 flex-wrap gap-1 border-b">
          {PESTANAS.map(([v, t]) => {
            const n = avisos.filter((a) => a.estado === v).length
            return (
              <button
                key={v}
                role="tab"
                type="button"
                aria-selected={pestana === v}
                onClick={() => {
                  setPestana(v)
                  setElegidoId(null)
                }}
                className={cn("-mb-px inline-flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-[13px] font-semibold text-muted-foreground", pestana === v && "border-espresso text-foreground", v === "sin_recompra" && n > 0 && "text-crit")}
              >
                {t}
                {n > 0 && <em className="rounded-full bg-hueso px-1.5 text-[11px] not-italic">{n}</em>}
              </button>
            )
          })}
        </div>
        <Button variant="outline" size="lg" onClick={descargar} disabled={!filas.length}>
          <Download aria-hidden />
          Descargar
        </Button>
      </div>

      {avisos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card px-6 py-14 text-center">
          <span className="inline-flex size-11 items-center justify-center rounded-xl bg-hueso">
            <RefreshCw className="size-5" aria-hidden />
          </span>
          <h2 className="text-xl font-medium">Aún no hay avisos</h2>
          <p className="max-w-md text-sm text-muted-foreground">Se crean solos con cada venta de un producto que tiene protocolo con duración: el sistema calcula cuándo se le acaba y avisa al equipo antes.</p>
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[1fr_380px]">
          <div className="overflow-hidden rounded-2xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-hueso-2 hover:bg-hueso-2">
                  <TableHead>Cliente</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Se le acaba</TableHead>
                  <TableHead>Le vendió</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((a) => {
                  const [texto, tipo] = estadoVisible(a, diasAviso)
                  return (
                    <TableRow key={a.id} data-state={elegido?.id === a.id ? "selected" : undefined} className="cursor-pointer" onClick={() => setElegidoId(a.id)}>
                      <TableCell>
                        <button type="button" className="text-left font-semibold hover:underline" onClick={() => setElegidoId(a.id)}>
                          {a.cliente}
                        </button>
                      </TableCell>
                      <TableCell className="text-[13px]">{a.producto}</TableCell>
                      <TableCell className="text-[13px]">{fecha(a.seLeAcaba)}</TableCell>
                      <TableCell className="text-[13px]">{a.vendedor ?? "—"}</TableCell>
                      <TableCell>
                        <Estado tipo={tipo}>{texto}</Estado>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {filas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      Nada en esta pestaña.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {elegido && (
            <aside aria-label={`Aviso de ${elegido.cliente}`} className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
              <div className="flex items-baseline gap-2">
                <Link href={`/clientes/${elegido.clienteId}`} className="flex-1 text-[16px] font-semibold hover:underline">
                  {elegido.cliente}
                </Link>
                <span className="text-[12px] text-muted-foreground">{formatoWhatsapp(elegido.whatsapp)}</span>
              </div>
              <span className="text-[12px] text-muted-foreground">
                Aviso interno{elegido.vendedor ? ` · le vendió ${elegido.vendedor}` : ""}
                {elegido.contactadoPor && ` · contactó ${elegido.contactadoPor}`}
              </span>
              <p className="rounded-xl border bg-hueso-2 px-3.5 py-3 text-[13.5px]">
                {elegido.producto} se le {elegido.dias < 0 ? "terminó" : "termina"} el <b>{fecha(elegido.seLeAcaba)}</b>.
                {elegido.siguienteEtapa && ` En su recompra le toca el protocolo de etapa ${elegido.siguienteEtapa}.`}
              </p>
              {!elegido.aceptaWhatsapp && <p className="text-[12px] font-semibold text-warn">No aceptó mensajes por WhatsApp. Confírmalo antes de escribirle.</p>}
              {elegido.estado !== "no_contactar" && elegido.estado !== "recompro" && (
                <>
                  <Button size="lg" asChild>
                    <a href={ligaWhatsapp(elegido.whatsapp, mensaje(elegido))} target="_blank" rel="noopener noreferrer">
                      <MessageCircle aria-hidden />
                      Escribir por WhatsApp
                    </a>
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" disabled={ocupado || elegido.estado === "contactado"} onClick={() => cambiar(elegido, "contactado", `${elegido.cliente} marcado contactado`)}>
                      <Check aria-hidden />
                      {elegido.estado === "contactado" ? "Contactado" : "Marcar contactado"}
                    </Button>
                    <Button variant="outline" disabled={ocupado} onClick={() => cambiar(elegido, "no_contactar", `${elegido.cliente}: no contactar`)}>
                      No contactar
                    </Button>
                  </div>
                  <span className="text-[11.5px] text-muted-foreground">Abre su chat con un mensaje sugerido; lo envía la persona, no el sistema.</span>
                </>
              )}
              {elegido.estado === "no_contactar" && (
                <Button variant="outline" disabled={ocupado} onClick={() => cambiar(elegido, "por_avisar", "Regresó a por avisar")}>
                  Volver a avisar
                </Button>
              )}
            </aside>
          )}
        </div>
      )}
    </>
  )
}
