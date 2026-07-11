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
  // Mercado (2×2): puesto de té (茶) ilustrado. Vista única (no rota: spriteKey
  // cae a '-0' para cualquier rotación). El mercader lo dibuja hac-folk aparte.
  // Anclaje cuadrado sobre plantilla de suelo 2×2: la base del puesto queda
  // centrada en el rombo del footprint (antes flotaba, con oy=39 en el tejado).
  window.ISO_SPRITES_META['bld-mercado-0'] = { ox: 47, oy: 60, w: 95, h: 105 };
  // Tablón de anuncios (1×1): 告示牌 ilustrado (tablón techado con carteles).
  // Vista única. Anclaje calibrado contra el farol (1×1 procedural): centro de
  // la huella de los pies en ox; oy = fondo − ½ tile (los pies caen en el rombo).
  window.ISO_SPRITES_META['bld-tablon-0'] = { ox: 30, oy: 80, w: 58, h: 90 };
})();
