import "server-only"

import type { Sesion } from "@/lib/sesion"
import { crearClienteAdmin } from "@/lib/supabase/admin"

/**
 * Motor de ventas del mostrador y del admin comercial.
 *
 * Usa el cliente con llave secreta porque los perfiles de venta no pueden tocar lotes,
 * movimientos ni pagos por RLS: por eso aquí se valida todo (sesión, waiver, precio,
 * existencias) antes de escribir. Si algo falla a medio camino se deshace lo escrito.
 */

export type Canal = "mostrador_caja" | "en_persona"
export type Metodo = "efectivo" | "tarjeta" | "transferencia"
export type TipoCliente = "paciente" | "medico" | "distribuidor"

export type ItemVenta = { productoId: string; cantidad: number }

export type DatosVenta = {
  vendedor: Sesion
  canal: Canal
  clienteId: string
  items: ItemVenta[]
  forma: "completo" | "por_dosis"
  metodo: Metodo
  /** Efectivo que entrega el cliente (para calcular el cambio). */
  recibido?: number | null
  referencia?: string | null
}

export type VentaRegistrada = {
  ventaId: string
  folio: string
  total: number
  cobrado: number
  cambio: number
  dosis: { numero: number; de: number; monto: number } | null
  cliente: { nombre: string; whatsapp: string }
  productos: { nombre: string; lote: string; etapa: number; tieneProtocolo: boolean }[]
}

const ZONA = "America/Monterrey"
export const hoyMty = () => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date())

export const precioPara = (tipo: TipoCliente, p: { precio_publico: number | null; precio_medico: number | null; precio_distribuidor: number | null }) => {
  const v = tipo === "medico" ? (p.precio_medico ?? p.precio_publico) : tipo === "distribuidor" ? (p.precio_distribuidor ?? p.precio_publico) : p.precio_publico
  return v === null ? null : Number(v)
}

/** Etapa del protocolo que toca a este cliente por producto: compras previas + 1 (máximo 3). */
export async function etapasDelCliente(clienteId: string) {
  const admin = crearClienteAdmin()
  const { data } = await admin.from("venta_partidas").select("producto_id, venta_id, ventas!inner(cliente_id, estado)").eq("ventas.cliente_id", clienteId).neq("ventas.estado", "cancelada")
  const ventasPorProducto = new Map<string, Set<string>>()
  for (const p of data ?? []) {
    const s = ventasPorProducto.get(p.producto_id) ?? new Set()
    s.add(p.venta_id)
    ventasPorProducto.set(p.producto_id, s)
  }
  return new Map([...ventasPorProducto].map(([id, s]) => [id, Math.min(s.size + 1, 3)]))
}

async function siguienteFolio(admin: ReturnType<typeof crearClienteAdmin>, prefijo: string) {
  const { data } = await admin.from("ventas").select("folio").like("folio", `${prefijo}-%`).order("folio", { ascending: false }).limit(1)
  const ultimo = Number(data?.[0]?.folio.split("-")[1] ?? 0)
  return `${prefijo}-${String(ultimo + 1).padStart(4, "0")}`
}

