import {
  Activity,
  Boxes,
  CreditCard,
  FlaskConical,
  Home,
  LineChart,
  Plus,
  RefreshCw,
  Settings,
  ShoppingBag,
  Store,
  User,
  Users,
  type LucideIcon,
} from "lucide-react"

import type { Perfil } from "@/lib/perfiles"

export type NavItem = {
  href: string
  titulo: string
  icono: LucideIcon
  perfiles: Perfil[]
}

export type NavGrupo = { grupo: string | null; items: NavItem[] }

const ADMIN: Perfil[] = ["administrador"]
const COMERCIAL: Perfil[] = ["administrador", "admin_comercial"]

export const NAV: NavGrupo[] = [
  {
    grupo: null,
    items: [{ href: "/inicio", titulo: "Inicio", icono: Home, perfiles: COMERCIAL }],
  },
  {
    grupo: "Comercial",
    items: [{ href: "/red", titulo: "Red comercial", icono: Users, perfiles: COMERCIAL }],
  },
  {
    grupo: "Operación",
    items: [
      { href: "/vender", titulo: "Vender", icono: Plus, perfiles: ["admin_comercial"] },
      { href: "/ventas", titulo: "Ventas", icono: ShoppingBag, perfiles: COMERCIAL },
      { href: "/pagos", titulo: "Pagos", icono: CreditCard, perfiles: ADMIN },
      { href: "/clientes", titulo: "Clientes", icono: User, perfiles: ADMIN },
      { href: "/recompras", titulo: "Recompras", icono: RefreshCw, perfiles: COMERCIAL },
      { href: "/mostrador", titulo: "Mostrador (vista)", icono: Store, perfiles: ["admin_comercial"] },
    ],
  },
  {
    grupo: "Inventario",
    items: [
      { href: "/inventario", titulo: "Inventario", icono: Boxes, perfiles: ADMIN },
      { href: "/productos", titulo: "Productos", icono: FlaskConical, perfiles: ADMIN },
    ],
  },
  {
    grupo: "Análisis",
    items: [
      { href: "/reportes", titulo: "Reportes", icono: LineChart, perfiles: ADMIN },
      { href: "/actividad", titulo: "Actividad", icono: Activity, perfiles: ADMIN },
    ],
  },
]

export const NAV_PIE: NavItem = {
  href: "/configuracion",
  titulo: "Configuración",
  icono: Settings,
  perfiles: ADMIN,
}

export function navPara(perfil: Perfil): NavGrupo[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => i.perfiles.includes(perfil)) })).filter(
    (g) => g.items.length > 0,
  )
}
