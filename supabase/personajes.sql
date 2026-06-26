-- ════════════════════════════════════════════════════════════════════════
-- Personajes · esquema en Supabase
-- ────────────────────────────────────────────────────────────────────────
-- Registro GLOBAL de personajes (no atados a una hacienda). Un personaje se
-- "da de alta" aquí con un nombre, una PERSONALIDAD (patrón de conducta futuro)
-- y una APTITUD (dominios militar/cultural/administrativo). El aspecto se
-- añadirá más adelante (columna `aspecto` jsonb, ya reservada).
--
-- Las haciendas REFERENCIAN personajes existentes como mecenas (el vínculo y
-- los puntos viven en el jsonb `miembros` de cada hacienda, no aquí).
--
-- Ejecuta este script UNA vez en: Supabase → SQL Editor → New query → Run.
-- ════════════════════════════════════════════════════════════════════════

-- ── Tabla ──────────────────────────────────────────────────────────────────
create table if not exists public.personajes (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null default '',
  personalidad  text not null default '',           -- audaz | sereno | astuto
  aptitud       text not null default '',           -- guerrero | erudito | administrador | estratega | caudillo | canciller
  aspecto       jsonb not null default '{}'::jsonb,  -- reservado (apariencia, futuro)
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists personajes_nombre_idx on public.personajes(nombre);

-- Mantener `updated_at` al día (reusa la función de haciendas.sql).
drop trigger if exists personajes_updated_at on public.personajes;
create trigger personajes_updated_at
  before update on public.personajes
  for each row execute function public.set_updated_at();

-- ── Seguridad (RLS) ────────────────────────────────────────────────────────
alter table public.personajes enable row level security;

-- Lectura pública (las páginas de hacienda muestran a sus mecenas).
drop policy if exists personajes_read on public.personajes;
create policy personajes_read
  on public.personajes for select
  using (true);

-- Escritura SOLO para el administrador (mismo email que en haciendas.sql).
drop policy if exists personajes_admin_write on public.personajes;
create policy personajes_admin_write
  on public.personajes for all
  using      ( (auth.jwt() ->> 'email') = 'jhatadagari@gmail.com' )
  with check ( (auth.jwt() ->> 'email') = 'jhatadagari@gmail.com' );
