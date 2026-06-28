-- server_now.sql — Hora del servidor para sincronizar la vida de las fincas.
-- ---------------------------------------------------------------------------
-- hac-clock.js llama a esta RPC para obtener la hora del SERVIDOR (epoch en ms)
-- y calcular el desfase con el reloj local del navegador. Así dos clientes con
-- relojes distintos ven la misma simulación de mecenas (hac-folk.js), que es
-- determinista a partir de (semilla de finca + ventana de tiempo compartida).
--
-- Ejecutar una vez en el SQL editor de Supabase. Es de solo lectura y pública
-- (no expone nada sensible: únicamente la hora actual).

create or replace function public.server_now()
returns bigint
language sql
stable
as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint;
$$;

-- Permitir llamarla sin sesión y con sesión (la usan páginas públicas).
grant execute on function public.server_now() to anon, authenticated;
