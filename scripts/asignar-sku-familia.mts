// Asigna SKU y familia a los productos que no los tienen. Sin "aplicar" solo muestra la vista previa.
// Uso: npx tsx --env-file=.env.local scripts/asignar-sku-familia.mts [aplicar]
import { createClient } from "@supabase/supabase-js"
import { familiaDe, skuDe } from "../lib/catalogo"
const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })
const aplicar = process.argv[2] === "aplicar"
const { data } = await a.from("productos").select("id,nombre,presentacion,sku,familia").order("nombre")
const skus = new Set<string>()
for (const p of data!) {
  const sku = p.sku ?? skuDe(p.nombre, p.presentacion)
  const familia = p.familia === "Por asignar" ? familiaDe(p.nombre) : p.familia
  console.log((p.nombre + " " + p.presentacion).padEnd(30), sku.padEnd(14), familia, skus.has(sku) ? "  ← DUPLICADO" : "")
  skus.add(sku)
  if (aplicar) { const { error } = await a.from("productos").update({ sku, familia }).eq("id", p.id); if (error) console.log("  error", error.message) }
}
if (aplicar) await a.from("bitacora").insert({ area: "productos", accion: `asignó SKU y familia a ${data!.length} productos` })
