"use server"

import { revalidatePath } from "next/cache"

import { registrar } from "@/lib/bitacora"
import { obtenerSesion } from "@/lib/sesion"
import { crearClienteServidor } from "@/lib/supabase/server"
import { normalizarWhatsapp, whatsappValido } from "@/lib/telefono"

import { TIPOS, type Resultado } from "./tipos"

const texto = (f: FormData, k: string) => String(f.get(k) ?? "").trim()
const uuid = /^[0-9a-f-]{36}$/

async function soloAdmin() {
  const sesion = await obtenerSesion()
  return sesion.perfil === "administrador" ? sesion : null
}

/** Crea o edita un cliente. El WhatsApp es único y se guarda a 10 dígitos. */
export async function guardarCliente(_prev: Resultado, form: FormData): Promise<Resultado> {
  const sesion = await soloAdmin()
  if (!sesion) return { error: "Solo el administrador puede editar clientes." }

  const id = texto(form, "id") || null
  const tipo = texto(form, "tipo")
  const referido = texto(form, "referido_por")
  const vendedor = texto(form, "vendedor_id")
  const datos = {
    nombre: texto(form, "nombre").replace(/\s+/g, " "),
    whatsapp: normalizarWhatsapp(texto(form, "whatsapp")),
    correo: texto(form, "correo").toLowerCase() || null,
    tipo: tipo as (typeof TIPOS)[number]["valor"],
    origen: texto(form, "origen") || null,
    referido_por: uuid.test(referido) && referido !== id ? referido : null,
    vendedor_id: uuid.test(vendedor) ? vendedor : null,
    etiquetas: [...new Set(texto(form, "etiquetas").split(",").map((t) => t.trim()).filter(Boolean))].slice(0, 12),
    acepta_whatsapp: form.get("acepta_whatsapp") === "on",
  }

  const errores: Record<string, string> = {}
  if (datos.nombre.length < 2) errores.nombre = "Escribe el nombre completo."
  if (!whatsappValido(datos.whatsapp)) errores.whatsapp = "WhatsApp de 10 dígitos."
  if (datos.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.correo)) errores.correo = "Correo no válido."
  if (!TIPOS.some((t) => t.valor === tipo)) errores.tipo = "Elige el tipo de cliente."
  if (Object.keys(errores).length) return { errores, error: "Revisa los campos marcados." }

  const supabase = await crearClienteServidor()
  const { data, error } = id
    ? await supabase.from("clientes").update(datos).eq("id", id).select("id").single()
    : await supabase.from("clientes").insert(datos).select("id").single()
  if (error || !data) {
    if (error?.code === "23505") return { errores: { whatsapp: "Ya hay un cliente con ese WhatsApp." }, error: "Revisa los campos marcados." }
    return { error: "No se pudo guardar el cliente." }
  }

  await registrar(supabase, sesion, {
    area: "clientes",
    accion: `${id ? "editó" : "dio de alta"} a ${datos.nombre}`,
    entidad: "cliente",
    entidad_id: data.id,
  })
  revalidatePath("/clientes")
  revalidatePath(`/clientes/${data.id}`)
  return { ok: true, id: data.id }
}

/** Nota interna en la ficha del cliente (queda en su actividad). */
export async function agregarNota(_prev: Resultado, form: FormData): Promise<Resultado> {
  const sesion = await soloAdmin()
  if (!sesion) return { error: "Solo el administrador." }
  const clienteId = texto(form, "cliente_id")
  const nota = texto(form, "nota").slice(0, 500)
  if (!uuid.test(clienteId)) return { error: "Cliente no válido." }
  if (!nota) return { errores: { nota: "Escribe la nota." } }
  const supabase = await crearClienteServidor()
  await registrar(supabase, sesion, { area: "clientes", accion: `nota: “${nota}”`, entidad: "cliente", entidad_id: clienteId })
  revalidatePath(`/clientes/${clienteId}`)
  return { ok: true }
}
