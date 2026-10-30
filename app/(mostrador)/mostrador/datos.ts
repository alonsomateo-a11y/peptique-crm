import "server-only"

import { crearClienteAdmin } from "@/lib/supabase/admin"
import { liberarApartadosVencidos, precioPara } from "@/lib/ventas"

import type { Caja, ClienteMostrador, ProductoMostrador } from "./tipos"

/** Datos del mostrador. Se leen con la llave secreta y solo salen campos sin costos. */
export async function cargarMostrador(): Promise<{ caja: Caja; productos: ProductoMostrador[]; recientes: ClienteMostrador[]; waiver: string }> {
  await liberarApartadosVencidos()
  const admin = crearClienteAdmin()
  const [caja, productos, lotes, existencias, ventas, config] = await Promise.all([
    admin.from("cortes_caja").select("id, fondo, abierta_en, personas:abierta_por(nombre)").is("cerrada_en", null).order("abierta_en", { ascending: false }).limit(1).maybeSingle(),
    admin.from("productos").select("id, nombre, presentacion, familia, precio_publico, precio_medico, precio_distribuidor, pagos_por_dosis").eq("visible", true).order("familia").order("nombre").order("presentacion"),
    admin.from("lotes").select("id, producto_id"),
    admin.from("existencias").select("lote_id, bolsa, piezas"),
    admin.from("ventas").select("cliente_id, forma_pago, estado, creado_en").order("creado_en", { ascending: false }).limit(200),
    admin.from("configuracion").select("valor").eq("clave", "waiver").maybeSingle(),
  ])

  const productoDeLote = new Map((lotes.data ?? []).map((l) => [l.id, l.producto_id]))
  const stock = new Map<string, { general: number; recurrentes: number }>()
  for (const e of existencias.data ?? []) {
    const pid = productoDeLote.get(e.lote_id)
    if (!pid || (e.bolsa !== "general" && e.bolsa !== "recurrentes")) continue
    const s = stock.get(pid) ?? { general: 0, recurrentes: 0 }
    s[e.bolsa as "general" | "recurrentes"] += e.piezas
    stock.set(pid, s)
  }

  const idsRecientes = [...new Set((ventas.data ?? []).map((v) => v.cliente_id))].slice(0, 6)
  const planes = new Set((ventas.data ?? []).filter((v) => v.forma_pago === "por_dosis" && v.estado === "por_cobrar").map((v) => v.cliente_id))
  const { data: clientes } = idsRecientes.length ? await admin.from("clientes").select("id, nombre, whatsapp, tipo, waiver_firmado_en").in("id", idsRecientes) : { data: [] }

  const c = caja.data as unknown as { id: string; fondo: number; abierta_en: string; personas: { nombre: string } | null } | null
  return {
    caja: c ? { id: c.id, fondo: Number(c.fondo), abiertaEn: c.abierta_en, abiertaPor: c.personas?.nombre ?? "" } : null,
    productos: (productos.data ?? []).map((p) => ({
      id: p.id,
      nombre: p.nombre,
      presentacion: p.presentacion,
      familia: p.familia,
      precios: { paciente: precioPara("paciente", p), medico: precioPara("medico", p), distribuidor: precioPara("distribuidor", p) },
      general: stock.get(p.id)?.general ?? 0,
      recurrentes: stock.get(p.id)?.recurrentes ?? 0,
      pagosPorDosis: p.pagos_por_dosis,
    })),
    recientes: idsRecientes
      .map((id) => (clientes ?? []).find((x) => x.id === id))
      .filter((x) => !!x)
      .map((x) => ({ id: x.id, nombre: x.nombre, whatsapp: x.whatsapp, tipo: x.tipo, waiver: !!x.waiver_firmado_en, planDosis: planes.has(x.id) })),
    waiver:
      (config.data?.valor as { texto?: string } | undefined)?.texto ??
      "Declaro que soy mayor de edad, que los productos que adquiero son para uso exclusivo de investigación y no para consumo humano, y que recibí el certificado de análisis (COA) del lote.",
  }
}
