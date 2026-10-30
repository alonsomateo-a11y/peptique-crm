import type { Metadata } from "next"

import { crearClienteAdmin } from "@/lib/supabase/admin"

import { cargarMostrador } from "../../(mostrador)/mostrador/datos"
import { FlujoVenta } from "../../(mostrador)/mostrador/flujo-venta"
import { sesionRed } from "../acceso"

export const metadata: Metadata = { title: "Vender" }

export default async function VenderRed({ searchParams }: PageProps<"/app">) {
  const s = await sesionRed()
  const { cliente } = await searchParams
  const admin = crearClienteAdmin()
  const [datos, suyos, conf] = await Promise.all([
    cargarMostrador(),
    admin.from("clientes").select("id, nombre, whatsapp, tipo, waiver_firmado_en").eq("vendedor_id", s.personaId).order("creado_en", { ascending: false }).limit(6),
    admin.from("configuracion").select("valor").eq("clave", "datos_pago").maybeSingle(),
  ])
  return (
    <FlujoVenta
      {...datos}
      caja={null}
      recientes={(suyos.data ?? []).map((c) => ({ id: c.id, nombre: c.nombre, whatsapp: c.whatsapp, tipo: c.tipo, waiver: !!c.waiver_firmado_en, planDosis: false }))}
      clienteInicial={typeof cliente === "string" ? cliente : null}
      red
      datosPago={(conf.data?.valor as { texto?: string } | undefined)?.texto ?? null}
    />
  )
}
