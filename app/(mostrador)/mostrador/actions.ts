"use server"

import { revalidatePath } from "next/cache"

import { obtenerSesion } from "@/lib/sesion"
import { crearClienteAdmin } from "@/lib/supabase/admin"
import { normalizarWhatsapp, whatsappValido } from "@/lib/telefono"
import { aplicarDosis, cobrarDosis, etapasDelCliente, registrarVenta, type Canal, type Metodo, type VentaRegistrada } from "@/lib/ventas"

import { PERFILES_MOSTRADOR } from "../acceso"
import type { ClienteMostrador } from "./tipos"

async function sesionVenta() {
  const s = await obtenerSesion()
  return PERFILES_MOSTRADOR.includes(s.perfil) && s.personaId !== "demo" ? s : null
}

const uuid = /^[0-9a-f-]{36}$/
const SIN_SESION = { error: "Tu sesión no permite vender. Entra con tu PIN." }

export async function abrirCaja(fondo: number): Promise<{ error?: string }> {
  const s = await sesionVenta()
  if (!s) return SIN_SESION
  if (!Number.isFinite(fondo) || fondo < 0 || fondo > 100_000) return { error: "Fondo no válido." }
  const admin = crearClienteAdmin()
  const { data: abierta } = await admin.from("cortes_caja").select("id").is("cerrada_en", null).limit(1).maybeSingle()
  if (!abierta) {
    await admin.from("cortes_caja").insert({ abierta_por: s.personaId, fondo })
    await admin.from("bitacora").insert({ persona_id: s.personaId, perfil: s.perfil, area: "mostrador", accion: `abrió la caja con fondo de $${fondo.toLocaleString("es-MX")}` })
  }
  revalidatePath("/mostrador")
  return {}
}

export async function buscarClientes(q: string): Promise<ClienteMostrador[]> {
  const s = await sesionVenta()
  const texto = q.trim()
  if (!s || texto.length < 2) return []
  const admin = crearClienteAdmin()
  const digitos = texto.replace(/\D/g, "")
  const filtro = digitos.length >= 3 ? `whatsapp.ilike.%${digitos}%` : `nombre.ilike.%${texto.replace(/[%_,()]/g, "")}%`
  const { data } = await admin.from("clientes").select("id, nombre, whatsapp, tipo, waiver_firmado_en").or(filtro).order("nombre").limit(8)
  return (data ?? []).map((c) => ({ id: c.id, nombre: c.nombre, whatsapp: c.whatsapp, tipo: c.tipo, waiver: !!c.waiver_firmado_en, planDosis: false }))
}

export async function clientePorId(id: string): Promise<ClienteMostrador | null> {
  if (!(await sesionVenta()) || !uuid.test(id)) return null
  const { data: c } = await crearClienteAdmin().from("clientes").select("id, nombre, whatsapp, tipo, waiver_firmado_en").eq("id", id).maybeSingle()
  return c ? { id: c.id, nombre: c.nombre, whatsapp: c.whatsapp, tipo: c.tipo, waiver: !!c.waiver_firmado_en, planDosis: false } : null
}

export async function crearClienteRapido(datos: { nombre: string; whatsapp: string; tipo: string }): Promise<{ cliente?: ClienteMostrador; error?: string }> {
  const s = await sesionVenta()
  if (!s) return SIN_SESION
  const nombre = datos.nombre.trim().replace(/\s+/g, " ")
  const whatsapp = normalizarWhatsapp(datos.whatsapp)
  const tipo = ["paciente", "medico", "distribuidor"].includes(datos.tipo) ? datos.tipo : "paciente"
  if (nombre.length < 2) return { error: "Escribe el nombre completo." }
  if (!whatsappValido(whatsapp)) return { error: "WhatsApp de 10 dígitos." }
  const admin = crearClienteAdmin()
  const { data, error } = await admin.from("clientes").insert({ nombre, whatsapp, tipo, origen: "QR del mostrador", acepta_whatsapp: true }).select("id, nombre, whatsapp, tipo").single()
  if (error?.code === "23505") return { error: "Ya hay un cliente con ese WhatsApp. Búscalo." }
  if (error || !data) return { error: "No se pudo dar de alta." }
  await admin.from("bitacora").insert({ persona_id: s.personaId, perfil: s.perfil, area: "clientes", accion: `dio de alta a ${nombre} en el mostrador`, entidad: "cliente", entidad_id: data.id })
  return { cliente: { ...data, waiver: false, planDosis: false } }
}

