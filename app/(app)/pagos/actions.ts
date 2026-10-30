"use server"

import { revalidatePath } from "next/cache"

import { obtenerSesion } from "@/lib/sesion"
import { cambiarEstadoPago } from "@/lib/ventas"

export async function cambiarPago(pagoId: string, accion: "conciliar" | "recibir"): Promise<{ error?: string }> {
  const s = await obtenerSesion()
  if (s.perfil !== "administrador" || s.personaId === "demo" || !/^[0-9a-f-]{36}$/.test(pagoId)) return { error: "Solo el administrador." }
  const r = await cambiarEstadoPago(s, pagoId, accion)
  revalidatePath("/pagos")
  revalidatePath("/ventas")
  return r.ok ? {} : { error: r.error }
}
