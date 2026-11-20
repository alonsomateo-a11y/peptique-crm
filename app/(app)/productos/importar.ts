import "server-only"

import ExcelJS from "exceljs"

import { skuDe } from "@/lib/catalogo"

import type { CambioImportacion, FilaImportada } from "./datos-cliente"

/** Nombres como vienen en el Excel → nombre comercial. */
const NOMBRES: [RegExp, string][] = [
  [/^ghk-?cu ?raw$/i, "GHK-Cu Raw"],
  [/^ghk-?cu$/i, "GHK-Cu"],
  [/^bpc-?157$/i, "BPC-157"],
  [/^tb-?500$/i, "TB-500"],
  // Apodos del Excel financiero → nombre de la etiqueta.
  [/^glp-?2$/i, "Tirzepatide"],
  [/^glp-?3$/i, "Retatrutide"],
  [/^wolf ?blend$/i, "Wolverine Stack"],
  [/^pt-?141$/i, "PT-141"],
  [/^mo(?:ts|st)[- ]?c$/i, "MOTS-c"],
  [/^ss-?31$/i, "SS-31"],
  [/^bac ?water$/i, "Agua bacteriostática"],
  [/^kpv$/i, "KPV"],
  [/^klow$/i, "KLOW"],
  [/^semax$/i, "Semax"],
  [/^selank$/i, "Selank"],
  [/^nad\+?$/i, "NAD+"],
  [/^glutathione$/i, "Glutathione"],
  [/^epitalon$/i, "Epitalon"],
  [/^beauty blend$/i, "Beauty Blend"],
]

/** Mezclas que el Excel escribe por componente y la etiqueta por total. */
const PRESENTACION_ETIQUETA: [RegExp, string][] = [
  [/^wolverine stack\|10\/10/i, "10 mg"],
  [/^beauty blend\|50\/20/i, "60 mg"],
]

/** "GHKCU 100" → GHK-Cu / 100 mg · "BAC water 30" → Agua bacteriostática / 30 ml. */
export function separarNombre(original: string) {
  const limpio = original.trim().replace(/\s+/g, " ")
  const m = limpio.match(/^(.*?)\s*(\d+(?:[.,]\d+)?(?:\/\d+(?:[.,]\d+)?)?)\s*(mg|ml|mcg)?$/i)
  let base = m && m[1] ? m[1] : limpio
  let dosis = m && m[1] ? m[2] : null
  if (/^ghkcuraw$/i.test(base)) [base, dosis] = ["GHK-Cu Raw", null]
  const nombre = NOMBRES.reduce((n, [re, rep]) => (re.test(n) ? n.replace(re, rep) : n), base.trim())
  const unidad = m?.[3]?.toLowerCase() ?? (/bacteriost/i.test(nombre) ? "ml" : "mg")
  const presentacion = dosis ? `${dosis.replace(",", ".")} ${unidad}` : "Única"
  const total = PRESENTACION_ETIQUETA.find(([re]) => re.test(`${nombre}|${dosis ?? ""}`))?.[1]
  return { nombre, presentacion: total ?? presentacion }
}

const valor = (v: ExcelJS.CellValue): unknown =>
  v && typeof v === "object" && "result" in v ? (v as ExcelJS.CellFormulaValue).result : v

