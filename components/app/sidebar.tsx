"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSyncExternalStore } from "react"
import { ChevronsLeft, ChevronsRight } from "lucide-react"

import { NAV_PIE, navPara, type NavItem } from "@/lib/nav"
import { PERFIL_INFO, type Perfil } from "@/lib/perfiles"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const CLAVE = "peptique:menu-minimizado"
const EVENTO = "peptique:menu"

function leerMini() {
  try {
    return localStorage.getItem(CLAVE) === "1"
  } catch {
    return false
  }
}

function suscribir(avisar: () => void) {
  window.addEventListener(EVENTO, avisar)
  window.addEventListener("storage", avisar)
  return () => {
    window.removeEventListener(EVENTO, avisar)
    window.removeEventListener("storage", avisar)
  }
}

export function Sidebar({
  perfil,
  nombre,
  iniciales,
  pendientes = {},
}: {
  perfil: Perfil
  nombre: string
  iniciales: string
  /** Contador por ruta, por ejemplo { "/red": 1 } */
  pendientes?: Record<string, number>
}) {
  const ruta = usePathname()
  const mini = useSyncExternalStore(suscribir, leerMini, () => false)

  function alternar() {
    try {
      localStorage.setItem(CLAVE, mini ? "0" : "1")
      window.dispatchEvent(new Event(EVENTO))
    } catch {}
  }

  const grupos = navPara(perfil)
  const pie = NAV_PIE.perfiles.includes(perfil) ? NAV_PIE : null

  return (
    <nav
      aria-label="Menú principal"
      className={cn(
        "sticky top-0 flex h-dvh shrink-0 flex-col gap-0.5 border-r border-sidebar-border bg-sidebar px-3 py-4 transition-[width]",
        mini ? "w-[68px] items-center" : "w-56",
      )}
    >
      <div className={cn("mb-3 flex items-center gap-2.5 px-2", mini && "flex-col px-0")}>
        <span className="inline-flex size-7 items-center justify-center rounded-lg bg-espresso font-serif text-[15px] font-semibold text-hueso">
          P
        </span>
        {!mini && <b className="font-serif text-lg font-semibold">Peptique</b>}
        <button
          type="button"
          onClick={alternar}
          aria-label={mini ? "Expandir menú" : "Minimizar menú"}
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-md border bg-card text-muted-foreground hover:text-foreground",
            !mini && "ml-auto",
          )}
        >
          {mini ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
        </button>
      </div>

      {grupos.map((g) => (
        <div key={g.grupo ?? "inicio"} className="contents">
          {g.grupo && !mini && (
            <div className="px-2.5 pt-3.5 pb-1 text-[10.5px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
              {g.grupo}
            </div>
          )}
          {g.items.map((item) => (
            <Enlace key={item.href} item={item} activo={ruta.startsWith(item.href)} mini={mini} cuenta={pendientes[item.href]} />
          ))}
        </div>
      ))}

      <div className="flex-1" />
      {pie && <Enlace item={pie} activo={ruta.startsWith(pie.href)} mini={mini} />}
      <div className={cn("mt-2 flex items-center gap-2.5 border-t pt-3", mini ? "justify-center" : "px-2")}>
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-bruma text-[11px] font-extrabold">
          {iniciales}
        </span>
        {!mini && (
          <span className="flex flex-col leading-tight">
            <b className="text-[12.5px]">{nombre}</b>
            <span className="text-[11.5px] text-muted-foreground">{PERFIL_INFO[perfil].nombre}</span>
          </span>
        )}
      </div>
    </nav>
  )
}

function Enlace({ item, activo, mini, cuenta }: { item: NavItem; activo: boolean; mini: boolean; cuenta?: number }) {
  const Icono = item.icono
  const enlace = (
    <Link
      href={item.href}
      aria-current={activo ? "page" : undefined}
      aria-label={mini ? item.titulo : undefined}
      className={cn(
        "relative flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium text-sidebar-foreground hover:bg-sidebar-accent/70",
        activo && "bg-sidebar-accent font-bold text-sidebar-accent-foreground shadow-[0_1px_2px_rgb(43_38_34/0.08),inset_0_0_0_1px_var(--border)]",
        mini && "size-10 justify-center px-0",
      )}
    >
      <Icono className="size-[17px] shrink-0 opacity-85" aria-hidden />
      {!mini && item.titulo}
      {!!cuenta && (
        <span
          className={cn(
            "rounded-full bg-crit-bg px-1.5 text-[10.5px] leading-[18px] font-bold text-crit",
            mini ? "absolute -top-0.5 -right-0.5" : "ml-auto",
          )}
        >
          {cuenta}
        </span>
      )}
    </Link>
  )
  if (!mini) return enlace
  return (
    <Tooltip>
      <TooltipTrigger asChild>{enlace}</TooltipTrigger>
      <TooltipContent side="right">{item.titulo}</TooltipContent>
    </Tooltip>
  )
}
