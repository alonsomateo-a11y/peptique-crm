import type { Metadata } from "next"
import { Check, MessageCircle } from "lucide-react"

import { Estado, type TipoEstado } from "@/components/app/estado"
import { ligaDocumentos } from "@/lib/documentos"
import { formatoFecha, formatoMoneda } from "@/lib/format"
import { crearClienteAdmin } from "@/lib/supabase/admin"
import { ligaWhatsapp } from "@/lib/telefono"
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
  const [ventas, comisiones, sinPagar] = await Promise.all([
    admin
      .from("ventas")
      .select("id, folio, creado_en, estado, total, motivo_cancelacion, clientes(nombre, whatsapp), venta_partidas(cantidad, productos(nombre, presentacion))")
      .eq("vendedor_id", s.personaId)
      .eq("canal", "red")
      .order("creado_en", { ascending: false })
      .limit(200),
    admin.from("comisiones").select("monto, tipo, pagada_en, ventas!inner(creado_en)").eq("persona_id", s.personaId).gte("ventas.creado_en", mes),
    admin.from("comisiones").select("monto").eq("persona_id", s.personaId).is("pagada_en", null),
  ])
  type V = { id: string; folio: string; creado_en: string; estado: string; total: number; motivo_cancelacion: string | null; clientes: { nombre: string; whatsapp: string } | null; venta_partidas: { cantidad: number; productos: { nombre: string; presentacion: string } | null }[] }
  const lista = (ventas.data ?? []) as unknown as V[]
  const delMes = lista.filter((v) => v.creado_en >= mes && (v.estado === "pagada" || v.estado === "entregada"))
  const comision = (comisiones.data ?? []).reduce((t, c) => t + Number(c.monto), 0)
  const deEquipo = (comisiones.data ?? []).filter((c) => c.tipo === "equipo").reduce((t, c) => t + Number(c.monto), 0)
  const porRecoger = lista.filter((v) => v.estado === "pagada").length
  const porCobrar = (sinPagar.data ?? []).reduce((t, c) => t + Number(c.monto), 0)
  // Con el pago reflejado ya hay lote asignado: el cliente puede recibir su COA y protocolo.
  const ligas = new Map(await Promise.all(lista.filter((v) => (v.estado === "pagada" || v.estado === "entregada") && v.clientes).map(async (v) => [v.id, await ligaDocumentos(v.id)] as const)))

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
      <div className="flex items-center gap-3 rounded-2xl border bg-card px-3.5 py-3">
        <div className="flex-1">
          <span className="text-[12px] text-muted-foreground">Por cobrar de comisión</span>
          <span className="block text-[11.5px] text-muted-foreground">Peptique te paga el día que acuerden.</span>
        </div>
        <b className="num text-[20px]">{formatoMoneda(porCobrar)}</b>
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
              {ligas.has(v.id) && (
                <a
                  href={ligaWhatsapp(v.clientes!.whatsapp, `Hola ${v.clientes!.nombre.split(" ")[0]}, aquí puedes ver el certificado de análisis (COA) de tu compra ${v.folio} y tu protocolo: ${ligas.get(v.id)}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-semibold hover:bg-hueso-2"
                >
                  <MessageCircle className="size-4" aria-hidden />
                  Mandar COA
                </a>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              <b className="num text-[14px]">{formatoMoneda(Number(v.total))}</b>
              <Estado tipo={ESTADO[v.estado]?.[1] ?? "neutro"}>{v.estado === "cancelada" && !v.motivo_cancelacion?.startsWith("Sin pago") ? "Cancelada" : (ESTADO[v.estado]?.[0] ?? v.estado)}</Estado>
            </div>
          </li>
        ))}
        {lista.length === 0 && <li className="px-4 py-8 text-center text-[13px] text-muted-foreground">Aún no tienes ventas.</li>}
      </ul>
    </>
  )
}
