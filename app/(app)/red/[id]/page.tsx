import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { Estado } from "@/components/app/estado"
import { KpiCard } from "@/components/app/kpi-card"
import { PageHeader } from "@/components/app/page-header"
import { formatoCuando, formatoFecha, formatoMoneda } from "@/lib/format"
import { crearClienteAdmin } from "@/lib/supabase/admin"
import { formatoWhatsapp } from "@/lib/telefono"

import { sesionRedEscritorio } from "../acceso"
import { cargarRed } from "../datos"
import { AccionesPersona } from "./acciones"

export const metadata: Metadata = { title: "Persona de la red" }

export default async function PersonaRed({ params }: PageProps<"/red/[id]">) {
  const s = await sesionRedEscritorio()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const red = await cargarRed(s.personaId)
  const p = red.find((x) => x.id === id)
  if (!p) notFound()

  const admin = crearClienteAdmin()
  const [bitacora, clientes, comisiones, conf] = await Promise.all([
    admin.from("bitacora").select("id, creado_en, accion, persona_id").or(`persona_id.eq.${id},entidad_id.eq.${id}`).order("creado_en", { ascending: false }).limit(60),
    admin.from("clientes").select("id", { count: "exact", head: true }).eq("vendedor_id", id),
    admin.from("comisiones").select("tipo, monto, pagada_en").eq("persona_id", id).is("pagada_en", null),
    admin.from("configuracion").select("valor").eq("clave", "comisiones").maybeSingle(),
  ])
  const pct = (conf.data?.valor ?? { directa: 13, equipo: 3 }) as { directa: number; equipo: number }
  const equipo = red.filter((x) => x.distribuidor_id === id)
  const distribuidor = red.find((x) => x.id === p.distribuidor_id)
  const pendiente = (comisiones.data ?? []).reduce((t, c) => t + Number(c.monto), 0)
  const quien = new Map(red.map((x) => [x.id, x.nombre]))

  return (
    <>
      <PageHeader
        ruta={[["Inicio", "/inicio"], ["Red comercial", "/red"], [p.nombre]]}
        titulo={p.nombre}
        descripcion={`${p.perfil === "distribuidor" ? "Distribuidor" : `Comisionista${distribuidor ? ` de ${distribuidor.nombre}` : ""}`}${p.zona ? ` · ${p.zona}` : ""} · ${formatoWhatsapp(p.whatsapp)} · alta ${formatoFecha(new Date(p.creado_en))}`}
        acciones={<AccionesPersona persona={p} esAdmin={s.perfil === "administrador"} equipo={equipo.filter((e) => e.estado !== "baja").length} distribuidores={red.filter((x) => x.perfil === "distribuidor" && x.estado === "activo")} />}
      />
      <div className="flex items-center gap-2">
        {p.estado === "baja" ? <Estado tipo="neutro">Baja</Estado> : p.estado === "por_aprobar" ? <Estado tipo="warn">Por aprobar</Estado> : <Estado tipo="ok">Activo</Estado>}
        {p.estado === "baja" && p.motivo_estado && <span className="text-[12.5px] text-muted-foreground">{p.motivo_estado}</span>}
      </div>

      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard etiqueta="Vendido · mes" valor={formatoMoneda(p.vendidoMes)} contexto={p.ventasMes === 1 ? "1 venta pagada" : `${p.ventasMes} ventas pagadas`} />
        <KpiCard etiqueta="Comisión del mes" valor={formatoMoneda(p.comisionMes)} contexto={`por pagar en total: ${formatoMoneda(pendiente)}`} />
        <KpiCard etiqueta="Clientes" valor={String(clientes.count ?? 0)} contexto="asignados a esta persona" />
        <KpiCard etiqueta="Pagos en camino" valor={String(p.esperando)} contexto="apartados esperando pago" />
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <section aria-labelledby="titulo-bitacora" className="flex flex-col gap-2 rounded-2xl border bg-card p-5">
          <h2 id="titulo-bitacora" className="text-lg font-medium">
            Bitácora
          </h2>
          <ol className="divide-y">
            {(bitacora.data ?? []).map((b) => (
              <li key={b.id} className="flex items-start gap-3 py-2.5 text-[13.5px]">
                <p className="flex-1">
                  <b className="font-semibold">{b.persona_id ? (quien.get(b.persona_id) ?? "Equipo Peptique") : "Sistema"}</b> {b.accion}
                </p>
                <time dateTime={b.creado_en} className="shrink-0 text-[12px] text-muted-foreground">
                  {formatoCuando(new Date(b.creado_en))}
                </time>
              </li>
            ))}
            {!bitacora.data?.length && <li className="py-6 text-center text-sm text-muted-foreground">Sin actividad todavía.</li>}
          </ol>
        </section>
        <div className="flex flex-col gap-4">
          <section aria-labelledby="titulo-ajustes" className="flex flex-col gap-2.5 rounded-2xl border bg-card p-5 text-[13.5px]">
            <h2 id="titulo-ajustes" className="text-lg font-medium">
              Ajustes
            </h2>
            {[
              ["Ventas directas", `${pct.directa}%`],
              ...(p.perfil === "distribuidor" ? [["Ventas de su equipo", `${pct.equipo}%`]] : []),
              ["Cobra con", "Transferencia y terminal"],
              ["Entrega", "Con pago reflejado"],
              ["Protocolos", "No los ve"],
            ].map(([a, b]) => (
              <div key={a} className="flex">
                <span className="flex-1 text-muted-foreground">{a}</span>
                <b>{b}</b>
              </div>
            ))}
            <span className="text-[11.5px] text-muted-foreground">Comisiones fijas · se cambian en Configuración</span>
          </section>
          {p.perfil === "distribuidor" && (
            <section aria-labelledby="titulo-equipo" className="flex flex-col gap-2 rounded-2xl border bg-card p-5">
              <h2 id="titulo-equipo" className="text-lg font-medium">
                Su equipo
              </h2>
              {equipo.map((e) => (
                <Link key={e.id} href={`/red/${e.id}`} className="flex items-center gap-2 text-[13.5px] hover:underline">
                  <b className="flex-1 font-semibold">{e.nombre}</b>
                  {e.estado === "por_aprobar" ? <Estado tipo="warn">Por aprobar</Estado> : e.estado === "baja" ? <Estado tipo="neutro">Baja</Estado> : <span className="num">{formatoMoneda(e.vendidoMes)}</span>}
                </Link>
              ))}
              {!equipo.length && <span className="text-[13px] text-muted-foreground">Aún no tiene comisionistas.</span>}
            </section>
          )}
        </div>
      </div>
    </>
  )
}
