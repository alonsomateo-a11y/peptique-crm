import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

// /d/ son las ligas firmadas de documentos para el cliente (COA público y protocolo).
// /mcp y el descubrimiento OAuth usan el token de Claude, no cookies: se validan en su ruta.
export const COOKIE_SIGUIENTE = "peptique_siguiente"

const RUTAS_PUBLICAS = ["/entrar", "/salir", "/d/", "/mcp", "/.well-known/", "/oauth/recurso", "/oauth/metadatos"]

/** Refresca la sesión de Supabase y manda a /entrar si no hay sesión. */
export async function actualizarSesion(request: NextRequest) {
  let respuesta = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (lista) => {
          lista.forEach(({ name, value }) => request.cookies.set(name, value))
          respuesta = NextResponse.next({ request })
          lista.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, options))
        },
      },
    },
  )

  const { data } = await supabase.auth.getClaims()
  const publica = RUTAS_PUBLICAS.some((r) => request.nextUrl.pathname.startsWith(r))

  if (!data?.claims && !publica) {
    const url = request.nextUrl.clone()
    url.pathname = "/entrar"
    url.search = ""
    return recordarConsentir(request, NextResponse.redirect(url))
  }

  return recordarConsentir(request, respuesta)
}

/**
 * Conectar Claude: se recuerda la pantalla para permitir el acceso, para regresar a ella después
 * de entrar con el PIN (también si la sesión del navegador era de otro turno y se cierra).
 */
function recordarConsentir(request: NextRequest, r: NextResponse) {
  if (request.nextUrl.pathname === "/oauth/consentir" && request.nextUrl.searchParams.has("authorization_id"))
    r.cookies.set(COOKIE_SIGUIENTE, `/oauth/consentir${request.nextUrl.search}`, { httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", maxAge: 600, path: "/" })
  return r
}
