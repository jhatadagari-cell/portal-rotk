/* ═══════════════════════════════════════════════════════════════════════
   hac-iso.js — Render ISOMÉTRICO del tablero de una hacienda.
   ─────────────────────────────────────────────────────────────────────────
   Dibuja la rejilla (NxN según el nivel) y los edificios colocados (campo
   `mapa`, ver hac-build.js). Usa SPRITES isométricos fijos (assets/img/iso/*.png,
   generados por tools/gen-iso-sprites.js, con anclajes en window.ISO_SPRITES_META).
   Mientras las imágenes cargan —o si faltan— cae a un placeholder de prismas.

   La capa de LAYOUT (geometría iso + orden de pintado) es la misma para sprite
   y placeholder; solo cambia cómo se pinta cada edificio.

   API:  HacIso.draw(canvas, { mapa, tier, color })
   Estático (sin bucles de animación; precarga de imágenes una sola vez).
   ═══════════════════════════════════════════════════════════════════════ */
const HacIso = (function () {
  'use strict';

  const TILE_W = 36, TILE_H = 18;     // rombo isométrico 2:1
  const TOP_MARGIN = 78;              // hueco arriba para edificios altos
  const PAD_X = 16;                   // margen lateral para aleros volados
  const SPRITE_BASE = 'assets/img/iso/';
  const SPRITE_VER = '4';   // súbelo al regenerar los PNG (cache-busting)

  // ── Color helpers (para el placeholder) ─────────────────────────────────
  function hexToRgb(h) {
    h = String(h || '').replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (h.length !== 6) h = 'c9a84c';
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (r, g, b) => '#' + [r, g, b].map(v => cl(v).toString(16).padStart(2, '0')).join('');
  function mix(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }
  const light = (c, t) => mix(c, '#ffffff', t);
  const dark  = (c, t) => mix(c, '#000000', t);
  const safeColor = (c) => /^#?[0-9a-fA-F]{3,6}$/.test(String(c || '')) ? c : '#c9a84c';

  // ── Precarga de sprites ─────────────────────────────────────────────────
  const META = (typeof window !== 'undefined' && window.ISO_SPRITES_META) || null;
  const SPRITES = {};
  let spritesReady = false, preloadStarted = false;
  const pending = new Map();   // canvas → opts (para re-render al cargar)

  function preload() {
    if (preloadStarted || !META || typeof Image === 'undefined') return;
    preloadStarted = true;
    const keys = Object.keys(META);
    let left = keys.length;
    if (!left) { spritesReady = true; return; }
    keys.forEach(k => {
      const img = new Image();
      const done = () => { if (--left === 0) { spritesReady = true; flush(); } };
      img.onload = () => { SPRITES[k] = img; done(); };
      img.onerror = done;
      img.src = SPRITE_BASE + k + '.png?v=' + SPRITE_VER;
    });
  }
  function flush() {
    const q = Array.from(pending.entries());
    pending.clear();
    q.forEach(([canvas, opts]) => render(canvas, opts));
  }

  // ── Punto de entrada ────────────────────────────────────────────────────
  function draw(canvas, opts) {
    if (!canvas) return;
    preload();
    render(canvas, opts || {});
    // Si los sprites aún no están, re-renderizamos este lienzo al cargar.
    if (META && !spritesReady) pending.set(canvas, opts || {});
  }

  // ── Render ──────────────────────────────────────────────────────────────
  function render(canvas, opts) {
    const B = (typeof HacBuild !== 'undefined') ? HacBuild : null;
    const tier = Math.max(1, Math.min(B ? B.MAX_TIER : 3, Number(opts.tier) || 1));
    const dims = B ? B.gridDims(tier) : [2 + tier, 2 + tier];
    const GW = dims[0], GH = dims[1];
    const casa = safeColor(opts.color);

    const W = Math.round((GW + GH) * TILE_W / 2) + 2 * PAD_X;
    const H = TOP_MARGIN + Math.round((GW + GH - 1) * TILE_H / 2) + TILE_H + 8;
    canvas.width = W; canvas.height = H;
    const g = canvas.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, W, H);

    // Origen: el vértice más al oeste (celda [0, GH-1]) queda a PAD_X del borde.
    const originX = PAD_X + (GH - 1) * TILE_W / 2 + TILE_W / 2, originY = TOP_MARGIN;
    const X = (gx, gy) => originX + (gx - gy) * TILE_W / 2;
    const Y = (gx, gy) => originY + (gx + gy) * TILE_H / 2;

    const poly = (pts, fill, stroke) => {
      g.beginPath();
      pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]));
      g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
    };

    // ── Suelo: rombos por profundidad ────────────────────────────────────
    const grass0 = mix('#1c2b16', casa, 0.05);
    const grass1 = mix('#243a1c', casa, 0.06);
    const grassEdge = dark(grass0, 0.3);
    for (let s = 0; s <= (GW - 1) + (GH - 1); s++) {
      for (let gx = 0; gx < GW; gx++) {
        const gy = s - gx;
        if (gy < 0 || gy >= GH) continue;
        const cx = X(gx, gy), cy = Y(gx, gy);
        poly([
          [cx, cy - TILE_H / 2], [cx + TILE_W / 2, cy],
          [cx, cy + TILE_H / 2], [cx - TILE_W / 2, cy]
        ], (gx + gy) % 2 ? grass1 : grass0, grassEdge);
      }
    }

    // ── Edificios, ordenados por profundidad (z = celda sur del footprint) ─
    const lista = B ? B.construccionesValidas(opts.mapa, tier)
      : ((opts.mapa && opts.mapa.construcciones) || []);
    const fp = (c) => B ? B.footprintDe(c) : [1, 1];
    const sortKey = (c) => { const f = fp(c); return (c.pos[0] + f[0] - 1) + (c.pos[1] + f[1] - 1); };
    lista.slice()
      .sort((a, b) => sortKey(a) - sortKey(b) || a.pos[0] - b.pos[0])
      .forEach(c => (spritesReady && META) ? sprite(c) : placeholder(c));

    // Clave de sprite: tipo + rotación 0..3 (cada una con la puerta en su cara).
    function spriteKey(c) {
      const def = B && B.tipo(c.tipo);
      if (!def) return null;
      return 'bld-' + c.tipo + '-' + (((c.rot || 0) % 4 + 4) % 4);
    }

    function sprite(c) {
      const key = spriteKey(c);
      const img = key && SPRITES[key];
      const m = key && META[key];
      if (!img || !m) { placeholder(c); return; }
      g.drawImage(img, Math.round(X(c.pos[0], c.pos[1]) - m.ox), Math.round(Y(c.pos[0], c.pos[1]) - m.oy));
    }

    // Placeholder de prisma (mientras carga el sprite o si falta).
    function placeholder(c) {
      const def = B ? B.tipo(c.tipo) : null;
      const f = fp(c);
      const gx = c.pos[0], gy = c.pos[1];
      const w = f[0], h = f[1];
      const bh = (def && def.altura) || 24;
      const base = def ? mix(def.color, casa, 0.18) : casa;
      const N_ = [X(gx, gy), Y(gx, gy) - TILE_H / 2];
      const E_ = [X(gx + w - 1, gy) + TILE_W / 2, Y(gx + w - 1, gy)];
      const S_ = [X(gx + w - 1, gy + h - 1), Y(gx + w - 1, gy + h - 1) + TILE_H / 2];
      const W_ = [X(gx, gy + h - 1) - TILE_W / 2, Y(gx, gy + h - 1)];
      const up = (p) => [p[0], p[1] - bh];
      const stroke = dark(base, 0.55);
      poly([W_, S_, up(S_), up(W_)], dark(base, 0.18), stroke);
      poly([S_, E_, up(E_), up(S_)], dark(base, 0.34), stroke);
      poly([up(N_), up(E_), up(S_), up(W_)], light(base, 0.14), stroke);
    }
  }

  return { draw, TILE_W, TILE_H };
})();

if (typeof window !== 'undefined') window.HacIso = HacIso;
if (typeof module !== 'undefined' && module.exports) module.exports = HacIso;
