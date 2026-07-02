-- ═══════════════════════════════════════════════════════════════════════
-- talentos_c2.sql — Sendas C2: el talento 虎將 (General Tigre) puede anular la
-- herida al fracasar una escaramuza. Añade p_heridas a escaramuza_resolver
-- (nº de heridas a aplicar por miembro al fracasar; por defecto 1). El cliente
-- pasa 0 si la banda lleva un 虎將. Ejecutar una vez tras escaramuzas.sql.
-- ═══════════════════════════════════════════════════════════════════════
drop function if exists public.escaramuza_resolver(uuid,bigint,boolean,jsonb,int,int,bigint,jsonb);
create or replace function public.escaramuza_resolver(
  p_id uuid, p_now bigint, p_exito boolean, p_botin jsonb, p_share int, p_host_bonus int,
  p_loot_ms bigint default 3600000, p_bonos jsonb default '{}'::jsonb, p_heridas int default 1)
returns public.escaramuzas language plpgsql security definer set search_path = public as $$
declare b public.escaramuzas; m jsonb; mid text; delta int; cd bigint; pct numeric; her int;
begin
  select * into b from public.escaramuzas where id = p_id for update;
  if not found then return null; end if;
  if b.estado <> 'en_curso' or p_now < b.fin_ms then return b; end if;   -- ya resuelta o aún no toca
  cd := p_now + 3600000;                                                 -- cooldown 1 h
  her := greatest(0, coalesce(p_heridas, 1));                            -- 虎將 → 0
  for m in select jsonb_array_elements(b.miembros) loop
    mid := m->>'id';
    if p_exito then
      pct := coalesce((p_bonos ->> mid)::numeric, 0);
      delta := round(coalesce(p_share,0) * (1 + pct)) + case when mid = b.host_id then b.coste + coalesce(p_host_bonus,0) else 0 end;
      update public.mecenas_stats set dinero = dinero + delta, escaramuza_cd = cd where miembro_id = mid::uuid;
      if not found then insert into public.mecenas_stats (miembro_id, dinero, escaramuza_cd) values (mid::uuid, delta, cd); end if;
    else
      update public.mecenas_stats set heridas = least(3, heridas + her), escaramuza_cd = cd where miembro_id = mid::uuid;
      if not found then insert into public.mecenas_stats (miembro_id, heridas, escaramuza_cd) values (mid::uuid, her, cd); end if;
    end if;
  end loop;
  update public.escaramuzas set
    estado = case when p_exito then 'botin' else 'resuelta' end,
    exito = p_exito,
    botin = case when p_exito then coalesce(p_botin, '[]'::jsonb) else '[]'::jsonb end,
    loot_hasta = case when p_exito then p_now + greatest(15000, coalesce(p_loot_ms, 3600000)) else 0 end
    where id = p_id returning * into b;
  return b;
end; $$;
grant execute on function public.escaramuza_resolver(uuid,bigint,boolean,jsonb,int,int,bigint,jsonb,int) to authenticated, anon;
