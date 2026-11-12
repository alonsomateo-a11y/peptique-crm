-- Formatos de COA por laboratorio
--  * Cada laboratorio acomoda su COA distinto. El formato guarda dónde van las franjas
--    (proveedor, QR, foto, código y link) para que el siguiente COA de ese laboratorio
--    llegue ya tapado y solo se revise.
--  * Las zonas van en fracciones de la página (0 a 1), igual que lotes.coa_zonas.
--  * El formato se actualiza solo cada vez que se aprueba un COA con él.

create table formatos_coa (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  zonas jsonb not null default '[]'::jsonb,
  actualizado_en timestamptz not null default now(),
  creado_en timestamptz not null default now()
);

create unique index formatos_coa_nombre on formatos_coa (lower(nombre));

alter table lotes add column formato_coa_id uuid references formatos_coa(id) on delete set null;

-- Zonas del COA de cada lote (borrador o aprobadas). Antes iban en coas/<lote>/zonas.json,
-- pero el bucket solo acepta PDF e imágenes y ese archivo nunca se guardaba.
alter table lotes add column coa_zonas jsonb;

alter table formatos_coa enable row level security;
create policy admin_todo on formatos_coa for all to authenticated using (es_admin()) with check (es_admin());
