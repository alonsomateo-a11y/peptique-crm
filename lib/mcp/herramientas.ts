import "server-only"

import { z } from "zod"

import { cargarAvisos } from "@/app/(app)/recompras/datos"
import { cargarComisiones } from "@/app/(app)/red/comisiones/datos"
import { cargarRed } from "@/app/(app)/red/datos"
import { cargarInventario } from "@/app/(app)/inventario/datos"
import { WA_SIN_CLIENTE } from "@/lib/cliente-sin-datos"
import { formatoMoneda, formatoPorcentaje } from "@/lib/format"
import { hoyEnCaja } from "@/lib/inicio"
import { prepararLote, validarLote, type DatosLote } from "@/lib/inventario"
import type { Perfil } from "@/lib/perfiles"
import { prepararPrecios } from "@/lib/productos"
import { hoyActual, mesActual, mesMas, resumenMes } from "@/lib/reportes"
import { crearClienteAdmin } from "@/lib/supabase/admin"
import { prepararPago, prepararVenta, type Metodo } from "@/lib/ventas"

import { confirmarPropuesta, crearPropuesta, descartarPropuesta, type DatosPropuesta } from "./propuestas"
import type { SesionMcp } from "./sesion"

/**
 * Herramientas del conector de Claude. Cada una dice qué perfiles la ven (igual que las pantallas
 * del CRM). Las lecturas usan el token del usuario (RLS) o, donde el CRM ya lee con la llave
 * secreta después de revisar el perfil (Inicio, Recompras, Red, Ventas), la misma función y el
 * mismo chequeo. Costos y márgenes solo salen para el administrador.
 */

const ADMIN: Perfil[] = ["administrador"]
const COMERCIAL: Perfil[] = ["administrador", "admin_comercial"]
const uuid = z.string().regex(/^[0-9a-f-]{36}$/, "Identificador no válido")
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha AAAA-MM-DD")

export type Salida = { texto: string; datos?: unknown; error?: boolean }

export type Herramienta = {
  nombre: string
  titulo: string
  descripcion: string
  perfiles: Perfil[]
  entrada: z.ZodObject
  lectura: boolean
  destructiva?: boolean
  ejecutar: (ctx: SesionMcp, args: never) => Promise<Salida>
}

const def = <S extends z.ZodObject>(h: Omit<Herramienta, "entrada" | "ejecutar"> & { entrada: S; ejecutar: (ctx: SesionMcp, args: z.infer<S>) => Promise<Salida> }) =>
  h as unknown as Herramienta

const esAdmin = (ctx: SesionMcp) => ctx.sesion.perfil === "administrador"
const dinero = (n: number | null) => (n === null ? "sin precio" : formatoMoneda(n))
const error = (texto: string): Salida => ({ texto, error: true })

const AVISO_CONFIRMAR =
  "No se guardó nada todavía. Muéstrale este resumen al usuario y pregúntale si lo confirma. Solo si dice que sí, llama a confirmar_propuesta con este propuesta_id (vence en 10 minutos)."

async function propuesta(ctx: SesionMcp, p: DatosPropuesta, resumen: string, detalle: unknown): Promise<Salida> {
  const r = await crearPropuesta(ctx, p, resumen)
  if (!r.ok) return error(r.error)
  return { texto: `${resumen}\n\n${AVISO_CONFIRMAR}\npropuesta_id: ${r.id}`, datos: { propuesta_id: r.id, vence_en: r.vence, resumen, detalle } }
}

// ───────────── Lectura ─────────────

