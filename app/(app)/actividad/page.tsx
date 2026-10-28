import type { Metadata } from "next"

import { ModuloPendiente } from "@/components/app/modulo-pendiente"

export const metadata: Metadata = { title: "Actividad" }

export default function Page() {
  return <ModuloPendiente titulo="Actividad" descripcion="Todo lo que pasa en el mostrador, la red y el inventario" semana={1} />
}
