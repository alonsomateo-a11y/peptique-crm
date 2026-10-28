import type { Metadata } from "next"

import { ModuloPendiente } from "@/components/app/modulo-pendiente"

export const metadata: Metadata = { title: "Reportes" }

export default function Page() {
  return <ModuloPendiente titulo="Reportes" descripcion="Plan, ventas contra plan, márgenes y estado de resultados" semana={4} />
}
