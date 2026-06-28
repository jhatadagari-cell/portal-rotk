-- ════════════════════════════════════════════════════════════════════════
-- Órdenes del jugador a su mecenas · esquema en Supabase
-- ────────────────────────────────────────────────────────────────────────
-- Agencia del jugador: un usuario manda a SU personaje (mecenas) una MISIÓN
-- (p.ej. ir a un edificio a hacer su tarea, ~2 min). La orden es ESTADO
-- COMPARTIDO: lectura pública para que la simulación determinista de todos los
-- clientes (hac-folk.js) la aplique igual; escritura solo del dueño del
-- personaje. `inicio` (hora de servidor) marca el tick en el que la misión se
-- activa, así no hay teletransporte y todos la ven empezar a la vez.
--
-- 1 orden vigente por (hacienda, mecenas) → clave primaria compuesta (upsert).
-- Requiere haber ejecutado antes: haciendas.sql, personajes.sql, perfiles.sql.
-- Ejecuta este script UNA vez en: Supabase → SQL Editor → New query → Run.
-- ════════════════════════════════════════════════════════════════════════

-- ── Tabla ──────────────────────────────────────────────────────────────────
create table if not exists public.ordenes (
  hacienda_id   text not null references public.haciendas(id) on delete cascade,
  miembro_id    uuid not null,                                   -- = personaje id (= walker.id)
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo          text not null default 'mision',                  -- v1: 'mision'
  target_id     text,                                            -- id de edificio "gx,gy" (o null)
  inicio        timestamptz not null default now(),              -- hora de servidor: cuándo empieza
  duracion_seg  int not null default 120,                        -- 2 min por ahora
  primary key (hacienda_id, miembro_id)
);

create index if not exists ordenes_hacienda_idx on public.ordenes(hacienda_id);

-- ── Seguridad (RLS) ────────────────────────────────────────────────────────
alter table public.ordenes enable row level security;

-- Lectura PÚBLICA: las órdenes son estado compartido (todos ven lo mismo).
drop policy if exists ordenes_read on public.ordenes;
create policy ordenes_read on public.ordenes for select using ( true );

-- Escritura solo del DUEÑO del personaje: miembro_id ha de ser uno de SUS
-- personajes (owner = auth.uid()). Así nadie manda al mecenas de otro.
drop policy if exists ordenes_owner_write on public.ordenes;
create policy ordenes_owner_write on public.ordenes for all
  using      ( miembro_id in (select id from public.personajes where owner = auth.uid()) )
  with check ( miembro_id in (select id from public.personajes where owner = auth.uid()) );

-- El ADMIN puede todo (gestión/depuración). Rol por la tabla `perfiles`.
drop policy if exists ordenes_admin on public.ordenes;
create policy ordenes_admin on public.ordenes for all
  using ( public.es_admin() ) with check ( public.es_admin() );
