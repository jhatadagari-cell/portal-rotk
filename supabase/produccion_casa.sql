-- ═══════════════════════════════════════════════════════════════════════
-- produccion_casa.sql — TESORERÍA + ALMACÉN de CASA (Hilo 2: producción→finca).
-- ─────────────────────────────────────────────────────────────────────────
-- El motor es el DIEZMO. Cada miembro guarda su dinero y materiales en su Casa
-- de Mecenas (宅) y cada día PAGA MANUALMENTE un diezmo (~5-10 monedas + algo de
-- material) a la casa. Pagar al día da el bufo "al día con pagos" (+prestigio
-- pasivo); no pagar, un debufo. Los diezmos LLENAN:
--   · tesoreria (MONEDAS reales de la casa)          ← el dinero del diezmo
--   · almacen   (materia prima en bruto {hierro,tinta,grano})  ← el material
-- El FUNDADOR (mapa.fundador) gasta tesoreria + almacen para LEVANTAR edificios.
--
-- · Almacén en BRUTO por recurso: para construir importa la CANTIDAD, no la
--   calidad (la calidad es cosa de los encargos personales).
-- · `aportes[pj].dia` = último día que ese miembro pagó el diezmo → el cliente
--   calcula el bufo/debufo. La tesorería de MONEDAS es propia (distinta del
--   prestigio−gastado que sigue comprando el terreno exterior).
-- · `haciendas` tiene RLS de escritura solo-admin, así que TODA mutación del
--   jugador pasa por estas funciones SECURITY DEFINER (atómicas), como en
--   debates/escaramuzas. RLS de esta tabla: lectura pública, escritura por RPC.
-- Ejecutar una vez en el SQL editor de Supabase.
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists public.produccion_casa (
  hacienda_id  text primary key,
  almacen      jsonb   not null default '{"hierro":0,"tinta":0,"grano":0}'::jsonb,  -- materia prima en bruto
  tesoreria    integer not null default 0,            -- MONEDAS reales de la casa (de los diezmos)
  aportes      jsonb   not null default '{}'::jsonb,  -- { pj: {nombre, hierro, tinta, grano, dinero, dia} }
  updated_at   timestamptz not null default now()
);

create or replace function public.set_updated_at_prodcasa() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;
drop trigger if exists trg_prodcasa_updated on public.produccion_casa;
create trigger trg_prodcasa_updated before update on public.produccion_casa
  for each row execute function public.set_updated_at_prodcasa();

-- ── DIEZMO / APORTAR: un miembro entrega monedas + materiales a la casa ────
-- Cubre el diezmo diario y cualquier aportación voluntaria. p_dinero = monedas a
-- la tesorería; p_lote = {"hierro":n,"tinta":n,"grano":n} al almacén (ya
-- descontados de la Casa de Mecenas por el cliente al confirmar). p_dia =
-- 'YYYY-M-D' sella el día pagado (para el bufo "al día con pagos"). Acumula el
-- crédito por donante en `aportes`.
create or replace function public.casa_diezmo(
  p_hac text, p_pj text, p_pj_nombre text, p_dinero int, p_lote jsonb, p_dia text)
returns public.produccion_casa language plpgsql security definer set search_path = public as $$
declare r public.produccion_casa; k text; add int; cred jsonb;
begin
  insert into public.produccion_casa (hacienda_id) values (p_hac) on conflict (hacienda_id) do nothing;
  select * into r from public.produccion_casa where hacienda_id = p_hac for update;
  -- Guarda (anti-doble-pago): el `for update` serializa dos pagos simultáneos, pero no
  -- impide pagar dos veces. Si este mecenas ya selló HOY (aportes[pj].dia = p_dia),
  -- rechaza: así un doble-clic / dos pestañas no duplican tesorería (el cliente descuenta
  -- su oro SOLO si la RPC no lanza, así que aquí NO cobra de más).
  if coalesce(p_dia, '') <> '' and coalesce(r.aportes -> p_pj ->> 'dia', '') = p_dia then
    raise exception 'Ya pagaste el diezmo hoy';
  end if;
  cred := coalesce(r.aportes -> p_pj, '{}'::jsonb) || jsonb_build_object('nombre', coalesce(p_pj_nombre,''), 'dia', coalesce(p_dia,''));
  -- Monedas a la tesorería.
  add := greatest(0, coalesce(p_dinero, 0));
  r.tesoreria := r.tesoreria + add;
  cred := jsonb_set(cred, array['dinero'], to_jsonb(coalesce((cred ->> 'dinero')::int, 0) + add));
  -- Materiales al almacén.
  foreach k in array array['hierro','tinta','grano'] loop
    add := greatest(0, coalesce((p_lote ->> k)::int, 0));
    if add > 0 then
      r.almacen := jsonb_set(r.almacen, array[k], to_jsonb(coalesce((r.almacen ->> k)::int, 0) + add));
      cred := jsonb_set(cred, array[k], to_jsonb(coalesce((cred ->> k)::int, 0) + add));
    end if;
  end loop;
  update public.produccion_casa
    set almacen = r.almacen, tesoreria = r.tesoreria,
        aportes = jsonb_set(coalesce(aportes,'{}'::jsonb), array[p_pj], cred)
    where hacienda_id = p_hac returning * into r;
  return r;
