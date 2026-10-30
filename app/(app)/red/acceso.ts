import "server-only"

import { redirect } from "next/navigation"

import { inicioPorPerfil, obtenerSesion } from "@/lib/sesion"

export async function sesionRedEscritorio() {
  const s = await obtenerSesion()
  if (s.perfil !== "administrador" && s.perfil !== "admin_comercial") redirect(inicioPorPerfil(s.perfil))
  return s
}
