// Metadatos del servidor OAuth (Supabase Auth) en el dominio del CRM, para clientes que los buscan
// en /.well-known/oauth-authorization-server. Se leen de Auth por la red interna.
export const dynamic = "force-dynamic"

export async function GET() {
  const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/.well-known/oauth-authorization-server/auth/v1`, { cache: "no-store" }).catch(() => null)
  if (!r?.ok) return Response.json({ error: "Servidor de autorización no disponible" }, { status: 503 })
  return Response.json(await r.json(), { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" } })
}
