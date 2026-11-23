import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import type { Perfil } from "@/lib/perfiles"
import { iniciales, type Sesion } from "@/lib/sesion"
import { supabaseConfigurado } from "@/lib/supabase/server"

/** Perfiles que pueden conectar Claude (decisión de Alonso, 2026-11-22). */
export const PERFILES_CONECTOR: Perfil[] = ["administrador", "admin_comercial"]

/** El conector vuelve a pedir el PIN cada 30 días (decisión de Alonso, 2026-11-22). */
export const DIAS_CONECTOR = 30

export type SesionMcp = { sesion: Sesion; supabase: SupabaseClient; clienteOAuth: string }
export type FallaSesion = { falla: "sin_token" | "token_invalido" | "sin_permiso"; detalle: string }

/**
 * Cliente de Supabase que actúa como el usuario del token: PostgREST aplica sus RLS.
 * Nunca se usa la llave secreta aquí.
 */
export function clienteConToken(token: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

/**
 * Valida el token OAuth que manda Claude y arma la sesión de esa persona con las mismas reglas
 * del CRM: persona activa, perfil con conector, sesiones cerradas por el administrador y el
 * plazo de 30 días. Sin Supabase configurado no hay acceso (fail-closed, sin modo demo).
 */
export async function sesionDesdeToken(autorizacion: string | null): Promise<SesionMcp | FallaSesion> {
  const token = autorizacion?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (!token) return { falla: "sin_token", detalle: "Falta el token de acceso." }
  if (!supabaseConfigurado()) return { falla: "token_invalido", detalle: "El conector no está activo en este servidor." }

  const supabase = clienteConToken(token)
  const { data, error } = await supabase.auth.getClaims(token)
  const claims = data?.claims
  if (error || !claims) return { falla: "token_invalido", detalle: "El token no es válido o ya venció." }
  // Solo tokens emitidos por el flujo OAuth del conector (no la sesión del navegador).
  const clienteOAuth = typeof claims.client_id === "string" ? claims.client_id : null
  if (!clienteOAuth) return { falla: "token_invalido", detalle: "Este token no es del conector." }

  const { data: persona } = await supabase
    .from("personas")
    .select("id, nombre, perfil, estado, sesion_minima")
    .eq("auth_user_id", claims.sub)
    .maybeSingle()
  if (!persona || persona.estado !== "activo") return { falla: "token_invalido", detalle: "Tu acceso al CRM no está activo." }
  if (!PERFILES_CONECTOR.includes(persona.perfil as Perfil))
    return { falla: "sin_permiso", detalle: "Tu perfil no puede usar el conector de Claude." }

  // Cuándo se autorizó el conector (no cambia al refrescar el token).
  const amr = (claims.amr as { timestamp: number }[] | undefined) ?? []
  const inicio = new Date((amr.length ? Math.min(...amr.map((a) => a.timestamp)) : (claims.iat as number)) * 1000)
  if (Date.now() - inicio.getTime() > DIAS_CONECTOR * 86_400_000)
    return { falla: "token_invalido", detalle: "Pasaron 30 días: vuelve a conectar Claude con tu PIN." }
  if (persona.sesion_minima && inicio < new Date(persona.sesion_minima))
    return { falla: "token_invalido", detalle: "El administrador cerró tus sesiones. Vuelve a conectar Claude." }

  return {
    sesion: { personaId: persona.id, nombre: persona.nombre, iniciales: iniciales(persona.nombre), perfil: persona.perfil as Perfil },
    supabase,
    clienteOAuth,
  }
}
