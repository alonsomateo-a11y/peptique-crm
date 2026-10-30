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

/** pedido = médicos y distribuidores que pagan después (folio P-). red = distribuidores y comisionistas (folio R-). */
export type Canal = "mostrador_caja" | "en_persona" | "pedido" | "red"
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
  nota?: string | null
}

export type VentaRegistrada = {
  ventaId: string
  folio: string
  /** Red: referencia para la transferencia (R0032-RS) y cuándo se libera el apartado. */
  referencia?: string | null
  vence?: string | null
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

/** R-0032 + Ricardo Salinas → R0032-RS (la escribe el cliente en su transferencia). */
export const referenciaRed = (folio: string, vendedor: string) =>
  `${folio.replace("-", "")}-${vendedor
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("")}`

async function horasLiberarApartado(admin: ReturnType<typeof crearClienteAdmin>) {
  const { data } = await admin.from("configuracion").select("valor").eq("clave", "reglas").maybeSingle()
  return Number((data?.valor as { liberar_apartado_horas?: number } | undefined)?.liberar_apartado_horas) || 48
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
  // El waiver es del paciente; los pedidos de médicos y distribuidores no lo piden.
  if (!cliente.waiver_firmado_en && !(d.canal === "pedido" && cliente.tipo !== "paciente"))
    return { ok: false, error: "El cliente debe firmar el waiver antes de comprar." }
  if ((d.canal === "pedido" || d.canal === "red") && d.forma === "por_dosis") return { ok: false, error: "Esta venta se cobra completa." }
  if (d.canal === "red" && d.metodo === "efectivo") return { ok: false, error: "La red cobra por transferencia o terminal, sin efectivo." }

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
  const pedido = d.canal === "pedido"
  const red = d.canal === "red"
  // Pedidos y red no cobran al registrar: el pago llega después.
  const sinPago = pedido || red
  const cobrado = sinPago ? 0 : d.forma === "por_dosis" ? Math.ceil(total / pagosPorDosis) : total
  const horasApartado = red ? await horasLiberarApartado(admin) : 0
  if (d.metodo === "efectivo" && d.recibido != null && d.recibido < cobrado) return { ok: false, error: "El efectivo recibido no alcanza." }
  const cambio = d.metodo === "efectivo" && d.recibido != null ? Math.round((d.recibido - cobrado) * 100) / 100 : 0

  // Venta (reintenta si dos ventas toman el mismo folio).
  let venta: { id: string; folio: string } | null = null
  for (let i = 0; i < 3 && !venta; i++) {
    const folio = await siguienteFolio(admin, pedido ? "P" : red ? "R" : "M")
    const { data, error } = await admin
      .from("ventas")
      .insert({
        folio,
        canal: d.canal,
        cliente_id: cliente.id,
        vendedor_id: d.vendedor.personaId,
        estado: red ? "esperando_pago" : pedido || d.forma === "por_dosis" ? "por_cobrar" : "entregada",
        forma_pago: d.forma,
        total,
        referencia_pago: red ? referenciaRed(folio, d.vendedor.nombre) : d.referencia || null,
        apartado_vence_en: red ? new Date(Date.now() + horasApartado * 3_600_000).toISOString() : null,
        nota: d.nota || null,
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
  // La red aparta en tránsito: sale de su bolsa y entra a "transito" hasta que se entrega o se libera.
  const r2 = await admin.from("movimientos_inventario").insert(
    partidas.flatMap((x) => {
      const base = { lote_id: x.lote_id, venta_id: venta!.id, persona_id: d.vendedor.personaId }
      return red
        ? [
            { ...base, tipo: "apartado_transito", bolsa: x.bolsa, cantidad: -x.cantidad },
            { ...base, tipo: "apartado_transito", bolsa: "transito", cantidad: x.cantidad },
          ]
        : [{ ...base, tipo: "venta", bolsa: x.bolsa, cantidad: -x.cantidad }]
    }),
  )
  const efectivoEnPersona = d.metodo === "efectivo" && d.canal === "en_persona"
  const r3 = sinPago
    ? { error: null }
    : await admin.from("pagos").insert({
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
    await admin.from("avisos_recompra").update({ estado: "recompro" }).eq("cliente_id", cliente.id).eq("producto_id", id).in("estado", ["por_avisar", "contactado", "sin_recompra"])
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
    area: d.canal === "mostrador_caja" ? "mostrador" : red ? "red" : "ventas",
    accion: red
      ? `vendió ${venta.folio} por la red a ${cliente.nombre} · ${resumen.map((r) => r.nombre).join(", ")} · esperando pago (${d.metodo === "tarjeta" ? "terminal" : "transferencia"})`
      : pedido
      ? `creó el pedido ${venta.folio} para ${cliente.nombre} · ${resumen.map((r) => r.nombre).join(", ")} · por cobrar ${total.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 })}`
      : `vendió ${venta.folio} ${d.canal === "mostrador_caja" ? "en caja" : "en persona"} a ${cliente.nombre} · ${resumen.map((r) => r.nombre).join(", ")} · ${METODO[d.metodo]}${d.forma === "por_dosis" ? ` (dosis 1 de ${pagosPorDosis})` : ""}`,
    entidad: "venta",
    entidad_id: venta.id,
    producto_id: ids[0],
  })

  return {
    ok: true,
    venta: {
      ventaId: venta.id,
      folio: venta.folio,
      referencia: red ? referenciaRed(venta.folio, d.vendedor.nombre) : null,
      vence: red ? new Date(Date.now() + horasApartado * 3_600_000).toISOString() : null,
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

const moneda = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 })

/** Saldo de una venta: total menos pagos válidos (las devoluciones no cuentan). */
async function saldoDe(admin: ReturnType<typeof crearClienteAdmin>, ventaId: string) {
  const { data: v } = await admin.from("ventas").select("id, folio, total, estado, canal, forma_pago, clientes(nombre), pagos(monto, estado)").eq("id", ventaId).maybeSingle()
  if (!v) return null
  const pagado = (v.pagos as { monto: number; estado: string }[]).filter((p) => p.estado !== "devolucion").reduce((s, p) => s + Number(p.monto), 0)
  return { v, pagado, saldo: Math.round((Number(v.total) - pagado) * 100) / 100, cliente: (v.clientes as unknown as { nombre: string } | null)?.nombre ?? "" }
}

/** Pago registrado desde el escritorio (pedidos, saldos, transferencias que llegan después). */
export async function registrarPago(
  sesion: Sesion,
  p: { ventaId: string; monto: number; metodo: Metodo; lugar: "caja" | "en_persona" | "banco"; referencia?: string | null; fecha?: string | null },
) {
  const admin = crearClienteAdmin()
  const s = await saldoDe(admin, p.ventaId)
  if (!s || s.v.estado === "cancelada") return { ok: false as const, error: "La venta no existe o está cancelada." }
  if (s.v.forma_pago === "por_dosis") return { ok: false as const, error: "Los planes por dosis se cobran dosis por dosis." }
  if (!(p.monto > 0) || p.monto > s.saldo + 0.001) return { ok: false as const, error: `El monto debe ser entre $1 y el saldo (${moneda(s.saldo)}).` }

  const creado = p.fecha && /^\d{4}-\d{2}-\d{2}$/.test(p.fecha) && p.fecha !== hoyMty() ? new Date(`${p.fecha}T12:00:00-06:00`).toISOString() : undefined
  const { error } = await admin.from("pagos").insert({
    venta_id: p.ventaId,
    monto: p.monto,
    metodo: p.metodo,
    lugar: p.lugar,
    cobro_persona_id: sesion.personaId,
    estado: p.metodo === "efectivo" ? (p.lugar === "caja" ? "en_caja" : p.lugar === "en_persona" ? "por_entregar" : "conciliado") : p.lugar === "banco" ? "conciliado" : "por_conciliar",
    referencia: p.referencia || null,
    ...(creado ? { creado_en: creado } : {}),
  })
  if (error) return { ok: false as const, error: "No se pudo registrar el pago." }
  const saldo = Math.round((s.saldo - p.monto) * 100) / 100
  if (saldo <= 0 && s.v.estado !== "entregada") await admin.from("ventas").update({ estado: "pagada" }).eq("id", p.ventaId)
  await admin.from("bitacora").insert({
    persona_id: sesion.personaId,
    perfil: sesion.perfil,
    area: "pagos",
    accion: `registró un pago de ${moneda(p.monto)} de ${s.v.folio} (${s.cliente}) · ${p.metodo}${saldo > 0 ? ` · saldo ${moneda(saldo)}` : " · liquidada"}`,
    entidad: "venta",
    entidad_id: p.ventaId,
  })
  return { ok: true as const, saldo }
}

export async function marcarEntregada(sesion: Sesion, ventaId: string) {
  const admin = crearClienteAdmin()
  const s = await saldoDe(admin, ventaId)
  if (!s) return { ok: false as const, error: "Venta no encontrada." }
  if (s.v.estado === "cancelada" || s.v.estado === "entregada") return { ok: false as const, error: "La venta ya no se puede entregar." }
  if (s.saldo > 0 && s.v.forma_pago !== "por_dosis") return { ok: false as const, error: `Falta cobrar ${moneda(s.saldo)} antes de entregar.` }
  await admin.from("ventas").update({ estado: "entregada" }).eq("id", ventaId)
  await admin.from("bitacora").insert({ persona_id: sesion.personaId, perfil: sesion.perfil, area: "ventas", accion: `entregó ${s.v.folio} a ${s.cliente}`, entidad: "venta", entidad_id: ventaId })
  return { ok: true as const }
}

/**
 * Movimientos que dejan el inventario como antes de la venta: se suma lo neto por lote y bolsa
 * y se registra lo contrario (sirve para ventas de caja, pedidos y apartados de la red).
 */
async function revertirInventario(admin: ReturnType<typeof crearClienteAdmin>, ventaId: string, tipo: "cancelacion" | "liberacion", personaId: string | null, nota: string) {
  const { data } = await admin.from("movimientos_inventario").select("lote_id, bolsa, cantidad").eq("venta_id", ventaId)
  const neto = new Map<string, number>()
  for (const m of data ?? []) neto.set(`${m.lote_id}|${m.bolsa}`, (neto.get(`${m.lote_id}|${m.bolsa}`) ?? 0) + m.cantidad)
  return [...neto]
    .filter(([, n]) => n !== 0)
    .map(([k, n]) => {
      const [lote_id, bolsa] = k.split("|")
      return { lote_id, bolsa, tipo, cantidad: -n, venta_id: ventaId, persona_id: personaId, nota }
    })
}

/**
 * Cancela una venta: las piezas regresan a su lote y bolsa, se quitan sus avisos de recompra
 * pendientes y los pagos quedan como devolución pendiente.
 */
export async function cancelarVenta(sesion: Sesion, ventaId: string, motivo: string, nota?: string | null) {
  const admin = crearClienteAdmin()
  const s = await saldoDe(admin, ventaId)
  if (!s) return { ok: false as const, error: "Venta no encontrada." }
  if (s.v.estado === "cancelada") return { ok: false as const, error: "La venta ya estaba cancelada." }
  if (motivo.trim().length < 3) return { ok: false as const, error: "Indica el motivo." }

  const regresos = await revertirInventario(admin, ventaId, "cancelacion", sesion.personaId, motivo)
  if (regresos.length) {
    const { error } = await admin.from("movimientos_inventario").insert(regresos)
    if (error) return { ok: false as const, error: "No se pudo regresar el inventario. La venta sigue activa." }
  }
  await admin.from("ventas").update({ estado: "cancelada", motivo_cancelacion: [motivo.trim(), nota?.trim()].filter(Boolean).join(" · ") }).eq("id", ventaId)
  await admin.from("avisos_recompra").delete().eq("venta_id", ventaId).in("estado", ["por_avisar", "contactado"])
  await admin.from("pagos").update({ estado: "devolucion" }).eq("venta_id", ventaId)
  await admin.from("comisiones").delete().eq("venta_id", ventaId).is("pagada_en", null)
  await admin.from("bitacora").insert({
    persona_id: sesion.personaId,
    perfil: sesion.perfil,
    area: "ventas",
    accion: `canceló ${s.v.folio} (${s.cliente}) · ${motivo.trim()}${s.pagado ? ` · ${moneda(s.pagado)} queda como devolución pendiente` : ""}`,
    entidad: "venta",
    entidad_id: ventaId,
  })
  return { ok: true as const }
}

/** Conciliar (tarjeta/transferencia vista en el banco) o recibir efectivo por entregar. */
export async function cambiarEstadoPago(sesion: Sesion, pagoId: string, accion: "conciliar" | "recibir") {
  const admin = crearClienteAdmin()
  const { data: p } = await admin.from("pagos").select("id, estado, monto, metodo, venta_id, ventas(folio), personas:cobro_persona_id(nombre)").eq("id", pagoId).maybeSingle()
  if (!p) return { ok: false as const, error: "Pago no encontrado." }
  const esperado = accion === "conciliar" ? "por_conciliar" : "por_entregar"
  if (p.estado !== esperado) return { ok: false as const, error: "Ese pago ya cambió de estado." }
  await admin.from("pagos").update({ estado: accion === "conciliar" ? "conciliado" : "en_caja" }).eq("id", pagoId)
  const folio = (p.ventas as unknown as { folio: string } | null)?.folio ?? ""
  const quien = (p.personas as unknown as { nombre: string } | null)?.nombre ?? ""
  await admin.from("bitacora").insert({
    persona_id: sesion.personaId,
    perfil: sesion.perfil,
    area: "pagos",
    accion: accion === "conciliar" ? `concilió ${moneda(Number(p.monto))} de ${folio} (${p.metodo})` : `recibió ${moneda(Number(p.monto))} en efectivo de ${quien} (${folio})`,
    entidad: "venta",
    entidad_id: p.venta_id,
  })
  return { ok: true as const }
}

/* ───────────── Red comercial ───────────── */

const IVA = 0.16

/**
 * Pago de una venta de la red reflejado (transferencia con su referencia o cobro de terminal).
 * Genera las comisiones: 13% a quien vendió y, si es comisionista, 3% a su distribuidor,
 * sobre la venta sin IVA. Por ahora lo marca el administrador; después se conecta al banco.
 */
export async function marcarPagoReflejado(sesion: Sesion, ventaId: string, metodo: Metodo, referencia?: string | null) {
  const admin = crearClienteAdmin()
  const { data: v } = await admin
    .from("ventas")
    .select("id, folio, total, estado, canal, referencia_pago, vendedor_id, clientes(nombre), personas:vendedor_id(nombre, perfil, distribuidor_id)")
    .eq("id", ventaId)
    .maybeSingle()
  if (!v || v.canal !== "red") return { ok: false as const, error: "No es una venta de la red." }
  if (v.estado !== "esperando_pago") return { ok: false as const, error: "Esta venta ya no está esperando pago." }
  const vendedor = v.personas as unknown as { nombre: string; perfil: string; distribuidor_id: string | null } | null

  const { error } = await admin.from("pagos").insert({
    venta_id: v.id,
    monto: Number(v.total),
    metodo,
    lugar: "red",
    cobro_persona_id: v.vendedor_id,
    estado: "reflejado",
    referencia: referencia || v.referencia_pago,
  })
  if (error) return { ok: false as const, error: "No se pudo registrar el pago." }
  await admin.from("ventas").update({ estado: "pagada", apartado_vence_en: null }).eq("id", v.id)

  const { data: conf } = await admin.from("configuracion").select("valor").eq("clave", "comisiones").maybeSingle()
  const pct = (conf?.valor ?? { directa: 13, equipo: 3 }) as { directa: number; equipo: number }
  const base = Number(v.total) / (1 + IVA)
  const filas = [{ venta_id: v.id, persona_id: v.vendedor_id, tipo: "directa", porcentaje: pct.directa, monto: Math.round(base * pct.directa) / 100 }]
  if (vendedor?.perfil === "comisionista" && vendedor.distribuidor_id)
    filas.push({ venta_id: v.id, persona_id: vendedor.distribuidor_id, tipo: "equipo", porcentaje: pct.equipo, monto: Math.round(base * pct.equipo) / 100 })
  await admin.from("comisiones").insert(filas)

  await admin.from("bitacora").insert({
    persona_id: sesion.personaId,
    perfil: sesion.perfil,
    area: "red",
    accion: `marcó reflejado el pago de ${v.folio} (${moneda(Number(v.total))}, ${(v.clientes as unknown as { nombre: string } | null)?.nombre ?? ""}) · comisión de ${vendedor?.nombre ?? "vendedor"} ${moneda(filas[0].monto)}`,
    entidad: "venta",
    entidad_id: v.id,
  })
  return { ok: true as const }
}

/** Entrega al vendedor de la red: solo con el pago reflejado. Las piezas salen de "transito". */
export async function entregarVentaRed(sesion: Sesion, ventaId: string) {
  const admin = crearClienteAdmin()
  const { data: v } = await admin.from("ventas").select("id, folio, estado, canal, personas:vendedor_id(nombre)").eq("id", ventaId).maybeSingle()
  if (!v || v.canal !== "red") return { ok: false as const, error: "No es una venta de la red." }
  if (v.estado !== "pagada") return { ok: false as const, error: "Se entrega cuando el pago ya se reflejó." }
  const { data: apartado } = await admin.from("movimientos_inventario").select("lote_id, cantidad").eq("venta_id", ventaId).eq("bolsa", "transito")
  const neto = new Map<string, number>()
  for (const m of apartado ?? []) neto.set(m.lote_id, (neto.get(m.lote_id) ?? 0) + m.cantidad)
  const salidas = [...neto].filter(([, n]) => n > 0).map(([lote_id, n]) => ({ lote_id, tipo: "entrega", bolsa: "transito", cantidad: -n, venta_id: ventaId, persona_id: sesion.personaId }))
  if (salidas.length) {
    const { error } = await admin.from("movimientos_inventario").insert(salidas)
    if (error) return { ok: false as const, error: "No se pudo registrar la entrega." }
  }
  await admin.from("ventas").update({ estado: "entregada" }).eq("id", ventaId)
  await admin.from("bitacora").insert({
    persona_id: sesion.personaId,
    perfil: sesion.perfil,
    area: "red",
    accion: `entregó ${v.folio} a ${(v.personas as unknown as { nombre: string } | null)?.nombre ?? "su vendedor"}`,
    entidad: "venta",
    entidad_id: ventaId,
  })
  return { ok: true as const }
}

/**
 * Libera los apartados de la red que pasaron su plazo sin pago: las piezas regresan a su bolsa
 * y la venta se cancela. Se corre al abrir las pantallas de la red y de pagos (no hay cron).
 */
export async function liberarApartadosVencidos() {
  const admin = crearClienteAdmin()
  const { data } = await admin.from("ventas").select("id, folio, vendedor_id").eq("canal", "red").eq("estado", "esperando_pago").lt("apartado_vence_en", new Date().toISOString())
  for (const v of data ?? []) {
    const regresos = await revertirInventario(admin, v.id, "liberacion", null, "apartado liberado sin pago")
    if (regresos.length) await admin.from("movimientos_inventario").insert(regresos)
    await admin.from("ventas").update({ estado: "cancelada", motivo_cancelacion: "Sin pago en el plazo · apartado liberado" }).eq("id", v.id)
    await admin.from("avisos_recompra").delete().eq("venta_id", v.id)
    await admin.from("bitacora").insert({ area: "red", accion: `liberó el apartado de ${v.folio}: no se reflejó el pago a tiempo`, entidad: "venta", entidad_id: v.id })
  }
  return (data ?? []).length
}