end; $$;

-- ── CONSTRUIR: el FUNDADOR levanta un edificio ─────────────────────────────
-- Atómico y cruzado (produccion_casa + haciendas): verifica fundador, tesorería
-- (monedas) y materiales; los descuenta; anexa la construcción a mapa.construcciones.
-- p_mat = {"hierro":n,"tinta":n,"grano":n}, p_pos = [gx,gy]. Devuelve mapa + almacen
-- + tesoreria resultantes. La geometría (cabe/no solapa/tier) la valida el cliente
-- (HacBuild.puedeColocar); el servidor blinda recursos y rol.
create or replace function public.casa_construir(
  p_hac text, p_pj text, p_tipo text, p_pos jsonb, p_rot int, p_dueno text,
  p_mat jsonb, p_dinero int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h public.haciendas; r public.produccion_casa; k text; need int; have int;
begin
  select * into h from public.haciendas where id = p_hac for update;
  if not found then raise exception 'La hacienda no existe'; end if;
  -- mapa.fundador puede ser el personajeId directo O el id de MIEMBRO (histórico):
  -- p_pj es personajeId, así que aceptamos ambos (resolviendo el miembro).
  if coalesce(h.mapa ->> 'fundador','') <> p_pj
     and not exists (select 1 from jsonb_array_elements(coalesce(h.miembros,'[]'::jsonb)) m
                     where m ->> 'id' = (h.mapa ->> 'fundador') and m ->> 'personajeId' = p_pj) then
    raise exception 'Solo el fundador de la casa puede construir'; end if;
  insert into public.produccion_casa (hacienda_id) values (p_hac) on conflict (hacienda_id) do nothing;
  select * into r from public.produccion_casa where hacienda_id = p_hac for update;
  -- Tesorería (monedas reales).
  if r.tesoreria < coalesce(p_dinero,0) then
    raise exception 'Tesorería de casa insuficiente (% de %)', r.tesoreria, p_dinero; end if;
  -- Materiales.
  foreach k in array array['hierro','tinta','grano'] loop
    need := greatest(0, coalesce((p_mat ->> k)::int, 0));
    have := coalesce((r.almacen ->> k)::int, 0);
    if have < need then raise exception 'Faltan materiales (%): % de %', k, have, need; end if;
    r.almacen := jsonb_set(r.almacen, array[k], to_jsonb(have - need));
  end loop;
  update public.produccion_casa set almacen = r.almacen, tesoreria = r.tesoreria - coalesce(p_dinero,0)
    where hacienda_id = p_hac returning * into r;
  -- Anexa la construcción al mapa.
  update public.haciendas set mapa = jsonb_set(
      coalesce(mapa,'{"v":1,"construcciones":[]}'::jsonb), '{construcciones}',
      coalesce(mapa -> 'construcciones', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'pos', p_pos, 'tipo', p_tipo, 'rot', coalesce(p_rot,0), 'dueno', p_dueno, 'nivel', 1)))
    where id = p_hac returning * into h;
  return jsonb_build_object('mapa', h.mapa, 'almacen', r.almacen, 'tesoreria', r.tesoreria);
end; $$;

