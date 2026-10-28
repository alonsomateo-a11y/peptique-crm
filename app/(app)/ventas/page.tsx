import type { Metadata } from "next"

import { ModuloPendiente } from "@/components/app/modulo-pendiente"

export const metadata: Metadata = { title: "Ventas" }

export default function Page() {
  return <ModuloPendiente titulo="Ventas" descripcion="Todas las ventas con filtros, detalle, etiquetas, cancelación y descarga" semana={2} />
}
