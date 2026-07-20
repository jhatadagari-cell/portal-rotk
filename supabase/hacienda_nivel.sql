-- ════════════════════════════════════════════════════════════════════════
-- Ascenso de nivel de la finca · el FUNDADOR lo confirma desde el juego
-- ────────────────────────────────────────────────────────────────────────
-- El nivel de la finca (mapa.tier) es un TRINQUETE: el prestigio DESBLOQUEA la
-- subida, pero no la aplica sola — alguien la CONFIRMA. Antes solo se podía desde
-- el panel de admin; esta RPC deja hacerlo al FUNDADOR desde la propia finca.
--
-- Recalcula el PRESTIGIO en el SERVIDOR (no se fía del cliente):
--     prestigio = puntos_extra + Σ miembros.puntos + Σ puntos_mision
-- y sube mapa.tier hasta el mayor nivel cuyo umbral esté cubierto. Trinquete:
-- solo sube, nunca baja. Idempotente: si ya está al nivel alcanzable, no toca nada
-- y devuelve subio:false.
--
-- Ejecuta este script UNA vez en: Supabase → SQL Editor → New query → Run.
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.casa_subir_nivel(p_hac text, p_pj text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  h        public.haciendas;
  v_prest  bigint := 0;
  v_ledger bigint := 0;
  v_actual int := 1;
  v_alcanz int := 1;
  m jsonb;
  i int;
  -- Umbrales de nivel — ESPEJO de HAC_TIERS.umbral en assets/js/haciendas-data.js
  -- (niveles 1..6). Si cambias los umbrales allí, cámbialos aquí.
  c_umbral constant bigint[] := array[0, 15000, 50000, 120000, 300000, 650000];
begin
  select * into h from public.haciendas where id = p_hac for update;
  if not found then raise exception 'La hacienda no existe'; end if;
  -- Solo el FUNDADOR: mapa.fundador = personajeId directo, o = id de MIEMBRO histórico.
  if coalesce(h.mapa ->> 'fundador', '') <> p_pj
     and not exists (select 1 from jsonb_array_elements(coalesce(h.miembros, '[]'::jsonb)) mm
                     where mm ->> 'id' = (h.mapa ->> 'fundador') and mm ->> 'personajeId' = p_pj) then
    raise exception 'Solo el fundador puede ampliar la finca';
  end if;
  -- Prestigio colectivo, recalculado en servidor.
  v_prest := coalesce(h.puntos_extra, 0);
  for m in select jsonb_array_elements(coalesce(h.miembros, '[]'::jsonb)) loop
    v_prest := v_prest + coalesce((m ->> 'puntos')::bigint, 0);
  end loop;
  select coalesce(sum(puntos), 0) into v_ledger from public.puntos_mision where hacienda_id = p_hac;
  v_prest := v_prest + v_ledger;
  -- Nivel alcanzable = mayor tier cuyo umbral ≤ prestigio.
  for i in 1 .. array_length(c_umbral, 1) loop
    if v_prest >= c_umbral[i] then v_alcanz := i; end if;
  end loop;
  v_actual := greatest(1, coalesce((h.mapa ->> 'tier')::int, 1));
  if v_alcanz <= v_actual then
    return jsonb_build_object('subio', false, 'tier', v_actual, 'prestigio', v_prest, 'mapa', h.mapa);
  end if;
  update public.haciendas
    set mapa = jsonb_set(coalesce(mapa, '{"v":1,"construcciones":[]}'::jsonb), '{tier}', to_jsonb(v_alcanz))
    where id = p_hac returning * into h;
  return jsonb_build_object('subio', true, 'tier', v_alcanz, 'desde', v_actual, 'prestigio', v_prest, 'mapa', h.mapa);
end; $$;

grant execute on function public.casa_subir_nivel(text, text) to authenticated, anon;
