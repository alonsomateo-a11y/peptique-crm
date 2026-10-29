import type { Metadata } from "next"
import Link from "next/link"

import { formatoMoneda } from "@/lib/format"
import { crearClienteAdmin } from "@/lib/supabase/admin"

import { sesionMostrador } from "../../acceso"
import { CerrarCaja } from "./cerrar-caja"

export const metadata: Metadata = { title: "Corte de caja" }

const METODOS = [
  ["efectivo", "Efectivo"],
  ["tarjeta", "Tarjeta"],
  ["transferencia", "Transferencia"],
] as const

export default async function Corte() {
  await sesionMostrador()
  const admin = crearClienteAdmin()
  const { data: caja } = await admin.from("cortes_caja").select("id, fondo, abierta_en").is("cerrada_en", null).order("abierta_en", { ascending: false }).limit(1).maybeSingle()

  if (!caja) {
    return (
      <>
        <h1 className="text-[22px] font-medium">Corte de caja</h1>
        <p className="rounded-2xl border bg-card px-4 py-8 text-center text-[13px] text-muted-foreground">
          La caja está cerrada.{" "}
          <Link href="/mostrador" className="font-semibold text-chart-1 underline-offset-4 hover:underline">
            Ábrela para vender en caja
          </Link>
          .
        </p>
      </>
    )
  }

  const { data: pagos } = await admin.from("pagos").select("monto, metodo").eq("lugar", "caja").gte("creado_en", caja.abierta_en)
  const resumen = METODOS.map(([m, t]) => {
    const suyos = (pagos ?? []).filter((p) => p.metodo === m)
    return { m, t, n: suyos.length, total: suyos.reduce((s, p) => s + Number(p.monto), 0) }
  })
  const efectivo = resumen[0].total
  const fondo = Number(caja.fondo)

  return (
    <>
      <h1 className="text-[22px] font-medium">Corte de caja</h1>
      <ul className="flex flex-col divide-y rounded-2xl border bg-card">
        {resumen.map((r) => (
          <li key={r.m} className="flex items-center gap-3 px-3.5 py-3">
            <b className="flex-1 text-[14px]">{r.t}</b>
            <span className="text-[12px] text-muted-foreground">{r.n === 1 ? "1 cobro" : `${r.n} cobros`}</span>
            <b className="num w-24 text-right">{formatoMoneda(r.total)}</b>
          </li>
        ))}
      </ul>
      <p className="text-[12px] text-muted-foreground">Las ventas en persona no entran al corte.</p>
      <b className="text-[15px]">Cuenta el efectivo</b>
      <ul className="flex flex-col divide-y rounded-2xl border bg-card">
        {[
          ["Fondo", fondo],
          ["+ Efectivo", efectivo],
          ["Debe haber", fondo + efectivo],
        ].map(([t, v], i) => (
          <li key={t as string} className="flex items-center px-3.5 py-3">
            <span className={i === 2 ? "flex-1 font-bold" : "flex-1 text-[14px] text-muted-foreground"}>{t}</span>
            <b className="num">{formatoMoneda(v as number)}</b>
          </li>
        ))}
      </ul>
      <CerrarCaja cajaId={caja.id} esperado={fondo + efectivo} />
    </>
  )
}
