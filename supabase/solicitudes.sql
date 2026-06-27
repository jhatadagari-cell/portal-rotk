-- ════════════════════════════════════════════════════════════════════════
-- Solicitudes de ingreso a una hacienda · esquema en Supabase
-- ────────────────────────────────────────────────────────────────────────
-- Un jugador (con su personaje ya creado) solicita entrar en UNA hacienda.
-- El admin la APRUEBA — y entonces añade su mecenas al jsonb `miembros` de la
-- hacienda — o la RECHAZA. Modelo elegido: 1 personaje y 1 hacienda por cuenta,
-- así que un usuario solo puede tener UNA solicitud no rechazada a la vez.
--
-- Requiere haber ejecutado antes haciendas.sql y personajes.sql.
-- Ejecuta este script UNA vez en: Supabase → SQL Editor → New query → Run.
-- ════════════════════════════════════════════════════════════════════════

-- ── Tabla ──────────────────────────────────────────────────────────────────
create table if not exists public.solicitudes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  personaje_id uuid references public.personajes(id) on delete cascade,
  hacienda_id  text references public.haciendas(id) on delete cascade,
  estado       text not null default 'pendiente',   -- pendiente | aprobada | rechazada
  nota         text default '',
  created_at   timestamptz default now(),
  decided_at   timestamptz
);

-- Como mucho UNA solicitud NO rechazada por usuario (1 personaje → 1 hacienda).
-- Las rechazadas no cuentan, así que siempre se puede volver a solicitar.
create unique index if not exists solicitudes_user_activa
  on public.solicitudes(user_id) where estado <> 'rechazada';

create index if not exists solicitudes_estado_idx   on public.solicitudes(estado);
create index if not exists solicitudes_hacienda_idx on public.solicitudes(hacienda_id);

-- ── Seguridad (RLS) ────────────────────────────────────────────────────────
alter table public.solicitudes enable row level security;

-- El JUGADOR ve, crea y cancela (mientras esté pendiente) SUS solicitudes.
drop policy if exists solicitudes_owner_select on public.solicitudes;
create policy solicitudes_owner_select
  on public.solicitudes for select
  using ( user_id = auth.uid() );

drop policy if exists solicitudes_owner_insert on public.solicitudes;
create policy solicitudes_owner_insert
  on public.solicitudes for insert
  with check ( user_id = auth.uid() and estado = 'pendiente' );

drop policy if exists solicitudes_owner_cancel on public.solicitudes;
create policy solicitudes_owner_cancel
  on public.solicitudes for delete
  using ( user_id = auth.uid() and estado = 'pendiente' );

-- El ADMIN ve TODAS y decide (aprobar/rechazar). Mismo email que el resto.
drop policy if exists solicitudes_admin_all on public.solicitudes;
create policy solicitudes_admin_all
  on public.solicitudes for all
  using      ( (auth.jwt() ->> 'email') = 'jhatadagari@gmail.com' )
  with check ( (auth.jwt() ->> 'email') = 'jhatadagari@gmail.com' );
