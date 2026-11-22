/** WhatsApp a 10 dígitos (México). Acepta "+52 81 1234 5678", "521...", "(81) 1234-5678" y el prefijo viejo 044/045. */
export function normalizarWhatsapp(v: string) {
  let d = v.replace(/\D/g, "")
  if (d.length === 13 && d.startsWith("521")) d = d.slice(3)
  if (d.length === 13 && /^04[45]/.test(d)) d = d.slice(3)
  if (d.length === 12 && d.startsWith("52")) d = d.slice(2)
  return d
}

/**
 * 10 dígitos que no sean de relleno ("0000000000", "1111111111", "1234567890").
 * "0000000000" además es el cliente interno de ventas sin cliente.
 */
export const whatsappValido = (d: string) => /^\d{10}$/.test(d) && !/^(\d)\1{9}$/.test(d) && d !== "1234567890" && d !== "0123456789"

/** "8174246595" → "81 7424 6595". */
export const formatoWhatsapp = (d: string) => (d.length === 10 ? `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}` : d)

/** Liga de wa.me con mensaje opcional. */
export const ligaWhatsapp = (d: string, texto?: string) => `https://wa.me/52${d}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`