export async function registrarVenta(d: DatosVenta): Promise<{ ok: true; venta: VentaRegistrada } | { ok: false; error: string }> {
  if (d.vendedor.personaId === "demo") return { ok: false, error: "Entra con tu PIN para vender." }
  const items = d.items.filter((i) => i.cantidad > 0)
  if (!items.length) return { ok: false, error: "Agrega al menos un producto." }
  if (items.some((i) => !Number.isInteger(i.cantidad) || i.cantidad > 50)) return { ok: false, error: "Cantidad no válida." }
  const piezas = items.reduce((s, i) => s + i.cantidad, 0)
  if (d.forma === "por_dosis" && piezas !== 1) return { ok: false, error: "El pago por dosis es para una sola pieza." }

  const admin = crearClienteAdmin()
  const { data: cliente } = await admin.from("clientes").select("id, nombre, whatsapp, tipo, waiver_firmado_en").eq("id", d.clienteId).maybeSingle()
  if (!cliente) return { ok: false, error: "Cliente no encontrado." }
  if (!cliente.waiver_firmado_en) return { ok: false, error: "El cliente debe firmar el waiver antes de comprar." }

  const ids = [...new Set(items.map((i) => i.productoId))]
  const [{ data: productos }, { data: lotes }, { data: protocolos }, etapas] = await Promise.all([
    admin.from("productos").select("id, nombre, presentacion, visible, precio_publico, precio_medico, precio_distribuidor, pagos_por_dosis").in("id", ids),
    admin.from("lotes").select("id, codigo, producto_id, llegada").in("producto_id", ids).order("llegada").order("codigo"),
    admin.from("protocolos").select("producto_id, etapa, duracion_dias, pdf_path").in("producto_id", ids),
    etapasDelCliente(d.clienteId),
  ])
  const loteIds = (lotes ?? []).map((l) => l.id)
  const { data: existencias } = loteIds.length ? await admin.from("existencias").select("lote_id, bolsa, piezas").in("lote_id", loteIds) : { data: [] }
  const quedan = new Map((existencias ?? []).map((e) => [`${e.lote_id}|${e.bolsa}`, e.piezas]))

  type Partida = { producto_id: string; lote_id: string; cantidad: number; precio_unitario: number; etapa_protocolo: number; bolsa: "general" | "recurrentes" }
  const partidas: Partida[] = []
  const resumen: VentaRegistrada["productos"] = []
  let total = 0

  for (const item of items) {
    const p = productos?.find((x) => x.id === item.productoId)
    if (!p || !p.visible) return { ok: false, error: "Un producto ya no está disponible." }
    const precio = precioPara(cliente.tipo, p)
    if (!precio) return { ok: false, error: `${p.nombre} ${p.presentacion} no tiene precio.` }
    const etapa = etapas.get(p.id) ?? 1
    // Los recurrentes toman primero de su apartado; un cliente nuevo no toca el apartado.
    const bolsas: Partida["bolsa"][] = etapa > 1 ? ["recurrentes", "general"] : ["general"]
    let falta = item.cantidad
    for (const bolsa of bolsas) {
      for (const l of (lotes ?? []).filter((x) => x.producto_id === p.id)) {
        if (!falta) break
        const hay = quedan.get(`${l.id}|${bolsa}`) ?? 0
        const toma = Math.min(hay, falta)
        if (toma <= 0) continue
        quedan.set(`${l.id}|${bolsa}`, hay - toma)
        partidas.push({ producto_id: p.id, lote_id: l.id, cantidad: toma, precio_unitario: precio, etapa_protocolo: etapa, bolsa })
        falta -= toma
      }
    }
    if (falta > 0) return { ok: false, error: `Solo quedan ${item.cantidad - falta} piezas de ${p.nombre} ${p.presentacion}.` }
    total += precio * item.cantidad
    const primerLote = partidas.find((x) => x.producto_id === p.id)!.lote_id
    resumen.push({
      nombre: `${p.nombre} ${p.presentacion}`,
      lote: lotes!.find((l) => l.id === primerLote)!.codigo,
      etapa,
      tieneProtocolo: !!protocolos?.some((x) => x.producto_id === p.id && x.etapa === etapa && x.pdf_path),
    })
  }

  const pagosPorDosis = d.forma === "por_dosis" ? (productos?.find((x) => x.id === items[0].productoId)?.pagos_por_dosis ?? 4) : 1
  const cobrado = d.forma === "por_dosis" ? Math.ceil(total / pagosPorDosis) : total
  if (d.metodo === "efectivo" && d.recibido != null && d.recibido < cobrado) return { ok: false, error: "El efectivo recibido no alcanza." }
  const cambio = d.metodo === "efectivo" && d.recibido != null ? Math.round((d.recibido - cobrado) * 100) / 100 : 0

  // Venta (reintenta si dos ventas toman el mismo folio).
  let venta: { id: string; folio: string } | null = null
  for (let i = 0; i < 3 && !venta; i++) {
    const folio = await siguienteFolio(admin, "M")
    const { data, error } = await admin
      .from("ventas")
      .insert({
        folio,
        canal: d.canal,
        cliente_id: cliente.id,
        vendedor_id: d.vendedor.personaId,
        estado: d.forma === "por_dosis" ? "por_cobrar" : "entregada",
        forma_pago: d.forma,
        total,
        referencia_pago: d.referencia || null,
      })
      .select("id, folio")
      .single()
    if (data) venta = data
    else if (error?.code !== "23505") return { ok: false, error: "No se pudo registrar la venta." }
  }
  if (!venta) return { ok: false, error: "No se pudo asignar el folio. Intenta de nuevo." }

  const deshacer = async () => {
    await admin.from("pagos").delete().eq("venta_id", venta!.id)
    await admin.from("movimientos_inventario").delete().eq("venta_id", venta!.id)
    await admin.from("ventas").delete().eq("id", venta!.id)
  }

  const r1 = await admin.from("venta_partidas").insert(partidas.map(({ bolsa: _b, ...x }) => ({ ...x, venta_id: venta!.id })))
  const r2 = await admin.from("movimientos_inventario").insert(
    partidas.map((x) => ({ lote_id: x.lote_id, tipo: "venta", bolsa: x.bolsa, cantidad: -x.cantidad, venta_id: venta!.id, persona_id: d.vendedor.personaId })),
  )
  const efectivoEnPersona = d.metodo === "efectivo" && d.canal === "en_persona"
  const r3 = await admin.from("pagos").insert({
    venta_id: venta.id,
    monto: cobrado,
    metodo: d.metodo,
    lugar: d.canal === "mostrador_caja" ? "caja" : "en_persona",
    cobro_persona_id: d.vendedor.personaId,
    estado: d.metodo === "efectivo" ? (efectivoEnPersona ? "por_entregar" : "en_caja") : "por_conciliar",
    referencia: d.referencia || null,
    numero_dosis: d.forma === "por_dosis" ? 1 : null,
  })
  if (r1.error || r2.error || r3.error) {
    await deshacer()
    return { ok: false, error: "No se pudo registrar la venta. No se guardó nada." }
  }

  // Avisos de recompra: el anterior se da por recomprado y se crea el de la siguiente etapa.
  const hoy = hoyMty()
  for (const id of ids) {
    await admin.from("avisos_recompra").update({ estado: "recompro" }).eq("cliente_id", cliente.id).eq("producto_id", id).in("estado", ["por_avisar", "contactado"])
    const etapa = etapas.get(id) ?? 1
    const prot = protocolos?.find((x) => x.producto_id === id && x.etapa === etapa)
    if (prot?.duracion_dias) {
      const acaba = new Date(`${hoy}T12:00:00-06:00`)
      acaba.setUTCDate(acaba.getUTCDate() + prot.duracion_dias)
      await admin.from("avisos_recompra").insert({
        cliente_id: cliente.id,
        producto_id: id,
        venta_id: venta.id,
        se_le_acaba: acaba.toISOString().slice(0, 10),
        siguiente_etapa: Math.min(etapa + 1, 3),
      })
    }
  }

  const METODO = { efectivo: "efectivo", tarjeta: "tarjeta", transferencia: "transferencia" }
  await admin.from("bitacora").insert({
    persona_id: d.vendedor.personaId,
    perfil: d.vendedor.perfil,
    area: d.canal === "mostrador_caja" ? "mostrador" : "ventas",
    accion: `vendió ${venta.folio} ${d.canal === "mostrador_caja" ? "en caja" : "en persona"} a ${cliente.nombre} · ${resumen.map((r) => r.nombre).join(", ")} · ${METODO[d.metodo]}${d.forma === "por_dosis" ? ` (dosis 1 de ${pagosPorDosis})` : ""}`,
    entidad: "venta",
    entidad_id: venta.id,
    producto_id: ids[0],
  })

  return {
    ok: true,
    venta: {
      ventaId: venta.id,
      folio: venta.folio,
      total,
      cobrado,
      cambio,
      dosis: d.forma === "por_dosis" ? { numero: 1, de: pagosPorDosis, monto: cobrado } : null,
      cliente: { nombre: cliente.nombre, whatsapp: cliente.whatsapp },
      productos: resumen,
    },
  }
}

