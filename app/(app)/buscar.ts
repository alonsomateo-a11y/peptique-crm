"use server"

import { obtenerSesion } from "@/lib/sesion"
import { crearClienteAdmin } from "@/lib/supabase/admin"
import { formatoWhatsapp } from "@/lib/telefono"

export type Resultado = { grupo: string; titulo: string; detalle: string; href: string }

/**
 * Búsqueda global (⌘K). Solo administrador y admin comercial, y a cada uno le regresa
 * únicamente lo que puede abrir: el admin comercial no recibe lotes ni productos con costos.
 */
export async function buscarGlobal(q: string): Promise<Resultado[]> {
  const s = await obtenerSesion()
  if (s.perfil !== "administrador" && s.perfil !== "admin_comercial") return []
  const texto = q.trim().replace(/[%_,()*]/g, "")
  if (texto.length < 2) return []
  const admin = crearClienteAdmin()
  const esAdmin = s.perfil === "administrador"
  const digitos = texto.replace(/\D/g, "")

  const [clientes, ventas, lotes, productos, personas] = await Promise.all([
    admin
      .from("clientes")
      .select("id, nombre, whatsapp")
      .or(digitos.length >= 3 ? `nombre.ilike.%${texto}%,whatsapp.ilike.%${digitos}%` : `nombre.ilike.%${texto}%`)
      .limit(5),
    admin.from("ventas").select("folio, total, clientes(nombre)").ilike("folio", `%${texto}%`).limit(5),
    esAdmin ? admin.from("lotes").select("id, codigo, lote_origen, productos(nombre, presentacion)").or(`codigo.ilike.%${texto}%,lote_origen.ilike.%${texto}%`).limit(5) : Promise.resolve({ data: [] }),
    esAdmin ? admin.from("productos").select("nombre, presentacion, sku").or(`nombre.ilike.%${texto}%,sku.ilike.%${texto}%`).limit(5) : Promise.resolve({ data: [] }),
    admin.from("personas").select("id, nombre, perfil").in("perfil", ["distribuidor", "comisionista"]).ilike("nombre", `%${texto}%`).limit(5),
  ])

  const r: Resultado[] = []
  for (const c of clientes.data ?? []) r.push({ grupo: "Clientes", titulo: c.nombre, detalle: formatoWhatsapp(c.whatsapp), href: esAdmin ? `/clientes/${c.id}` : `/ventas?q=${encodeURIComponent(c.nombre)}` })
  for (const v of ventas.data ?? [])
    r.push({ grupo: "Ventas", titulo: v.folio, detalle: `${(v.clientes as unknown as { nombre: string } | null)?.nombre ?? ""} · ${Number(v.total).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 })}`, href: `/ventas/${encodeURIComponent(v.folio)}` })
  for (const p of personas.data ?? []) r.push({ grupo: "Red comercial", titulo: p.nombre, detalle: p.perfil === "distribuidor" ? "Distribuidor" : "Comisionista", href: `/red/${p.id}` })
  for (const l of (lotes.data ?? []) as unknown as { id: string; codigo: string; lote_origen: string | null; productos: { nombre: string; presentacion: string } | null }[])
    r.push({ grupo: "Lotes", titulo: l.codigo, detalle: `${l.productos?.nombre ?? ""} ${l.productos?.presentacion ?? ""}${l.lote_origen ? ` · origen ${l.lote_origen}` : ""}`, href: `/inventario/coa/${l.id}` })
  for (const p of (productos.data ?? []) as { nombre: string; presentacion: string; sku: string | null }[])
    r.push({ grupo: "Productos", titulo: `${p.nombre} ${p.presentacion}`, detalle: p.sku ?? "", href: `/productos` })
  return r
}
