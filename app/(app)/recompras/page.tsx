import type { Metadata } from "next"

import { ModuloPendiente } from "@/components/app/modulo-pendiente"

export const metadata: Metadata = { title: "Recompras" }

export default function Page() {
  return <ModuloPendiente titulo="Recompras" descripcion="Aviso interno 2 días antes de que se le acabe a cada cliente" semana={4} />
}
