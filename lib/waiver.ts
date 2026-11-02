import type { SupabaseClient } from "@supabase/supabase-js"

/** Texto provisional mientras llega el texto revisado por el abogado de Peptique. */
export const TEXTO_WAIVER_BASE =
  "Declaro que soy mayor de edad, que los productos que adquiero son para uso exclusivo de investigación y no para consumo humano, y que recibí el certificado de análisis (COA) del lote."

export type ConfigWaiver = { pedir: boolean; texto: string }

/** Si se pide el waiver en la primera compra y con qué texto. Sin configuración: se pide, con el texto base. */
export async function leerWaiver(supabase: SupabaseClient): Promise<ConfigWaiver> {
  const { data } = await supabase.from("configuracion").select("valor").eq("clave", "waiver").maybeSingle()
  const v = (data?.valor ?? {}) as { pedir?: boolean; texto?: string }
  return { pedir: v.pedir !== false, texto: v.texto?.trim() || TEXTO_WAIVER_BASE }
}
