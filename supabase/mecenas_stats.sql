-- ════════════════════════════════════════════════════════════════════════
-- Stats personales del mecenas · esquema en Supabase
-- ────────────────────────────────────────────────────────────────────────
-- "Poder personal" del personaje, distinto del cargo/prestigio que aporta a la
-- casa (eso vive en puntos_mision + haciendas). Aquí guardamos lo que es SUYO:
--   · dinero       — monedas que lleva encima (el monedero)
--   · xp_militar / xp_cultural / xp_administrativo — experiencia por dominio
--     (武/文/政); el NIVEL de cada dominio se DERIVA del xp en el cliente.
-- Sube al COMPLETAR misiones/expediciones del dominio correspondiente.
--
-- Modelo de CONFIANZA (como puntos_mision / snapshots): el cliente escribe su
-- propio registro. Lectura pública; escritura solo del dueño del personaje (o
-- admin). El dinero se guardará "a salvo" en casa cuando existan las casas de
-- mecenas (siguiente paso); de momento el monedero ES el dinero.
--
-- Clave = miembro_id (= personaje id = walker.id). Es PERSONAL, no por hacienda.
-- Requiere: personajes.sql, perfiles.sql.
-- Ejecuta este script UNA vez en: Supabase → SQL Editor → New query → Run.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.mecenas_stats (
  miembro_id         uuid not null primary key,         -- = personaje id (= walker.id)
  dinero             integer not null default 0,
  xp_militar         integer not null default 0,
  xp_cultural        integer not null default 0,
  xp_administrativo  integer not null default 0,
  actualizado        timestamptz not null default now()
);

alter table public.mecenas_stats enable row level security;

drop policy if exists mecenas_stats_read on public.mecenas_stats;
create policy mecenas_stats_read on public.mecenas_stats for select using ( true );

drop policy if exists mecenas_stats_owner_write on public.mecenas_stats;
create policy mecenas_stats_owner_write on public.mecenas_stats for all
  using      ( miembro_id in (select id from public.personajes where owner = auth.uid()) )
  with check ( miembro_id in (select id from public.personajes where owner = auth.uid()) );

drop policy if exists mecenas_stats_admin on public.mecenas_stats;
create policy mecenas_stats_admin on public.mecenas_stats for all
  using ( public.es_admin() ) with check ( public.es_admin() );
