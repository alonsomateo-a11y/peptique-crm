// Renombra productos cargados desde el Excel financiero a los nombres de las etiquetas físicas
// y recalcula su SKU. Sin "aplicar" solo muestra los cambios.
// Uso: npx tsx --env-file=.env.local scripts/renombrar-a-etiquetas.mts [aplicar]
import { createClient } from "@supabase/supabase-js"
import { skuDe } from "../lib/catalogo"

const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })
const aplicar = process.argv[2] === "aplicar"

const CAMBIOS: { nombre: string; presentacion?: string; a: { nombre: string; presentacion?: string } }[] = [
  { nombre: "GLP-2", a: { nombre: "Tirzepatide" } },
  { nombre: "GLP-3", a: { nombre: "Retatrutide" } },
  { nombre: "Wolf Blend", presentacion: "10/10 mg", a: { nombre: "Wolverine Stack", presentacion: "10 mg" } },
  { nombre: "Beauty Blend", presentacion: "50/20 mg", a: { nombre: "Beauty Blend", presentacion: "60 mg" } },
  { nombre: "Glutatión", a: { nombre: "Glutathione" } },
]

let n = 0
for (const c of CAMBIOS) {
  let q = a.from("productos").select("id, nombre, presentacion, sku").eq("nombre", c.nombre)
  if (c.presentacion) q = q.eq("presentacion", c.presentacion)
  const { data } = await q
  for (const p of data ?? []) {
    const nombre = c.a.nombre
    const presentacion = c.a.presentacion ?? p.presentacion
    const sku = skuDe(nombre, presentacion)
    console.log(`${p.nombre} ${p.presentacion} (${p.sku})`.padEnd(36), "→", `${nombre} ${presentacion} (${sku})`)
    if (aplicar) {
      const { error } = await a.from("productos").update({ nombre, presentacion, sku }).eq("id", p.id)
      if (error) console.log("  error:", error.message)
      else n++
    }
  }
}
if (aplicar) await a.from("bitacora").insert({ area: "productos", accion: `renombró ${n} productos según las etiquetas físicas` })
