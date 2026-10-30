const moneda = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
})

const monedaCentavos = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
})

const compacto = new Intl.NumberFormat("es-MX", {
  notation: "compact",
  maximumFractionDigits: 1,
})

const fechaCorta = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" })

export const formatoMoneda = (n: number) => moneda.format(n)
export const formatoMonedaCentavos = (n: number) => monedaCentavos.format(n)
export const formatoCompacto = (n: number) => compacto.format(n)
export const formatoFecha = (d: Date) => fechaCorta.format(d).replace(".", "")
export const formatoPorcentaje = (n: number) => `${Math.round(n * 100)}%`

const hora = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Monterrey" })
const diaSemana = new Intl.DateTimeFormat("es-MX", { weekday: "short", timeZone: "America/Monterrey" })
const fechaMty = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "America/Monterrey" })
const clave = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey" })

/** "hoy 12:40", "ayer 18:02", "sáb 13:10" (última semana) o "2 oct". */
export function formatoCuando(d: Date, ahora = new Date()) {
  const dias = Math.round((Date.parse(clave.format(ahora)) - Date.parse(clave.format(d))) / 86_400_000)
  if (dias === 0) return `hoy ${hora.format(d)}`
  if (dias === 1) return `ayer ${hora.format(d)}`
  if (dias < 7) return `${diaSemana.format(d).replace(".", "")} ${hora.format(d)}`
  return fechaMty.format(d).replace(".", "")
}

const diaClave = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey" })
/** "2026-10-31" en hora de Monterrey: así se agrupa por día y por mes en todo el CRM. */
export const diaMty = (iso: string | Date) => diaClave.format(typeof iso === "string" ? new Date(iso) : iso)

const mesLargo = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" })
/** "2026-10" → "octubre de 2026". */
export const nombreDeMes = (mes: string) => mesLargo.format(new Date(`${mes}-15T00:00:00Z`))