/** Waiver firmado: nombre escrito por el cliente + aceptación (la firma con el dedo es opcional). */
export async function firmarWaiver(clienteId: string, nombre: string): Promise<{ error?: string }> {
  const s = await sesionVenta()
  if (!s) return SIN_SESION
  if (!uuid.test(clienteId) || nombre.trim().length < 4) return { error: "Escribe el nombre completo de quien firma." }
  const admin = crearClienteAdmin()
  const { error } = await admin.from("clientes").update({ waiver_firmado_en: new Date().toISOString(), waiver_nombre: nombre.trim() }).eq("id", clienteId)
  if (error) return { error: "No se pudo guardar el waiver." }
  await admin.from("bitacora").insert({ persona_id: s.personaId, perfil: s.perfil, area: "mostrador", accion: "registró el waiver firmado", entidad: "cliente", entidad_id: clienteId })
  return {}
}

export async function etapasCliente(clienteId: string): Promise<Record<string, number>> {
  if (!(await sesionVenta()) || !uuid.test(clienteId)) return {}
  return Object.fromEntries(await etapasDelCliente(clienteId))
}

export async function vender(datos: {
  canal: Canal
  clienteId: string
  items: { productoId: string; cantidad: number }[]
  forma: "completo" | "por_dosis"
  metodo: Metodo
  recibido: number | null
  referencia: string | null
}): Promise<{ venta?: VentaRegistrada; error?: string }> {
  const s = await sesionVenta()
  if (!s) return SIN_SESION
  if (datos.canal === "mostrador_caja") {
    const { data } = await crearClienteAdmin().from("cortes_caja").select("id").is("cerrada_en", null).limit(1).maybeSingle()
    if (!data) return { error: "La caja está cerrada. Ábrela para vender en caja." }
  }
  const r = await registrarVenta({ ...datos, vendedor: s })
  if (!r.ok) return { error: r.error }
  revalidatePath("/mostrador", "layout")
  return { venta: r.venta }
}

export async function aplicarDosisMostrador(ventaId: string, numero: number): Promise<{ error?: string }> {
  const s = await sesionVenta()
  if (!s) return SIN_SESION
  const r = await aplicarDosis(s, ventaId, numero)
  revalidatePath("/mostrador", "layout")
  return r.ok ? {} : { error: r.error }
}

export async function cobrarDosisMostrador(ventaId: string, metodo: Metodo): Promise<{ error?: string; numero?: number; monto?: number }> {
  const s = await sesionVenta()
  if (!s || !uuid.test(ventaId)) return SIN_SESION
  const { data: caja } = await crearClienteAdmin().from("cortes_caja").select("id").is("cerrada_en", null).limit(1).maybeSingle()
  const r = await cobrarDosis(s, ventaId, metodo, caja ? "mostrador_caja" : "en_persona")
  revalidatePath("/mostrador", "layout")
  return r.ok ? { numero: r.numero, monto: r.monto } : { error: r.error }
}

/** Cierra la caja con el efectivo contado. */
export async function cerrarCaja(cajaId: string, contado: number): Promise<{ error?: string; diferencia?: number }> {
  const s = await sesionVenta()
  if (!s || !uuid.test(cajaId)) return SIN_SESION
  if (!Number.isFinite(contado) || contado < 0) return { error: "Escribe el efectivo que contaste." }
  const admin = crearClienteAdmin()
  const { data: caja } = await admin.from("cortes_caja").select("id, fondo, abierta_en, cerrada_en").eq("id", cajaId).single()
  if (!caja || caja.cerrada_en) return { error: "Esta caja ya está cerrada." }
  const { data: efectivo } = await admin.from("pagos").select("monto").eq("lugar", "caja").eq("metodo", "efectivo").gte("creado_en", caja.abierta_en)
  const esperado = Number(caja.fondo) + (efectivo ?? []).reduce((x, p) => x + Number(p.monto), 0)
  const diferencia = Math.round((contado - esperado) * 100) / 100
  await admin.from("cortes_caja").update({ cerrada_en: new Date().toISOString(), efectivo_esperado: esperado, efectivo_contado: contado, diferencia }).eq("id", cajaId)
  await admin.from("bitacora").insert({
    persona_id: s.personaId,
    perfil: s.perfil,
    area: "mostrador",
    accion: `cerró la caja · debía haber $${esperado.toLocaleString("es-MX")} · contó $${contado.toLocaleString("es-MX")}${diferencia ? ` · diferencia $${diferencia.toLocaleString("es-MX")}` : " · sin diferencia"}`,
  })
  revalidatePath("/mostrador", "layout")
  return { diferencia }
}
