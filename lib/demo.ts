/**
 * Datos SIMULADOS para construir las pantallas antes de conectar Supabase.
 * No son precios ni costos reales de Peptique.
 */

const diarias = [3.1, 4.6, 2.2, 5.8, 4.9, 1.2, 0.8, 6.4, 3.9, 4.4, 5.1, 7.2, 1.0, 0.6, 4.8, 5.6, 3.7, 6.9, 5.2, 1.4, 0.9, 5.9, 4.1, 6.6, 5.4, 4.8, 1.1, 4.6].map(
  (v) => Math.round(v * 1260),
)

export const PLAN_MES = 160_000

export const ventasMes = (() => {
  let acumulado = 0
  return diarias.map((v, i) => {
    acumulado += v
    return {
      date: new Date(2026, 9, i + 1),
      ventas: acumulado,
      plan: Math.round((PLAN_MES * (i + 1)) / 31),
    }
  })
})()

export const ventasDiarias = diarias

export const alertas = [
  { tipo: "crit" as const, titulo: "6 clientes sin recompra", detalle: "Se les acabó el producto y no regresaron", accion: "Ver en Recompras", href: "/recompras" },
  { tipo: "warn" as const, titulo: "1 alta de comisionista por aprobar", detalle: "Ricardo Salinas agregó a Luis Cantú", accion: "Revisar", href: "/red" },
  { tipo: "warn" as const, titulo: "4 productos con stock bajo", detalle: "Ya contando lo apartado para recurrentes", accion: "Ver inventario", href: "/inventario" },
]

export const ventasPorCanal = [
  { canal: "Mostrador", monto: 71_400 },
  { canal: "Red comercial", monto: 28_900 },
  { canal: "Pedidos de médico", monto: 13_200 },
  { canal: "En línea", monto: 3_900 },
]
