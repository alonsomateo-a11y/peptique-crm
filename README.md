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

## Pendientes de decisión

- **Acceso con PIN.** Supabase Auth pide contraseñas de 6+ caracteres. Propuesta: el PIN se valida en el servidor
  (`personas.pin_hash`, con límite de intentos) y el servidor abre la sesión del usuario ligado a esa persona.
- **Regla de la etapa 3** de los protocolos (Peptique).
- **Plan Pro de Vercel** antes de operar: el plan Hobby no permite uso comercial.
