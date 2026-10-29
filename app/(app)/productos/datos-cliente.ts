// Tipos y cálculos que comparten servidor y cliente.

/** Los precios incluyen IVA; el margen se calcula sobre el precio sin IVA. */
export const IVA = 0.16
export const ETAPAS = [
  { etapa: 1, nombre: "Etapa 1", detalle: "Primera compra" },
  { etapa: 2, nombre: "Etapa 2", detalle: "Recompra" },
  { etapa: 3, nombre: "Etapa 3", detalle: "Mantenimiento" },
] as const

export type ProtocoloFila = { etapa: number; piezas: number; duracion_dias: number | null; pdf_path: string | null }

export type LoteMargen = { id: string; codigo: string; llegada: string; piezas: number; costo: number; margen: number | null }

export type ProductoFila = {
  id: string
  nombre: string
  presentacion: string
  familia: string
  sku: string | null
  precio_publico: number | null
  precio_medico: number | null
  precio_distribuidor: number | null
  visible: boolean
  inyecciones_por_vial: number
  pagos_por_dosis: number
  piezas: number
  /** Lotes con piezas, del más viejo al más nuevo. El primero es el que está saliendo. */
  lotes: LoteMargen[]
  protocolos: ProtocoloFila[]
  ventaMensual: number
  recurrentes: number
  reposicion: number | null
}

export const margenDe = (precio: number | null, costo: number) => {
  if (!precio) return null
  const sinIva = precio / (1 + IVA)
  return Math.round(((sinIva - costo) / sinIva) * 100)
}

export type FilaImportada = {
  original: string
  nombre: string
  presentacion: string
  precio_publico: number | null
  precio_medico: number | null
  precio_distribuidor: number | null
}

export type CambioImportacion = FilaImportada & {
  /** nuevo · precio (cambia algún precio) · igual */
  tipo: "nuevo" | "precio" | "igual"
  id?: string
}
