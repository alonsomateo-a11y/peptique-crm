import "server-only"

import { hoyActual } from "@/lib/reportes"
import { crearClienteAdmin } from "@/lib/supabase/admin"
import { liberarApartadosVencidos } from "@/lib/ventas"

export type Alerta = { tipo: "crit" | "warn"; titulo: string; detalle: string; accion: string; href: string }

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios.replace("#", String(n)))

/** Alertas del día para Inicio, de la más urgente a la menos. */
export async function alertasDelDia(): Promise<Alerta[]> {
  await liberarApartadosVencidos()
  const admin = crearClienteAdmin()
  const hoy = hoyActual()
  const en6h = new Date(Date.now() + 6 * 3_600_000).toISOString()
  const [sinRecompra, porAprobar, productos, lotes, existencias, devoluciones, porVencer, porEntregar] = await Promise.all([
    admin.from("avisos_recompra").select("id", { count: "exact", head: true }).or(`estado.eq.sin_recompra,and(estado.in.(por_avisar,contactado),se_le_acaba.lt.${hoy})`),
    admin.from("personas").select("nombre, creado_por").eq("estado", "por_aprobar"),
    admin.from("productos").select("id, nombre, presentacion").eq("visible", true),
    admin.from("lotes").select("id, producto_id"),
    admin.from("existencias").select("lote_id, bolsa, piezas").eq("bolsa", "general"),
    admin.from("pagos").select("monto").eq("estado", "devolucion"),
    admin.from("ventas").select("folio").eq("canal", "red").eq("estado", "esperando_pago").lt("apartado_vence_en", en6h),
    admin.from("pagos").select("monto, personas:cobro_persona_id(nombre)").eq("estado", "por_entregar"),
  ])

  const productoDeLote = new Map((lotes.data ?? []).map((l) => [l.id, l.producto_id]))
  const stock = new Map<string, number>()
  for (const e of existencias.data ?? []) {
    const p = productoDeLote.get(e.lote_id)
    if (p) stock.set(p, (stock.get(p) ?? 0) + e.piezas)
  }
  const bajos = (productos.data ?? []).filter((p) => (stock.get(p.id) ?? 0) <= 3)
  const agotados = bajos.filter((p) => !stock.get(p.id))

  const a: Alerta[] = []
  if (sinRecompra.count) a.push({ tipo: "crit", titulo: plural(sinRecompra.count, "1 cliente sin recompra", "# clientes sin recompra"), detalle: "Se les acabó el producto y no regresaron", accion: "Ver en Recompras", href: "/recompras" })
  if (porVencer.data?.length) a.push({ tipo: "crit", titulo: plural(porVencer.data.length, "1 apartado de la red por liberarse", "# apartados de la red por liberarse"), detalle: `Sin pago reflejado: ${porVencer.data.map((v) => v.folio).join(", ")}`, accion: "Ver red en camino", href: "/pagos?pestana=red" })
  if (porAprobar.data?.length) a.push({ tipo: "warn", titulo: plural(porAprobar.data.length, "1 alta por aprobar", "# altas por aprobar"), detalle: porAprobar.data.map((p) => p.nombre).join(", "), accion: "Revisar", href: "/red" })
  if (bajos.length)
    a.push({
      tipo: agotados.length ? "crit" : "warn",
      titulo: agotados.length ? plural(agotados.length, "1 producto visible agotado", "# productos visibles agotados") : plural(bajos.length, "1 producto con stock bajo", "# productos con stock bajo"),
      detalle: bajos.slice(0, 4).map((p) => `${p.nombre} ${p.presentacion}`).join(", ") + (bajos.length > 4 ? "…" : ""),
      accion: "Ver inventario",
      href: "/inventario",
    })
  if (devoluciones.data?.length) a.push({ tipo: "warn", titulo: plural(devoluciones.data.length, "1 devolución pendiente", "# devoluciones pendientes"), detalle: "Pagos de ventas canceladas", accion: "Ver en Pagos", href: "/pagos" })
  if (porEntregar.data?.length) {
    const quienes = [...new Set(porEntregar.data.map((p) => (p.personas as unknown as { nombre: string } | null)?.nombre).filter(Boolean))]
    a.push({ tipo: "warn", titulo: "Efectivo por entregar", detalle: quienes.join(", "), accion: "Ver en Pagos", href: "/pagos" })
  }
  return a
}

/** Caja abierta y ventas de hoy. */
export async function hoyEnCaja() {
  const admin = crearClienteAdmin()
  const desde = new Date(`${hoyActual()}T00:00:00-06:00`)
  const hasta = new Date(desde.getTime() + 86_400_000).toISOString()
  const [caja, ventas] = await Promise.all([
    admin.from("cortes_caja").select("abierta_en, personas:abierta_por(nombre)").is("cerrada_en", null).limit(1).maybeSingle(),
    admin.from("ventas").select("total").gte("creado_en", desde.toISOString()).lt("creado_en", hasta).not("estado", "in", "(cancelada,esperando_pago)"),
  ])
  return {
    caja: caja.data ? { por: (caja.data.personas as unknown as { nombre: string } | null)?.nombre ?? "" } : null,
    ventasHoy: (ventas.data ?? []).reduce((s, v) => s + Number(v.total), 0),
    numHoy: ventas.data?.length ?? 0,
  }
}

/** Recompra del mes: de los avisos que vencieron este mes, cuántos recompraron. */
export async function recompraDelMes() {
  const mes = hoyActual().slice(0, 7)
  const { data } = await crearClienteAdmin().from("avisos_recompra").select("estado").gte("se_le_acaba", `${mes}-01`).lte("se_le_acaba", hoyActual()).in("estado", ["recompro", "sin_recompra"])
  const total = data?.length ?? 0
  const recompraron = (data ?? []).filter((a) => a.estado === "recompro").length
  return { tasa: total ? recompraron / total : null, recompraron }
}

/** Números del menú lateral: altas por aprobar y recompras que piden atención. */
export async function pendientesMenu(): Promise<Record<string, number>> {
  const admin = crearClienteAdmin()
  const limite = new Date(Date.now() + 2 * 86_400_000)
  const hasta = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey" }).format(limite)
  const [altas, recompras] = await Promise.all([
    admin.from("personas").select("id", { count: "exact", head: true }).eq("estado", "por_aprobar"),
    admin.from("avisos_recompra").select("id", { count: "exact", head: true }).or(`estado.eq.sin_recompra,and(estado.eq.por_avisar,se_le_acaba.lte.${hasta})`),
  ])
  return { "/red": altas.count ?? 0, "/recompras": recompras.count ?? 0 }
}
