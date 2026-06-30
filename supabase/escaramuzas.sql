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

-- p_dur_ms permite acortar la expedición en modo test (?escfast=1). Por defecto 30 min.
drop function if exists public.escaramuza_lanzar(uuid, text, bigint);
create or replace function public.escaramuza_lanzar(p_id uuid, p_host text, p_now bigint, p_dur_ms bigint default 1800000)
returns public.escaramuzas language plpgsql security definer set search_path = public as $$
declare b public.escaramuzas;
begin
  select * into b from public.escaramuzas where id = p_id for update;
  if not found then raise exception 'La banda ya no existe'; end if;
  if p_host <> b.host_id then raise exception 'Solo el capitán puede lanzar'; end if;
  if b.estado <> 'abierta' then raise exception 'La banda ya ha partido'; end if;
  if jsonb_array_length(b.miembros) < 2 then raise exception 'Hacen falta al menos 2 mecenas'; end if;
  update public.escaramuzas set estado = 'en_curso', inicio_ms = p_now,
    fin_ms = p_now + greatest(30000, coalesce(p_dur_ms, 1800000))
    where id = p_id returning * into b;
  return b;
end; $$;

-- ABORTAR (solo el capitán): cancela la escaramuza en curso. No hay recompensas;
-- todos vuelven a su hacienda al cabo de `p_dur_ms` (5 min por defecto). Pasa a
-- 'abortando' para que cada cliente re-temporice la vuelta de su mecenas.
create or replace function public.escaramuza_abortar(p_id uuid, p_host text, p_now bigint, p_dur_ms bigint default 300000)
returns public.escaramuzas language plpgsql security definer set search_path = public as $$
declare b public.escaramuzas;
begin
  select * into b from public.escaramuzas where id = p_id for update;
  if not found then raise exception 'La banda ya no existe'; end if;
  if p_host <> b.host_id then raise exception 'Solo el capitán puede abortar'; end if;
  if b.estado <> 'en_curso' then raise exception 'La escaramuza no está en curso'; end if;
  update public.escaramuzas set estado = 'abortando', fin_ms = p_now + greatest(10000, coalesce(p_dur_ms, 300000))
    where id = p_id returning * into b;
  return b;
end; $$;

-- 4d: RECLAMAR un objeto del botín (FCFS atómico). Un objeto por jugador; un objeto
-- por ranura (slot). Cuando todos los miembros han recogido, la banda se cierra.
create or replace function public.escaramuza_reclamar(p_id uuid, p_pj text, p_slot int)
returns public.escaramuzas language plpgsql security definer set search_path = public as $$
declare b public.escaramuzas; e jsonb; v text;
begin
  select * into b from public.escaramuzas where id = p_id for update;
  if not found then raise exception 'La banda ya no existe'; end if;
  if b.estado <> 'botin' then raise exception 'No hay botín que repartir'; end if;
  if not (b.miembros @> jsonb_build_array(jsonb_build_object('id', p_pj))) then raise exception 'No eres de la banda'; end if;
  if p_slot < 0 or p_slot >= jsonb_array_length(b.botin) then raise exception 'Objeto inválido'; end if;
  if b.elecciones ? p_pj then raise exception 'Ya recogiste tu botín'; end if;
  -- ¿ese slot ya lo cogió otro?
  for v in select value::text from jsonb_each_text(b.elecciones) loop
    if v = p_slot::text then raise exception 'Ese objeto ya lo eligió otro'; end if;
  end loop;
  update public.escaramuzas set elecciones = b.elecciones || jsonb_build_object(p_pj, p_slot)
    where id = p_id returning * into b;
  if (select count(*) from jsonb_object_keys(b.elecciones)) >= jsonb_array_length(b.miembros) then
    update public.escaramuzas set estado = 'resuelta' where id = p_id returning * into b;
  end if;
  return b;
end; $$;

-- RESOLUCIÓN (al volver, tras los 30 min): aplica dinero/heridas/cooldown a TODOS
-- los miembros y transiciona la banda. IDEMPOTENTE: solo el primer cliente que la
-- llame con la banda aún 'en_curso' y ya cumplido el tiempo surte efecto; el resto
-- recibe la banda ya resuelta sin reaplicar nada. exito/botín/share los propone el
-- cliente (como en las expediciones de 1 jugador, que ya tiran el dado en cliente).
create or replace function public.escaramuza_resolver(
  p_id uuid, p_now bigint, p_exito boolean, p_botin jsonb, p_share int, p_host_bonus int)
returns public.escaramuzas language plpgsql security definer set search_path = public as $$
declare b public.escaramuzas; m jsonb; mid text; delta int; cd bigint;
begin
  select * into b from public.escaramuzas where id = p_id for update;
  if not found then return null; end if;
  if b.estado <> 'en_curso' or p_now < b.fin_ms then return b; end if;   -- ya resuelta o aún no toca
  cd := p_now + 3600000;                                                 -- cooldown 1 h
  for m in select jsonb_array_elements(b.miembros) loop
    mid := m->>'id';
    if p_exito then
      delta := coalesce(p_share,0) + case when mid = b.host_id then b.coste + coalesce(p_host_bonus,0) else 0 end;
      update public.mecenas_stats set dinero = dinero + delta, escaramuza_cd = cd where miembro_id = mid;
      if not found then insert into public.mecenas_stats (miembro_id, dinero, escaramuza_cd) values (mid, delta, cd); end if;
    else
      update public.mecenas_stats set heridas = least(3, heridas + 1), escaramuza_cd = cd where miembro_id = mid;
      if not found then insert into public.mecenas_stats (miembro_id, heridas, escaramuza_cd) values (mid, 1, cd); end if;
    end if;
  end loop;
  update public.escaramuzas set
    estado = case when p_exito then 'botin' else 'resuelta' end,
    exito = p_exito,
    botin = case when p_exito then coalesce(p_botin, '[]'::jsonb) else '[]'::jsonb end,
    loot_hasta = case when p_exito then p_now + 3600000 else 0 end
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
grant execute on function public.escaramuza_lanzar(uuid,text,bigint,bigint)    to authenticated, anon;
grant execute on function public.escaramuza_resolver(uuid,bigint,boolean,jsonb,int,int) to authenticated, anon;
grant execute on function public.escaramuza_reclamar(uuid,text,int)           to authenticated, anon;
grant execute on function public.escaramuza_abortar(uuid,text,bigint,bigint)  to authenticated, anon;
