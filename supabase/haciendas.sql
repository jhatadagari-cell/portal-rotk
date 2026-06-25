-- ════════════════════════════════════════════════════════════════════════
-- Haciendas · esquema en Supabase
-- ────────────────────────────────────────────────────────────────────────
-- Ejecuta este script UNA vez en: Supabase → SQL Editor → New query → Run.
-- Crea la tabla `haciendas`, activa RLS (lectura pública, escritura solo del
-- admin por email) y deja sembrada la hacienda de ejemplo (Sima).
-- ════════════════════════════════════════════════════════════════════════

-- ── Tabla ──────────────────────────────────────────────────────────────────
create table if not exists public.haciendas (
  id           text primary key,
  nombre       text not null,
  zh           text        default '',
  color        text        default '#c9a84c',
  lema         text        default '',
  fundada      text        default '',
  descripcion  text        default '',
  puntos_extra integer     default 0,
  miembros     jsonb       default '[]'::jsonb,
  mapa         jsonb       default '{"v":1,"construcciones":[]}'::jsonb,
  updated_at   timestamptz default now()
);

-- Migración para tablas ya creadas antes de existir `mapa` (no destructivo).
alter table public.haciendas
  add column if not exists mapa jsonb default '{"v":1,"construcciones":[]}'::jsonb;

-- Mantener `updated_at` al día en cada cambio.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists haciendas_updated_at on public.haciendas;
create trigger haciendas_updated_at
  before update on public.haciendas
  for each row execute function public.set_updated_at();

-- ── Seguridad (RLS) ────────────────────────────────────────────────────────
alter table public.haciendas enable row level security;

-- Lectura pública (la página de haciendas es visible para todos, sin login).
drop policy if exists haciendas_read on public.haciendas;
create policy haciendas_read
  on public.haciendas for select
  using (true);

-- Escritura SOLO para el administrador (su email en el JWT de la sesión).
drop policy if exists haciendas_admin_write on public.haciendas;
create policy haciendas_admin_write
  on public.haciendas for all
  using      ( (auth.jwt() ->> 'email') = 'jhatadagari@gmail.com' )
  with check ( (auth.jwt() ->> 'email') = 'jhatadagari@gmail.com' );

-- ── Semilla: hacienda de ejemplo (Sima) ────────────────────────────────────
-- Si ya existe, se actualiza; bórrala desde el panel cuando tengas datos reales.
insert into public.haciendas (id, nombre, zh, color, lema, fundada, descripcion, puntos_extra, miembros, mapa)
values (
  'sima', 'Hacienda Sima', '司馬莊', '#8820b0',
  'El tiempo lo conquista todo.', '2026',
  'La primera hacienda del portal. Quien la sostiene comparte el destino de un linaje que supo esperar su hora.',
  0,
  '[
    {"id":"m-ej1","nombre":"Mecenas de ejemplo","puntos":110,"desde":"2026-05","nota":"Sostuvo la hacienda desde su fundación."},
    {"id":"m-ej2","nombre":"Otro ejemplo","puntos":20,"desde":"2026-05","nota":""},
    {"id":"m-ej3","nombre":"Tercer ejemplo","puntos":5,"desde":"2026-05","nota":""}
  ]'::jsonb,
  '{"v":1,"construcciones":[
    {"pos":[0,0],"tipo":"salon","rot":0,"dueno":"m-ej1","nivel":1},
    {"pos":[3,0],"tipo":"pabellon","rot":0,"dueno":"m-ej2","nivel":1},
    {"pos":[0,3],"tipo":"galeria","rot":1,"dueno":null,"nivel":1}
  ]}'::jsonb
)
on conflict (id) do update set
  nombre = excluded.nombre, zh = excluded.zh, color = excluded.color,
  lema = excluded.lema, fundada = excluded.fundada,
  descripcion = excluded.descripcion, puntos_extra = excluded.puntos_extra,
  miembros = excluded.miembros, mapa = excluded.mapa;
