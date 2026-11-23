import type { Metadata } from "next"
import Link from "next/link"
import { AlertTriangle } from "lucide-react"

import { revisarLiga } from "@/lib/liga-acceso"
import { PERFIL_INFO } from "@/lib/perfiles"

import { ActivarForm } from "./activar-form"

export const metadata: Metadata = { title: "Crea tu acceso", robots: { index: false, follow: false } }

/** Página pública: la persona llega con su liga de primer acceso y crea su PIN. */
export default async function Activar({ params }: PageProps<"/activar/[token]">) {
  const { token } = await params
  const liga = await revisarLiga(token)

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6 py-14">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex size-7 items-center justify-center rounded-lg bg-espresso font-serif text-[15px] font-semibold text-hueso">P</span>
        <b className="font-serif text-[22px] font-semibold">Peptique</b>
      </div>
      {typeof liga === "string" ? (
        <>
          <h1 className="text-[30px] font-medium">{liga === "vencida" ? "Esta liga ya no sirve" : "Liga no válida"}</h1>
          <p role="alert" className="flex items-center gap-2 rounded-xl bg-warn-bg px-3.5 py-2.5 text-sm font-semibold text-warn">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            {liga === "vencida"
              ? "Ya se usó o pasaron más de 72 horas. Pide una nueva al administrador."
              : "Revisa que la copiaste completa o pide una nueva al administrador."}
          </p>
          <Link href="/entrar" className="text-sm font-semibold underline underline-offset-4">
            Ir a entrar
          </Link>
        </>
      ) : (
        <>
          <h1 className="text-[30px] font-medium">Hola, {liga.nombre.split(" ")[0]}</h1>
          <p className="text-muted-foreground">
            Tu perfil es <b className="text-foreground">{PERFIL_INFO[liga.perfil].nombre}</b>.{" "}
            {liga.perfil === "administrador"
              ? "Crea tu correo y contraseña para entrar desde la computadora, y un PIN de 4 números para entrar rápido."
              : "Crea tu PIN de 4 números. Con él entras cada día."}
          </p>
          <ActivarForm token={token} conCorreo={liga.perfil === "administrador"} />
          <p className="text-xs text-muted-foreground">Esta liga es personal y sirve una sola vez. No la compartas.</p>
        </>
      )}
    </main>
  )
}
