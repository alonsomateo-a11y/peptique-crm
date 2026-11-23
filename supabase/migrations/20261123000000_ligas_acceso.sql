-- Liga de primer acceso
--  * El administrador da de alta a la persona sin PIN y le manda una liga por WhatsApp.
--  * Con la liga, la persona crea su propio PIN (y el administrador, además, su correo y contraseña).
--  * Solo se guarda el hash del token. La liga vence a las 72 horas y sirve una sola vez.
--  * Generar una liga nueva invalida las anteriores de esa persona.

create table ligas_acceso (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references personas(id) on delete cascade,
  token_hash text not null unique,
  vence_en timestamptz not null,
  usada_en timestamptz,
  creada_por uuid references personas(id) on delete set null,
  creado_en timestamptz not null default now()
);

create index ligas_acceso_persona on ligas_acceso (persona_id);

alter table ligas_acceso enable row level security;
-- El administrador puede ver las ligas; crearlas y canjearlas lo hace solo el servidor.
create policy admin_lee on ligas_acceso for select to authenticated using (es_admin());
