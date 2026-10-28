import type { Metadata } from "next"

import { ModuloPendiente } from "@/components/app/modulo-pendiente"

export const metadata: Metadata = { title: "Clientes" }

export default function Page() {
  return <ModuloPendiente titulo="Clientes" descripcion="Base de clientes con etiquetas, ficha e historial" semana={2} />
}
