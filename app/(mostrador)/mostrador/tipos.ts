import type { TipoCliente } from "@/lib/ventas"

export type ProductoMostrador = {
  id: string
  nombre: string
  presentacion: string
  familia: string
  precios: Record<TipoCliente, number | null>
  general: number
  recurrentes: number
  pagosPorDosis: number
}

export type ClienteMostrador = { id: string; nombre: string; whatsapp: string; tipo: TipoCliente; waiver: boolean; planDosis: boolean }

export type Caja = { id: string; fondo: number; abiertaPor: string; abiertaEn: string } | null
