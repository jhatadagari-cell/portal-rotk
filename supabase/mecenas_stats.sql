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
  cap_inventario     integer not null default 8,        -- tamaño del inventario (ampliable en el mercado)
  inventario         jsonb   not null default '[]'::jsonb, -- objetos comprados [{id, n}]
  ahorro             integer not null default 0,        -- dinero guardado A SALVO en casa (requiere casa de mecenas)
  casa_pos           text,                              -- "gx,gy" de la casa que el mecenas COMPRÓ en la finca (null = sin casa)
  casa_inv           jsonb   not null default '[]'::jsonb, -- objetos GUARDADOS en casa [{id, n}] (almacén del hogar)
  equipado           jsonb   not null default '[]'::jsonb, -- objetos EQUIPADOS en el personaje (máx 3) [id, …]
  heridas            integer not null default 0,          -- heridas del personaje (0..3); sin efecto aún, se reciben al fracasar escaramuzas
  escaramuza_cd      bigint  not null default 0,           -- ms: hasta cuándo no puede montar/unirse a otra escaramuza (cooldown 1h)
  venta_cd           jsonb   not null default '{}'::jsonb, -- enfriamiento de VENTA por objeto {itemId: untilMs}: si el mercader se marcha al regatear, ese objeto no se puede vender en 24 h
  actualizado        timestamptz not null default now()
);

-- Si la tabla ya existía de una versión previa, añade las columnas nuevas.
alter table public.mecenas_stats add column if not exists cap_inventario integer not null default 8;
alter table public.mecenas_stats add column if not exists inventario jsonb not null default '[]'::jsonb;
alter table public.mecenas_stats add column if not exists ahorro integer not null default 0;
alter table public.mecenas_stats add column if not exists casa_pos text;
alter table public.mecenas_stats add column if not exists casa_inv jsonb not null default '[]'::jsonb;
alter table public.mecenas_stats add column if not exists equipado jsonb not null default '[]'::jsonb;
alter table public.mecenas_stats add column if not exists heridas integer not null default 0;
alter table public.mecenas_stats add column if not exists escaramuza_cd bigint not null default 0;
alter table public.mecenas_stats add column if not exists venta_cd jsonb not null default '{}'::jsonb;

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
