"use server"

import { revalidatePath } from "next/cache"

import { obtenerSesion } from "@/lib/sesion"
import { aplicarDosis, cancelarVenta, cobrarDosis, marcarEntregada, registrarPago, registrarVenta, type Metodo } from "@/lib/ventas"

import type { Resultado } from "./tipos"

const uuid = /^[0-9a-f-]{36}$/
const METODOS: Metodo[] = ["efectivo", "tarjeta", "transferencia"]

async function soloAdmin() {
  const s = await obtenerSesion()
  return s.perfil === "administrador" && s.personaId !== "demo" ? s : null
}
const SOLO_ADMIN = { error: "Solo el administrador. Entra con tu PIN." }

function refrescar(folio?: string) {
  revalidatePath("/ventas")
  revalidatePath("/pagos")
  revalidatePath("/inventario")
  if (folio) revalidatePath(`/ventas/${folio}`)
}

export async function crearPedido(d: { clienteId: string; items: { productoId: string; cantidad: number }[]; nota: string }): Promise<Resultado> {
  const s = await soloAdmin()
  if (!s) return SOLO_ADMIN
  if (!uuid.test(d.clienteId)) return { error: "Elige el cliente." }
  const r = await registrarVenta({ vendedor: s, canal: "pedido", clienteId: d.clienteId, items: d.items, forma: "completo", metodo: "transferencia", nota: d.nota.trim().slice(0, 300) || null })
  if (!r.ok) return { error: r.error }
  refrescar()
  return { ok: true, folio: r.venta.folio }
}

export async function registrarPagoVenta(d: { ventaId: string; folio: string; monto: number; metodo: string; lugar: string; referencia: string; fecha: string }): Promise<Resultado> {
  const s = await soloAdmin()
  if (!s) return SOLO_ADMIN
  if (!uuid.test(d.ventaId) || !METODOS.includes(d.metodo as Metodo) || !["caja", "en_persona", "banco"].includes(d.lugar)) return { error: "Datos no válidos." }
  const r = await registrarPago(s, { ventaId: d.ventaId, monto: d.monto, metodo: d.metodo as Metodo, lugar: d.lugar as "caja" | "en_persona" | "banco", referencia: d.referencia.trim() || null, fecha: d.fecha })
  refrescar(d.folio)
  return r.ok ? { ok: true } : { error: r.error }
}

export async function entregarVenta(ventaId: string, folio: string): Promise<Resultado> {
  const s = await soloAdmin()
  if (!s || !uuid.test(ventaId)) return SOLO_ADMIN
  const r = await marcarEntregada(s, ventaId)
  refrescar(folio)
  return r.ok ? { ok: true } : { error: r.error }
}

export async function cancelarVentaAccion(ventaId: string, folio: string, motivo: string, nota: string): Promise<Resultado> {
  const s = await soloAdmin()
  if (!s || !uuid.test(ventaId)) return SOLO_ADMIN
  const r = await cancelarVenta(s, ventaId, motivo, nota)
  refrescar(folio)
  return r.ok ? { ok: true } : { error: r.error }
}

export async function dosisVenta(ventaId: string, folio: string, accion: "aplicar" | "cobrar", n: number, metodo: Metodo = "efectivo"): Promise<Resultado> {
  const s = await soloAdmin()
  if (!s || !uuid.test(ventaId)) return SOLO_ADMIN
  const r = accion === "aplicar" ? await aplicarDosis(s, ventaId, n) : await cobrarDosis(s, ventaId, metodo, "mostrador_caja")
  refrescar(folio)
  return r.ok ? { ok: true } : { error: r.error }
}
