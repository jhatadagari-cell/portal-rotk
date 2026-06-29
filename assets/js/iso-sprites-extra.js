/* Sprites de edificio HECHOS A MANO (imágenes), no generados por
   tools/gen-iso-sprites.js. Se fusionan en window.ISO_SPRITES_META después del
   meta generado. ox/oy/w/h en píxeles de DISPOSITIVO (igual que el generado).
   Cargar DESPUÉS de iso-sprites-meta.js. */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  window.ISO_SPRITES_META = window.ISO_SPRITES_META || {};
  // Campamento militar (8×10): vista ÚNICA a partir de la ilustración (un solo
  // sprite, sin cuantizar para no perder los degradados). No rota: spriteKey en
  // hac-iso cae a '-0' para cualquier rotación. Anclaje (ox,oy) afinado al footprint.
  window.ISO_SPRITES_META['bld-campamento-0'] = { ox: 396, oy: 58, w: 720, h: 443, webp: true };
})();
