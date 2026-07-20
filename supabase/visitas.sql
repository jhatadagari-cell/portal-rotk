-- ════════════════════════════════════════════════════════════════════════
-- visitas.sql — Hacienda NPC de LUOYANG (Wei) para probar las VISITAS.
-- ────────────────────────────────────────────────────────────────────────
-- Crea (o actualiza) una hacienda `wei-luoyang`:
--   · tema visual 'wei' (arte de Luoyang) · facción Wei · visitable=true · npc=true
--   · un miembro NPC: Guo Jia (resuelve su personaje_id por nombre)
--   · un plano con PORTÓN SUR (celda 6,18) para la llegada.
-- Idempotente: re-ejecutar actualiza miembros y mapa.
--
-- Requisitos: haber corrido enviados.sql (crea las facciones Wei/Shu/Wu) y que
-- exista el personaje «Guo Jia» (el mismo que llega como enviado de Wei).
--
-- Ejecuta este script UNA vez en: Supabase → SQL Editor → New query → Run.
-- ════════════════════════════════════════════════════════════════════════
do $$
declare
  v_wei  text;
  v_guo  uuid;
begin
  select id::text into v_wei from public.facciones where nombre = 'Wei' limit 1;
  select id       into v_guo from public.personajes where nombre = 'Guo Jia' limit 1;
  if v_guo is null then
    raise exception 'No existe el personaje «Guo Jia» en public.personajes. Créalo (admin) antes de correr visitas.sql.';
  end if;

  insert into public.haciendas (id, nombre, zh, color, lema, fundada, descripcion, puntos_extra, miembros, mapa)
  values (
    'wei-luoyang', 'Luoyang', '洛陽', '#b23b2e',
    'El orden nace del centro', '196',
    'La capital de Wei, corazón de las Llanuras Centrales.', 0,
    jsonb_build_array(
      jsonb_build_object('id','m-guojia','nombre','Guo Jia','puntos',3000,'desde','200','nota','','personajeId', v_guo, 'npc', true)
    ),
    jsonb_build_object(
      'v', 1, 'tier', 2, 'estacion', 'verano', 'tema', 'wei',
      'visitable', true, 'npc', true, 'fundador', 'm-guojia',
      'faccion', v_wei,
      'construcciones', $j$[
        {"pos":[5,3],"tipo":"salon","rot":0,"nivel":1},
        {"pos":[2,3],"tipo":"pabellon","rot":0,"nivel":1},
        {"pos":[9,3],"tipo":"galeria","rot":0,"nivel":1},
        {"pos":[2,8],"tipo":"pabellon-te","rot":0,"nivel":1},
        {"pos":[9,8],"tipo":"pabellon","rot":0,"nivel":1},
        {"pos":[4,6],"tipo":"jardin-flores"},{"pos":[5,6],"tipo":"jardin-flores"},{"pos":[4,7],"tipo":"jardin-flores"},
        {"pos":[7,10],"tipo":"farol"},{"pos":[3,14],"tipo":"farol"},
        {"pos":[6,12],"tipo":"camino"},{"pos":[6,13],"tipo":"camino"},{"pos":[6,14],"tipo":"camino"},
        {"pos":[6,15],"tipo":"camino"},{"pos":[6,16],"tipo":"camino"},{"pos":[6,17],"tipo":"camino"},{"pos":[6,19],"tipo":"camino"},
        {"pos":[3,18],"tipo":"muralla","rot":0},{"pos":[4,18],"tipo":"muralla","rot":0},{"pos":[5,18],"tipo":"muralla","rot":0},
        {"pos":[7,18],"tipo":"muralla","rot":0},{"pos":[8,18],"tipo":"muralla","rot":0},{"pos":[9,18],"tipo":"muralla","rot":0},
        {"pos":[6,18],"tipo":"porton","rot":0}
      ]$j$::jsonb
    )
  )
  on conflict (id) do update set
    nombre = excluded.nombre, zh = excluded.zh, color = excluded.color,
    lema = excluded.lema, descripcion = excluded.descripcion,
    miembros = excluded.miembros, mapa = excluded.mapa;
end $$;
