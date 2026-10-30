"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { AlertTriangle, ArrowRight, Loader2, Plus, Users } from "lucide-react"
import { toast } from "sonner"

import { Drawer, DrawerCuerpo, DrawerPie } from "@/components/app/drawer"
import { Estado } from "@/components/app/estado"
import { Segmentado } from "@/components/app/segmentado"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatoMoneda } from "@/lib/format"
import { formatoWhatsapp } from "@/lib/telefono"
import { cn } from "@/lib/utils"

import { PersonaDrawer } from "../configuracion/persona-drawer"
import { solicitarAlta } from "./actions"
import type { MiembroRed } from "./datos"

const iniciales = (n: string) =>
  n
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")

export function RedVista({ red, esAdmin }: { red: MiembroRed[]; esAdmin: boolean }) {
  const [abierto, setAbierto] = useState(false)
  const [revisando, setRevisando] = useState<MiembroRed | null>(null)
  const [vuelta, setVuelta] = useState(0)
  const [verBajas, setVerBajas] = useState(false)

  const visibles = red.filter((p) => verBajas || p.estado !== "baja")
  const porAprobar = visibles.filter((p) => p.estado === "por_aprobar")
  const distribuidores = visibles.filter((p) => p.perfil === "distribuidor" && p.estado !== "por_aprobar").sort((a, b) => b.vendidoMes - a.vendidoMes || a.nombre.localeCompare(b.nombre, "es"))
  const equipoDe = (id: string) => visibles.filter((p) => p.perfil === "comisionista" && p.distribuidor_id === id && p.estado !== "por_aprobar")
  const sinDistribuidor = visibles.filter((p) => p.perfil === "comisionista" && p.estado !== "por_aprobar" && !distribuidores.some((d) => d.id === p.distribuidor_id))
  const distribuidoresActivos = red.filter((p) => p.perfil === "distribuidor" && p.estado === "activo")

  function abrir(p: MiembroRed | null) {
    setRevisando(p)
    setVuelta((v) => v + 1)
    setAbierto(true)
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[13px] font-semibold text-muted-foreground">
          <input type="checkbox" checked={verBajas} onChange={(e) => setVerBajas(e.target.checked)} className="size-4 accent-[var(--color-espresso)]" />
          Ver dados de baja
        </label>
        <div className="flex-1" />
        <Button size="lg" onClick={() => abrir(null)}>
          <Plus aria-hidden />
          Alta en la red
        </Button>
      </div>

      {porAprobar.length > 0 && (
        <section aria-label="Altas por aprobar" className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <AlertTriangle className="size-4 text-warn" aria-hidden />
            {porAprobar.length === 1 ? "1 alta por aprobar" : `${porAprobar.length} altas por aprobar`}
          </h2>
          {porAprobar.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 border-t pt-2">
              <span className="inline-flex size-8 items-center justify-center rounded-full bg-hueso text-[11px] font-extrabold">{iniciales(p.nombre)}</span>
              <div className="flex-1">
                <b className="text-[14px]">{p.nombre}</b>
                <span className="block text-[12px] text-muted-foreground">
                  {p.perfil === "distribuidor" ? "Distribuidor" : `Comisionista de ${red.find((d) => d.id === p.distribuidor_id)?.nombre ?? "—"}`}
                  {p.creado_por && ` · lo pidió ${red.find((d) => d.id === p.creado_por)?.nombre ?? "el admin comercial"}`}
                </span>
              </div>
              <Estado tipo="warn">Por aprobar</Estado>
              {esAdmin ? (
                <Button variant="outline" size="sm" onClick={() => abrir(p)}>
                  Revisar
                </Button>
              ) : (
                <span className="text-[12px] text-muted-foreground">La aprueba el administrador</span>
              )}
            </div>
          ))}
        </section>
      )}

      {distribuidores.length === 0 && sinDistribuidor.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card px-6 py-14 text-center">
          <span className="inline-flex size-11 items-center justify-center rounded-xl bg-hueso">
            <Users className="size-5" aria-hidden />
          </span>
          <h2 className="text-xl font-medium">Aún no hay red comercial</h2>
          <p className="max-w-md text-sm text-muted-foreground">Da de alta a los distribuidores; ellos agregan a sus comisionistas desde su app y tú apruebas cada alta.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-4 border-b bg-hueso-2 px-4 py-2 text-[12px] font-semibold text-muted-foreground">
            <span>Persona</span>
            <span className="w-24 text-right">Vendido · mes</span>
            <span className="w-24 text-right">Comisión</span>
            <span className="w-28">Estado</span>
            <span className="w-10" />
          </div>
          <ul>
            {[...distribuidores.map((d) => [d, equipoDe(d.id)] as const), ...(sinDistribuidor.length ? [[null, sinDistribuidor] as const] : [])].map(([d, equipo]) => (
              <li key={d?.id ?? "sin"} className="border-b last:border-b-0">
                {d ? <Fila p={d} /> : <p className="px-4 pt-3 text-[12px] font-semibold text-muted-foreground">Comisionistas sin distribuidor activo</p>}
                {equipo.map((c) => (
                  <Fila key={c.id} p={c} anidado />
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[12px] text-muted-foreground">Las comisiones se generan cuando el pago de la venta se refleja: 13% a quien vendió y 3% a su distribuidor si vendió un comisionista.</p>

      {esAdmin ? (
        <PersonaDrawer key={vuelta} abierto={abierto} onOpenChange={setAbierto} persona={revisando} distribuidores={distribuidoresActivos} perfilInicial="comisionista" />
      ) : (
        <SolicitudDrawer key={vuelta} abierto={abierto} onOpenChange={setAbierto} distribuidores={distribuidoresActivos} />
      )}
    </>
  )
}

function Fila({ p, anidado }: { p: MiembroRed; anidado?: boolean }) {
  return (
    <Link href={`/red/${p.id}`} className={cn("grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-4 px-4 py-2.5 hover:bg-hueso-2 focus-visible:bg-hueso-2 focus-visible:outline-none", p.estado === "baja" && "text-muted-foreground")}>
      <span className={cn("flex items-center gap-2.5", anidado && "pl-7")}>
        {anidado && <span className="-ml-4 text-muted-foreground" aria-hidden>└</span>}
        <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold", p.perfil === "distribuidor" ? "bg-[#dce6d8]" : "bg-hueso")}>{iniciales(p.nombre)}</span>
        <span>
          <b className="text-[14px] font-semibold">{p.nombre}</b>
          <span className="block text-[12px] text-muted-foreground">
            {p.perfil === "distribuidor" ? "Distribuidor" : "Comisionista"}
            {p.zona && ` · ${p.zona}`} · {formatoWhatsapp(p.whatsapp)}
          </span>
        </span>
      </span>
      <span className="num w-24 text-right font-semibold">{formatoMoneda(p.vendidoMes)}</span>
      <span className="num w-24 text-right text-[13px]">{formatoMoneda(p.comisionMes)}</span>
      <span className="w-28">
        {p.estado === "baja" ? <Estado tipo="neutro">Baja</Estado> : p.esperando > 0 ? <Estado tipo="warn">{`${p.esperando} en camino`}</Estado> : <Estado tipo="ok">Activo</Estado>}
      </span>
      <ArrowRight className="size-4 w-10 text-muted-foreground" aria-hidden />
    </Link>
  )
}

function SolicitudDrawer({ abierto, onOpenChange, distribuidores }: { abierto: boolean; onOpenChange: (v: boolean) => void; distribuidores: MiembroRed[] }) {
  const [perfil, setPerfil] = useState<"distribuidor" | "comisionista">("comisionista")
  const [nombre, setNombre] = useState("")
  const [whatsapp, setWhatsapp] = useState("")
  const [zona, setZona] = useState("")
  const [distribuidorId, setDistribuidorId] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [enviando, iniciar] = useTransition()

  return (
    <Drawer abierto={abierto} onOpenChange={onOpenChange} titulo="Alta en la red" descripcion="Se envía a aprobación del administrador">
      <DrawerCuerpo>
        <Segmentado
          name="perfil-red"
          etiqueta="Perfil"
          valor={perfil}
          onChange={setPerfil}
          opciones={[
            { valor: "distribuidor", texto: "Distribuidor" },
            { valor: "comisionista", texto: "Comisionista" },
          ]}
        />
        <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold">
          Nombre completo
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold">
            WhatsApp
            <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} type="tel" inputMode="tel" autoComplete="off" />
          </label>
          <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold">
            Zona
            <Input value={zona} onChange={(e) => setZona(e.target.value)} autoComplete="off" />
          </label>
        </div>
        {perfil === "comisionista" && (
          <div className="flex flex-col gap-1.5 text-[12.5px] font-semibold">
            Distribuidor al que pertenece
            <Select value={distribuidorId} onValueChange={setDistribuidorId}>
              <SelectTrigger className="w-full" aria-label="Distribuidor">
                <SelectValue placeholder="Elegir" />
              </SelectTrigger>
              <SelectContent>
                {distribuidores.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <p className="rounded-xl border bg-hueso-2 px-3.5 py-3 text-[13px]">
          <b>Comisión fija:</b> 13% por venta{perfil === "comisionista" ? "; su distribuidor recibe 3% de sus ventas" : ""}. Mientras no se apruebe no puede entrar ni vender.
        </p>
        {error && (
          <p role="alert" className="text-[12.5px] font-semibold text-crit">
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
          disabled={enviando}
          onClick={() =>
            iniciar(async () => {
              setError(null)
              const r = await solicitarAlta({ perfil, nombre, whatsapp, zona, distribuidorId })
              if (r.error) return setError(r.error)
              toast.success("Alta enviada a aprobación")
              onOpenChange(false)
            })
          }
        >
          {enviando && <Loader2 className="animate-spin" aria-hidden />}
          Enviar a aprobación
        </Button>
      </DrawerPie>
    </Drawer>
  )
}
