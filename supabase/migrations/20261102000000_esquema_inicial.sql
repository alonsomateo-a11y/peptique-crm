-- Peptique CRM · Fase 1 · esquema inicial
-- Reglas de negocio clave:
--  * 6 perfiles. Solo el administrador ve costos, márgenes, proveedor, COA original y protocolos.
--  * Comisión fija: 13% a quien vende; si vende un comisionista, su distribuidor recibe 3%.
--  * Red: solo transferencia con referencia o terminal; se entrega cuando el pago se refleja.
--  * Pago por dosis: 4 pagos por vial; una dosis solo se aplica si está pagada.
--  * Inventario sin caducidad, por lote, en tres bolsas: general, recurrentes, tránsito.

create extension if not exists pgcrypto;

-- ───────────── Tipos ─────────────
create type perfil as enum ('administrador','admin_comercial','mostrador','distribuidor','comisionista','temporal');
create type estado_persona as enum ('activo','por_aprobar','baja');
create type tipo_cliente as enum ('paciente','medico','distribuidor');
create type canal_venta as enum ('mostrador_caja','en_persona','red','pedido');
create type estado_venta as enum ('esperando_pago','por_cobrar','pagada','entregada','cancelada');
create type forma_pago as enum ('completo','por_dosis');
create type metodo_pago as enum ('efectivo','tarjeta','transferencia');
create type lugar_pago as enum ('caja','en_persona','red','banco');
create type estado_pago as enum ('en_caja','por_entregar','por_conciliar','conciliado','en_camino','reflejado','devolucion');
create type bolsa_inventario as enum ('general','recurrentes','transito');
create type tipo_movimiento as enum ('entrada','venta','apartado_transito','liberacion','entrega','cancelacion','ajuste');
create type estado_coa as enum ('falta','por_aprobar','listo');
create type estado_recompra as enum ('por_avisar','contactado','recompro','sin_recompra','no_contactar');

-- ───────────── Personas (equipo y red) ─────────────
create table personas (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  nombre text not null,
  whatsapp text not null,
  perfil perfil not null,
  estado estado_persona not null default 'activo',
  zona text,
  distribuidor_id uuid references personas(id),
  pin_hash text,
  vence_en timestamptz,                       -- solo perfil temporal
  motivo_estado text,
  creado_por uuid references personas(id),
  creado_en timestamptz not null default now(),
  constraint comisionista_con_distribuidor check (perfil <> 'comisionista' or distribuidor_id is not null)
);

-- ───────────── Catálogo ─────────────
create table productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,                       -- "GHK-Cu"
  presentacion text not null,                 -- "100 mg"
  familia text not null,
  sku text unique,
  precio_publico numeric(12,2),
  precio_medico numeric(12,2),
  precio_distribuidor numeric(12,2),
  visible boolean not null default false,     -- Oculto si no tiene precio
  inyecciones_por_vial int not null default 20,
  pagos_por_dosis int not null default 4,
  creado_en timestamptz not null default now()
);

create table protocolos (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos(id) on delete cascade,
  etapa int not null check (etapa between 1 and 3),
  piezas int not null check (piezas > 0),
  duracion_dias int,
  pdf_path text,                              -- Storage privado
  unique (producto_id, etapa)
);

create table lotes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,                -- LOT-MX-2026-001
  producto_id uuid not null references productos(id),
  lote_origen text,                           -- US-7790
  llegada date not null,
  piezas_recibidas int not null check (piezas_recibidas >= 0),
  costo_pieza_usd numeric(12,2),
  tipo_cambio numeric(8,4),
  costo_pieza_mxn numeric(12,2) not null,
  coa_original_path text,                     -- solo administrador
  coa_publico_path text,                      -- con franjas: proveedor, QR, foto, código y link
  coa_estado estado_coa not null default 'falta',
  creado_en timestamptz not null default now()
);

