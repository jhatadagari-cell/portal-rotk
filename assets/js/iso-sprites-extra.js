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
  window.ISO_SPRITES_META['bld-campamento-0'] = { ox: 396, oy: 58, w: 720, h: 444, webp: true };
  // Mercado (3×3): puesto de té (茶) ilustrado. Vista única (no rota: spriteKey
  // cae a '-0' para cualquier rotación). El mercader lo dibuja hac-folk aparte.
  window.ISO_SPRITES_META['bld-mercado-0'] = { ox: 75, oy: 62, w: 150, h: 166 };
})();
