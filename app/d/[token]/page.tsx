import type { Metadata } from "next"
import { FileText, ShieldCheck } from "lucide-react"

import { leerToken } from "@/lib/documentos"
import { crearClienteAdmin } from "@/lib/supabase/admin"

export const metadata: Metadata = { title: { absolute: "Tus documentos · Peptique" }, robots: { index: false, follow: false } }

type Doc = { id: string; titulo: string; detalle: string; listo: boolean }

/** Página pública (con liga firmada) con el COA público y el protocolo de cada producto de la compra. */
export default async function Documentos({ params }: PageProps<"/d/[token]">) {
  const { token } = await params
  const t = leerToken(token)
  const docs: Doc[] = []
  let folio = ""
  if (t) {
    const admin = crearClienteAdmin()
    const { data: v } = await admin
      .from("ventas")
      .select("folio, estado, venta_partidas(producto_id, etapa_protocolo, productos(nombre, presentacion), lotes(id, codigo, coa_estado, coa_publico_path))")
      .eq("id", t.ventaId)
      .maybeSingle()
    if (v && v.estado !== "cancelada") {
      folio = v.folio
      type P = { producto_id: string; etapa_protocolo: number | null; productos: { nombre: string; presentacion: string } | null; lotes: { id: string; codigo: string; coa_estado: string; coa_publico_path: string | null } | null }
      const partidas = v.venta_partidas as unknown as P[]
      const { data: protocolos } = await admin.from("protocolos").select("producto_id, etapa, pdf_path").in("producto_id", partidas.map((p) => p.producto_id))
      const vistos = new Set<string>()
      for (const p of partidas) {
        const nombre = p.productos ? `${p.productos.nombre} ${p.productos.presentacion}` : "Producto"
        if (p.lotes && !vistos.has(`l${p.lotes.id}`)) {
          vistos.add(`l${p.lotes.id}`)
          docs.push({ id: `coa-${p.lotes.id}`, titulo: `Certificado de análisis · ${nombre}`, detalle: `Lote ${p.lotes.codigo}`, listo: p.lotes.coa_estado === "listo" && !!p.lotes.coa_publico_path })
        }
        const prot = protocolos?.find((x) => x.producto_id === p.producto_id && x.etapa === (p.etapa_protocolo ?? 1))
        if (prot?.pdf_path && !vistos.has(`p${p.producto_id}`)) {
          vistos.add(`p${p.producto_id}`)
          docs.push({ id: `protocolo-${p.producto_id}`, titulo: `Protocolo · ${nombre}`, detalle: `Etapa ${p.etapa_protocolo ?? 1}`, listo: true })
        }
      }
    }
  }

  return (
    <div className="flex min-h-dvh justify-center bg-hueso px-4 py-10">
      <main className="flex w-full max-w-md flex-col gap-4">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex size-8 items-center justify-center rounded-lg bg-espresso font-serif text-[16px] font-semibold text-hueso">P</span>
          <b className="font-serif text-[22px] font-semibold">Peptique</b>
        </div>
        {!t || !folio ? (
          <section className="rounded-2xl border bg-card p-6">
            <h1 className="text-xl font-medium">Esta liga ya no está disponible</h1>
            <p className="mt-2 text-sm text-muted-foreground">Las ligas de documentos vencen a los 30 días. Escríbenos por WhatsApp y te mandamos una nueva.</p>
          </section>
        ) : (
          <>
            <div>
              <h1 className="text-[26px] leading-tight font-medium">Tus documentos</h1>
              <p className="mt-1 text-[13px] text-muted-foreground">Compra {folio} · liga válida hasta el {new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", timeZone: "America/Monterrey" }).format(t.vence)}</p>
            </div>
            <ul className="flex flex-col gap-2.5">
              {docs.map((d) => (
                <li key={d.id}>
                  {d.listo ? (
                    <a href={`/d/${token}/${d.id}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3.5 hover:border-espresso focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none">
                      <FileText className="size-5 shrink-0 text-chart-1" aria-hidden />
                      <span className="flex-1">
                        <b className="text-[14.5px]">{d.titulo}</b>
                        <span className="block text-[12px] text-muted-foreground">{d.detalle} · PDF</span>
                      </span>
                    </a>
                  ) : (
                    <div className="flex items-center gap-3 rounded-2xl border border-dashed bg-card px-4 py-3.5 text-muted-foreground">
                      <FileText className="size-5 shrink-0" aria-hidden />
                      <span className="flex-1">
                        <b className="text-[14.5px] text-foreground">{d.titulo}</b>
                        <span className="block text-[12px]">{d.detalle} · en preparación, vuelve a abrir esta liga más tarde</span>
                      </span>
                    </div>
                  )}
                </li>
              ))}
              {!docs.length && <li className="rounded-2xl border bg-card px-4 py-6 text-center text-sm text-muted-foreground">Aún no hay documentos para esta compra.</li>}
            </ul>
            <p className="flex items-start gap-2 text-[12px] text-muted-foreground">
              <ShieldCheck className="mt-px size-4 shrink-0" aria-hidden />
              Research use only · no apto para consumo humano ni animal. No constituye recomendación de uso.
            </p>
          </>
        )}
      </main>
    </div>
  )
}
