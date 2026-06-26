-- ════════════════════════════════════════════════════════════════════════
-- Tareas de edificios · esquema en Supabase
-- ────────────────────────────────────────────────────────────────────────
-- Catálogo GLOBAL (igual para todas las haciendas) de las tareas que un mecenas
-- puede hacer DENTRO de cada TIPO de edificio. Varias tareas por tipo: al entrar,
-- el mecenas elige una al azar y permanece dentro `duracion_seg` segundos.
-- Se administra desde la pestaña «Tareas» de admin-haciendas.html.
-- Ejecuta este script UNA vez en: Supabase → SQL Editor → New query → Run.
-- ════════════════════════════════════════════════════════════════════════

-- ── Tabla ──────────────────────────────────────────────────────────────────
create table if not exists public.edificio_tareas (
  id            uuid primary key default gen_random_uuid(),
  tipo_edificio text not null,                 -- id del catálogo: 'cuartel', 'templo'…
  nombre        text not null default '',      -- infinitivo, para el admin: "Entrenar"
  verbo         text not null default '',      -- gerundio, línea de actividad: "Entrenando"
  duracion_seg  int  not null default 30,      -- cuánto tarda en hacerla
  orden         int  not null default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists edificio_tareas_tipo_idx on public.edificio_tareas(tipo_edificio);

-- Mantener `updated_at` al día (reusa la función de haciendas.sql; si no existe,
-- descomenta el bloque).
-- create or replace function public.set_updated_at()
-- returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists edificio_tareas_updated_at on public.edificio_tareas;
create trigger edificio_tareas_updated_at
  before update on public.edificio_tareas
  for each row execute function public.set_updated_at();

-- ── Seguridad (RLS) ────────────────────────────────────────────────────────
alter table public.edificio_tareas enable row level security;

drop policy if exists edificio_tareas_read on public.edificio_tareas;
create policy edificio_tareas_read
  on public.edificio_tareas for select
  using (true);

drop policy if exists edificio_tareas_admin_write on public.edificio_tareas;
create policy edificio_tareas_admin_write
  on public.edificio_tareas for all
  using      ( (auth.jwt() ->> 'email') = 'jhatadagari@gmail.com' )
  with check ( (auth.jwt() ->> 'email') = 'jhatadagari@gmail.com' );

-- ── Seed inicial (una tarea por tipo de edificio) ───────────────────────────
-- Solo siembra si la tabla está vacía (puedes re-ejecutar el script sin duplicar).
insert into public.edificio_tareas (tipo_edificio, nombre, verbo, duracion_seg, orden)
select * from (values
  ('pabellon', 'Departir', 'Departiendo', 20, 0),
  ('torre', 'Vigilar', 'Vigilando', 30, 0),
  ('pagoda', 'Contemplar', 'Contemplando las vistas', 30, 0),
  ('galeria', 'Conversar', 'Conversando', 20, 0),
  ('armeria', 'Revisar armas', 'Revisando el armamento', 25, 0),
  ('ala', 'Deliberar', 'Deliberando', 30, 0),
  ('templo', 'Orar', 'Orando', 35, 0),
  ('gran-pagoda', 'Contemplar', 'Contemplando las vistas', 35, 0),
  ('salon', 'Presidir audiencia', 'Presidiendo audiencia', 35, 0),
  ('templo-ancestral', 'Honrar a los ancestros', 'Honrando a los ancestros', 45, 0),
  ('salon-gran', 'Dar audiencia', 'En audiencia', 30, 0),
  ('pabellon-gran', 'Celebrar banquete', 'En el banquete', 30, 0),
  ('salon-corte', 'Audiencia de corte', 'En audiencia de corte', 40, 0),
  ('palacio', 'Oficiar ceremonia', 'En ceremonia', 45, 0),
  ('salon-largo', 'Dar audiencia', 'En audiencia', 30, 0),
  ('salon-banquete', 'Celebrar banquete', 'En el banquete', 30, 0),
  ('cuartel', 'Entrenar', 'Entrenando', 30, 0),
  ('gran-palacio', 'Oficiar ceremonia', 'En ceremonia', 50, 0),
  ('ala-l', 'Deliberar', 'Deliberando', 30, 0),
  ('ala-l-mayor', 'Deliberar', 'Deliberando', 30, 0),
  ('patio-u', 'Descansar', 'Descansando', 20, 0),
  ('patio-o', 'Descansar', 'Descansando', 20, 0),
  ('salon-doble', 'Dar audiencia', 'En audiencia', 30, 0),
  ('gran-recinto', 'Oficiar ceremonia', 'En ceremonia', 50, 0),
  ('pabellon-te', 'Tomar el té', 'Tomando el té', 25, 0)
) as v(tipo_edificio, nombre, verbo, duracion_seg, orden)
where not exists (select 1 from public.edificio_tareas);
