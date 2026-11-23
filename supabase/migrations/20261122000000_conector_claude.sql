-- Conector de Claude (MCP). La IA propone y el usuario confirma:
-- cada escritura se guarda primero como propuesta y solo se ejecuta con un segundo paso explícito.
-- Las propuestas son de quien las crea (RLS), sirven una sola vez y vencen a los 10 minutos.

create table propuestas_ia (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references personas(id),
  accion text not null check (accion in ('venta', 'pago', 'lote', 'precio')),
  datos jsonb not null,
  resumen text not null,
  cliente_oauth text,
  creada_en timestamptz not null default now(),
  vence_en timestamptz not null default now() + interval '10 minutes',
  usada_en timestamptz,
  descartada_en timestamptz,
  resultado jsonb
);
create index propuestas_ia_persona on propuestas_ia (persona_id, creada_en desc);

alter table propuestas_ia enable row level security;

-- Cada quien crea, ve y cierra solo sus propuestas, y solo si sigue activo con un perfil del conector.
create policy propuestas_propias_leer on propuestas_ia for select to authenticated
  using (persona_id = persona_actual());
create policy propuestas_propias_crear on propuestas_ia for insert to authenticated
  with check (persona_id = persona_actual() and perfil_actual() in ('administrador', 'admin_comercial') and usada_en is null);
create policy propuestas_propias_cerrar on propuestas_ia for update to authenticated
  using (persona_id = persona_actual() and descartada_en is null)
  with check (persona_id = persona_actual());

revoke delete on propuestas_ia from authenticated, anon;
revoke all on propuestas_ia from anon;

-- Una propuesta no se puede reescribir: solo se marca usada o descartada y se guarda el resultado.
-- Que se use una sola vez lo asegura el servidor con un update condicionado a usada_en is null.
revoke update on propuestas_ia from authenticated;
grant update (usada_en, descartada_en, resultado) on propuestas_ia to authenticated;
