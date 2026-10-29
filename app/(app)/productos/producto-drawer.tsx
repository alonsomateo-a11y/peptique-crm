"use client"

import { useActionState, useState, useTransition } from "react"
import { AlertTriangle, FileText, Loader2, Upload } from "lucide-react"
import { toast } from "sonner"

import { Campo, TituloSeccion } from "@/components/app/campo"
import { Drawer, DrawerCuerpo, DrawerPie } from "@/components/app/drawer"
import { Estado } from "@/components/app/estado"
import { Segmentado } from "@/components/app/segmentado"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatoMoneda } from "@/lib/format"
import { enviarSinLimpiar } from "@/lib/formulario"

import { enlaceProtocolo, guardarProducto, type ResultadoProducto } from "./actions"
import { BarraMargen } from "./barra-margen"
import { ETAPAS, margenDe, type ProductoFila } from "./datos-cliente"

export function ProductoDrawer({
  abierto,
  onOpenChange,
  producto,
  familias,
}: {
  abierto: boolean
  onOpenChange: (v: boolean) => void
  producto: ProductoFila | null
  familias: string[]
}) {
  const [precio, setPrecio] = useState(producto?.precio_publico?.toString() ?? "")
  const [pagos, setPagos] = useState(producto?.pagos_por_dosis.toString() ?? "4")
  const [visible, setVisible] = useState<"visible" | "oculto">(producto?.visible ? "visible" : "oculto")
  const [quitar, setQuitar] = useState<number[]>([])
  const [archivos, setArchivos] = useState<Record<number, string>>({})
  const [abriendo, iniciar] = useTransition()

  const [estado, enviar, enviando] = useActionState(async (prev: ResultadoProducto, form: FormData) => {
    const r = await guardarProducto(prev, form)
    if (r?.ok) {
      toast.success(producto ? "Cambios guardados" : "Producto agregado")
      onOpenChange(false)
    }
    return r
  }, null)
  const err = estado?.errores ?? {}

  const precioNum = Number(precio.replace(/[$,\s]/g, "")) || null
  const pagosNum = Number(pagos) || 0
  const sinPrecio = !precioNum
  const visibleEfectivo = sinPrecio ? "oculto" : visible

  function verPdf(ruta: string) {
    iniciar(async () => {
      const url = await enlaceProtocolo(ruta)
      if (url) window.open(url, "_blank", "noopener")
      else toast.error("No se pudo abrir el PDF.")
    })
  }

  const id = (k: string) => `producto-${k}`
  const aria = (k: string) => (err[k] ? { "aria-invalid": true, "aria-describedby": `${id(k)}-error` } : {})

  return (
    <Drawer
      abierto={abierto}
      onOpenChange={onOpenChange}
      titulo={producto ? `Editar ${producto.nombre} ${producto.presentacion}` : "Nuevo producto"}
      descripcion={producto ? `${producto.sku ? `SKU ${producto.sku} · ` : ""}${producto.piezas} piezas en inventario` : "Sin precio público queda oculto para el mostrador y la red"}
    >
      <form onSubmit={enviarSinLimpiar(enviar)} className="flex min-h-0 flex-1 flex-col">
        {producto && <input type="hidden" name="id" value={producto.id} />}
        {quitar.map((e) => (
          <input key={e} type="hidden" name={`quitar_${e}`} value="1" />
        ))}
        <DrawerCuerpo>
          {estado?.error && (
            <p role="alert" className="flex items-center gap-2 rounded-xl bg-crit-bg px-3.5 py-2.5 text-sm font-semibold text-crit">
              <AlertTriangle className="size-4" aria-hidden />
              {estado.error}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Campo id={id("nombre")} etiqueta="Nombre" error={err.nombre}>
              <Input id={id("nombre")} name="nombre" defaultValue={producto?.nombre} placeholder="GHK-Cu" autoComplete="off" {...aria("nombre")} />
            </Campo>
            <Campo id={id("presentacion")} etiqueta="Presentación" error={err.presentacion}>
              <Input id={id("presentacion")} name="presentacion" defaultValue={producto?.presentacion} placeholder="100 mg" autoComplete="off" {...aria("presentacion")} />
            </Campo>
            <Campo id={id("familia")} etiqueta="Familia" error={err.familia}>
              <Input id={id("familia")} name="familia" list="familias" defaultValue={producto?.familia} placeholder="Piel y cobre" autoComplete="off" {...aria("familia")} />
              <datalist id="familias">
                {familias.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </Campo>
            <Campo id={id("sku")} etiqueta="SKU" ayuda="Opcional" error={err.sku}>
              <Input id={id("sku")} name="sku" defaultValue={producto?.sku ?? ""} placeholder="GHK-100" autoComplete="off" {...aria("sku")} />
            </Campo>
          </div>

          <div className="flex flex-col gap-2.5">
            <TituloSeccion>Precios con IVA</TituloSeccion>
            <div className="grid grid-cols-3 gap-3">
              <Campo id={id("precio_publico")} etiqueta="Público" error={err.precio_publico}>
                <Input id={id("precio_publico")} name="precio_publico" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="$0" className="num" {...aria("precio_publico")} />
              </Campo>
              <Campo id={id("precio_medico")} etiqueta="Médico" error={err.precio_medico}>
                <Input id={id("precio_medico")} name="precio_medico" inputMode="decimal" defaultValue={producto?.precio_medico ?? ""} placeholder="$0" className="num" {...aria("precio_medico")} />
              </Campo>
              <Campo id={id("precio_distribuidor")} etiqueta="Distribuidor" error={err.precio_distribuidor}>
                <Input id={id("precio_distribuidor")} name="precio_distribuidor" inputMode="decimal" defaultValue={producto?.precio_distribuidor ?? ""} placeholder="$0" className="num" {...aria("precio_distribuidor")} />
              </Campo>
            </div>
          </div>

          {producto && producto.lotes.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <TituloSeccion>Margen por lote con este precio</TituloSeccion>
              {producto.lotes.map((l, i) => (
                <div key={l.id} className="flex items-center gap-3 text-[13px]">
                  <span className="w-36 font-mono text-[12px]">{l.codigo}</span>
                  <div className="flex-1">
                    <BarraMargen valor={margenDe(precioNum, l.costo)} />
                  </div>
                  <span className="w-20 text-right text-[11.5px] text-muted-foreground">{l.piezas} pzas</span>
                  <Estado tipo={i === 0 ? "ok" : "neutro"}>{i === 0 ? "Vigente" : "Siguiente"}</Estado>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            <TituloSeccion extra={<Estado tipo="neutro">Solo administrador</Estado>}>Protocolos por etapa</TituloSeccion>
            <div className="divide-y rounded-xl border">
              {ETAPAS.map(({ etapa, nombre, detalle }) => {
                const actual = quitar.includes(etapa) ? undefined : producto?.protocolos.find((p) => p.etapa === etapa)
                return (
                  <div key={etapa} className="flex flex-col gap-2.5 px-3.5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <b className="text-[13px]">{nombre}</b> <span className="text-[11.5px] text-muted-foreground">· {detalle}</span>
                      </div>
                      {actual?.pdf_path ? <Estado tipo="ok">PDF listo</Estado> : <Estado tipo="warn">Sin PDF</Estado>}
                    </div>
                    <div className="grid grid-cols-[1fr_1fr_1.6fr] items-start gap-2.5">
                      <Campo id={id(`piezas_${etapa}`)} etiqueta="Piezas" error={err[`piezas_${etapa}`]}>
                        <Input id={id(`piezas_${etapa}`)} name={`piezas_${etapa}`} inputMode="numeric" defaultValue={actual?.piezas ?? ""} placeholder="—" className="num" {...aria(`piezas_${etapa}`)} />
                      </Campo>
                      <Campo id={id(`duracion_${etapa}`)} etiqueta="Duración (días)" error={err[`duracion_${etapa}`]}>
                        <Input id={id(`duracion_${etapa}`)} name={`duracion_${etapa}`} inputMode="numeric" defaultValue={actual?.duracion_dias ?? ""} placeholder="—" className="num" {...aria(`duracion_${etapa}`)} />
                      </Campo>
                      <Campo id={id(`pdf_${etapa}`)} etiqueta={actual?.pdf_path ? "Reemplazar PDF" : "PDF del protocolo"} error={err[`pdf_${etapa}`]}>
                        <label className="flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-dashed px-2.5 text-[12px] font-semibold text-muted-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring">
                          <Upload className="size-3.5" aria-hidden />
                          <span className="truncate">{archivos[etapa] ?? "Elegir PDF"}</span>
                          <input id={id(`pdf_${etapa}`)} name={`pdf_${etapa}`} type="file" accept="application/pdf" className="sr-only" onChange={(e) => {
                            const nombreArchivo = e.currentTarget.files?.[0]?.name
                            setArchivos((a) => ({ ...a, [etapa]: nombreArchivo ?? "Elegir PDF" }))
                          }} />
                        </label>
                      </Campo>
                    </div>
                    {actual && (
                      <div className="flex gap-3 text-[12px]">
                        {actual.pdf_path && (
                          <button type="button" onClick={() => verPdf(actual.pdf_path!)} disabled={abriendo} className="inline-flex items-center gap-1 font-semibold text-chart-1 hover:underline">
                            <FileText className="size-3.5" aria-hidden />
                            Ver PDF actual
                          </button>
                        )}
                        <button type="button" onClick={() => setQuitar((q) => [...q, etapa])} className="font-semibold text-muted-foreground hover:text-crit hover:underline">
                          Quitar etapa
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <span className="text-[11.5px] text-muted-foreground">Los vendedores no ven el contenido; solo se manda por WhatsApp al cliente desde el mostrador.</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Campo id={id("inyecciones_por_vial")} etiqueta="Inyecciones por vial" error={err.inyecciones_por_vial}>
              <Input id={id("inyecciones_por_vial")} name="inyecciones_por_vial" inputMode="numeric" defaultValue={producto?.inyecciones_por_vial ?? 20} className="num" {...aria("inyecciones_por_vial")} />
            </Campo>
            <Campo
              id={id("pagos_por_dosis")}
              etiqueta="Pagos por dosis"
              error={err.pagos_por_dosis}
              ayuda={precioNum && pagosNum > 0 ? `${pagosNum} pagos de ${formatoMoneda(Math.ceil(precioNum / pagosNum))}` : undefined}
            >
              <Input id={id("pagos_por_dosis")} name="pagos_por_dosis" inputMode="numeric" value={pagos} onChange={(e) => setPagos(e.target.value)} className="num" {...aria("pagos_por_dosis")} />
            </Campo>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold">Estado</span>
            <Segmentado
              name="visible"
              etiqueta="Estado del producto"
              valor={visibleEfectivo}
              onChange={setVisible}
              deshabilitadas={sinPrecio ? ["visible"] : []}
              opciones={[
                { valor: "visible", texto: "Visible" },
                { valor: "oculto", texto: "Oculto" },
              ]}
            />
            <span className={err.visible ? "text-[11.5px] font-semibold text-crit" : "text-[11.5px] text-muted-foreground"}>
              {err.visible ?? (sinPrecio
                  ? "Sin precio público solo puede estar oculto."
                  : visibleEfectivo === "visible"
                    ? "Aparece en el mostrador y en la red."
                    : "Oculto: no aparece en el mostrador ni en la red.")}
            </span>
          </div>
        </DrawerCuerpo>
        <DrawerPie>
          <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" size="lg" disabled={enviando}>
            {enviando && <Loader2 className="animate-spin" aria-hidden />}
            {producto ? "Guardar cambios" : "Agregar producto"}
          </Button>
        </DrawerPie>
      </form>
    </Drawer>
  )
}
