"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Settings, ShoppingBag, Receipt, Users } from "lucide-react"

import { cn } from "@/lib/utils"

export function TabsRed({ equipo }: { equipo: boolean }) {
  const ruta = usePathname()
  const tabs = [
    { href: "/app", titulo: "Vender", icono: ShoppingBag },
    { href: "/app/ventas", titulo: "Mis ventas", icono: Receipt },
    ...(equipo ? [{ href: "/app/equipo", titulo: "Mi equipo", icono: Users }] : []),
    { href: "/app/ajustes", titulo: "Ajustes", icono: Settings },
  ]
  return (
    <nav aria-label="App" className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-md border-t bg-card/95 px-2 pt-1.5 pb-[max(env(safe-area-inset-bottom),0.5rem)] backdrop-blur sm:bottom-4 sm:rounded-b-3xl sm:border-x">
      {tabs.map((t) => {
        const activo = t.href === "/app" ? ruta === t.href : ruta.startsWith(t.href)
        return (
          <Link key={t.href} href={t.href} aria-current={activo ? "page" : undefined} className={cn("flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11.5px] font-semibold text-muted-foreground", activo && "text-foreground")}>
            <t.icono className={cn("size-[21px]", activo && "text-chart-1")} strokeWidth={activo ? 2.3 : 1.8} aria-hidden />
            {t.titulo}
          </Link>
        )
      })}
    </nav>
  )
}
