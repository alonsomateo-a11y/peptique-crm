import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { Estado } from "@/components/app/estado"
import { formatoMoneda } from "@/lib/format"
import { crearClienteAdmin } from "@/lib/supabase/admin"

import { sesionRed } from "../../acceso"
import { AgregarComisionista } from "./agregar"

export const metadata: Metadata = { title: "Mi equipo" }

export default async function MiEquipo() {
  const s = await sesionRed()
  if (s.perfil !== "distribuidor") redirect("/app")
  const admin = crearClienteAdmin()
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey" }).format(new Date())
  const mes = new Date(`${hoy.slice(0, 7)}-01T00:00:00-06:00`).toISOString()
  const { data: equipo } = await admin.from("personas").select("id, nombre, zona, estado").eq("distribuidor_id", s.personaId).neq("estado", "baja").order("nombre")
  const ids = (equipo ?? []).map((e) => e.id)
  const { data: ventas } = ids.length ? await admin.from("ventas").select("vendedor_id, total").eq("canal", "red").in("estado", ["pagada", "entregada"]).gte("creado_en", mes).in("vendedor_id", ids) : { data: [] }

  return (
    <>
      <div className="flex items-center">
        <h1 className="flex-1 text-[22px] font-medium">Mi equipo</h1>
        <AgregarComisionista />
      </div>
      <ul className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
        {(equipo ?? []).map((e) => {
          const suyas = (ventas ?? []).filter((v) => v.vendedor_id === e.id)
          return (
            <li key={e.id} className="flex items-center gap-3 px-3.5 py-3">
              <div className="flex-1">
                <b className="text-[14px]">{e.nombre}</b>
                <span className="block text-[12px] text-muted-foreground">
                  {e.zona ?? "Sin zona"}
                  {e.estado === "activo" && ` · ${suyas.length === 1 ? "1 venta" : `${suyas.length} ventas`} este mes`}
                </span>
              </div>
              {e.estado === "por_aprobar" ? <Estado tipo="warn">Por aprobar</Estado> : <b className="num">{formatoMoneda(suyas.reduce((t, v) => t + Number(v.total), 0))}</b>}
            </li>
          )
        })}
        {!equipo?.length && <li className="px-4 py-8 text-center text-[13px] text-muted-foreground">Aún no tienes comisionistas.</li>}
      </ul>
      <p className="rounded-2xl border bg-card px-3.5 py-3 text-[12.5px] text-muted-foreground">Cada comisionista queda bajo tu perfil. Recibes 3% de sus ventas pagadas. El administrador aprueba cada alta.</p>
    </>
  )
}