const resumenVentas = def({
  nombre: "resumen_ventas",
  titulo: "Ventas contra plan",
  descripcion:
    "Ventas de hoy, de los últimos 7 días o del mes, contra el plan, en hora de Monterrey. Mismo criterio que Inicio: total con IVA, sin canceladas ni ventas de la red esperando pago. El administrador también ve margen, productos y vendedores.",
  perfiles: COMERCIAL,
  lectura: true,
  entrada: z.object({
    periodo: z.enum(["hoy", "semana", "mes"]).describe("hoy, semana (últimos 7 días con hoy) o mes"),
    mes: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("Solo administrador: mes AAAA-MM para ver un mes anterior (con periodo=mes)"),
  }),
  async ejecutar(ctx, a) {
    const admin = esAdmin(ctx)
    const actual = mesActual()
    if (a.mes && !admin) return error("Solo el administrador puede ver meses anteriores (pantalla de Reportes).")
    const mes = a.periodo === "mes" && a.mes ? a.mes : actual
    const r = await resumenMes(mes)
    const diasMes = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5)), 0).getDate()
    const planDia = r.plan.meta / diasMes

    if (a.periodo === "hoy") {
      const h = await hoyEnCaja()
      return {
        texto: `Hoy (${hoyActual()}): ${formatoMoneda(h.ventasHoy)} en ${h.numHoy} ventas. Plan del día: ${formatoMoneda(Math.round(planDia))}. Caja ${h.caja ? `abierta${h.caja.por ? ` por ${h.caja.por}` : ""}` : "cerrada"}.`,
        datos: { fecha: hoyActual(), ventas: h.ventasHoy, numero: h.numHoy, planDelDia: Math.round(planDia), cajaAbierta: !!h.caja },
      }
    }

    if (a.periodo === "semana") {
      let dias = r.diario.map((d) => ({ dia: d.date.toISOString().slice(0, 10), ventas: d.delDia, plan: planDia }))
      if (dias.length < 7) {
        const anterior = mesMas(actual, -1)
        const ra = await resumenMes(anterior)
        const diasAnt = new Date(Number(anterior.slice(0, 4)), Number(anterior.slice(5)), 0).getDate()
        dias = [...ra.diario.map((d) => ({ dia: d.date.toISOString().slice(0, 10), ventas: d.delDia, plan: ra.plan.meta / diasAnt })), ...dias]
      }
      const semana = dias.slice(-7)
      const total = semana.reduce((s, d) => s + d.ventas, 0)
      const plan = Math.round(semana.reduce((s, d) => s + d.plan, 0))
      return {
        texto: `Últimos 7 días (${semana[0]?.dia} a ${semana.at(-1)?.dia}): ${formatoMoneda(total)} contra un plan de ${formatoMoneda(plan)}${plan ? ` (${formatoPorcentaje(total / plan)})` : ""}.`,
        datos: { desde: semana[0]?.dia, hasta: semana.at(-1)?.dia, ventas: total, plan, porDia: semana.map((d) => ({ dia: d.dia, ventas: d.ventas })) },
      }
    }

    const planAlDia = r.diario.at(-1)?.plan ?? 0
    const datos: Record<string, unknown> = {
      mes,
      ventas: r.ingreso,
      numeroVentas: r.ventas,
      plan: r.plan.meta,
      planSugerido: r.plan.sugerido,
      avance: r.plan.meta ? r.ingreso / r.plan.meta : null,
      planAlDia: mes === actual ? planAlDia : r.plan.meta,
      mesAnterior: r.ingresoAnterior,
      porCanal: r.porCanal.map((c) => ({ canal: c.canal, monto: c.monto, ventas: c.ventas })),
    }
    if (admin) {
      datos.margenBruto = r.margenBruto
      datos.utilidad = r.utilidad
      datos.porProducto = r.porProducto.slice(0, 10).map((p) => ({ producto: p.nombre, ingreso: p.ingreso, piezas: p.piezas, margen: p.margen }))
      datos.porVendedor = r.porPersona.map((p) => ({ persona: p.persona, monto: p.monto, ventas: p.ventas }))
    }
    return {
      texto: `${mes}: ${formatoMoneda(r.ingreso)} en ${r.ventas} ventas. Plan ${formatoMoneda(r.plan.meta)}${r.plan.sugerido ? " (sugerido: mes anterior + 5%)" : ""}${r.plan.meta ? `, avance ${formatoPorcentaje(r.ingreso / r.plan.meta)}` : ""}.${admin && r.margenBruto !== null ? ` Margen bruto ${formatoPorcentaje(r.margenBruto)}.` : ""}`,
      datos,
    }
  },
})

