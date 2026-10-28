import type { Metadata } from "next"

import { ModuloPendiente } from "@/components/app/modulo-pendiente"

export const metadata: Metadata = { title: "Inventario" }

export default function Page() {
  return <ModuloPendiente titulo="Inventario" descripcion="Un solo inventario con tres bolsas · sale primero lo que llegó antes" semana={4} />
}
