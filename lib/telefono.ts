/** WhatsApp a 10 dígitos (México). Acepta "+52 81 1234 5678", "521...", "(81) 1234-5678". */
export function normalizarWhatsapp(v: string) {
  let d = v.replace(/\D/g, "")
  if (d.length === 13 && d.startsWith("521")) d = d.slice(3)
  if (d.length === 12 && d.startsWith("52")) d = d.slice(2)
  return d
}

export const whatsappValido = (d: string) => /^\d{10}$/.test(d)

/** "8174246595" → "81 7424 6595". */
export const formatoWhatsapp = (d: string) => (d.length === 10 ? `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}` : d)

/** Liga de wa.me con mensaje opcional. */
export const ligaWhatsapp = (d: string, texto?: string) => `https://wa.me/52${d}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`
