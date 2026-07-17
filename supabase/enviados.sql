-- ════════════════════════════════════════════════════════════════════════
-- Enviados · esquema en Supabase
-- ────────────────────────────────────────────────────────────────────────
-- Una hacienda de NPC (p.ej. Chengdu 成都 · Shu 蜀) manda un ENVIADO a la
-- hacienda de un jugador. El enviado espera FUERA del portón sur con buenas
-- palabras y una invitación de facción. Cualquier mecenas puede inspeccionarlo
-- y HABLAR con él (flavor); el FUNDADOR puede además INVITARLO A PASAR, tras lo
-- cual el enviado y el fundador pasean juntos por la finca (visita guiada).
--
-- Estado compartido (todos los que abren la hacienda ven lo mismo):
--   estado = 'esperando'  → parado ante el portón, saludando a quien pasa.
--   estado = 'visita'     → invitado; pasea con el fundador por la finca.
--   estado = 'concluido'  → la visita terminó (histórico; no se pinta).
--
-- El enviado es un PERSONAJE del registro global (owner NULL = NPC), con su
-- `faccion` (Shu) — de ahí salen su nombre, 字 cortesía, aptitud, stats y equipo.
-- Por ahora el enviado se despacha a mano (admin / seed); el programador
-- rotatorio (cada X, una de las 3 haciendas) llega en una iteración futura.
--
-- Ejecuta este script UNA vez en: Supabase → SQL Editor → New query → Run.
-- ════════════════════════════════════════════════════════════════════════

