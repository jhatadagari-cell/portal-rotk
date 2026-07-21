-- ════════════════════════════════════════════════════════════════════════
-- hogares.sql — PROPIEDAD de casa por DUEÑO (no por posición).
-- ────────────────────────────────────────────────────────────────────────
-- La casa de un mecenas se identifica por `construccion.dueno` = id de MIEMBRO
-- (igual que las asignadas por el admin). Así, al MOVER la casa en Obras el dueño
-- viaja con el edificio y no se rompe nada (antes se rastreaba por posición en el
-- stat casa_pos → mover la casa dejaba «huérfano» al dueño).
--
-- · casa_reclamar_hogar: un miembro reclama una casa LIBRE (dueno null) como suya.
-- · casa_soltar_hogar:   suelta su casa (dueno → null).
-- Pago (monedas personales) lo hace el cliente (HacStats); aquí solo la propiedad.
--
-- Ejecuta este script UNA vez en: Supabase → SQL Editor → New query → Run.
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.casa_reclamar_hogar(p_hac text, p_pj text, p_pos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  h public.haciendas; v_mid text; px int; py int; c jsonb; out_cons jsonb := '[]'::jsonb; v_found boolean := false;
begin
  select * into h from public.haciendas where id = p_hac for update;
  if not found then raise exception 'La hacienda no existe'; end if;
  -- dueño = id de MIEMBRO del que llama (mapea su personajeId → id de miembro).
  select (m ->> 'id') into v_mid from jsonb_array_elements(coalesce(h.miembros, '[]'::jsonb)) m
    where m ->> 'personajeId' = p_pj limit 1;
  if v_mid is null then raise exception 'No eres miembro de esta casa'; end if;
  px := (p_pos ->> 0)::int; py := (p_pos ->> 1)::int;
  -- ¿ya tienes OTRA casa? (una construccion 'casa' con dueno = tú en otra posición)
  if exists (select 1 from jsonb_array_elements(coalesce(h.mapa -> 'construcciones', '[]'::jsonb)) c
             where c ->> 'tipo' = 'casa' and c ->> 'dueno' = v_mid
               and not ((c -> 'pos' ->> 0)::int = px and (c -> 'pos' ->> 1)::int = py)) then
    raise exception 'Ya tienes casa';
  end if;
  -- Reconstruye construcciones estampando el dueño en la casa libre de (px,py).
  for c in select * from jsonb_array_elements(coalesce(h.mapa -> 'construcciones', '[]'::jsonb)) loop
    if c ->> 'tipo' = 'casa' and (c -> 'pos' ->> 0)::int = px and (c -> 'pos' ->> 1)::int = py then
      if (c ->> 'dueno') is not null and (c ->> 'dueno') <> v_mid then raise exception 'Esa casa ya tiene dueño'; end if;
      c := jsonb_set(c, '{dueno}', to_jsonb(v_mid)); v_found := true;
    end if;
    out_cons := out_cons || jsonb_build_array(c);
  end loop;
  if not v_found then raise exception 'No hay casa en esa posición'; end if;
  update public.haciendas set mapa = jsonb_set(coalesce(mapa, '{"v":1,"construcciones":[]}'::jsonb), '{construcciones}', out_cons)
    where id = p_hac returning * into h;
  return jsonb_build_object('ok', true, 'dueno', v_mid, 'mapa', h.mapa);
end $$;

create or replace function public.casa_soltar_hogar(p_hac text, p_pj text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  h public.haciendas; v_mid text; c jsonb; out_cons jsonb := '[]'::jsonb;
begin
  select * into h from public.haciendas where id = p_hac for update;
  if not found then raise exception 'La hacienda no existe'; end if;
  select (m ->> 'id') into v_mid from jsonb_array_elements(coalesce(h.miembros, '[]'::jsonb)) m
    where m ->> 'personajeId' = p_pj limit 1;
  if v_mid is null then return jsonb_build_object('ok', true, 'mapa', h.mapa); end if;
  for c in select * from jsonb_array_elements(coalesce(h.mapa -> 'construcciones', '[]'::jsonb)) loop
    if c ->> 'tipo' = 'casa' and c ->> 'dueno' = v_mid then c := jsonb_set(c, '{dueno}', 'null'::jsonb); end if;
    out_cons := out_cons || jsonb_build_array(c);
  end loop;
  update public.haciendas set mapa = jsonb_set(coalesce(mapa, '{"v":1,"construcciones":[]}'::jsonb), '{construcciones}', out_cons)
    where id = p_hac returning * into h;
  return jsonb_build_object('ok', true, 'mapa', h.mapa);
end $$;

grant execute on function public.casa_reclamar_hogar(text, text, jsonb) to authenticated, anon;
grant execute on function public.casa_soltar_hogar(text, text) to authenticated, anon;
