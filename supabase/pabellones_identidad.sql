-- ═══════════════════════════════════════════════════════════════════════
-- pabellones_identidad.sql — Membresía y responsable de pabellón POR IDENTIDAD.
-- ─────────────────────────────────────────────────────────────────────────
-- ANTES: un miembro guardaba `pabellon` = ROL (militar|cultural|administrativo) y
-- el responsable vivía en mapa.responsables[ROL]. Era frágil: al REFORMAR un
-- pabellón (cambiar rol/tamaño) los miembros dejaban de casar y «desaparecían».
--
-- AHORA: `pabellon` = ID (uuid) del pabellón concreto, y responsables[ID] = personajeId.
-- El vínculo sobrevive a cualquier reforma (el id no cambia). La INVESTIGACIÓN sigue
-- siendo por ROL (mapa.investig[rol] + mapa.desbloqueos[clave]): es un árbol tecnológico
-- por dominio a nivel de hacienda; cualquier pabellón de ese rol lo impulsa.
--
-- Ejecuta este script UNA vez en: Supabase → SQL Editor → New query → Run.
-- Incluye la MIGRACIÓN de los datos existentes (idempotente) + las RPC redefinidas.
-- ═══════════════════════════════════════════════════════════════════════

-- ── MIGRACIÓN (una vez, idempotente) ─────────────────────────────────────
-- Convierte miembros.pabellon (ROL → id del 1.er pabellón de ese rol) y
-- mapa.responsables (clave ROL → clave id). Los valores que ya son uuid se dejan.
do $$
declare hh record; pab record; rol_to_id jsonb; nm jsonb; nr jsonb; kv record;
begin
  for hh in select id, miembros, mapa from public.haciendas loop
    -- Mapa ROL → id del primer pabellón de ese rol en la hacienda.
    rol_to_id := '{}'::jsonb;
    for pab in select rol, id from public.pabellones where hacienda_id = hh.id order by created_at loop
      if pab.rol in ('militar','cultural','administrativo') and not (rol_to_id ? pab.rol)
        then rol_to_id := rol_to_id || jsonb_build_object(pab.rol, pab.id::text); end if;
    end loop;

    -- Miembros: pabellon ROL → id (o '' si ese rol no tiene pabellón). uuid ya migrado se deja.
    nm := (select jsonb_agg(
        case when (m ->> 'pabellon') in ('militar','cultural','administrativo')
             then m || jsonb_build_object('pabellon', coalesce(rol_to_id ->> (m ->> 'pabellon'), ''))
             else m end)
      from jsonb_array_elements(coalesce(hh.miembros, '[]'::jsonb)) m);

    -- Responsables: clave ROL → clave id. uuid ya migrado se deja.
    nr := '{}'::jsonb;
    if hh.mapa ? 'responsables' then
      for kv in select key, value from jsonb_each_text(hh.mapa -> 'responsables') loop
        if kv.value is null or kv.value = '' then continue; end if;
        if kv.key in ('militar','cultural','administrativo') then
          if rol_to_id ? kv.key then nr := nr || jsonb_build_object(rol_to_id ->> kv.key, kv.value); end if;
        else
          nr := nr || jsonb_build_object(kv.key, kv.value);   -- ya es id
        end if;
      end loop;
    end if;

    update public.haciendas
      set miembros = coalesce(nm, miembros),
          mapa = jsonb_set(coalesce(mapa, '{}'::jsonb), '{responsables}', nr)
      where id = hh.id;
  end loop;
end $$;

-- ── pab_unirse (por ID) ──────────────────────────────────────────────────
-- Un miembro se UNE a un pabellón concreto (p_pab_id) o lo deja (''). El escalafón
-- se GANA por mérito → al cambiar de pabellón el aporte arranca de cero.
-- OJO: la versión antigua tenía el 3.er parámetro `p_rol`. Postgres NO permite cambiar el
-- nombre de un parámetro con CREATE OR REPLACE → hay que DROP explícito primero.
drop function if exists public.pab_unirse(text, text, text);
create or replace function public.pab_unirse(p_hac text, p_pj text, p_pab_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h public.haciendas;
begin
  select * into h from public.haciendas where id = p_hac for update;
  if not found then raise exception 'La hacienda no existe'; end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(h.miembros, '[]'::jsonb)) e where e ->> 'personajeId' = p_pj) then
    raise exception 'No perteneces a esta hacienda'; end if;
  if coalesce(p_pab_id,'') <> '' and not exists (select 1 from public.pabellones where id = p_pab_id::uuid and hacienda_id = p_hac) then
    raise exception 'Ese pabellón no existe en esta hacienda'; end if;
  update public.haciendas set miembros = (
    select jsonb_agg(case when e ->> 'personajeId' = p_pj then e || jsonb_build_object('pabellon', coalesce(p_pab_id,''), 'aporte', 0) else e end)
    from jsonb_array_elements(coalesce(miembros, '[]'::jsonb)) e)
    where id = p_hac returning * into h;
  return jsonb_build_object('miembros', h.miembros);