const inventario = def({
  nombre: "inventario",
  titulo: "Inventario y lotes",
  descripcion:
    "Existencias por producto (venta general, apartado para recurrentes y en tránsito de la red) y lotes. Con solo_por_agotarse=true da los productos visibles con 3 piezas o menos para vender, como la alerta de Inicio. Incluye el costo por pieza de cada lote.",
  perfiles: ADMIN,
  lectura: true,
  entrada: z.object({ solo_por_agotarse: z.boolean().optional().describe("Solo productos visibles con 3 piezas o menos en venta general") }),
  async ejecutar(ctx, a) {
    const inv = await cargarInventario(ctx.supabase)
    let productos = inv.productos
    if (a.solo_por_agotarse) productos = productos.filter((p) => p.visible && p.bolsas.general <= 3)
    const ids = new Set(productos.map((p) => p.id))
    const lotes = inv.lotes.filter((l) => ids.has(l.producto_id) && l.existencia > 0)
    return {
      texto: a.solo_por_agotarse
        ? productos.length
          ? `Por agotarse: ${productos.map((p) => `${p.nombre} (${p.bolsas.general} para vender)`).join(", ")}.`
          : "Ningún producto visible tiene 3 piezas o menos."
        : `${productos.length} productos y ${lotes.length} lotes con existencia.`,
      datos: {
        productos: productos.map((p) => ({ producto_id: p.id, producto: p.nombre, visible: p.visible, paraVender: p.bolsas.general, recurrentes: p.bolsas.recurrentes, enTransito: p.bolsas.transito, apartadoSugerido: p.apartadoSugerido })),
        lotes: lotes.map((l) => ({ codigo: l.codigo, producto: l.producto, llegada: l.llegada, recibidas: l.recibidas, existencia: l.existencia, costoPieza: l.costo, margen: l.margen, coa: l.coa })),
        tipoCambio: inv.tipoCambio,
      },
    }
  },
})

const recompras = def({
  nombre: "recompras_pendientes",
  titulo: "Recompras pendientes",
  descripcion: "Clientes a los que se les acaba (o ya se les acabó) el producto y no han recomprado, ordenados por fecha. Para avisarles por WhatsApp a mano, con un toque, solo si aceptan WhatsApp.",
  perfiles: COMERCIAL,
  lectura: true,
  entrada: z.object({ incluir_sin_recompra: z.boolean().optional().describe("Incluir los que ya pasaron su fecha sin recomprar") }),
  async ejecutar(_ctx, a) {
    const { avisos: lista } = await cargarAvisos()
    const estados: string[] = a.incluir_sin_recompra ? ["por_avisar", "contactado", "sin_recompra"] : ["por_avisar", "contactado"]
    const pendientes = lista.filter((x) => estados.includes(x.estado))
    return {
      texto: pendientes.length ? `${pendientes.length} recompras pendientes.` : "No hay recompras pendientes.",
      datos: pendientes.slice(0, 100).map((x) => ({
        cliente: x.cliente,
        producto: x.producto,
        seLeAcaba: x.seLeAcaba,
        dias: x.dias,
        estado: x.estado,
        siguienteEtapa: x.siguienteEtapa,
        vendedor: x.vendedor,
        whatsapp: x.aceptaWhatsapp ? `https://wa.me/52${x.whatsapp}` : null,
      })),
    }
  },
})

const buscarCliente = def({
  nombre: "buscar_cliente",
  titulo: "Buscar cliente",
  descripcion: "Busca clientes por nombre o por WhatsApp. Devuelve el cliente_id para proponer una venta.",
  perfiles: COMERCIAL,
  lectura: true,
  entrada: z.object({ texto: z.string().min(2).max(60).describe("Nombre o parte del WhatsApp") }),
  async ejecutar(ctx, a) {
    const texto = a.texto.trim()
    const digitos = texto.replace(/\D/g, "")
    const filtro = digitos.length >= 3 ? `whatsapp.ilike.%${digitos}%` : `nombre.ilike.%${texto.replace(/[%_,()*]/g, "")}%`
    const { data } = await ctx.supabase.from("clientes").select("id, nombre, whatsapp, tipo, waiver_firmado_en").neq("whatsapp", WA_SIN_CLIENTE).or(filtro).order("nombre").limit(10)
    const lista = (data ?? []).map((c) => ({ cliente_id: c.id, nombre: c.nombre, whatsapp: c.whatsapp, tipo: c.tipo, waiverFirmado: !!c.waiver_firmado_en }))
    return { texto: lista.length ? `${lista.length} clientes encontrados.` : "No encontré clientes con ese dato.", datos: lista }
  },
})

