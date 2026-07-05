-- ═══════════════════════════════════════════════════════════════════════
-- escaramuzas_encuentros.sql — Capa de ENCUENTROS por participante (rework A-coop).
-- ─────────────────────────────────────────────────────────────────────────
-- Sustituye la vieja doctrina compartida del capitán por un modelo de ENCUENTROS
-- CON DUEÑO: una escaramuza tiene N encuentros = N plazas, cada uno de una APTITUD
-- (militar/cultural/administrativo — el cliente los genera deterministas por id de
-- banda, así que no se guardan). Cada mecenas RESERVA un encuentro (slot 0..plazas-1)
-- y, tras lanzar, lo RESUELVE con opciones (live o al volver). Al final, informe
-- compartido y recompensas agregadas.
--
-- Anti-secuestro: al acabar el tiempo (fin_ms) se aplica YA el cooldown a todos
-- (escaramuza_cerrar_cd) y se marca cd_hecho; a partir de ahí esa banda deja de
-- "ocuparte" (crear/unir la ignoran) → puedes montar otra aunque la anterior siga
-- pendiente de resolver. La liquidación (escaramuza_resolver) espera a que TODOS los
-- encuentros estén resueltos o a que pasen 12 h; entonces reparte y solo cuentan los
-- encuentros resueltos.
--
-- Ejecutar una vez en el SQL editor de Supabase, DESPUÉS de:
--   escaramuzas.sql · escaramuzas_sucesos.sql · escaramuzas_escenarios.sql · talentos_c2.sql
-- (supersede la firma de escaramuza_lanzar y escaramuza_resolver de esos ficheros).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.escaramuzas add column if not exists reservaciones jsonb   not null default '{}'::jsonb;  -- { pjId: slotIdx }
alter table public.escaramuzas add column if not exists resultados    jsonb   not null default '{}'::jsonb;  -- { slotIdx: { ok, opt } }
alter table public.escaramuzas add column if not exists cd_hecho      boolean not null default false;        -- cooldown ya aplicado al llegar fin_ms

-- ── CREAR / UNIR / SALIR: una banda con cd_hecho ya NO te "ocupa" ──────────────
-- (así, tras el cooldown, puedes montar/unirte a otra aunque la anterior siga sin
-- liquidar). Se recrean con la misma firma que en escaramuzas_escenarios.sql.
create or replace function public.escaramuza_crear(
  p_hac text, p_host text, p_nombre text, p_plazas int, p_dif int, p_coste int, p_escenario text default '')
returns public.escaramuzas language plpgsql security definer set search_path = public as $$
declare b public.escaramuzas;
begin
  if exists (select 1 from public.escaramuzas e where e.hacienda_id = p_hac and coalesce(e.cd_hecho,false) = false
             and e.miembros @> jsonb_build_array(jsonb_build_object('id', p_host))) then
    raise exception 'Ya estás en una banda';
  end if;
  insert into public.escaramuzas (hacienda_id, host_id, host_nombre, plazas, dificultad, estado, miembros, coste, escenario)
  values (p_hac, p_host, coalesce(p_nombre,''), greatest(2, least(4, coalesce(p_plazas,3))),
          coalesce(p_dif,4), 'abierta',
          jsonb_build_array(jsonb_build_object('id', p_host, 'nombre', coalesce(p_nombre,''))),
          coalesce(p_coste,0), coalesce(p_escenario,''))
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
  if exists (select 1 from public.escaramuzas e where e.hacienda_id = b.hacienda_id and coalesce(e.cd_hecho,false) = false
             and e.miembros @> jsonb_build_array(jsonb_build_object('id', p_pj))) then
    raise exception 'Ya estás en otra banda';
  end if;
  if jsonb_array_length(b.miembros) >= b.plazas then raise exception 'La banda está llena'; end if;
  update public.escaramuzas
    set miembros = miembros || jsonb_build_array(jsonb_build_object('id', p_pj, 'nombre', coalesce(p_nombre,'')))
    where id = p_id returning * into b;
  return b;
end; $$;

-- Al salir se libera también la reserva del que se va (deja su encuentro libre).
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
  update public.escaramuzas set miembros = resto, reservaciones = coalesce(reservaciones,'{}'::jsonb) - p_pj
    where id = p_id returning * into b;
  return b;
end; $$;

