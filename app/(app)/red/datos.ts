import "server-only"

import { crearClienteAdmin } from "@/lib/supabase/admin"
import { liberarApartadosVencidos } from "@/lib/ventas"

import type { PersonaFila } from "../configuracion/tipos"

export type MiembroRed = PersonaFila & { vendidoMes: number; ventasMes: number; comisionMes: number; esperando: number; creado_en: string; motivo_estado: string | null; creado_por: string | null }

const inicioMes = () => {
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey" }).format(new Date())
  return new Date(`${hoy.slice(0, 7)}-01T00:00:00-06:00`).toISOString()
}

/**
 * Personas de la red con lo vendido y comisionado en el mes.
 * Lo usan el administrador y el admin comercial; se lee con la llave secreta y solo
 * salen montos de venta y comisión (nada de costos).
 */
export async function cargarRed(yo: string): Promise<MiembroRed[]> {
  await liberarApartadosVencidos()
  const admin = crearClienteAdmin()
  const mes = inicioMes()
  const [personas, ventas, comisiones] = await Promise.all([
    admin
      .from("personas")
      .select("id, nombre, whatsapp, perfil, estado, zona, distribuidor_id, vence_en, bloqueado_hasta, pin_hash, auth_user_id, creado_en, motivo_estado, creado_por")
      .in("perfil", ["distribuidor", "comisionista"])
      .order("nombre"),
    admin.from("ventas").select("vendedor_id, total, estado, creado_en").eq("canal", "red").neq("estado", "cancelada"),
    admin.from("comisiones").select("persona_id, monto, ventas!inner(creado_en)").gte("ventas.creado_en", mes),
  ])
  const ahora = Date.now()
  return (personas.data ?? []).map((p) => {
    const suyas = (ventas.data ?? []).filter((v) => v.vendedor_id === p.id)
    const delMes = suyas.filter((v) => v.creado_en >= mes && v.estado !== "esperando_pago")
    return {
      id: p.id,
      nombre: p.nombre,
      whatsapp: p.whatsapp,
      perfil: p.perfil,
      estado: p.estado,
      zona: p.zona,
      distribuidor_id: p.distribuidor_id,
      vence_en: p.vence_en,
      vencido: false,
      bloqueado: !!p.bloqueado_hasta && Date.parse(p.bloqueado_hasta) > ahora,
      tienePin: !!p.pin_hash,
      tieneAcceso: !!p.auth_user_id,
      esYo: p.id === yo,
      creado_en: p.creado_en,
      motivo_estado: p.motivo_estado,
      creado_por: p.creado_por,
      vendidoMes: delMes.reduce((s, v) => s + Number(v.total), 0),
      ventasMes: delMes.length,
      comisionMes: (comisiones.data ?? []).filter((c) => c.persona_id === p.id).reduce((s, c) => s + Number(c.monto), 0),
      esperando: suyas.filter((v) => v.estado === "esperando_pago").length,
    }
  })
}
