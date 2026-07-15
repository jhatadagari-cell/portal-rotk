-- ═══════════════════════════════════════════════════════════════════════
-- realtime.sql — habilita Supabase Realtime (postgres_changes) en las tablas
-- COMPARTIDAS de las fincas, para que los cambios de un jugador lleguen a los
-- demás al instante (sin recargar): responsable/investigación del pabellón,
-- altas/bajas y aporte de miembros, delimitación/borrado de pabellones…
--
-- El cliente (HacStore.subscribe) se suscribe SOLO a la fila de la hacienda
-- abierta y a sus pabellones. Realtime respeta la RLS de SELECT: como estas
-- tablas son de lectura pública (anon puede SELECT), el cliente recibe los
-- cambios. Las ESCRITURAS siguen pasando por las RPC SECURITY DEFINER.
--
-- Ejecutar UNA vez en el editor SQL de Supabase. Idempotente (no falla si ya
-- estaban añadidas). Si el proyecto no tuviera la publicación `supabase_realtime`
-- (la crea Supabase por defecto), créala antes: create publication supabase_realtime;
-- ═══════════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'haciendas') then
    execute 'alter publication supabase_realtime add table public.haciendas';
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pabellones') then
    execute 'alter publication supabase_realtime add table public.pabellones';
  end if;
end $$;

-- Comprueba qué tablas están publicadas para Realtime:
-- select schemaname, tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1,2;
