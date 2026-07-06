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
  // Salón del Trono 太極殿 (edificio principal de Luoyang): gran salón imperial de
  // teja dorada con su propia base de mármol y escalinata. Dos vistas: rot 0
  // (puerta a la derecha) y rot 1 (puerta a la izquierda); rot 2/3 caen a -0.
  // Anclaje/tamaño PROVISIONALES — afínalos con la herramienta "Arte / Sprites".
  const T = window.ISO_SPRITES_THEMES.wei;
  T['bld-salon-trono-0'] = { ox: 230, oy: 300, w: 460, h: 412 };
  T['bld-salon-trono-1'] = { ox: 230, oy: 305, w: 460, h: 419 };
})();
