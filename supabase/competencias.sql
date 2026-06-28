-- ════════════════════════════════════════════════════════════════════════
-- Competencias de los mecenas · esquema en Supabase
-- ────────────────────────────────────────────────────────────────────────
-- Cada mecenas DOMINA ciertos DOMINIOS (militar / cultural / administrativo).
-- Tener la competencia de un dominio ABARATA las misiones a edificios de ese
-- dominio (modelo SUAVE: cualquiera puede ir; el dominio premia con menos energía).
--
-- La competencia INICIAL se deriva de la aptitud del personaje (no se guarda).
-- Aquí se guardan solo las competencias OTORGADAS extra. La energía/órdenes y
-- esta tabla usan `miembro_id` = id del PERSONAJE (= walker.id).
--
-- v1: otorga el ADMIN. (Más adelante: responsables de pabellón.)
-- Lectura pública; escritura solo admin (rol en `perfiles`, es_admin()).
--
-- Requiere: haciendas.sql, personajes.sql, perfiles.sql.
-- Ejecuta este script UNA vez en: Supabase → SQL Editor → New query → Run.
-- ════════════════════════════════════════════════════════════════════════

-- ── Tabla ──────────────────────────────────────────────────────────────────
create table if not exists public.mecenas_competencias (
  hacienda_id text not null references public.haciendas(id) on delete cascade,
  miembro_id  uuid not null,                          -- = personaje id (= walker.id)
  dominio     text not null,                          -- 'militar' | 'cultural' | 'administrativo'
  primary key (hacienda_id, miembro_id, dominio)
);

create index if not exists mecenas_competencias_hacienda_idx on public.mecenas_competencias(hacienda_id);

-- ── Seguridad (RLS) ────────────────────────────────────────────────────────
alter table public.mecenas_competencias enable row level security;

-- Lectura PÚBLICA (se ven las competencias de todos).
drop policy if exists mecenas_competencias_read on public.mecenas_competencias;
create policy mecenas_competencias_read on public.mecenas_competencias for select using ( true );

-- Escritura solo ADMIN (otorga/retira). Rol por la tabla `perfiles`.
drop policy if exists mecenas_competencias_admin on public.mecenas_competencias;
create policy mecenas_competencias_admin on public.mecenas_competencias for all
  using ( public.es_admin() ) with check ( public.es_admin() );