end; $$;

-- ── pab_responsable (por ID) ─────────────────────────────────────────────
-- El FUNDADOR nombra al responsable (personajeId) de un pabellón concreto (o lo quita).
-- Antes el 3.er parámetro era `p_rol` → DROP explícito antes de recrear (ver nota en pab_unirse).
drop function if exists public.pab_responsable(text, text, text, text);
create or replace function public.pab_responsable(p_hac text, p_pj text, p_pab_id text, p_target text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h public.haciendas;
begin
  select * into h from public.haciendas where id = p_hac for update;
  if not found then raise exception 'La hacienda no existe'; end if;
  if coalesce(h.mapa ->> 'fundador', '') <> p_pj
     and not exists (select 1 from jsonb_array_elements(coalesce(h.miembros, '[]'::jsonb)) m
                     where m ->> 'id' = (h.mapa ->> 'fundador') and m ->> 'personajeId' = p_pj) then
    raise exception 'Solo el fundador nombra responsables'; end if;
  if coalesce(p_pab_id,'') = '' or not exists (select 1 from public.pabellones where id = p_pab_id::uuid and hacienda_id = p_hac) then
    raise exception 'Ese pabellón no existe en esta hacienda'; end if;
  update public.haciendas set mapa = jsonb_set(
      coalesce(mapa, '{}'::jsonb), '{responsables}',
      coalesce(mapa -> 'responsables', '{}'::jsonb) || jsonb_build_object(p_pab_id, nullif(p_target, '')))
    where id = p_hac returning * into h;
  return jsonb_build_object('mapa', h.mapa);
end; $$;

-- ── pab_escalafon (sin cambios de firma) ─────────────────────────────────
-- Responsable (valor de responsables, siga la clave que siga) o fundador. Igual que antes.
create or replace function public.pab_escalafon(p_hac text, p_pj text, p_target text, p_delta int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h public.haciendas; v_ok boolean;
begin
  select * into h from public.haciendas where id = p_hac for update;
  if not found then raise exception 'La hacienda no existe'; end if;
  v_ok := coalesce(h.mapa ->> 'fundador', '') = p_pj
     or exists (select 1 from jsonb_array_elements(coalesce(h.miembros, '[]'::jsonb)) m
                where m ->> 'id' = (h.mapa ->> 'fundador') and m ->> 'personajeId' = p_pj)
     or exists (select 1 from jsonb_each_text(coalesce(h.mapa -> 'responsables', '{}'::jsonb)) r where r.value = p_pj);
  if not v_ok then raise exception 'Solo el fundador o un responsable ascienden'; end if;
  update public.haciendas set miembros = (
    select jsonb_agg(case when e ->> 'personajeId' = p_target
        then e || jsonb_build_object('escalafon', greatest(0, least(5, coalesce((e ->> 'escalafon')::int, 0) + coalesce(p_delta, 0))))
        else e end)
    from jsonb_array_elements(coalesce(miembros, '[]'::jsonb)) e)
    where id = p_hac returning * into h;
  return jsonb_build_object('miembros', h.miembros);
end; $$;

-- ── pab_investig_elegir (por ROL; auth por responsable de un pabellón de ese rol) ──
create or replace function public.pab_investig_elegir(p_hac text, p_pj text, p_rol text, p_id text, p_ts bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h public.haciendas; v_ok boolean; v_cur jsonb;
begin
  if p_rol not in ('militar', 'cultural', 'administrativo') then raise exception 'Rol no válido'; end if;
  select * into h from public.haciendas where id = p_hac for update;
  if not found then raise exception 'La hacienda no existe'; end if;
  v_ok := coalesce(h.mapa ->> 'fundador', '') = p_pj
     or exists (select 1 from jsonb_array_elements(coalesce(h.miembros, '[]'::jsonb)) m
                where m ->> 'id' = (h.mapa ->> 'fundador') and m ->> 'personajeId' = p_pj)
     or exists (select 1 from public.pabellones pb where pb.hacienda_id = p_hac and pb.rol = p_rol
                and (h.mapa -> 'responsables' ->> pb.id::text) = p_pj);
  if not v_ok then raise exception 'Solo el responsable o el fundador eligen la investigación'; end if;
  v_cur := h.mapa -> 'investig' -> p_rol;
  if v_cur is not null and coalesce((v_cur ->> 'done')::boolean, false) = false then
    return jsonb_build_object('mapa', h.mapa);   -- ya en curso → no reiniciar
  end if;
  update public.haciendas set mapa = jsonb_set(
      jsonb_set(coalesce(mapa, '{}'::jsonb), '{investig}', coalesce(mapa -> 'investig', '{}'::jsonb)),
      array['investig', p_rol], jsonb_build_object('id', p_id, 'prog', 0, 'ts', p_ts))
    where id = p_hac returning * into h;
  return jsonb_build_object('mapa', h.mapa);
end; $$;

-- ── pab_investig_prog (por ROL; aporte de mérito acreditado por PABELLÓN del que contribuye) ──
drop function if exists public.pab_investig_prog(text, text, text, int, bigint, int, text);
drop function if exists public.pab_investig_prog(text, text, text, int, bigint, int, text, int);
create or replace function public.pab_investig_prog(p_hac text, p_pj text, p_rol text, p_prog int, p_ts bigint, p_target int, p_done_key text, p_aporte int default 0, p_pab_id text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare h public.haciendas; v_cur jsonb; v_prog int; v_tgt int;
begin
  select * into h from public.haciendas where id = p_hac for update;
  if not found then raise exception 'La hacienda no existe'; end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(h.miembros, '[]'::jsonb)) m where m ->> 'personajeId' = p_pj) then
    raise exception 'No perteneces a esta hacienda'; end if;
  v_cur := h.mapa -> 'investig' -> p_rol;
  if v_cur is null or coalesce((v_cur ->> 'done')::boolean, false) then raise exception 'No hay investigación en curso'; end if;
  v_tgt := coalesce(p_target, 999999);
  v_prog := least(v_tgt, greatest(coalesce((v_cur ->> 'prog')::int, 0), greatest(0, coalesce(p_prog, 0))));
  if v_prog >= v_tgt and coalesce(p_done_key, '') <> '' then
    update public.haciendas set mapa = jsonb_set(
        jsonb_set(
          jsonb_set(coalesce(mapa, '{}'::jsonb), '{desbloqueos}', coalesce(mapa -> 'desbloqueos', '{}'::jsonb) || jsonb_build_object(p_done_key, true)),
          '{investig}', coalesce(mapa -> 'investig', '{}'::jsonb)),
        array['investig', p_rol], jsonb_build_object('id', v_cur ->> 'id', 'prog', v_tgt, 'ts', p_ts, 'done', true))
      where id = p_hac returning * into h;
  else
    update public.haciendas set mapa = jsonb_set(
        jsonb_set(coalesce(mapa, '{}'::jsonb), '{investig}', coalesce(mapa -> 'investig', '{}'::jsonb)),
        array['investig', p_rol], jsonb_build_object('id', v_cur ->> 'id', 'prog', v_prog, 'ts', p_ts))
      where id = p_hac returning * into h;
  end if;
  -- Acredita el aporte de mérito SOLO al miembro que contribuye y solo si está en el
  -- pabellón indicado (por id). El escalafón se DERIVA de este `aporte`.
  if coalesce(p_aporte, 0) > 0 and coalesce(p_pab_id,'') <> '' then
    update public.haciendas set miembros = (
      select jsonb_agg(case when e ->> 'personajeId' = p_pj and (e ->> 'pabellon') = p_pab_id
          then e || jsonb_build_object('aporte', coalesce((e ->> 'aporte')::int, 0) + p_aporte)
          else e end)
      from jsonb_array_elements(coalesce(miembros, '[]'::jsonb)) e)
      where id = p_hac returning * into h;
  end if;
  return jsonb_build_object('mapa', h.mapa, 'miembros', h.miembros);
end; $$;

grant execute on function public.pab_unirse(text,text,text)              to authenticated, anon;
grant execute on function public.pab_responsable(text,text,text,text)    to authenticated, anon;
grant execute on function public.pab_escalafon(text,text,text,int)       to authenticated, anon;
grant execute on function public.pab_investig_elegir(text,text,text,text,bigint)          to authenticated, anon;
grant execute on function public.pab_investig_prog(text,text,text,int,bigint,int,text,int,text) to authenticated, anon;
