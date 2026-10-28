import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { CorreoForm } from "./correo-form"

export const metadata: Metadata = { title: "Entrar con correo" }

export default function EntrarCorreo() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6 py-14">
      <Link href="/entrar" className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Entrar con PIN
      </Link>
      <h1 className="text-[30px] font-medium">Administrador</h1>
      <p className="text-muted-foreground">Acceso con correo y contraseña. Los demás perfiles entran con su PIN.</p>
      <CorreoForm />
    </main>
  )
}
