-- ════════════════════════════════════════════════════════════════════════
-- Snapshots de la vida de una finca · esquema en Supabase
-- ────────────────────────────────────────────────────────────────────────
-- hac-folk.js guarda aquí una "foto" del estado de la simulación de mecenas
-- (posiciones, temporizadores, cursor del azar…) en el instante `t_snap`. Así
-- la vida de la finca es CONTINUA (sin re-arranques/saltos) y de carga acotada:
-- quien entra carga la última foto y solo simula desde t_snap hasta ahora.
--
-- Modelo OPCIÓN (a): de CONFIANZA — la foto la escribe el cliente. Cualquier
-- autenticado puede escribir; lectura pública (es estado compartido). Si más
-- adelante se quiere blindar contra trampas, se migra el escritor a una edge
-- function (opción b) sin cambiar este esquema.
--
-- Requiere haber ejecutado antes: haciendas.sql.
-- Ejecuta este script UNA vez en: Supabase → SQL Editor → New query → Run.
-- ════════════════════════════════════════════════════════════════════════

-- ── Tabla ──────────────────────────────────────────────────────────────────
create table if not exists public.finca_snapshots (
  hacienda_id text primary key references public.haciendas(id) on delete cascade,
  t_snap      bigint not null,                       -- ms de servidor que representa la foto
  estado      jsonb  not null,                       -- estado serializado del sim
  updated_at  timestamptz not null default now()
);

-- ── Seguridad (RLS) ────────────────────────────────────────────────────────
alter table public.finca_snapshots enable row level security;

-- Lectura PÚBLICA: la foto es estado compartido (todos ven lo mismo).
drop policy if exists finca_snapshots_read on public.finca_snapshots;
create policy finca_snapshots_read on public.finca_snapshots for select using ( true );

-- Escritura: cualquier usuario AUTENTICADO (modelo de confianza, opción a).
drop policy if exists finca_snapshots_write on public.finca_snapshots;
create policy finca_snapshots_write on public.finca_snapshots
  for all to authenticated using ( true ) with check ( true );
