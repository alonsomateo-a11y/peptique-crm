"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { AlertTriangle, Check, Eye, FileText, Loader2, Save, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { aprobarCoa, guardarZonas, ligaOriginal, ligaPublico, subirOriginal, zonasSugeridas } from "./actions"
import type { Pagina } from "./render"
import { TEXTO_FRANJA, ZONAS_REQUERIDAS, type Zona } from "./tipos"

const MIN = 0.006

export function EditorCoa({ loteId, tieneOriginal, tienePublico, tipoOriginal }: { loteId: string; tieneOriginal: boolean; tienePublico: boolean; tipoOriginal: string | null }) {
  const [paginas, setPaginas] = useState<Pagina[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [zonas, setZonas] = useState<Zona[]>([])
  const [aviso, setAviso] = useState<string | null>(null)
  const [elegida, setElegida] = useState<number | null>(null)
  const [vista, setVista] = useState<"original" | "publico">("original")
  const [hechas, setHechas] = useState<string[]>([])
  const [ocupado, iniciar] = useTransition()
  const [listo, setListo] = useState(tienePublico)

  useEffect(() => {
    if (!tieneOriginal || !tipoOriginal) return
    let vivo = true
    ;(async () => {
      try {
        const [{ url, error: e }, sug] = await Promise.all([ligaOriginal(loteId), zonasSugeridas(loteId)])
        if (e || !url) throw new Error(e ?? "No se pudo abrir el COA.")
        const { cargarPaginas } = await import("./render")
        const p = await cargarPaginas(url, tipoOriginal)
        if (!vivo) return
        setPaginas(p)
        setZonas(sug.zonas.filter((z) => z.pagina < p.length))
        if (sug.origen === "anterior") setAviso(`Usamos las zonas del COA de ${sug.lote}. Revísalas: si el formato cambió, ajústalas.`)
      } catch (err) {
        if (vivo) setError(err instanceof Error ? err.message : "No se pudo abrir el COA.")
      }
    })()
    return () => {
      vivo = false
    }
  }, [loteId, tieneOriginal, tipoOriginal])

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if ((e.key === "Delete" || e.key === "Backspace") && elegida !== null && !(e.target instanceof HTMLInputElement)) {
        setZonas((z) => z.filter((_, i) => i !== elegida))
        setElegida(null)
      }
    }
    window.addEventListener("keydown", tecla)
    return () => window.removeEventListener("keydown", tecla)
  }, [elegida])

  if (!tieneOriginal) return <SubirOriginal loteId={loteId} />

  const completas = ZONAS_REQUERIDAS.every((z) => hechas.includes(z.id))

  function aprobar() {
    if (!paginas) return
    iniciar(async () => {
      try {
        const { generarPdfPublico } = await import("./render")
        const pdf = await generarPdfPublico(paginas, zonas)
        const fd = new FormData()
        fd.set("lote_id", loteId)
        fd.set("zonas", JSON.stringify(zonas))
        fd.set("archivo", new File([pdf], "coa-publico.pdf", { type: "application/pdf" }))
        const r = await aprobarCoa(fd)
        if (r.error) return void toast.error(r.error)
        setListo(true)
        toast.success("COA público aprobado")
      } catch {
        toast.error("No se pudo generar el PDF público.")
      }
    })
  }

  const pasos = [
    { t: "Subir PDF original", s: "Listo", hecho: true },
    { t: "Tapar datos del proveedor", s: `${zonas.length} ${zonas.length === 1 ? "zona" : "zonas"} · revisa`, hecho: completas && zonas.length > 0 },
    { t: "Aprobar COA público", s: listo ? "Disponible en mostrador y red" : "Se genera aplanado y sin metadatos", hecho: listo },
  ]

  return (
    <>
      <ol className="grid gap-2.5 sm:grid-cols-3">
        {pasos.map((p, i) => (
          <li key={p.t} className={cn("flex items-center gap-2.5 rounded-2xl border bg-card px-3.5 py-3", !p.hecho && pasos.slice(0, i).every((x) => x.hecho) && "border-espresso ring-1 ring-espresso")}>
            <span className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-[12px] font-extrabold", p.hecho ? "border-chart-1 bg-chart-1 text-white" : "bg-card")}>
              {p.hecho ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : i + 1}
            </span>
            <span>
              <b className="text-[13.5px]">{p.t}</b>
              <span className="block text-[11.5px] text-muted-foreground">{p.s}</span>
            </span>
          </li>
        ))}
      </ol>

      {error && (
        <p role="alert" className="flex items-center gap-2 rounded-xl bg-crit-bg px-3.5 py-2.5 text-sm font-semibold text-crit">
          <AlertTriangle className="size-4" aria-hidden />
          {error}
        </p>
      )}
      {aviso && <p className="rounded-xl border border-[#eed9a8] bg-warn-bg px-3.5 py-2.5 text-[13px] text-warn">{aviso}</p>}

      <div className="grid items-start gap-4 xl:grid-cols-[1fr_340px]">
        <section aria-label="COA" className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div role="tablist" aria-label="Vista" className="inline-flex rounded-[11px] bg-hueso p-1">
              {(["original", "publico"] as const).map((v) => (
                <button key={v} role="tab" type="button" aria-selected={vista === v} onClick={() => setVista(v)} className={cn("rounded-lg px-3 py-1.5 text-[13px] font-semibold text-[#5c544c]", vista === v && "bg-card text-foreground shadow-sm")}>
                  {v === "original" ? "Original · solo administrador" : "Público · lo que recibe el cliente"}
                </button>
              ))}
            </div>
            <span className="flex-1 text-[12px] text-muted-foreground">{vista === "original" ? "Arrastra para tapar una zona. Clic en una zona para elegirla; Suprimir la quita." : "Así se verá. Las franjas son visibles: no se pone otro nombre."}</span>
          </div>
          {!paginas && !error && (
            <p className="flex items-center gap-2 py-16 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Abriendo el COA original…
            </p>
          )}
          {paginas?.map((p, i) => (
            <PaginaEditable
              key={i}
              indice={i}
              pagina={p}
              zonas={zonas}
              elegida={elegida}
              publico={vista === "publico"}
              onAgregar={(z) => setZonas((zs) => [...zs, z])}
              onElegir={setElegida}
              total={paginas.length}
            />
          ))}
        </section>

        <aside className="flex flex-col gap-3 xl:sticky xl:top-4">
          <section aria-labelledby="titulo-tapar" className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
            <h2 id="titulo-tapar" className="text-lg font-medium">
              Qué se tapa
            </h2>
            <span className="text-[12px] text-muted-foreground">Confirma cada una. El laboratorio y los resultados quedan visibles.</span>
            {ZONAS_REQUERIDAS.map((z) => (
              <label key={z.id} className="flex items-center gap-2.5 border-b py-2 text-[13.5px] last:border-b-0">
                <input type="checkbox" checked={hechas.includes(z.id)} onChange={(e) => setHechas((h) => (e.target.checked ? [...h, z.id] : h.filter((x) => x !== z.id)))} className="size-4 accent-[var(--color-espresso)]" />
                <span className="flex-1 font-semibold">{z.texto}</span>
              </label>
            ))}
            <span className="text-[11.5px] text-muted-foreground">Si algún dato no aparece en este COA, márcalo igual.</span>
          </section>

          <section aria-label="Zonas marcadas" className="flex flex-col gap-2 rounded-2xl border bg-card p-4 text-[13px]">
            <div className="flex items-center">
              <b className="flex-1">
                {zonas.length} {zonas.length === 1 ? "zona marcada" : "zonas marcadas"}
              </b>
              {zonas.length > 0 && (
                <button type="button" onClick={() => setZonas([])} className="text-[12px] font-semibold text-muted-foreground hover:text-crit">
                  Quitar todas
                </button>
              )}
            </div>
            {zonas.map((z, i) => (
              <div key={i} className={cn("flex items-center gap-2 rounded-lg px-2 py-1", elegida === i && "bg-hueso")}>
                <button type="button" className="flex-1 text-left" onClick={() => setElegida(i)}>
                  Zona {i + 1} · página {z.pagina + 1}
                </button>
                <button type="button" aria-label={`Quitar zona ${i + 1}`} onClick={() => setZonas((zs) => zs.filter((_, j) => j !== i))} className="rounded p-1 text-muted-foreground hover:text-crit">
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </div>
            ))}
          </section>

          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              disabled={ocupado || !paginas}
              onClick={() =>
                iniciar(async () => {
                  const r = await guardarZonas(loteId, zonas)
                  if (r.error) toast.error(r.error)
                  else toast.success("Borrador guardado")
                })
              }
            >
              <Save aria-hidden />
              Guardar borrador
            </Button>
            <Button size="lg" disabled={ocupado || !paginas || !zonas.length || !completas} onClick={aprobar}>
              {ocupado ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
              {listo ? "Volver a aprobar con estos cambios" : "Aprobar COA público"}
            </Button>
            {!completas && <span className="text-[11.5px] text-muted-foreground">Confirma las 5 zonas para aprobar.</span>}
            {listo && (
              <Button
                variant="outline"
                onClick={() =>
                  iniciar(async () => {
                    const r = await ligaPublico(loteId)
                    if (r.url) window.open(r.url, "_blank", "noopener")
                    else toast.error(r.error ?? "No se pudo abrir.")
                  })
                }
              >
                <Eye aria-hidden />
                Ver COA público
              </Button>
            )}
            <p className="text-[11.5px] text-muted-foreground">Se genera un PDF nuevo: cada página es una imagen con las franjas ya pintadas, así que lo tapado no existe en el archivo. No lleva metadatos del original.</p>
          </div>
        </aside>
      </div>
    </>
  )
}

