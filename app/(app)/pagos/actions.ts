"use server"

import { revalidatePath } from "next/cache"

import { obtenerSesion } from "@/lib/sesion"
import { cambiarEstadoPago, entregarVentaRed, marcarPagoReflejado } from "@/lib/ventas"

export async function cambiarPago(pagoId: string, accion: "conciliar" | "recibir"): Promise<{ error?: string }> {
  const s = await obtenerSesion()
  if (s.perfil !== "administrador" || s.personaId === "demo" || !/^[0-9a-f-]{36}$/.test(pagoId)) return { error: "Solo el administrador." }
  const r = await cambiarEstadoPago(s, pagoId, accion)
  revalidatePath("/pagos")
  revalidatePath("/ventas")
  return r.ok ? {} : { error: r.error }
}

export async function reflejarPagoRed(ventaId: string, metodo: "transferencia" | "tarjeta", referencia: string): Promise<{ error?: string }> {
  const s = await obtenerSesion()
  if (s.perfil !== "administrador" || s.personaId === "demo" || !/^[0-9a-f-]{36}$/.test(ventaId)) return { error: "Solo el administrador." }
  const r = await marcarPagoReflejado(s, ventaId, metodo, referencia.trim() || null)
  revalidatePath("/pagos")
  revalidatePath("/ventas")
  revalidatePath("/red")
  return r.ok ? {} : { error: r.error }
}

export async function entregarRed(ventaId: string): Promise<{ error?: string }> {
  const s = await obtenerSesion()
  if (s.perfil !== "administrador" || s.personaId === "demo" || !/^[0-9a-f-]{36}$/.test(ventaId)) return { error: "Solo el administrador." }
  const r = await entregarVentaRed(s, ventaId)
  revalidatePath("/pagos")
  revalidatePath("/ventas")
  revalidatePath("/inventario")
  return r.ok ? {} : { error: r.error }
}
