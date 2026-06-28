/* Sprites de edificio HECHOS A MANO (imágenes), no generados por
   tools/gen-iso-sprites.js. Se fusionan en window.ISO_SPRITES_META después del
   meta generado. ox/oy/w/h en píxeles de DISPOSITIVO (igual que el generado).
   Cargar DESPUÉS de iso-sprites-meta.js. */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  window.ISO_SPRITES_META = window.ISO_SPRITES_META || {};
  // Campamento militar (8×10): vista fija a partir de la ilustración. Mismo sprite
  // para las 4 rotaciones (no rota de verdad). Anclaje (ox,oy) afinado al footprint.
  const campamento = { ox: 396, oy: 79, w: 720, h: 444 };
  for (let r = 0; r < 4; r++) window.ISO_SPRITES_META['bld-campamento-' + r] = Object.assign({}, campamento);
})();