function PaginaEditable({
  indice,
  pagina,
  zonas,
  elegida,
  publico,
  onAgregar,
  onElegir,
  total,
}: {
  indice: number
  pagina: Pagina
  zonas: Zona[]
  elegida: number | null
  publico: boolean
  onAgregar: (z: Zona) => void
  onElegir: (i: number | null) => void
  total: number
}) {
  const caja = useRef<HTMLDivElement>(null)
  const [inicio, setInicio] = useState<{ x: number; y: number } | null>(null)
  const [actual, setActual] = useState<{ x: number; y: number } | null>(null)

  const punto = (e: React.PointerEvent) => {
    const r = caja.current!.getBoundingClientRect()
    return { x: Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1), y: Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1) }
  }
  const rect = inicio && actual ? { x: Math.min(inicio.x, actual.x), y: Math.min(inicio.y, actual.y), w: Math.abs(actual.x - inicio.x), h: Math.abs(actual.y - inicio.y) } : null

  return (
    <figure className="flex flex-col gap-1">
      {total > 1 && <figcaption className="text-[11.5px] font-semibold text-muted-foreground">Página {indice + 1}</figcaption>}
      <div
        ref={caja}
        className={cn("relative w-full touch-none overflow-hidden rounded-lg border select-none", !publico && "cursor-crosshair")}
        style={{ aspectRatio: `${pagina.ancho} / ${pagina.alto}` }}
        onPointerDown={(e) => {
          if (publico || (e.target as HTMLElement).dataset.zona) return
          e.currentTarget.setPointerCapture(e.pointerId)
          onElegir(null)
          setInicio(punto(e))
          setActual(punto(e))
        }}
        onPointerMove={(e) => inicio && setActual(punto(e))}
        onPointerUp={() => {
          if (rect && rect.w > MIN && rect.h > MIN) onAgregar({ pagina: indice, ...rect })
          setInicio(null)
          setActual(null)
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- imagen generada en el navegador */}
        <img src={pagina.src} alt={`COA original, página ${indice + 1}`} className="pointer-events-none absolute inset-0 size-full" draggable={false} />
        {zonas.map((z, i) =>
          z.pagina !== indice ? null : (
            <button
              key={i}
              type="button"
              data-zona="1"
              aria-label={`Zona ${i + 1}`}
              onClick={() => !publico && onElegir(i)}
              className={cn(
                "absolute flex items-center justify-center overflow-hidden",
                publico ? "bg-espresso text-hueso" : "border-2 border-crit bg-crit/25",
                !publico && elegida === i && "ring-2 ring-espresso ring-offset-1",
              )}
              style={{ left: `${z.x * 100}%`, top: `${z.y * 100}%`, width: `${z.w * 100}%`, height: `${z.h * 100}%` }}
            >
              {publico && <span className="px-1 text-center text-[clamp(6px,1.1vw,12px)] leading-tight font-extrabold tracking-wide">{TEXTO_FRANJA}</span>}
            </button>
          ),
        )}
        {rect && <div className="pointer-events-none absolute border-2 border-dashed border-crit bg-crit/15" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }} />}
      </div>
    </figure>
  )
}

