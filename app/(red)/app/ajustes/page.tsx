import type { Metadata } from "next"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { crearClienteAdmin } from "@/lib/supabase/admin"
import { formatoWhatsapp } from "@/lib/telefono"

import { sesionRed } from "../../acceso"
import { CambiarPin } from "./cambiar-pin"

export const metadata: Metadata = { title: "Ajustes" }

export default async function AjustesRed() {
  const s = await sesionRed()
  const { data: conf } = await crearClienteAdmin().from("configuracion").select("valor").eq("clave", "comisiones").maybeSingle()
  const pct = (conf?.valor ?? { directa: 13, equipo: 3 }) as { directa: number; equipo: number }
  const filas: [string, string][] = [
    ["Nombre", s.nombre],
    ["WhatsApp", formatoWhatsapp(s.whatsapp)],
    ["Zona", s.zona ?? "—"],
    ...(s.perfil === "comisionista" ? [["Distribuidor", s.distribuidor ?? "—"] as [string, string]] : []),
    ["Comisión", s.perfil === "distribuidor" ? `${pct.directa}% directa · ${pct.equipo}% de tu equipo` : `${pct.directa}% · fija`],
    ["Cómo cobras", "Transferencia o terminal"],
  ]
  return (
    <>
      <h1 className="text-[22px] font-medium">Ajustes</h1>
      <dl className="flex flex-col divide-y rounded-2xl border bg-card">
        {filas.map(([a, b]) => (
          <div key={a} className="flex items-center gap-3 px-3.5 py-3 text-[14px]">
            <dt className="flex-1 text-muted-foreground">{a}</dt>
            <dd className="font-semibold">{b}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[12px] text-muted-foreground">Sin efectivo. Te entregamos el producto cuando el pago se refleja. Para cambiar tus datos, habla con Peptique.</p>
      <div className="grid grid-cols-2 gap-2.5">
        <CambiarPin />
        <Button variant="outline" size="lg" className="h-12" asChild>
          <Link href="/salir">Cerrar sesión</Link>
        </Button>
      </div>
    </>
  )
}