const clientesPrincipales = def({
  nombre: "clientes_principales",
  titulo: "Clientes principales",
  descripcion: "Clientes que más compraron en un mes (hora de Monterrey), con total y número de ventas.",
  perfiles: ADMIN,
  lectura: true,
  entrada: z.object({ mes: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("AAAA-MM; por omisión el mes actual"), limite: z.number().int().min(1).max(50).optional() }),
  async ejecutar(ctx, a) {
    const mes = a.mes ?? mesActual()
    const desde = new Date(`${mes}-01T00:00:00-06:00`).toISOString()
    const hasta = new Date(`${mesMas(mes, 1)}-01T00:00:00-06:00`).toISOString()
    const { data } = await ctx.supabase
      .from("ventas")
      .select("total, cliente_id, clientes(nombre, tipo)")
      .gte("creado_en", desde)
      .lt("creado_en", hasta)
      .not("estado", "in", "(cancelada,esperando_pago)")
    const porCliente = new Map<string, { nombre: string; tipo: string; total: number; ventas: number }>()
    for (const v of (data ?? []) as unknown as { total: number; cliente_id: string; clientes: { nombre: string; tipo: string } | null }[]) {
      if (!v.clientes || v.clientes.nombre === "Cliente sin datos") continue
      const x = porCliente.get(v.cliente_id) ?? { nombre: v.clientes.nombre, tipo: v.clientes.tipo, total: 0, ventas: 0 }
      x.total += Number(v.total)
      x.ventas++
      porCliente.set(v.cliente_id, x)
    }
    const lista = [...porCliente.values()].sort((x, y) => y.total - x.total).slice(0, a.limite ?? 10)
    return { texto: lista.length ? `Clientes principales de ${mes}: ${lista.slice(0, 5).map((c) => `${c.nombre} ${formatoMoneda(c.total)}`).join(", ")}.` : `Sin ventas en ${mes}.`, datos: lista }
  },
})

const redComercial = def({
  nombre: "red_comercial",
  titulo: "Distribuidores y comisionistas",
  descripcion: "Distribuidores y comisionistas con lo que vendieron este mes, su comisión del mes y ventas esperando pago, de mayor a menor venta.",
  perfiles: COMERCIAL,
  lectura: true,
  entrada: z.object({ solo_activos: z.boolean().optional() }),
  async ejecutar(ctx, a) {
    const red = await cargarRed(ctx.sesion.personaId)
    const lista = red
      .filter((p) => !a.solo_activos || p.estado === "activo")
      .sort((x, y) => y.vendidoMes - x.vendidoMes)
      .map((p) => ({ nombre: p.nombre, perfil: p.perfil, estado: p.estado, zona: p.zona, vendidoMes: p.vendidoMes, ventasMes: p.ventasMes, comisionMes: p.comisionMes, esperandoPago: p.esperando }))
    return { texto: `${lista.length} personas en la red.`, datos: lista }
  },
})

const comisiones = def({
  nombre: "comisiones",
  titulo: "Comisiones",
  descripcion: "Comisiones por pagar a la red (por persona: directa y de equipo) y los últimos pagos de comisiones.",
  perfiles: COMERCIAL,
  lectura: true,
  entrada: z.object({}),
  async ejecutar() {
    const { porPagar, pagos } = await cargarComisiones()
    const total = porPagar.reduce((s, p) => s + p.total, 0)
    return {
      texto: `Por pagar: ${formatoMoneda(total)} a ${porPagar.length} personas.`,
      datos: {
        porPagar: porPagar.map((p) => ({ nombre: p.nombre, perfil: p.perfil, total: p.total, directa: p.directa, equipo: p.equipo, ventas: p.filas.length })),
        pagosRecientes: pagos.slice(0, 10).map((p) => ({ nombre: p.nombre, pagadaEn: p.pagadaEn, total: p.total, ventas: p.ventas })),
      },
    }
  },
})

