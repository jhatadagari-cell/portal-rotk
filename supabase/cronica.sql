-- ═══════════════════════════════════════════════════════════════════════
-- cronica.sql — Crónica de la Casa (registro COMPARTIDO de la hacienda).
-- ─────────────────────────────────────────────────────────────────────────
-- A diferencia de `bitacora` (diario PRIVADO de cada mecenas), la crónica es
-- el relato común de la casa: escaramuzas de la banda, debates, vínculos,
-- ascensos, obras, cambios de facción, altas de mecenas… El cronista 史 la
-- redacta en el cliente (hac-cronica.js) y aquí solo se guarda la línea.
--
-- `clave` es OBLIGATORIA y única por hacienda: como un mismo evento compartido
-- lo presencian VARIOS clientes a la vez (p.ej. la resolución de una banda),
-- todos intentan escribirlo y el índice único deja pasar SOLO al primero
-- (el cliente inserta con on-conflict-ignore).
--
-- Ejecutar UNA vez en el SQL editor de Supabase (idempotente).
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists public.cronica (
  id           uuid primary key default gen_random_uuid(),
  hacienda_id  text not null,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  personaje_id uuid,                                -- mecenas protagonista/actor (si lo hay)
  ts           bigint not null default 0,           -- ms del reloj (ordenar/mostrar)
  tipo         text   not null,                     -- escaramuza | debate | vinculo | ascenso | faccion | obras | alta | nivel | casa | caballo | pabellon …
  texto        text   not null,                     -- línea ya redactada (prosa del cronista)
  datos        jsonb  not null default '{}'::jsonb, -- payload estructurado (por si se re-redacta en el futuro)
  clave        text   not null,                     -- dedupe compartido (p.ej. 'esc-res:<bandId>')
  created_at   timestamptz not null default now()
);
create index if not exists cronica_hac_ts_idx on public.cronica (hacienda_id, ts desc);
create unique index if not exists cronica_hac_clave_uq on public.cronica (hacienda_id, clave);

alter table public.cronica enable row level security;

-- Lectura pública (coherente con `haciendas`: la finca se puede ver sin login,
-- y Realtime respeta la RLS de SELECT → así los cambios llegan a todos).
drop policy if exists cronica_read on public.cronica;
create policy cronica_read on public.cronica for select using (true);

-- Escribe cualquier usuario autenticado EN SU NOMBRE (user_id = auth.uid()).
-- La pertenencia a la hacienda no se puede validar aquí (miembros vive en un
-- jsonb de `haciendas`); el riesgo es el mismo que asume `bitacora`.
drop policy if exists cronica_insert on public.cronica;
create policy cronica_insert on public.cronica for insert
  with check (user_id = auth.uid());

-- Cada cual puede borrar SUS líneas (limpieza); nada de update.
drop policy if exists cronica_delete on public.cronica;
create policy cronica_delete on public.cronica for delete using (user_id = auth.uid());

-- ── Realtime: publica los INSERT para que la crónica llegue en vivo ────────
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cronica') then
    execute 'alter publication supabase_realtime add table public.cronica';
  end if;
end $$;

-- Comprobación: select tablename from pg_publication_tables where pubname='supabase_realtime';
