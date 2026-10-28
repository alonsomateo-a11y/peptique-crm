import type { Metadata } from "next"

import { ModuloPendiente } from "@/components/app/modulo-pendiente"

export const metadata: Metadata = { title: "Vender" }

export default function Page() {
  return <ModuloPendiente titulo="Vender" descripcion="Venta en persona del admin comercial" semana={2} />
}