const caja = def({
  nombre: "corte_de_caja",
  titulo: "Caja y cortes",
  descripcion: "Caja abierta: fondo y cobros en caja por método desde que se abrió. El administrador también ve los últimos cortes cerrados con su diferencia.",
  perfiles: COMERCIAL,
  lectura: true,
  entrada: z.object({}),
  async ejecutar(ctx) {
    // Igual que la pantalla de Corte del mostrador (que el admin comercial también abre).
    const admin = crearClienteAdmin()
    const { data: abierta } = await admin.from("cortes_caja").select("id, fondo, abierta_en, personas:abierta_por(nombre)").is("cerrada_en", null).order("abierta_en", { ascending: false }).limit(1).maybeSingle()
    let actual: Record<string, unknown> | null = null
    if (abierta) {
      const { data: pagos } = await admin.from("pagos").select("monto, metodo").eq("lugar", "caja").gte("creado_en", abierta.abierta_en)
      const por = (m: Metodo) => (pagos ?? []).filter((p) => p.metodo === m).reduce((s, p) => s + Number(p.monto), 0)
      actual = { abiertaEn: abierta.abierta_en, abiertaPor: (abierta.personas as unknown as { nombre: string } | null)?.nombre ?? null, fondo: Number(abierta.fondo), efectivo: por("efectivo"), tarjeta: por("tarjeta"), transferencia: por("transferencia"), efectivoEsperado: Number(abierta.fondo) + por("efectivo") }
    }
    let cerrados: unknown[] = []
    if (esAdmin(ctx)) {
      const { data } = await ctx.supabase.from("cortes_caja").select("abierta_en, cerrada_en, fondo, efectivo_esperado, efectivo_contado, diferencia").not("cerrada_en", "is", null).order("cerrada_en", { ascending: false }).limit(7)
      cerrados = data ?? []
    }
    return { texto: actual ? `Caja abierta. Efectivo esperado: ${formatoMoneda(actual.efectivoEsperado as number)}.` : "La caja está cerrada.", datos: { cajaAbierta: actual, cortesCerrados: cerrados } }
  },
})

const verVenta = def({
  nombre: "ver_venta",
  titulo: "Ver una venta",
  descripcion: "Detalle de una venta por folio (M-, P- o R-): cliente, productos, pagos y saldo.",
  perfiles: COMERCIAL,
  lectura: true,
  entrada: z.object({ folio: z.string().regex(/^[MPR]-\d{1,6}$/i, "Folio como P-0012") }),
  async ejecutar(_ctx, a) {
    // Igual que la pantalla de la venta: RLS no alcanza partidas ni pagos para el admin comercial.
    const { data: v } = await crearClienteAdmin()
      .from("ventas")
      .select("id, folio, canal, estado, forma_pago, total, creado_en, nota, referencia_pago, clientes(nombre, tipo), personas:vendedor_id(nombre), venta_partidas(cantidad, precio_unitario, etapa_protocolo, productos(nombre, presentacion), lotes(codigo)), pagos(monto, metodo, estado, creado_en)")
      .eq("folio", a.folio.toUpperCase())
      .maybeSingle()
    if (!v) return error(`No encontré la venta ${a.folio}.`)
    type Partida = { cantidad: number; precio_unitario: number; etapa_protocolo: number; productos: { nombre: string; presentacion: string } | null; lotes: { codigo: string } | null }
    type Pago = { monto: number; metodo: string; estado: string; creado_en: string }
    const pagos = (v.pagos as unknown as Pago[]).filter((p) => p.estado !== "devolucion")
    const pagado = pagos.reduce((s, p) => s + Number(p.monto), 0)
    const saldo = Math.round((Number(v.total) - pagado) * 100) / 100
    return {
      texto: `${v.folio}: ${(v.clientes as unknown as { nombre: string } | null)?.nombre ?? "—"}, ${formatoMoneda(Number(v.total))}, ${v.estado}${saldo > 0 && v.estado !== "cancelada" ? `, saldo ${formatoMoneda(saldo)}` : ""}.`,
      datos: {
        folio: v.folio,
        fecha: v.creado_en,
        canal: v.canal,
        estado: v.estado,
        formaPago: v.forma_pago,
        cliente: v.clientes,
        vendedor: (v.personas as unknown as { nombre: string } | null)?.nombre ?? null,
        total: Number(v.total),
        pagado,
        saldo,
        nota: v.nota,
        productos: (v.venta_partidas as unknown as Partida[]).map((p) => ({ producto: p.productos ? `${p.productos.nombre} ${p.productos.presentacion}` : "—", cantidad: p.cantidad, precio: Number(p.precio_unitario), etapa: p.etapa_protocolo, lote: p.lotes?.codigo })),
        pagos: pagos.map((p) => ({ monto: Number(p.monto), metodo: p.metodo, estado: p.estado, fecha: p.creado_en })),
      },
    }
  },
})

