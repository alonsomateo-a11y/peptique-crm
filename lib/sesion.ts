import "server-only"

import { redirect } from "next/navigation"

import type { Perfil } from "@/lib/perfiles"
import { crearClienteServidor, supabaseConfigurado } from "@/lib/supabase/server"

export type Sesion = {
  personaId: string
  nombre: string
  iniciales: string
  perfil: Perfil
}

const ZONA = "America/Monterrey"

const DEMO: Sesion = { personaId: "demo", nombre: "Admin", iniciales: "AD", perfil: "administrador" }

/** Se exige sesión solo cuando Supabase está configurado y REQUIERE_SESION=1. */
export const sesionActiva = () => supabaseConfigurado() && process.env.REQUIERE_SESION === "1"

export const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("")

export const inicioPorPerfil = (perfil: Perfil) =>
  perfil === "administrador" || perfil === "admin_comercial" ? "/inicio" : perfil === "mostrador" || perfil === "temporal" ? "/mostrador" : "/vender"

const dia = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(d)

/**
 * Sesión actual. Reglas:
 *  - La sesión dura el turno: vale solo el mismo día (hora de Monterrey) en que se abrió; a las 23:59 se cierra.
 *  - El perfil temporal además vence en su fecha.
 *  - El administrador puede cerrar sesiones a distancia (personas.sesion_minima).
 * Sin Supabase o con REQUIERE_SESION distinto de "1", regresa un administrador de demostración.
 */
export async function obtenerSesion(): Promise<Sesion> {
  if (!sesionActiva()) return DEMO

  const supabase = await crearClienteServidor()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims) redirect("/entrar")

  const { data: persona } = await supabase
    .from("personas")
    .select("id, nombre, perfil, estado, sesion_minima, vence_en")
    .eq("auth_user_id", claims.sub)
    .maybeSingle()
  if (!persona || persona.estado !== "activo") redirect("/salir")

  // Momento en que se inició sesión (no cambia al refrescar el token).
  const amr = (claims.amr as { timestamp: number }[] | undefined) ?? []
  const inicio = new Date((amr.length ? Math.min(...amr.map((a) => a.timestamp)) : (claims.iat as number)) * 1000)
  const ahora = new Date()

  if (dia(inicio) !== dia(ahora)) redirect("/salir?motivo=turno")
  if (persona.sesion_minima && inicio < new Date(persona.sesion_minima)) redirect("/salir?motivo=cerrada")
  if (persona.perfil === "temporal" && persona.vence_en && new Date(persona.vence_en) < ahora) redirect("/salir?motivo=vencido")

  return {
    personaId: persona.id,
    nombre: persona.nombre,
    iniciales: iniciales(persona.nombre),
    perfil: persona.perfil as Perfil,
  }
}
