-- ═══════════════════════════════════════════════════════════════════════
-- relaciones.sql — Relaciones entre mecenas (afinidad + vínculos nombrados).
-- ─────────────────────────────────────────────────────────────────────────
-- Cada PAREJA de mecenas de una hacienda tiene una fila (a<b, orden canónico):
--   · afinidad: sube al compartir escaramuza (más si éxito). Sinergia pasiva.
--   · tipo/subtipo/origen: vínculo nombrado que BROTA al azar (prob. baja) al
--     resolver una escaramuza. tipo ∈ hermandad|rivalidad|odio|amor. origen =
--     personajeId que SIENTE el vínculo (unilateral); null si mutua/recíproca.
-- Lectura pública (ambos jugadores + paneles lo ven); escritura solo por la RPC
-- SECURITY DEFINER de abajo, idempotente por banda (flag relaciones_hechas).
-- Ejecutar una vez en el SQL editor de Supabase (después de escaramuzas.sql).
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists public.relaciones (
  id           uuid primary key default gen_random_uuid(),
  hacienda_id  text not null,
  a            text not null,             -- personajeId menor (orden canónico del par)
  b            text not null,             -- personajeId mayor
  afinidad     int  not null default 0,
  tipo         text,                      -- null | hermandad | rivalidad | odio | amor
  subtipo      text,                      -- jurada|prometida | competitiva|envidiosa | unilateral|reciproco
  origen       text,                      -- personajeId que siente (unilateral); null si mutua/recíproca
  creada_ms    bigint not null default 0,
  updated_at   timestamptz not null default now(),
  unique (hacienda_id, a, b)
);
create index if not exists relaciones_hac_idx on public.relaciones (hacienda_id);

-- Flag en escaramuzas: procesar afinidad/forjas UNA sola vez por banda.
alter table public.escaramuzas add column if not exists relaciones_hechas boolean not null default false;

-- Aplica (atómico e idempotente) afinidad + forjas de una banda ya resuelta.
-- p_afin:   [{a,b,d}]        (delta de afinidad por par)
-- p_forjas: [{a,b,tipo,subtipo,origen}]  (vínculos a forjar si el par no tiene ya uno)
create or replace function public.escaramuza_relaciones(
  p_id uuid, p_hac text, p_now bigint, p_afin jsonb, p_forjas jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare esc public.escaramuzas; e jsonb; aa text; bb text; d int; t text; st text; og text;
begin
  -- OJO: la variable NO puede llamarse `b` — la tabla `relaciones` tiene columna `b`
  -- y el `on conflict (... , b)` la haría ambigua («column reference "b" is ambiguous»).
  select * into esc from public.escaramuzas where id = p_id for update;
  if not found then return false; end if;
  if esc.relaciones_hechas then return false; end if;              -- ya procesada
  if esc.estado not in ('botin','resuelta') then return false; end if;  -- solo si combatió
  -- Afinidad (upsert por par).
  for e in select value from jsonb_array_elements(coalesce(p_afin, '[]'::jsonb)) t(value) loop
    aa := e->>'a'; bb := e->>'b'; d := coalesce((e->>'d')::int, 0);
    if aa is null or bb is null then continue; end if;
    insert into public.relaciones (hacienda_id, a, b, afinidad, creada_ms)
      values (p_hac, aa, bb, greatest(0, d), p_now)
      on conflict (hacienda_id, a, b)
      do update set afinidad = public.relaciones.afinidad + d, updated_at = now();
  end loop;
  -- Forjas (solo si el par aún NO tiene tipo).
  for e in select value from jsonb_array_elements(coalesce(p_forjas, '[]'::jsonb)) t(value) loop
    aa := e->>'a'; bb := e->>'b'; t := e->>'tipo'; st := e->>'subtipo'; og := nullif(e->>'origen', '');
    if aa is null or bb is null or t is null then continue; end if;
    insert into public.relaciones (hacienda_id, a, b, afinidad, tipo, subtipo, origen, creada_ms)
      values (p_hac, aa, bb, 0, t, st, og, p_now)
      on conflict (hacienda_id, a, b)
      do update set tipo = t, subtipo = st, origen = og, creada_ms = p_now, updated_at = now()
      where public.relaciones.tipo is null;   -- no re-forjar un vínculo ya existente
  end loop;
  update public.escaramuzas set relaciones_hechas = true where id = p_id;
  return true;
end; $$;

-- RLS: lectura pública; escritura solo vía la RPC de arriba.
alter table public.relaciones enable row level security;
drop policy if exists relaciones_read on public.relaciones;
create policy relaciones_read on public.relaciones for select using (true);
grant execute on function public.escaramuza_relaciones(uuid, text, bigint, jsonb, jsonb) to authenticated, anon;