-- ── Tabla ──────────────────────────────────────────────────────────────────
create table if not exists public.enviados (
  id           uuid primary key default gen_random_uuid(),
  hacienda_id  text not null references public.haciendas(id)  on delete cascade,  -- hacienda DESTINO (la del jugador)
  personaje_id uuid not null references public.personajes(id) on delete cascade,  -- el enviado (p.ej. Fei Yi 费祎)
  estado       text not null default 'esperando',   -- esperando | visita | concluido
  invitado_por text default null,                    -- personajeId del fundador que lo invitó (NULL hasta invitar)
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- A lo sumo UN enviado activo (no concluido) por hacienda destino.
create unique index if not exists enviados_activo_uq
  on public.enviados(hacienda_id) where (estado <> 'concluido');

create index if not exists enviados_hacienda_idx on public.enviados(hacienda_id);

-- Mantener `updated_at` al día (reusa la función de haciendas.sql).
drop trigger if exists enviados_updated_at on public.enviados;
create trigger enviados_updated_at
  before update on public.enviados
  for each row execute function public.set_updated_at();

-- ── Seguridad (RLS) ────────────────────────────────────────────────────────
alter table public.enviados enable row level security;

-- Lectura pública: todo el que abre la hacienda ve al enviado.
drop policy if exists enviados_read on public.enviados;
create policy enviados_read
  on public.enviados for select
  using (true);

-- Despachar / retirar un enviado es cosa del ADMIN (mismo email que haciendas.sql).
-- El cambio de estado 'esperando'→'visita' lo hace el fundador vía RPC (abajo).
drop policy if exists enviados_admin_write on public.enviados;
create policy enviados_admin_write
  on public.enviados for all
  using      ( (auth.jwt() ->> 'email') = 'jhatadagari@gmail.com' )
  with check ( (auth.jwt() ->> 'email') = 'jhatadagari@gmail.com' );

-- ── RPC · el FUNDADOR invita a pasar al enviado ─────────────────────────────
-- p_pj = personajeId del que llama. `fundador` (mapa.fundador) puede estar como
-- personajeId O como id de MIEMBRO (histórico) → toleramos ambos, igual que en
-- pabellones_jerarquia.sql. security definer: escribe saltándose la RLS admin,
-- pero SOLO tras verificar que el llamante es el fundador de ESA hacienda.
create or replace function public.enviado_invitar(p_hac text, p_pj text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h record; e record;
begin
  select * into h from public.haciendas where id = p_hac;
  if not found then raise exception 'Hacienda no encontrada'; end if;
  if coalesce(h.mapa ->> 'fundador', '') <> p_pj
     and not exists (select 1 from jsonb_array_elements(coalesce(h.miembros, '[]'::jsonb)) m
                     where m ->> 'id' = (h.mapa ->> 'fundador') and m ->> 'personajeId' = p_pj) then
    raise exception 'Solo el fundador invita a pasar al enviado';
  end if;
  select * into e from public.enviados
    where hacienda_id = p_hac and estado = 'esperando' limit 1;
  if not found then raise exception 'No hay ningún enviado esperando'; end if;
  update public.enviados
    set estado = 'visita', invitado_por = p_pj, updated_at = now()
    where id = e.id;
  select * into e from public.enviados where id = e.id;
  return to_jsonb(e);
end $$;

-- ── RPC · el FUNDADOR despide al enviado (concluye la visita) ────────────────
create or replace function public.enviado_concluir(p_hac text, p_pj text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h record; e record;
begin
  select * into h from public.haciendas where id = p_hac;
  if not found then raise exception 'Hacienda no encontrada'; end if;
  if coalesce(h.mapa ->> 'fundador', '') <> p_pj
     and not exists (select 1 from jsonb_array_elements(coalesce(h.miembros, '[]'::jsonb)) m
                     where m ->> 'id' = (h.mapa ->> 'fundador') and m ->> 'personajeId' = p_pj) then
    raise exception 'Solo el fundador despide al enviado';
  end if;
  update public.enviados set estado = 'concluido', updated_at = now()
    where hacienda_id = p_hac and estado <> 'concluido';
  select * into e from public.enviados
    where hacienda_id = p_hac order by updated_at desc limit 1;
  return to_jsonb(e);
end $$;

grant execute on function public.enviado_invitar(text, text) to authenticated;
grant execute on function public.enviado_concluir(text, text) to authenticated;

-- ── RPC · el FUNDADOR ACEPTA la oferta (adhiere la hacienda a la facción) ────
-- La casa se une a la facción del enviado (mapa.faccion = id de esa facción) y la
-- visita concluye. Mismo founder-check que invitar/concluir. Devuelve la facción.
create or replace function public.enviado_aceptar(p_hac text, p_pj text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h record; e record; fac record;
begin
  select * into h from public.haciendas where id = p_hac;
  if not found then raise exception 'Hacienda no encontrada'; end if;
  if coalesce(h.mapa ->> 'fundador', '') <> p_pj
     and not exists (select 1 from jsonb_array_elements(coalesce(h.miembros, '[]'::jsonb)) m
                     where m ->> 'id' = (h.mapa ->> 'fundador') and m ->> 'personajeId' = p_pj) then
    raise exception 'Solo el fundador puede aceptar la oferta';
  end if;
  select * into e from public.enviados
    where hacienda_id = p_hac and estado <> 'concluido' limit 1;
  if not found then raise exception 'No hay ningún enviado que aceptar'; end if;
  select f.* into fac from public.facciones f
    join public.personajes p on p.id = e.personaje_id and p.faccion = f.id;
  if not found then raise exception 'El enviado no pertenece a ninguna facción'; end if;
  update public.haciendas
    set mapa = jsonb_set(coalesce(mapa, '{}'::jsonb), '{faccion}', to_jsonb(fac.id::text), true), updated_at = now()
    where id = p_hac;
  update public.enviados set estado = 'concluido', updated_at = now() where id = e.id;
  return jsonb_build_object('faccion', fac.id, 'faccionNombre', fac.nombre, 'faccionZh', fac.zh);
end $$;

grant execute on function public.enviado_aceptar(text, text) to authenticated;

-- Nota: los miembros viven en la COLUMNA `haciendas.miembros` (jsonb), no en
-- `mapa.miembros`. El coalesce(h.mapa->'miembros', h.miembros) cubre ambos por
-- si algún esquema los movió; el fundador por personajeId directo es el caso normal.

-- ── Despachar un enviado (ejemplo) ──────────────────────────────────────────
-- El enviado es un PERSONAJE ya existente (créalo en admin: owner NULL, faccion
-- = Shu). Este INSERT lo resuelve por NOMBRE, así no copias UUIDs a mano. Hay un
-- único activo por hacienda (índice parcial), de ahí el ON CONFLICT DO NOTHING.
--
--   -- averiguar valores:
--   select id, nombre from public.haciendas order by nombre;
--   select id, nombre, faccion from public.personajes where nombre ilike '%fei%';
--
--   -- despachar a Fei Yi a tu hacienda:
--   insert into public.enviados (hacienda_id, personaje_id, estado)
--   select h.id, p.id, 'esperando'
--   from public.haciendas h, public.personajes p
--   where h.id = 'sima'            -- ⬅ id (texto) de TU hacienda
--     and p.nombre = 'Fei Yi'      -- ⬅ el personaje enviado
--   on conflict do nothing;
--
--   -- comprobar / retirar:
--   select * from public.enviados;
--   -- update public.enviados set estado = 'concluido' where hacienda_id = 'sima';  -- retirar


-- ════════════════════════════════════════════════════════════════════════
-- DESPACHO AUTOMÁTICO (visión): cada cierto tiempo, una hacienda SIN FACCIÓN
-- con CIERTA REPUTACIÓN recibe un enviado de uno de los tres reinos (Wu/Shu/Wei).
-- ────────────────────────────────────────────────────────────────────────
-- Estado: MODELO DE DATOS + mecanismo LISTOS; las CIFRAS son provisionales
-- (marcadas «TBD — ajustar»). No se dispara nada hasta que existan facciones de
-- reino (`reino = true`) con personajes asignados.
-- ════════════════════════════════════════════════════════════════════════

-- ── Marca de «reino» en las facciones ───────────────────────────────────────
-- Sólo las facciones marcadas `reino = true` despachan enviados. Así el reino de
-- un enviado sale de SU personaje (personajes.faccion), sin acoplar por nombre/zh.
alter table public.facciones
  add column if not exists reino boolean not null default false;

-- Sembrado de los tres reinos (idempotente por nombre; colores de la enciclopedia).
-- Ejecuta una vez; si ya los creaste en admin, basta el UPDATE de `reino`.
insert into public.facciones (nombre, zh, color, orden, reino)
select v.nombre, v.zh, v.color, v.orden, true
from (values ('Wei', '魏', '#1e5abf', 1),
             ('Shu', '蜀', '#1e8a2e', 2),
             ('Wu',  '吳', '#bf2020', 3)) as v(nombre, zh, color, orden)
where not exists (select 1 from public.facciones f where f.nombre = v.nombre);

update public.facciones set reino = true where nombre in ('Wei', 'Shu', 'Wu');

-- ── RPC · quizá despachar un enviado a esta hacienda ────────────────────────
-- La llama el CLIENTE al abrir la finca, pasando su reputación (prestigio
-- colectivo, HacCalc.prestigio). SECURITY DEFINER: inserta saltándose la RLS
-- admin, pero SOLO si se cumplen TODAS las condiciones. Idempotente y barato:
-- el propio cooldown + el índice «1 activo por hacienda» evitan spam.
--
-- p_reputacion se pasa desde el cliente (provisional; cuando la reputación viva
-- en DB se calculará aquí). Devuelve el enviado nuevo (jsonb) o NULL si no toca.
create or replace function public.enviado_quiza_despachar(p_hac text, p_reputacion int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  MIN_REPUTACION constant int      := 100;              -- TBD — ajustar con el usuario
  INTERVALO      constant interval := interval '3 days'; -- TBD — cada cuánto puede llegar uno
  h record; pj_id uuid; e record;
begin
  select * into h from public.haciendas where id = p_hac;
  if not found then return null; end if;

  -- (1) La hacienda NO debe pertenecer a ninguna facción.
  if coalesce(nullif(h.mapa ->> 'faccion', ''), null) is not null then return null; end if;
  -- (2) Reputación mínima.
  if coalesce(p_reputacion, 0) < MIN_REPUTACION then return null; end if;
  -- (3) No debe haber ya un enviado activo.
  if exists (select 1 from public.enviados where hacienda_id = p_hac and estado <> 'concluido') then return null; end if;
  -- (4) Cooldown: nada de otro enviado si hubo uno hace menos de INTERVALO.
  if exists (select 1 from public.enviados where hacienda_id = p_hac and created_at > now() - INTERVALO) then return null; end if;

  -- (5) Elige un personaje de un reino que no sea ya enviado activo en otra hacienda.
  select p.id into pj_id
  from public.personajes p
  join public.facciones f on f.id = p.faccion and f.reino
  where not exists (select 1 from public.enviados en where en.personaje_id = p.id and en.estado <> 'concluido')
  order by random() limit 1;
  if pj_id is null then return null; end if;   -- aún no hay personajes de reino → no despacha

  insert into public.enviados (hacienda_id, personaje_id, estado)
  values (p_hac, pj_id, 'esperando')
  on conflict do nothing;

  select * into e from public.enviados where hacienda_id = p_hac and estado = 'esperando' limit 1;
  return to_jsonb(e);
end $$;

grant execute on function public.enviado_quiza_despachar(text, int) to authenticated;
