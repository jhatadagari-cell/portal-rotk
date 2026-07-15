-- ════════════════════════════════════════════════════════════════════════
-- Facciones · esquema en Supabase
-- ────────────────────────────────────────────────────────────────────────
-- Facciones creadas por el ADMIN para organizar a los personajes NPC (bandos,
-- clanes, casas…). Cada personaje puede pertenecer a UNA facción (columna
-- `faccion` añadida a `personajes`). El admin agrupa por facción en el listado
-- y al añadir mecenas a una hacienda; el color de la facción tiñe esas vistas.
--
-- Ejecuta este script UNA vez en: Supabase → SQL Editor → New query → Run.
-- ════════════════════════════════════════════════════════════════════════

-- ── Tabla ──────────────────────────────────────────────────────────────────
create table if not exists public.facciones (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null default '',
  color       text not null default '#c9a84c',   -- color de la facción (hex)
  zh          text not null default '',           -- glifo/adorno chino opcional
  orden       int  not null default 0,            -- orden de aparición en las listas
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists facciones_orden_idx on public.facciones(orden);

-- Mantener `updated_at` al día (reusa la función de haciendas.sql).
drop trigger if exists facciones_updated_at on public.facciones;
create trigger facciones_updated_at
  before update on public.facciones
  for each row execute function public.set_updated_at();

-- ── Vínculo personaje → facción ─────────────────────────────────────────────
-- NULL = sin facción. Al borrar una facción, sus personajes quedan sin facción.
alter table public.personajes
  add column if not exists faccion uuid references public.facciones(id) on delete set null;

create index if not exists personajes_faccion_idx on public.personajes(faccion);

-- ── Seguridad (RLS) ────────────────────────────────────────────────────────
alter table public.facciones enable row level security;

-- Lectura pública (las vistas de hacienda pueden mostrar el color de la facción).
drop policy if exists facciones_read on public.facciones;
create policy facciones_read
  on public.facciones for select
  using (true);

-- Escritura SOLO para el administrador (mismo email que en haciendas.sql).
drop policy if exists facciones_admin_write on public.facciones;
create policy facciones_admin_write
  on public.facciones for all
  using      ( (auth.jwt() ->> 'email') = 'jhatadagari@gmail.com' )
  with check ( (auth.jwt() ->> 'email') = 'jhatadagari@gmail.com' );
