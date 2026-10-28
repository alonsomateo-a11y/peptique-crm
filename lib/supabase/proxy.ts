import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const RUTAS_PUBLICAS = ["/entrar", "/salir"]

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
    return NextResponse.redirect(url)
  }

  return respuesta
}
