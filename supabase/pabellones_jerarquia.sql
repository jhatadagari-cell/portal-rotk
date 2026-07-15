-- ═══════════════════════════════════════════════════════════════════════
-- pabellones_jerarquia.sql — JERARQUÍA de pabellones (Fase 1).
-- ─────────────────────────────────────────────────────────────────────────
-- Estructura social del pabellón, guardada TODA en `haciendas` (una fuente
-- pública y coherente): cada miembro tiene `pabellon` (rol) y `escalafon` (0..5)
-- en `miembros[]`; el fundador nombra `mapa.responsables={militar,cultural,
-- administrativo: personajeId}`. Como `haciendas` es escritura SOLO-admin (RLS),
-- toda mutación del jugador pasa por estas funciones SECURITY DEFINER.
--   · pab_unirse       — el miembro ELIGE su pabellón (o lo deja con '').
--   · pab_responsable  — el FUNDADOR nombra/quita al responsable de un rol.
--   · pab_escalafon    — el RESPONSABLE (o el fundador) sube/baja el escalafón.
-- p_pj = personajeId del que llama. `fundador` puede estar como personajeId o
-- como id de miembro (histórico) → se acepta resolviendo el miembro, igual que
-- casa_construir. Ejecutar una vez en el SQL editor de Supabase.
-- ═══════════════════════════════════════════════════════════════════════

-- Un miembro se UNE a un pabellón (militar|cultural|administrativo) o lo deja ('').
create or replace function public.pab_unirse(p_hac text, p_pj text, p_rol text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h public.haciendas;
begin
  if coalesce(p_rol,'') not in ('', 'militar', 'cultural', 'administrativo') then raise exception 'Rol no válido'; end if;
  select * into h from public.haciendas where id = p_hac for update;
  if not found then raise exception 'La hacienda no existe'; end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(h.miembros, '[]'::jsonb)) e where e ->> 'personajeId' = p_pj) then
    raise exception 'No perteneces a esta hacienda'; end if;
  -- El escalafón se GANA por mérito (aporte a la investigación), no se regala:
  -- al cambiar de pabellón el aporte arranca de cero (rango fresco en el nuevo).
  update public.haciendas set miembros = (
    select jsonb_agg(case when e ->> 'personajeId' = p_pj then e || jsonb_build_object('pabellon', p_rol, 'aporte', 0) else e end)
    from jsonb_array_elements(coalesce(miembros, '[]'::jsonb)) e)
    where id = p_hac returning * into h;
  return jsonb_build_object('miembros', h.miembros);
end; $$;

-- El FUNDADOR nombra al responsable (personajeId) de un pabellón (o lo quita con '').
create or replace function public.pab_responsable(p_hac text, p_pj text, p_rol text, p_target text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h public.haciendas;
begin
  if p_rol not in ('militar', 'cultural', 'administrativo') then raise exception 'Rol no válido'; end if;
  select * into h from public.haciendas where id = p_hac for update;
  if not found then raise exception 'La hacienda no existe'; end if;
  if coalesce(h.mapa ->> 'fundador', '') <> p_pj
     and not exists (select 1 from jsonb_array_elements(coalesce(h.miembros, '[]'::jsonb)) m
                     where m ->> 'id' = (h.mapa ->> 'fundador') and m ->> 'personajeId' = p_pj) then
    raise exception 'Solo el fundador nombra responsables'; end if;
  update public.haciendas set mapa = jsonb_set(
      coalesce(mapa, '{}'::jsonb), '{responsables}',
      coalesce(mapa -> 'responsables', '{}'::jsonb) || jsonb_build_object(p_rol, nullif(p_target, '')))
    where id = p_hac returning * into h;
  return jsonb_build_object('mapa', h.mapa);
end; $$;

-- El RESPONSABLE (o el fundador) cambia el escalafón de un miembro (delta, clamp 0..5).
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

-- ── INVESTIGACIONES (F2) ──────────────────────────────────────────────────
-- Estado por hacienda en mapa.investig = { rol: {id, prog, ts, done?} } y los
-- desbloqueos en mapa.desbloqueos = { clave: true }. El progreso PASIVO lo calcula
-- el cliente (conoce miembros/escalafones/edificios) y estas RPCs fijan el valor
-- absoluto (clamp, nunca a menos). Confianza cliente como el diezmo/terreno.

-- El RESPONSABLE (o fundador) INICIA la investigación del pabellón (prog 0).
-- IDEMPOTENTE: si YA hay una en curso (no `done`) NO la reinicia — devuelve la
-- actual tal cual. Así un cliente con datos viejos (que cree que no hay ninguna)
-- no puede borrar el progreso real al pulsar «Iniciar» otra vez.
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
     or (h.mapa -> 'responsables' ->> p_rol) = p_pj;
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

-- Un MIEMBRO fija el progreso (pasivo acumulado + aportación activa). Nunca baja.
-- Al alcanzar el objetivo con p_done_key, marca el desbloqueo y `done`.
-- p_aporte = puntos de trabajo REAL que aporta este miembro (base, sin escalar);
-- se acumulan en su `aporte`, de donde se DERIVA su escalafón (mérito, no regalo).
drop function if exists public.pab_investig_prog(text, text, text, int, bigint, int, text);
create or replace function public.pab_investig_prog(p_hac text, p_pj text, p_rol text, p_prog int, p_ts bigint, p_target int, p_done_key text, p_aporte int default 0)
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
  -- Acredita el aporte de mérito del miembro que contribuye (solo si va a su pabellón).
  if coalesce(p_aporte, 0) > 0 then
    update public.haciendas set miembros = (
      select jsonb_agg(case when e ->> 'personajeId' = p_pj and (e ->> 'pabellon') = p_rol
          then e || jsonb_build_object('aporte', coalesce((e ->> 'aporte')::int, 0) + p_aporte)
          else e end)
      from jsonb_array_elements(coalesce(miembros, '[]'::jsonb)) e)
      where id = p_hac returning * into h;
  end if;
  return jsonb_build_object('mapa', h.mapa, 'miembros', h.miembros);
end; $$;

-- ── TALENTOS (F3 文): un miembro vuelve de expedición con un NPC ──────────────
-- Añade un NPC (p_npc: {id, nombre, npc:true, aptitud, puntos, desde}) a miembros.
-- p_npc NO lleva personajeId → no es controlable por ningún jugador.
create or replace function public.casa_reclutar(p_hac text, p_pj text, p_npc jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h public.haciendas;
begin
  select * into h from public.haciendas where id = p_hac for update;
  if not found then raise exception 'La hacienda no existe'; end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(h.miembros, '[]'::jsonb)) m where m ->> 'personajeId' = p_pj) then
    raise exception 'No perteneces a esta hacienda'; end if;
  if jsonb_array_length(coalesce(h.miembros, '[]'::jsonb)) >= 40 then raise exception 'La casa está llena'; end if;
  update public.haciendas set miembros = coalesce(miembros, '[]'::jsonb) || jsonb_build_array(p_npc) where id = p_hac returning * into h;
  return jsonb_build_object('miembros', h.miembros);
