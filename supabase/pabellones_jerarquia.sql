-- ═══════════════════════════════════════════════════════════════════════
-- pabellones_jerarquia.sql — JERARQUÍA de pabellones (Fase 1).
-- ─────────────────────────────────────────────────────────────────────────
-- Estructura social del pabellón, guardada TODA en `haciendas` (una fuente
-- pública y coherente): cada miembro tiene `pabellon` (rol) y `escalafon` (0..5)
-- en `miembros[]`; el fundador nombra `mapa.responsables={militar,cultural,
-- administrativo: personajeId}`. Como `haciendas` es escritura SOLO-admin (RLS),
-- toda mutación del jugador pasa por estas funciones SECURITY DEFINER.
--   · pab_unirse       — el miembro ELIGE su pabellón (o lo deja con '').
--   · pab_responsable  — el FUNDADOR nombra/quita al responsable de un rol.
--   · pab_escalafon    — el RESPONSABLE (o el fundador) sube/baja el escalafón.
-- p_pj = personajeId del que llama. `fundador` puede estar como personajeId o
-- como id de miembro (histórico) → se acepta resolviendo el miembro, igual que
-- casa_construir. Ejecutar una vez en el SQL editor de Supabase.
-- ═══════════════════════════════════════════════════════════════════════

-- Un miembro se UNE a un pabellón (militar|cultural|administrativo) o lo deja ('').
create or replace function public.pab_unirse(p_hac text, p_pj text, p_rol text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h public.haciendas;
begin
  if coalesce(p_rol,'') not in ('', 'militar', 'cultural', 'administrativo') then raise exception 'Rol no válido'; end if;
  select * into h from public.haciendas where id = p_hac for update;
  if not found then raise exception 'La hacienda no existe'; end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(h.miembros, '[]'::jsonb)) e where e ->> 'personajeId' = p_pj) then
    raise exception 'No perteneces a esta hacienda'; end if;
  update public.haciendas set miembros = (
    select jsonb_agg(case when e ->> 'personajeId' = p_pj then e || jsonb_build_object('pabellon', p_rol) else e end)
    from jsonb_array_elements(coalesce(miembros, '[]'::jsonb)) e)
    where id = p_hac returning * into h;
  return jsonb_build_object('miembros', h.miembros);
end; $$;

-- El FUNDADOR nombra al responsable (personajeId) de un pabellón (o lo quita con '').
create or replace function public.pab_responsable(p_hac text, p_pj text, p_rol text, p_target text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h public.haciendas;
begin
  if p_rol not in ('militar', 'cultural', 'administrativo') then raise exception 'Rol no válido'; end if;
  select * into h from public.haciendas where id = p_hac for update;
  if not found then raise exception 'La hacienda no existe'; end if;
  if coalesce(h.mapa ->> 'fundador', '') <> p_pj
     and not exists (select 1 from jsonb_array_elements(coalesce(h.miembros, '[]'::jsonb)) m
                     where m ->> 'id' = (h.mapa ->> 'fundador') and m ->> 'personajeId' = p_pj) then
    raise exception 'Solo el fundador nombra responsables'; end if;
  update public.haciendas set mapa = jsonb_set(
      coalesce(mapa, '{}'::jsonb), '{responsables}',
      coalesce(mapa -> 'responsables', '{}'::jsonb) || jsonb_build_object(p_rol, nullif(p_target, '')))
    where id = p_hac returning * into h;
  return jsonb_build_object('mapa', h.mapa);
end; $$;

-- El RESPONSABLE (o el fundador) cambia el escalafón de un miembro (delta, clamp 0..5).
create or replace function public.pab_escalafon(p_hac text, p_pj text, p_target text, p_delta int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h public.haciendas; v_ok boolean;
begin
  select * into h from public.haciendas where id = p_hac for update;
  if not found then raise exception 'La hacienda no existe'; end if;
  v_ok := coalesce(h.mapa ->> 'fundador', '') = p_pj
     or exists (select 1 from jsonb_array_elements(coalesce(h.miembros, '[]'::jsonb)) m
                where m ->> 'id' = (h.mapa ->> 'fundador') and m ->> 'personajeId' = p_pj)
     or exists (select 1 from jsonb_each_text(coalesce(h.mapa -> 'responsables', '{}'::jsonb)) r where r.value = p_pj);
  if not v_ok then raise exception 'Solo el fundador o un responsable ascienden'; end if;
  update public.haciendas set miembros = (
    select jsonb_agg(case when e ->> 'personajeId' = p_target
        then e || jsonb_build_object('escalafon', greatest(0, least(5, coalesce((e ->> 'escalafon')::int, 0) + coalesce(p_delta, 0))))
        else e end)
    from jsonb_array_elements(coalesce(miembros, '[]'::jsonb)) e)
    where id = p_hac returning * into h;
  return jsonb_build_object('miembros', h.miembros);
end; $$;

grant execute on function public.pab_unirse(text,text,text)           to authenticated, anon;
grant execute on function public.pab_responsable(text,text,text,text) to authenticated, anon;
grant execute on function public.pab_escalafon(text,text,text,int)    to authenticated, anon;
