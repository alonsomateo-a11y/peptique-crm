import "server-only"

import { crearClienteAdmin } from "@/lib/supabase/admin"

export type EstadoAviso = "por_avisar" | "contactado" | "recompro" | "sin_recompra" | "no_contactar"

export type Aviso = {
  id: string
  estado: EstadoAviso
  seLeAcaba: string
  dias: number
  siguienteEtapa: number | null
  clienteId: string
  cliente: string
  whatsapp: string
  aceptaWhatsapp: boolean
  producto: string
  vendedor: string | null
  contactadoPor: string | null
  contactadoEn: string | null
}

const hoyMty = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey" }).format(new Date())
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)

/**
 * Avisos de recompra. Al cargar, los que ya pasaron su fecha sin recompra se marcan "sin recompra"
 * (la regla es: al terminarse el producto). Se lee con la llave secreta porque el admin comercial
 * no tiene acceso directo a la tabla; solo salen datos del cliente y del producto.
 */
export async function cargarAvisos() {
  const admin = crearClienteAdmin()
  const hoy = hoyMty()
  await admin.from("avisos_recompra").update({ estado: "sin_recompra" }).lt("se_le_acaba", hoy).in("estado", ["por_avisar", "contactado"])

  const [avisos, conf] = await Promise.all([
    admin
      .from("avisos_recompra")
      .select("id, estado, se_le_acaba, siguiente_etapa, contactado_en, clientes(id, nombre, whatsapp, acepta_whatsapp), productos(nombre, presentacion), ventas(personas:vendedor_id(nombre)), personas:contactado_por(nombre)")
      .order("se_le_acaba"),
    admin.from("configuracion").select("valor").eq("clave", "reglas").maybeSingle(),
  ])
  const diasAviso = Number((conf.data?.valor as { aviso_recompra_dias?: number } | undefined)?.aviso_recompra_dias) || 2

  type F = {
    id: string
    estado: EstadoAviso
    se_le_acaba: string
    siguiente_etapa: number | null
    contactado_en: string | null
    clientes: { id: string; nombre: string; whatsapp: string; acepta_whatsapp: boolean } | null
    productos: { nombre: string; presentacion: string } | null
    ventas: { personas: { nombre: string } | null } | null
    personas: { nombre: string } | null
  }
  const lista: Aviso[] = ((avisos.data ?? []) as unknown as F[]).map((a) => ({
    id: a.id,
    estado: a.estado,
    seLeAcaba: a.se_le_acaba,
    dias: diasEntre(hoy, a.se_le_acaba),
    siguienteEtapa: a.siguiente_etapa,
    clienteId: a.clientes?.id ?? "",
    cliente: a.clientes?.nombre ?? "—",
    whatsapp: a.clientes?.whatsapp ?? "",
    aceptaWhatsapp: a.clientes?.acepta_whatsapp ?? false,
    producto: a.productos ? `${a.productos.nombre} ${a.productos.presentacion}` : "—",
    vendedor: a.ventas?.personas?.nombre ?? null,
    contactadoPor: a.personas?.nombre ?? null,
    contactadoEn: a.contactado_en,
  }))
  return { avisos: lista, diasAviso, hoy }
}
