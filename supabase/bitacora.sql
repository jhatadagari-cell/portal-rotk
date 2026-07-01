-- ═══════════════════════════════════════════════════════════════════════
-- bitacora.sql — Registro de actividad del mecenas (log/diario).
-- ─────────────────────────────────────────────────────────────────────────
-- Cada jugador escribe SUS propias entradas (expediciones, escaramuzas, tareas
-- internas, progreso). Se guarda en BD para verse igual en cualquier sesión.
-- `clave` opcional evita duplicar un mismo evento (p.ej. resolución de una banda).
-- Ejecutar una vez en el SQL editor de Supabase.
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists public.bitacora (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  personaje_id uuid not null,
  ts           bigint not null default 0,          -- ms del reloj (para ordenar/mostrar)
  tipo         text   not null,                    -- expedicion | escaramuza | tarea | progreso
  texto        text   not null,                    -- línea ya formateada para mostrar
  clave        text,                               -- dedupe opcional (p.ej. 'esc-res:<bandId>')
  created_at   timestamptz not null default now()
);
create index if not exists bitacora_user_ts_idx on public.bitacora (user_id, ts desc);

alter table public.bitacora enable row level security;
-- Cada jugador ve/escribe/borra SOLO sus entradas.
drop policy if exists bitacora_own_select on public.bitacora;
create policy bitacora_own_select on public.bitacora for select using (user_id = auth.uid());
drop policy if exists bitacora_own_insert on public.bitacora;
create policy bitacora_own_insert on public.bitacora for insert with check (user_id = auth.uid());
drop policy if exists bitacora_own_delete on public.bitacora;
create policy bitacora_own_delete on public.bitacora for delete using (user_id = auth.uid());
