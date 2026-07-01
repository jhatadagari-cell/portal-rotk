-- ═══════════════════════════════════════════════════════════════════════
-- escaramuzas_sucesos.sql — Capa A2b: DOCTRINA del capitán + SUCESOS de banda.
-- ─────────────────────────────────────────────────────────────────────────
-- Amplía la tabla `escaramuzas` (ver escaramuzas.sql) con:
--   · doctrina : postura fijada por el capitán al lanzar (武 agresiva / 文 cauta /
--                政 diplomática). Es la decisión POR DEFECTO de todos los sucesos si
--                el capitán no está mirando cuando saltan → hace el modelo asíncrono.
--   · sucesos  : { "idxSuceso": choiceIdx } overrides EN VIVO del capitán (A2b-2).
--
-- Los sucesos son deterministas (semilla = id de la banda) y la RESOLUCIÓN sigue
-- ocurriendo en `escaramuza_resolver` (atómica/idempotente): el cliente que resuelve
-- lee doctrina+sucesos, computa el desenlace y le pasa exito/botín/share ya afinados.
-- Solo hay que añadir dónde GUARDAR la doctrina (al lanzar) y los overrides (en vivo).
--
-- Ejecutar una vez en el SQL editor de Supabase (después de escaramuzas.sql).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.escaramuzas add column if not exists doctrina text  not null default '';
alter table public.escaramuzas add column if not exists sucesos  jsonb  not null default '{}'::jsonb;

-- LANZAR ahora guarda la doctrina del capitán (p_doctrina). Se recrea la firma
-- (antes 4 args) para incluirla; el resto de la lógica es idéntica.
drop function if exists public.escaramuza_lanzar(uuid, text, bigint, bigint);
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
  update public.escaramuzas set estado = 'en_curso', inicio_ms = p_now,
    fin_ms = p_now + greatest(30000, coalesce(p_dur_ms, 1800000)),
    doctrina = coalesce(p_doctrina, ''), sucesos = '{}'::jsonb
    where id = p_id returning * into b;
  return b;
end; $$;

-- OVERRIDE EN VIVO (solo el capitán): fija la decisión de UN suceso (p_idx) durante
-- la marcha. Idempotente por índice: sobrescribe la elección de ese suceso.
create or replace function public.escaramuza_suceso(p_id uuid, p_host text, p_idx int, p_choice int)
returns public.escaramuzas language plpgsql security definer set search_path = public as $$
declare b public.escaramuzas;
begin
  select * into b from public.escaramuzas where id = p_id for update;
  if not found then raise exception 'La banda ya no existe'; end if;
  if p_host <> b.host_id then raise exception 'Solo el capitán decide'; end if;
  if b.estado <> 'en_curso' then raise exception 'La escaramuza no está en curso'; end if;
  update public.escaramuzas
    set sucesos = coalesce(b.sucesos, '{}'::jsonb) || jsonb_build_object(p_idx::text, p_choice)
    where id = p_id returning * into b;
  return b;
end; $$;

grant execute on function public.escaramuza_lanzar(uuid,text,bigint,bigint,text) to authenticated, anon;
grant execute on function public.escaramuza_suceso(uuid,text,int,int)             to authenticated, anon;
