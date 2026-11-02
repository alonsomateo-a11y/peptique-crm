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

export type Tabla = { filas: { renglon: number; datos: Record<string, string> }[]; reconocidas: string[] }

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

async function matriz(archivo: File): Promise<string[][][]> {
  const nombre = archivo.name.toLowerCase()
  if (nombre.endsWith(".csv") || archivo.type === "text/csv") return [leerCsv(await archivo.text())]
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
    return filas
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

/**
 * Busca en cada hoja el renglón de encabezados (en los primeros 15) que reconozca más columnas
 * y devuelve los renglones con datos, con las celdas por clave de columna.
 */
export async function leerTabla(archivo: File, columnas: Columna[]): Promise<Tabla> {
  let mejor: { hoja: string[][]; fila: number; mapa: Map<number, string> } | null = null
  for (const hoja of await matriz(archivo)) {
    for (let r = 0; r < Math.min(hoja.length, 15); r++) {
      const mapa = new Map<number, string>()
      hoja[r].forEach((h, i) => {
        const c = columnaDe(h, columnas)
        if (c && ![...mapa.values()].includes(c.clave)) mapa.set(i, c.clave)
      })
      if (mapa.size >= 2 && (!mejor || mapa.size > mejor.mapa.size)) mejor = { hoja, fila: r, mapa }
    }
  }
  if (!mejor) return { filas: [], reconocidas: [] }
  const filas: Tabla["filas"] = []
  for (let r = mejor.fila + 1; r < mejor.hoja.length && filas.length < MAX_RENGLONES; r++) {
    const datos: Record<string, string> = {}
    for (const [i, clave] of mejor.mapa) datos[clave] = (mejor.hoja[r][i] ?? "").trim()
    if (Object.values(datos).some(Boolean)) filas.push({ renglon: r + 1, datos })
  }
  return { filas, reconocidas: [...mejor.mapa.values()] }
}

/** "15/09/2026", "15-09-26", "2026-09-15" o número de serie de Excel → AAAA-MM-DD. */
export function fecha(v: string): string | null {
  const t = v.trim()
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

/** "$1,250.50" → 1250.5; vacío o no numérico → null. */
export function numero(v: string): number | null {
  const t = v.replace(/[$\s]/g, "").replace(/,(?=\d{3}(\D|$))/g, "")
  if (!t) return null
  const n = Number(t.replace(",", "."))
  return Number.isFinite(n) ? n : null
}
