/* ═══════════════════════════════════════════════════════════════════════
   iso-sprites-wei.js — Arte a mano del TEMA "wei" (Luoyang).
   ─────────────────────────────────────────────────────────────────────────
   Anclajes (ox,oy) y TAMAÑO (w,h) de los PNG dibujados a mano para la hacienda
   de Wei. Las imágenes viven en assets/img/iso/wei/<clave>.png (o .webp con
   `webp:true`). Una clave aquí SUSTITUYE al sprite gris por defecto SOLO en las
   haciendas con mapa.tema === 'wei'; lo que no esté aquí cae al set por defecto.

   Claves = mismas que el generador: 'bld-<tipo>-<rot>' (rot 0..3). Para vista
   ÚNICA (no rota) basta con 'bld-<tipo>-0' (hac-iso cae a '-0' en toda rotación).

   ox/oy/w/h en píxeles de DISPOSITIVO (el lienzo va a SCALE=2). Usa la
   herramienta "Arte / Sprites" del panel admin para obtener estos valores
   colocando el PNG sobre la rejilla; pega aquí el snippet que te dé.

   Cargar DESPUÉS de iso-sprites-meta.js e iso-sprites-extra.js, ANTES de hac-iso.js.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  window.ISO_SPRITES_THEMES = window.ISO_SPRITES_THEMES || {};
  window.ISO_SPRITES_THEMES.wei = window.ISO_SPRITES_THEMES.wei || {};

  // ── Sprites de Wei ───────────────────────────────────────────────────────
  // Salón del Trono 太極殿 (Great Hall imperial de Luoyang): gran salón alargado de
  // doble alero, teja dorada, sobre terraza de mármol con escalinatas. Dos vistas:
  // rot 0 (frente, entrada + estandarte) y rot 1 (trasera, girada 180°); rot 2/3
  // caen a -0. El arte venía con proyección más plana (~20°); se estiró ×1.38 en
  // vertical para que la BASE quede a 26.565° (2:1) y cuadre con la rejilla del
  // suelo. Anclaje calculado para cubrir el footprint [9,12] centrado.
  const T = window.ISO_SPRITES_THEMES.wei;
  T['bld-salon-trono-0'] = { ox: 432, oy: 313, w: 757, h: 747 };
  T['bld-salon-trono-1'] = { ox: 432, oy: 312, w: 757, h: 734 };

  // Palacio 宮殿 (tema Wei): reutiliza el arte del ANTIGUO salón del trono (salón
  // cuadrado de doble alero sobre base de mármol). Footprint [4,6] centrado.
  T['bld-palacio-0'] = { ox: 216, oy: 122, w: 360, h: 288 };
  T['bld-palacio-1'] = { ox: 216, oy: 121, w: 360, h: 288 };

  // Puerta Imperial 午門 (portón monumental de la muralla exterior, 洛陽宮). Torre
  // de puerta sobre base de piedra. rot 0 = vista lisa (puerta a la derecha);
  // rot 1 = vista ornamentada con leones y estandartes 魏 (puerta a la izquierda).
  T['bld-puerta-imperial-0'] = { ox: 240, oy: 330, w: 480, h: 470 };
  T['bld-puerta-imperial-1'] = { ox: 240, oy: 365, w: 480, h: 525 };

  // ── Kit de MURALLA EXTERIOR (solo se usa cuando la hacienda es tema Wei) ────
  // NO son edificios colocables: los coloca el renderizador de perímetro de
  // hac-iso (drawWeiPerimeter) tile a tile alrededor de la finca. Aquí solo se
  // registran para que preloadTheme cargue las imágenes; w/h son el tamaño NATIVO
  // del PNG y ox/oy el "pico" (vértice frontal-bajo) medido — el perímetro escala
  // y ancla por ese pico. gate-wall-* es el 午門 con alas que rellena el vano.
  const wall=(k,w,h,ox,oy)=>{ T[k]={w,h,ox,oy}; };
  wall('wall-straight1-front',209,255,56,250);  wall('wall-straight1-back',206,265,149,261);
  wall('wall-straight2-front',327,292,65,287);  wall('wall-straight2-back',318,322,227,317);
  wall('wall-corner-out-front',262,276,158,271);wall('wall-corner-out-back',259,314,164,309);
  wall('wall-corner-in-front',292,280,85,275);  wall('wall-corner-in-back',297,299,152,294);
  wall('gate-wall-front',747,625,722,624);      wall('gate-wall-back',748,635,677,634);
})();