const catalogo = def({
  nombre: "catalogo",
  titulo: "Catálogo y precios",
  descripcion: "Productos con su producto_id y precios público, médico y distribuidor. El administrador ve también los ocultos y las piezas para vender.",
  perfiles: COMERCIAL,
  lectura: true,
  entrada: z.object({ texto: z.string().max(60).optional().describe("Parte del nombre del producto") }),
  async ejecutar(ctx, a) {
    let q = ctx.supabase.from("productos").select("id, nombre, presentacion, familia, visible, precio_publico, precio_medico, precio_distribuidor").order("nombre").order("presentacion")
    if (a.texto?.trim()) q = q.ilike("nombre", `%${a.texto.trim().replace(/[%_,()*]/g, "")}%`)
    const { data } = await q.limit(100)
    let stock = new Map<string, number>()
    if (esAdmin(ctx) && data?.length) {
      const { data: e } = await ctx.supabase.from("existencias").select("producto_id, piezas").eq("bolsa", "general").in("producto_id", data.map((p) => p.id))
      stock = (e ?? []).reduce((m, x) => m.set(x.producto_id, (m.get(x.producto_id) ?? 0) + x.piezas), new Map<string, number>())
    }
    const num = (v: unknown) => (v === null ? null : Number(v))
    const lista = (data ?? []).map((p) => ({
      producto_id: p.id,
      producto: `${p.nombre} ${p.presentacion}`,
      familia: p.familia,
      ...(esAdmin(ctx) ? { visible: p.visible, paraVender: stock.get(p.id) ?? 0 } : {}),
      precioPublico: num(p.precio_publico),
      precioMedico: num(p.precio_medico),
      precioDistribuidor: num(p.precio_distribuidor),
    }))
    return { texto: `${lista.length} productos.`, datos: lista }
  },
})

// ───────────── Escritura: siempre propuesta + confirmación ─────────────

const proponerVenta = def({
  nombre: "proponer_venta",
  titulo: "Proponer una venta",
  descripcion:
    "Prepara una venta y devuelve el resumen (precios según el tipo de cliente, lotes, etapa del protocolo, total) SIN guardarla. El administrador registra un pedido por cobrar (médicos y distribuidores, folio P-). El admin comercial registra una venta en persona ya cobrada, con su método de pago. Después hay que confirmar con confirmar_propuesta.",
  perfiles: COMERCIAL,
  lectura: false,
  entrada: z.object({
    cliente_id: uuid.describe("De buscar_cliente"),
    productos: z.array(z.object({ producto_id: uuid.describe("De catalogo"), cantidad: z.number().int().min(1).max(50) })).min(1).max(20),
    metodo: z.enum(["efectivo", "tarjeta", "transferencia"]).optional().describe("Admin comercial: cómo pagó el cliente"),
    forma: z.enum(["completo", "por_dosis"]).optional().describe("Admin comercial: pago completo o por dosis (una sola pieza)"),
    referencia: z.string().max(80).optional().describe("Referencia de la transferencia o del voucher"),
    nota: z.string().max(300).optional(),
  }),
  async ejecutar(ctx, a) {
    const comercial = ctx.sesion.perfil === "admin_comercial"
    if (comercial && !a.metodo) return error("Falta el método de pago (efectivo, tarjeta o transferencia).")
    const datos = {
      canal: comercial ? ("en_persona" as const) : ("pedido" as const),
      clienteId: a.cliente_id,
      items: a.productos.map((p) => ({ productoId: p.producto_id, cantidad: p.cantidad })),
      forma: comercial ? (a.forma ?? "completo") : ("completo" as const),
      metodo: comercial ? a.metodo! : ("transferencia" as const),
      referencia: a.referencia?.trim() || null,
      nota: a.nota?.trim().slice(0, 300) || null,
    }
    const prep = await prepararVenta({ ...datos, vendedor: ctx.sesion })
    if (!prep.ok) return error(`No se puede: ${prep.error}`)
    const { plan } = prep
    const lineas = prep.piezasPorProducto.map((p, i) => `- ${p.cantidad} × ${p.nombre} a ${formatoMoneda(p.precio)} (lote ${plan.resumen[i]?.lote}, etapa ${plan.resumen[i]?.etapa})`)
    const resumen = [
      `${comercial ? "Venta en persona" : "Pedido por cobrar"} para ${plan.cliente.nombre} (${plan.cliente.tipo}):`,
      ...lineas,
      `Total ${formatoMoneda(plan.total)}${comercial ? ` · cobrado ${formatoMoneda(plan.cobrado)} por ${datos.metodo}${datos.forma === "por_dosis" ? ` (dosis 1 de ${plan.pagosPorDosis})` : ""}` : " · queda por cobrar"}.`,
    ].join("\n")
    return propuesta(ctx, { accion: "venta", datos }, resumen, { cliente: plan.cliente.nombre, total: plan.total, cobrado: plan.cobrado, productos: prep.piezasPorProducto })
  },
})