create table movimientos_inventario (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references lotes(id),
  tipo tipo_movimiento not null,
  bolsa bolsa_inventario not null,
  cantidad int not null,                      -- + entra a la bolsa, - sale
  venta_id uuid,
  persona_id uuid references personas(id),
  nota text,
  creado_en timestamptz not null default now()
);

-- ───────────── Clientes ─────────────
create table clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  whatsapp text not null unique,
  correo text,
  tipo tipo_cliente not null default 'paciente',
  vendedor_id uuid references personas(id),
  origen text,
  referido_por uuid references clientes(id),
  etiquetas text[] not null default '{}',
  acepta_whatsapp boolean not null default false,
  waiver_firmado_en timestamptz,
  waiver_nombre text,
  waiver_firma_path text,
  creado_en timestamptz not null default now()
);

-- ───────────── Ventas y pagos ─────────────
create table ventas (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique,                 -- M-0106, R-0030, P-0005
  canal canal_venta not null,
  cliente_id uuid not null references clientes(id),
  vendedor_id uuid not null references personas(id),
  estado estado_venta not null,
  forma_pago forma_pago not null default 'completo',
  total numeric(12,2) not null,
  referencia_pago text,                       -- red: R0030-RS
  apartado_vence_en timestamptz,              -- red: 48 h sin pago → se libera
  etiquetas text[] not null default '{}',
  nota text,
  motivo_cancelacion text,
  creado_en timestamptz not null default now()
);

create table venta_partidas (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references ventas(id) on delete cascade,
  producto_id uuid not null references productos(id),
  lote_id uuid references lotes(id),
  cantidad int not null check (cantidad > 0),
  precio_unitario numeric(12,2) not null,
  etapa_protocolo int check (etapa_protocolo between 1 and 3)
);

alter table movimientos_inventario
  add constraint movimientos_venta_fk foreign key (venta_id) references ventas(id);

create table pagos (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references ventas(id),
  monto numeric(12,2) not null,
  metodo metodo_pago not null,
  lugar lugar_pago not null,
  cobro_persona_id uuid not null references personas(id),
  estado estado_pago not null,
  referencia text,
  comprobante_path text,
  numero_dosis int check (numero_dosis between 1 and 4),
  creado_en timestamptz not null default now()
);

create table dosis_aplicadas (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references ventas(id),
  numero int not null check (numero between 1 and 4),
  aplicada_por uuid not null references personas(id),
  aplicada_en timestamptz not null default now(),
  unique (venta_id, numero)
);

create table comisiones (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references ventas(id),
  persona_id uuid not null references personas(id),
  tipo text not null check (tipo in ('directa','equipo')),
  porcentaje numeric(5,2) not null,
  monto numeric(12,2) not null,
  pagada_en timestamptz
);

create table cortes_caja (
  id uuid primary key default gen_random_uuid(),
  abierta_por uuid not null references personas(id),
  fondo numeric(12,2) not null,
  abierta_en timestamptz not null default now(),
  cerrada_en timestamptz,
  efectivo_esperado numeric(12,2),
  efectivo_contado numeric(12,2),
  diferencia numeric(12,2)
);

-- ───────────── Recompras, plan y bitácora ─────────────
create table avisos_recompra (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id),
  producto_id uuid not null references productos(id),
  venta_id uuid references ventas(id),
  se_le_acaba date not null,
  siguiente_etapa int,
  estado estado_recompra not null default 'por_avisar',
  contactado_por uuid references personas(id),
  contactado_en timestamptz
);

create table plan_mensual (
  mes date primary key,                       -- primer día del mes
  meta numeric(12,2) not null,
  crecimiento numeric(5,2) not null default 5
);

create table plan_producto (
  producto_id uuid not null references productos(id),
  mes date not null,
  meta_piezas int,
  crecimiento numeric(5,2),
  primary key (producto_id, mes)
);

