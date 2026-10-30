import type { Metadata } from "next"
import { Check } from "lucide-react"

import { Estado, type TipoEstado } from "@/components/app/estado"
import { formatoFecha, formatoMoneda } from "@/lib/format"
import { crearClienteAdmin } from "@/lib/supabase/admin"
import { liberarApartadosVencidos } from "@/lib/ventas"

import { sesionRed } from "../../acceso"

export const metadata: Metadata = { title: "Mis ventas" }

const ESTADO: Record<string, [string, TipoEstado]> = {
  esperando_pago: ["En camino", "warn"],
  pagada: ["Pago reflejado · recoge", "ok"],
  entregada: ["Entregada", "neutro"],
  cancelada: ["Liberada", "neutro"],
}

export default async function MisVentasRed() {
  const s = await sesionRed()
  await liberarApartadosVencidos()
  const admin = crearClienteAdmin()
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey" }).format(new Date())
  const mes = new Date(`${hoy.slice(0, 7)}-01T00:00:00-06:00`).toISOString()
  const [ventas, comisiones] = await Promise.all([
    admin
      .from("ventas")
      .select("id, folio, creado_en, estado, total, motivo_cancelacion, clientes(nombre), venta_partidas(cantidad, productos(nombre, presentacion))")
      .eq("vendedor_id", s.personaId)
      .eq("canal", "red")
      .order("creado_en", { ascending: false })
      .limit(200),
    admin.from("comisiones").select("monto, tipo, pagada_en, ventas!inner(creado_en)").eq("persona_id", s.personaId).gte("ventas.creado_en", mes),
  ])
  type V = { id: string; folio: string; creado_en: string; estado: string; total: number; motivo_cancelacion: string | null; clientes: { nombre: string } | null; venta_partidas: { cantidad: number; productos: { nombre: string; presentacion: string } | null }[] }
  const lista = (ventas.data ?? []) as unknown as V[]
  const delMes = lista.filter((v) => v.creado_en >= mes && (v.estado === "pagada" || v.estado === "entregada"))
  const comision = (comisiones.data ?? []).reduce((t, c) => t + Number(c.monto), 0)
  const deEquipo = (comisiones.data ?? []).filter((c) => c.tipo === "equipo").reduce((t, c) => t + Number(c.monto), 0)
  const porRecoger = lista.filter((v) => v.estado === "pagada").length

  return (
    <>
      <h1 className="text-[22px] font-medium">Mis ventas</h1>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl border bg-card px-3.5 py-3">
          <span className="text-[12px] text-muted-foreground">Vendido este mes</span>
          <b className="num block text-[20px]">{formatoMoneda(delMes.reduce((t, v) => t + Number(v.total), 0))}</b>
          <span className="text-[11.5px] text-muted-foreground">{delMes.length === 1 ? "1 venta pagada" : `${delMes.length} ventas pagadas`}</span>
        </div>
        <div className="rounded-2xl border bg-card px-3.5 py-3">
          <span className="text-[12px] text-muted-foreground">Comisión del mes</span>
          <b className="num block text-[20px]">{formatoMoneda(comision)}</b>
          <span className="text-[11.5px] text-muted-foreground">{deEquipo ? `incluye ${formatoMoneda(deEquipo)} de tu equipo` : "13% de lo pagado, sin IVA"}</span>
        </div>
      </div>
      {porRecoger > 0 && (
        <p role="status" className="flex items-center gap-2 rounded-2xl border border-[#cfe3d2] bg-ok-bg px-3.5 py-3 text-[13.5px] text-ok">
          <Check className="size-4 shrink-0" strokeWidth={2.6} aria-hidden />
          <span>
            <b>{porRecoger === 1 ? "1 pago ya se reflejó." : `${porRecoger} pagos ya se reflejaron.`}</b> Pasa por tu producto con Peptique.
          </span>
        </p>
      )}
      <ul className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
        {lista.map((v) => (
          <li key={v.id} className="flex items-start gap-3 px-3.5 py-3">
            <div className="flex-1">
              <b className="text-[14px]">{v.clientes?.nombre ?? "Cliente"}</b>
              <span className="block text-[12px] text-muted-foreground">
                {v.folio} · {formatoFecha(new Date(v.creado_en))} · {v.venta_partidas.map((p) => `${p.productos?.nombre} ${p.productos?.presentacion}`).join(", ")}
              </span>
            </div>
            <div className="flex flex-col items-end gap-1">
              <b className="num text-[14px]">{formatoMoneda(Number(v.total))}</b>
              <Estado tipo={ESTADO[v.estado]?.[1] ?? "neutro"}>{v.estado === "cancelada" && !v.motivo_cancelacion?.startsWith("Sin pago") ? "Cancelada" : (ESTADO[v.estado]?.[0] ?? v.estado)}</Estado>
            </div>
          </li>
        ))}
        {lista.length === 0 && <li className="px-4 py-8 text-center text-[13px] text-muted-foreground">Aún no tienes ventas.</li>}
      </ul>
      <p className="text-center text-[11.5px] text-muted-foreground">Las comisiones se pagan el día que acuerdes con Peptique.</p>
    </>
  )
}
