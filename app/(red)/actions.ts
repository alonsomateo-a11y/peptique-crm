"use server"

import { revalidatePath } from "next/cache"

import { obtenerSesion } from "@/lib/sesion"
import { crearClienteAdmin } from "@/lib/supabase/admin"
import { normalizarWhatsapp, whatsappValido } from "@/lib/telefono"

/** El distribuidor pide el alta de un comisionista; queda por aprobar del administrador. */
export async function pedirAltaComisionista(d: { nombre: string; whatsapp: string; zona: string }): Promise<{ error?: string }> {
  const s = await obtenerSesion()
  if (s.perfil !== "distribuidor" || s.personaId === "demo") return { error: "Solo los distribuidores agregan comisionistas." }
  const nombre = d.nombre.trim().replace(/\s+/g, " ")
  const whatsapp = normalizarWhatsapp(d.whatsapp)
  if (nombre.length < 2) return { error: "Escribe el nombre completo." }
  if (!whatsappValido(whatsapp)) return { error: "WhatsApp de 10 dígitos." }
  const admin = crearClienteAdmin()
  const { data, error } = await admin
    .from("personas")
    .insert({ nombre, whatsapp, perfil: "comisionista", estado: "por_aprobar", zona: d.zona.trim() || null, distribuidor_id: s.personaId, creado_por: s.personaId })
    .select("id")
    .single()
  if (error || !data) return { error: "No se pudo enviar la solicitud." }
  await admin.from("bitacora").insert({ persona_id: s.personaId, perfil: s.perfil, area: "red", accion: `pidió el alta de ${nombre} como comisionista`, entidad: "persona", entidad_id: data.id })
  revalidatePath("/app/equipo")
  revalidatePath("/red")
  return {}
}

/** Cambio de PIN por la propia persona: confirma el actual antes de poner el nuevo. */
export async function cambiarMiPin(actual: string, nuevo: string): Promise<{ error?: string }> {
  const s = await obtenerSesion()
  if (s.personaId === "demo") return { error: "Entra con tu PIN." }
  if (!/^[0-9]{4}$/.test(nuevo)) return { error: "El PIN nuevo son 4 números." }
  if (nuevo === actual) return { error: "El PIN nuevo debe ser distinto." }
  const admin = crearClienteAdmin()
  const { data: r } = await admin.rpc("verificar_pin", { p_persona: s.personaId, p_pin: actual })
  if (r !== "ok") return { error: r === "bloqueado" ? "Demasiados intentos. Espera 15 minutos." : "Tu PIN actual no es correcto." }
  const { error } = await admin.rpc("asignar_pin", { p_persona: s.personaId, p_pin: nuevo })
  if (error) return { error: "No se pudo cambiar el PIN." }
  await admin.from("bitacora").insert({ persona_id: s.personaId, perfil: s.perfil, area: "equipo", accion: "cambió su PIN" })
  return {}
}
