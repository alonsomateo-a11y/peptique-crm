// Áreas de la bitácora; se comparten entre servidor y cliente.

export const AREAS = ["acceso", "mostrador", "ventas", "pagos", "red", "clientes", "recompras", "inventario", "productos", "equipo", "configuracion"] as const

export const NOMBRE_AREA: Record<(typeof AREAS)[number], string> = {
  acceso: "Acceso",
  mostrador: "Mostrador",
  ventas: "Ventas",
  pagos: "Pagos",
  red: "Red comercial",
  clientes: "Clientes",
  recompras: "Recompras",
  inventario: "Inventario",
  productos: "Productos",
  equipo: "Equipo",
  configuracion: "Configuración",
}
