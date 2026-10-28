import "server-only"

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

/** Cliente de Supabase para Server Components, Server Actions y Route Handlers. */
export async function crearClienteServidor() {
  const almacen = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => almacen.getAll(),
        setAll: (lista) => {
          try {
            lista.forEach(({ name, value, options }) => almacen.set(name, value, options))
          } catch {
            // Llamado desde un Server Component: el proxy se encarga de refrescar la sesión.
          }
        },
      },
    },
  )
}

export const supabaseConfigurado = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
