import type { Metadata } from "next"

import { ModuloPendiente } from "@/components/app/modulo-pendiente"

export const metadata: Metadata = { title: "Mostrador" }

export default function Page() {
  return <ModuloPendiente titulo="Mostrador" descripcion="App de mostrador: caja o en persona, waiver, dosis y corte" semana={2} />
}
