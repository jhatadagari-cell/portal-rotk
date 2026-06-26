-- ════════════════════════════════════════════════════════════════════════
-- Pabellones · esquema en Supabase
-- ────────────────────────────────────────────────────────────────────────
-- Patios temáticos delimitados por murallas interiores. Relación 1↔N con
-- `haciendas` (FK con borrado en cascada). DINÁMICO: se guarda solo la celda
-- SEMILLA [gx,gy]; la región (celdas) se recalcula en el cliente a partir de
-- las murallas, así el patio se adapta cuando se mueven los muros.
-- Ejecuta este script UNA vez en: Supabase → SQL Editor → New query → Run.
-- (Requiere que la tabla `haciendas` ya exista — ver haciendas.sql.)
-- ════════════════════════════════════════════════════════════════════════

-- ── Tabla ──────────────────────────────────────────────────────────────────
create table if not exists public.pabellones (
  id          uuid primary key default gen_random_uuid(),
  hacienda_id text not null references public.haciendas(id) on delete cascade,
  nombre      text not null default '',
  rol         text not null default '',            -- administrativo | militar | cultural
  seed        jsonb not null default '[0,0]'::jsonb, -- celda semilla [gx,gy]
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists pabellones_hacienda_idx on public.pabellones(hacienda_id);

-- Mantener `updated_at` al día (reusa la función creada en haciendas.sql; si no
-- existiera, créala con el bloque comentado de abajo).
-- create or replace function public.set_updated_at()
-- returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists pabellones_updated_at on public.pabellones;
create trigger pabellones_updated_at
  before update on public.pabellones
  for each row execute function public.set_updated_at();

-- ── Seguridad (RLS) ────────────────────────────────────────────────────────
alter table public.pabellones enable row level security;

-- Lectura pública (igual que haciendas).
drop policy if exists pabellones_read on public.pabellones;
create policy pabellones_read
  on public.pabellones for select
  using (true);

-- Escritura SOLO para el administrador (mismo email que en haciendas.sql).
drop policy if exists pabellones_admin_write on public.pabellones;
create policy pabellones_admin_write
  on public.pabellones for all
  using      ( (auth.jwt() ->> 'email') = 'jhatadagari@gmail.com' )
  with check ( (auth.jwt() ->> 'email') = 'jhatadagari@gmail.com' );
