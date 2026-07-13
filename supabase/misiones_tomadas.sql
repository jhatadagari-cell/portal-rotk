-- ════════════════════════════════════════════════════════════════════════
-- Misiones TOMADAS del tablón · esquema en Supabase
-- ────────────────────────────────────────────────────────────────────────
-- Cuando un jugador COGE una misión del tablón, esa misión desaparece de SU
-- tablón (individual: no la de los demás). El tablón se rellena a DIARIO: cada
-- fila lleva el `dia` (cadena 'AAAA-M-D' del cliente), y el tablón solo esconde
-- las misiones cuyo `dia` es HOY → al cambiar de día vuelven a estar todas.
--
-- Estado INDIVIDUAL: lectura y escritura SOLO del propio usuario (no público).
-- Requiere haber ejecutado antes: haciendas.sql, perfiles.sql.
-- Ejecuta este script UNA vez en: Supabase → SQL Editor → New query → Run.
-- ════════════════════════════════════════════════════════════════════════

-- ── Tabla ──────────────────────────────────────────────────────────────────
create table if not exists public.misiones_tomadas (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  hacienda_id text not null references public.haciendas(id) on delete cascade,
  mision_id   text not null,                                   -- id de la misión del POOL (hac-misiones.js)
  dia         text not null,                                   -- 'AAAA-M-D' (diaStr del cliente = hora de servidor)
  tomada_at   timestamptz not null default now(),
  primary key (user_id, hacienda_id, mision_id, dia)
);

create index if not exists misiones_tomadas_user_idx on public.misiones_tomadas(user_id, hacienda_id, dia);

-- ── Seguridad (RLS) ────────────────────────────────────────────────────────
alter table public.misiones_tomadas enable row level security;

-- Estado INDIVIDUAL: cada usuario solo ve y escribe LO SUYO.
drop policy if exists misiones_tomadas_own on public.misiones_tomadas;
create policy misiones_tomadas_own on public.misiones_tomadas for all
  using      ( user_id = auth.uid() )
  with check ( user_id = auth.uid() );

-- El ADMIN puede todo (gestión/depuración). Rol por la tabla `perfiles`.
drop policy if exists misiones_tomadas_admin on public.misiones_tomadas;
create policy misiones_tomadas_admin on public.misiones_tomadas for all
  using ( public.es_admin() ) with check ( public.es_admin() );
