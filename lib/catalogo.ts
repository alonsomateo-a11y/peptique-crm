// Familias y SKU del catálogo. Las familias siguen las áreas de peptique.com.mx
// y los nombres siguen las etiquetas físicas (fuente de verdad del catálogo).

export const FAMILIAS = ["Cognitiva", "Composición corporal", "Energía", "Piel", "Sexual", "Tejido", "Insumos"] as const

export const FAMILIA_POR_ASIGNAR = "Por asignar"

/** Nombre comercial → familia (área de la web). */
const FAMILIA_DE: [RegExp, (typeof FAMILIAS)[number]][] = [
  [/^(selank|semax)\b/i, "Cognitiva"],
  [/^(glp|tirzepatid|retatrutid|tesamorelin|semaglutid)/i, "Composición corporal"],
  [/^(epitalon|mots-c|nad\+|ss-31)/i, "Energía"],
  [/^(ghk-cu|ahk-cu|beauty blend|glow|klow|glutat)/i, "Piel"],
  [/^(pt-141|kisspeptin)/i, "Sexual"],
  [/^(bpc-157|tb-500|kpv|wolf|wolverine)/i, "Tejido"],
  [/^agua bacteriost/i, "Insumos"],
]

export const familiaDe = (nombre: string) => FAMILIA_DE.find(([re]) => re.test(nombre.trim()))?.[1] ?? FAMILIA_POR_ASIGNAR

/** Códigos cortos donde el nombre completo sería muy largo. */
const CODIGOS: [RegExp, string][] = [
  [/^agua bacteriost/i, "BAC"],
  [/^glutat/i, "GLUT"],
  [/^beauty blend/i, "BEAUTY"],
  [/^wolf/i, "WOLF"],
  [/^wolverine/i, "WOLV"],
  [/^tirzepatid/i, "TIRZ"],
  [/^tesamorelin/i, "TESA"],
  [/^retatrutid/i, "RETA"],
  [/^kisspeptin/i, "KISS"],
]

const limpiar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")

/**
 * SKU = CÓDIGO-DOSIS, en mayúsculas y sin símbolos.
 * GHK-Cu 100 mg → GHKCU-100 · NAD+ 500 mg → NAD-500 · Beauty Blend 50/20 mg → BEAUTY-5020 · GHK-Cu Raw → GHKCURAW
 */
export function skuDe(nombre: string, presentacion: string) {
  const codigo = CODIGOS.find(([re]) => re.test(nombre.trim()))?.[1] ?? limpiar(nombre)
  const dosis = limpiar(presentacion.replace(/\s*(mg|ml|mcg)\s*$/i, ""))
  return dosis && dosis !== "UNICA" ? `${codigo}-${dosis}` : codigo
}
