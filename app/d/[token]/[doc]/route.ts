import { NextResponse } from "next/server"

import { leerToken } from "@/lib/documentos"
import { crearClienteAdmin } from "@/lib/supabase/admin"

/** Abre un documento de la compra con una liga de Storage que dura 2 minutos. Solo COA público y protocolo. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; doc: string }> }) {
  const { token, doc } = await params
  const t = leerToken(token)
  const m = doc.match(/^(coa|protocolo)-([0-9a-f-]{36})$/)
  if (!t || !m) return new NextResponse("Liga no válida o vencida.", { status: 404 })
  const admin = crearClienteAdmin()
  const { data: partidas } = await admin.from("venta_partidas").select("producto_id, lote_id, etapa_protocolo, ventas!inner(estado)").eq("venta_id", t.ventaId).neq("ventas.estado", "cancelada")

  let bucket = ""
  let ruta: string | null = null
  if (m[1] === "coa") {
    if (!partidas?.some((p) => p.lote_id === m[2])) return new NextResponse("No encontrado.", { status: 404 })
    const { data: l } = await admin.from("lotes").select("coa_estado, coa_publico_path").eq("id", m[2]).single()
    bucket = "coas"
    ruta = l?.coa_estado === "listo" ? l.coa_publico_path : null
  } else {
    const p = partidas?.find((x) => x.producto_id === m[2])
    if (!p) return new NextResponse("No encontrado.", { status: 404 })
    const { data: prot } = await admin.from("protocolos").select("pdf_path").eq("producto_id", m[2]).eq("etapa", p.etapa_protocolo ?? 1).maybeSingle()
    bucket = "protocolos"
    ruta = prot?.pdf_path ?? null
  }
  if (!ruta) return new NextResponse("Documento en preparación.", { status: 404 })
  const { data } = await admin.storage.from(bucket).createSignedUrl(ruta, 120)
  if (!data) return new NextResponse("No se pudo abrir el documento.", { status: 500 })
  return NextResponse.redirect(data.signedUrl)
}
