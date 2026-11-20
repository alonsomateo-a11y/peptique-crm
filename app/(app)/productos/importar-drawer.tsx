"use client"

import { useState, useTransition } from "react"
import { AlertTriangle, FileSpreadsheet, Loader2, Upload } from "lucide-react"
import { toast } from "sonner"

import { Drawer, DrawerCuerpo, DrawerPie } from "@/components/app/drawer"
import { Estado } from "@/components/app/estado"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatoMoneda } from "@/lib/format"

import { importarCatalogo, previsualizarCatalogo, type ResultadoImportacion } from "./actions"

import type { CambioImportacion, Precios } from "./datos-cliente"

const precio = (n: number | null) => (n === null ? <span className="text-muted-foreground">—</span> : formatoMoneda(n))

/** Precio nuevo y, si cambia, el anterior tachado. */
function Celda({ c, k }: { c: CambioImportacion; k: keyof Precios }) {
  const antes = c.antes?.[k] ?? null
  return (
    <>
      {precio(c[k])}
      {c.tipo === "precio" && antes !== c[k] && <s className="block text-[11px] text-muted-foreground">{antes === null ? "sin precio" : formatoMoneda(antes)}</s>}
    </>
  )
}

export function ImportarDrawer({ abierto, onOpenChange }: { abierto: boolean; onOpenChange: (v: boolean) => void }) {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [res, setRes] = useState<ResultadoImportacion | null>(null)
  const [revisado, setRevisado] = useState(false)
  const [leyendo, iniciarLectura] = useTransition()
  const [guardando, iniciarGuardado] = useTransition()

  const datos = (f: File) => {
    const fd = new FormData()
    fd.set("archivo", f)
    return fd
  }

  function elegir(f: File | undefined) {
    setArchivo(f ?? null)
    setRes(null)
    setRevisado(false)
    if (f) iniciarLectura(async () => setRes(await previsualizarCatalogo(datos(f))))
  }

  function importar() {
    if (!archivo) return
    iniciarGuardado(async () => {
      const r = await importarCatalogo(datos(archivo))
      if (r.importados) {
        toast.success(`Catálogo importado: ${r.importados.nuevos} nuevos, ${r.importados.precios} precios actualizados`)
        onOpenChange(false)
      } else setRes(r)
    })
  }

  const cambios = res?.cambios ?? []
  const nuevos = cambios.filter((c) => c.tipo === "nuevo").length
  const precios = cambios.filter((c) => c.tipo === "precio").length
  const conAviso = cambios.filter((c) => c.avisos.length > 0).length

  return (
    <Drawer abierto={abierto} onOpenChange={onOpenChange} titulo="Importar lista de precios" descripcion="Desde el Excel de precios. Revisa antes de guardar.">
      <DrawerCuerpo>
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed bg-hueso-2 px-4 py-4 has-focus-visible:ring-3 has-focus-visible:ring-ring">
          <span className="inline-flex size-10 items-center justify-center rounded-xl bg-card">
            {archivo ? <FileSpreadsheet className="size-5" aria-hidden /> : <Upload className="size-5" aria-hidden />}
          </span>
          <span className="min-w-0 flex-1">
            <b className="block truncate text-sm">{archivo ? archivo.name : "Elegir archivo .xlsx"}</b>
            <span className="text-[11.5px] text-muted-foreground">Columnas Producto y Precio público; Médico y Distribuidor son opcionales (precios con IVA)</span>
          </span>
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => elegir(e.currentTarget.files?.[0])} />
        </label>

        {leyendo && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Leyendo el Excel…
          </p>
        )}
        {res?.error && (
          <p role="alert" className="flex items-center gap-2 rounded-xl bg-crit-bg px-3.5 py-2.5 text-sm font-semibold text-crit">
            <AlertTriangle className="size-4" aria-hidden />
            {res.error}
          </p>
        )}

        {cambios.length > 0 && (
          <>
            <div className="flex flex-wrap gap-2 text-[12.5px]" role="status">
              <Estado tipo="ok">{nuevos} nuevos</Estado>
              <Estado tipo="warn">{precios} cambian precio</Estado>
              <Estado tipo="neutro">{cambios.length - nuevos - precios} sin cambios</Estado>
              {conAviso > 0 && <Estado tipo="crit">{conAviso} por revisar</Estado>}
            </div>
            {conAviso > 0 && (
              <p className="rounded-xl border border-[#eed9a8] bg-warn-bg px-3.5 py-2.5 text-[13px] text-warn">
                Revisa los renglones marcados antes de importar. Si algo está mal, corrígelo en el Excel y vuelve a subirlo.
              </p>
            )}
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-hueso-2 hover:bg-hueso-2">
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Público</TableHead>
                    <TableHead className="text-right">Médico</TableHead>
                    <TableHead className="text-right">Distribuidor</TableHead>
                    <TableHead>Qué pasa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...cambios].sort((a, b) => Number(b.avisos.length > 0) - Number(a.avisos.length > 0) || a.renglon - b.renglon).map((c) => (
                    <TableRow key={`${c.nombre}|${c.presentacion}`} className={c.avisos.length ? "bg-warn-bg/40" : undefined}>
                      <TableCell className="min-w-[200px] align-top whitespace-normal">
                        <b className="text-[13px] font-semibold">
                          {c.nombre} {c.presentacion !== "Única" && c.presentacion}
                        </b>
                        <span className="block text-[11px] text-muted-foreground">
                          <span className="font-mono">{c.sku}</span> · Excel renglón {c.renglon}: {c.original}
                        </span>
                        {c.avisos.map((a) => (
                          <span key={a} className="mt-1 flex items-start gap-1 text-[11.5px] font-semibold text-warn">
                            <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
                            {a}
                          </span>
                        ))}
                      </TableCell>
                      <TableCell className="num text-right align-top text-[13px]"><Celda c={c} k="precio_publico" /></TableCell>
                      <TableCell className="num text-right align-top text-[13px]"><Celda c={c} k="precio_medico" /></TableCell>
                      <TableCell className="num text-right align-top text-[13px]"><Celda c={c} k="precio_distribuidor" /></TableCell>
                      <TableCell className="align-top">
                        {c.tipo === "nuevo" ? (
                          <Estado tipo="neutro">Nuevo · oculto</Estado>
                        ) : c.tipo === "precio" ? (
                          <Estado tipo="warn">Cambia precio</Estado>
                        ) : (
                          <Estado tipo="neutro">Igual</Estado>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {conAviso > 0 && (
              <label className="flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-[13px] font-semibold">
                <input type="checkbox" checked={revisado} onChange={(e) => setRevisado(e.target.checked)} className="size-4 accent-[var(--color-espresso)]" />
                Ya revisé los {conAviso} renglones marcados
              </label>
            )}
            <p className="text-[11.5px] text-muted-foreground">
              Los precios van con IVA. Una celda vacía o una columna que no viene conserva el precio actual. Los nuevos entran ocultos con su SKU y familia: actívalos en Productos cuando los revises. Los existentes solo cambian precios; su familia, protocolos y si están visibles se conservan. Los costos no se importan: salen de cada lote en Inventario.
            </p>
          </>
        )}
      </DrawerCuerpo>
      <DrawerPie>
        <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button type="button" size="lg" disabled={!archivo || leyendo || guardando || !cambios.length || nuevos + precios === 0 || (conAviso > 0 && !revisado)} onClick={importar}>
          {guardando && <Loader2 className="animate-spin" aria-hidden />}
          {nuevos + precios > 0 ? `Importar ${nuevos + precios} cambios` : "Importar"}
        </Button>
      </DrawerPie>
    </Drawer>
  )
}
