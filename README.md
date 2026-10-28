# Peptique CRM · Fase 1

Mostrador, ventas, red comercial, inventario por lote, COA protegido y reportes para Peptique.
Next.js 16 + Supabase en Vercel. Producción: https://crm.peptique.com.mx

## Arrancar en local

```bash
npm install
cp .env.example .env.local   # llenar con las llaves del proyecto de Supabase
npm run dev
```

Sin las variables de Supabase la app corre con datos simulados y sin pedir sesión (`lib/sesion.ts`, `lib/demo.ts`).

## Estructura

- `app/(auth)/entrar` · elegir perfil y PIN.
- `app/(app)/*` · pantallas con menú lateral. El menú se filtra por perfil (`lib/nav.ts`).
- `components/app` · componentes propios: menú, ruta de regreso, KPIs, estados, gráfica de ventas.
- `components/ui` · shadcn/ui. `components/charts` · gráficas de Bklit.
- `lib/supabase` · clientes de navegador, servidor y proxy. `proxy.ts` refresca la sesión.
- `supabase/migrations` · esquema de base de datos y políticas RLS.

## Diseño

- Identidad de Peptique: Hueso, Espresso y Sage; títulos en Source Serif 4 y texto en Manrope. Solo light mode.
- Referencia visual: wireframe Fase 1 (https://claude.ai/artifact/4C9BcYtpwaGdCaDRtB5PTh).
- Estados siempre con ícono + texto. Gráficas con una serie en Sage profundo (`--chart-1`) y referencias en Taupe.
- Drawers para crear y editar; modales solo para confirmar algo irreversible.

## Acceso con PIN

- Cada persona elige su perfil, su nombre y escribe un PIN de 4 números. El PIN se guarda con bcrypt
  y se valida solo en el servidor (`verificar_pin`, con la llave secreta). 5 intentos fallidos = 15 minutos de bloqueo.
- Al validar, el servidor abre la sesión de Supabase del usuario ligado a esa persona (enlace mágico verificado en el servidor;
  nunca se manda correo). Los usuarios usan un correo interno `p-<id>@personas.crm.peptique.com.mx`.
- La sesión dura el turno: solo vale el mismo día (hora de Monterrey). El perfil temporal vence en su fecha.
  El administrador puede cerrar sesiones a distancia (`cerrar_sesiones`).
- El administrador puede entrar también con correo y contraseña (`/entrar/correo`) si su usuario tiene correo real.
- Primer administrador: `node --env-file=.env.local scripts/crear-admin.mjs "Nombre" "WhatsApp" 1234 [correo]`.
- En Supabase → Authentication, desactivar "Allow new users to sign up": los usuarios solo los crea el servidor.
- Con `REQUIERE_SESION=1` se exige sesión; sin eso la app corre con un administrador de demostración.

## Pendientes de decisión

- **Regla de la etapa 3** de los protocolos (Peptique).
- **Plan Pro de Vercel** antes de operar: el plan Hobby no permite uso comercial.
