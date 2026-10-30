"use client"

import { usePathname } from "next/navigation"
import { useState } from "react"
import { Menu } from "lucide-react"

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import type { Perfil } from "@/lib/perfiles"

import { Sidebar } from "./sidebar"

/** En celular el menú lateral se abre con este botón (en escritorio siempre está visible). */
export function MenuMovil(props: { perfil: Perfil; nombre: string; iniciales: string; pendientes?: Record<string, number> }) {
  const ruta = usePathname()
  const [abierto, setAbierto] = useState(false)
  const [rutaAbierta, setRutaAbierta] = useState(ruta)
  // Al navegar se cierra solo.
  if (abierto && ruta !== rutaAbierta) {
    setAbierto(false)
    setRutaAbierta(ruta)
  }
  return (
    <>
      <button
        type="button"
        aria-label="Abrir menú"
        onClick={() => {
          setRutaAbierta(ruta)
          setAbierto(true)
        }}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] border bg-card md:hidden"
      >
        <Menu className="size-4" aria-hidden />
      </button>
      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetContent side="left" className="w-72 p-0 data-[side=left]:sm:max-w-72">
          <SheetTitle className="sr-only">Menú</SheetTitle>
          <Sidebar {...props} movil />
        </SheetContent>
      </Sheet>
    </>
  )
}
