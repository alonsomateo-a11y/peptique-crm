import type { Metadata } from "next"

import { cargarMostrador } from "./datos"
import { FlujoVenta } from "./flujo-venta"

export const metadata: Metadata = { title: "Mostrador" }

export default async function Mostrador({ searchParams }: PageProps<"/mostrador">) {
  const { cliente } = await searchParams
  const datos = await cargarMostrador()
  return <FlujoVenta {...datos} clienteInicial={typeof cliente === "string" ? cliente : null} />
}
