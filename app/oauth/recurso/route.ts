import { emisorOAuth, origenPublico } from "@/lib/mcp/urls"

// Protected Resource Metadata (RFC 9728) del conector. Se publica en /.well-known/oauth-protected-resource[/mcp].
export const dynamic = "force-dynamic"

export function GET(request: Request) {
  const origen = origenPublico(request.headers)
  return Response.json(
    {
      resource: `${origen}/mcp`,
      authorization_servers: [emisorOAuth()],
      bearer_methods_supported: ["header"],
      resource_name: "Peptique CRM",
    },
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" } },
  )
}
