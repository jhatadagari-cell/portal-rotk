-- ═══════════════════════════════════════════════════════════════════════
-- peregrinaje.sql — «En busca del legendario curandero» (华佗 Hua Tuo).
-- ─────────────────────────────────────────────────────────────────────────
-- Método ALTERNATIVO de curación: un mecenas MALHERIDO (3/3) organiza un
-- peregrinaje a la montaña del gran sabio. Es un evento exterior COOPERATIVO
-- montado sobre la MISMA tabla `escaramuzas` (escenario = 'peregrinaje-huatuo'):
-- se reutiliza crear/unir/salir/abortar y la animación de salida por el portón.
-- Solo cambian LANZAR (admite ir SOLO y dura 1 h) y RESOLVER (cura en vez de
-- botín + secuela permanente al fracasar), que viven aquí en sus propias RPC.
--
--   · ÉXITO   → el sabio cura 1..3 heridas (al azar) al organizador.
--   · FRACASO → el organizador vuelve con 1 herida MENOS pero una SECUELA
--               permanente (manco/tuerto…); cada escolta de la lista del
--               cliente puede volver con +1 herida. Riesgo base 25 %, que baja
--               según la CALIDAD de los escoltas (lo calcula el cliente).
--   · Cooldown 1 h reutilizando mecenas_stats.escaramuza_cd (compartido con
--     escaramuzas: peregrinar también consume el turno de salir).
--
-- Requiere: escaramuzas.sql (tabla + RPC base) y mecenas_stats.sql.
-- Ejecutar una vez en el SQL editor de Supabase (después de escaramuzas.sql).
-- ═══════════════════════════════════════════════════════════════════════

-- SECUELAS permanentes (cosméticas): lista de ids ['manco','tuerto',…] que el
-- render del personaje usa para dibujar el brazo perdido / el parche. Son de por
-- vida (no se curan). Las escribe SOLO esta RPC; el cliente las lee.
alter table public.mecenas_stats add column if not exists secuelas jsonb not null default '[]'::jsonb;

-- LANZAR el peregrinaje: como escaramuza_lanzar pero admite partir SOLO (≥1
-- mecenas) y dura 1 h por defecto (en modo test ?escfast=1 el cliente pasa ~1 min).
create or replace function public.peregrinaje_lanzar(
  p_id uuid, p_host text, p_now bigint, p_dur_ms bigint default 3600000)
returns public.escaramuzas language plpgsql security definer set search_path = public as $$
declare b public.escaramuzas;
begin
  select * into b from public.escaramuzas where id = p_id for update;
  if not found then raise exception 'El peregrinaje ya no existe'; end if;
  if p_host <> b.host_id then raise exception 'Solo quien lo organiza puede partir'; end if;
  if b.estado <> 'abierta' then raise exception 'El peregrinaje ya ha partido'; end if;
  if jsonb_array_length(b.miembros) < 1 then raise exception 'No hay nadie que peregrine'; end if;
  update public.escaramuzas set estado = 'en_curso', inicio_ms = p_now,
    fin_ms = p_now + greatest(30000, coalesce(p_dur_ms, 3600000))
    where id = p_id returning * into b;
  return b;
end; $$;

-- RESOLVER al volver (≥ fin). IDEMPOTENTE: solo el primer cliente que la llame con
-- el peregrinaje aún 'en_curso' y cumplido el tiempo surte efecto. El cliente tira
-- el dado (riesgo/curadas/secuela/escoltas heridos) igual que en las escaramuzas.
--   p_curadas  : heridas a curar al organizador si hay ÉXITO (1..3).
--   p_perm     : id de secuela a añadir al organizador si FRACASA ('' = ninguna).
--   p_escoltas : lista de ids de escolta que vuelven heridos si FRACASA.
create or replace function public.peregrinaje_resolver(
  p_id uuid, p_now bigint, p_exito boolean, p_curadas int, p_perm text, p_escoltas jsonb default '[]'::jsonb)
returns public.escaramuzas language plpgsql security definer set search_path = public as $$
declare b public.escaramuzas; m jsonb; mid text; cd bigint;
begin
  select * into b from public.escaramuzas where id = p_id for update;
  if not found then return null; end if;
  if b.estado <> 'en_curso' or p_now < b.fin_ms then return b; end if;   -- ya resuelto o aún no toca
  cd := p_now + 3600000;                                                 -- cooldown 1 h (compartido con escaramuzas)
  for m in select jsonb_array_elements(b.miembros) loop
    mid := m->>'id';
    -- OJO: mecenas_stats.miembro_id es UUID y `mid` es TEXT (del jsonb) → castear.
    if mid = b.host_id then
      -- EL HERIDO (organizador).
      if p_exito then
        update public.mecenas_stats
          set heridas = greatest(0, heridas - greatest(1, coalesce(p_curadas, 1))), escaramuza_cd = cd
          where miembro_id = mid::uuid;
        if not found then insert into public.mecenas_stats (miembro_id, escaramuza_cd) values (mid::uuid, cd); end if;
      else
        update public.mecenas_stats
          set heridas = greatest(0, heridas - 1),
              secuelas = case when coalesce(p_perm, '') <> '' and not (secuelas @> to_jsonb(p_perm))
                              then secuelas || to_jsonb(p_perm) else secuelas end,
              escaramuza_cd = cd
          where miembro_id = mid::uuid;
        if not found then
          insert into public.mecenas_stats (miembro_id, heridas, secuelas, escaramuza_cd)
          values (mid::uuid, 0, case when coalesce(p_perm, '') <> '' then jsonb_build_array(p_perm) else '[]'::jsonb end, cd);
        end if;
      end if;
    else
      -- ESCOLTA: en el fracaso puede volver herido (si su id está en la lista del cliente).
      if (not p_exito) and (p_escoltas @> to_jsonb(mid)) then
        update public.mecenas_stats set heridas = least(3, heridas + 1), escaramuza_cd = cd where miembro_id = mid::uuid;
        if not found then insert into public.mecenas_stats (miembro_id, heridas, escaramuza_cd) values (mid::uuid, 1, cd); end if;
      else
        update public.mecenas_stats set escaramuza_cd = cd where miembro_id = mid::uuid;
        if not found then insert into public.mecenas_stats (miembro_id, escaramuza_cd) values (mid::uuid, cd); end if;
      end if;
    end if;
  end loop;
  update public.escaramuzas set estado = 'resuelta', exito = p_exito, botin = '[]'::jsonb, loot_hasta = 0
    where id = p_id returning * into b;
  return b;
end; $$;

grant execute on function public.peregrinaje_lanzar(uuid,text,bigint,bigint)             to authenticated, anon;
grant execute on function public.peregrinaje_resolver(uuid,bigint,boolean,int,text,jsonb) to authenticated, anon;
