-- ════════════════════════════════════════════════════════════════════════
-- Terreno EXTERIOR de la finca · el FUNDADOR lo compra desde el juego
-- ────────────────────────────────────────────────────────────────────────
-- Fuera de las murallas se compra un anillo perimetral construible (solo para
-- edificios exteriores: campamento…). Se compra por niveles 3→6, en orden, y
-- cada nivel ensancha el anillo (RING_PASO=5 celdas por nivel). Antes solo lo
-- hacía el panel de admin; esta RPC deja hacerlo al FUNDADOR desde la finca.
--
-- MONEDA: prestigio − `mapa.gastado` (saldo). Recalcula el PRESTIGIO en el
-- SERVIDOR (no se fía del cliente):
--     prestigio = puntos_extra + Σ miembros.puntos + Σ puntos_mision
-- Reglas (ESPEJO de admin-haciendas + hac-build.js):
--   · nivel a comprar = exteriorTier≥3 ? exteriorTier+1 : 3
--   · no superar el nivel 6 ni el `mapa.tier` CONFIRMADO de la casa
--   · saldo (prestigio − gastado) ≥ coste del nivel
-- Efecto: mapa.exteriorTier = next, mapa.gastado += coste. Idempotente: si no
-- procede (topado o sin saldo), no toca nada y devuelve comprado:false.
--
-- Ejecuta este script UNA vez en: Supabase → SQL Editor → New query → Run.
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.casa_comprar_terreno(p_hac text, p_pj text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  h         public.haciendas;
  v_prest   bigint := 0;
  v_ledger  bigint := 0;
  v_gastado bigint := 0;
  v_saldo   bigint := 0;
  v_tier    int := 1;
  v_eT      int := 0;
  v_next    int := 3;
  v_coste   bigint := 0;
  m jsonb;
  -- Coste por nivel exterior 3..6 — ESPEJO de COSTE_EXTERIOR en hac-build.js.
  c_coste constant bigint[] := array[2000, 4500, 9000, 18000];   -- índices 1..4 = niveles 3..6
begin
  select * into h from public.haciendas where id = p_hac for update;
  if not found then raise exception 'La hacienda no existe'; end if;
  -- Solo el FUNDADOR: mapa.fundador = personajeId directo, o = id de MIEMBRO histórico.
  if coalesce(h.mapa ->> 'fundador', '') <> p_pj
     and not exists (select 1 from jsonb_array_elements(coalesce(h.miembros, '[]'::jsonb)) mm
                     where mm ->> 'id' = (h.mapa ->> 'fundador') and mm ->> 'personajeId' = p_pj) then
    raise exception 'Solo el fundador puede comprar terreno';
  end if;
  -- Prestigio colectivo, recalculado en servidor.
  v_prest := coalesce(h.puntos_extra, 0);
  for m in select jsonb_array_elements(coalesce(h.miembros, '[]'::jsonb)) loop
    v_prest := v_prest + coalesce((m ->> 'puntos')::bigint, 0);
  end loop;
  select coalesce(sum(puntos), 0) into v_ledger from public.puntos_mision where hacienda_id = p_hac;
  v_prest := v_prest + v_ledger;

  v_gastado := coalesce((h.mapa ->> 'gastado')::bigint, 0);
  v_saldo   := greatest(0, v_prest - v_gastado);
  v_tier    := greatest(1, coalesce((h.mapa ->> 'tier')::int, 1));
  v_eT      := coalesce((h.mapa ->> 'exteriorTier')::int, 0);
  v_next    := case when v_eT >= 3 then v_eT + 1 else 3 end;

  -- Topes: no pasar del nivel 6 ni del nivel CONFIRMADO de la casa.
  if v_next > 6 or v_next > v_tier then
    return jsonb_build_object('comprado', false, 'motivo', 'nivel', 'exteriorTier', v_eT, 'saldo', v_saldo, 'mapa', h.mapa);
  end if;
  v_coste := c_coste[v_next - 2];
  if v_saldo < v_coste then
    return jsonb_build_object('comprado', false, 'motivo', 'saldo', 'exteriorTier', v_eT, 'saldo', v_saldo, 'coste', v_coste, 'mapa', h.mapa);
  end if;

  update public.haciendas
    set mapa = jsonb_set(
                 jsonb_set(coalesce(mapa, '{"v":1,"construcciones":[]}'::jsonb), '{exteriorTier}', to_jsonb(v_next)),
                 '{gastado}', to_jsonb(v_gastado + v_coste))
    where id = p_hac returning * into h;
  return jsonb_build_object('comprado', true, 'exteriorTier', v_next, 'desde', v_eT, 'coste', v_coste,
                            'saldo', greatest(0, v_prest - (v_gastado + v_coste)), 'mapa', h.mapa);
end; $$;

grant execute on function public.casa_comprar_terreno(text, text) to authenticated, anon;
