"use server"

import { revalidatePath } from "next/cache"

import { obtenerSesion } from "@/lib/sesion"
import { crearClienteAdmin } from "@/lib/supabase/admin"
import { normalizarWhatsapp, whatsappValido } from "@/lib/telefono"

const uuid = /^[0-9a-f-]{36}$/

async function sesionRed() {
  const s = await obtenerSesion()
  return (s.perfil === "administrador" || s.perfil === "admin_comercial") && s.personaId !== "demo" ? s : null
}

/** Alta pedida por el admin comercial: queda por aprobar (sin acceso ni PIN) hasta que la apruebe el administrador. */
export async function solicitarAlta(d: { perfil: string; nombre: string; whatsapp: string; zona: string; distribuidorId: string }): Promise<{ error?: string }> {
  const s = await sesionRed()
  if (!s) return { error: "Sin permiso." }
  const perfil = d.perfil === "distribuidor" ? "distribuidor" : "comisionista"
  const nombre = d.nombre.trim().replace(/\s+/g, " ")
  const whatsapp = normalizarWhatsapp(d.whatsapp)
  if (nombre.length < 2) return { error: "Escribe el nombre completo." }
  if (!whatsappValido(whatsapp)) return { error: "WhatsApp de 10 dígitos." }
  if (perfil === "comisionista" && !uuid.test(d.distribuidorId)) return { error: "Elige a su distribuidor." }
  const admin = crearClienteAdmin()
  const { data, error } = await admin
    .from("personas")
    .insert({ nombre, whatsapp, perfil, estado: "por_aprobar", zona: d.zona.trim() || null, distribuidor_id: perfil === "comisionista" ? d.distribuidorId : null, creado_por: s.personaId })
    .select("id")
    .single()
  if (error || !data) return { error: "No se pudo enviar la solicitud." }
  await admin.from("bitacora").insert({ persona_id: s.personaId, perfil: s.perfil, area: "red", accion: `pidió el alta de ${nombre} como ${perfil}`, entidad: "persona", entidad_id: data.id })
  revalidatePath("/red")
  return {}
}

/** Baja de una persona de la red. Si es distribuidor, también sus comisionistas. Su historial se conserva. */
export async function darDeBaja(personaId: string, motivo: string): Promise<{ error?: string; bajas?: number }> {
  const s = await sesionRed()
  if (!s || !uuid.test(personaId)) return { error: "Sin permiso." }
  if (motivo.trim().length < 3) return { error: "Indica el motivo." }
  const admin = crearClienteAdmin()
  const { data: p } = await admin.from("personas").select("id, nombre, perfil, estado").eq("id", personaId).single()
  if (!p || !["distribuidor", "comisionista"].includes(p.perfil)) return { error: "No es parte de la red." }
  const { data: equipo } = p.perfil === "distribuidor" ? await admin.from("personas").select("id").eq("distribuidor_id", personaId).neq("estado", "baja") : { data: [] }
  const ids = [personaId, ...(equipo ?? []).map((e) => e.id)]
  await admin.from("personas").update({ estado: "baja", motivo_estado: motivo.trim() }).in("id", ids)
  for (const id of ids) await admin.rpc("cerrar_sesiones", { p_persona: id })
  await admin.from("bitacora").insert({
    persona_id: s.personaId,
    perfil: s.perfil,
    area: "red",
    accion: `dio de baja a ${p.nombre}${ids.length > 1 ? ` y a sus ${ids.length - 1} comisionistas` : ""} · ${motivo.trim()}`,
    entidad: "persona",
    entidad_id: personaId,
  })
  revalidatePath("/red")
  revalidatePath(`/red/${personaId}`)
  return { bajas: ids.length }
}
