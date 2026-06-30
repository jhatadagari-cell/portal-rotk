-- ═══════════════════════════════════════════════════════════════════════
-- escaramuzas.sql — Expediciones COOPERATIVAS (banda de 2-4 jugadores).
-- ─────────────────────────────────────────────────────────────────────────
-- Un jugador MONTA una banda (paga un coste), otros se UNEN, y el host la LANZA
-- (sale 30 min). Al volver: reparto de dinero (host recupera coste +25% + su
-- parte) y de BOTÍN (≥1 objeto por jugador, elección con resolución de colisiones
-- en 1 h); heridas si fracasa; cooldown 1 h. La lógica de "quién puede qué" vive
-- en el cliente; aquí RLS permisivo para autenticados (endurecer más adelante).
--
-- Ejecutar una vez en el SQL editor de Supabase.
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists public.escaramuzas (
  id           uuid primary key default gen_random_uuid(),
  hacienda_id  text    not null,                       -- finca donde se publica la banda
  host_id      text    not null,                       -- personajeId del que la monta
  host_nombre  text    not null default '',
  plazas       integer not null default 3,             -- objetivo 2..4
  dificultad   integer not null default 4,
  estado       text    not null default 'abierta',     -- abierta | en_curso | botin | resuelta
  miembros     jsonb   not null default '[]'::jsonb,    -- [{id, nombre}] incluye al host
  coste        integer not null default 0,             -- lo que pagó el host por montarla
  inicio_ms    bigint  not null default 0,             -- ms del lanzamiento
  fin_ms       bigint  not null default 0,             -- ms del regreso (inicio + 30 min)
  exito        boolean,                                 -- resultado al resolver
  botin        jsonb   not null default '[]'::jsonb,    -- pool común de objetos [itemId,…]
  elecciones   jsonb   not null default '{}'::jsonb,    -- { personajeId: itemId } elegido del botín
  loot_hasta   bigint  not null default 0,             -- deadline (ms) para resolver colisiones de botín
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists escaramuzas_hac_idx on public.escaramuzas (hacienda_id);

-- updated_at automático
create or replace function public.set_updated_at_escaramuzas() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;
drop trigger if exists trg_escaramuzas_updated on public.escaramuzas;
create trigger trg_escaramuzas_updated before update on public.escaramuzas
  for each row execute function public.set_updated_at_escaramuzas();

-- RLS: lectura pública; escritura para usuarios autenticados (varios jugadores
-- mutan la misma fila al unirse/lanzar/elegir botín).
alter table public.escaramuzas enable row level security;
drop policy if exists escaramuzas_read  on public.escaramuzas;
create policy escaramuzas_read  on public.escaramuzas for select using (true);
drop policy if exists escaramuzas_write on public.escaramuzas;
create policy escaramuzas_write on public.escaramuzas for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
