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
  // Liga relativa: detrás de nginx, request.url trae la dirección interna del contenedor (0.0.0.0:3000).
  const motivo = request.nextUrl.searchParams.get("motivo")
  const destino = motivo ? `/entrar?motivo=${encodeURIComponent(motivo)}` : "/entrar"
  return new NextResponse(null, { status: 307, headers: { Location: destino, "Cache-Control": "no-store" } })
}
