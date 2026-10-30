"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { AlertTriangle, Loader2, Minus, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Drawer, DrawerCuerpo, DrawerPie } from "@/components/app/drawer"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { formatoMoneda, formatoMonedaCentavos } from "@/lib/format"
import { formatoWhatsapp } from "@/lib/telefono"

import type { ClienteMostrador, ProductoMostrador } from "../../(mostrador)/mostrador/tipos"
import { crearPedido } from "./actions"
import { ligaVenta } from "./tipos"

const NOMBRE_TIPO = { paciente: "Paciente · precio público", medico: "Médico · precio médico", distribuidor: "Distribuidor · precio distribuidor" }

export function PedidoDrawer({
  abierto,
  onOpenChange,
  productos,
  clientes,
}: {
  abierto: boolean
  onOpenChange: (v: boolean) => void
  productos: ProductoMostrador[]
  clientes: ClienteMostrador[]
}) {
  const router = useRouter()
  const [textoCliente, setTextoCliente] = useState("")
  const [buscar, setBuscar] = useState("")
  const [lineas, setLineas] = useState<Record<string, number>>({})
  const [nota, setNota] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [guardando, iniciar] = useTransition()

  const opciones = clientes.map((c) => ({ c, texto: `${c.nombre} · ${formatoWhatsapp(c.whatsapp)}` }))
  const cliente = opciones.find((o) => o.texto === textoCliente)?.c ?? null
  const tipo = cliente?.tipo ?? "paciente"
  const elegidos = Object.entries(lineas)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => ({ p: productos.find((x) => x.id === id)!, n }))
  const total = elegidos.reduce((s, { p, n }) => s + (p.precios[tipo] ?? 0) * n, 0)
  const t = buscar.trim().toLowerCase()
  const sugeridos = t ? productos.filter((p) => `${p.nombre} ${p.presentacion}`.toLowerCase().includes(t)).slice(0, 6) : []
  const agregar = (id: string) => {
    setLineas((l) => ({ ...l, [id]: (l[id] ?? 0) + 1 }))
    setBuscar("")
  }

  function crear() {
    setError(null)
    if (!cliente) return setError("Elige un cliente de la lista.")
    iniciar(async () => {
      const r = await crearPedido({ clienteId: cliente.id, items: elegidos.map(({ p, n }) => ({ productoId: p.id, cantidad: n })), nota })
      if (r?.error) return setError(r.error)
      toast.success(`Pedido ${r?.folio} creado`)
      onOpenChange(false)
      if (r?.folio) router.push(ligaVenta(r.folio))
    })
  }

  return (
    <Drawer abierto={abierto} onOpenChange={onOpenChange} titulo="Nuevo pedido" descripcion="Médicos y distribuidores · se aparta el inventario y se cobra después">
      <DrawerCuerpo>
        <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold">
          Cliente
          <Input list="pedido-clientes" value={textoCliente} onChange={(e) => setTextoCliente(e.target.value)} placeholder="Nombre o WhatsApp" autoComplete="off" />
          <datalist id="pedido-clientes">
            {opciones.map((o) => (
              <option key={o.c.id} value={o.texto} />
            ))}
          </datalist>
          <span className="font-normal text-muted-foreground">{cliente ? `${NOMBRE_TIPO[cliente.tipo]} (se aplica solo)` : "Si es nuevo, dalo de alta en Clientes."}</span>
        </label>

        <div className="flex flex-col gap-2">
          <b className="text-[13px]">Productos</b>
          {elegidos.map(({ p, n }) => (
            <div key={p.id} className="flex items-center gap-3 border-b py-2 text-[13px]">
              <div className="flex-1">
                <b>
                  {p.nombre} {p.presentacion}
                </b>
                <span className="block text-[11.5px] text-muted-foreground">Quedan {p.general}</span>
              </div>
              <div className="flex items-center rounded-lg border">
                <button type="button" aria-label="Una menos" onClick={() => setLineas((l) => ({ ...l, [p.id]: n - 1 }))} className="inline-flex size-8 items-center justify-center">
                  {n === 1 ? <Trash2 className="size-3.5" aria-hidden /> : <Minus className="size-3.5" aria-hidden />}
                </button>
                <b className="num w-6 text-center">{n}</b>
                <button type="button" aria-label="Una más" disabled={n >= p.general} onClick={() => setLineas((l) => ({ ...l, [p.id]: n + 1 }))} className="inline-flex size-8 items-center justify-center disabled:opacity-40">
                  <Plus className="size-3.5" aria-hidden />
                </button>
              </div>
              <span className="num w-16 text-right text-muted-foreground">{formatoMoneda(p.precios[tipo] ?? 0)}</span>
              <b className="num w-20 text-right">{formatoMoneda((p.precios[tipo] ?? 0) * n)}</b>
            </div>
          ))}
          <Input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && sugeridos[0] && sugeridos[0].general > 0) {
                e.preventDefault()
                agregar(sugeridos[0].id)
              }
            }}
            placeholder="Buscar producto · Enter agrega"
            aria-label="Buscar producto para agregar"
          />
          {sugeridos.length > 0 && (
            <ul className="flex flex-col divide-y rounded-xl border">
              {sugeridos.map((p) => (
                <li key={p.id}>
                  <button type="button" disabled={p.general === 0 || p.precios[tipo] === null} onClick={() => agregar(p.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] hover:bg-hueso-2 disabled:opacity-50">
                    <b className="flex-1">
                      {p.nombre} {p.presentacion}
                    </b>
                    <span className="text-[11.5px] text-muted-foreground">{p.general ? `Quedan ${p.general}` : "Agotado"}</span>
                    <b className="num">{p.precios[tipo] === null ? "sin precio" : formatoMoneda(p.precios[tipo]!)}</b>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold">
          Nota para el equipo
          <Textarea value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} rows={2} placeholder="Ej. para consultorio, factura después" />
        </label>

        {error && (
          <p role="alert" className="flex items-center gap-2 rounded-xl bg-crit-bg px-3.5 py-2.5 text-sm font-semibold text-crit">
            <AlertTriangle className="size-4" aria-hidden />
            {error}
          </p>
        )}
      </DrawerCuerpo>
      <DrawerPie>
        <div className="mr-auto">
          <span className="block text-[11.5px] text-muted-foreground">Total (IVA incluido)</span>
          <b className="num text-lg">{formatoMonedaCentavos(total)}</b>
        </div>
        <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button size="lg" disabled={!elegidos.length || guardando} onClick={crear}>
          {guardando && <Loader2 className="animate-spin" aria-hidden />}
          Crear pedido {total ? formatoMoneda(total) : ""}
        </Button>
      </DrawerPie>
    </Drawer>
  )
}
