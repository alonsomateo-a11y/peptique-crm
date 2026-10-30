"use server"

import { revalidatePath } from "next/cache"

import { obtenerSesion } from "@/lib/sesion"
import { crearClienteAdmin } from "@/lib/supabase/admin"

/** Marcar contactado o no contactar. Lo hacen el administrador y el admin comercial. */
export async function cambiarAviso(avisoId: string, estado: "contactado" | "no_contactar" | "por_avisar"): Promise<{ error?: string }> {
  const s = await obtenerSesion()
  if ((s.perfil !== "administrador" && s.perfil !== "admin_comercial") || s.personaId === "demo" || !/^[0-9a-f-]{36}$/.test(avisoId)) return { error: "Sin permiso." }
  const admin = crearClienteAdmin()
  const { data: a } = await admin.from("avisos_recompra").select("id, cliente_id, clientes(nombre), productos(nombre, presentacion)").eq("id", avisoId).single()
  if (!a) return { error: "Aviso no encontrado." }
  const { error } = await admin
    .from("avisos_recompra")
    .update(estado === "contactado" ? { estado, contactado_por: s.personaId, contactado_en: new Date().toISOString() } : { estado })
    .eq("id", avisoId)
  if (error) return { error: "No se pudo actualizar." }
  const cliente = (a.clientes as unknown as { nombre: string } | null)?.nombre ?? ""
  const producto = a.productos as unknown as { nombre: string; presentacion: string } | null
  await admin.from("bitacora").insert({
    persona_id: s.personaId,
    perfil: s.perfil,
    area: "recompras",
    accion: estado === "contactado" ? `marcó contactado a ${cliente} (${producto?.nombre} ${producto?.presentacion})` : estado === "no_contactar" ? `marcó no contactar a ${cliente}` : `regresó a por avisar a ${cliente}`,
    entidad: "cliente",
    entidad_id: a.cliente_id,
  })
  revalidatePath("/recompras")
  return {}
}
