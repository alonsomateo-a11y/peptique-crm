import type { Metadata } from "next"

import { ModuloPendiente } from "@/components/app/modulo-pendiente"

export const metadata: Metadata = { title: "Red comercial" }

export default function Page() {
  return <ModuloPendiente titulo="Red comercial" descripcion="Distribuidores y comisionistas, cada uno con su bitácora" semana={3} />
}
