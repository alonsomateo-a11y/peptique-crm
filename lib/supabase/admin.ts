import "server-only"

import { createClient } from "@supabase/supabase-js"

/**
 * Cliente con la llave secreta. SOLO en el servidor y solo para el acceso con PIN
 * y tareas de administración. Se salta RLS: nunca lo uses para leer datos de pantallas.
 */
export function crearClienteAdmin() {
  const llave = process.env.SUPABASE_SECRET_KEY
  if (!llave) throw new Error("Falta SUPABASE_SECRET_KEY en el servidor")
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, llave, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Correo interno con el que se liga cada persona a su usuario de Supabase Auth. Nunca recibe correos. */
export const correoInterno = (personaId: string) => `p-${personaId}@personas.crm.peptique.com.mx`