function SubirOriginal({ loteId }: { loteId: string }) {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [subiendo, iniciar] = useTransition()
  return (
    <section className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card px-6 py-12 text-center">
      <span className="inline-flex size-11 items-center justify-center rounded-xl bg-hueso">
        <FileText className="size-5" aria-hidden />
      </span>
      <h2 className="text-xl font-medium">Sube el COA original del lote</h2>
      <p className="max-w-md text-sm text-muted-foreground">PDF o imagen tal como lo manda el laboratorio. Solo lo ve el administrador; después se tapan los datos del proveedor.</p>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold has-focus-visible:ring-3 has-focus-visible:ring-ring">
        <Upload className="size-4" aria-hidden />
        {archivo?.name ?? "Elegir archivo"}
        <input type="file" accept="application/pdf,image/png,image/jpeg" className="sr-only" onChange={(e) => setArchivo(e.currentTarget.files?.[0] ?? null)} />
      </label>
      <Button
        disabled={!archivo || subiendo}
        onClick={() =>
          iniciar(async () => {
            const fd = new FormData()
            fd.set("lote_id", loteId)
            fd.set("archivo", archivo!)
            const r = await subirOriginal(fd)
            if (r.error) toast.error(r.error)
            else {
              toast.success("COA original subido")
              window.location.reload()
            }
          })
        }
      >
        {subiendo && <Loader2 className="animate-spin" aria-hidden />}
        Subir COA
      </Button>
    </section>
  )
}
