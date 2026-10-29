import type { Metadata } from "next"

import { Estado } from "@/components/app/estado"
import { formatoMoneda } from "@/lib/format"
import { crearClienteAdmin } from "@/lib/supabase/admin"
import { hoyMty } from "@/lib/ventas"

import { sesionMostrador } from "../../acceso"

export const metadata: Metadata = { title: "Ventas de hoy" }

const METODO: Record<string, string> = { efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia" }
const hora = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Monterrey" })

export default async function Hoy() {
  await sesionMostrador()
  const inicio = new Date(`${hoyMty()}T00:00:00-06:00`).toISOString()
  const { data } = await crearClienteAdmin()
    .from("pagos")
    .select("id, monto, metodo, lugar, numero_dosis, creado_en, ventas(folio, estado, clientes(nombre), venta_partidas(cantidad, productos(nombre, presentacion))), personas:cobro_persona_id(nombre)")
    .gte("creado_en", inicio)
    .order("creado_en", { ascending: false })

  type Fila = {
    id: string
    monto: number
    metodo: string
    lugar: string
    numero_dosis: number | null
    creado_en: string
    personas: { nombre: string } | null
    ventas: { folio: string; estado: string; clientes: { nombre: string } | null; venta_partidas: { cantidad: number; productos: { nombre: string; presentacion: string } | null }[] } | null
  }
  const filas = (data ?? []) as unknown as Fila[]
  const porMetodo = Object.keys(METODO).map((m) => ({ m, total: filas.filter((f) => f.metodo === m).reduce((s, f) => s + Number(f.monto), 0) }))
  const total = porMetodo.reduce((s, x) => s + x.total, 0)

  return (
    <>
      <h1 className="text-[22px] font-medium">Hoy</h1>
      <section aria-label="Totales del día" className="grid grid-cols-3 gap-2">
        {porMetodo.map((x) => (
          <div key={x.m} className="rounded-2xl border bg-card px-3 py-2.5">
            <span className="text-[11.5px] font-semibold text-muted-foreground">{METODO[x.m]}</span>
            <b className="num block text-[17px]">{formatoMoneda(x.total)}</b>
          </div>
        ))}
      </section>
      <p className="text-[12.5px] text-muted-foreground">
        {filas.length === 1 ? "1 cobro" : `${filas.length} cobros`} · {formatoMoneda(total)} en total
      </p>
      <ul className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
        {filas.map((f) => (
          <li key={f.id} className="flex items-start gap-3 px-3.5 py-3">
            <div className="flex-1">
              <b className="text-[14px]">{f.ventas?.clientes?.nombre ?? "Cliente"}</b>
              <span className="block text-[12px] text-muted-foreground">
                {f.ventas?.folio} · {hora.format(new Date(f.creado_en))} · {f.personas?.nombre}
              </span>
              <span className="block text-[12px]">
                {f.ventas?.venta_partidas.map((p) => `${p.cantidad > 1 ? `${p.cantidad} × ` : ""}${p.productos?.nombre} ${p.productos?.presentacion}`).join(", ")}
                {f.numero_dosis && ` · dosis ${f.numero_dosis}`}
              </span>
            </div>
            <div className="flex flex-col items-end gap-1">
              <b className="num">{formatoMoneda(Number(f.monto))}</b>
              <Estado tipo={f.lugar === "en_persona" && f.metodo === "efectivo" ? "warn" : "neutro"}>{f.lugar === "en_persona" ? `${METODO[f.metodo]} · en persona` : METODO[f.metodo]}</Estado>
            </div>
          </li>
        ))}
        {filas.length === 0 && <li className="px-4 py-8 text-center text-[13px] text-muted-foreground">Aún no hay ventas hoy.</li>}
      </ul>
    </>
  )
}
