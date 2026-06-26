/* ═══════════════════════════════════════════════════════════════════════
   hac-flora.js — Pixel-art del TERRITORIO que rodea la finca (alta calidad).
   ─────────────────────────────────────────────────────────────────────────
   Genera sprites detallados y heterogéneos (árboles de varias especies,
   arbustos, rocas, juncos, flores) a resolución de arte (1 px de arte = 1 px de
   dispositivo). Técnicas: rampas de sombreado de 6 tonos, sombreado ESFÉRICO
   por píxel (normal·luz), dithering Bayer 4×4 entre bandas, oclusión ambiental,
   luz de borde, copas compuestas por CLUSTERS de follaje heterogéneos y
   contorno oscuro. Cada sprite se cachea por (tipo, estación, variante).

   API:  HacFlora.tree(especie, estacion, v) · bush · rock · reeds · flowers
         HacFlora.SPECIES → ['broadleaf','conifer','blossom','willow','bamboo']
   El anclaje al suelo de cada sprite es su borde inferior-centro.
   Debe cargarse antes que hac-iso.js.
   ═══════════════════════════════════════════════════════════════════════ */
const HacFlora = (function () {
  'use strict';
  const { hexToRgb, rgbToHex } = HacUtil;
  const mix = (a, b, t) => { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
  const light = (c, t) => mix(c, '#ffffff', t), dark = (c, t) => mix(c, '#000000', t);
  const ramp = (base) => [dark(base, 0.46), dark(base, 0.30), dark(base, 0.14), base, light(base, 0.15), light(base, 0.32)];
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

  // PRNG determinista (mulberry32): variantes estables y distintas.
  function mulberry(s) { return function () { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // ── Construcción de sprites ─────────────────────────────────────────────
  function makeSprite(W, H, painter, noOutline) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
    const px = (x, y, w, h, c) => { if (!c) return; ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w || 1), Math.round(h || 1)); };
    painter(px, W, H);
    if (!noOutline) outline(ctx, W, H);
    return cv;
  }
  function outline(ctx, W, H) {
    const img = ctx.getImageData(0, 0, W, H), d = img.data, out = new Uint8ClampedArray(d);
    const a = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : d[(y * W + x) * 4 + 3];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i + 3] < 24 && (a(x - 1, y) > 48 || a(x + 1, y) > 48 || a(x, y - 1) > 48 || a(x, y + 1) > 48)) {
        out[i] = 22; out[i + 1] = 17; out[i + 2] = 11; out[i + 3] = 255;
      }
    }
    ctx.putImageData(new ImageData(out, W, H), 0, 0);
  }

  // ── Primitiva de follaje: clúster esférico sombreado ────────────────────
  // Sombreado por normal·luz (volumen real), dithering entre tonos de la rampa,
  // oclusión ambiental hacia abajo y borde dentado. `bias` aclara/oscurece todo
  // el clúster (para apilar copas: los de detrás/abajo más oscuros).
  const LX = -0.48, LY = -0.60, LZ = 0.64;
  function clump(px, cx, cy, rx, ry, rmp, rnd, bias) {
    bias = bias || 0; rx = Math.round(rx); ry = Math.round(ry); const n = rmp.length;
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
      const nx = x / rx, ny = y / ry, d = nx * nx + ny * ny;
      if (d > 1) continue;
      if (d > 0.60 && rnd() < 0.5) continue;                 // silueta orgánica
      const nz = Math.sqrt(1 - d);
      let L = nx * LX + ny * LY + nz * LZ;                    // -1..1
      L = 0.52 + L * 0.5 + bias - (ny > 0 ? ny * 0.22 : 0);  // a luz + AO inferior
      let f = L * (n - 1), idx = Math.floor(f);
      if ((f - idx) * 16 > BAYER[(cy + y) & 3][(cx + x) & 3]) idx++;
      idx = idx < 0 ? 0 : idx > n - 1 ? n - 1 : idx;
      px(cx + x, cy + y, 1, 1, rmp[idx]);
    }
  }
  // Copa compuesta por varios clústeres heterogéneos (cada uno con su tono base
  // del conjunto `bases`) + moteado de hojas sueltas (luz y sombra).
  function crown(px, cx, cy, R, bases, rnd) {
    const spec = [[0, R * 0.38, 0.98, 0.74, -0.14], [-0.62, R * 0.12, 0.62, 0.58, -0.07], [0.62, R * 0.16, 0.62, 0.58, -0.07],
      [-0.28, -R * 0.36, 0.58, 0.54, 0.07], [0.32, -R * 0.26, 0.54, 0.5, 0.05], [0, -R * 0.08, 0.74, 0.66, 0.0]];
    spec.forEach(s => clump(px, cx + s[0] * R, cy + s[1], R * s[2], R * s[3], ramp(bases[(rnd() * bases.length) | 0]), rnd, s[4]));
    for (let i = 0; i < R * 6; i++) {                        // hojas sueltas
      const ang = rnd() * 6.28, r = rnd() * R, base = bases[(rnd() * bases.length) | 0];
      px(cx + Math.cos(ang) * r, cy - R * 0.05 + Math.sin(ang) * r * 0.82, 1, 1, rnd() < 0.5 ? light(base, 0.36) : dark(base, 0.36));
    }
  }
  // Tronco con corteza: vetas verticales, conicidad, base acampanada y nudos.
  function trunk(px, cx, baseY, height, w, season, rnd, lean) {
    lean = lean || 0;
    const tp = trunkPal(season), rmp = [dark(tp[0], 0.42), dark(tp[0], 0.22), tp[0], light(tp[0], 0.18), light(tp[0], 0.36)];
    const topY = baseY - height, n = rmp.length;
    for (let y = topY; y < baseY; y++) {
      const k = (y - topY) / height, ww = w * (0.78 + k * 0.55), cxx = cx + lean * (1 - k);
      const half = ww / 2;
      for (let x = -Math.ceil(half); x <= Math.ceil(half); x++) {
        if (Math.abs(x) > half) continue;
        let L = 0.5 - (x / half) * 0.55 + (Math.sin(x * 1.6 + y * 0.18) > 0.55 ? 0.12 : 0);
        let idx = Math.round(L * (n - 1)); idx = idx < 0 ? 0 : idx > n - 1 ? n - 1 : idx;
        px(cxx + x, y, 1, 1, rmp[idx]);
      }
    }
    for (let i = 0; i < 2; i++) { const ky = topY + height * (0.35 + i * 0.3), kx = cx + (rnd() < 0.5 ? -1 : 1); px(kx, ky, 2, 2, dark(tp[0], 0.4)); px(kx, ky, 1, 1, dark(tp[0], 0.55)); }
    for (let x = -w; x <= w; x++) if (rnd() < 0.55) px(cx + x, baseY - 1, 1, 1, dark(tp[0], 0.34));   // raíces
  }

  // ── Paletas por estación ────────────────────────────────────────────────
  function trunkPal(season) { return season === 'invierno' ? ['#5a4836', '#6e5a44', '#3c2e22'] : ['#6b4d30', '#82603c', '#46331f']; }
  function decid(season) {
    switch (season) {
      case 'primavera': return { bases: ['#56a038', '#6cbb48', '#84cf5a', '#9bd86e'], petal: '#f1bcd6' };
      case 'otono':     return { bases: ['#a23c19', '#c2671e', '#d98a2c', '#e3bb44', '#b5611f', '#8a4a16'] };
      case 'invierno':  return { bare: true };
      default:          return { bases: ['#2f6324', '#3c7e2c', '#4a8c34', '#358026'] };
    }
  }
  function blossomP(season) {
    if (season === 'primavera') return { bases: ['#e89ec0', '#f3bcd6', '#ffd9e8'], bloom: true };
    if (season === 'otono')     return { bases: ['#c2671e', '#d98a2c', '#e3bb44', '#b5611f'] };
    if (season === 'invierno')  return { bare: true };
    return { bases: ['#3f8230', '#56a03c', '#6fb84e'] };
  }
  function coniferP(season) {
    if (season === 'otono')    return { bases: ['#2e5a26', '#3a6a2a', '#4a6e26'] };
    if (season === 'invierno') return { bases: ['#23502b', '#2f6234', '#3f7642'], snow: true };
    return { bases: ['#1f5a2c', '#2b6a36', '#3a7e44'] };
  }
  function willowP(season) {
    if (season === 'primavera') return { bases: ['#7aa84a', '#8fc05a', '#a6d06a'] };
    if (season === 'otono')     return { bases: ['#b58a2c', '#cda83a', '#dcc44e'] };
    if (season === 'invierno')  return { bare: true };
    return { bases: ['#4a8a36', '#5ea043', '#74b850'] };
  }

  // ── Árbol caduco desnudo (invierno) ─────────────────────────────────────
  function paintBare(px, W, H, rnd, season) {
    const cx = W >> 1, baseY = H - 2, h = Math.round(H * 0.6);
    trunk(px, cx, baseY, h, 6, season, rnd);
    const tp = trunkPal(season), topY = baseY - h, ends = [];
    const branch = (x0, y0, ang, len, wd) => {
      let x = x0, y = y0;
      for (let i = 0; i < len; i++) { x += Math.cos(ang); y -= Math.sin(ang); px(x, y, wd, wd, i < len * 0.5 ? tp[0] : tp[2]); }
      if (len > 6) { for (let s = 0; s < 2; s++) { let bx = x, by = y, a2 = ang + (s ? 0.7 : -0.7); for (let i = 0; i < len * 0.5; i++) { bx += Math.cos(a2); by -= Math.sin(a2); px(bx, by, 1, 1, tp[2]); } ends.push([bx, by]); } }
      ends.push([x, y]);
    };
    branch(cx, topY + 8, 1.9, 16, 2); branch(cx, topY + 13, 1.15, 17, 2); branch(cx, topY + 10, 2.5, 15, 2);
    branch(cx, topY + 18, 0.5, 13, 1); branch(cx, topY + 4, 1.55, 13, 2); branch(cx, topY + 22, 2.55, 11, 1);
    if (season === 'invierno') ends.forEach(([x, y]) => { for (let k = -2; k <= 2; k++) if (rnd() < 0.5) px(x + k, y - 1, 1, 1, '#eef4f6'); });
  }

  // ── Especies de árbol ───────────────────────────────────────────────────
  function paintBroadleaf(season, v) {
    return (px, W, H) => {
      const rnd = mulberry(v * 131 + 7), F = decid(season), cx = W >> 1, baseY = H - 2;
      if (F.bare) return paintBare(px, W, H, rnd, season);
      trunk(px, cx, baseY, Math.round(H * 0.46), 6, season, rnd, (rnd() - 0.5) * 4);
      const R = Math.round(W * 0.36), cy = Math.round(H * 0.34);
      crown(px, cx, cy, R, F.bases, rnd);
      if (F.petal) for (let i = 0; i < 12; i++) px(cx - R + rnd() * R * 2, cy - R * 0.5 + rnd() * R, 1, 1, F.petal);
    };
  }
  function paintBlossom(season, v) {
    return (px, W, H) => {
      const rnd = mulberry(v * 113 + 8), F = blossomP(season), cx = W >> 1, baseY = H - 2;
      if (F.bare) return paintBare(px, W, H, rnd, season);
      trunk(px, cx, baseY, Math.round(H * 0.44), 6, season, rnd, (rnd() - 0.5) * 5);
      const R = Math.round(W * 0.35), cy = Math.round(H * 0.33);
      crown(px, cx, cy, R, F.bases, rnd);
      if (F.bloom) for (let i = 0; i < R * 3; i++) { const a = rnd() * 6.28, r = rnd() * R; px(cx + Math.cos(a) * r, cy - R * 0.05 + Math.sin(a) * r * 0.82, 1, 1, rnd() < 0.45 ? '#ffffff' : '#ffd9e8'); }
    };
  }
  function paintConifer(season, v) {
    return (px, W, H) => {
      const rnd = mulberry(v * 97 + 3), C = coniferP(season), cx = W >> 1, baseY = H - 2;
      trunk(px, cx, baseY, 16, 5, season, rnd);
      const tiers = 5, topY = 8, botY = baseY - 10, span = botY - topY, wmax = W * 0.46;
      const rmps = C.bases.map(ramp);
      for (let t = 0; t < tiers; t++) {
        const ty = topY + (t / tiers) * span, ty2 = topY + ((t + 1) / tiers) * span + 7;
        const wide = 5 + ((t + 1) / tiers) * wmax, rmp = rmps[t % rmps.length], n = rmp.length;
        for (let y = ty; y < ty2; y++) {
          const k = (y - ty) / (ty2 - ty), w = Math.max(2, wide * k);
          for (let x = -Math.ceil(w); x <= Math.ceil(w); x++) {
            if (Math.abs(x) > w) continue;
            let L = 0.52 - (x / w) * 0.5 + (1 - k) * 0.18 - (rnd() < 0.18 ? 0.18 : 0);   // aguja moteada
            let idx = Math.round(L * (n - 1)); idx = idx < 0 ? 0 : idx > n - 1 ? n - 1 : idx;
            px(cx + x, y, 1, 1, rmp[idx]);
          }
          if (C.snow && y < ty + 3) for (let x = -Math.ceil(w); x <= w; x++) if (rnd() < 0.55) px(cx + x, y, 1, 1, '#eef4f6');
        }
      }
    };
  }
  function paintWillow(season, v) {
    return (px, W, H) => {
      const rnd = mulberry(v * 71 + 5), F = willowP(season), cx = W >> 1, baseY = H - 2;
      trunk(px, cx, baseY, Math.round(H * 0.4), 6, season, rnd);
      const y0 = Math.round(H * 0.30), y1 = baseY - 8, half = Math.round(W * 0.42);
      if (!F.bare) crown(px, cx, Math.round(H * 0.26), Math.round(W * 0.34), F.bases, rnd);
      const tp = trunkPal(season);
      for (let sx = -half; sx <= half; sx += 2) {
        if (rnd() < 0.18) continue;
        const len = (y1 - y0) * (0.45 + rnd() * 0.55); let x = cx + sx + Math.sign(sx) * 2;
        for (let y = y0; y < y0 + len; y++) {
          x += (rnd() - 0.5) * 0.8 + sx * 0.004;
          if (F.bare) { px(x, y, 1, 1, tp[2]); continue; }
          const base = F.bases[(rnd() * F.bases.length) | 0];
          px(x, y, 1, 1, base); if (rnd() < 0.3) px(x, y, 1, 1, rnd() < 0.5 ? light(base, 0.28) : dark(base, 0.3));
        }
      }
    };
  }
  function paintBamboo(season, v) {
    return (px, W, H) => {
      const rnd = mulberry(v * 53 + 9), snow = season === 'invierno';
      const cane = season === 'otono' ? ['#9aa83c', '#b6c054', '#7e8a2c'] : ['#5a8a3a', '#74a84e', '#436e2a'];
      const leafBases = season === 'otono' ? ['#9aa83c', '#c0c45a', '#7e8a2c'] : ['#3f7a2e', '#5aa03c', '#356a26'];
      const baseY = H - 2;
      [[0.28, 0.62], [0.48, 0.74], [0.70, 0.6], [0.40, 0.5], [0.62, 0.44], [0.55, 0.82]].forEach(([fx, fh]) => {
        const x = Math.round(W * fx), top = baseY - Math.round(H * fh);
        for (let y = top; y < baseY; y++) { px(x, y, 3, 1, cane[0]); px(x, y, 1, 1, cane[1]); px(x + 2, y, 1, 1, cane[2]); if ((baseY - y) % 8 === 0) { px(x, y, 3, 1, cane[2]); px(x, y - 1, 3, 1, light(cane[1], 0.2)); } }
        for (let k = 0; k < 7; k++) { const ly = top + k * 3, dir = (k % 2 ? 1 : -1); for (let j = 0; j < 6; j++) px(x + 1 + dir * (1 + j), ly - j - (j >> 1), 1, 1, leafBases[(rnd() * leafBases.length) | 0]); }
        if (snow) { px(x, top, 3, 1, '#eef4f6'); }
      });
    };
  }

  // ── Otros props ─────────────────────────────────────────────────────────
  function paintBush(season, v) {
    return (px, W, H) => {
      const rnd = mulberry(v * 41 + 2), F = decid(season), cx = W >> 1, by = H - 3;
      if (F.bare) { for (let i = 0; i < 70; i++) { const a = rnd() * 6.28, r = rnd() * 14; px(cx + Math.cos(a) * r, by - 7 + Math.sin(a) * r * 0.55, 1, 1, rnd() < 0.4 ? '#cfd8da' : '#6b6f5a'); } return; }
      const R = Math.round(W * 0.34);
      clump(px, cx, by - R * 0.7, R, R * 0.78, ramp(F.bases[0]), rnd, -0.08);
      clump(px, cx - R * 0.7, by - R * 0.4, R * 0.66, R * 0.6, ramp(F.bases[1] || F.bases[0]), rnd, -0.04);
      clump(px, cx + R * 0.7, by - R * 0.45, R * 0.66, R * 0.6, ramp(F.bases[2] || F.bases[0]), rnd, 0.02);
      for (let i = 0; i < R * 3; i++) { const a = rnd() * 6.28, r = rnd() * R, b = F.bases[(rnd() * F.bases.length) | 0]; px(cx + Math.cos(a) * r, by - R * 0.6 + Math.sin(a) * r * 0.7, 1, 1, rnd() < 0.5 ? light(b, 0.32) : dark(b, 0.3)); }
      if (season === 'primavera') for (let i = 0; i < 9; i++) px(cx - R + rnd() * R * 2, by - R + rnd() * R, 1, 1, '#f1c0d6');
      if (season === 'otono') for (let i = 0; i < 7; i++) px(cx - R + rnd() * R * 2, by - R + rnd() * R, 1, 1, '#d98a2c');
    };
  }
  function paintRock(season, v) {
    return (px, W, H) => {
      const rnd = mulberry(v * 29 + 1), cx = W >> 1, by = H - 3;
      const grey = season === 'invierno' ? '#9aa0a2' : '#8b8378';
      clump(px, cx, by - 8, W * 0.36, 9, ramp(grey), rnd, -0.05);
      clump(px, cx + 6, by - 5, W * 0.2, 6, ramp(dark(grey, 0.08)), rnd, -0.1);
      px(cx - 3, by - 12, 1, 9, dark(grey, 0.4)); px(cx - 4, by - 7, 4, 1, dark(grey, 0.4)); px(cx + 4, by - 9, 1, 6, dark(grey, 0.35));
      if (season === 'invierno') { for (let x = -W * 0.34; x <= W * 0.34; x++) if (rnd() < 0.55) px(cx + x, by - 15 + Math.abs(x) * 0.22, 1, 1, '#eef4f6'); }
      else for (let i = 0; i < 14; i++) px(cx - W * 0.3 + rnd() * W * 0.6, by - 13 + rnd() * 5, 1, 1, mix('#5c6b3a', grey, 0.35));
    };
  }
  function paintReeds(season, v) {
    return (px, W, H) => {
      const rnd = mulberry(v * 23 + 4), by = H - 2;
      const stalk = season === 'invierno' ? '#9aa090' : season === 'otono' ? '#b0a84e' : '#6a9a4a';
      const tip = season === 'invierno' ? '#7a6f58' : '#8a5a2c';
      for (let i = 0; i < 8; i++) {
        const x = 3 + i * 3 + (rnd() * 2 | 0), h = 16 + rnd() * 18, top = by - h;
        for (let y = top; y < by; y++) { const sway = Math.sin((by - y) * 0.28 + i) * 1.4; px(x + sway, y, 1, 1, stalk); px(x + sway - 1, y, 1, 1, dark(stalk, 0.2)); }
        px(x - 1, top, 2, 5, tip); px(x - 1, top, 1, 2, light(tip, 0.2));
      }
    };
  }
  function paintFlowers(season, v) {
    return (px, W, H) => {
      const rnd = mulberry(v * 17 + 6), by = H - 2;
      const cols = season === 'primavera' ? ['#f0b4cf', '#f6d35a', '#e6e0ec', '#c98ad8']
        : season === 'verano' ? ['#f6d35a', '#e87a5a', '#e6e0ec']
        : season === 'otono' ? ['#d98a2c', '#c4632a'] : ['#dfe8ea'];
      for (let i = 0; i < 10; i++) {
        const x = 3 + rnd() * (W - 6), y = by - 1 - rnd() * 9, c = cols[(rnd() * cols.length) | 0];
        px(x, y + 1, 1, Math.min(4, by - y), '#3f6a2c');                 // tallo
        px(x, y - 1, 1, 1, c); px(x - 1, y, 1, 1, c); px(x + 1, y, 1, 1, c); px(x, y + 1, 1, 1, c);   // pétalos
        px(x, y, 1, 1, '#f6e08a');                                       // corazón
      }
    };
  }

  // ── Caché y API ─────────────────────────────────────────────────────────
  const cache = new Map();
  const build = (key, W, H, painter, noOut) => { let cv = cache.get(key); if (!cv) { cv = makeSprite(W, H, painter, noOut); cache.set(key, cv); } return cv; };
  const norm = (s) => String(s || 'verano').toLowerCase().replace('ñ', 'n');
  const vIdx = (v) => ((((v | 0) % 4) + 4) % 4) + 1;
  const TREE = { broadleaf: [74, 96, paintBroadleaf], conifer: [62, 106, paintConifer], blossom: [74, 92, paintBlossom], willow: [78, 94, paintWillow], bamboo: [58, 90, paintBamboo] };

  function tree(species, season, v) { season = norm(season); const def = TREE[species] || TREE.broadleaf; const iv = vIdx(v); return build('t|' + species + '|' + season + '|' + iv, def[0], def[1], def[2](season, iv)); }
  function bush(season, v) { season = norm(season); const iv = vIdx(v); return build('b|' + season + '|' + iv, 46, 40, paintBush(season, iv)); }
  function rock(season, v) { season = norm(season); const iv = vIdx(v); return build('r|' + season + '|' + iv, 40, 30, paintRock(season, iv)); }
  function reeds(season, v) { season = norm(season); const iv = vIdx(v); return build('e|' + season + '|' + iv, 30, 40, paintReeds(season, iv), true); }
  function flowers(season, v) { season = norm(season); const iv = vIdx(v); return build('f|' + season + '|' + iv, 28, 18, paintFlowers(season, iv), true); }

  return { tree, bush, rock, reeds, flowers, SPECIES: ['broadleaf', 'conifer', 'blossom', 'willow', 'bamboo'] };
})();
if (typeof window !== 'undefined') window.HacFlora = HacFlora;
