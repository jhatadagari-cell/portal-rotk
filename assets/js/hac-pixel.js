/* ═══════════════════════════════════════════════════════════════════════
   hac-pixel.js — Escena PIXEL ART procedural de una hacienda.
   ─────────────────────────────────────────────────────────────────────────
   Dibuja una finca al estilo Han que CRECE con el nivel (tier) de la casa:
     · Nivel 1 (Residencia 宅) → un pabellón modesto, un farol, un árbol.
     · Nivel 2 (Mansión 府)    → pabellón mayor + dos alas, muro y portón,
                                 estandartes y más faroles.
     · Nivel 3 (Hacienda Mayor 邸) → salón de dos aguas, torres de esquina,
                                 alas grandes, banderas — una gran finca.

   Se tinta con el color de acento de la hacienda. Es ESTÁTICA (se dibuja una
   vez, sin bucle de animación) para no costar rendimiento.

   API:  HacPixel.draw(canvasEl, { color, tier })
   ═══════════════════════════════════════════════════════════════════════ */
const HacPixel = (function () {
  'use strict';

  // ── Color helpers ────────────────────────────────────────────────────
  function hexToRgb(h) {
    h = String(h || '').replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (h.length !== 6) h = 'c9a84c';
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(v => clamp255(v).toString(16).padStart(2, '0')).join('');
  }
  function mix(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  }
  const light = (c, t) => mix(c, '#ffffff', t);
  const dark  = (c, t) => mix(c, '#000000', t);

  // ── Lienzo lógico (luego se escala con image-rendering:pixelated) ──────
  const W = 200, H = 116;
  const GROUND = 84;   // borde superior del suelo (horizonte de la finca)

  // Estrellas fijas (deterministas: no parpadean entre renders).
  const STARS = [
    [12, 10], [28, 18], [40, 7], [58, 14], [70, 22], [88, 9],
    [120, 12], [134, 24], [158, 8], [176, 16], [188, 26], [104, 20],
    [20, 30], [50, 28], [150, 30], [182, 6]
  ];

  function palette(color) {
    const A = /^#?[0-9a-fA-F]{3,6}$/.test(String(color || '')) ? color : '#c9a84c';
    return {
      A,
      skyTop: mix('#0a0602', A, 0.05),
      skyHor: mix('#1d1308', A, 0.20),
      moon:   '#f0ddb0',
      moonSh: mix('#f0ddb0', A, 0.25),
      star:   '#d4b870',
      mtn:    dark(A, 0.80),
      mtn2:   dark(A, 0.72),
      grass0: mix('#141009', A, 0.05),
      grass1: mix('#1d160c', A, 0.07),
      stone:  '#3a3026',
      stoneHi:'#4a3e30',
      stoneSh:'#231c14',
      wall:   mix('#2c1f12', A, 0.07),
      wallHi: mix('#3c2c18', A, 0.10),
      wood:   mix('#5c4020', A, 0.12),
      woodDk: dark(mix('#5c4020', A, 0.12), 0.34),
      roof:   dark(A, 0.50),
      roofDk: dark(A, 0.66),
      roofHi: light(A, 0.10),
      edge:   light(A, 0.18),
      door:   dark(A, 0.45),
      trunk:  '#2e2012',
      leaf:   mix('#21381b', A, 0.04),
      leafHi: mix('#33502a', A, 0.05),
      lantern: A,
      lanternHi: light(A, 0.45)
    };
  }

  // ── Pabellón (cuerpo + tejado curvo de estilo oriental) ───────────────
  function roof(px, P, cx, baseY, bodyHalf) {
    const eave  = bodyHalf + 5;
    const ridge = Math.max(2, Math.round(bodyHalf * 0.34));
    const rh    = Math.max(6, Math.round(bodyHalf * 0.95));
    // Filas del tejado, de los aleros (abajo, anchos) al caballete (arriba).
    for (let i = 0; i < rh; i++) {
      const t  = i / (rh - 1);
      const hw = Math.round(eave + (ridge - eave) * Math.pow(t, 1.5)); // cóncavo
      const y  = baseY - 1 - i;
      px(cx - hw, y, hw * 2, 1, (i % 2 === 0) ? P.roof : P.roofDk);
    }
    // Caballete y alero resaltados con el acento.
    px(cx - ridge - 1, baseY - rh, (ridge + 1) * 2, 1, P.A);
    px(cx - eave, baseY - 1, eave * 2, 1, P.edge);
    // Aleros volados hacia arriba en las puntas.
    px(cx - eave - 2, baseY - 3, 2, 2, P.A); px(cx - eave - 3, baseY - 4, 1, 1, P.A);
    px(cx + eave,     baseY - 3, 2, 2, P.A); px(cx + eave + 2, baseY - 4, 1, 1, P.A);
    // Remates del caballete.
    px(cx - ridge - 2, baseY - rh - 2, 1, 2, P.A);
    px(cx + ridge + 1, baseY - rh - 2, 1, 2, P.A);
    return rh;
  }

  function pavilion(px, P, cx, baseY, w, bodyH, opts) {
    opts = opts || {};
    const half = Math.floor(w / 2);
    const x0 = cx - half, bodyTop = baseY - bodyH;
    // Plataforma de piedra.
    px(x0 - 2, baseY, w + 4, 2, P.stone);
    px(x0 - 2, baseY + 2, w + 4, 1, P.stoneSh);
    px(x0 - 1, baseY, w + 2, 1, P.stoneHi);
    // Muro / cuerpo.
    px(x0, bodyTop, w, bodyH, P.wall);
    px(x0, bodyTop, w, 1, P.wallHi);
    // Pilares de madera.
    px(x0, bodyTop, 2, bodyH, P.wood);
    px(cx + half - 2, bodyTop, 2, bodyH, P.wood);
    if (w >= 40) { px(cx - 1, bodyTop, 2, bodyH, P.woodDk); }
    // Puerta.
    const dw = Math.max(4, Math.round(w * 0.26));
    const dh = Math.max(6, Math.round(bodyH * 0.78));
    px(cx - Math.floor(dw / 2), baseY - dh, dw, dh, P.door);
    px(cx - Math.floor(dw / 2), baseY - dh, dw, 1, P.A);
    // Tejado.
    const rh = roof(px, P, cx, bodyTop, half);
    // Faroles colgando bajo los aleros.
    if (opts.lanterns !== false) {
      lantern(px, P, x0 + 3, bodyTop + 2);
      lantern(px, P, cx + half - 3, bodyTop + 2);
    }
    // Segundo piso (salón de dos aguas, nivel 3).
    if (opts.twoStory) {
      const up = bodyTop - rh + 1;
      const uw = Math.round(w * 0.62), uh = Math.round(bodyH * 0.7);
      const ux0 = cx - Math.floor(uw / 2);
      px(ux0, up - uh, uw, uh, P.wall);
      px(ux0, up - uh, uw, 1, P.wallHi);
      px(ux0, up - uh, 2, uh, P.wood);
      px(ux0 + uw - 2, up - uh, 2, uh, P.wood);
      const udw = Math.max(3, Math.round(uw * 0.3));
      px(cx - Math.floor(udw / 2), up - Math.round(uh * 0.7), udw, Math.round(uh * 0.7), P.door);
      roof(px, P, cx, up - uh, Math.floor(uw / 2));
    }
    return rh;
  }

  // ── Elementos sueltos ─────────────────────────────────────────────────
  function lantern(px, P, x, y) {
    px(x, y - 1, 1, 1, P.wood);          // colgador
    px(x - 1, y, 3, 4, P.lantern);       // cuerpo
    px(x, y + 1, 1, 2, P.lanternHi);     // brillo
    px(x, y + 4, 1, 1, P.star);          // borla
  }
  function banner(px, P, x, baseY, h) {
    px(x, baseY - h, 1, h, P.wood);              // mástil
    px(x, baseY - h - 1, 1, 1, P.A);             // punta
    px(x + 1, baseY - h, 4, Math.round(h * 0.55), P.A);          // paño
    px(x + 1, baseY - h, 4, 1, P.lanternHi);
    px(x + 1, baseY - h + Math.round(h * 0.55), 4, 1, dark(P.A, 0.3));
  }
  function tree(px, P, x, baseY, h) {
    px(x, baseY - h, 2, h, P.trunk);             // tronco
    const ly = baseY - h - 5;
    px(x - 4, ly, 10, 8, P.leaf);
    px(x - 3, ly - 3, 8, 5, P.leaf);
    px(x - 2, ly - 1, 3, 2, P.leafHi);           // luz
    px(x + 2, ly + 3, 2, 2, dark(P.leaf, 0.3));  // sombra
  }
  // Muro frontal con portón central (gatehouse).
  function frontWall(px, P, baseY, gateHalf) {
    const wh = 9, y = baseY - wh;
    const gx0 = Math.floor(W / 2 - gateHalf), gx1 = Math.floor(W / 2 + gateHalf);
    px(0, y, gx0, wh, P.wall);
    px(gx1, y, W - gx1, wh, P.wall);
    px(0, y, gx0, 1, P.wallHi);
    px(gx1, y, W - gx1, 1, P.wallHi);
    // Tapa de teja del muro.
    px(0, y - 2, gx0, 2, P.roof);    px(0, y - 2, gx0, 1, dark(P.A, 0.3));
    px(gx1, y - 2, W - gx1, 2, P.roof); px(gx1, y - 2, W - gx1, 1, dark(P.A, 0.3));
    // Tejadillo sobre el portón.
    roof(px, P, Math.floor(W / 2), y - 2, gateHalf + 2);
    // Jambas y vano del portón.
    px(gx0, y, 2, wh, P.wood);
    px(gx1 - 2, y, 2, wh, P.wood);
    px(gx0 + 2, baseY - wh + 2, gx1 - gx0 - 4, wh - 2, P.door);
    lantern(px, P, gx0 - 2, y - 1);
    lantern(px, P, gx1 + 2, y - 1);
  }

  // ── Fondo ─────────────────────────────────────────────────────────────
  function blockyDisc(px, cx, cy, r, color) {
    for (let dy = -r; dy <= r; dy++) {
      const w = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
      px(cx - w, cy + dy, w * 2 + 1, 1, color);
    }
  }
  function mountain(px, color, cx, baseY, halfW, peakH) {
    for (let i = 0; i < peakH; i++) {
      const t = i / peakH;
      const hw = Math.round(halfW * (1 - t));
      px(cx - hw, baseY - i, hw * 2, 1, color);
    }
  }

  // ── Escena completa ───────────────────────────────────────────────────
  function draw(canvas, opts) {
    if (!canvas) return;
    opts = opts || {};
    const tier = Math.max(1, Math.min(3, Number(opts.tier) || 1));
    const P = palette(opts.color);

    canvas.width = W; canvas.height = H;
    const g = canvas.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, W, H);
    const px = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

    // Cielo (degradado por bandas).
    for (let y = 0; y < GROUND; y++) {
      px(0, y, W, 1, mix(P.skyTop, P.skyHor, y / GROUND));
    }
    // Luna y estrellas.
    blockyDisc(px, 158, 24, 8, P.moon);
    blockyDisc(px, 161, 22, 7, P.skyTop); // recorte creciente
    blockyDisc(px, 156, 25, 7, P.moonSh);
    STARS.forEach(s => px(s[0], s[1], 1, 1, P.star));

    // Montañas lejanas.
    mountain(px, P.mtn,  44, GROUND, 60, 30);
    mountain(px, P.mtn2, 150, GROUND, 70, 38);
    mountain(px, P.mtn,  110, GROUND, 50, 22);

    // Suelo.
    for (let y = GROUND; y < H; y++) {
      px(0, y, W, 1, (y % 2 === 0) ? P.grass0 : P.grass1);
    }
    // Terraza de piedra de la finca.
    px(20, GROUND, W - 40, 2, P.stone);
    px(20, GROUND, W - 40, 1, P.stoneHi);

    const cx = Math.floor(W / 2);

    // Torres de esquina (nivel 3).
    if (tier >= 3) {
      pavilion(px, P, 26, GROUND - 2, 20, 30, { lanterns: true });
      pavilion(px, P, W - 26, GROUND - 2, 20, 30, { lanterns: true });
    }

    // Alas laterales (nivel 2+).
    if (tier >= 2) {
      const aw = tier >= 3 ? 34 : 28;
      const ah = tier >= 3 ? 20 : 16;
      pavilion(px, P, cx - (tier >= 3 ? 56 : 48), GROUND, aw, ah, { lanterns: true });
      pavilion(px, P, cx + (tier >= 3 ? 56 : 48), GROUND, aw, ah, { lanterns: true });
    }

    // Salón central (su tamaño crece con el nivel).
    const mainW = tier >= 3 ? 60 : tier >= 2 ? 52 : 44;
    const mainH = tier >= 3 ? 26 : tier >= 2 ? 24 : 20;
    pavilion(px, P, cx, GROUND, mainW, mainH, { lanterns: true, twoStory: tier >= 3 });

    // Árboles.
    tree(px, P, 30, H - 8, 16);
    if (tier >= 2) tree(px, P, W - 32, H - 9, 18);

    // Muro y portón frontal (nivel 2+) — al frente, tapa las bases.
    if (tier >= 2) {
      frontWall(px, P, H - 6, tier >= 3 ? 12 : 10);
    } else {
      // Nivel 1: una cerca baja de madera.
      const fy = H - 12;
      for (let x = 24; x < W - 24; x += 6) px(x, fy, 1, 6, P.wood);
      px(22, fy + 1, W - 44, 1, P.woodDk);
    }

    // Estandartes (cantidad según nivel).
    const flags = tier >= 3 ? 4 : tier >= 2 ? 2 : 0;
    if (flags >= 2) { banner(px, P, 60, H - 6, 22); banner(px, P, W - 62, H - 6, 22); }
    if (flags >= 4) { banner(px, P, 84, H - 6, 18); banner(px, P, W - 86, H - 6, 18); }

    // Senda de entrada.
    px(cx - 4, H - 6, 8, 6, P.stone);
    px(cx - 4, H - 6, 8, 1, P.stoneHi);
  }

  return { draw, W, H };
})();

if (typeof window !== 'undefined') window.HacPixel = HacPixel;
if (typeof module !== 'undefined' && module.exports) module.exports = HacPixel;
