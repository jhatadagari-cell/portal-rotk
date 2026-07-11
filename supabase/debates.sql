-- ═══════════════════════════════════════════════════════════════════════
-- debates.sql — DEBATES entre dos miembros de una hacienda (tarea social).
-- ─────────────────────────────────────────────────────────────────────────
-- Un jugador INVITA a otro miembro a debatir (elige tema + jardín). El invitado
-- ACEPTA (o si es un NPC, el cliente lo auto-acepta). Al aceptar, el debate pasa a
-- 'en_curso' con inicio/fin (5 min): ambos mecenas caminan al jardín y debaten. Al
-- terminar, el cliente computa el resultado DETERMINISTA (ganador por stats+azar,
-- libros) desde la semilla 'debate#'+id y lo sella con debate_resolver.
--
-- Caché + poll en el cliente (hac-debates.js), igual que escaramuzas. Mutaciones por
-- funciones SECURITY DEFINER (atómicas); RLS: lectura pública, escritura solo por RPC.
-- Ejecutar una vez en el SQL editor de Supabase.
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists public.debates (
  id               uuid primary key default gen_random_uuid(),
  hacienda_id      text    not null,
  host_id          text    not null,                    -- personajeId del que invita
  host_nombre      text    not null default '',
  invitado_id      text    not null,                    -- personajeId invitado
  invitado_nombre  text    not null default '',
  tema             text    not null,                    -- guerra|letras|administracion|estrategia|gobierno|diplomacia
  jardin_cell      text    not null default '',         -- "x,y" celda del jardín elegido
  estado           text    not null default 'propuesto',-- propuesto|en_curso|rechazado|resuelto|caducado
  inicio_ms        bigint  not null default 0,          -- ms al aceptar (arranque)
  fin_ms           bigint  not null default 0,          -- inicio + 5 min
  resultado        jsonb   not null default '{}'::jsonb, -- { ganador, libros:{pjId:calidad|null}, ... } sellado al resolver
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists debates_hac_idx on public.debates (hacienda_id);

-- updated_at automático
create or replace function public.set_updated_at_debates() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;
drop trigger if exists trg_debates_updated on public.debates;
create trigger trg_debates_updated before update on public.debates
  for each row execute function public.set_updated_at_debates();

-- ── ATOMICIDAD: toda mutación pasa por funciones SECURITY DEFINER ──
-- Un miembro no puede estar en dos debates activos (propuesto/en_curso) a la vez.
create or replace function public.debate_crear(
  p_hac text, p_host text, p_host_nombre text,
  p_invitado text, p_invitado_nombre text, p_tema text, p_jardin text)
returns public.debates language plpgsql security definer set search_path = public as $$
declare d public.debates;
begin
  if p_host = p_invitado then raise exception 'No puedes debatir contigo mismo'; end if;
  if exists (select 1 from public.debates e
             where e.hacienda_id = p_hac and e.estado in ('propuesto','en_curso')
               and (e.host_id in (p_host, p_invitado) or e.invitado_id in (p_host, p_invitado))) then
    raise exception 'Tú o el invitado ya estáis en un debate';
  end if;
  insert into public.debates (hacienda_id, host_id, host_nombre, invitado_id, invitado_nombre, tema, jardin_cell, estado)
  values (p_hac, p_host, coalesce(p_host_nombre,''), p_invitado, coalesce(p_invitado_nombre,''),
          p_tema, coalesce(p_jardin,''), 'propuesto')
  returning * into d;
  return d;
end; $$;

-- El invitado (o el auto-accept de un NPC) acepta: arranca el debate (5 min).
create or replace function public.debate_aceptar(p_id uuid, p_pj text, p_now bigint)
returns public.debates language plpgsql security definer set search_path = public as $$
declare d public.debates;
begin
  select * into d from public.debates where id = p_id for update;
  if not found then raise exception 'El debate ya no existe'; end if;
  if d.estado = 'en_curso' then return d; end if;              -- ya aceptado (idempotente)
  if d.estado <> 'propuesto' then raise exception 'La invitación ya no está disponible'; end if;
  if d.invitado_id <> p_pj then raise exception 'No eres el invitado'; end if;
  update public.debates
    set estado = 'en_curso', inicio_ms = p_now, fin_ms = p_now + 300000
    where id = p_id returning * into d;
  return d;
end; $$;

-- Rechazar / cancelar una invitación pendiente (invitado o host).
create or replace function public.debate_rechazar(p_id uuid, p_pj text)
returns public.debates language plpgsql security definer set search_path = public as $$
declare d public.debates;
begin
  select * into d from public.debates where id = p_id for update;
  if not found then raise exception 'El debate ya no existe'; end if;
  if d.estado <> 'propuesto' then return d; end if;
  if p_pj <> d.invitado_id and p_pj <> d.host_id then raise exception 'No participas en este debate'; end if;
  update public.debates set estado = 'rechazado' where id = p_id returning * into d;
  return d;
end; $$;

-- Sellar el resultado (idempotente: el primer cliente que lo resuelve fija el outcome).
create or replace function public.debate_resolver(p_id uuid, p_resultado jsonb)
returns public.debates language plpgsql security definer set search_path = public as $$
declare d public.debates;
begin
  select * into d from public.debates where id = p_id for update;
  if not found then raise exception 'El debate ya no existe'; end if;
  if d.estado = 'resuelto' then return d; end if;             -- ya sellado: no re-escribir
  if d.estado <> 'en_curso' then raise exception 'El debate no está en curso'; end if;
  update public.debates set estado = 'resuelto', resultado = coalesce(p_resultado, '{}'::jsonb)
    where id = p_id returning * into d;
  return d;
end; $$;

-- RLS: lectura pública; escritura solo por las RPC SECURITY DEFINER de arriba.
alter table public.debates enable row level security;
drop policy if exists debates_read on public.debates;
create policy debates_read on public.debates for select using (true);
grant execute on function public.debate_crear(text,text,text,text,text,text,text) to authenticated, anon;
grant execute on function public.debate_aceptar(uuid,text,bigint)                 to authenticated, anon;
grant execute on function public.debate_rechazar(uuid,text)                       to authenticated, anon;
grant execute on function public.debate_resolver(uuid,jsonb)                      to authenticated, anon;
