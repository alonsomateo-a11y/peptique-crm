@AGENTS.md

# Peptique CRM

- Todo el texto de la interfaz va en español (es-MX). Montos con `lib/format.ts`.
- Solo administrador ve costos, márgenes, proveedor, COA original y protocolos. Revisar RLS en `supabase/migrations` al tocar datos.
- Cifras de demostración solo en `lib/demo.ts`; no usar precios ni costos reales de Peptique.
- La referencia de diseño es el wireframe de Fase 1; los componentes nuevos siguen los tokens de `app/globals.css`.
