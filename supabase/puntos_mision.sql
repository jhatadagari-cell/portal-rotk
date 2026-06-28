-- ════════════════════════════════════════════════════════════════════════
-- Puntos ganados en misiones · esquema en Supabase
-- ────────────────────────────────────────────────────────────────────────
-- Cada misión completada da una recompensa BAJA de puntos (según la energía
-- gastada y la duración). Como la tabla `haciendas` solo la escribe el admin,
-- los puntos de misión se acumulan APARTE, en una tabla que escribe el dueño del
-- personaje. El total de un mecenas = sus puntos base (admin) + estos de misión.
-- Las haciendas progresan COLECTIVAMENTE sumando lo que aportan sus mecenas.
--
-- Modelo de CONFIANZA (como snapshots): el cliente escribe su propio ledger.
-- Lectura pública; escritura solo del dueño del personaje (o admin).
--
-- Requiere: haciendas.sql, personajes.sql, perfiles.sql.
-- Ejecuta este script UNA vez en: Supabase → SQL Editor → New query → Run.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.puntos_mision (
  hacienda_id text not null references public.haciendas(id) on delete cascade,
  miembro_id  uuid not null,                          -- = personaje id (= walker.id)
  puntos      integer not null default 0,
  actualizado timestamptz not null default now(),
  primary key (hacienda_id, miembro_id)
);

create index if not exists puntos_mision_hacienda_idx on public.puntos_mision(hacienda_id);

alter table public.puntos_mision enable row level security;

drop policy if exists puntos_mision_read on public.puntos_mision;
create policy puntos_mision_read on public.puntos_mision for select using ( true );

drop policy if exists puntos_mision_owner_write on public.puntos_mision;
create policy puntos_mision_owner_write on public.puntos_mision for all
  using      ( miembro_id in (select id from public.personajes where owner = auth.uid()) )
  with check ( miembro_id in (select id from public.personajes where owner = auth.uid()) );

drop policy if exists puntos_mision_admin on public.puntos_mision;
create policy puntos_mision_admin on public.puntos_mision for all
  using ( public.es_admin() ) with check ( public.es_admin() );
