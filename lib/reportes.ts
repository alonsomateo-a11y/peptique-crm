import "server-only"

import { crearClienteAdmin } from "@/lib/supabase/admin"

/**
 * Cálculos de Reportes e Inicio. Una venta cuenta cuando no está cancelada ni esperando
 * el pago de la red. Los montos de venta incluyen IVA; utilidad y márgenes se calculan
 * sin IVA. El costo es el de cada lote vendido.
 */

const IVA = 0.16
const ZONA = "America/Monterrey"
const CANAL: Record<string, string> = { mostrador_caja: "Mostrador · caja", en_persona: "En persona", red: "Red comercial", pedido: "Pedidos" }

export const mesActual = () => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date()).slice(0, 7)
export const hoyActual = () => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date())
const inicio = (mes: string) => new Date(`${mes}-01T00:00:00-06:00`).toISOString()
export const mesMas = (mes: string, n: number) => {
  const [a, m] = mes.split("-").map(Number)
  const d = new Date(Date.UTC(a, m - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}
const diasDelMes = (mes: string) => {
  const [a, m] = mes.split("-").map(Number)
  return new Date(Date.UTC(a, m, 0)).getUTCDate()
}
const diaMty = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date(iso))

type VentaBd = {
  id: string
  canal: string
  total: number
  creado_en: string
  vendedor_id: string
  personas: { nombre: string } | null
  venta_partidas: { producto_id: string; cantidad: number; precio_unitario: number; lotes: { costo_pieza_mxn: number } | null; productos: { nombre: string; presentacion: string } | null }[]
  comisiones: { monto: number }[]
}

async function ventasEntre(desde: string, hasta: string) {
  const { data, error } = await crearClienteAdmin()
    .from("ventas")
    .select("id, canal, total, creado_en, vendedor_id, personas:vendedor_id(nombre), venta_partidas(producto_id, cantidad, precio_unitario, lotes(costo_pieza_mxn), productos(nombre, presentacion)), comisiones(monto)")
    .gte("creado_en", desde)
    .lt("creado_en", hasta)
    .not("estado", "in", "(cancelada,esperando_pago)")
  if (error) throw error
  return (data ?? []) as unknown as VentaBd[]
}

/** Plan del mes: el capturado o, si no hay, el mes anterior + 5%. */
async function planDe(mes: string, ventasMesAnterior: number) {
  const { data } = await crearClienteAdmin().from("plan_mensual").select("meta, crecimiento").eq("mes", `${mes}-01`).maybeSingle()
  if (data) return { meta: Number(data.meta), sugerido: false }
  return { meta: ventasMesAnterior ? Math.round(ventasMesAnterior * 1.05) : 0, sugerido: true }
}

export type ResumenMes = Awaited<ReturnType<typeof resumenMes>>

export async function resumenMes(mes: string) {
  const admin = crearClienteAdmin()
  const [ventas, anteriores, gastos, planProductos] = await Promise.all([
    ventasEntre(inicio(mes), inicio(mesMas(mes, 1))),
    ventasEntre(inicio(mesMas(mes, -1)), inicio(mes)),
    admin.from("gastos_fijos").select("id, concepto, monto").eq("mes", `${mes}-01`).order("concepto"),
    admin.from("plan_producto").select("producto_id, meta_piezas, productos(nombre, presentacion)").eq("mes", `${mes}-01`),
  ])

  const ingreso = ventas.reduce((s, v) => s + Number(v.total), 0)
  const ingresoAnterior = anteriores.reduce((s, v) => s + Number(v.total), 0)
  const sinIva = ingreso / (1 + IVA)
  const partidas = ventas.flatMap((v) => v.venta_partidas)
  const costo = partidas.reduce((s, p) => s + p.cantidad * Number(p.lotes?.costo_pieza_mxn ?? 0), 0)
  const comisiones = ventas.flatMap((v) => v.comisiones).reduce((s, c) => s + Number(c.monto), 0)
  const fijos = (gastos.data ?? []).reduce((s, g) => s + Number(g.monto), 0)
  const utilidad = sinIva - costo - comisiones - fijos
  const plan = await planDe(mes, ingresoAnterior)

  // Acumulado por día contra el plan repartido parejo en el mes.
  const dias = diasDelMes(mes)
  const porDia = new Map<string, number>()
  for (const v of ventas) porDia.set(diaMty(v.creado_en), (porDia.get(diaMty(v.creado_en)) ?? 0) + Number(v.total))
  const hoy = hoyActual()
  const ultimoDia = mes === hoy.slice(0, 7) ? Number(hoy.slice(8)) : dias
  let acumulado = 0
  const diario = Array.from({ length: ultimoDia }, (_, i) => {
    const d = `${mes}-${String(i + 1).padStart(2, "0")}`
    acumulado += porDia.get(d) ?? 0
    return { date: new Date(`${d}T12:00:00-06:00`), ventas: acumulado, plan: Math.round((plan.meta * (i + 1)) / dias), delDia: porDia.get(d) ?? 0 }
  })

  const agrupar = (clave: (v: VentaBd) => string, etiqueta: (v: VentaBd) => string) => {
    const m = new Map<string, { nombre: string; monto: number; ventas: number }>()
    for (const v of ventas) {
      const x = m.get(clave(v)) ?? { nombre: etiqueta(v), monto: 0, ventas: 0 }
      x.monto += Number(v.total)
      x.ventas++
      m.set(clave(v), x)
    }
    return [...m].map(([k, x]) => ({ k, ...x })).sort((a, b) => b.monto - a.monto)
  }

  const productos = new Map<string, { id: string; nombre: string; piezas: number; ingreso: number; costo: number }>()
  for (const p of partidas) {
    const x = productos.get(p.producto_id) ?? { id: p.producto_id, nombre: p.productos ? `${p.productos.nombre} ${p.productos.presentacion}` : "—", piezas: 0, ingreso: 0, costo: 0 }
    x.piezas += p.cantidad
    x.ingreso += (p.cantidad * Number(p.precio_unitario)) / (1 + IVA)
    x.costo += p.cantidad * Number(p.lotes?.costo_pieza_mxn ?? 0)
    productos.set(p.producto_id, x)
  }

  type PlanProd = { producto_id: string; meta_piezas: number | null; productos: { nombre: string; presentacion: string } | null }
  return {
    mes,
    ingreso,
    ingresoAnterior,
    ventas: ventas.length,
    sinIva,
    costo,
    comisiones,
    fijos,
    gastos: (gastos.data ?? []).map((g) => ({ id: g.id, concepto: g.concepto, monto: Number(g.monto) })),
    utilidad,
    margenBruto: sinIva ? (sinIva - costo) / sinIva : null,
    plan,
    diario,
    porCanal: agrupar((v) => v.canal, (v) => CANAL[v.canal] ?? v.canal).map(({ k, nombre, monto, ventas: n }) => ({ clave: k, canal: nombre, monto, ventas: n })),
    porPersona: agrupar((v) => v.vendedor_id, (v) => v.personas?.nombre ?? "—").map(({ k, nombre, monto, ventas: n }) => ({ id: k, persona: nombre, monto, ventas: n })),
    porProducto: [...productos.values()]
      .map((p) => ({ ...p, margen: p.ingreso ? (p.ingreso - p.costo) / p.ingreso : null }))
      .sort((a, b) => b.ingreso - a.ingreso),
    planProductos: ((planProductos.data ?? []) as unknown as PlanProd[])
      .filter((p) => p.meta_piezas)
      .map((p) => ({ productoId: p.producto_id, nombre: p.productos ? `${p.productos.nombre} ${p.productos.presentacion}` : "—", meta: p.meta_piezas!, vendidas: productos.get(p.producto_id)?.piezas ?? 0 })),
  }
}

/** Ventas por mes contra su plan, para los últimos n meses. */
export async function historico(mes: string, n = 6) {
  const meses = Array.from({ length: n }, (_, i) => mesMas(mes, i - n + 1))
  const ventas = await ventasEntre(inicio(meses[0]), inicio(mesMas(mes, 1)))
  const { data: planes } = await crearClienteAdmin().from("plan_mensual").select("mes, meta").gte("mes", `${meses[0]}-01`).lte("mes", `${mes}-01`)
  const totales = new Map<string, number>()
  for (const v of ventas) {
    const m = diaMty(v.creado_en).slice(0, 7)
    totales.set(m, (totales.get(m) ?? 0) + Number(v.total))
  }
  return meses.map((m, i) => {
    const capturado = planes?.find((p) => p.mes.slice(0, 7) === m)
    const anterior = i > 0 ? (totales.get(meses[i - 1]) ?? 0) : 0
    return { mes: m, ventas: totales.get(m) ?? 0, plan: capturado ? Number(capturado.meta) : anterior ? Math.round(anterior * 1.05) : null }
  })
}
