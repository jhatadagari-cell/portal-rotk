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

-- Nota: los miembros viven en la COLUMNA `haciendas.miembros` (jsonb), no en
-- `mapa.miembros`. El coalesce(h.mapa->'miembros', h.miembros) cubre ambos por
-- si algún esquema los movió; el fundador por personajeId directo es el caso normal.
