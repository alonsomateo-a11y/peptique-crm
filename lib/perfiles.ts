export const PERFILES = [
  "administrador",
  "admin_comercial",
  "mostrador",
  "distribuidor",
  "comisionista",
  "temporal",
] as const

export type Perfil = (typeof PERFILES)[number]

export const PERFIL_INFO: Record<
  Perfil,
  { nombre: string; donde: string; puede: string }
> = {
  administrador: {
    nombre: "Administrador",
    donde: "Escritorio",
    puede: "Todo el sistema",
  },
  admin_comercial: {
    nombre: "Admin comercial",
    donde: "Escritorio o celular",
    puede: "Vender, red comercial, ventas, recompras y vista del mostrador",
  },
  mostrador: {
    nombre: "Mostrador",
    donde: "App de celular",
    puede: "Caja o en persona, waiver, dosis y corte",
  },
  distribuidor: {
    nombre: "Distribuidor",
    donde: "App de celular",
    puede: "Vende y agrega comisionistas",
  },
  comisionista: {
    nombre: "Comisionista",
    donde: "App de celular",
    puede: "Solo vende",
  },
  temporal: {
    nombre: "Temporal",
    donde: "App de celular",
    puede: "Vende y cobra · vence a las 23:59",
  },
}

/** Perfiles que nunca ven costos, márgenes, proveedores, COA original ni protocolos. */
export const PERFILES_SIN_COSTOS: Perfil[] = [
  "admin_comercial",
  "mostrador",
  "distribuidor",
  "comisionista",
  "temporal",
]
