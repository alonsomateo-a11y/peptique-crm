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

const precio = (n: number | null) => (n === null ? <span className="text-muted-foreground">—</span> : formatoMoneda(n))

export function ImportarDrawer({ abierto, onOpenChange }: { abierto: boolean; onOpenChange: (v: boolean) => void }) {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [res, setRes] = useState<ResultadoImportacion | null>(null)
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
  const sinPrecio = cambios.filter((c) => c.tipo === "nuevo" && c.precio_publico === null).length

  return (
    <Drawer abierto={abierto} onOpenChange={onOpenChange} titulo="Importar catálogo" descripcion="Desde el Excel de precios. Revisa antes de guardar.">
      <DrawerCuerpo>
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed bg-hueso-2 px-4 py-4 has-focus-visible:ring-3 has-focus-visible:ring-ring">
          <span className="inline-flex size-10 items-center justify-center rounded-xl bg-card">
            {archivo ? <FileSpreadsheet className="size-5" aria-hidden /> : <Upload className="size-5" aria-hidden />}
          </span>
          <span className="min-w-0 flex-1">
            <b className="block truncate text-sm">{archivo ? archivo.name : "Elegir archivo .xlsx"}</b>
            <span className="text-[11.5px] text-muted-foreground">Columnas Producto, $ Web, $ Medico y $ Distribuidor (precios con IVA)</span>
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
            </div>
            <div className="overflow-hidden rounded-xl border">
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
                  {cambios.map((c) => (
                    <TableRow key={`${c.nombre}|${c.presentacion}`}>
                      <TableCell>
                        <b className="text-[13px] font-semibold">
                          {c.nombre} {c.presentacion !== "Única" && c.presentacion}
                        </b>
                        <span className="block text-[11px] text-muted-foreground">
                          <span className="font-mono">{c.sku}</span> · Excel: {c.original}
                        </span>
                      </TableCell>
                      <TableCell className="num text-right text-[13px]">{precio(c.precio_publico)}</TableCell>
                      <TableCell className="num text-right text-[13px]">{precio(c.precio_medico)}</TableCell>
                      <TableCell className="num text-right text-[13px]">{precio(c.precio_distribuidor)}</TableCell>
                      <TableCell>
                        {c.tipo === "nuevo" ? (
                          <Estado tipo={c.precio_publico === null ? "neutro" : "ok"}>{c.precio_publico === null ? "Nuevo · oculto" : "Nuevo"}</Estado>
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
            <p className="text-[11.5px] text-muted-foreground">
              Los nuevos entran con su SKU y la familia de la web{sinPrecio > 0 && ` y ${sinPrecio} quedan ocultos por no tener precio`}. Los existentes solo cambian precios; su familia, protocolos y estado se conservan. Los costos no se importan: salen de cada lote en Inventario.
            </p>
          </>
        )}
      </DrawerCuerpo>
      <DrawerPie>
        <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button type="button" size="lg" disabled={!archivo || leyendo || guardando || !cambios.length || nuevos + precios === 0} onClick={importar}>
          {guardando && <Loader2 className="animate-spin" aria-hidden />}
          {nuevos + precios > 0 ? `Importar ${nuevos + precios} cambios` : "Importar"}
        </Button>
      </DrawerPie>
    </Drawer>
  )
}