/** Texto de una celda; descarta errores y objetos que no son texto. */
const textoCelda = (v: ExcelJS.CellValue): string => {
  const x = valor(v)
  if (x === null || x === undefined) return ""
  if (typeof x === "object") return "richText" in x ? (x as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join("") : ""
  return String(x)
}

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()

/** Precio de una celda: acepta "$1,200.00", "1200 MXN", "1 200". null = vacía; NaN = trae texto que no es precio. */
export const dinero = (v: unknown): number | null => {
  if (v === null || v === undefined) return null
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : NaN
  const t = String(v).trim()
  if (!t || t === "-" || t === "—") return null
  const limpio = t.replace(/\$|mxn|pesos|\s/gi, "").replace(/,(?=\d{3}(?:\D|$))/g, "")
  const n = Number(limpio)
  return /^-?\d+(?:\.\d+)?$/.test(limpio) && Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN
}

/** Encabezados que aceptamos, sin acentos ni mayúsculas. */
const ENCABEZADOS: Record<"producto" | "publico" | "medico" | "distribuidor", string[]> = {
  producto: ["producto", "productos", "nombre", "nombre del producto", "articulo", "peptido"],
  publico: ["$ web", "web", "precio publico", "precio al publico", "publico", "$ publico", "precio", "precio de lista", "precio lista", "pvp", "precio venta", "precio de venta"],
  medico: ["$ medico", "precio medico", "medico", "doctor", "precio doctor", "$ doctor", "precio para medico"],
  distribuidor: ["$ distribuidor", "precio distribuidor", "distribuidor", "mayoreo", "precio mayoreo", "$ mayoreo"],
}

const COLUMNA = { publico: "Público", medico: "Médico", distribuidor: "Distribuidor" } as const

/**
 * Lee la lista de precios de la primera hoja que tenga una columna de producto y una de precio público.
 * Médico y Distribuidor son opcionales. Una celda vacía o una columna que no viene no borra el precio actual.
 */
export async function leerCatalogo(archivo: ArrayBuffer): Promise<FilaImportada[]> {
  const libro = new ExcelJS.Workbook()
  await libro.xlsx.load(archivo)

  for (const hoja of libro.worksheets) {
    for (let r = 1; r <= Math.min(hoja.rowCount, 30); r++) {
      const fila = hoja.getRow(r)
      const cols: Partial<Record<keyof typeof ENCABEZADOS, number>> = {}
      fila.eachCell((c, i) => {
        const t = sinAcentos(textoCelda(c.value)).replace(/\s+/g, " ").replace(/:$/, "")
        for (const k of Object.keys(ENCABEZADOS) as (keyof typeof ENCABEZADOS)[]) if (!cols[k] && ENCABEZADOS[k].includes(t)) cols[k] = i
      })
      if (!cols.producto || !cols.publico) continue

      const filas: FilaImportada[] = []
      const vistos = new Map<string, FilaImportada>()
      for (let i = r + 1; i <= hoja.rowCount; i++) {
        const f = hoja.getRow(i)
        const original = textoCelda(f.getCell(cols.producto).value).trim()
        if (!original || original === "0") continue
        const { nombre, presentacion } = separarNombre(original)
        const avisos: string[] = []
        const leer = (k: keyof typeof COLUMNA) => {
          if (!cols[k]) return null
          const n = dinero(valor(f.getCell(cols[k]!).value))
          if (n === null) return null
          if (Number.isNaN(n) || n <= 0) {
            avisos.push(`${COLUMNA[k]}: “${textoCelda(f.getCell(cols[k]!).value)}” no es un precio; se conserva el actual.`)
            return null
          }
          return n
        }
        const precios = { precio_publico: leer("publico"), precio_medico: leer("medico"), precio_distribuidor: leer("distribuidor") }
        const clave = claveProducto(nombre, presentacion)
        const previa = vistos.get(clave)
        if (previa) {
          const distinto = (["precio_publico", "precio_medico", "precio_distribuidor"] as const).some((k) => precios[k] !== null && previa[k] !== null && precios[k] !== previa[k])
          if (distinto) previa.avisos.push(`Aparece otra vez en el renglón ${i} con otro precio; se usa el del renglón ${previa.renglon}.`)
          continue
        }
        const nueva: FilaImportada = { renglon: i, original, nombre, presentacion, sku: skuDe(nombre, presentacion), ...precios, avisos }
        vistos.set(clave, nueva)
        filas.push(nueva)
      }
      return filas
    }
  }
  throw new Error("No encontré una hoja con columnas de Producto y Precio público (o $ Web).")
}

/** Clave para comparar sin importar espacios, guiones ni mayúsculas: "BPC 157 10mg" = "BPC-157 10 mg". */
export const claveProducto = (nombre: string, presentacion: string) => `${sinAcentos(nombre).replace(/[^a-z0-9+]/g, "")}|${sinAcentos(presentacion).replace(/[^a-z0-9.]/g, "")}`

type ProductoActual = { id: string; nombre: string; presentacion: string; sku: string | null; precio_publico: number | string | null; precio_medico: number | string | null; precio_distribuidor: number | string | null }

const CLAVES = ["precio_publico", "precio_medico", "precio_distribuidor"] as const
const NOMBRE = { precio_publico: "público", precio_medico: "médico", precio_distribuidor: "distribuidor" } as const
const num = (v: number | string | null) => (v === null ? null : Number(v))

/**
 * Compara la lista contra el catálogo. Celda vacía o columna que no viene = se conserva el precio actual.
 * Marca lo que conviene revisar: producto que no existe, cambios de 30 % o más, precios en desorden.
 */
export function compararPrecios(filas: FilaImportada[], actuales: ProductoActual[]): CambioImportacion[] {
  const porClave = new Map(actuales.map((p) => [claveProducto(p.nombre, p.presentacion), p]))
  return filas.map((f): CambioImportacion => {
    const p = porClave.get(claveProducto(f.nombre, f.presentacion))
    const avisos = [...f.avisos]
    if (!p) {
      avisos.push("No está en el catálogo: entra como producto nuevo y oculto. Si es un error de nombre, corrígelo en el Excel.")
      return { ...f, avisos, tipo: "nuevo" }
    }
    const antes = { precio_publico: num(p.precio_publico), precio_medico: num(p.precio_medico), precio_distribuidor: num(p.precio_distribuidor) }
    const despues = { precio_publico: f.precio_publico ?? antes.precio_publico, precio_medico: f.precio_medico ?? antes.precio_medico, precio_distribuidor: f.precio_distribuidor ?? antes.precio_distribuidor }
    for (const k of CLAVES) {
      const a = antes[k]
      const d = despues[k]
      if (a && d && Math.abs(d - a) / a >= 0.3) avisos.push(`El precio ${NOMBRE[k]} cambia ${d > a ? "+" : ""}${Math.round(((d - a) / a) * 100)}%. Revisa que no falte o sobre un cero.`)
    }
    const { precio_publico: pub, precio_medico: med, precio_distribuidor: dis } = despues
    if (pub && med && med > pub) avisos.push("El precio médico queda arriba del público.")
    if (pub && dis && dis > pub) avisos.push("El precio distribuidor queda arriba del público.")
    else if (med && dis && dis > med) avisos.push("El precio distribuidor queda arriba del médico.")
    const cambia = CLAVES.some((k) => despues[k] !== antes[k])
    return { ...f, ...despues, avisos, antes, sku: p.sku ?? f.sku, tipo: cambia ? "precio" : "igual", id: p.id }
  })
}
