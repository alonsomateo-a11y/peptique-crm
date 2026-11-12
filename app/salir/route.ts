import { NextResponse, type NextRequest } from "next/server"

import { crearClienteServidor, supabaseConfigurado } from "@/lib/supabase/server"

/** Cierra la sesión y regresa a /entrar (con el motivo, si lo hay). */
export async function GET(request: NextRequest) {
  // Next.js precarga en producción los <Link> visibles. Una precarga no debe cerrar la sesión.
  const h = request.headers
  if (h.get("next-router-prefetch") || /prefetch/i.test(h.get("sec-purpose") ?? h.get("purpose") ?? "")) {
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } })
  }
  if (supabaseConfigurado()) {
    const supabase = await crearClienteServidor()
    await supabase.auth.signOut()
  }
  const url = new URL("/entrar", request.url)
  const motivo = request.nextUrl.searchParams.get("motivo")
  if (motivo) url.searchParams.set("motivo", motivo)
  return NextResponse.redirect(url)
}