/** Aplica una dosis ya pagada de un plan por dosis. */
export async function aplicarDosis(vendedor: Sesion, ventaId: string, numero: number) {
  if (vendedor.personaId === "demo") return { ok: false as const, error: "Entra con tu PIN." }
  const admin = crearClienteAdmin()
  const { data: pagos } = await admin.from("pagos").select("numero_dosis").eq("venta_id", ventaId).not("numero_dosis", "is", null)
  if (!(pagos ?? []).some((p) => p.numero_dosis === numero)) return { ok: false as const, error: "Esa dosis no está pagada." }
  const { error } = await admin.from("dosis_aplicadas").insert({ venta_id: ventaId, numero, aplicada_por: vendedor.personaId })
  if (error) return { ok: false as const, error: error.code === "23505" ? "Esa dosis ya se aplicó." : "No se pudo registrar la dosis." }
  const { data: v } = await admin.from("ventas").select("folio, clientes(nombre)").eq("id", ventaId).single()
  await admin.from("bitacora").insert({
    persona_id: vendedor.personaId,
    perfil: vendedor.perfil,
    area: "mostrador",
    accion: `aplicó la dosis ${numero} de ${v?.folio ?? "la venta"}${v?.clientes ? ` a ${(v.clientes as unknown as { nombre: string }).nombre}` : ""}`,
    entidad: "venta",
    entidad_id: ventaId,
  })
  return { ok: true as const }
}

