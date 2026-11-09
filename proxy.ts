import { NextResponse, type NextRequest } from "next/server"

import { actualizarSesion } from "@/lib/supabase/proxy"

export async function proxy(request: NextRequest) {
  // La sesión se exige cuando Supabase está configurado; en desarrollo, solo con REQUIERE_SESION=1.
  if (
    (process.env.REQUIERE_SESION !== "1" && process.env.NODE_ENV !== "production") ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    return NextResponse.next()
  }
  return actualizarSesion(request)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
