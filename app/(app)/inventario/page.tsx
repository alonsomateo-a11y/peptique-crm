import type { Metadata } from "next"

import { PageHeader } from "@/components/app/page-header"
import { exigirAdmin } from "@/lib/sesion"

import { cargarInventario } from "./datos"
import { InventarioVista } from "./inventario-vista"

export const metadata: Metadata = { title: "Inventario" }

const uno = (v: string | string[] | undefined) => (typeof v === "string" ? v.slice(0, 80) : undefined)

export default async function Inventario({ searchParams }: PageProps<"/inventario">) {
  await exigirAdmin()
  const sp = await searchParams
  const inicial = { vista: uno(sp.vista), piezas: uno(sp.piezas), coa: uno(sp.coa), producto: uno(sp.producto), q: uno(sp.q) }
  const { lotes, productos, tipoCambio } = await cargarInventario()
  const piezas = productos.reduce((s, p) => s + p.existencia, 0)
  const conPiezas = lotes.filter((l) => l.existencia > 0).length
  return (
    <>
      <PageHeader
        ruta={[["Inicio", "/inicio"], ["Inventario"]]}
        titulo="Inventario"
        descripcion={`${piezas === 1 ? "1 pieza" : `${piezas.toLocaleString("es-MX")} piezas`} en ${conPiezas === 1 ? "1 lote" : `${conPiezas} lotes`} · sin caducidad: se sigue cuándo llegó, cuándo se vendió y cuánto dejó`}
      />
      <InventarioVista key={JSON.stringify(inicial)} lotes={lotes} productos={productos} tipoCambio={tipoCambio} inicial={inicial} />
    </>
  )
}
