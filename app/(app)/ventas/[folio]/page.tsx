import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { Estado } from "@/components/app/estado"
import { PageHeader } from "@/components/app/page-header"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatoMoneda } from "@/lib/format"
import { ligaDocumentos } from "@/lib/documentos"
import { exigirAdmin } from "@/lib/sesion"
import { crearClienteServidor } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

import { NOMBRE_CANAL, NOMBRE_ESTADO, TIPO_ESTADO, type CanalVenta, type EstadoVenta } from "../tipos"
import { AccionesVenta } from "./acciones"

export const metadata: Metadata = { title: "Venta" }

const fecha = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Monterrey" })
const METODO: Record<string, string> = { efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia" }
const LUGAR: Record<string, string> = { caja: "Caja", en_persona: "En persona", red: "Red", banco: "Banco" }
const ESTADO_PAGO: Record<string, [string, "ok" | "warn" | "crit" | "neutro"]> = {
  en_caja: ["En caja", "neutro"],
  por_entregar: ["Por entregar", "warn"],
  por_conciliar: ["Por conciliar", "warn"],
  conciliado: ["Conciliado", "ok"],
  en_camino: ["En camino", "warn"],
  reflejado: ["Reflejado", "ok"],
  devolucion: ["Devolución pendiente", "crit"],
}

export default async function DetalleVenta({ params }: PageProps<"/ventas/[folio]">) {
  await exigirAdmin()
  const folio = decodeURIComponent((await params).folio)
  const supabase = await crearClienteServidor()
  const { data } = await supabase
    .from("ventas")
    .select(
      "id, folio, canal, estado, forma_pago, total, nota, motivo_cancelacion, creado_en, clientes(id, nombre, whatsapp, tipo), personas:vendedor_id(nombre), venta_partidas(id, cantidad, precio_unitario, etapa_protocolo, productos(nombre, presentacion, pagos_por_dosis), lotes(codigo)), pagos(id, monto, metodo, lugar, estado, referencia, numero_dosis, creado_en, personas:cobro_persona_id(nombre)), dosis_aplicadas(numero)",
    )
    .eq("folio", folio)
    .maybeSingle()
  if (!data) notFound()

  type Venta = {
    id: string
    folio: string
    canal: CanalVenta
    estado: EstadoVenta
    forma_pago: string
    total: number
    nota: string | null
    motivo_cancelacion: string | null
    creado_en: string
    clientes: { id: string; nombre: string; whatsapp: string; tipo: string } | null
    personas: { nombre: string } | null
    venta_partidas: { id: string; cantidad: number; precio_unitario: number; etapa_protocolo: number | null; productos: { nombre: string; presentacion: string; pagos_por_dosis: number } | null; lotes: { codigo: string } | null }[]
    pagos: { id: string; monto: number; metodo: string; lugar: string; estado: string; referencia: string | null; numero_dosis: number | null; creado_en: string; personas: { nombre: string } | null }[]
    dosis_aplicadas: { numero: number }[]
  }
  const v = data as unknown as Venta
  const pagos = [...v.pagos].sort((a, b) => a.creado_en.localeCompare(b.creado_en))
  const pagado = pagos.filter((p) => p.estado !== "devolucion").reduce((s, p) => s + Number(p.monto), 0)
  const saldo = v.estado === "cancelada" ? 0 : Math.max(Math.round((Number(v.total) - pagado) * 100) / 100, 0)
  const porDosis = v.forma_pago === "por_dosis"
  const de = v.venta_partidas[0]?.productos?.pagos_por_dosis ?? 4
  const pagadas = pagos.filter((p) => p.numero_dosis && p.estado !== "devolucion").length
  const aplicadas = v.dosis_aplicadas.map((d) => d.numero)

  return (
    <>
      <PageHeader
        ruta={[["Inicio", "/inicio"], ["Ventas", "/ventas"], [v.folio]]}
        titulo={`Venta ${v.folio}`}
        descripcion={`${NOMBRE_CANAL[v.canal]} · ${fecha.format(new Date(v.creado_en))} · registró ${v.personas?.nombre ?? "—"}`}
        acciones={
          <AccionesVenta
            venta={{ id: v.id, folio: v.folio, estado: v.estado, porDosis, saldo, total: Number(v.total), pagado, de, pagadas, aplicadas, canal: v.canal }}
            cliente={v.clientes ? { nombre: v.clientes.nombre, whatsapp: v.clientes.whatsapp } : null}
            lotes={v.venta_partidas.map((p) => p.lotes?.codigo).filter((x): x is string => !!x)}
            ligaDocumentos={v.estado === "cancelada" || v.estado === "esperando_pago" ? null : await ligaDocumentos(v.id)}
          />
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Estado tipo={TIPO_ESTADO[v.estado]}>{porDosis && v.estado === "por_cobrar" ? `Por dosis · ${pagadas} de ${de}` : NOMBRE_ESTADO[v.estado]}</Estado>
        {v.clientes && (
          <Link href={`/clientes/${v.clientes.id}`} className="text-[13px] font-semibold hover:underline">
            {v.clientes.nombre}
          </Link>
        )}
        {v.nota && <span className="text-[12.5px] text-muted-foreground">· {v.nota}</span>}
      </div>
      {v.estado === "cancelada" && v.motivo_cancelacion && <p className="rounded-xl bg-crit-bg px-3.5 py-2.5 text-[13px] text-crit">Cancelada: {v.motivo_cancelacion}</p>}

      {porDosis && (
        <section aria-label="Avance del plan por dosis" className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-2">
            <h2 className="flex-1 text-lg font-medium">
              Van {pagadas} de {de} pagos{pagadas > aplicadas.length ? `; falta aplicar la dosis ${aplicadas.length + 1}` : ""}
            </h2>
            <b className="num">
              {formatoMoneda(pagado)} de {formatoMoneda(Number(v.total))}
            </b>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: de }, (_, i) => i + 1).map((n) => {
              const estado = aplicadas.includes(n) ? "Pagada y aplicada" : n <= pagadas ? "Pagada · por aplicar" : "Pendiente de pago"
              return (
                <div key={n} className={cn("rounded-xl border px-3 py-2", aplicadas.includes(n) ? "bg-ok-bg" : n <= pagadas ? "border-2 border-[#e8c77d]" : "bg-card")}>
                  <b className="text-[13px]">Dosis {n}</b>
                  <span className={cn("block text-[11.5px] font-semibold", aplicadas.includes(n) ? "text-ok" : n <= pagadas ? "text-warn" : "text-muted-foreground")}>{estado}</span>
                </div>
              )
            })}
          </div>
          <span className="text-[11.5px] text-muted-foreground">No se aplica una dosis que no está pagada.</span>
        </section>
      )}

      <div className="overflow-hidden rounded-2xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-hueso-2 hover:bg-hueso-2">
              <TableHead>Producto</TableHead>
              <TableHead>Lote</TableHead>
              <TableHead>Protocolo</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead className="text-right">Importe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {v.venta_partidas.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-semibold">
                  {p.productos?.nombre} {p.productos?.presentacion}
                </TableCell>
                <TableCell className="font-mono text-[12px]">{p.lotes?.codigo ?? "—"}</TableCell>
                <TableCell>{p.etapa_protocolo ? <Estado tipo={p.etapa_protocolo > 1 ? "ok" : "neutro"}>{`Etapa ${p.etapa_protocolo}${p.etapa_protocolo > 1 ? " · recompra" : ""}`}</Estado> : "—"}</TableCell>
                <TableCell className="num text-right">{p.cantidad}</TableCell>
                <TableCell className="num text-right">{formatoMoneda(Number(p.precio_unitario))}</TableCell>
                <TableCell className="num text-right font-semibold">{formatoMoneda(Number(p.precio_unitario) * p.cantidad)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={5} className="text-right text-[13px] text-muted-foreground">
                Total · pagado {formatoMoneda(pagado)}
                {saldo > 0 && <b className="text-crit"> · saldo {formatoMoneda(saldo)}</b>}
              </TableCell>
              <TableCell className="num text-right text-[15px] font-bold">{formatoMoneda(Number(v.total))}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <section aria-labelledby="titulo-pagos" className="flex flex-col gap-2">
        <h2 id="titulo-pagos" className="text-lg font-medium">
          Pagos
        </h2>
        {pagos.length === 0 ? (
          <p className="rounded-2xl border bg-card px-4 py-6 text-center text-[13px] text-muted-foreground">Sin pagos todavía.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-hueso-2 hover:bg-hueso-2">
                  <TableHead>Cuándo</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Dónde</TableHead>
                  <TableHead>Cobró</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-[13px] whitespace-nowrap">
                      {fecha.format(new Date(p.creado_en))}
                      {p.numero_dosis && <span className="block text-[11.5px] text-muted-foreground">dosis {p.numero_dosis}</span>}
                    </TableCell>
                    <TableCell className="text-[13px]">{METODO[p.metodo] ?? p.metodo}</TableCell>
                    <TableCell className="text-[13px]">{LUGAR[p.lugar] ?? p.lugar}</TableCell>
                    <TableCell className="text-[13px]">{p.personas?.nombre ?? "—"}</TableCell>
                    <TableCell className="font-mono text-[12px]">{p.referencia ?? "—"}</TableCell>
                    <TableCell className="num text-right font-semibold">{formatoMoneda(Number(p.monto))}</TableCell>
                    <TableCell>
                      <Estado tipo={ESTADO_PAGO[p.estado]?.[1] ?? "neutro"}>{ESTADO_PAGO[p.estado]?.[0] ?? p.estado}</Estado>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </>
  )
}
