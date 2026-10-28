-- Acceso con PIN
--  * El PIN (4 números) se guarda con bcrypt y se valida solo en el servidor (service_role).
--  * 5 intentos fallidos → bloqueo de 15 minutos.
--  * sesion_minima: el administrador cierra sesiones a distancia; toda sesión iniciada
--    antes de esa fecha deja de valer.

alter table personas
  add column intentos_fallidos int not null default 0,
  add column bloqueado_hasta timestamptz,
  add column sesion_minima timestamptz;

-- Valida el PIN y lleva la cuenta de intentos. Solo la llama el servidor.
create or replace function verificar_pin(p_persona uuid, p_pin text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  p personas%rowtype;
begin
  select * into p from personas where id = p_persona for update;
  if not found or p.estado <> 'activo' or p.auth_user_id is null or p.pin_hash is null then
    return 'inactivo';
  end if;
  if p.perfil = 'temporal' and p.vence_en is not null and p.vence_en < now() then
    return 'vencido';
  end if;
  if p.bloqueado_hasta is not null and p.bloqueado_hasta > now() then
    return 'bloqueado';
  end if;
  if p.pin_hash = crypt(p_pin, p.pin_hash) then
    update personas set intentos_fallidos = 0, bloqueado_hasta = null where id = p_persona;
    return 'ok';
  end if;
  update personas
    set intentos_fallidos = intentos_fallidos + 1,
        bloqueado_hasta = case when intentos_fallidos + 1 >= 5 then now() + interval '15 minutes' end
    where id = p_persona;
  return case when p.intentos_fallidos + 1 >= 5 then 'bloqueado' else 'incorrecto' end;
end $$;

-- Asigna o cambia el PIN. Lo puede hacer el administrador o el servidor.
create or replace function asignar_pin(p_persona uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'El PIN debe tener 4 números';
  end if;
  if coalesce(auth.role(), '') <> 'service_role' and not es_admin() then
    raise exception 'Solo el administrador puede asignar PIN';
  end if;
  update personas
    set pin_hash = crypt(p_pin, gen_salt('bf')), intentos_fallidos = 0, bloqueado_hasta = null
    where id = p_persona;
end $$;

-- Cierra todas las sesiones abiertas de una persona.
create or replace function cerrar_sesiones(p_persona uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not es_admin() then
    raise exception 'Solo el administrador puede cerrar sesiones';
  end if;
  update personas set sesion_minima = now() where id = p_persona;
end $$;

revoke all on function verificar_pin(uuid, text) from public, anon, authenticated;
grant execute on function verificar_pin(uuid, text) to service_role;
revoke all on function asignar_pin(uuid, text) from public, anon;
revoke all on function cerrar_sesiones(uuid) from public, anon;
