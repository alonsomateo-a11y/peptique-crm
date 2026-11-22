import "server-only"

import ExcelJS from "exceljs"

import type { Columna } from "./plantillas"

export const sinAcentos = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, " ")
    .trim()

export type Tabla = {
  filas: { renglon: number; hoja?: string; datos: Record<string, string> }[]
  reconocidas: string[]
  /** Hojas leídas, cuando el archivo trae más de una con datos. */
  hojas?: { nombre: string; renglones: number }[]
}

const MAX_RENGLONES = 20000

/** Texto de una celda de Excel: fechas a AAAA-MM-DD, fórmulas por su resultado. */
function textoCelda(v: ExcelJS.CellValue): string {
  let x: unknown = v
  if (x && typeof x === "object" && "result" in x) x = (x as ExcelJS.CellFormulaValue).result
  if (x === null || x === undefined) return ""
  if (x instanceof Date) return x.toISOString().slice(0, 10)
  if (typeof x === "object") {
    if ("richText" in x) return (x as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join("")
    if ("text" in x) return String((x as { text: unknown }).text)
    return ""
  }
  return String(x).trim()
}

/** CSV con comas o punto y coma, comillas dobles y saltos de línea dentro de comillas. */
function leerCsv(texto: string): string[][] {
  const limpio = texto.replace(/^﻿/, "")
  const primera = limpio.slice(0, limpio.indexOf("\n") >>> 0 || undefined)
  const sep = (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ";" : ","
  const filas: string[][] = []
  let fila: string[] = []
  let celda = ""
  let comillas = false
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i]
    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') {
        celda += '"'
        i++
      } else if (c === '"') comillas = false
      else celda += c
    } else if (c === '"') comillas = true
    else if (c === sep) {
      fila.push(celda.trim())
      celda = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpio[i + 1] === "\n") i++
      fila.push(celda.trim())
      filas.push(fila)
      fila = []
      celda = ""
    } else celda += c
  }
  if (celda || fila.length) {
    fila.push(celda.trim())
    filas.push(fila)
  }
  // Las celdas que protegimos contra fórmulas al exportar empiezan con '.
  return filas.map((f) => f.map((x) => (/^'[=+\-@]/.test(x) ? x.slice(1) : x)))
}

/** Texto de un CSV. Excel en Windows lo guarda en Windows-1252, no en UTF-8: si no es UTF-8 válido, se lee así. */
async function textoCsv(archivo: File) {
  const bytes = await archivo.arrayBuffer()
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder("windows-1252").decode(bytes)
  }
}

type Hoja = { nombre: string; filas: string[][] }

async function matriz(archivo: File): Promise<Hoja[]> {
  const nombre = archivo.name.toLowerCase()
  if (nombre.endsWith(".csv") || archivo.type === "text/csv") return [{ nombre: "CSV", filas: leerCsv(await textoCsv(archivo)) }]
  const libro = new ExcelJS.Workbook()
  await libro.xlsx.load(await archivo.arrayBuffer())
  return libro.worksheets.map((hoja) => {
    const filas: string[][] = []
    const n = Math.min(hoja.rowCount, MAX_RENGLONES + 20)
    for (let r = 1; r <= n; r++) {
      const fila = hoja.getRow(r)
      const celdas: string[] = []
      for (let c = 1; c <= Math.min(hoja.columnCount, 40); c++) celdas.push(textoCelda(fila.getCell(c).value))
      filas.push(celdas)
    }
    return { nombre: hoja.name, filas }
  })
}

/** A qué columna corresponde un encabezado: primero exacto, después alias. */
function columnaDe(encabezado: string, columnas: Columna[]) {
  const e = sinAcentos(encabezado)
  if (!e) return null
  return (
    columnas.find((c) => sinAcentos(c.titulo) === e) ??
    columnas.find((c) => c.clave === e.replace(/ /g, "_")) ??
    columnas.find((c) => c.alias.some((a) => sinAcentos(a) === e)) ??
    null
  )
}

/** El renglón de encabezados de una hoja (en los primeros 15) que reconozca más columnas. */
function encabezados(hoja: string[][], columnas: Columna[]) {
  let mejor: { fila: number; mapa: Map<number, string> } | null = null
  for (let r = 0; r < Math.min(hoja.length, 15); r++) {
    const mapa = new Map<number, string>()
    hoja[r].forEach((h, i) => {
      const c = columnaDe(h, columnas)
      if (c && ![...mapa.values()].includes(c.clave)) mapa.set(i, c.clave)
    })
    if (mapa.size >= 2 && (!mejor || mapa.size > mejor.mapa.size)) mejor = { fila: r, mapa }
  }
  return mejor
}

/**
 * Lee las hojas que traen todas las columnas obligatorias (un Excel con una hoja por año entra completo).
 * Si ninguna las trae, usa la que reconozca más columnas, para poder decir cuáles faltan.
 */
export async function leerTabla(archivo: File, columnas: Columna[]): Promise<Tabla> {
  const obligatorias = columnas.filter((c) => c.requerida).map((c) => c.clave)
  const candidatas = (await matriz(archivo))
    .map((h) => ({ ...h, enc: encabezados(h.filas, columnas) }))
    .filter((h): h is Hoja & { enc: NonNullable<ReturnType<typeof encabezados>> } => h.enc !== null)
  if (!candidatas.length) return { filas: [], reconocidas: [] }
  const completas = candidatas.filter((h) => obligatorias.every((k) => [...h.enc.mapa.values()].includes(k)))
  const usar = completas.length ? completas : [candidatas.reduce((a, b) => (b.enc.mapa.size > a.enc.mapa.size ? b : a))]
  const varias = usar.length > 1
  const filas: Tabla["filas"] = []
  const hojas: NonNullable<Tabla["hojas"]> = []
  for (const h of usar) {
    let n = 0
    for (let r = h.enc.fila + 1; r < h.filas.length && filas.length < MAX_RENGLONES; r++) {
      const datos: Record<string, string> = {}
      for (const [i, clave] of h.enc.mapa) datos[clave] = (h.filas[r][i] ?? "").trim()
      if (Object.values(datos).some(Boolean)) {
        filas.push({ renglon: r + 1, ...(varias ? { hoja: h.nombre } : {}), datos })
        n++
      }
    }
    hojas.push({ nombre: h.nombre, renglones: n })
  }
  const reconocidas = [...new Set(usar.flatMap((h) => [...h.enc.mapa.values()]))]
  return { filas, reconocidas, ...(varias ? { hojas } : {}) }
}

/** "15/09/2026", "15-09-26", "2026-09-15" o número de serie de Excel → AAAA-MM-DD. */
export function fecha(v: string): string | null {
  // La hora, si viene ("23/09/2026 14:30", "2026-09-23T14:30"), no importa.
  const t = v.trim().replace(/(?:[ T]+\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:\s*[ap]\.?\s?m\.?)?(?:Z|[+-]\d{2}:?\d{2})?)$/i, "")
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return valida(+m[1], +m[2], +m[3])
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (m) return valida(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1])
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(t)) * 86400000)
    return d.toISOString().slice(0, 10)
  }
  return null
}

function valida(a: number, m: number, d: number) {
  const f = new Date(Date.UTC(a, m - 1, d))
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d || a < 2015 || a > 2100) return null
  return f.toISOString().slice(0, 10)
}

/** "$1,250.50", "1.250,50" o "1250 MXN" → 1250.5; vacío o no numérico → null. */
export function numero(v: string): number | null {
  let t = v.replace(/[$\s]|mxn|usd|pesos/gi, "")
  // Formato europeo "1.250,50" → 1250.50
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".")
  t = t.replace(/,(?=\d{3}(\D|$))/g, "")
  if (!t) return null
  const n = Number(t.replace(",", "."))
  return Number.isFinite(n) ? n : null
}
