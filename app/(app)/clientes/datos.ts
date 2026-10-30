import "server-only"

import { crearClienteServidor } from "@/lib/supabase/server"

import type { ClienteFila } from "./tipos"

export type Indicadores = { activos: number; nuevosMes: number; ticket: number | null; recompra: number | null }

const inicioMes = () => {
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey" }).format(new Date())
  return new Date(`${hoy.slice(0, 7)}-01T00:00:00-06:00`)
}

export async function cargarClientes(): Promise<{ clientes: ClienteFila[]; indicadores: Indicadores; vendedores: { id: string; nombre: string }[]; ahora: number }> {
  const supabase = await crearClienteServidor()
  const [clientes, ventas, personas] = await Promise.all([
    supabase.from("clientes").select("*").order("nombre"),
    supabase.from("ventas").select("cliente_id, total, creado_en, estado").not("estado", "in", "(cancelada,esperando_pago)"),
    supabase.from("personas").select("id, nombre"),
  ])
  if (clientes.error) throw clientes.error

  const nombrePersona = new Map((personas.data ?? []).map((p) => [p.id, p.nombre]))
  const porCliente = new Map<string, { compras: number; total: number; ultima: string }>()
  for (const v of ventas.data ?? []) {
    const a = porCliente.get(v.cliente_id) ?? { compras: 0, total: 0, ultima: v.creado_en }
    a.compras++
    a.total += Number(v.total)
    if (v.creado_en > a.ultima) a.ultima = v.creado_en
    porCliente.set(v.cliente_id, a)
  }

  const filas: ClienteFila[] = clientes.data.map((c) => {
    const a = porCliente.get(c.id)
    return {
      id: c.id,
      nombre: c.nombre,
      whatsapp: c.whatsapp,
      correo: c.correo,
      tipo: c.tipo,
      origen: c.origen,
      referido_por: c.referido_por,
      vendedor_id: c.vendedor_id,
      vendedor: c.vendedor_id ? (nombrePersona.get(c.vendedor_id) ?? null) : null,
      etiquetas: c.etiquetas ?? [],
      acepta_whatsapp: c.acepta_whatsapp,
      waiver: !!c.waiver_firmado_en,
      creado_en: c.creado_en,
      compras: a?.compras ?? 0,
      total: a?.total ?? 0,
      ultimaCompra: a?.ultima ?? null,
    }
  })

  const mes = inicioMes().toISOString()
  const hace60 = new Date(Date.now() - 60 * 86_400_000).toISOString()
  const ventasMes = (ventas.data ?? []).filter((v) => v.creado_en >= mes)
  const conCompra = filas.filter((f) => f.compras > 0)
  return {
    ahora: Date.now(),
    clientes: filas,
    vendedores: (personas.data ?? []).map((p) => ({ id: p.id, nombre: p.nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    indicadores: {
      activos: filas.filter((f) => f.ultimaCompra && f.ultimaCompra >= hace60).length,
      nuevosMes: filas.filter((f) => f.creado_en >= mes).length,
      ticket: ventasMes.length ? Math.round(ventasMes.reduce((s, v) => s + Number(v.total), 0) / ventasMes.length) : null,
      recompra: conCompra.length ? conCompra.filter((f) => f.compras > 1).length / conCompra.length : null,
    },
  }
}
