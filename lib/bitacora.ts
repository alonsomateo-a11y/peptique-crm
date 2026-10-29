import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Sesion } from "@/lib/sesion"

export type Registro = {
  area: string
  accion: string
  entidad?: string
  entidad_id?: string
  producto_id?: string
}

/** Deja constancia en la bitácora (Actividad). Nunca detiene la acción si falla. */
export async function registrar(supabase: SupabaseClient, sesion: Sesion, r: Registro) {
  if (sesion.personaId === "demo") return
  await supabase.from("bitacora").insert({ persona_id: sesion.personaId, perfil: sesion.perfil, ...r })
}
