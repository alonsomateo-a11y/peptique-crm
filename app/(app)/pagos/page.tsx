import type { Metadata } from "next"

import { KpiCard } from "@/components/app/kpi-card"
import { PageHeader } from "@/components/app/page-header"
import { formatoMoneda } from "@/lib/format"
import type { Perfil } from "@/lib/perfiles"
import { exigirAdmin } from "@/lib/sesion"
import { crearClienteServidor } from "@/lib/supabase/server"

import { liberarApartadosVencidos } from "@/lib/ventas"

import { PagosVista, type PagoFila, type PlanFila } from "./pagos-vista"
import type { VentaRed } from "./red-en-camino"

export const metadata: Metadata = { title: "Pagos" }

/** Horas que faltan para una fecha (negativo si ya pasó). */
const horasHasta = (iso: string | null) => (iso ? (Date.parse(iso) - Date.now()) / 3_600_000 : null)

export default async function Pagos({ searchParams }: PageProps<"/pagos">) {
  const { pestana } = await searchParams
  await exigirAdmin()
  await liberarApartadosVencidos()
  const supabase = await crearClienteServidor()
  const [pagos, planes, red] = await Promise.all([
    supabase
      .from("pagos")
      .select("id, monto, metodo, lugar, estado, referencia, numero_dosis, creado_en, ventas(folio, clientes(nombre)), personas:cobro_persona_id(nombre, perfil)")
      .order("creado_en", { ascending: false })
      .limit(3000),
    supabase
      .from("ventas")
      .select("id, folio, total, clientes(nombre), venta_partidas(productos(nombre, presentacion, pagos_por_dosis)), pagos(monto, numero_dosis, estado), dosis_aplicadas(numero)")
      .eq("forma_pago", "por_dosis")
      .neq("estado", "cancelada"),
    supabase
      .from("ventas")
      .select("id, folio, estado, total, referencia_pago, apartado_vence_en, clientes(nombre), personas:vendedor_id(nombre), venta_partidas(cantidad, productos(nombre, presentacion))")
      .eq("canal", "red")
      .in("estado", ["esperando_pago", "pagada"])
      .order("creado_en"),
  ])
  type R = {
    id: string
    folio: string
    estado: "esperando_pago" | "pagada"
    total: number
    referencia_pago: string | null
    apartado_vence_en: string | null
    clientes: { nombre: string } | null
    personas: { nombre: string } | null
    venta_partidas: { cantidad: number; productos: { nombre: string; presentacion: string } | null }[]
  }
  const ventasRed: VentaRed[] = ((red.data ?? []) as unknown as R[]).map((v) => ({
    id: v.id,
    folio: v.folio,
    estado: v.estado,
    total: Number(v.total),
    cliente: v.clientes?.nombre ?? "—",
    vendedor: v.personas?.nombre ?? "—",
    productos: v.venta_partidas.map((p) => `${p.cantidad > 1 ? `${p.cantidad} × ` : ""}${p.productos?.nombre} ${p.productos?.presentacion}`).join(", "),
    referencia: v.referencia_pago,
    horasRestantes: horasHasta(v.apartado_vence_en),
  }))

  type P = {
    id: string
    monto: number
    metodo: string
    lugar: string
    estado: string
    referencia: string | null
    numero_dosis: number | null
    creado_en: string
    ventas: { folio: string; clientes: { nombre: string } | null } | null
    personas: { nombre: string; perfil: Perfil } | null
  }
  const filas: PagoFila[] = ((pagos.data ?? []) as unknown as P[]).map((p) => ({
    id: p.id,
    monto: Number(p.monto),
    metodo: p.metodo,
    lugar: p.lugar,
    estado: p.estado,
    referencia: p.referencia,
    dosis: p.numero_dosis,
    creado_en: p.creado_en,
    folio: p.ventas?.folio ?? "—",
    cliente: p.ventas?.clientes?.nombre ?? "—",
    cobro: p.personas?.nombre ?? "—",
    perfil: p.personas?.perfil ?? null,
  }))

  type V = {
    id: string
    folio: string
    total: number
    clientes: { nombre: string } | null
    venta_partidas: { productos: { nombre: string; presentacion: string; pagos_por_dosis: number } | null }[]
    pagos: { monto: number; numero_dosis: number | null; estado: string }[]
    dosis_aplicadas: { numero: number }[]
  }
  const listaPlanes: PlanFila[] = ((planes.data ?? []) as unknown as V[])
    .map((v) => {
      const prod = v.venta_partidas[0]?.productos
      const validos = v.pagos.filter((p) => p.estado !== "devolucion")
      const pagado = validos.reduce((s, p) => s + Number(p.monto), 0)
      return {
        id: v.id,
        folio: v.folio,
        cliente: v.clientes?.nombre ?? "—",
        producto: prod ? `${prod.nombre} ${prod.presentacion}` : "",
        de: prod?.pagos_por_dosis ?? 4,
        pagadas: validos.filter((p) => p.numero_dosis).length,
        aplicadas: v.dosis_aplicadas.length,
        pagado,
        falta: Math.max(Number(v.total) - pagado, 0),
      }
    })
    .filter((p) => p.aplicadas < p.de)

  const mes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey" }).format(new Date()).slice(0, 7)
  const nombreMes = new Intl.DateTimeFormat("es-MX", { month: "long", timeZone: "America/Monterrey" }).format(new Date())
  const delMes = filas.filter((p) => p.estado !== "devolucion" && p.creado_en.slice(0, 7) === mes)
  const porConciliar = filas.filter((p) => p.estado === "por_conciliar")
  const porEntregar = filas.filter((p) => p.estado === "por_entregar")
  const quienes = [...new Set(porEntregar.map((p) => p.cobro))]
  const totalMes = delMes.reduce((s, p) => s + p.monto, 0)
  const mezcla = (["efectivo", "transferencia", "tarjeta"] as const).map((m) => ({ m, total: delMes.filter((p) => p.metodo === m).reduce((s, p) => s + p.monto, 0) }))

  return (
    <>
      <PageHeader ruta={[["Inicio", "/inicio"], ["Pagos"]]} titulo="Pagos" descripcion="Quién cobró, cómo, dónde y con qué perfil" />
      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard etiqueta={`Cobrado · ${nombreMes}`} valor={formatoMoneda(totalMes)} contexto={delMes.length === 1 ? "1 pago" : `${delMes.length} pagos`} />
        <KpiCard etiqueta="Por conciliar" valor={formatoMoneda(porConciliar.reduce((s, p) => s + p.monto, 0))} contexto="tarjeta y transferencias sin revisar" />
        <KpiCard etiqueta="Efectivo por entregar" valor={formatoMoneda(porEntregar.reduce((s, p) => s + p.monto, 0))} contexto={quienes.length ? quienes.join(", ") : "nadie debe efectivo"} />
        <div className="flex min-w-0 flex-col gap-2 rounded-2xl border bg-card px-[18px] py-4">
          <span className="text-xs font-semibold text-muted-foreground">Cómo pagan · {nombreMes}</span>
          {totalMes > 0 ? (
            <>
              <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={mezcla.map((x) => `${x.m} ${Math.round((x.total / totalMes) * 100)}%`).join(", ")}>
                {mezcla.map((x, i) => (
                  <div key={x.m} style={{ flex: x.total, background: ["var(--chart-1)", "#8fb089", "#c9d9c5"][i] }} />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {mezcla.map((x, i) => (
                  <span key={x.m} className="flex items-center gap-1.5 text-[11.5px] font-bold capitalize">
                    <i className="inline-block size-2.5 rounded-[3px]" style={{ background: ["var(--chart-1)", "#8fb089", "#c9d9c5"][i] }} />
                    {x.m} {Math.round((x.total / totalMes) * 100)}%
                  </span>
                ))}
              </div>
            </>
          ) : (
            <span className="text-[12.5px] text-muted-foreground">Sin pagos este mes</span>
          )}
        </div>
      </section>
      <PagosVista pagos={filas} planes={listaPlanes} red={ventasRed} pestanaInicial={typeof pestana === "string" ? pestana : undefined} />
    </>
  )
}
