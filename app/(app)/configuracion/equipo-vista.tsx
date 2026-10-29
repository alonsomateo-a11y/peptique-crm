"use client"

import { useState } from "react"
import { AlertTriangle, Plus } from "lucide-react"

import { Estado } from "@/components/app/estado"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PERFIL_INFO, PERFILES } from "@/lib/perfiles"
import { cn } from "@/lib/utils"

import { PersonaDrawer } from "./persona-drawer"
import type { PersonaFila } from "./tipos"

const iniciales = (n: string) =>
  n
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")

export function EstadoPersona({ p }: { p: PersonaFila }) {
  if (p.estado === "baja") return <Estado tipo="neutro">Baja</Estado>
  if (p.estado === "por_aprobar") return <Estado tipo="warn">Por aprobar</Estado>
  if (p.bloqueado) return <Estado tipo="crit">PIN bloqueado</Estado>
  if (!p.tienePin || !p.tieneAcceso) return <Estado tipo="warn">Sin PIN</Estado>
  if (p.vencido) return <Estado tipo="neutro">Vencido</Estado>
  return <Estado tipo="ok">Activo</Estado>
}

export function EquipoVista({ personas }: { personas: PersonaFila[] }) {
  const [abierto, setAbierto] = useState(false)
  const [editando, setEditando] = useState<PersonaFila | null>(null)
  const porAprobar = personas.filter((p) => p.estado === "por_aprobar")
  const orden = [...personas].sort(
    (a, b) =>
      Number(b.estado === "por_aprobar") - Number(a.estado === "por_aprobar") ||
      Number(a.estado === "baja") - Number(b.estado === "baja") ||
      PERFILES.indexOf(a.perfil) - PERFILES.indexOf(b.perfil) ||
      a.nombre.localeCompare(b.nombre, "es"),
  )
  const distribuidores = personas.filter((p) => p.perfil === "distribuidor" && p.estado === "activo")

  function abrir(p: PersonaFila | null) {
    setEditando(p)
    setAbierto(true)
  }

  return (
    <section aria-labelledby="titulo-equipo" className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <h2 id="titulo-equipo" className="text-xl font-medium">
            Equipo y permisos
          </h2>
          <p className="text-[12.5px] text-muted-foreground">Seis perfiles · cada persona entra con su PIN de 4 números</p>
        </div>
        <Button size="lg" onClick={() => abrir(null)}>
          <Plus aria-hidden />
          Persona
        </Button>
      </div>

      {porAprobar.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border bg-card px-3.5 py-3">
          <span className="inline-flex size-8 items-center justify-center rounded-[9px] bg-warn-bg text-warn">
            <AlertTriangle className="size-4" aria-hidden />
          </span>
          <div className="flex-1 text-sm">
            <b>
              {porAprobar.length === 1 ? "1 alta por aprobar" : `${porAprobar.length} altas por aprobar`}
            </b>
            <div className="text-[11.5px] text-muted-foreground">Las pidió un distribuidor. Asigna un PIN para activarlas.</div>
          </div>
          <Button variant="outline" size="sm" onClick={() => abrir(porAprobar[0])}>
            Revisar
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-hueso-2 hover:bg-hueso-2">
              <TableHead>Persona</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead className="hidden lg:table-cell">Puede</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orden.map((p) => (
              <TableRow key={p.id} className={cn(p.estado === "baja" && "text-muted-foreground")}>
                <TableCell>
                  <span className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        "inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold text-foreground",
                        p.perfil === "distribuidor" || p.perfil === "comisionista" ? "bg-[#dce6d8]" : "bg-bruma",
                      )}
                    >
                      {iniciales(p.nombre)}
                    </span>
                    <span>
                      <b className="font-semibold">
                        {p.nombre}
                        {p.esYo && <span className="font-normal text-muted-foreground"> (tú)</span>}
                      </b>
                      <span className="block text-[11.5px] text-muted-foreground">
                        {p.whatsapp}
                        {p.zona && ` · ${p.zona}`}
                      </span>
                    </span>
                  </span>
                </TableCell>
                <TableCell>
                  <span className="rounded-full bg-hueso px-2.5 py-0.5 text-[11.5px] font-semibold text-[#5c544c]">{PERFIL_INFO[p.perfil].nombre}</span>
                </TableCell>
                <TableCell className="hidden max-w-xs text-[12.5px] whitespace-normal lg:table-cell">{PERFIL_INFO[p.perfil].puede}</TableCell>
                <TableCell>
                  <EstadoPersona p={p} />
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="link" size="sm" onClick={() => abrir(p)} aria-label={`Editar a ${p.nombre}`}>
                    {p.estado === "por_aprobar" ? "Revisar" : "Editar"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <PersonaDrawer key={editando?.id ?? "nueva"} abierto={abierto} onOpenChange={setAbierto} persona={editando} distribuidores={distribuidores} />
    </section>
  )
}
