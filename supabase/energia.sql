-- ════════════════════════════════════════════════════════════════════════
-- Energía de los mecenas · esquema en Supabase
-- ────────────────────────────────────────────────────────────────────────
-- Cada mecenas tiene una barra de ENERGÍA que se REGENERA con el tiempo y solo
-- se GASTA al darle una orden (misión). Es persistente y compartida: guardamos
-- el valor en un instante de referencia (`energia_ts`); la energía actual se
-- deriva sumando la regeneración hasta ahora → todos calculan lo mismo.
--
-- Solo el DUEÑO del personaje escribe su energía (la gasta al mandar misión);
-- lectura pública (se ve la de todos). Sin fila ⇒ energía llena por defecto.
--
-- Requiere haber ejecutado antes: haciendas.sql, personajes.sql, perfiles.sql.
-- Ejecuta este script UNA vez en: Supabase → SQL Editor → New query → Run.
-- ════════════════════════════════════════════════════════════════════════

-- ── Tabla ──────────────────────────────────────────────────────────────────
create table if not exists public.mecenas_energia (
  hacienda_id text not null references public.haciendas(id) on delete cascade,
  miembro_id  uuid not null,                          -- = personaje id (= walker.id)
  energia     real not null default 100,              -- valor en el instante energia_ts
  energia_ts  bigint not null,                         -- ms de servidor de ese valor
  primary key (hacienda_id, miembro_id)
);

create index if not exists mecenas_energia_hacienda_idx on public.mecenas_energia(hacienda_id);

-- ── Seguridad (RLS) ────────────────────────────────────────────────────────
alter table public.mecenas_energia enable row level security;

-- Lectura PÚBLICA (se ve la energía de todos los mecenas de la finca).
drop policy if exists mecenas_energia_read on public.mecenas_energia;
create policy mecenas_energia_read on public.mecenas_energia for select using ( true );

-- Escritura solo del DUEÑO del personaje (gasta SU energía al mandar misión).
drop policy if exists mecenas_energia_owner_write on public.mecenas_energia;
create policy mecenas_energia_owner_write on public.mecenas_energia for all
  using      ( miembro_id in (select id from public.personajes where owner = auth.uid()) )
  with check ( miembro_id in (select id from public.personajes where owner = auth.uid()) );

-- El ADMIN puede todo (gestión/depuración).
drop policy if exists mecenas_energia_admin on public.mecenas_energia;
create policy mecenas_energia_admin on public.mecenas_energia for all
  using ( public.es_admin() ) with check ( public.es_admin() );
