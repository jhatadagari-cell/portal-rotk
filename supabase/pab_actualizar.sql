-- ════════════════════════════════════════════════════════════════════════
-- pab_actualizar.sql — REFORMAR un pabellón existente (pincel de forma libre).
-- ────────────────────────────────────────────────────────────────────────
-- Actualiza rol/nombre/seed de un pabellón SIN cambiar su id (conserva miembros,
-- responsable e investigación). p_seed = { "c": [[x,y],…] } (celdas del pincel) o
-- el rectángulo antiguo [x,y,w,h]. Gate de FUNDADOR (como pab_delimitar).
--
-- Ejecuta este script UNA vez en: Supabase → SQL Editor → New query → Run.
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.pab_actualizar(p_hac text, p_pj text, p_id uuid, p_rol text, p_nombre text, p_seed jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h public.haciendas;
begin
  if p_rol not in ('militar', 'cultural', 'administrativo') then raise exception 'Rol no válido'; end if;
  select * into h from public.haciendas where id = p_hac;
  if not found then raise exception 'La hacienda no existe'; end if;
  if coalesce(h.mapa ->> 'fundador', '') <> p_pj
     and not exists (select 1 from jsonb_array_elements(coalesce(h.miembros, '[]'::jsonb)) m
                     where m ->> 'id' = (h.mapa ->> 'fundador') and m ->> 'personajeId' = p_pj) then
    raise exception 'Solo el fundador reforma pabellones'; end if;
  update public.pabellones set nombre = coalesce(p_nombre, ''), rol = p_rol, seed = p_seed
    where id = p_id and hacienda_id = p_hac;
  return jsonb_build_object('ok', true);
end; $$;

grant execute on function public.pab_actualizar(text, text, uuid, text, text, jsonb) to authenticated, anon;
