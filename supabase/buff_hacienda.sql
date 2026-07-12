-- ═══════════════════════════════════════════════════════════════════════
-- buff_hacienda.sql — BONO temporal de hacienda (Debates · Fase 2).
-- ─────────────────────────────────────────────────────────────────────────
-- Un miembro DONA un libro de "Conclusiones" (muy-buenas o reveladoras) al
-- SEÑOR DE LA CASA (fundador). Eso enciende un bono de +XP a TODA la hacienda
-- durante 7 días: muy-buenas → +15 %, reveladoras → +25 %.
--
-- Una fila activa por (hacienda, tipo). `hasta` es epoch en MILISEGUNDOS (igual
-- que HacClock.now()) para comparar en el cliente sin líos de zona horaria. Se
-- presenta por RPC SECURITY DEFINER: solo REEMPLAZA si el bono nuevo es
-- ESTRICTAMENTE mejor que el activo (o si el activo ya expiró) → no puedes
-- presentar otro de la misma calidad hasta que pasen los 7 días.
--
-- RLS: lectura pública, escritura solo por la RPC. Ejecutar una vez en Supabase.
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists public.buff_hacienda (
  hacienda_id     text    not null,
  tipo            text    not null default 'xp',       -- por ahora solo 'xp'
  valor           numeric not null default 0,          -- 0.15 (muy-buenas) / 0.25 (reveladoras)
  hasta           bigint  not null default 0,          -- ms epoch: fin del bono (now + 7 días)
  calidad         text    not null default '',         -- muy-buenas | reveladoras
  donante_id      text    not null default '',         -- personajeId del donante
  donante_nombre  text    not null default '',
  updated_at      timestamptz not null default now(),
  primary key (hacienda_id, tipo)
);

-- Presentar un libro: enciende/mejora el bono. Rechaza si ya hay uno igual o mejor vivo.
create or replace function public.buff_presentar(
  p_hac text, p_tipo text, p_valor numeric, p_calidad text,
  p_donante text, p_donante_nombre text, p_hasta bigint, p_now bigint)
returns public.buff_hacienda language plpgsql security definer set search_path = public as $$
declare b public.buff_hacienda;
begin
  select * into b from public.buff_hacienda where hacienda_id = p_hac and tipo = coalesce(p_tipo,'xp') for update;
  if found and b.hasta > p_now and p_valor <= b.valor then
    raise exception 'Ya hay un bono igual o mejor activo en la hacienda';
  end if;
  insert into public.buff_hacienda (hacienda_id, tipo, valor, hasta, calidad, donante_id, donante_nombre, updated_at)
  values (p_hac, coalesce(p_tipo,'xp'), p_valor, p_hasta, coalesce(p_calidad,''), p_donante, coalesce(p_donante_nombre,''), now())
  on conflict (hacienda_id, tipo) do update
    set valor = excluded.valor, hasta = excluded.hasta, calidad = excluded.calidad,
        donante_id = excluded.donante_id, donante_nombre = excluded.donante_nombre, updated_at = now()
  returning * into b;
  return b;
end; $$;

alter table public.buff_hacienda enable row level security;
drop policy if exists buff_hac_read on public.buff_hacienda;
create policy buff_hac_read on public.buff_hacienda for select using (true);
grant execute on function public.buff_presentar(text,text,numeric,text,text,text,bigint,bigint) to authenticated, anon;