-- ── RESERVAR un encuentro (slot 0..plazas-1) antes de lanzar ───────────────────
-- Un encuentro por mecenas; cada slot es exclusivo. Reservar de nuevo cambia el tuyo.
create or replace function public.escaramuza_reservar(p_id uuid, p_pj text, p_slot int)
returns public.escaramuzas language plpgsql security definer set search_path = public as $$
declare b public.escaramuzas;
begin
  select * into b from public.escaramuzas where id = p_id for update;
  if not found then raise exception 'La banda ya no existe'; end if;
  if b.estado <> 'abierta' then raise exception 'La banda ya ha partido'; end if;
  if not (b.miembros @> jsonb_build_array(jsonb_build_object('id', p_pj))) then raise exception 'No eres de la banda'; end if;
  if p_slot < 0 or p_slot >= b.plazas then raise exception 'Encuentro inválido'; end if;
  if exists (select 1 from jsonb_each_text(coalesce(b.reservaciones,'{}'::jsonb)) e where e.key <> p_pj and e.value = p_slot::text) then
    raise exception 'Ese encuentro ya está reservado';
  end if;
  update public.escaramuzas
    set reservaciones = (coalesce(b.reservaciones,'{}'::jsonb) - p_pj) || jsonb_build_object(p_pj, p_slot)
    where id = p_id returning * into b;
  return b;
end; $$;

-- ── LANZAR: exige que TODOS los encuentros (=plazas) estén reservados ───────────
-- Mantiene p_doctrina por compatibilidad de firma (ya no se usa en el modelo nuevo).
drop function if exists public.escaramuza_lanzar(uuid, text, bigint, bigint, text);
create or replace function public.escaramuza_lanzar(
  p_id uuid, p_host text, p_now bigint, p_dur_ms bigint default 1800000, p_doctrina text default '')
returns public.escaramuzas language plpgsql security definer set search_path = public as $$
declare b public.escaramuzas;
begin
  select * into b from public.escaramuzas where id = p_id for update;
  if not found then raise exception 'La banda ya no existe'; end if;
  if p_host <> b.host_id then raise exception 'Solo el capitán puede lanzar'; end if;
  if b.estado <> 'abierta' then raise exception 'La banda ya ha partido'; end if;
  if jsonb_array_length(b.miembros) < 2 then raise exception 'Hacen falta al menos 2 mecenas'; end if;
  if (select count(*) from jsonb_object_keys(coalesce(b.reservaciones,'{}'::jsonb))) < b.plazas then
    raise exception 'Cada mecenas debe elegir su encuentro antes de lanzar';
  end if;
  update public.escaramuzas set estado = 'en_curso', inicio_ms = p_now,
    fin_ms = p_now + greatest(30000, coalesce(p_dur_ms, 1800000)),
    doctrina = coalesce(p_doctrina, ''), resultados = '{}'::jsonb, cd_hecho = false
    where id = p_id returning * into b;
  return b;
end; $$;

-- ── RESOLVER MI ENCUENTRO (durante la marcha o al volver, mientras 'en_curso') ──
-- El mecenas registra el desenlace (ok + opción elegida) de SU encuentro reservado.
create or replace function public.escaramuza_resolver_encuentro(
  p_id uuid, p_pj text, p_slot int, p_ok boolean, p_opt int)
returns public.escaramuzas language plpgsql security definer set search_path = public as $$
declare b public.escaramuzas;
begin
  select * into b from public.escaramuzas where id = p_id for update;
  if not found then raise exception 'La banda ya no existe'; end if;
  if b.estado <> 'en_curso' then raise exception 'La escaramuza no está en curso'; end if;
  if coalesce(b.reservaciones ->> p_pj, '') <> p_slot::text then raise exception 'Ese no es tu encuentro'; end if;
  if b.resultados ? p_slot::text then return b; end if;   -- ya resuelto (idempotente)
  update public.escaramuzas
    set resultados = coalesce(b.resultados,'{}'::jsonb) || jsonb_build_object(p_slot::text, jsonb_build_object('ok', p_ok, 'opt', coalesce(p_opt,0)))
    where id = p_id returning * into b;
  return b;
end; $$;

-- ── CERRAR COOLDOWN al llegar fin_ms (anti-secuestro) ──────────────────────────
-- Aplica el cooldown (1 h desde fin_ms) a todos y marca cd_hecho. Idempotente. A
-- partir de aquí la banda deja de "ocupar" a sus miembros (pueden montar otra).
create or replace function public.escaramuza_cerrar_cd(p_id uuid, p_now bigint)
returns public.escaramuzas language plpgsql security definer set search_path = public as $$
declare b public.escaramuzas; m jsonb; mid text; cd bigint;
begin
  select * into b from public.escaramuzas where id = p_id for update;
  if not found then return null; end if;
  if b.estado <> 'en_curso' or p_now < b.fin_ms or b.cd_hecho then return b; end if;
  cd := b.fin_ms + 3600000;   -- cooldown 1 h contado desde el regreso
  for m in select jsonb_array_elements(b.miembros) loop
    mid := m->>'id';
    update public.mecenas_stats set escaramuza_cd = cd where miembro_id = mid::uuid;
    if not found then insert into public.mecenas_stats (miembro_id, escaramuza_cd) values (mid::uuid, cd); end if;
  end loop;
  update public.escaramuzas set cd_hecho = true where id = p_id returning * into b;
  return b;
end; $$;

