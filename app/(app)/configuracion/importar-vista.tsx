"use client"

import { useRef, useState, useTransition } from "react"
import { CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react"
import { toast } from "sonner"

import { Estado } from "@/components/app/estado"
import { Button } from "@/components/ui/button"
import { descargarCsv } from "@/lib/csv"
import { PLANTILLAS, type EstadoFila, type Plantilla, type Revision, type TipoImportacion } from "@/lib/importar/plantillas"
import { cn } from "@/lib/utils"

import { importarDatos, revisarImportacion } from "./importar-actions"

const ESTADO: Record<EstadoFila, [string, "ok" | "neutro" | "crit"]> = { nueva: ["Nueva", "ok"], existe: ["Ya existe", "neutro"], error: ["Con error", "crit"] }
const UNIDAD: Record<TipoImportacion, [string, string]> = { red: ["persona", "personas"], clientes: ["cliente", "clientes"], inventario: ["lote", "lotes"], historial: ["venta", "ventas"] }
const cuantos = (n: number, [uno, varios]: [string, string]) => `${n.toLocaleString("es-MX")} ${n === 1 ? uno : varios}`

function plantillaCsv(p: Plantilla) {
  descargarCsv(`plantilla-${p.tipo}.csv`, [p.columnas.map((c) => c.titulo), p.columnas.map((c) => c.ejemplo)])
}

export function ImportarVista() {
  const [tipo, setTipo] = useState<TipoImportacion>("red")
  const p = PLANTILLAS.find((x) => x.tipo === tipo)!
  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="titulo-importar" className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
        <div className="flex flex-col gap-1">
          <h2 id="titulo-importar" className="text-xl font-medium">
            Importar datos desde Excel
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Sube su Excel tal como lo tengan: reconocemos las columnas por su nombre. Antes de guardar, se revisa renglón por renglón y no se duplica lo que ya existe. Importen en este orden:
          </p>
        </div>
        <div role="tablist" aria-label="Qué importar" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {PLANTILLAS.map((x, i) => (
            <button
              key={x.tipo}
              role="tab"
              type="button"
              aria-selected={x.tipo === tipo}
              onClick={() => setTipo(x.tipo)}
              className={cn("flex flex-col items-start gap-0.5 rounded-xl border px-3.5 py-3 text-left hover:bg-hueso-2", x.tipo === tipo && "border-espresso bg-hueso-2 ring-1 ring-espresso")}
            >
              <span className="text-[11px] font-bold tracking-[0.06em] text-muted-foreground uppercase">
                {i + 1} · {x.orden}
              </span>
              <b className="text-[14px]">{x.titulo}</b>
            </button>
          ))}
        </div>
      </section>
      <Importador key={tipo} plantilla={p} />
    </div>
  )
}

