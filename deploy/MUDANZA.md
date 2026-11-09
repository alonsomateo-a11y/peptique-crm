# Mudanza del CRM a Hetzner

Todo queda en el servidor que ya paga Peptique (5.161.71.188, Ubuntu, Docker): la app y un Supabase propio
solo con base de datos, accesos y archivos. Se ensayó completo en la Mac con la estructura y los datos reales:
entrada con PIN, ligas firmadas de protocolos, copia de datos y restauración de un respaldo.

Los clientes reales se suben **después** de la mudanza, ya en el servidor.

## Lo que necesita Alonso

- Acceso a GoDaddy para cambiar `crm.peptique.com.mx` (hoy apunta a Vercel) a `A 5.161.71.188`.
- Que nadie use el CRM durante la mudanza.

## Pasos

1. **Supabase en el servidor** (`/opt/peptique/supabase`)
   - Bajar la carpeta `docker` de supabase/supabase y copiar `deploy/supabase/docker-compose.override.yml`.
   - `.env`: `sh utils/generate-keys.sh --update-env`, contraseñas nuevas, `COMPOSE_FILE=docker-compose.yml:docker-compose.override.yml`,
     `DISABLE_SIGNUP=true`, `ENABLE_PHONE_SIGNUP=false`, `PGRST_DB_SCHEMAS=public`, `SITE_URL=https://crm.peptique.com.mx`.
   - `mkdir -p volumes/db/data && docker compose up -d db auth rest storage api-gw`.
   - Confirmar que solo escucha en `127.0.0.1:8000` (Docker se salta ufw si un puerto queda en 0.0.0.0).
2. **Estructura**: correr `supabase/migrations/*.sql` con `docker exec -i supabase-db psql -U postgres -d postgres`
   y `scripts/crear-buckets.mjs` por un túnel (`ssh -L 18000:127.0.0.1:8000`).
3. **Datos**: `node --env-file=deploy/mudanza.env deploy/copiar-datos.mjs` (origen = nube, destino = túnel).
   Solo lee de la nube; conserva los PIN; al final compara tabla por tabla.
4. **App**: compilar en la Mac con la `ANON_KEY` del servidor
   (`docker buildx build --platform linux/amd64 --build-arg NEXT_PUBLIC_SUPABASE_URL=http://kong:8000 ...`),
   subir con `docker save peptique-crm:actual | ssh ... docker load`, poner `crm.env` y `docker compose up -d` con `deploy/crm`.
   No se compila en el servidor: le quedan unos 2 GB libres y comparte con el sitio.
5. **nginx**: sitio "reverse proxy" en CloudPanel hacia `http://127.0.0.1:3200` y agregar `deploy/nginx-crm.conf`.
6. **DNS y certificado**: cambiar el registro en GoDaddy, esperar a que resuelva y sacar el certificado de Let's Encrypt.
7. **Pruebas**: entrar con el PIN de Soporte MM, Productos, subir y abrir un protocolo de prueba, liga `/d/` del cliente,
   mostrador. Sin sesión, `/inicio` debe mandar a `/entrar`.
8. **Respaldos**
   - `apt install age` en el servidor y `brew install age` en la Mac; `age-keygen` en la Mac (la privada no sale de la Mac).
   - La llave pública va a `/opt/peptique/respaldo.pub`; `deploy/respaldo.sh` a `/opt/peptique/` con su cron.
   - `deploy/bajar-respaldo.sh` en la Mac con launchd cada noche.
   - Prueba de restauración con el primer respaldo.
9. **Después**: quitar el dominio en Vercel; dejar la base de la nube una semana como respaldo y luego darla de baja.
   El desarrollo local deja de apuntar a la nube y usa un Supabase local.

## Memoria

Supabase reducido usa unos 330 MB y la app unos 110 MB (límite de 512 MB).
