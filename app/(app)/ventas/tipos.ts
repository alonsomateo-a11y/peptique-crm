import type { TipoEstado } from "@/components/app/estado"

export type EstadoVenta = "esperando_pago" | "por_cobrar" | "pagada" | "entregada" | "cancelada"
export type CanalVenta = "mostrador_caja" | "en_persona" | "red" | "pedido"

export const NOMBRE_ESTADO: Record<EstadoVenta, string> = {
  esperando_pago: "Esperando pago",
  por_cobrar: "Por cobrar",
  pagada: "Pagada · por entregar",
  entregada: "Entregada",
  cancelada: "Cancelada",
}

export const NOMBRE_CANAL: Record<CanalVenta, string> = { mostrador_caja: "Caja", en_persona: "En persona", red: "Red", pedido: "Pedido" }

export type VentaFila = {
  id: string
  folio: string
  creado_en: string
  canal: CanalVenta
  estado: EstadoVenta
  porDosis: boolean
  total: number
  pagado: number
  saldo: number
  clienteId: string
  cliente: string
  vendedorId: string
  vendedor: string
  productos: string
  etiquetas: string[]
}

export type Resultado = { ok?: boolean; error?: string; folio?: string } | null

export const TIPO_ESTADO: Record<EstadoVenta, TipoEstado> = { esperando_pago: "warn", por_cobrar: "crit", pagada: "warn", entregada: "ok", cancelada: "neutro" }

export const ligaVenta = (folio: string) => `/ventas/${encodeURIComponent(folio)}`
