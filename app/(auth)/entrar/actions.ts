"use server"

import { redirect } from "next/navigation"

import { PERFILES, type Perfil } from "@/lib/perfiles"
import { iniciales, inicioPorPerfil, sesionActiva } from "@/lib/sesion"
import { correoInterno, crearClienteAdmin } from "@/lib/supabase/admin"
import { crearClienteServidor } from "@/lib/supabase/server"

export type PersonaEntrada = { id: string; nombre: string; iniciales: string; zona: string | null }

const MENSAJES: Record<string, string> = {
  incorrecto: "PIN incorrecto. Revisa e intenta de nuevo.",
  bloqueado: "Demasiados intentos. Espera 15 minutos o pide al administrador que te desbloquee.",
  vencido: "Tu acceso temporal ya venció. Pide al administrador que lo extienda.",
  inactivo: "Este perfil no está activo. Habla con el administrador.",
}

/** Personas activas de un perfil, para elegir quién entra. Solo nombre y zona. */
export async function listarPersonas(perfil: Perfil): Promise<PersonaEntrada[]> {
  if (!PERFILES.includes(perfil) || !sesionActiva()) return []
  const admin = crearClienteAdmin()
  const { data } = await admin
    .from("personas")
    .select("id, nombre, zona")
    .eq("perfil", perfil)
    .eq("estado", "activo")
    .not("auth_user_id", "is", null)
    .order("nombre")
  return (data ?? []).map((p) => ({ id: p.id, nombre: p.nombre, iniciales: iniciales(p.nombre), zona: p.zona }))
}

/** Valida el PIN en el servidor y abre la sesión de Supabase de esa persona. */
export async function entrarConPin(_prev: string | null, form: FormData): Promise<string | null> {
  const personaId = String(form.get("persona") ?? "")
  const pin = String(form.get("pin") ?? "")
  if (!/^[0-9]{4}$/.test(pin) || !personaId) return "Escribe tu PIN de 4 números."
  if (!sesionActiva()) return "El acceso con PIN todavía no está activado."

  const admin = crearClienteAdmin()
  const { data: resultado, error } = await admin.rpc("verificar_pin", { p_persona: personaId, p_pin: pin })
  if (error) return "No pudimos validar el PIN. Intenta de nuevo."
  if (resultado !== "ok") return MENSAJES[resultado as string] ?? MENSAJES.incorrecto

  const { data: persona } = await admin.from("personas").select("perfil, auth_user_id").eq("id", personaId).single()
  // El administrador puede tener su correo real; los demás usan el correo interno.
  const { data: usuario } = await admin.auth.admin.getUserById(persona!.auth_user_id!)
  const { data: enlace, error: errEnlace } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: usuario.user?.email ?? correoInterno(personaId),
  })
  if (errEnlace || !enlace) return "No pudimos abrir tu sesión. Intenta de nuevo."

  const supabase = await crearClienteServidor()
  const { error: errSesion } = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: enlace.properties.hashed_token,
  })
  if (errSesion) return "No pudimos abrir tu sesión. Intenta de nuevo."

  await admin.from("bitacora").insert({ persona_id: personaId, perfil: persona?.perfil, area: "acceso", accion: "entró con PIN" })
  redirect(inicioPorPerfil(persona!.perfil as Perfil))
}

/** Acceso opcional del administrador con correo y contraseña. */
export async function entrarConCorreo(_prev: string | null, form: FormData): Promise<string | null> {
  const email = String(form.get("email") ?? "").trim()
  const password = String(form.get("password") ?? "")
  if (!email || !password) return "Escribe tu correo y tu contraseña."
  if (!sesionActiva()) return "El acceso todavía no está activado."

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user) return "Correo o contraseña incorrectos."

  const { data: persona } = await supabase.from("personas").select("perfil, estado").eq("auth_user_id", data.user.id).maybeSingle()
  if (!persona || persona.perfil !== "administrador" || persona.estado !== "activo") {
    await supabase.auth.signOut()
    return "Este acceso es solo para el administrador."
  }
  redirect("/inicio")
}