const proponerPago = def({
  nombre: "proponer_pago",
  titulo: "Proponer un pago",
  descripcion: "Prepara el registro de un pago a una venta por folio (pedidos y saldos) y muestra el saldo que queda, SIN guardarlo. Luego confirmar_propuesta.",
  perfiles: ADMIN,
  lectura: false,
  entrada: z.object({
    folio: z.string().regex(/^[MPR]-\d{1,6}$/i),
    monto: z.number().positive(),
    metodo: z.enum(["efectivo", "tarjeta", "transferencia"]),
    lugar: z.enum(["caja", "en_persona", "banco"]).describe("banco = ya se ve en el estado de cuenta"),
    referencia: z.string().max(80).optional(),
    fecha: fecha.optional().describe("Si el pago fue otro día (hora de Monterrey)"),
  }),
  async ejecutar(ctx, a) {
    const folio = a.folio.toUpperCase()
    const { data: v } = await ctx.supabase.from("ventas").select("id").eq("folio", folio).maybeSingle()
    if (!v) return error(`No encontré la venta ${folio}.`)
    const datos = { folio, ventaId: v.id, monto: Math.round(a.monto * 100) / 100, metodo: a.metodo, lugar: a.lugar, referencia: a.referencia?.trim() || null, fecha: a.fecha ?? null }
    const prep = await prepararPago(datos)
    if (!prep.ok) return error(`No se puede: ${prep.error}`)
    const resumen = `Pago de ${formatoMoneda(datos.monto)} (${a.metodo}, ${a.lugar}) a ${folio} de ${prep.s.cliente}${a.fecha ? ` con fecha ${a.fecha}` : ""}. Saldo antes ${formatoMoneda(prep.s.saldo)} → después ${formatoMoneda(prep.saldoDespues)}${prep.saldoDespues <= 0 ? " (queda liquidada)" : ""}.`
    return propuesta(ctx, { accion: "pago", datos }, resumen, { folio, saldoAntes: prep.s.saldo, saldoDespues: prep.saldoDespues })
  },
})

const proponerLote = def({
  nombre: "proponer_ingreso_lote",
  titulo: "Proponer ingreso de lote",
  descripcion:
    "Prepara la entrada de un lote: calcula el costo por pieza en pesos y cuántas piezas se apartan para clientes recurrentes, SIN guardarlo. El COA original se sube después en Inventario. Luego confirmar_propuesta.",
  perfiles: ADMIN,
  lectura: false,
  entrada: z.object({
    producto_id: uuid,
    cantidad: z.number().int().min(1),
    moneda: z.enum(["usd", "mxn"]),
    costo_usd: z.number().positive().optional().describe("Costo por pieza en dólares (moneda usd)"),
    tipo_cambio: z.number().positive().max(100).optional().describe("Pesos por dólar (moneda usd)"),
    costo_mxn: z.number().positive().optional().describe("Costo por pieza en pesos (moneda mxn)"),
    llegada: fecha.describe("Fecha de llegada AAAA-MM-DD"),
    lote_origen: z.string().max(60).optional().describe("Lote del laboratorio"),
  }),
  async ejecutar(ctx, a) {
    const datos: DatosLote = {
      productoId: a.producto_id,
      cantidad: a.cantidad,
      moneda: a.moneda,
      costoUsd: a.costo_usd ?? null,
      tipoCambio: a.tipo_cambio ?? null,
      costoMxn: a.costo_mxn ?? null,
      llegada: a.llegada,
      loteOrigen: a.lote_origen?.trim() || null,
    }
    const errores = validarLote(datos)
    if (Object.keys(errores).length) return error(`Revisa: ${Object.values(errores).join(" ")}`)
    const prep = await prepararLote(ctx.supabase, datos)
    if (!prep.ok) return error(prep.error)
    const resumen = `Ingreso de ${a.cantidad} piezas de ${prep.producto.nombre} ${prep.producto.presentacion}, llegada ${a.llegada}${datos.loteOrigen ? `, lote del laboratorio ${datos.loteOrigen}` : ""}. Costo por pieza ${formatoMoneda(prep.costoMxn)}${a.moneda === "usd" ? ` (US$${a.costo_usd} × ${a.tipo_cambio})` : ""}. Reparto: ${prep.general} para venta general y ${prep.recurrentes} apartadas para recurrentes.`
    return propuesta(ctx, { accion: "lote", datos }, resumen, { producto: `${prep.producto.nombre} ${prep.producto.presentacion}`, costoPieza: prep.costoMxn, general: prep.general, recurrentes: prep.recurrentes })
  },
})

