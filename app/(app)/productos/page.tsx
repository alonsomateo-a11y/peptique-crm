import type { Metadata } from "next"

import { ModuloPendiente } from "@/components/app/modulo-pendiente"

export const metadata: Metadata = { title: "Productos" }

export default function Page() {
  return <ModuloPendiente titulo="Productos" descripcion="Precios, protocolos por etapa y margen por lote" semana={1} />
}