-- ── DEMOLER: el FUNDADOR derriba la construcción cuyo ANCLA está en p_pos ─────
-- Sin reembolso (derribar = quitar del mapa). p_pos = [gx,gy]. Devuelve el mapa.
-- Mover un edificio en el cliente = demoler + volver a construir sin coste.
create or replace function public.casa_demoler(p_hac text, p_pj text, p_pos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h public.haciendas;
begin
  select * into h from public.haciendas where id = p_hac for update;
  if not found then raise exception 'La hacienda no existe'; end if;
  if coalesce(h.mapa ->> 'fundador','') <> p_pj
     and not exists (select 1 from jsonb_array_elements(coalesce(h.miembros,'[]'::jsonb)) m
                     where m ->> 'id' = (h.mapa ->> 'fundador') and m ->> 'personajeId' = p_pj) then
    raise exception 'Solo el fundador de la casa puede derribar'; end if;
  update public.haciendas set mapa = jsonb_set(
      coalesce(mapa,'{"v":1,"construcciones":[]}'::jsonb), '{construcciones}',
      coalesce((select jsonb_agg(e) from jsonb_array_elements(mapa -> 'construcciones') e
                where not ((e -> 'pos' ->> 0) = (p_pos ->> 0) and (e -> 'pos' ->> 1) = (p_pos ->> 1))), '[]'::jsonb))
    where id = p_hac returning * into h;
  return jsonb_build_object('mapa', h.mapa);
end; $$;

-- ── TRIBUTO (F3 政): un miembro ADMINISTRATIVO recibe la caravana ─────────────
-- Deposita monedas + materiales en la casa y sella `mapa.tributo.ts` (temporizador
-- de la próxima caravana). Solo un miembro del pabellón administrativo puede recibir.
--
-- IDEMPOTENTE (anti-doble-cobro): el `for update` de haciendas SERIALIZA dos recepciones
-- simultáneas (dos mecenas 政 a la vez, o un doble-clic), pero por sí solo NO impide
-- reclamar dos veces. La guarda es `mapa.tributo.ts`: la caravana solo está presente si
-- ha pasado el periodo (4 h) desde el último sello. La 1ª recepción resella `ts=p_ts`;
-- la 2ª (que esperaba en el lock) lo lee ya fresco → `p_ts - ts < periodo` → no-op, y
-- devuelve `yaRecibido:true` sin sumar carga ni resellar. (En el primer tributo ts=0 →
-- p_ts - 0 ≫ periodo → procede.)
create or replace function public.casa_tributo(p_hac text, p_pj text, p_dinero int, p_lote jsonb, p_ts bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h public.haciendas; r public.produccion_casa; k text; add int;
        v_last bigint; c_period constant bigint := 4 * 60 * 60 * 1000;   -- 4 h (igual que PERIOD_TRIBUTO en el cliente)
begin
  select * into h from public.haciendas where id = p_hac for update;
  if not found then raise exception 'La hacienda no existe'; end if;
  -- Membresía por IDENTIDAD: m.pabellon = ID de pabellón (no rol). Casa el rol vía la
  -- tabla pabellones. Ver supabase/pabellones_identidad.sql (refactor + migración).
  if not exists (
      select 1 from jsonb_array_elements(coalesce(h.miembros, '[]'::jsonb)) m
      join public.pabellones pb on pb.id::text = (m ->> 'pabellon') and pb.hacienda_id = p_hac
      where m ->> 'personajeId' = p_pj and pb.rol = 'administrativo') then
    raise exception 'Solo un mecenas del pabellón administrativo recibe el tributo'; end if;
  -- ¿La caravana está realmente presente? Si no ha pasado el periodo desde el último
  -- sello, ya la recibió alguien (o es un doble-clic): no sumes nada.
  v_last := coalesce((h.mapa -> 'tributo' ->> 'ts')::bigint, 0);
  if coalesce(p_ts, 0) - v_last < c_period then
    select * into r from public.produccion_casa where hacienda_id = p_hac;
    return jsonb_build_object('yaRecibido', true, 'mapa', h.mapa,
                              'tesoreria', coalesce(r.tesoreria, 0), 'almacen', coalesce(r.almacen, '{}'::jsonb));
  end if;
  insert into public.produccion_casa (hacienda_id) values (p_hac) on conflict (hacienda_id) do nothing;
  select * into r from public.produccion_casa where hacienda_id = p_hac for update;
  r.tesoreria := r.tesoreria + greatest(0, coalesce(p_dinero, 0));
  foreach k in array array['hierro','tinta','grano'] loop
    add := greatest(0, coalesce((p_lote ->> k)::int, 0));
    if add > 0 then r.almacen := jsonb_set(r.almacen, array[k], to_jsonb(coalesce((r.almacen ->> k)::int, 0) + add)); end if;
  end loop;
  update public.produccion_casa set tesoreria = r.tesoreria, almacen = r.almacen where hacienda_id = p_hac;
  update public.haciendas set mapa = jsonb_set(coalesce(mapa, '{}'::jsonb), '{tributo}', jsonb_build_object('ts', p_ts)) where id = p_hac returning * into h;
  return jsonb_build_object('mapa', h.mapa, 'tesoreria', r.tesoreria, 'almacen', r.almacen);
end; $$;

-- ── RLS: lectura pública; escritura solo por las RPC SECURITY DEFINER ──
alter table public.produccion_casa enable row level security;
drop policy if exists prodcasa_read on public.produccion_casa;
create policy prodcasa_read on public.produccion_casa for select using (true);
grant execute on function public.casa_diezmo(text,text,text,int,jsonb,text)             to authenticated, anon;
grant execute on function public.casa_construir(text,text,text,jsonb,int,text,jsonb,int) to authenticated, anon;
grant execute on function public.casa_demoler(text,text,jsonb)                          to authenticated, anon;
grant execute on function public.casa_tributo(text,text,int,jsonb,bigint)               to authenticated, anon;
