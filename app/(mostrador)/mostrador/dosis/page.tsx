import type { Metadata } from "next"

import { crearClienteAdmin } from "@/lib/supabase/admin"

import { sesionMostrador } from "../../acceso"
import { PlanesDosis, type Plan } from "./planes"

export const metadata: Metadata = { title: "Planes por dosis" }

export default async function Dosis() {
  await sesionMostrador()
  const { data } = await crearClienteAdmin()
    .from("ventas")
    .select("id, folio, total, estado, creado_en, clientes(nombre, whatsapp), venta_partidas(productos(nombre, presentacion, pagos_por_dosis)), pagos(numero_dosis, estado), dosis_aplicadas(numero)")
    .eq("forma_pago", "por_dosis")
    .in("estado", ["por_cobrar", "pagada", "entregada"])
    .order("creado_en", { ascending: false })

  type Fila = {
    id: string
    folio: string
    total: number
    clientes: { nombre: string; whatsapp: string } | null
    venta_partidas: { productos: { nombre: string; presentacion: string; pagos_por_dosis: number } | null }[]
    pagos: { numero_dosis: number | null; estado: string }[]
    dosis_aplicadas: { numero: number }[]
  }
  const planes: Plan[] = ((data ?? []) as unknown as Fila[])
    .map((v) => {
      const p = v.venta_partidas[0]?.productos
      const de = p?.pagos_por_dosis ?? 4
      return {
        ventaId: v.id,
        folio: v.folio,
        cliente: v.clientes?.nombre ?? "Cliente",
        producto: p ? `${p.nombre} ${p.presentacion}` : "",
        de,
        cuota: Math.ceil(Number(v.total) / de),
        pagadas: v.pagos.filter((x) => x.numero_dosis && x.estado !== "devolucion").length,
        aplicadas: v.dosis_aplicadas.map((x) => x.numero),
      }
    })
    .filter((p) => p.aplicadas.length < p.de)

  return (
    <>
      <h1 className="text-[22px] font-medium">Planes por dosis</h1>
      <PlanesDosis planes={planes} />
      <p className="text-[12px] text-muted-foreground">No se aplica una dosis que no está pagada.</p>
    </>
  )
}
