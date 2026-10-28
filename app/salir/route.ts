import { NextResponse, type NextRequest } from "next/server"

import { crearClienteServidor, supabaseConfigurado } from "@/lib/supabase/server"

/** Cierra la sesión y regresa a /entrar (con el motivo, si lo hay). */
export async function GET(request: NextRequest) {
  if (supabaseConfigurado()) {
    const supabase = await crearClienteServidor()
    await supabase.auth.signOut()
  }
  const url = new URL("/entrar", request.url)
  const motivo = request.nextUrl.searchParams.get("motivo")
  if (motivo) url.searchParams.set("motivo", motivo)
  return NextResponse.redirect(url)
}
