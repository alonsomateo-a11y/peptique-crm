/**
 * Celda de CSV segura: escapa comillas y neutraliza fórmulas. Si un texto empieza con
 * = + - @ (por ejemplo un nombre capturado con mala intención), Excel lo ejecutaría.
 */
export const celdaCsv = (v: string | number | null | undefined) => {
  if (typeof v === "number") return String(v)
  let t = String(v ?? "")
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`
  return `"${t.replace(/"/g, '""')}"`
}

export function descargarCsv(nombre: string, filas: (string | number | null | undefined)[][]) {
  const csv = filas.map((f) => f.map(celdaCsv).join(",")).join("\r\n")
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }))
  Object.assign(document.createElement("a"), { href: url, download: nombre }).click()
  URL.revokeObjectURL(url)
}