create table gastos_fijos (
  id uuid primary key default gen_random_uuid(),
  mes date not null,
  concepto text not null,
  monto numeric(12,2) not null
);

create table configuracion (
  clave text primary key,
  valor jsonb not null
);

insert into configuracion (clave, valor) values
  ('comisiones', '{"directa": 13, "equipo": 3}'),
  ('reglas', '{"aviso_recompra_dias": 2, "liberar_apartado_horas": 48}');

create table bitacora (
  id bigint generated always as identity primary key,
  persona_id uuid references personas(id),     -- null = sistema
  perfil perfil,
  area text not null,                          -- mostrador, red, inventario, clientes…
  accion text not null,
  entidad text,
  entidad_id uuid,
  producto_id uuid references productos(id),
  creado_en timestamptz not null default now()
);

-- ───────────── Vistas ─────────────
create view existencias with (security_invoker = true) as
select l.id as lote_id, l.producto_id, m.bolsa, coalesce(sum(m.cantidad), 0)::int as piezas
from lotes l
left join movimientos_inventario m on m.lote_id = l.id
group by l.id, l.producto_id, m.bolsa;

-- Lotes sin costos ni COA original, para perfiles que no deben verlos.
create view lotes_publico with (security_invoker = true) as
select id, codigo, producto_id, llegada, coa_publico_path, coa_estado from lotes;

-- ───────────── Seguridad (RLS) ─────────────
create or replace function perfil_actual() returns perfil
language sql stable security definer set search_path = public as $$
  select perfil from personas where auth_user_id = auth.uid() and estado = 'activo'
$$;

create or replace function persona_actual() returns uuid
language sql stable security definer set search_path = public as $$
  select id from personas where auth_user_id = auth.uid() and estado = 'activo'
$$;

create or replace function es_admin() returns boolean
language sql stable as $$ select perfil_actual() = 'administrador' $$;

do $$
declare t text;
begin
  foreach t in array array['personas','productos','protocolos','lotes','movimientos_inventario','clientes','ventas',
    'venta_partidas','pagos','dosis_aplicadas','comisiones','cortes_caja','avisos_recompra','plan_mensual',
    'plan_producto','gastos_fijos','configuracion','bitacora']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy admin_todo on %I for all to authenticated using (es_admin()) with check (es_admin())', t);
  end loop;
end $$;

-- Lectura del catálogo visible para todo el equipo activo
create policy catalogo_lectura on productos for select to authenticated using (visible and perfil_actual() is not null);

-- La red ve sus propias ventas; el distribuidor también las de su equipo
create policy ventas_propias on ventas for select to authenticated using (
  vendedor_id = persona_actual()
  or vendedor_id in (select id from personas where distribuidor_id = persona_actual())
  or perfil_actual() in ('admin_comercial','mostrador')
);
create policy ventas_crear on ventas for insert to authenticated with check (vendedor_id = persona_actual());

-- Clientes: el vendedor ve los suyos; mostrador y admin comercial ven todos
create policy clientes_lectura on clientes for select to authenticated using (
  vendedor_id = persona_actual() or perfil_actual() in ('admin_comercial','mostrador','temporal')
);
create policy clientes_crear on clientes for insert to authenticated with check (perfil_actual() is not null);

-- Personas: cada quien se ve a sí mismo; distribuidor ve su equipo; admin comercial ve la red
create policy personas_lectura on personas for select to authenticated using (
  id = persona_actual() or distribuidor_id = persona_actual() or perfil_actual() = 'admin_comercial'
);
-- El distribuidor solo puede pedir altas de comisionistas, que quedan por aprobar
create policy personas_pedir_alta on personas for insert to authenticated with check (
  perfil_actual() in ('distribuidor','admin_comercial') and estado = 'por_aprobar' and perfil = 'comisionista'
);
-- Lotes, protocolos, comisiones de otros, gastos y plan: solo administrador (política admin_todo)
