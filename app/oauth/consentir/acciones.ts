"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { PERFILES_CONECTOR } from "@/lib/mcp/sesion"
import { obtenerSesion } from "@/lib/sesion"
import { crearClienteAdmin } from "@/lib/supabase/admin"
import { COOKIE_SIGUIENTE } from "@/lib/supabase/proxy"
import { crearClienteServidor } from "@/lib/supabase/server"

import { redireccionPermitida } from "./permitidos"

/** Permite o niega que Claude use el CRM con la sesión de esta persona. */
export async function decidir(form: FormData) {
  const sesion = await obtenerSesion()
  ;(await cookies()).delete(COOKIE_SIGUIENTE)
  const id = String(form.get("authorization_id") ?? "")
  const permitir = form.get("decision") === "permitir"
  if (!/^[\w-]{8,100}$/.test(id)) redirect("/oauth/consentir?error=solicitud")

  const supabase = await crearClienteServidor()
  const { data: detalle } = await supabase.auth.oauth.getAuthorizationDetails(id)
  const puede = PERFILES_CONECTOR.includes(sesion.perfil) && !!detalle && "redirect_uri" in detalle && redireccionPermitida(detalle.redirect_uri)

  const { data, error } = permitir && puede ? await supabase.auth.oauth.approveAuthorization(id) : await supabase.auth.oauth.denyAuthorization(id)
  if (error || !data?.redirect_url) redirect("/oauth/consentir?error=solicitud")

  if (permitir && puede && sesion.personaId !== "demo") {
    await crearClienteAdmin().from("bitacora").insert({ persona_id: sesion.personaId, perfil: sesion.perfil, area: "acceso", accion: `conectó Claude (${detalle && "client" in detalle ? detalle.client.name : "conector"})` })
  }
  redirect(data.redirect_url)
}
