import type { Metadata } from "next"

import { ModuloPendiente } from "@/components/app/modulo-pendiente"

export const metadata: Metadata = { title: "Configuración" }

export default function Page() {
  return <ModuloPendiente titulo="Configuración" descripcion="Equipo y permisos, comisiones y reglas" semana={1} />
}