-- ── LIQUIDAR (reparto final): cuando TODOS los encuentros están resueltos o 12 h ─
-- Aplica dinero/heridas/botín y transiciona la banda. IDEMPOTENTE (solo la 1ª surte
-- efecto). El cooldown NO se toca aquí (ya lo puso cerrar_cd; si no llegó, se aplica
-- una vez con la misma referencia fin_ms). exito/share/botín los propone el cliente
-- agregando los encuentros resueltos (los no resueltos a las 12 h se ignoran).
drop function if exists public.escaramuza_resolver(uuid,bigint,boolean,jsonb,int,int);
drop function if exists public.escaramuza_resolver(uuid,bigint,boolean,jsonb,int,int,bigint);
drop function if exists public.escaramuza_resolver(uuid,bigint,boolean,jsonb,int,int,bigint,jsonb);
drop function if exists public.escaramuza_resolver(uuid,bigint,boolean,jsonb,int,int,bigint,jsonb,int);
create or replace function public.escaramuza_resolver(
  p_id uuid, p_now bigint, p_exito boolean, p_botin jsonb, p_share int, p_host_bonus int,
  p_loot_ms bigint default 3600000, p_bonos jsonb default '{}'::jsonb, p_heridas int default null)
returns public.escaramuzas language plpgsql security definer set search_path = public as $$
declare b public.escaramuzas; m jsonb; mid text; delta int; cd bigint; pct numeric; wdelta int;
begin
  select * into b from public.escaramuzas where id = p_id for update;
  if not found then return null; end if;
  if b.estado <> 'en_curso' or p_now < b.fin_ms then return b; end if;   -- ya resuelta o aún no toca
  -- Espera a que TODOS los encuentros estén resueltos, salvo que hayan pasado 12 h.
  if (select count(*) from jsonb_object_keys(coalesce(b.resultados,'{}'::jsonb))) < b.plazas
     and p_now < b.fin_ms + 43200000 then
    return b;
  end if;
  cd := b.fin_ms + 3600000;
  wdelta := greatest(0, least(3, coalesce(p_heridas, 1)));   -- 虎將: p_heridas=0 → sin herida
  for m in select jsonb_array_elements(b.miembros) loop
    mid := m->>'id';
    if p_exito then
      pct := coalesce((p_bonos ->> mid)::numeric, 0);
      delta := round(coalesce(p_share,0) * (1 + pct)) + case when mid = b.host_id then b.coste + coalesce(p_host_bonus,0) else 0 end;
      if b.cd_hecho then
        update public.mecenas_stats set dinero = dinero + delta where miembro_id = mid::uuid;
        if not found then insert into public.mecenas_stats (miembro_id, dinero, escaramuza_cd) values (mid::uuid, delta, cd); end if;
      else
        update public.mecenas_stats set dinero = dinero + delta, escaramuza_cd = cd where miembro_id = mid::uuid;
        if not found then insert into public.mecenas_stats (miembro_id, dinero, escaramuza_cd) values (mid::uuid, delta, cd); end if;
      end if;
    else
      if b.cd_hecho then
        update public.mecenas_stats set heridas = least(3, heridas + wdelta) where miembro_id = mid::uuid;
        if not found then insert into public.mecenas_stats (miembro_id, heridas, escaramuza_cd) values (mid::uuid, wdelta, cd); end if;
      else
        update public.mecenas_stats set heridas = least(3, heridas + wdelta), escaramuza_cd = cd where miembro_id = mid::uuid;
        if not found then insert into public.mecenas_stats (miembro_id, heridas, escaramuza_cd) values (mid::uuid, wdelta, cd); end if;
      end if;
    end if;
  end loop;
  update public.escaramuzas set
    estado = case when p_exito then 'botin' else 'resuelta' end,
    exito = p_exito, cd_hecho = true,
    botin = case when p_exito then coalesce(p_botin, '[]'::jsonb) else '[]'::jsonb end,
    loot_hasta = case when p_exito then p_now + greatest(15000, coalesce(p_loot_ms, 3600000)) else 0 end
    where id = p_id returning * into b;
  return b;
end; $$;

-- ── Grants ─────────────────────────────────────────────────────────────────────
grant execute on function public.escaramuza_crear(text,text,text,int,int,int,text)                       to authenticated, anon;
grant execute on function public.escaramuza_unir(uuid,text,text)                                          to authenticated, anon;
grant execute on function public.escaramuza_salir(uuid,text)                                              to authenticated, anon;
grant execute on function public.escaramuza_reservar(uuid,text,int)                                       to authenticated, anon;
grant execute on function public.escaramuza_lanzar(uuid,text,bigint,bigint,text)                          to authenticated, anon;
grant execute on function public.escaramuza_resolver_encuentro(uuid,text,int,boolean,int)                 to authenticated, anon;
grant execute on function public.escaramuza_cerrar_cd(uuid,bigint)                                        to authenticated, anon;
grant execute on function public.escaramuza_resolver(uuid,bigint,boolean,jsonb,int,int,bigint,jsonb,int)  to authenticated, anon;
