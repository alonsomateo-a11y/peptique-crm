import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { Estado } from "@/components/app/estado"
import { PageHeader } from "@/components/app/page-header"
import { formatoFecha } from "@/lib/format"
import { exigirAdmin } from "@/lib/sesion"
import { crearClienteAdmin } from "@/lib/supabase/admin"

import { NOMBRE_COA } from "../../tipos"
import { EditorCoa } from "../editor"

export const metadata: Metadata = { title: "COA protegido" }

export default async function CoaLote({ params }: PageProps<"/inventario/coa/[id]">) {
  await exigirAdmin()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const { data: l } = await crearClienteAdmin()
    .from("lotes")
    .select("id, codigo, lote_origen, llegada, piezas_recibidas, coa_estado, coa_original_path, coa_publico_path, productos(nombre, presentacion)")
    .eq("id", id)
    .maybeSingle()
  if (!l) notFound()
  const producto = l.productos as unknown as { nombre: string; presentacion: string } | null
  const estado = l.coa_estado as keyof typeof NOMBRE_COA

  return (
    <>
      <PageHeader
        ruta={[["Inicio", "/inicio"], ["Inventario", "/inventario"], [l.codigo]]}
        titulo={`COA · ${producto?.nombre ?? ""} ${producto?.presentacion ?? ""}`}
        descripcion={`${l.codigo}${l.lote_origen ? ` · origen ${l.lote_origen}` : ""} · llegó ${formatoFecha(new Date(`${l.llegada}T12:00:00-06:00`))} · ${l.piezas_recibidas} piezas`}
        acciones={<Estado tipo={estado === "listo" ? "ok" : estado === "por_aprobar" ? "warn" : "crit"}>{NOMBRE_COA[estado]}</Estado>}
      />
      <EditorCoa loteId={l.id} tieneOriginal={!!l.coa_original_path} tienePublico={!!l.coa_publico_path} tipoOriginal={l.coa_original_path?.split(".").pop() ?? null} />
    </>
  )
}
