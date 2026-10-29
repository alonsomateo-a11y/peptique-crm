import type { Perfil } from "@/lib/perfiles"

export type PersonaFila = {
  id: string
  nombre: string
  whatsapp: string
  perfil: Perfil
  estado: "activo" | "por_aprobar" | "baja"
  zona: string | null
  distribuidor_id: string | null
  vence_en: string | null
  vencido: boolean
  bloqueado: boolean
  tienePin: boolean
  tieneAcceso: boolean
  esYo: boolean
}

export type Resultado = { ok?: boolean; error?: string; errores?: Record<string, string> } | null
