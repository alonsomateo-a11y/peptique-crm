import Link from "next/link"
import { ChevronLeft } from "lucide-react"

import { TabsMostrador } from "./tabs"
import { sesionMostrador } from "./acceso"

export default async function LayoutMostrador({ children }: { children: React.ReactNode }) {
  const sesion = await sesionMostrador()
  const escritorio = sesion.perfil === "administrador" || sesion.perfil === "admin_comercial"
  return (
    <div className="flex min-h-dvh justify-center bg-hueso">
      <div className="flex w-full max-w-md flex-col bg-hueso-2 sm:my-4 sm:min-h-[calc(100dvh-2rem)] sm:rounded-3xl sm:border sm:shadow-sm">
        <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2">
          Saltar al contenido
        </a>
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-hueso-2/95 px-4 py-3 backdrop-blur sm:rounded-t-3xl">
          {escritorio && (
            <Link href="/inicio" aria-label="Regresar al escritorio" className="inline-flex size-9 items-center justify-center rounded-xl border bg-card">
              <ChevronLeft className="size-4" aria-hidden />
            </Link>
          )}
          <div className="flex-1 leading-tight">
            <b className="font-serif text-[17px] font-semibold">Mostrador</b>
            <span className="block text-[12px] text-muted-foreground">{sesion.nombre}</span>
          </div>
          <Link href="/salir" className="text-[12.5px] font-semibold text-muted-foreground hover:text-foreground">
            Salir
          </Link>
          <span className="inline-flex size-9 items-center justify-center rounded-full bg-bruma text-[12px] font-extrabold">{sesion.iniciales}</span>
        </header>
        <main id="contenido" className="flex flex-1 flex-col gap-4 px-4 py-4 pb-28">
          {children}
        </main>
        <TabsMostrador />
      </div>
    </div>
  )
}
