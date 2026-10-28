import "server-only"

import type { Perfil } from "@/lib/perfiles"

export type Sesion = {
  personaId: string
  nombre: string
  iniciales: string
  perfil: Perfil
}

/**
 * Sesión actual. Mientras no exista el proyecto de Supabase de Peptique,
 * regresa un administrador de demostración para poder construir las pantallas.
 * Cuando se conecte Supabase, se lee de la sesión real (ver lib/supabase/server.ts).
 */
export async function obtenerSesion(): Promise<Sesion> {
  return { personaId: "demo", nombre: "Admin", iniciales: "AD", perfil: "administrador" }
}
