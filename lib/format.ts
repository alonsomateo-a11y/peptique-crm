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
