import "server-only"

import { crearClienteAdmin } from "@/lib/supabase/admin"

export type ComisionFila = {
  id: string
  tipo: "directa" | "equipo"
  porcentaje: number
  monto: number
  folio: string
  fecha: string
  cliente: string
  totalVenta: number
  ventaCancelada: boolean
}

export type PorPagar = { personaId: string; nombre: string; perfil: string; total: number; directa: number; equipo: number; filas: ComisionFila[] }
/** Un pago = las comisiones de una persona marcadas juntas (comparten pagada_en). */
export type PagoHecho = { personaId: string; nombre: string; pagadaEn: string; total: number; ventas: number; canceladas: number }

type Crudo = {
  id: string
  persona_id: string
  tipo: "directa" | "equipo"
  porcentaje: number
  monto: number
  pagada_en: string | null
  personas: { nombre: string; perfil: string } | null
  ventas: { folio: string; creado_en: string; total: number; estado: string; clientes: { nombre: string } | null } | null
}

const centavos = (n: number) => Math.round(n * 100) / 100

/** Solo administrador y admin comercial llegan aquí; se lee con la llave secreta y no incluye costos. */
export async function cargarComisiones(): Promise<{ porPagar: PorPagar[]; pagos: PagoHecho[] }> {
  const { data, error } = await crearClienteAdmin()
    .from("comisiones")
    .select("id, persona_id, tipo, porcentaje, monto, pagada_en, personas(nombre, perfil), ventas(folio, creado_en, total, estado, clientes(nombre))")
    .limit(10000)
  if (error) throw error
  const crudas = (data ?? []) as unknown as Crudo[]

  const porPersona = new Map<string, PorPagar>()
  const pagos = new Map<string, PagoHecho>()
  for (const c of crudas) {
    const monto = Number(c.monto)
    const nombre = c.personas?.nombre ?? "—"
    if (c.pagada_en) {
      const k = `${c.persona_id}|${c.pagada_en}`
      const p = pagos.get(k) ?? { personaId: c.persona_id, nombre, pagadaEn: c.pagada_en, total: 0, ventas: 0, canceladas: 0 }
      p.total = centavos(p.total + monto)
      p.ventas++
      if (c.ventas?.estado === "cancelada") p.canceladas++
      pagos.set(k, p)
      continue
    }
    const p = porPersona.get(c.persona_id) ?? { personaId: c.persona_id, nombre, perfil: c.personas?.perfil ?? "", total: 0, directa: 0, equipo: 0, filas: [] }
    p.total = centavos(p.total + monto)
    p[c.tipo] = centavos(p[c.tipo] + monto)
    p.filas.push({
      id: c.id,
      tipo: c.tipo,
      porcentaje: Number(c.porcentaje),
      monto,
      folio: c.ventas?.folio ?? "—",
      fecha: c.ventas?.creado_en ?? "",
      cliente: c.ventas?.clientes?.nombre ?? "—",
      totalVenta: Number(c.ventas?.total ?? 0),
      ventaCancelada: c.ventas?.estado === "cancelada",
    })
    porPersona.set(c.persona_id, p)
  }
  for (const p of porPersona.values()) p.filas.sort((a, b) => a.fecha.localeCompare(b.fecha))
  return {
    porPagar: [...porPersona.values()].sort((a, b) => b.total - a.total),
    pagos: [...pagos.values()].sort((a, b) => b.pagadaEn.localeCompare(a.pagadaEn)).slice(0, 60),
  }
}
