-- ═══════════════════════════════════════════════════════════════════════
-- escaramuzas.sql — Expediciones COOPERATIVAS (banda de 2-4 jugadores).
-- ─────────────────────────────────────────────────────────────────────────
-- Un jugador MONTA una banda (paga un coste), otros se UNEN, y el host la LANZA
-- (sale 30 min). Al volver: reparto de dinero (host recupera coste +25% + su
-- parte) y de BOTÍN (≥1 objeto por jugador, elección con resolución de colisiones
-- en 1 h); heridas si fracasa; cooldown 1 h. La lógica de "quién puede qué" vive
-- en el cliente; aquí RLS permisivo para autenticados (endurecer más adelante).
--
-- Ejecutar una vez en el SQL editor de Supabase.
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists public.escaramuzas (
  id           uuid primary key default gen_random_uuid(),
  hacienda_id  text    not null,                       -- finca donde se publica la banda
  host_id      text    not null,                       -- personajeId del que la monta
  host_nombre  text    not null default '',
  plazas       integer not null default 3,             -- objetivo 2..4
  dificultad   integer not null default 4,
  estado       text    not null default 'abierta',     -- abierta | en_curso | botin | resuelta
  miembros     jsonb   not null default '[]'::jsonb,    -- [{id, nombre}] incluye al host
  coste        integer not null default 0,             -- lo que pagó el host por montarla
  inicio_ms    bigint  not null default 0,             -- ms del lanzamiento
  fin_ms       bigint  not null default 0,             -- ms del regreso (inicio + 30 min)
  exito        boolean,                                 -- resultado al resolver
  botin        jsonb   not null default '[]'::jsonb,    -- pool común de objetos [itemId,…]
  elecciones   jsonb   not null default '{}'::jsonb,    -- { personajeId: itemId } elegido del botín
  loot_hasta   bigint  not null default 0,             -- deadline (ms) para resolver colisiones de botín
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists escaramuzas_hac_idx on public.escaramuzas (hacienda_id);

-- updated_at automático
create or replace function public.set_updated_at_escaramuzas() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;
drop trigger if exists trg_escaramuzas_updated on public.escaramuzas;
create trigger trg_escaramuzas_updated before update on public.escaramuzas
  for each row execute function public.set_updated_at_escaramuzas();

-- ── ATOMICIDAD: toda mutación de banda pasa por funciones SECURITY DEFINER ──
-- (evita la carrera last-write-wins de hacer read-modify-write del jsonb en cliente
--  y permite cerrar la escritura directa por RLS).
create or replace function public.escaramuza_crear(
  p_hac text, p_host text, p_nombre text, p_plazas int, p_dif int, p_coste int)
returns public.escaramuzas language plpgsql security definer set search_path = public as $$
declare b public.escaramuzas;
begin
  if exists (select 1 from public.escaramuzas e where e.hacienda_id = p_hac
             and e.miembros @> jsonb_build_array(jsonb_build_object('id', p_host))) then
    raise exception 'Ya estás en una banda';
  end if;
  insert into public.escaramuzas (hacienda_id, host_id, host_nombre, plazas, dificultad, estado, miembros, coste)
  values (p_hac, p_host, coalesce(p_nombre,''), greatest(2, least(4, coalesce(p_plazas,3))),
          coalesce(p_dif,4), 'abierta',
          jsonb_build_array(jsonb_build_object('id', p_host, 'nombre', coalesce(p_nombre,''))),
          coalesce(p_coste,0))
  returning * into b;
  return b;
end; $$;

create or replace function public.escaramuza_unir(p_id uuid, p_pj text, p_nombre text)
returns public.escaramuzas language plpgsql security definer set search_path = public as $$
declare b public.escaramuzas;
begin
  select * into b from public.escaramuzas where id = p_id for update;
  if not found then raise exception 'La banda ya no existe'; end if;
  if b.miembros @> jsonb_build_array(jsonb_build_object('id', p_pj)) then return b; end if;  -- ya dentro
  if b.estado <> 'abierta' then raise exception 'La banda ya ha partido'; end if;
  if exists (select 1 from public.escaramuzas e where e.hacienda_id = b.hacienda_id
             and e.miembros @> jsonb_build_array(jsonb_build_object('id', p_pj))) then
    raise exception 'Ya estás en otra banda';
  end if;
  if jsonb_array_length(b.miembros) >= b.plazas then raise exception 'La banda está llena'; end if;
  update public.escaramuzas
    set miembros = miembros || jsonb_build_array(jsonb_build_object('id', p_pj, 'nombre', coalesce(p_nombre,'')))
    where id = p_id returning * into b;
  return b;
end; $$;

-- Devuelve la banda actualizada, o NULL si se disolvió (sale el host o queda vacía).
create or replace function public.escaramuza_salir(p_id uuid, p_pj text)
returns public.escaramuzas language plpgsql security definer set search_path = public as $$
declare b public.escaramuzas; resto jsonb;
begin
  select * into b from public.escaramuzas where id = p_id for update;
  if not found then return null; end if;
  if p_pj = b.host_id then delete from public.escaramuzas where id = p_id; return null; end if;
  select coalesce(jsonb_agg(e), '[]'::jsonb) into resto
    from jsonb_array_elements(b.miembros) e where e->>'id' <> p_pj;
  if jsonb_array_length(resto) = 0 then delete from public.escaramuzas where id = p_id; return null; end if;
  update public.escaramuzas set miembros = resto where id = p_id returning * into b;
  return b;
end; $$;

create or replace function public.escaramuza_lanzar(p_id uuid, p_host text, p_now bigint)
returns public.escaramuzas language plpgsql security definer set search_path = public as $$
declare b public.escaramuzas;
begin
  select * into b from public.escaramuzas where id = p_id for update;
  if not found then raise exception 'La banda ya no existe'; end if;
  if p_host <> b.host_id then raise exception 'Solo el capitán puede lanzar'; end if;
  if b.estado <> 'abierta' then raise exception 'La banda ya ha partido'; end if;
  if jsonb_array_length(b.miembros) < 2 then raise exception 'Hacen falta al menos 2 mecenas'; end if;
  update public.escaramuzas set estado = 'en_curso', inicio_ms = p_now, fin_ms = p_now + 30*60*1000
    where id = p_id returning * into b;
  return b;
end; $$;

-- RLS: lectura pública; NINGUNA escritura directa (las funciones de arriba, como
-- SECURITY DEFINER, son las únicas que mutan; el cliente las llama vía rpc()).
alter table public.escaramuzas enable row level security;
drop policy if exists escaramuzas_read  on public.escaramuzas;
create policy escaramuzas_read  on public.escaramuzas for select using (true);
drop policy if exists escaramuzas_write on public.escaramuzas;   -- elimina la permisiva anterior
grant execute on function public.escaramuza_crear(text,text,text,int,int,int) to authenticated, anon;
grant execute on function public.escaramuza_unir(uuid,text,text)              to authenticated, anon;
grant execute on function public.escaramuza_salir(uuid,text)                  to authenticated, anon;
grant execute on function public.escaramuza_lanzar(uuid,text,bigint)          to authenticated, anon;
