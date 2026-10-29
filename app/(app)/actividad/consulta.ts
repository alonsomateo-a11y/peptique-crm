import "server-only"

import { PERFILES, type Perfil } from "@/lib/perfiles"
import { crearClienteServidor } from "@/lib/supabase/server"

import { AREAS } from "./areas"

export { AREAS }

export const LIMITE = 300

export type Filtros = { q?: string; producto?: string; persona?: string; perfil?: Perfil; area?: string; mes?: string }

export type Movimiento = {
  id: number
  creado_en: string
  persona: string | null
  perfil: Perfil | null
  area: string
  accion: string
  producto: string | null
}

const uuid = /^[0-9a-f-]{36}$/

/** Lee los filtros de la URL descartando valores que no son válidos. */
export function leerFiltros(sp: Record<string, string | string[] | undefined>): Filtros {
  const v = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : undefined) || undefined
  return {
    q: v("q")?.slice(0, 80),
    producto: v("producto")?.match(uuid)?.[0],
    persona: v("persona")?.match(uuid)?.[0],
    perfil: PERFILES.find((p) => p === v("perfil")),
    area: AREAS.find((a) => a === v("area")),
    mes: v("mes")?.match(/^\d{4}-\d{2}$/)?.[0],
  }
}

export async function buscarMovimientos(f: Filtros, limite = LIMITE): Promise<{ filas: Movimiento[]; total: number }> {
  const supabase = await crearClienteServidor()
  let q = supabase
    .from("bitacora")
    .select("id, creado_en, perfil, area, accion, personas(nombre), productos(nombre, presentacion)", { count: "exact" })
    .order("creado_en", { ascending: false })
    .limit(limite)
  if (f.q) q = q.ilike("accion", `%${f.q.replace(/[%_]/g, "")}%`)
  if (f.producto) q = q.eq("producto_id", f.producto)
  if (f.persona) q = q.eq("persona_id", f.persona)
  if (f.perfil) q = q.eq("perfil", f.perfil)
  if (f.area) q = q.eq("area", f.area)
  if (f.mes) {
    const [a, m] = f.mes.split("-").map(Number)
    // Mes en hora de Monterrey (UTC-6).
    const inicio = new Date(`${f.mes}-01T00:00:00-06:00`)
    const fin = new Date(`${m === 12 ? a + 1 : a}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01T00:00:00-06:00`)
    q = q.gte("creado_en", inicio.toISOString()).lt("creado_en", fin.toISOString())
  }
  const { data, count, error } = await q
  if (error) throw error
  return {
    total: count ?? 0,
    filas: (data ?? []).map((r) => {
      const persona = r.personas as unknown as { nombre: string } | null
      const producto = r.productos as unknown as { nombre: string; presentacion: string } | null
      return {
        id: r.id,
        creado_en: r.creado_en,
        perfil: r.perfil,
        area: r.area,
        accion: r.accion,
        persona: persona?.nombre ?? null,
        producto: producto ? `${producto.nombre} ${producto.presentacion}` : null,
      }
    }),
  }
}
