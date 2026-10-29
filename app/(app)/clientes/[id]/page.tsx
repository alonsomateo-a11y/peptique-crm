import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { MessageCircle, Store } from "lucide-react"

import { Estado } from "@/components/app/estado"
import { KpiCard } from "@/components/app/kpi-card"
import { PageHeader } from "@/components/app/page-header"
import { Button } from "@/components/ui/button"
import { formatoFecha, formatoMoneda } from "@/lib/format"
import { exigirAdmin } from "@/lib/sesion"
import { crearClienteServidor } from "@/lib/supabase/server"
import { formatoWhatsapp, ligaWhatsapp } from "@/lib/telefono"
import { cn } from "@/lib/utils"

import { iniciales, NOMBRE_TIPO } from "../tipos"
import { ActividadCliente, type Evento } from "./actividad-cliente"
import { EditarCliente } from "./editar-cliente"

export const metadata: Metadata = { title: "Ficha de cliente" }

const CANAL: Record<string, string> = { mostrador_caja: "en caja", en_persona: "en persona", red: "por la red", pedido: "por pedido" }
const METODO: Record<string, string> = { efectivo: "efectivo", tarjeta: "tarjeta", transferencia: "transferencia" }
const uuid = /^[0-9a-f-]{36}$/

export default async function FichaCliente({ params }: PageProps<"/clientes/[id]">) {
  await exigirAdmin()
  const { id } = await params
  if (!uuid.test(id)) notFound()
  const supabase = await crearClienteServidor()

  const { data: c } = await supabase.from("clientes").select("*").eq("id", id).maybeSingle()
  if (!c) notFound()

  const [ventas, avisos, notas, personas, todos] = await Promise.all([
    supabase
      .from("ventas")
      .select("id, folio, canal, estado, total, creado_en, vendedor_id, venta_partidas(cantidad, productos(nombre, presentacion)), pagos(id, monto, metodo, estado, numero_dosis, creado_en, cobro_persona_id)")
      .eq("cliente_id", id)
      .order("creado_en"),
    supabase.from("avisos_recompra").select("id, se_le_acaba, siguiente_etapa, estado, productos(nombre, presentacion)").eq("cliente_id", id),
    supabase.from("bitacora").select("id, creado_en, accion, persona_id").eq("entidad", "cliente").eq("entidad_id", id),
    supabase.from("personas").select("id, nombre"),
    supabase.from("clientes").select("id, nombre, whatsapp"),
  ])
  const quien = new Map((personas.data ?? []).map((p) => [p.id, p.nombre]))

  type Partida = { cantidad: number; productos: { nombre: string; presentacion: string } | null }
  type Pago = { id: string; monto: number; metodo: string; estado: string; numero_dosis: number | null; creado_en: string; cobro_persona_id: string }
  const lista = (ventas.data ?? []) as unknown as {
    id: string
    folio: string
    canal: string
    estado: string
    total: number
    creado_en: string
    vendedor_id: string
    venta_partidas: Partida[]
    pagos: Pago[]
  }[]
  const validas = lista.filter((v) => v.estado !== "cancelada")
  const total = validas.reduce((s, v) => s + Number(v.total), 0)
  const pagado = validas.flatMap((v) => v.pagos).filter((p) => p.estado !== "devolucion").reduce((s, p) => s + Number(p.monto), 0)
  const saldo = Math.max(total - pagado, 0)
  const ultima = validas.at(-1)
  const acumulado = validas.reduce<number[]>((a, v) => [...a, (a.at(-1) ?? 0) + Number(v.total)], [])
  const producto = (p: Partida) => (p.productos ? `${p.productos.nombre} ${p.productos.presentacion}` : "producto")

  type Aviso = { id: string; se_le_acaba: string; siguiente_etapa: number | null; estado: string; productos: { nombre: string; presentacion: string } | null }
  const listaAvisos = (avisos.data ?? []) as unknown as Aviso[]
  const proxima = listaAvisos.filter((a) => a.estado === "por_avisar" || a.estado === "contactado").sort((a, b) => a.se_le_acaba.localeCompare(b.se_le_acaba))[0]

  const eventos: Evento[] = [
    ...lista.map((v) => ({
      id: `v-${v.id}`,
      tipo: "ventas" as const,
      cuando: v.creado_en,
      quien: quien.get(v.vendedor_id) ?? null,
      texto: `${v.estado === "cancelada" ? "venta cancelada" : "vendió"} ${v.folio} ${CANAL[v.canal] ?? ""} · ${v.venta_partidas.map((p) => `${p.cantidad > 1 ? `${p.cantidad} × ` : ""}${producto(p)}`).join(", ")} · ${formatoMoneda(Number(v.total))}`,
    })),
    ...lista.flatMap((v) =>
      v.pagos.map((p) => ({
        id: `p-${p.id}`,
        tipo: "pagos" as const,
        cuando: p.creado_en,
        quien: quien.get(p.cobro_persona_id) ?? null,
        texto: `cobró ${formatoMoneda(Number(p.monto))} de ${v.folio}${p.numero_dosis ? ` (dosis ${p.numero_dosis})` : ""} · ${METODO[p.metodo] ?? p.metodo}`,
      })),
    ),
    ...(notas.data ?? []).map((n) => ({
      id: `b-${n.id}`,
      tipo: n.accion.startsWith("nota:") ? ("notas" as const) : ("otros" as const),
      cuando: n.creado_en,
      quien: n.persona_id ? (quien.get(n.persona_id) ?? null) : null,
      texto: n.accion,
    })),
    ...listaAvisos.map((a) => ({
      id: `a-${a.id}`,
      tipo: "avisos" as const,
      cuando: `${a.se_le_acaba}T12:00:00-06:00`,
      quien: null,
      texto: `aviso de recompra: ${a.productos ? `${a.productos.nombre} ${a.productos.presentacion}` : "producto"} se termina el ${formatoFecha(new Date(`${a.se_le_acaba}T12:00:00-06:00`))}${a.siguiente_etapa ? ` · etapa ${a.siguiente_etapa}` : ""}`,
    })),
    ...(c.waiver_firmado_en ? [{ id: "waiver", tipo: "otros" as const, cuando: c.waiver_firmado_en, quien: null, texto: "firmó el waiver" }] : []),
  ].sort((a, b) => b.cuando.localeCompare(a.cuando))

  return (
    <>
      <PageHeader
        ruta={[["Inicio", "/inicio"], ["Clientes", "/clientes"], [c.nombre]]}
        titulo={c.nombre}
        descripcion={
          <span className="flex flex-wrap items-center gap-1.5">
            <span>{formatoWhatsapp(c.whatsapp)}</span>
            {c.correo && <span>· {c.correo}</span>}
            {c.origen && <span>· llegó por {c.origen}</span>}
          </span>
        }
        acciones={
          <div className="flex gap-2">
            <Button variant="outline" size="lg" asChild>
              <a href={ligaWhatsapp(c.whatsapp)} target="_blank" rel="noopener noreferrer">
                <MessageCircle aria-hidden />
                WhatsApp
              </a>
            </Button>
            <EditarCliente cliente={{ ...c, waiver: !!c.waiver_firmado_en, vendedor: null, compras: validas.length, total, ultimaCompra: ultima?.creado_en ?? null }} clientes={todos.data ?? []} vendedores={(personas.data ?? []).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))} />
            <Button size="lg" asChild>
              <Link href={`/mostrador?cliente=${c.id}`}>
                <Store aria-hidden />
                Vender
              </Link>
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex size-9 items-center justify-center rounded-full bg-bruma text-[12px] font-extrabold">{iniciales(c.nombre)}</span>
        <span className="rounded-full bg-hueso px-2.5 py-0.5 text-[12px] font-semibold text-[#5c544c]">{NOMBRE_TIPO[c.tipo as keyof typeof NOMBRE_TIPO]}</span>
        {c.waiver_firmado_en ? <Estado tipo="ok">Waiver firmado</Estado> : <Estado tipo="warn">Waiver pendiente</Estado>}
        {(c.etiquetas as string[]).map((e) => (
          <span key={e} className={cn("rounded-full px-2.5 py-0.5 text-[12px] font-semibold", e === "VIP" ? "bg-espresso text-hueso" : "bg-hueso text-[#5c544c]")}>
            {e}
          </span>
        ))}
        {c.vendedor_id && <span className="text-[12.5px] text-muted-foreground">· Vendedor: {quien.get(c.vendedor_id)}</span>}
      </div>

      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard etiqueta="Total comprado" valor={formatoMoneda(total)} contexto={validas.length === 1 ? "1 compra" : `${validas.length} compras`} tendencia={acumulado.length > 1 ? acumulado : undefined} />
        <KpiCard
          etiqueta="Última compra"
          valor={ultima ? formatoFecha(new Date(ultima.creado_en)) : "—"}
          contexto={ultima?.venta_partidas[0] ? producto(ultima.venta_partidas[0]) : "Aún no compra"}
        />
        <KpiCard
          etiqueta="Próxima recompra"
          valor={proxima ? formatoFecha(new Date(`${proxima.se_le_acaba}T12:00:00-06:00`)) : "—"}
          contexto={proxima ? `${proxima.productos?.nombre ?? ""}${proxima.siguiente_etapa ? ` · etapa ${proxima.siguiente_etapa}` : ""}` : "Sin aviso pendiente"}
        />
        <KpiCard etiqueta="Saldo" valor={formatoMoneda(saldo)} contexto={saldo > 0 ? "Por cobrar" : "Al corriente"} />
      </section>

      <ActividadCliente clienteId={c.id} eventos={eventos} />
    </>
  )
}
