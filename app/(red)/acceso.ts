import "server-only"

import { redirect } from "next/navigation"

import { inicioPorPerfil, obtenerSesion } from "@/lib/sesion"
import { crearClienteAdmin } from "@/lib/supabase/admin"

/** Sesión de la app de la red (distribuidor o comisionista) con sus datos básicos. */
export async function sesionRed() {
  const s = await obtenerSesion()
  if (s.perfil !== "distribuidor" && s.perfil !== "comisionista") redirect(inicioPorPerfil(s.perfil))
  const { data } = await crearClienteAdmin().from("personas").select("zona, whatsapp, distribuidor_id, personas:distribuidor_id(nombre)").eq("id", s.personaId).single()
  return {
    ...s,
    zona: data?.zona ?? null,
    whatsapp: data?.whatsapp ?? "",
    distribuidor: (data?.personas as unknown as { nombre: string } | null)?.nombre ?? null,
  }
}
