import type { Metadata } from "next"

import { ModuloPendiente } from "@/components/app/modulo-pendiente"

export const metadata: Metadata = { title: "Pagos" }

export default function Page() {
  return <ModuloPendiente titulo="Pagos" descripcion="Quién cobró, cómo, dónde y con qué perfil" semana={2} />
}
