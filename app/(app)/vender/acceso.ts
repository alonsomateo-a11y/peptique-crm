import "server-only"

import { redirect } from "next/navigation"

import { inicioPorPerfil, obtenerSesion } from "@/lib/sesion"

/** Vender en persona: admin comercial (y el administrador, para revisarlo). */
export async function sesionVender() {
  const s = await obtenerSesion()
  if (s.perfil !== "admin_comercial" && s.perfil !== "administrador") redirect(inicioPorPerfil(s.perfil))
  return s
}
