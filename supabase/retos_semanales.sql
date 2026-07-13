-- ════════════════════════════════════════════════════════════════════════
-- Retos SEMANALES · esquema en Supabase
-- ────────────────────────────────────────────────────────────────────────
-- Metas semanales del jugador (ganar prestigio, completar misiones/escaramuzas,
-- superar encuentros). Al cumplirlas TODAS, su señor lo convoca a una audiencia
-- y recibe una «Recompensa semanal». Una fila por (usuario, hacienda, semana):
-- al cambiar de semana (clave 'AAAA-Wnn' ISO) empieza una fila nueva a cero.
-- `estado`: 'curso' → 'convocado' (metas cumplidas, pendiente audiencia) →
-- 'reclamado' (recompensa entregada).
--
-- Estado INDIVIDUAL: lectura y escritura SOLO del propio usuario.
-- Requiere haber ejecutado antes: haciendas.sql, perfiles.sql.
-- Ejecuta este script UNA vez en: Supabase → SQL Editor → New query → Run.
-- ════════════════════════════════════════════════════════════════════════

-- ── Tabla ──────────────────────────────────────────────────────────────────
create table if not exists public.retos_semanales (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  hacienda_id text not null references public.haciendas(id) on delete cascade,
  semana      text not null,                                   -- 'AAAA-Wnn' (semana ISO, hora de servidor)
  prestigio   int  not null default 0,
  misiones    int  not null default 0,
  escaramuzas int  not null default 0,
  encuentros  int  not null default 0,
  estado      text not null default 'curso',                  -- curso | convocado | reclamado
  updated_at  timestamptz not null default now(),
  primary key (user_id, hacienda_id, semana)
);

create index if not exists retos_semanales_user_idx on public.retos_semanales(user_id, hacienda_id, semana);

-- ── Seguridad (RLS) ────────────────────────────────────────────────────────
alter table public.retos_semanales enable row level security;

-- Estado INDIVIDUAL: cada usuario solo ve y escribe LO SUYO.
drop policy if exists retos_semanales_own on public.retos_semanales;
create policy retos_semanales_own on public.retos_semanales for all
  using      ( user_id = auth.uid() )
  with check ( user_id = auth.uid() );

-- El ADMIN puede todo (gestión/depuración). Rol por la tabla `perfiles`.
drop policy if exists retos_semanales_admin on public.retos_semanales;
create policy retos_semanales_admin on public.retos_semanales for all
  using ( public.es_admin() ) with check ( public.es_admin() );
