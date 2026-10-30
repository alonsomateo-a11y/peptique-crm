"use server"

import { randomBytes } from "node:crypto"
import { revalidatePath } from "next/cache"

import { registrar } from "@/lib/bitacora"
import { PERFIL_INFO, PERFILES, type Perfil } from "@/lib/perfiles"
import { obtenerSesion } from "@/lib/sesion"
import { correoInterno, crearClienteAdmin } from "@/lib/supabase/admin"
import { crearClienteServidor } from "@/lib/supabase/server"

import type { Resultado } from "./tipos"

const texto = (f: FormData, k: string) => String(f.get(k) ?? "").trim()
const RUTA = "/configuracion"

async function soloAdmin() {
  const sesion = await obtenerSesion()
  return sesion.perfil === "administrador" ? sesion : null
}

/** "2026-11-02T23:59" en hora de Monterrey (UTC-6, sin horario de verano) → ISO. */
const desdeLocal = (v: string) => (v ? new Date(`${v}:00-06:00`).toISOString() : null)

/** Da de alta o edita a una persona del equipo, con su acceso y PIN. */
export async function guardarPersona(_prev: Resultado, form: FormData): Promise<Resultado> {
  const sesion = await soloAdmin()
  if (!sesion) return { error: "Solo el administrador puede editar el equipo." }

  const id = texto(form, "id") || null
  const perfil = texto(form, "perfil") as Perfil
  const estado = (texto(form, "estado") || "activo") as "activo" | "baja" | "por_aprobar"
  const pin = texto(form, "pin")
  const datos = {
    nombre: texto(form, "nombre").replace(/\s+/g, " "),
    whatsapp: texto(form, "whatsapp").replace(/[^\d+]/g, ""),
    perfil,
    estado,
    zona: texto(form, "zona") || null,
    distribuidor_id: perfil === "comisionista" ? texto(form, "distribuidor_id") || null : null,
    vence_en: perfil === "temporal" ? desdeLocal(texto(form, "vence_en")) : null,
  }

  const supabase = await crearClienteServidor()
  const { data: antes } = id
    ? await supabase.from("personas").select("estado, perfil, auth_user_id, pin_hash").eq("id", id).single()
    : { data: null }

  const errores: Record<string, string> = {}
  if (datos.nombre.length < 2) errores.nombre = "Escribe el nombre."
  if (datos.whatsapp.replace(/\D/g, "").length < 10) errores.whatsapp = "WhatsApp de 10 dígitos."
  if (!PERFILES.includes(perfil)) errores.perfil = "Elige un perfil."
  if (perfil === "comisionista" && !datos.distribuidor_id) errores.distribuidor_id = "Elige a su distribuidor."
  if (perfil === "temporal" && !datos.vence_en) errores.vence_en = "Indica cuándo vence."
  if (pin && !/^[0-9]{4}$/.test(pin)) errores.pin = "El PIN son 4 números."
  if (!pin && estado === "activo" && !antes?.pin_hash) errores.pin = "Asigna un PIN de 4 números para que pueda entrar."
  if (id === sesion.personaId && (perfil !== "administrador" || estado !== "activo"))
    errores.perfil = "No puedes cambiar tu propio perfil ni darte de baja."
  if (Object.keys(errores).length) return { errores, error: "Revisa los campos marcados." }

  const { data: guardada, error } = id
    ? await supabase.from("personas").update(datos).eq("id", id).select("id, auth_user_id").single()
    : await supabase.from("personas").insert({ ...datos, creado_por: sesion.personaId }).select("id, auth_user_id").single()
  if (error || !guardada) return { error: "No se pudo guardar a la persona." }

  // Cada persona tiene un usuario de Supabase Auth con un correo interno; entra solo con PIN.
  if (estado === "activo" && !guardada.auth_user_id) {
    const admin = crearClienteAdmin()
    const { data: usuario, error: errUsuario } = await admin.auth.admin.createUser({
      email: correoInterno(guardada.id),
      email_confirm: true,
      password: randomBytes(24).toString("base64url"),
      user_metadata: { persona_id: guardada.id },
    })
    if (errUsuario || !usuario.user) {
      if (!id) await supabase.from("personas").delete().eq("id", guardada.id)
      return { error: "No se pudo crear el acceso. Intenta de nuevo." }
    }
    await supabase.from("personas").update({ auth_user_id: usuario.user.id }).eq("id", guardada.id)
  }

  if (pin) {
    const { error: errPin } = await supabase.rpc("asignar_pin", { p_persona: guardada.id, p_pin: pin })
    if (errPin) return { error: "Se guardó la persona, pero no el PIN. Intenta de nuevo." }
  }
  if (estado === "baja" && antes?.estado !== "baja") await supabase.rpc("cerrar_sesiones", { p_persona: guardada.id })

  const accion = !id
    ? `dio de alta a ${datos.nombre} (${PERFIL_INFO[perfil].nombre})`
    : antes?.estado === "por_aprobar" && estado === "activo"
      ? `aprobó el alta de ${datos.nombre}`
      : estado === "baja" && antes?.estado !== "baja"
        ? `dio de baja a ${datos.nombre}`
        : `editó a ${datos.nombre}${pin ? " y cambió su PIN" : ""}`
  await registrar(supabase, sesion, { area: "equipo", accion, entidad: "persona", entidad_id: guardada.id })
  revalidatePath(RUTA)
  revalidatePath("/red")
  return { ok: true }
}

/** Cierra todas las sesiones abiertas de una persona (al instante). */
export async function cerrarSesionPersona(personaId: string): Promise<Resultado> {
  const sesion = await soloAdmin()
  if (!sesion) return { error: "Solo el administrador." }
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc("cerrar_sesiones", { p_persona: personaId })
  if (error) return { error: "No se pudo cerrar la sesión." }
  await registrar(supabase, sesion, { area: "equipo", accion: "cerró la sesión a distancia", entidad: "persona", entidad_id: personaId })
  return { ok: true }
}

/** Quita el bloqueo por intentos fallidos de PIN. */
export async function desbloquearPersona(personaId: string): Promise<Resultado> {
  const sesion = await soloAdmin()
  if (!sesion) return { error: "Solo el administrador." }
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from("personas").update({ intentos_fallidos: 0, bloqueado_hasta: null }).eq("id", personaId)
  if (error) return { error: "No se pudo desbloquear." }
  await registrar(supabase, sesion, { area: "equipo", accion: "desbloqueó el PIN", entidad: "persona", entidad_id: personaId })
  revalidatePath(RUTA)
  revalidatePath("/red")
  return { ok: true }
}

/** Comisiones fijas en %, sobre la venta sin IVA. */
export async function guardarComisiones(_prev: Resultado, form: FormData): Promise<Resultado> {
  const sesion = await soloAdmin()
  if (!sesion) return { error: "Solo el administrador puede cambiar comisiones." }
  const directa = Number(texto(form, "directa"))
  const equipo = Number(texto(form, "equipo"))
  if (![directa, equipo].every((n) => Number.isFinite(n) && n >= 0 && n <= 50)) return { error: "Usa porcentajes entre 0 y 50." }
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from("configuracion").upsert({ clave: "comisiones", valor: { directa, equipo } })
  if (error) return { error: "No se pudieron guardar las comisiones." }
  await registrar(supabase, sesion, { area: "configuracion", accion: `cambió comisiones a ${directa}% + ${equipo}%` })
  revalidatePath(RUTA)
  revalidatePath("/red")
  return { ok: true }
}