end; $$;

-- ── DELIMITAR / BORRAR pabellón (el FUNDADOR, desde la finca) ─────────────────
-- La tabla `pabellones` es escritura solo-admin (RLS), así que el fundador crea/borra
-- por estas funciones SECURITY DEFINER. p_seed = [x,y,w,h] (rectángulo ≥100 tiles, lo
-- valida el cliente). p_max = tope de pabellones del tier (lo pasa el cliente).
create or replace function public.pab_delimitar(p_hac text, p_pj text, p_rol text, p_nombre text, p_seed jsonb, p_max int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h public.haciendas; n int; nid uuid;
begin
  if p_rol not in ('militar', 'cultural', 'administrativo') then raise exception 'Rol no válido'; end if;
  select * into h from public.haciendas where id = p_hac;
  if not found then raise exception 'La hacienda no existe'; end if;
  if coalesce(h.mapa ->> 'fundador', '') <> p_pj
     and not exists (select 1 from jsonb_array_elements(coalesce(h.miembros, '[]'::jsonb)) m
                     where m ->> 'id' = (h.mapa ->> 'fundador') and m ->> 'personajeId' = p_pj) then
    raise exception 'Solo el fundador delimita pabellones'; end if;
  select count(*) into n from public.pabellones where hacienda_id = p_hac;
  if n >= greatest(1, coalesce(p_max, 1)) then raise exception 'Has alcanzado el máximo de pabellones para este nivel'; end if;
  insert into public.pabellones (hacienda_id, nombre, rol, seed) values (p_hac, coalesce(p_nombre, ''), p_rol, p_seed) returning id into nid;
  return jsonb_build_object('id', nid);
end; $$;

create or replace function public.pab_borrar(p_hac text, p_pj text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h public.haciendas;
begin
  select * into h from public.haciendas where id = p_hac;
  if not found then raise exception 'La hacienda no existe'; end if;
  if coalesce(h.mapa ->> 'fundador', '') <> p_pj
     and not exists (select 1 from jsonb_array_elements(coalesce(h.miembros, '[]'::jsonb)) m
                     where m ->> 'id' = (h.mapa ->> 'fundador') and m ->> 'personajeId' = p_pj) then
    raise exception 'Solo el fundador borra pabellones'; end if;
  delete from public.pabellones where id = p_id and hacienda_id = p_hac;
  return jsonb_build_object('ok', true);
end; $$;

grant execute on function public.pab_unirse(text,text,text)           to authenticated, anon;
grant execute on function public.pab_responsable(text,text,text,text) to authenticated, anon;
grant execute on function public.pab_escalafon(text,text,text,int)    to authenticated, anon;
grant execute on function public.pab_investig_elegir(text,text,text,text,bigint)      to authenticated, anon;
grant execute on function public.pab_investig_prog(text,text,text,int,bigint,int,text,int) to authenticated, anon;
grant execute on function public.casa_reclutar(text,text,jsonb)                       to authenticated, anon;
grant execute on function public.pab_delimitar(text,text,text,text,jsonb,int)         to authenticated, anon;
grant execute on function public.pab_borrar(text,text,uuid)                           to authenticated, anon;
