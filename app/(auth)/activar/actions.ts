"use server"

import { redirect } from "next/navigation"

import { marcarUsada, revisarLiga } from "@/lib/liga-acceso"
import { inicioPorPerfil } from "@/lib/sesion"
import { crearClienteAdmin } from "@/lib/supabase/admin"
import { crearClienteServidor } from "@/lib/supabase/server"

export type EstadoActivar = { error?: string; errores?: Record<string, string> } | null

/** PIN fáciles de adivinar. */
const PIN_DEBIL = (p: string) => /^(\d)\1{3}$/.test(p) || "0123456789".includes(p) || "9876543210".includes(p)

/** Con la liga de primer acceso, la persona crea su PIN (y el administrador, su correo y contraseña). */
export async function activarAcceso(token: string, _prev: EstadoActivar, form: FormData): Promise<EstadoActivar> {
  const liga = await revisarLiga(token)
  if (liga === "vencida") return { error: "Esta liga ya se usó o venció. Pide una nueva al administrador." }
  if (liga === "invalida") return { error: "Esta liga no es válida. Pide una nueva al administrador." }

  const pin = String(form.get("pin") ?? "")
  const pin2 = String(form.get("pin2") ?? "")
  const conCorreo = liga.perfil === "administrador"
  const email = String(form.get("email") ?? "").trim().toLowerCase()
  const password = String(form.get("password") ?? "")
  const password2 = String(form.get("password2") ?? "")

  const errores: Record<string, string> = {}
  if (!/^[0-9]{4}$/.test(pin)) errores.pin = "El PIN son 4 números."
  else if (PIN_DEBIL(pin)) errores.pin = "Elige un PIN menos obvio (no 1111 ni 1234)."
  else if (pin !== pin2) errores.pin2 = "Los dos PIN no coinciden."
  if (conCorreo) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errores.email = "Escribe un correo válido."
    if (password.length < 10) errores.password = "Usa al menos 10 caracteres."
    else if (password !== password2) errores.password2 = "Las contraseñas no coinciden."
  }
  if (Object.keys(errores).length) return { errores, error: "Revisa los campos marcados." }

  // Se aparta la liga antes de cambiar nada: si dos pestañas la mandan a la vez, solo una pasa.
  if (!(await marcarUsada(liga.ligaId))) return { error: "Esta liga ya se usó o venció. Pide una nueva al administrador." }
  const admin = crearClienteAdmin()
  const liberar = () => admin.from("ligas_acceso").update({ usada_en: null }).eq("id", liga.ligaId)

  if (conCorreo) {
    const { error } = await admin.auth.admin.updateUserById(liga.authUserId, { email, password, email_confirm: true })
    if (error) {
      await liberar()
      const repetido = /already|registered|exists/i.test(error.message)
      return repetido
        ? { errores: { email: "Ese correo ya tiene una cuenta. Usa otro." }, error: "Revisa los campos marcados." }
        : { error: "No pudimos guardar tu correo. Intenta de nuevo." }
    }
  }
  const { error: errPin } = await admin.rpc("asignar_pin", { p_persona: liga.personaId, p_pin: pin })
  if (errPin) {
    await liberar()
    return { error: "No pudimos guardar tu PIN. Intenta de nuevo." }
  }

  // Abre su sesión de una vez.
  const { data: usuario } = await admin.auth.admin.getUserById(liga.authUserId)
  const { data: enlace } = usuario.user?.email
    ? await admin.auth.admin.generateLink({ type: "magiclink", email: usuario.user.email })
    : { data: null }
  await admin.from("bitacora").insert({
    persona_id: liga.personaId,
    perfil: liga.perfil,
    area: "acceso",
    accion: conCorreo ? "creó su PIN, correo y contraseña con la liga de acceso" : "creó su PIN con la liga de acceso",
  })
  if (enlace?.properties) {
    const supabase = await crearClienteServidor()
    const { error } = await supabase.auth.verifyOtp({ type: "email", token_hash: enlace.properties.hashed_token })
    if (!error) redirect(inicioPorPerfil(liga.perfil))
  }
  redirect("/entrar")
}
