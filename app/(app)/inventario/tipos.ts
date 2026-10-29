export type Bolsas = { general: number; recurrentes: number; transito: number }

export type LoteFila = {
  id: string
  codigo: string
  producto_id: string
  producto: string
  familia: string
  lote_origen: string | null
  llegada: string
  recibidas: number
  bolsas: Bolsas
  existencia: number
  ultimaVenta: string | null
  costo: number
  margen: number | null
  coa: "falta" | "por_aprobar" | "listo"
}

export type ProductoInventario = {
  id: string
  nombre: string
  familia: string
  visible: boolean
  bolsas: Bolsas
  existencia: number
  lotes: number
  apartadoSugerido: number
}

export type Resultado = { ok?: boolean; codigo?: string; error?: string; errores?: Record<string, string> } | null

export const NOMBRE_COA: Record<LoteFila["coa"], string> = { falta: "Falta COA", por_aprobar: "COA por aprobar", listo: "COA listo" }
