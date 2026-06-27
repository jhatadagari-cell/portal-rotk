-- ════════════════════════════════════════════════════════════════════════
-- Perfiles de usuario + ROLES · esquema en Supabase
-- ────────────────────────────────────────────────────────────────────────
-- Los USUARIOS y sus CREDENCIALES ya viven en `auth.users` (Supabase): las
-- contraseñas se guardan HASHEADAS con bcrypt y nunca en claro; los de Google
-- OAuth no tienen contraseña. AQUÍ NO hay credenciales: solo un PERFIL público
-- espejo (nombre, email, rol) para que la app pueda consultar/gestionar usuarios
-- y decidir quién es admin POR ROL (en la BD) en vez de por un email fijo.
--
-- Ejecuta DESPUÉS de haciendas.sql, personajes.sql y solicitudes.sql, UNA vez,
-- en Supabase → SQL Editor → New query → Run.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1) Tabla de perfiles (id = el mismo uuid que auth.users) ────────────────
create table if not exists public.perfiles (
  id      uuid primary key references auth.users(id) on delete cascade,
  email   text,
  nombre  text not null default '',
  rol     text not null default 'normal',   -- normal | admin
  creado  timestamptz default now()
);

-- ── 2) ¿Es admin el usuario actual? ─────────────────────────────────────────
-- SECURITY DEFINER para que las políticas RLS de otras tablas puedan llamarla
-- SIN recursión (salta la RLS de `perfiles`). STABLE: no escribe.
create or replace function public.es_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin');
$$;

-- ── 3) Alta automática del perfil al registrarse (incluye Google OAuth) ─────
-- Bootstrap: este email arranca como admin; a partir de ahí el rol se gestiona
-- en la tabla `perfiles`.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, email, nombre, rol)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email, ''), '@', 1)),
    case when new.email = 'jhatadagari@gmail.com' then 'admin' else 'normal' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 4) Backfill: perfiles de los usuarios YA existentes ─────────────────────
insert into public.perfiles (id, email, nombre, rol)
select u.id, u.email,
  coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(coalesce(u.email, ''), '@', 1)),
  case when u.email = 'jhatadagari@gmail.com' then 'admin' else 'normal' end
from auth.users u
on conflict (id) do nothing;

-- ── 5) RLS de perfiles: cada uno ve el suyo; el admin ve y gestiona todos ───
alter table public.perfiles enable row level security;

drop policy if exists perfiles_select on public.perfiles;
create policy perfiles_select on public.perfiles for select
  using ( id = auth.uid() or public.es_admin() );

drop policy if exists perfiles_admin_write on public.perfiles;
create policy perfiles_admin_write on public.perfiles for all
  using ( public.es_admin() ) with check ( public.es_admin() );

-- ── 6) Admin POR ROL (sustituye el email fijo en las demás tablas) ──────────
drop policy if exists haciendas_admin_write on public.haciendas;
create policy haciendas_admin_write on public.haciendas for all
  using ( public.es_admin() ) with check ( public.es_admin() );

drop policy if exists personajes_admin_write on public.personajes;
create policy personajes_admin_write on public.personajes for all
  using ( public.es_admin() ) with check ( public.es_admin() );

drop policy if exists solicitudes_admin_all on public.solicitudes;
create policy solicitudes_admin_all on public.solicitudes for all
  using ( public.es_admin() ) with check ( public.es_admin() );