/** Cobra la siguiente dosis de un plan. La última cuota ajusta el redondeo. */
export async function cobrarDosis(vendedor: Sesion, ventaId: string, metodo: Metodo, canal: Canal, referencia?: string | null) {
  if (vendedor.personaId === "demo") return { ok: false as const, error: "Entra con tu PIN." }
  const admin = crearClienteAdmin()
  const { data: v } = await admin
    .from("ventas")
    .select("id, folio, total, estado, forma_pago, clientes(nombre), venta_partidas(productos(pagos_por_dosis)), pagos(monto, numero_dosis, estado)")
    .eq("id", ventaId)
    .single()
  if (!v || v.forma_pago !== "por_dosis" || v.estado === "cancelada") return { ok: false as const, error: "Este plan no está activo." }
  const partidas = v.venta_partidas as unknown as { productos: { pagos_por_dosis: number } | null }[]
  const de = partidas[0]?.productos?.pagos_por_dosis ?? 4
  const pagos = (v.pagos as { monto: number; numero_dosis: number | null; estado: string }[]).filter((p) => p.estado !== "devolucion")
  const pagadas = pagos.filter((p) => p.numero_dosis).length
  if (pagadas >= de) return { ok: false as const, error: "Ya están pagadas todas las dosis." }
  const numero = pagadas + 1
  const cuota = Math.ceil(Number(v.total) / de)
  const monto = numero === de ? Number(v.total) - pagos.reduce((s, p) => s + Number(p.monto), 0) : cuota

  const { error } = await admin.from("pagos").insert({
    venta_id: v.id,
    monto,
    metodo,
    lugar: canal === "mostrador_caja" ? "caja" : "en_persona",
    cobro_persona_id: vendedor.personaId,
    estado: metodo === "efectivo" ? (canal === "en_persona" ? "por_entregar" : "en_caja") : "por_conciliar",
    referencia: referencia || null,
    numero_dosis: numero,
  })
  if (error) return { ok: false as const, error: "No se pudo registrar el pago." }
  if (numero === de) await admin.from("ventas").update({ estado: "pagada" }).eq("id", v.id)
  await admin.from("bitacora").insert({
    persona_id: vendedor.personaId,
    perfil: vendedor.perfil,
    area: "mostrador",
    accion: `cobró ${monto.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 })} (dosis ${numero} de ${de}) de ${v.folio}${v.clientes ? ` a ${(v.clientes as unknown as { nombre: string }).nombre}` : ""} · ${metodo}`,
    entidad: "venta",
    entidad_id: v.id,
  })
  return { ok: true as const, numero, monto }
}
