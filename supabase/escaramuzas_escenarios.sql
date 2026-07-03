-- ═══════════════════════════════════════════════════════════════════════
-- escaramuzas_escenarios.sql — Pool de escaramuzas del día (escenario en la banda).
-- ─────────────────────────────────────────────────────────────────────────
-- Añade a `escaramuzas` (ver escaramuzas.sql) la columna `escenario`: el id del
-- escenario del POOL (cliente) que el capitán eligió al montar la banda. Con él,
-- todos los clientes resuelven los MISMOS eventos, dificultad y requisitos de esa
-- gesta. El cliente degrada solo si esta migración no se ha ejecutado (banda sin
-- escenario → eventos genéricos), así que se puede aplicar cuando se quiera.
--
-- Ejecutar una vez en el SQL editor de Supabase (después de escaramuzas.sql).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.escaramuzas add column if not exists escenario text not null default '';

-- CREAR ahora acepta el escenario elegido (p_escenario). Se recrea la firma para
-- incluirlo con default '' → las llamadas antiguas (6 args) siguen funcionando.
drop function if exists public.escaramuza_crear(text, text, text, int, int, int);
create or replace function public.escaramuza_crear(
  p_hac text, p_host text, p_nombre text, p_plazas int, p_dif int, p_coste int, p_escenario text default '')
returns public.escaramuzas language plpgsql security definer set search_path = public as $$
declare b public.escaramuzas;
begin
  if exists (select 1 from public.escaramuzas e where e.hacienda_id = p_hac
             and e.miembros @> jsonb_build_array(jsonb_build_object('id', p_host))) then
    raise exception 'Ya estás en una banda';
  end if;
  insert into public.escaramuzas (hacienda_id, host_id, host_nombre, plazas, dificultad, estado, miembros, coste, escenario)
  values (p_hac, p_host, coalesce(p_nombre,''), greatest(2, least(4, coalesce(p_plazas,3))),
          coalesce(p_dif,4), 'abierta',
          jsonb_build_array(jsonb_build_object('id', p_host, 'nombre', coalesce(p_nombre,''))),
          coalesce(p_coste,0), coalesce(p_escenario,''))
  returning * into b;
  return b;
end; $$;

grant execute on function public.escaramuza_crear(text,text,text,int,int,int,text) to authenticated, anon;
