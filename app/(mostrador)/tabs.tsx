"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Calculator, CalendarDays, Droplet, ShoppingBag } from "lucide-react"

import { cn } from "@/lib/utils"

const TABS = [
  { href: "/mostrador", titulo: "Vender", icono: ShoppingBag },
  { href: "/mostrador/hoy", titulo: "Hoy", icono: CalendarDays },
  { href: "/mostrador/dosis", titulo: "Dosis", icono: Droplet },
  { href: "/mostrador/corte", titulo: "Corte", icono: Calculator },
]

export function TabsMostrador() {
  const ruta = usePathname()
  return (
    <nav aria-label="Mostrador" className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-md border-t bg-card/95 px-2 pt-1.5 pb-[max(env(safe-area-inset-bottom),0.5rem)] backdrop-blur sm:bottom-4 sm:rounded-b-3xl sm:border-x">
      {TABS.map((t) => {
        const activo = t.href === "/mostrador" ? ruta === t.href : ruta.startsWith(t.href)
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={activo ? "page" : undefined}
            className={cn("flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11.5px] font-semibold text-muted-foreground", activo && "text-foreground")}
          >
            <t.icono className={cn("size-[21px]", activo && "text-chart-1")} strokeWidth={activo ? 2.3 : 1.8} aria-hidden />
            {t.titulo}
          </Link>
        )
      })}
    </nav>
  )
}
