import "server-only"

import ExcelJS from "exceljs"

import { skuDe } from "@/lib/catalogo"

import type { FilaImportada } from "./datos-cliente"

/** Nombres como vienen en el Excel → nombre comercial. */
const NOMBRES: [RegExp, string][] = [
  [/^ghk-?cu ?raw$/i, "GHK-Cu Raw"],
  [/^ghk-?cu$/i, "GHK-Cu"],
  [/^bpc-?157$/i, "BPC-157"],
  [/^tb-?500$/i, "TB-500"],
  [/^glp-?(\d)$/i, "GLP-$1"],
  [/^pt-?141$/i, "PT-141"],
  [/^mo(?:ts|st)[- ]?c$/i, "MOTS-c"],
  [/^ss-?31$/i, "SS-31"],
  [/^bac ?water$/i, "Agua bacteriostática"],
  [/^kpv$/i, "KPV"],
  [/^klow$/i, "KLOW"],
  [/^semax$/i, "Semax"],
  [/^selank$/i, "Selank"],
  [/^nad\+?$/i, "NAD+"],
  [/^glutathione$/i, "Glutatión"],
  [/^epitalon$/i, "Epitalon"],
  [/^beauty blend$/i, "Beauty Blend"],
  [/^wolf blend$/i, "Wolf Blend"],
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
  return { nombre, presentacion: dosis ? `${dosis.replace(",", ".")} ${unidad}` : "Única" }
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

const dinero = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[$,\s]/g, ""))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

/**
 * Lee el catálogo de la primera hoja que tenga columnas "Producto" y "$ Web" (o "Precio público").
 * Médico y Distribuidor son opcionales.
 */
export async function leerCatalogo(archivo: ArrayBuffer): Promise<FilaImportada[]> {
  const libro = new ExcelJS.Workbook()
  await libro.xlsx.load(archivo)

  for (const hoja of libro.worksheets) {
    for (let r = 1; r <= Math.min(hoja.rowCount, 15); r++) {
      const fila = hoja.getRow(r)
      const cols: Record<string, number> = {}
      fila.eachCell((c, i) => {
        const t = sinAcentos(textoCelda(c.value))
        if (t === "producto") cols.producto = i
        else if (t === "$ web" || t === "precio publico" || t === "publico") cols.publico = i
        else if (t === "$ medico" || t === "precio medico" || t === "medico") cols.medico = i
        else if (t === "$ distribuidor" || t === "precio distribuidor" || t === "distribuidor") cols.distribuidor = i
      })
      if (!cols.producto || !cols.publico) continue

      const filas: FilaImportada[] = []
      const vistos = new Set<string>()
      for (let i = r + 1; i <= hoja.rowCount; i++) {
        const f = hoja.getRow(i)
        const original = textoCelda(f.getCell(cols.producto).value).trim()
        if (!original || original === "0") continue
        const { nombre, presentacion } = separarNombre(original)
        const clave = `${sinAcentos(nombre)}|${sinAcentos(presentacion)}`
        if (vistos.has(clave)) continue
        vistos.add(clave)
        filas.push({
          original,
          nombre,
          presentacion,
          sku: skuDe(nombre, presentacion),
          precio_publico: dinero(valor(f.getCell(cols.publico).value)),
          precio_medico: cols.medico ? dinero(valor(f.getCell(cols.medico).value)) : null,
          precio_distribuidor: cols.distribuidor ? dinero(valor(f.getCell(cols.distribuidor).value)) : null,
        })
      }
      return filas
    }
  }
  throw new Error("No encontré una hoja con las columnas Producto y $ Web (o Precio público).")
}

export const claveProducto = (nombre: string, presentacion: string) => `${sinAcentos(nombre)}|${sinAcentos(presentacion)}`
