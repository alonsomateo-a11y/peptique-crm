# Conector de Claude (MCP) · Fase 1

Decisión de Alonso (2026-11-22): el conector entra en Fase 1 sin cotizarse aparte. Cada admin lo
conecta con su propio plan de Claude. Lo pueden usar el **administrador** y el **admin comercial**,
y pide el PIN otra vez **cada 30 días**.

## Cómo funciona
- `https://crm.peptique.com.mx/mcp`: servidor MCP dentro de la app (Streamable HTTP, sin estado,
  solo POST). Acepta la versión 2026-07-28 (`server/discover`) y las anteriores (`initialize`).
- OAuth 2.1: lo hace Supabase Auth (GoTrue v2.197, ya instalado en Hetzner). claude.ai se registra
  solo (registro dinámico) y el usuario entra con WhatsApp y PIN. Luego permite el acceso en
  `/oauth/consentir`, que solo devuelve el código a `claude.ai`/`claude.com`.
- Cada llamada usa el token de esa persona, así que aplican las RLS. En las lecturas donde el CRM
  ya lee con la llave secreta después de revisar el perfil (Inicio, Recompras, Red, Ventas, Corte),
  el conector usa la misma función y hace el mismo chequeo.
- Para escribir, siempre hay dos pasos: `proponer_*` (no guarda) y luego `confirmar_propuesta`
  (vuelve a validar y guarda). Las propuestas viven en `propuestas_ia`, con RLS de la persona, y
  sirven una sola vez. Duran 10 minutos. En Actividad se anotan como "· vía Claude".
- Para cortar el acceso: Configuración → "Cerrar sesiones" (`sesion_minima`), o desactivar a la persona.

## Pasos para producción (solo cuando Alonso lo pida)
1. Correr antes `seguridad-defensiva-mm` y `legal-oversight-web`. El aviso de privacidad debe decir que,
   cuando un admin usa el conector, los datos que consulta pasan por Anthropic.
2. Migración `supabase/migrations/20261122000000_conector_claude.sql` (es aditiva).
3. Supabase en `/opt/peptique/supabase`:
   - `docker-compose.override.yml` del repo, que ya trae `GOTRUE_OAUTH_SERVER_*`.
   - Revisar que el emisor sea la URL pública con `/auth/v1`: `API_EXTERNAL_URL` y
     `GOTRUE_JWT_ISSUER` = `https://crm.peptique.com.mx/auth/v1`, y `SITE_URL=https://crm.peptique.com.mx`.
     Comprobar con
     `curl -s https://crm.peptique.com.mx/.well-known/oauth-authorization-server/auth/v1`: `issuer`
     y los endpoints deben llevar `/auth/v1`.
   - En `volumes/api/envoy/lds.template.yaml`, agregar la ruta abierta `/auth/v1/oauth/` (sin
     apikey, igual que `/auth/v1/authorize`) antes de `auth-v1-protected`. El bloque exacto está en
     la copia de ensayo (`ensayo/src/docker/volumes/api/envoy/lds.template.yaml`, comentario
     "Peptique: endpoints OAuth 2.1"). Después: `docker compose up -d --force-recreate api-gw auth`.
4. nginx: agregar los `location` nuevos de `deploy/nginx-crm.conf`.
5. CRM: build y deploy de siempre. No hacen falta variables nuevas: `OAUTH_REDIRECCIONES` y
   `MCP_ORIGENES` son solo para el ensayo, para el MCP Inspector local.
6. Prueba final: en claude.ai → Settings → Connectors → Add custom connector →
   `https://crm.peptique.com.mx/mcp`. Entrar con PIN, Permitir y preguntar "¿cómo van las ventas del mes?".

## Ensayo local
- Copia de ensayo con OAuth activo: `ensayo/src/docker` (override, mac.yml y la ruta de envoy).
  La imagen `peptique-crm:ensayo-mcp` corre como `crm-ensayo` en localhost:3300.
- Personas de prueba: "Prueba Conector Comercial" (admin_comercial) y "Prueba Conector
  Distribuidor", con el PIN de ensayo. Clientes: "Prueba Conector Médico/Paciente".
