import "server-only"

import { redirect } from "next/navigation"

import type { Perfil } from "@/lib/perfiles"
import { inicioPorPerfil, obtenerSesion } from "@/lib/sesion"

export const PERFILES_MOSTRADOR: Perfil[] = ["administrador", "admin_comercial", "mostrador", "temporal"]

/** Sesión para el mostrador; a la red la manda a su inicio. */
export async function sesionMostrador() {
  const sesion = await obtenerSesion()
  if (!PERFILES_MOSTRADOR.includes(sesion.perfil)) redirect(inicioPorPerfil(sesion.perfil))
  return sesion
}
