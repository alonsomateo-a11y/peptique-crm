export const TIPOS = [
  { valor: "paciente", texto: "Paciente" },
  { valor: "medico", texto: "Médico" },
  { valor: "distribuidor", texto: "Distribuidor" },
] as const

export type TipoCliente = (typeof TIPOS)[number]["valor"]

export const NOMBRE_TIPO: Record<TipoCliente, string> = { paciente: "Paciente", medico: "Médico", distribuidor: "Distribuidor" }

export const ORIGENES = ["QR del mostrador", "Instagram", "Facebook", "Google", "Recomendación", "Médico", "Red comercial", "Otro"] as const

export const ETIQUETAS_SUGERIDAS = ["VIP", "Recompra puntual", "Sin seguimiento", "Pidió descuento"] as const

export type ClienteFila = {
  id: string
  nombre: string
  whatsapp: string
  correo: string | null
  tipo: TipoCliente
  origen: string | null
  referido_por: string | null
  vendedor_id: string | null
  vendedor: string | null
  etiquetas: string[]
  acepta_whatsapp: boolean
  waiver: boolean
  creado_en: string
  compras: number
  total: number
  ultimaCompra: string | null
}

export type Resultado = { ok?: boolean; id?: string; error?: string; errores?: Record<string, string> } | null

/** Iniciales sin el título (Dr., Dra.). */
export const iniciales = (n: string) =>
  n
    .replace(/^(dr|dra)\.?\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")
