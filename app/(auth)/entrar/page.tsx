import type { Metadata } from "next"
import { Check } from "lucide-react"

import { EntrarForm } from "./entrar-form"

export const metadata: Metadata = { title: "Entrar" }

export default function Entrar() {
  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-[520px] flex-col gap-4 bg-espresso p-14 text-hueso lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex size-7 items-center justify-center rounded-lg bg-hueso font-serif text-[15px] font-semibold text-espresso">
            P
          </span>
          <b className="font-serif text-[22px] font-semibold">Peptique</b>
        </div>
        <div className="flex-1" />
        <h1 className="text-[44px] leading-tight font-medium">El negocio, en un solo lugar.</h1>
        <p className="max-w-sm opacity-75">Mostrador, ventas, red comercial, inventario y reportes. Cada persona ve solo lo que le toca.</p>
        <p className="flex items-center gap-2 text-xs opacity-60">
          <Check className="size-3.5" aria-hidden />
          Sesión con PIN · se cierra sola al terminar el turno
        </p>
      </aside>
      <main className="flex flex-1 flex-col gap-3 px-6 py-14 sm:px-16">
        <h1 className="text-[30px] font-medium">¿Con qué perfil entras?</h1>
        <p className="mb-1.5 text-muted-foreground">Después te pedimos tu PIN de 4 números.</p>
        <EntrarForm />
      </main>
    </div>
  )
}
