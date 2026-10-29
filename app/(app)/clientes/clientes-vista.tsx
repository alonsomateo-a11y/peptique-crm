"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { ArrowRight, Download, Plus, Search, Users, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatoFecha, formatoMoneda } from "@/lib/format"
import { formatoWhatsapp } from "@/lib/telefono"
import { cn } from "@/lib/utils"

import { ClienteDrawer } from "./cliente-drawer"
import { iniciales, NOMBRE_TIPO, TIPOS, type ClienteFila } from "./tipos"

type Orden = "compras" | "total" | "reciente" | "nombre"
type Ultima = "todas" | "30" | "60" | "90" | "nunca"
const TODOS = "todos"

export function ClientesVista({
  clientes,
  vendedores,
  ahora,
}: {
  clientes: ClienteFila[]
  vendedores: { id: string; nombre: string }[]
  /** Momento de la carga, para filtrar por última compra sin depender del reloj al dibujar. */
  ahora: number
}) {
  const [buscar, setBuscar] = useState("")
  const [etiquetas, setEtiquetas] = useState<string[]>([])
  const [tipo, setTipo] = useState(TODOS)
  const [vendedor, setVendedor] = useState(TODOS)
  const [ultima, setUltima] = useState<Ultima>("todas")
  const [orden, setOrden] = useState<Orden>("compras")
  const [abierto, setAbierto] = useState(false)

  const todasEtiquetas = useMemo(() => [...new Set(clientes.flatMap((c) => c.etiquetas))].sort((a, b) => a.localeCompare(b, "es")), [clientes])

  const filas = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    const digitos = q.replace(/\D/g, "")
    const lista = clientes.filter((c) => {
      if (q && !c.nombre.toLowerCase().includes(q) && !(digitos.length >= 3 && c.whatsapp.includes(digitos))) return false
      if (etiquetas.length && !etiquetas.every((e) => c.etiquetas.includes(e))) return false
      if (tipo !== TODOS && c.tipo !== tipo) return false
      if (vendedor !== TODOS && c.vendedor_id !== vendedor) return false
      if (ultima === "nunca") return !c.ultimaCompra
      if (ultima !== "todas") return !!c.ultimaCompra && ahora - Date.parse(c.ultimaCompra) <= Number(ultima) * 86_400_000
      return true
    })
    return lista.sort((a, b) =>
      orden === "nombre"
        ? a.nombre.localeCompare(b.nombre, "es")
        : orden === "total"
          ? b.total - a.total
          : orden === "reciente"
            ? (b.ultimaCompra ?? "").localeCompare(a.ultimaCompra ?? "")
            : b.compras - a.compras || b.total - a.total,
    )
  }, [clientes, buscar, etiquetas, tipo, vendedor, ultima, orden, ahora])

  function descargar(todos: boolean) {
    const lista = todos ? clientes : filas
    const celda = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`
    const csv = [
      ["Nombre", "WhatsApp", "Correo", "Tipo", "Etiquetas", "Origen", "Vendedor", "Waiver", "Compras", "Total comprado", "Última compra", "Alta"].join(","),
      ...lista.map((c) =>
        [c.nombre, c.whatsapp, c.correo, NOMBRE_TIPO[c.tipo], c.etiquetas.join("; "), c.origen, c.vendedor, c.waiver ? "Firmado" : "Pendiente", c.compras, c.total, c.ultimaCompra?.slice(0, 10), c.creado_en.slice(0, 10)]
          .map(celda)
          .join(","),
      ),
    ].join("\r\n")
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }))
    const a = Object.assign(document.createElement("a"), { href: url, download: todos ? "clientes-peptique.csv" : "clientes-peptique-filtrados.csv" })
    a.click()
    URL.revokeObjectURL(url)
  }

  const hayFiltros = etiquetas.length > 0 || tipo !== TODOS || vendedor !== TODOS || ultima !== "todas" || buscar.trim() !== ""

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-60">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-taupe" aria-hidden />
          <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Nombre o WhatsApp" aria-label="Buscar cliente por nombre o WhatsApp" className="h-9 bg-card pl-9" />
        </div>
        <Select value="" onValueChange={(v) => setEtiquetas((e) => (e.includes(v) ? e : [...e, v]))} disabled={!todasEtiquetas.length}>
          <SelectTrigger aria-label="Agregar filtro por etiqueta" className="h-9 bg-card">
            <span className="text-muted-foreground">Etiqueta</span>
            <SelectValue placeholder={todasEtiquetas.length ? "Agregar" : "Sin etiquetas"} />
          </SelectTrigger>
          <SelectContent>
            {todasEtiquetas.map((e) => (
              <SelectItem key={e} value={e} disabled={etiquetas.includes(e)}>
                {e}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Filtro etiqueta="Tipo" valor={tipo} onChange={setTipo} opciones={TIPOS.map((t) => ({ valor: t.valor, texto: t.texto }))} />
        <Filtro etiqueta="Vendedor" valor={vendedor} onChange={setVendedor} opciones={vendedores.map((v) => ({ valor: v.id, texto: v.nombre }))} />
        <Filtro
          etiqueta="Última compra"
          valor={ultima}
          onChange={(v) => setUltima(v as Ultima)}
          todos="todas"
          textoTodos="Cualquiera"
          opciones={[
            { valor: "30", texto: "Últimos 30 días" },
            { valor: "60", texto: "Últimos 60 días" },
            { valor: "90", texto: "Últimos 90 días" },
            { valor: "nunca", texto: "Nunca ha comprado" },
          ]}
        />
        <Filtro
          etiqueta="Ordenar"
          valor={orden}
          onChange={(v) => setOrden(v as Orden)}
          todos={null}
          opciones={[
            { valor: "compras", texto: "Más compras" },
            { valor: "total", texto: "Más comprado" },
            { valor: "reciente", texto: "Compra más reciente" },
            { valor: "nombre", texto: "Nombre" },
          ]}
        />
        <div className="flex-1" />
        <Select value="" onValueChange={(v) => descargar(v === "todos")} disabled={!clientes.length}>
          <SelectTrigger aria-label="Descargar clientes" className="h-10 bg-card font-semibold">
            <Download className="size-4" aria-hidden />
            <SelectValue placeholder="Descargar" />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="filtrados">Lo filtrado ({filas.length})</SelectItem>
            <SelectItem value="todos">Toda la base ({clientes.length})</SelectItem>
          </SelectContent>
        </Select>
        <Button size="lg" onClick={() => setAbierto(true)}>
          <Plus aria-hidden />
          Cliente
        </Button>
      </div>

      {hayFiltros && (
        <div className="flex flex-wrap items-center gap-2 text-[12px]" aria-live="polite">
          {etiquetas.length > 0 && <span className="font-bold text-muted-foreground">Etiquetas</span>}
          {etiquetas.map((e) => (
            <button key={e} type="button" onClick={() => setEtiquetas((x) => x.filter((y) => y !== e))} className="inline-flex items-center gap-1.5 rounded-full border bg-card py-0.5 pr-2 pl-2.5 font-semibold hover:border-espresso">
              {e}
              <X className="size-3" aria-label="Quitar" />
            </button>
          ))}
          <span className="text-muted-foreground">{filas.length === 1 ? "1 resultado" : `${filas.length} resultados`}</span>
        </div>
      )}

      {clientes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card px-6 py-14 text-center">
          <span className="inline-flex size-11 items-center justify-center rounded-xl bg-hueso">
            <Users className="size-5" aria-hidden />
          </span>
          <h2 className="text-xl font-medium">Aún no hay clientes</h2>
          <p className="max-w-md text-sm text-muted-foreground">Se dan de alta aquí o desde el mostrador en su primera compra. Sin waiver firmado no se les puede vender.</p>
          <Button onClick={() => setAbierto(true)}>
            <Plus aria-hidden />
            Agregar el primero
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-hueso-2 hover:bg-hueso-2">
                <TableHead>Cliente</TableHead>
                <TableHead>Etiquetas</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Última compra</TableHead>
                <TableHead className="text-right">Compras</TableHead>
                <TableHead className="text-right">Total comprado</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>
                  <span className="sr-only">Abrir</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <span className="flex items-center gap-2.5">
                      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-bruma text-[11px] font-extrabold">{iniciales(c.nombre)}</span>
                      <span>
                        <b className="font-semibold">{c.nombre}</b>
                        <span className="block text-[11.5px] text-muted-foreground">{formatoWhatsapp(c.whatsapp)}</span>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-wrap gap-1">
                      {c.etiquetas.map((e) => (
                        <span key={e} className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", e === "VIP" ? "bg-espresso text-hueso" : "bg-hueso text-[#5c544c]")}>
                          {e}
                        </span>
                      ))}
                    </span>
                  </TableCell>
                  <TableCell className="text-[13px]">{NOMBRE_TIPO[c.tipo]}</TableCell>
                  <TableCell className="text-[13px] text-muted-foreground">{c.ultimaCompra ? formatoFecha(new Date(c.ultimaCompra)) : "—"}</TableCell>
                  <TableCell className="num text-right">{c.compras}</TableCell>
                  <TableCell className="num text-right font-semibold">{formatoMoneda(c.total)}</TableCell>
                  <TableCell className="text-[13px]">{c.vendedor ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="link" size="sm" asChild>
                      <Link href={`/clientes/${c.id}`} aria-label={`Ver a ${c.nombre}`}>
                        Ver <ArrowRight aria-hidden />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    Ningún cliente coincide con los filtros.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <ClienteDrawer key={String(abierto)} abierto={abierto} onOpenChange={setAbierto} cliente={null} clientes={clientes} vendedores={vendedores} />
    </>
  )
}

function Filtro({
  etiqueta,
  valor,
  onChange,
  opciones,
  todos = TODOS,
  textoTodos = "Todos",
}: {
  etiqueta: string
  valor: string
  onChange: (v: string) => void
  opciones: { valor: string; texto: string }[]
  todos?: string | null
  textoTodos?: string
}) {
  return (
    <Select value={valor} onValueChange={onChange}>
      <SelectTrigger aria-label={etiqueta} className="h-9 bg-card data-[activo=true]:border-espresso" data-activo={todos !== null && valor !== todos}>
        <span className="text-muted-foreground">{etiqueta}</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {todos !== null && <SelectItem value={todos}>{textoTodos}</SelectItem>}
        {opciones.map((o) => (
          <SelectItem key={o.valor} value={o.valor}>
            {o.texto}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
