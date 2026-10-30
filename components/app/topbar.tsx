import Link from "next/link"
import { Store } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { Perfil } from "@/lib/perfiles"

import { Busqueda } from "./busqueda"
import { MenuMovil } from "./menu-movil"

export function Topbar({ menu }: { menu: { perfil: Perfil; nombre: string; iniciales: string; pendientes?: Record<string, number> } }) {
  const buscador = menu.perfil === "administrador" || menu.perfil === "admin_comercial"
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2.5 border-b bg-background/95 px-4 backdrop-blur md:px-6">
      <MenuMovil {...menu} />
      {buscador ? <Busqueda /> : <div className="flex-1" />}
      <div className="hidden flex-1 sm:block" />
      <Button variant="outline" size="lg" asChild>
        <Link href="/mostrador" aria-label="Abrir mostrador">
          <Store aria-hidden />
          <span className="hidden sm:inline">Abrir mostrador</span>
        </Link>
      </Button>
    </header>
  )
}
