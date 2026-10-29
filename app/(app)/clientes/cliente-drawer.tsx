"use client"

import { useActionState, useRef, useState } from "react"
import { AlertTriangle, Check, Loader2, Plus, X } from "lucide-react"
import { toast } from "sonner"

import { Campo } from "@/components/app/campo"
import { Drawer, DrawerCuerpo, DrawerPie } from "@/components/app/drawer"
import { Estado } from "@/components/app/estado"
import { Segmentado } from "@/components/app/segmentado"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { enviarSinLimpiar } from "@/lib/formulario"
import { formatoWhatsapp } from "@/lib/telefono"
import { cn } from "@/lib/utils"

import { guardarCliente } from "./actions"
import { ETIQUETAS_SUGERIDAS, ORIGENES, TIPOS, type ClienteFila, type Resultado, type TipoCliente } from "./tipos"

const NADIE = "nadie"
const SIN_ASIGNAR = "sin"

export function ClienteDrawer({
  abierto,
  onOpenChange,
  cliente,
  clientes,
  vendedores,
}: {
  abierto: boolean
  onOpenChange: (v: boolean) => void
  cliente: ClienteFila | null
  clientes: Pick<ClienteFila, "id" | "nombre" | "whatsapp">[]
  vendedores: { id: string; nombre: string }[]
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const otro = useRef(false)
  const [tipo, setTipo] = useState<TipoCliente>(cliente?.tipo ?? "paciente")
  const [etiquetas, setEtiquetas] = useState<string[]>(cliente?.etiquetas ?? [])
  const [nueva, setNueva] = useState("")
  const referido = clientes.find((c) => c.id === cliente?.referido_por)
  const [referidoTexto, setReferidoTexto] = useState(referido ? `${referido.nombre} · ${formatoWhatsapp(referido.whatsapp)}` : "")
  const opcionesReferido = clientes.filter((c) => c.id !== cliente?.id).map((c) => ({ id: c.id, texto: `${c.nombre} · ${formatoWhatsapp(c.whatsapp)}` }))
  const referidoId = opcionesReferido.find((o) => o.texto === referidoTexto)?.id ?? ""

  const [res, enviar, enviando] = useActionState(async (prev: Resultado, form: FormData) => {
    const r = await guardarCliente(prev, form)
    if (r?.ok) {
      toast.success(cliente ? "Cambios guardados" : "Cliente agregado")
      if (otro.current && !cliente) {
        formRef.current?.reset()
        setTipo("paciente")
        setEtiquetas([])
        setReferidoTexto("")
        formRef.current?.querySelector<HTMLInputElement>("input[name=nombre]")?.focus()
        return null
      }
      onOpenChange(false)
    }
    return r
  }, null)
  const err = res?.errores ?? {}
  const id = (k: string) => `cliente-${k}`
  const aria = (k: string) => (err[k] ? { "aria-invalid": true, "aria-describedby": `${id(k)}-error` } : {})

  function agregarEtiqueta(t: string) {
    const e = t.trim()
    if (e && !etiquetas.includes(e)) setEtiquetas([...etiquetas, e])
    setNueva("")
  }

  return (
    <Drawer
      abierto={abierto}
      onOpenChange={onOpenChange}
      titulo={cliente ? `Editar a ${cliente.nombre}` : "Nuevo cliente"}
      descripcion={cliente ? formatoWhatsapp(cliente.whatsapp) : "Se puede crear aquí o desde el mostrador"}
    >
      <form ref={formRef} onSubmit={enviarSinLimpiar(enviar)} className="flex min-h-0 flex-1 flex-col">
        {cliente && <input type="hidden" name="id" value={cliente.id} />}
        <input type="hidden" name="etiquetas" value={etiquetas.join(",")} />
        <input type="hidden" name="referido_por" value={referidoId} />
        <DrawerCuerpo>
          {res?.error && (
            <p role="alert" className="flex items-center gap-2 rounded-xl bg-crit-bg px-3.5 py-2.5 text-sm font-semibold text-crit">
              <AlertTriangle className="size-4" aria-hidden />
              {res.error}
            </p>
          )}

          <Campo id={id("nombre")} etiqueta="Nombre completo" error={err.nombre}>
            <Input id={id("nombre")} name="nombre" defaultValue={cliente?.nombre} autoComplete="off" {...aria("nombre")} />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo id={id("whatsapp")} etiqueta="WhatsApp" error={err.whatsapp} ayuda="10 dígitos">
              <Input id={id("whatsapp")} name="whatsapp" type="tel" inputMode="tel" defaultValue={cliente ? formatoWhatsapp(cliente.whatsapp) : ""} autoComplete="off" {...aria("whatsapp")} />
            </Campo>
            <Campo id={id("correo")} etiqueta="Correo" error={err.correo} ayuda="Opcional">
              <Input id={id("correo")} name="correo" type="email" defaultValue={cliente?.correo ?? ""} autoComplete="off" {...aria("correo")} />
            </Campo>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold">Tipo de cliente</span>
            <Segmentado name="tipo" etiqueta="Tipo de cliente" valor={tipo} onChange={setTipo} opciones={TIPOS.map((t) => ({ valor: t.valor, texto: t.texto }))} />
            <span className="text-[11.5px] text-muted-foreground">Define su lista de precios: público, médico o distribuidor.</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Campo id={id("origen")} etiqueta="¿Cómo nos conoció?">
              <Select name="origen" defaultValue={cliente?.origen ?? undefined}>
                <SelectTrigger id={id("origen")} className="w-full">
                  <SelectValue placeholder="Elegir" />
                </SelectTrigger>
                <SelectContent>
                  {ORIGENES.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
            <Campo id={id("referido")} etiqueta="Refirió" ayuda={referidoTexto && !referidoId ? "Elige un cliente de la lista" : "Opcional"}>
              <Input id={id("referido")} list="clientes-referidos" value={referidoTexto} onChange={(e) => setReferidoTexto(e.target.value)} placeholder="Nadie" autoComplete="off" />
              <datalist id="clientes-referidos">
                {opcionesReferido.map((o) => (
                  <option key={o.id} value={o.texto} />
                ))}
              </datalist>
            </Campo>
          </div>

          <Campo id={id("vendedor")} etiqueta="Vendedor asignado" ayuda="Quien le da seguimiento y sus recompras">
            <Select name="vendedor_id" defaultValue={cliente?.vendedor_id ?? SIN_ASIGNAR}>
              <SelectTrigger id={id("vendedor")} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_ASIGNAR}>Sin asignar</SelectItem>
                {vendedores.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>

          <div className="flex flex-col gap-2">
            <span className="text-[12.5px] font-semibold">Etiquetas</span>
            <div className="flex flex-wrap gap-1.5">
              {etiquetas.map((e) => (
                <span key={e} className="inline-flex items-center gap-1 rounded-full bg-espresso py-0.5 pr-1.5 pl-2.5 text-[12px] font-semibold text-hueso">
                  {e}
                  <button type="button" onClick={() => setEtiquetas(etiquetas.filter((x) => x !== e))} aria-label={`Quitar etiqueta ${e}`} className="rounded-full p-0.5 hover:bg-white/15">
                    <X className="size-3" aria-hidden />
                  </button>
                </span>
              ))}
              {ETIQUETAS_SUGERIDAS.filter((s) => !etiquetas.includes(s)).map((s) => (
                <button key={s} type="button" onClick={() => agregarEtiqueta(s)} className="inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-0.5 text-[12px] font-semibold text-muted-foreground hover:border-espresso hover:text-foreground">
                  <Plus className="size-3" aria-hidden />
                  {s}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    agregarEtiqueta(nueva)
                  }
                }}
                placeholder="Otra etiqueta"
                aria-label="Escribir otra etiqueta"
                className="h-8"
              />
              <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => agregarEtiqueta(nueva)} disabled={!nueva.trim()}>
                Agregar
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 rounded-xl border px-3.5 py-3">
            <div className="flex items-center gap-2">
              <b className="flex-1 text-[13px]">Waiver</b>
              {cliente?.waiver ? <Estado tipo="ok">Firmado</Estado> : <Estado tipo="warn">Pendiente</Estado>}
            </div>
            <span className="text-[12px] text-muted-foreground">
              {cliente?.waiver ? "Ya lo firmó. Se puede vender." : "Lo firma en su primera compra en el mostrador. Sin waiver firmado no se le puede vender."}
            </span>
          </div>

          <label className="flex items-center gap-2.5 text-[13px]">
            <span className="relative inline-flex">
              <input type="checkbox" name="acepta_whatsapp" defaultChecked={cliente?.acepta_whatsapp ?? true} className="peer size-[18px] cursor-pointer appearance-none rounded-[5px] border border-input bg-card checked:border-espresso checked:bg-espresso focus-visible:ring-3 focus-visible:ring-ring" />
              <Check className={cn("pointer-events-none absolute inset-0 m-auto size-3 text-hueso opacity-0 peer-checked:opacity-100")} strokeWidth={3} aria-hidden />
            </span>
            Acepta recibir mensajes por WhatsApp (recordatorios de recompra)
          </label>
        </DrawerCuerpo>
        <DrawerPie>
          <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <span className="flex-1" />
          {!cliente && (
            <Button type="submit" variant="outline" size="lg" disabled={enviando} onClick={() => (otro.current = true)}>
              Guardar y agregar otro
            </Button>
          )}
          <Button type="submit" size="lg" disabled={enviando} onClick={() => (otro.current = false)}>
            {enviando && <Loader2 className="animate-spin" aria-hidden />}
            {cliente ? "Guardar cambios" : "Guardar cliente"}
          </Button>
        </DrawerPie>
      </form>
    </Drawer>
  )
}
