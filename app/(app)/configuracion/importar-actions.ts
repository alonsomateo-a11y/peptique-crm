"use server"

import { revalidatePath } from "next/cache"

import { registrar } from "@/lib/bitacora"
import { leerTabla } from "@/lib/importar/leer"
import { plantillaDe, type EstadoFila, type Revision } from "@/lib/importar/plantillas"
import { PLANES, type Plan } from "@/lib/importar/procesar"
import { obtenerSesion, type Sesion } from "@/lib/sesion"
import { crearClienteAdmin } from "@/lib/supabase/admin"

const MAX_MB = 8
const MAX_FILAS_VISTA = 400

/** Lee el archivo y arma el plan; nada se guarda todavía. */
async function preparar(form: FormData): Promise<{ error: string } | { plan: Plan; sesion: Sesion; tipo: string; archivo: string; reconocidas: string[]; faltan: string[] }> {
  const sesion = await obtenerSesion()
  if (sesion.perfil !== "administrador" || sesion.personaId === "demo") return { error: "Solo el administrador importa datos. Entra con tu PIN." }
  const plantilla = plantillaDe(String(form.get("tipo") ?? ""))
  if (!plantilla) return { error: "Elige qué vas a importar." }
  const archivo = form.get("archivo")
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "Elige el archivo." }
  if (!/\.(xlsx|csv)$/i.test(archivo.name)) return { error: "Sube un Excel (.xlsx) o un CSV. Si es .xls, guárdalo como .xlsx." }
  if (archivo.size > MAX_MB * 1024 * 1024) return { error: `El archivo pesa más de ${MAX_MB} MB.` }

  let tabla
  try {
    tabla = await leerTabla(archivo, plantilla.columnas)
  } catch {
    return { error: "No pudimos leer el archivo. Ábrelo en Excel, guárdalo como .xlsx e intenta de nuevo." }
  }
  const faltan = plantilla.columnas.filter((c) => c.requerida && !tabla.reconocidas.includes(c.clave)).map((c) => c.titulo)
  const reconocidas = plantilla.columnas.filter((c) => tabla.reconocidas.includes(c.clave)).map((c) => c.titulo)
  if (!tabla.filas.length && !reconocidas.length) return { error: "No encontramos los encabezados de la plantilla en el archivo. Descarga la plantilla para ver los nombres de las columnas." }
  if (faltan.length) return { error: `Faltan columnas: ${faltan.join(", ")}.` }
  if (!tabla.filas.length) return { error: "El archivo no tiene renglones con datos." }

  const plan = await PLANES[plantilla.tipo](tabla, { admin: crearClienteAdmin(), sesion })
  return { plan, sesion, tipo: plantilla.titulo, archivo: archivo.name, reconocidas, faltan }
}

function resumen(plan: Plan): Pick<Revision, "filas" | "conteo" | "aCrear"> {
  const conteo: Record<EstadoFila, number> = { nueva: 0, existe: 0, error: 0 }
  for (const f of plan.filas) conteo[f.estado]++
  // Primero los errores, para que se vean aunque el archivo sea largo.
  const orden: Record<EstadoFila, number> = { error: 0, nueva: 1, existe: 2 }
  const filas = [...plan.filas].sort((a, b) => orden[a.estado] - orden[b.estado] || a.renglon - b.renglon).slice(0, MAX_FILAS_VISTA)
  return { filas, conteo, aCrear: plan.aCrear }
}

export async function revisarImportacion(form: FormData): Promise<Revision> {
  const r = await preparar(form)
  if ("error" in r) return { error: r.error }
  return { ok: true, archivo: r.archivo, reconocidas: r.reconocidas, ...resumen(r.plan) }
}

export async function importarDatos(form: FormData): Promise<Revision> {
  const r = await preparar(form)
  if ("error" in r) return { error: r.error }
  if (!r.plan.aCrear) return { error: "No hay renglones nuevos sin error para importar.", ...resumen(r.plan) }
  try {
    const importado = await r.plan.aplicar()
    await registrar(crearClienteAdmin(), r.sesion, { area: "configuracion", accion: `importó ${importado} de “${r.tipo}” desde ${r.archivo}` })
    for (const ruta of ["/inicio", "/red", "/clientes", "/inventario", "/ventas", "/pagos", "/reportes", "/configuracion"]) revalidatePath(ruta)
    return { ok: true, importado, archivo: r.archivo, ...resumen(r.plan) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo importar." }
  }
}
