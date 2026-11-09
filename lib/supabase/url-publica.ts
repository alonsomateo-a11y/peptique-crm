/**
 * En el servidor propio, el CRM habla con Supabase por la red interna de Docker y Supabase no
 * se publica. Las ligas firmadas (COA y protocolos) sí las abre el navegador: salen por el dominio
 * del CRM, que solo deja pasar /storage/v1/object/sign/. Sin SUPABASE_URL_PUBLICA no cambia nada.
 */
export function urlPublica(firmada: string) {
  const base = process.env.SUPABASE_URL_PUBLICA
  if (!base) return firmada
  const u = new URL(firmada)
  return `${base.replace(/\/$/, "")}${u.pathname}${u.search}`
}
