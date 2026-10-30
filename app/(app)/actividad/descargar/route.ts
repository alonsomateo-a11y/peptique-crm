import type { NextRequest } from "next/server"

import { PERFIL_INFO } from "@/lib/perfiles"
import { celdaCsv as celda } from "@/lib/csv"
import { exigirAdmin } from "@/lib/sesion"

import { NOMBRE_AREA } from "../areas"

import { buscarMovimientos, leerFiltros } from "../consulta"


/** Actividad filtrada en CSV (abre en Excel con acentos). */
export async function GET(request: NextRequest) {
  await exigirAdmin()
  const filtros = leerFiltros(Object.fromEntries(request.nextUrl.searchParams))
  const { filas } = await buscarMovimientos(filtros, 5000)
  const fecha = new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short", timeZone: "America/Monterrey" })
  const csv = [
    ["Cuándo", "Quién", "Perfil", "Área", "Qué pasó", "Producto"].join(","),
    ...filas.map((f) => [fecha.format(new Date(f.creado_en)), f.persona ?? "Sistema", f.perfil ? PERFIL_INFO[f.perfil].nombre : null, NOMBRE_AREA[f.area as keyof typeof NOMBRE_AREA] ?? f.area, f.accion, f.producto].map(celda).join(",")),
  ].join("\r\n")
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="actividad-peptique.csv"`,
    },
  })
}
