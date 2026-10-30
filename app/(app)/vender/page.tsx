import type { Metadata } from "next"

import { PageHeader } from "@/components/app/page-header"

import { cargarMostrador } from "../../(mostrador)/mostrador/datos"
import { FlujoVenta } from "../../(mostrador)/mostrador/flujo-venta"
import { sesionVender } from "./acceso"
import { PestanasVender } from "./pestanas"

export const metadata: Metadata = { title: "Vender" }

export default async function Vender({ searchParams }: PageProps<"/vender">) {
  await sesionVender()
  const { cliente } = await searchParams
  const datos = await cargarMostrador()
  return (
    <>
      <PageHeader ruta={[["Inicio", "/inicio"], ["Vender"]]} titulo="Vender" descripcion="Venta en persona · el efectivo queda “por entregar” a tu nombre hasta que lo entregues en el mostrador" />
      <PestanasVender actual="vender" />
      <div className="flex w-full max-w-xl flex-col gap-4 [--barra-abajo-sm:0px] [--barra-abajo:0px]">
        <FlujoVenta {...datos} caja={null} clienteInicial={typeof cliente === "string" ? cliente : null} soloEnPersona />
      </div>
    </>
  )
}
