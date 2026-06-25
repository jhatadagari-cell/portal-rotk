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

  const TILE_W = 36, TILE_H = 18;     // rombo isométrico 2:1 (LÓGICO)
  const SCALE = 2;                    // densidad de píxeles del lienzo (debe igualar S del generador)
  const TOP_MARGIN = 132;             // hueco arriba para edificios altos, murallas y torres
  const PAD_X = 40;                   // margen lateral para murallas y paseo de ronda
  const SPRITE_BASE = 'assets/img/iso/';
  const SPRITE_VER = '17';  // súbelo al regenerar los PNG (cache-busting)

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

    // Murallas: datos del nivel (necesarios para dimensionar el lienzo).
    const WALLS = {
      1: { h: 12, wt: 0.26, base: mix('#7d6b48', casa, .04), cap: false,   cren: false, towers: false, tex: 'rammed', gate: false },
      2: { h: 18, wt: 0.32, base: mix('#867c6b', casa, .04), cap: 'stone', cren: false, towers: false, tex: 'block',  gate: false },
      3: { h: 24, wt: 0.36, base: mix('#8f8674', casa, .04), cap: 'tile',  cren: true,  towers: false, tex: 'block',  gate: true },
      4: { h: 31, wt: 0.42, base: mix('#9a8f7e', casa, .04), cap: 'tile',  cren: true,  towers: true,  tex: 'block',  gate: true }
    };
    const wallLvl = ({ 1: 1, 2: 2, 3: 3, 4: 4, 5: 4, 6: 4 })[tier] || 1;
    const WD = WALLS[wallLvl];
    const wt = WD.wt, frontH = Math.max(9, Math.round(WD.h * 0.52));
    const M = 1;                       // paseo de ronda: anillo de pavimento entre edificios y muros
    const e = M + 0.5 + wt;            // alcance exterior (cara externa del muro) en celdas

    const W = Math.round(((GW - 1) + (GH - 1) + 4 * e) * TILE_W / 2) + 2 * PAD_X;
    const originX = PAD_X + ((GH - 1) + 2 * e) * TILE_W / 2 + TILE_W / 2, originY = TOP_MARGIN;
    const H = originY + Math.round(((GW - 1) + (GH - 1) + 2 * e) * TILE_H / 2) + TILE_H + 24;
    // Lienzo a SCALE× (más densidad): backing 2×, dibujo en coords lógicas.
    canvas.width = W * SCALE; canvas.height = H * SCALE;
    const g = canvas.getContext('2d');
    if (!g) return;
    g.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, W, H);

    const X = (gx, gy) => originX + (gx - gy) * TILE_W / 2;
    const Y = (gx, gy) => originY + (gx + gy) * TILE_H / 2;

    const poly = (pts, fill, stroke) => {
      g.beginPath();
      pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]));
      g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
    };

    // Proyección con altura (z en píxeles), para murallas y torres.
    const Pg = (gx, gy, z) => [originX + (gx - gy) * TILE_W / 2, originY + (gx + gy) * TILE_H / 2 - z];
    // Caja isométrica: dibuja tapa + caras SO/SE visibles (estilo prisma).
    const box = (gx0, gy0, gx1, gy1, z0, z1, cTop, cL, cR) => {
      const N = [gx0, gy0], E = [gx1, gy0], S = [gx1, gy1], Wc = [gx0, gy1];
      const T = p => Pg(p[0], p[1], z1), Bp = p => Pg(p[0], p[1], z0);
      poly([Bp(Wc), Bp(S), T(S), T(Wc)], cL, dark(cL, 0.42));
      poly([Bp(S), Bp(E), T(E), T(S)], cR, dark(cR, 0.42));
      poly([T(N), T(E), T(S), T(Wc)], cTop, dark(cTop, 0.42));
    };

    // ── Suelo: losas de piedra estilo Ciudad Prohibida ───────────────────
    // Cada celda = una baldosa rectangular sobre una junta de mortero: se pinta
    // primero el rombo completo (mortero) y encima un rombo encogido (la losa),
    // con variación tonal sutil por baldosa. Anillo exterior = paseo de ronda.
    const frac = (n) => n - Math.floor(n);
    const hash = (gx, gy) => frac(Math.sin(gx * 127.1 + gy * 311.7) * 43758.5453);
    const stoneBase = mix('#6f675b', casa, 0.05);
    const stoneVars = ['#746c5e', '#6b6357', '#776f60', '#675f54', '#716b5c']
      .map(c => mix(c, casa, 0.05));
    const mortar = dark(stoneBase, 0.42);
    const ringStone = mix(stoneBase, '#000', 0.05);
    const moss = mix('#46582a', stoneBase, 0.35);     // musgo verdoso
    const grass = mix('#3f5a2c', casa, 0.04);
    const inset = (cx, cy, k) => ([                       // rombo encogido (baldosa)
      [cx, cy - TILE_H / 2 * k], [cx + TILE_W / 2 * k, cy],
      [cx, cy + TILE_H / 2 * k], [cx - TILE_W / 2 * k, cy]
    ]);
    // Matita de hierba que crece en una junta (briznas verdes).
    const grassTuft = (cx, cy) => {
      g.lineWidth = 1;
      for (let i = -1; i <= 1; i++) {
        g.strokeStyle = i ? dark(grass, .12) : light(grass, .12);
        g.beginPath(); g.moveTo(cx + i * 1.7, cy + 1.5); g.lineTo(cx + i * 2.3, cy - 3); g.stroke();
      }
    };
    for (let gy = -M; gy < GH + M; gy++) {
      for (let gx = -M; gx < GW + M; gx++) {
        const cx = X(gx, gy), cy = Y(gx, gy);
        const n = hash(gx + 31, gy + 17);
        const mp = hash((gx >> 1) * 1.7 + 5, (gy >> 1) * 1.7 + 9);   // musgo en parches (2×2)
        const t2 = hash(gx * 2.3 + 7, gy * 2.3 + 3);
        const ring = (gx < 0 || gy < 0 || gx >= GW || gy >= GH);
        let col, mossy = false;
        if (ring) {
          const t = (n - 0.5) * 0.12; col = t >= 0 ? light(ringStone, t) : dark(ringStone, -t);
          if (mp > 0.66) { mossy = true; col = mix(col, moss, 0.4 + (mp - 0.66)); }   // musgo al pie del muro
        } else {
          col = stoneVars[((gx * 7 + gy * 13) % stoneVars.length + stoneVars.length) % stoneVars.length];
          if (mp > 0.76) { mossy = true; col = mix(col, moss, 0.35 + (mp - 0.76) * 1.6); }
          const t = (n - 0.5) * 0.14; col = t >= 0 ? light(col, t) : dark(col, -t);
        }
        // mortero (verdoso si hay musgo) + losa (rombo encogido)
        poly([[cx, cy - TILE_H / 2], [cx + TILE_W / 2, cy], [cx, cy + TILE_H / 2], [cx - TILE_W / 2, cy]], mossy ? mix(mortar, moss, .55) : mortar);
        poly(inset(cx, cy, 0.88), col, dark(col, 0.18));
        // hierba en las juntas: abundante en musgo y al pie del muro, rara en el patio
        if (mossy ? t2 > 0.45 : (ring ? t2 > 0.80 : t2 > 0.94)) grassTuft(cx, cy + TILE_H * 0.22);
      }
    }

    // ── Murallas (tras el paseo de ronda) ────────────────────────────────
    const capH = WD.cap === 'tile' ? 4 : 3;
    const wTop = light(WD.base, .14), wL = dark(WD.base, .18), wR = dark(WD.base, .33);
    const capCol = WD.cap === 'tile' ? mix('#933c22', casa, .04) : light(WD.base, .16);
    const capT = light(capCol, .14), capL = dark(capCol, .14), capR = dark(capCol, .30);
    const tileRoof = mix('#933c22', casa, .04), gold = '#d0a84a', dark9 = '#1a120a';
    const wallSegs = [];
    const seg = (p, q, col) => { g.strokeStyle = col; g.lineWidth = 1; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke(); };
    // Límites de los muros (interior = cara al patio · exterior = cara de fuera).
    const WLi = -M - 0.5, WLo = WLi - wt;             // muro trasero-izq (x)
    const WTi = -M - 0.5, WTo = WTi - wt;             // muro trasero-der (y)
    const FLi = GH - 1 + M + 0.5, FLo = FLi + wt;     // muro delantero-izq (y)
    const FRi = GW - 1 + M + 0.5, FRo = FRi + wt;     // muro delantero-der (x)
    const lo = -M, hiH = GH - 1 + M, hiW = GW - 1 + M;
    const even = (k) => (((k % 2) + 2) % 2) === 0, third = (k) => (((k % 3) + 3) % 3) === 0;

    // Textura de sillería sobre una cara vertical (E: x fijo · S: y fijo).
    const texFace = (face, fixed, plo, phi, z0, z1) => {
      const at = (u, z) => face === 'E' ? Pg(fixed, u, z) : Pg(u, fixed, z);
      if (WD.tex === 'rammed') { for (const t of [.36, .68]) { const z = z0 + (z1 - z0) * t; seg(at(plo, z), at(phi, z), dark(WD.base, .28)); } return; }
      const jc = dark(WD.base, .42), courses = Math.max(3, Math.round((z1 - z0) / 4.5));
      for (let i = 1; i < courses; i++) { const z = z0 + (z1 - z0) * i / courses; seg(at(plo, z), at(phi, z), jc); }
      const ncol = Math.max(1, Math.round((phi - plo) / 0.45));
      for (let i = 1; i <= courses; i++) {
        const za = z0 + (z1 - z0) * (i - 1) / courses, zb = z0 + (z1 - z0) * i / courses;
        for (let j = 1; j < ncol; j++) { const u = plo + (phi - plo) * (j + (i % 2 ? 0 : 0.5)) / ncol; if (u <= plo + 1e-3 || u >= phi - 1e-3) continue; seg(at(u, za), at(u, zb), jc); }
      }
    };
    const cap = (a, b, c, d, z) => {
      if (!WD.cap) return;
      box(a - .08, b - .08, c + .08, d + .08, z, z + capH, capT, capL, capR);
      if (WD.cap === 'tile') seg(Pg(a - .08, d + .08, z + capH), Pg(c + .08, d + .08, z + capH), light(capCol, .3));
    };
    // Almena de sillería integrada: nace del propio muro y rebasa la coronación
    // (entre almenas queda el hueco con la teja → merlón/almena clásico).
    const mh = capH + 4;
    const merlon = (face, inner, u0, z) => {
      if (face === 'y') box(inner - wt, u0 + .12, inner, u0 + .52, z, z + mh, wTop, wL, wR);
      else box(u0 + .12, inner - wt, u0 + .52, inner, z, z + mh, wTop, wL, wR);
    };
    // Contrafuerte saliente al patio.
    const buttress = (face, inner, u, h) => {
      const ce = light(WD.base, .04), cl = dark(WD.base, .24), cr = dark(WD.base, .4), p = wt * 0.5;
      if (face === 'E') { box(inner, u - .12, inner + p, u + .12, 0, h, ce, cl, cr); texFace('E', inner + p, u - .12, u + .12, 0, h); }
      else { box(u - .12, inner, u + .12, inner + p, 0, h, ce, cl, cr); texFace('S', inner + p, u - .12, u + .12, 0, h); }
    };

    // Muro TRASERO-izquierdo (x), cara al patio (+x).
    for (let gy = lo; gy <= hiH; gy++) {
      const b = gy - 0.5, d = gy + 0.5;
      wallSegs.push({ key: WLo + gy, draw: () => {
        box(WLo, b, WLi, d, 0, WD.h, wTop, wL, wR); texFace('E', WLi, b, d, 0, WD.h); cap(WLo, b, WLi, d, WD.h);
        if (WD.cren && even(gy)) merlon('y', WLi, gy - 0.5, WD.h);
      } });
      if (third(gy)) wallSegs.push({ key: WLi + gy + 0.02, draw: () => buttress('E', WLi, gy - 0.5, WD.h) });
    }
    // Muro TRASERO-derecho (y), cara al patio (+y).
    for (let gx = lo; gx <= hiW; gx++) {
      const a = gx - 0.5, c = gx + 0.5;
      wallSegs.push({ key: gx + WTo, draw: () => {
        box(a, WTo, c, WTi, 0, WD.h, wTop, wL, wR); texFace('S', WTi, a, c, 0, WD.h); cap(a, WTo, c, WTi, WD.h);
        if (WD.cren && even(gx)) merlon('x', WTi, gx - 0.5, WD.h);
      } });
      if (third(gx)) wallSegs.push({ key: gx + WTi + 0.02, draw: () => buttress('S', WTi, gx - 0.5, WD.h) });
    }
    // Portón monumental (城門) en el muro delantero-IZQUIERDO (lado corto,
    // abajo-izquierda): base de sillería con vano y portón rojo de tachones
    // dorados (門釘) + torre-puerta (城樓) con tejado a cuatro aguas.
    const gateGc = WD.gate ? Math.floor(GW / 2) : -999;
    const gate = (gc) => {
      const a = gc - 1.5, c = gc + 1.5, y0 = FLi, y1 = FLo, gh = WD.h + 6;
      box(a, y0, c, y1, 0, gh, wTop, wL, wR); texFace('S', y1, a, c, 0, gh); cap(a, y0, c, y1, gh);
      // vano + dos hojas rojas con dintel (cara sur, y=y1)
      const dz = gh * 0.6, doorCol = mix('#7a241a', casa, .03);
      poly([Pg(gc - 0.62, y1, 0), Pg(gc + 0.62, y1, 0), Pg(gc + 0.62, y1, dz + 0.7), Pg(gc - 0.62, y1, dz + 0.7)], dark9);
      poly([Pg(gc - 0.58, y1, 0), Pg(gc - 0.02, y1, 0), Pg(gc - 0.02, y1, dz), Pg(gc - 0.58, y1, dz)], doorCol);
      poly([Pg(gc + 0.02, y1, 0), Pg(gc + 0.58, y1, 0), Pg(gc + 0.58, y1, dz), Pg(gc + 0.02, y1, dz)], doorCol);
      seg(Pg(gc, y1, 0), Pg(gc, y1, dz), dark(doorCol, .45));
      seg(Pg(gc - 0.62, y1, dz + 0.5), Pg(gc + 0.62, y1, dz + 0.5), capCol);
      g.fillStyle = gold;                                   // tachones 門釘
      for (const lf of [-1, 1]) for (let r = 0; r < 4; r++) for (let cc = 0; cc < 3; cc++) {
        const p = Pg(gc + lf * (0.10 + cc * 0.16), y1, dz * (0.22 + r * 0.2)); g.beginPath(); g.arc(p[0], p[1], 1.1, 0, 7); g.fill();
      }
      // torre-puerta (城樓): cuerpo de madera + friso turquesa + columnas rojas
      const tz = gh, bh = 11, wood = mix('#6a4a2a', casa, .03);
      box(a, y0, c, y1, tz, tz + bh, light(wood, .08), dark(wood, .22), dark(wood, .38));
      poly([Pg(a, y1, tz + bh - 3), Pg(c, y1, tz + bh - 3), Pg(c, y1, tz + bh - 0.6), Pg(a, y1, tz + bh - 0.6)], mix('#3a8472', casa, .03));
      [a, (a + c) / 2, c].forEach(xx => seg(Pg(xx, y1, tz), Pg(xx, y1, tz + bh), '#9c3c22'));
      // tejado a cuatro aguas con cumbrera a lo largo de x
      const rz = tz + bh, rh = 11, ov = 0.32, cym = (y0 + y1) / 2, ins = 0.55;
      const NW = Pg(a - ov, y0 - ov, rz), NE = Pg(c + ov, y0 - ov, rz), SE = Pg(c + ov, y1 + ov, rz), SW = Pg(a - ov, y1 + ov, rz);
      const r0 = Pg(a + ins, cym, rz + rh), r1 = Pg(c - ins, cym, rz + rh);
      poly([NW, NE, r1, r0], dark(tileRoof, .30)); poly([NW, SW, r0], dark(tileRoof, .16));   // norte (atrás) + hip oeste
      poly([NE, SE, r1], dark(tileRoof, .06));                                                 // hip este
      poly([SW, SE, r1, r0], light(tileRoof, .10));                                            // sur (vista)
      seg(r0, r1, dark(tileRoof, .42)); seg([r0[0], r0[1] - 1], [r1[0], r1[1] - 1], light(tileRoof, .3));
      seg(r0, [r0[0], r0[1] - 5], gold); g.fillStyle = gold; g.beginPath(); g.arc(r0[0], r0[1] - 6, 1.4, 0, 7); g.fill();
    };
    // Muro DELANTERO-izquierdo (x), más bajo, con el portón centrado.
    for (let gx = lo; gx <= hiW; gx++) {
      if (gx === gateGc) { wallSegs.push({ key: gx + FLo + 0.01, draw: () => gate(gx) }); continue; }
      if (WD.gate && Math.abs(gx - gateGc) <= 1) continue;     // hueco que ocupa el portón (3 celdas)
      const a = gx - 0.5, c = gx + 0.5;
      wallSegs.push({ key: gx + FLo, draw: () => { box(a, FLi, c, FLo, 0, frontH, wTop, wL, wR); texFace('S', FLo, a, c, 0, frontH); cap(a, FLi, c, FLo, frontH); } });
    }
    // Muro DELANTERO-derecho (x), más bajo (sin portón).
    for (let gy = lo; gy <= hiH; gy++) {
      const b = gy - 0.5, d = gy + 0.5;
      wallSegs.push({ key: FRo + gy, draw: () => { box(FRi, b, FRo, d, 0, frontH, wTop, wL, wR); texFace('E', FRo, b, d, 0, frontH); cap(FRi, b, FRo, d, frontH); } });
    }
    // Torres de esquina (nivel 4): tronco texturizado + saetera + tejado + pináculo.
    const tower = (cgx, cgy) => {
      const tw = 0.5, th = WD.h + 14;
      box(cgx - tw, cgy - tw, cgx + tw, cgy + tw, 0, th, light(WD.base, .06), dark(WD.base, .2), dark(WD.base, .36));
      texFace('E', cgx + tw, cgy - tw, cgy + tw, 0, th); texFace('S', cgy + tw, cgx - tw, cgx + tw, 0, th);
      poly([Pg(cgx + tw, cgy - .12, th * .46), Pg(cgx + tw, cgy + .12, th * .46), Pg(cgx + tw, cgy + .12, th * .72), Pg(cgx + tw, cgy - .12, th * .72)], dark9);
      poly([Pg(cgx - .12, cgy + tw, th * .46), Pg(cgx + .12, cgy + tw, th * .46), Pg(cgx + .12, cgy + tw, th * .72), Pg(cgx - .12, cgy + tw, th * .72)], dark9);
      box(cgx - tw - .14, cgy - tw - .14, cgx + tw + .14, cgy + tw + .14, th, th + 3, dark(tileRoof, .08), dark(tileRoof, .22), dark(tileRoof, .34));
      const ap = Pg(cgx, cgy, th + 17);
      const n = Pg(cgx - tw - .2, cgy - tw - .2, th + 3), e = Pg(cgx + tw + .2, cgy - tw - .2, th + 3), so = Pg(cgx + tw + .2, cgy + tw + .2, th + 3), w = Pg(cgx - tw - .2, cgy + tw + .2, th + 3);
      poly([n, e, ap], dark(tileRoof, .26)); poly([n, w, ap], dark(tileRoof, .14)); poly([w, so, ap], light(tileRoof, .1)); poly([so, e, ap], dark(tileRoof, .04));
      seg(Pg(cgx, cgy, th + 17), Pg(cgx, cgy, th + 21), gold);
      g.fillStyle = gold; g.beginPath(); g.arc(ap[0], ap[1] - 4, 1.7, 0, 7); g.fill();
    };
    if (WD.towers) {
      const cN = -M - 0.5 - wt / 2, cE = GW - 1 + M + 0.5 + wt / 2, cW = GH - 1 + M + 0.5 + wt / 2;
      wallSegs.push({ key: -2, draw: () => tower(cN, cN) });                    // esquina N (fondo)
      wallSegs.push({ key: GW - 1 + M, draw: () => tower(cE, cN) });            // esquina E (der-fondo)
      wallSegs.push({ key: GH - 1 + M, draw: () => tower(cN, cW) });            // esquina W (izq-frente)
    }

    // ── Orden de pintado ──────────────────────────────────────────────────
    const lista = B ? B.construccionesValidas(opts.mapa, tier)
      : ((opts.mapa && opts.mapa.construcciones) || []);
    const fp = (c) => B ? B.footprintDe(c) : [1, 1];
    const sortKey = (c) => { const f = fp(c); return (c.pos[0] + f[0] - 1) + (c.pos[1] + f[1] - 1); };
    const drawC = (c) => (spritesReady && META) ? sprite(c) : placeholder(c);
    // Las construcciones de capa 'suelo' (jardines, estanques…) son PLANAS: con
    // huella grande, un orden de profundidad por celda delantera las pondría por
    // delante de edificios que en realidad están delante de ellas. Se pintan como
    // capa sobre el pavimento; muros y edificios (volumétricos) van por encima.
    // La capa la declara el catálogo (HacBuild.esSuelo); fallback por altura para
    // tolerar una versión antigua de hac-build.js en caché.
    const isFlat = (c) => {
      if (B && typeof B.esSuelo === 'function') return B.esSuelo(c.tipo);
      const d = B && B.tipo(c.tipo); return !!d && (d.altura || 24) <= 8;
    };
    lista.filter(isFlat).sort((a, b) => sortKey(a) - sortKey(b) || a.pos[0] - b.pos[0]).forEach(drawC);
    // Muros + edificios, en un único orden de profundidad.
    const drawList = wallSegs.slice();
    lista.filter(c => !isFlat(c)).forEach(c => drawList.push({ key: sortKey(c), x: c.pos[0], draw: () => drawC(c) }));
    drawList.sort((a, b) => a.key - b.key || (a.x || 0) - (b.x || 0));
    drawList.forEach(d => d.draw());

    // ── Grano sutil: rompe el monocromo del suelo y las murallas (textura) ──
    // Ruido de luminancia determinista por píxel; los sprites (ya texturizados)
    // reciben un grano leve que unifica el conjunto.
    try {
      g.setTransform(1, 0, 0, 1, 0, 0);
      const id = g.getImageData(0, 0, canvas.width, canvas.height), d = id.data, CW = canvas.width;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < CW; x++) {
        const i = (y * CW + x) * 4; if (d[i + 3] < 16) continue;
        const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        const j = Math.round(((s - Math.floor(s)) - 0.5) * 6);   // ±3
        d[i] += j; d[i + 1] += j; d[i + 2] += j;                  // (clamp implícito Uint8ClampedArray)
      }
      g.putImageData(id, 0, 0);
    } catch (e) { /* getImageData podría fallar por CORS; en ese caso, sin grano */ }

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
      // El sprite está horneado a SCALE× (meta en px de dispositivo). Lo pintamos
      // a tamaño NATIVO en coords de dispositivo para que quede nítido (1:1).
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(img, Math.round(X(c.pos[0], c.pos[1]) * SCALE - m.ox), Math.round(Y(c.pos[0], c.pos[1]) * SCALE - m.oy));
      g.setTransform(SCALE, 0, 0, SCALE, 0, 0);
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

  return { draw, TILE_W, TILE_H, SCALE };
})();

if (typeof window !== 'undefined') window.HacIso = HacIso;
if (typeof module !== 'undefined' && module.exports) module.exports = HacIso;