const proponerPrecio = def({
  nombre: "proponer_precio",
  titulo: "Proponer cambio de precio",
  descripcion: "Prepara el cambio de uno o varios precios de un producto (público, médico, distribuidor) y muestra antes → después, SIN guardarlo. Solo cambia los precios que mandes. Luego confirmar_propuesta.",
  perfiles: ADMIN,
  lectura: false,
  entrada: z.object({
    producto_id: uuid,
    precio_publico: z.number().min(0).optional(),
    precio_medico: z.number().min(0).optional(),
    precio_distribuidor: z.number().min(0).optional(),
  }),
  async ejecutar(ctx, a) {
    const cambios = Object.fromEntries(
      (["precio_publico", "precio_medico", "precio_distribuidor"] as const).filter((k) => a[k] !== undefined).map((k) => [k, Math.round(a[k]! * 100) / 100]),
    )
    if (!Object.keys(cambios).length) return error("Indica al menos un precio.")
    const prep = await prepararPrecios(ctx.supabase, a.producto_id, cambios)
    if (!prep.ok) return error(`No se puede: ${prep.error}`)
    const resumen = `Cambio de precio de ${prep.producto}: ${prep.lista.map((x) => `${x.precio} ${dinero(x.antes)} → ${dinero(x.despues)}`).join(", ")}.`
    return propuesta(ctx, { accion: "precio", datos: { productoId: a.producto_id, cambios } }, resumen, { producto: prep.producto, cambios: prep.lista })
  },
})

const confirmar = def({
  nombre: "confirmar_propuesta",
  titulo: "Confirmar y guardar",
  descripcion:
    "Guarda en el CRM una propuesta que el usuario ya revisó y aprobó de forma explícita en esta conversación. Nunca la llames sin esa aprobación. Se vuelve a validar todo al guardar; cada propuesta sirve una sola vez.",
  perfiles: COMERCIAL,
  lectura: false,
  destructiva: true,
  entrada: z.object({ propuesta_id: uuid }),
  async ejecutar(ctx, a) {
    const r = await confirmarPropuesta(ctx, a.propuesta_id)
    return r.ok ? { texto: r.texto, datos: r.datos } : error(r.error)
  },
})

const descartar = def({
  nombre: "descartar_propuesta",
  titulo: "Descartar propuesta",
  descripcion: "Descarta una propuesta que el usuario no quiere guardar.",
  perfiles: COMERCIAL,
  lectura: false,
  entrada: z.object({ propuesta_id: uuid }),
  async ejecutar(ctx, a) {
    return (await descartarPropuesta(ctx, a.propuesta_id)) ? { texto: "Propuesta descartada. No se guardó nada." } : error("No encontré una propuesta abierta con ese id.")
  },
})

/** En orden fijo (ayuda al caché de Claude). */
export const HERRAMIENTAS: Herramienta[] = [
  resumenVentas,
  inventario,
  recompras,
  buscarCliente,
  clientesPrincipales,
  redComercial,
  comisiones,
  caja,
  verVenta,
  catalogo,
  proponerVenta,
  proponerPago,
  proponerLote,
  proponerPrecio,
  confirmar,
  descartar,
]

export const herramientasPara = (perfil: Perfil) => HERRAMIENTAS.filter((h) => h.perfiles.includes(perfil))