function Importador({ plantilla }: { plantilla: Plantilla }) {
  const entrada = useRef<HTMLInputElement>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [rev, setRev] = useState<Revision | null>(null)
  const [solo, setSolo] = useState<EstadoFila | "todas">("todas")
  const [revisando, iniciarRevision] = useTransition()
  const [importando, iniciarImportacion] = useTransition()
  const unidad = UNIDAD[plantilla.tipo]

  const datos = (f: File) => {
    const fd = new FormData()
    fd.set("tipo", plantilla.tipo)
    fd.set("archivo", f)
    return fd
  }
  function elegir(f: File | undefined) {
    if (!f) return
    setArchivo(f)
    setRev(null)
    setSolo("todas")
    iniciarRevision(async () => setRev(await revisarImportacion(datos(f))))
  }
  function importar() {
    if (!archivo) return
    iniciarImportacion(async () => {
      const r = await importarDatos(datos(archivo))
      setRev(r)
      if (r.ok) {
        toast.success(`Se importaron ${cuantos(r.importado ?? 0, unidad)}`)
        // Ya quedaron guardados: la siguiente revisión del mismo archivo los marcaría como "Ya existe".
        setArchivo(null)
        if (entrada.current) entrada.current.value = ""
      }
    })
  }

  const filas = (rev?.filas ?? []).filter((f) => solo === "todas" || f.estado === solo)
  const ocupado = revisando || importando

  return (
    <section aria-label={plantilla.titulo} className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-medium">{plantilla.titulo}</h3>
          <p className="text-[13px] text-muted-foreground">{plantilla.descripcion}</p>
        </div>
        <Button variant="outline" onClick={() => plantillaCsv(plantilla)}>
          <Download aria-hidden />
          Plantilla
        </Button>
      </div>

      <details className="rounded-xl border bg-hueso-2 px-3.5 py-2.5 text-[12.5px]">
        <summary className="cursor-pointer font-semibold">Columnas que reconocemos</summary>
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {plantilla.columnas.map((c) => (
            <li key={c.clave}>
              <b>{c.titulo}</b>
              {c.requerida && <span className="text-crit"> *</span>}
              {c.ayuda && <span className="text-muted-foreground"> · {c.ayuda}</span>}
              {c.alias.length > 0 && <span className="block text-[11px] text-muted-foreground">También: {c.alias.slice(0, 4).join(", ")}</span>}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-muted-foreground">* Obligatoria. Las demás son opcionales.</p>
      </details>

      <label className={cn("flex cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-4 hover:bg-hueso-2", ocupado && "pointer-events-none opacity-60")}>
        <span className="inline-flex size-10 items-center justify-center rounded-lg bg-hueso">
          {revisando ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <FileSpreadsheet className="size-5" aria-hidden />}
        </span>
        <span className="min-w-0 flex-1">
          <b className="block truncate text-sm">{revisando ? "Revisando el archivo…" : archivo ? archivo.name : "Elegir archivo .xlsx o .csv"}</b>
          <span className="text-[12px] text-muted-foreground">Nada se guarda hasta que confirmes la importación.</span>
        </span>
        <Upload className="size-4 text-muted-foreground" aria-hidden />
        <input ref={entrada} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => elegir(e.currentTarget.files?.[0])} />
      </label>

      {rev?.error && (
        <p role="alert" className="rounded-xl bg-crit-bg px-3.5 py-2.5 text-[13px] font-semibold text-crit">
          {rev.error}
        </p>
      )}

      {rev?.importado !== undefined && (
        <p role="status" className="flex items-center gap-2 rounded-xl bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-ok">
          <CheckCircle2 className="size-4" aria-hidden />
          Listo: se importaron {cuantos(rev.importado, unidad)} de {rev.archivo}. Quedó registrado en Actividad.
        </p>
      )}

      {rev?.conteo && (
        <>
          <div role="status" className="flex flex-wrap items-center gap-2 text-[13px]">
            {(["todas", "nueva", "existe", "error"] as const).map((e) => {
              const n = e === "todas" ? rev.conteo!.nueva + rev.conteo!.existe + rev.conteo!.error : rev.conteo![e]
              return (
                <button
                  key={e}
                  type="button"
                  aria-pressed={solo === e}
                  onClick={() => setSolo(e)}
                  disabled={e !== "todas" && n === 0}
                  className={cn("rounded-full border px-3 py-1 font-semibold disabled:opacity-40", solo === e && "border-espresso bg-hueso")}
                >
                  {e === "todas" ? "Todos" : ESTADO[e][0]}: <span className="num">{n.toLocaleString("es-MX")}</span>
                </button>
              )
            })}
            {rev.reconocidas && <span className="text-[12px] text-muted-foreground">Columnas leídas: {rev.reconocidas.join(", ")}</span>}
          </div>

          <div className="max-h-[420px] overflow-auto rounded-xl border">
            <table className="w-full text-[12.5px]">
              <thead className="sticky top-0 bg-hueso-2 text-left text-[11.5px] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">Renglón</th>
                  <th className="px-3 py-2 font-semibold">Qué es</th>
                  <th className="px-3 py-2 font-semibold">Estado</th>
                  <th className="px-3 py-2 font-semibold">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filas.map((f) => (
                  <tr key={f.renglon} className={cn(f.estado === "error" && "bg-crit-bg/40")}>
                    <td className="num px-3 py-2 text-muted-foreground">{f.renglon}</td>
                    <td className="px-3 py-2 font-semibold">{f.resumen}</td>
                    <td className="px-3 py-2">
                      <Estado tipo={ESTADO[f.estado][1]}>{ESTADO[f.estado][0]}</Estado>
                    </td>
                    <td className={cn("px-3 py-2", f.estado === "error" ? "text-crit" : "text-muted-foreground")}>{f.mensajes.join(" ") || "—"}</td>
                  </tr>
                ))}
                {filas.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                      Nada en este filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {(rev.filas?.length ?? 0) < rev.conteo.nueva + rev.conteo.existe + rev.conteo.error && (
            <p className="text-[12px] text-muted-foreground">Se muestran los primeros {rev.filas!.length} renglones (los errores primero).</p>
          )}

          {rev.importado === undefined && (
            <div className="flex flex-wrap items-center gap-3 border-t pt-4">
              <p className="min-w-0 flex-1 text-[13px]">
                {rev.aCrear ? (
                  <>
                    Se van a crear <b>{cuantos(rev.aCrear, unidad)}</b>.{rev.conteo.error > 0 && " Los renglones con error se omiten; puedes corregirlos y volver a subir el archivo."}
                    {rev.conteo.existe > 0 && " Lo que ya existe no se toca."}
                  </>
                ) : (
                  "No hay nada nuevo sin error para importar."
                )}
              </p>
              <Button size="lg" onClick={importar} disabled={!rev.aCrear || ocupado || !archivo}>
                {importando && <Loader2 className="animate-spin" aria-hidden />}
                Importar {rev.aCrear ? cuantos(rev.aCrear, unidad) : ""}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
