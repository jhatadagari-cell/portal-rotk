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
  const SPRITE_VER = '21';  // súbelo al regenerar los PNG (cache-busting)

  // ── Color helpers (para el placeholder) ─────────────────────────────────
  const { hexToRgb, clamp255: cl } = HacUtil;
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
      1: { h: 12, wt: 0.26, base: mix('#bcae90', casa, .04), cap: false,   cren: false, towers: false, tex: 'rammed', gate: false },
      2: { h: 18, wt: 0.32, base: mix('#d2cab6', casa, .04), cap: 'stone', cren: false, towers: false, tex: 'block',  gate: false },
      3: { h: 24, wt: 0.36, base: mix('#dfd8c6', casa, .04), cap: 'tile',  cren: true,  towers: false, tex: 'block',  gate: true },
      4: { h: 31, wt: 0.42, base: mix('#e8e1d0', casa, .04), cap: 'tile',  cren: true,  towers: true,  tex: 'block',  gate: true }
    };
    const wallLvl = ({ 1: 1, 2: 2, 3: 3, 4: 4, 5: 4, 6: 4 })[tier] || 1;
    const WD = WALLS[wallLvl];
    const wt = WD.wt, frontH = Math.max(9, Math.round(WD.h * 0.52));
    const M = 1;                       // paseo de ronda: anillo de pavimento entre edificios y muros
    const e = M + 0.5 + wt;            // alcance exterior (cara externa del muro) en celdas
    const TERR = 3.4;                  // anchura del TERRITORIO exterior (campo) en celdas
    const eo = e + TERR;              // alcance total del lienzo (finca + territorio)
    // Holgura para que las COPAS de los árboles del territorio (altas y anchas)
    // no se recorten en el borde trasero (cielo) ni en los laterales.
    const SKY = 64, SIDEPAD = 26;

    const W = Math.round(((GW - 1) + (GH - 1) + 4 * eo) * TILE_W / 2) + 2 * (PAD_X + SIDEPAD);
    const originX = PAD_X + SIDEPAD + ((GH - 1) + 2 * eo) * TILE_W / 2 + TILE_W / 2, originY = TOP_MARGIN + SKY;
    const H = originY + Math.round(((GW - 1) + (GH - 1) + 2 * eo) * TILE_H / 2) + TILE_H + 30;
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

    // ── Suelo: grandes losas de piedra clara talladas (estilo palacio) ──────
    // No es un ajedrez de celdas: el solar se embaldosa con LOSAS GRANDES (2×2
    // celdas) de caliza pálida, con junta fina recogida y bisel tallado (aristas
    // traseras iluminadas, delanteras en sombra). La variación tonal entre losas
    // es mínima para que el conjunto sea cohesivo y blanco, no manchado.
    const frac = (n) => n - Math.floor(n);
    const hash = (gx, gy) => frac(Math.sin(gx * 127.1 + gy * 311.7) * 43758.5453);
    const stoneBase = mix('#d8d2c3', casa, 0.04);     // caliza blanco hueso, apenas teñida
    const jointCol  = dark(stoneBase, 0.30);          // junta fina entre losas
    const moss      = mix('#5c6b3a', stoneBase, 0.5); // musgo verdoso (parcos)
    const grass     = mix('#3f5a2c', casa, 0.04);
    const edge = (p, q, col) => { g.strokeStyle = col; g.lineWidth = 1; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke(); };
    const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    // Matita de hierba que crece en una junta (briznas verdes).
    const grassTuft = (cx, cy) => {
      g.lineWidth = 1;
      for (let i = -1; i <= 1; i++) {
        g.strokeStyle = i ? dark(grass, .12) : light(grass, .12);
        g.beginPath(); g.moveTo(cx + i * 1.7, cy + 1.5); g.lineTo(cx + i * 2.3, cy - 3); g.stroke();
      }
    };
    const loX = -M, hiX = GW - 1 + M, loY = -M, hiY = GH - 1 + M, BS = 2;
    const blk = (v) => v - (((v % BS) + BS) % BS);     // alinea costuras a rejilla par

    // ── Territorio exterior: campo ESTACIONAL que rodea la finca ────────────
    // Fuera de las murallas se ve algo de campo (hierba, árboles y un río si la
    // finca tiene agua), tematizado por la estación elegida en el panel admin
    // (mapa.estacion). Los árboles que caen DELANTE de la finca se dibujan al
    // final (sobre los muros) para una oclusión correcta; el resto, aquí detrás.
    const SEASONS = {
      primavera: { g1: '#6f9b4a', g2: '#5f8b3e', soil: '#7c5c3a', leaf: '#4f7e2f', leafHi: '#7bb24e', bloom: '#eaa6c6', trunk: '#5a3f28', water: '#4385a6', snow: false, bare: false, petals: true },
      verano:    { g1: '#517d33', g2: '#467029', soil: '#6e5230', leaf: '#3a6526', leafHi: '#5c8f3e', bloom: null,      trunk: '#4a3420', water: '#2f7390', snow: false, bare: false, petals: false },
      otono:     { g1: '#8a7c3a', g2: '#7c6d2e', soil: '#6a4d2c', leaf: '#c26a1f', leafHi: '#e0913a', bloom: '#9c3b18', trunk: '#4a3420', water: '#3a6f7c', snow: false, bare: false, petals: true },
      invierno:  { g1: '#cdd6d7', g2: '#bcc7c9', soil: '#8a8480', leaf: '#8f9a96', leafHi: '#ffffff', bloom: null,      trunk: '#3a2f28', water: '#86aab6', snow: true,  bare: true,  petals: false },
    };
    const seasonKey = (function () { const s = String(opts.estacion || '').toLowerCase().replace('ñ', 'n'); return SEASONS[s] ? s : 'verano'; })();
    const P = SEASONS[seasonKey];
    const hasWater = !!(opts.mapa && Array.isArray(opts.mapa.construcciones) && opts.mapa.construcciones.some(c => c && (c.tipo === 'estanque' || c.tipo === 'lago')));
    const frontTrees = [];   // árboles delante de la finca (se pintan tras los muros)

    // Río que discurre por fuera del borde OESTE, con un leve meandro (ancho 2).
    function isRiver(gx, gy) {
      if (!hasWater) return false;
      const center = loX - 2 + Math.round(Math.sin(gy * 0.6) * 1.2);
      return gx <= center && gx >= center - 1;
    }
    function terrTile(gx, gy, riv) {
      const cx = X(gx, gy), cy = Y(gx, gy);
      const N = [cx, cy - TILE_H / 2], E = [cx + TILE_W / 2, cy], S = [cx, cy + TILE_H / 2], Wp = [cx - TILE_W / 2, cy];
      if (riv) {
        const wc = P.water, hv = hash(gx * 2.1 + 1, gy * 1.7 + 4);
        poly([N, E, S, Wp], hv < 0.5 ? wc : light(wc, 0.08));
        edge(Wp, N, light(wc, 0.22));                                  // reflejo en la orilla
        if (P.snow && hash(gx + 5, gy + 2) > 0.55) poly([N, E, S, Wp], 'rgba(235,245,248,0.30)');   // placas de hielo
        return;
      }
      const hv = hash(gx * 1.3 + 11, gy * 1.3 + 5);
      let col = hv < 0.5 ? P.g1 : P.g2;
      if (!P.snow && hash(gx * 3.1 + 2, gy * 2.3 + 6) > 0.9) col = mix(col, P.soil, 0.5);   // calva de tierra
      poly([N, E, S, Wp], col);
      edge(Wp, S, dark(col, .10)); edge(S, E, dark(col, .07));         // sombrita iso delantera
      if (P.snow) poly([N, E, S, Wp], 'rgba(255,255,255,0.16)');
      else if (hash(gx + 3, gy * 2 + 1) > 0.62) grassTuft(cx, cy + TILE_H * 0.18);
      if (P.petals && hash(gx * 5 + 7, gy * 5 + 3) > 0.72) {            // pétalos / hojas caídas
        g.fillStyle = P.bloom || P.leaf;
        g.fillRect(cx + (hash(gx, gy) - 0.5) * 11, cy + (hash(gy, gx) - 0.5) * 6, 1.6, 1.6);
      }
    }
    const FLORA = (typeof HacFlora !== 'undefined') ? HacFlora : null;
    // Blit de un sprite de prop en espacio de DISPOSITIVO (nítido 1:1) con sombra
    // de contacto elíptica en el suelo.
    function blitProp(cv, lx, ly, shR) {
      g.fillStyle = 'rgba(0,0,0,0.20)'; g.beginPath(); g.ellipse(lx, ly + 1, shR, shR * 0.42, 0, 0, 6.2832); g.fill();
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false;
      g.drawImage(cv, Math.round(lx * SCALE - cv.width / 2), Math.round(ly * SCALE - cv.height + 6));
      g.restore();
    }
    // Fallback (si no está HacFlora): arbolito sencillo de respaldo.
    function drawTreeBlob(lx, ly) {
      const topY = ly - 17;
      g.fillStyle = 'rgba(0,0,0,0.16)'; g.beginPath(); g.ellipse(lx, ly + 1, 7, 3.2, 0, 0, 6.2832); g.fill();
      g.fillStyle = P.trunk; g.fillRect(lx - 1.5, topY + 4, 3, ly - topY - 3);
      const blob = (ox, oy, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(lx + ox, topY + oy, r, 0, 6.2832); g.fill(); };
      if (P.bare) blob(0, -2, 5, '#8f9a96'); else { blob(0, 2, 7, dark(P.leaf, 0.12)); blob(-3, 0, 5, P.leaf); blob(3, -1, 5, P.leaf); blob(0, -3, 5.5, light(P.leaf, 0.05)); }
    }
    // Especifica el prop de una celda (o null): sprite + radio de sombra.
    function propAt(gx, gy, riverNear) {
      const r = hash(gx * 7.3 + 1, gy * 7.7 + 2);
      if (riverNear && r < 0.5) return FLORA ? { cv: FLORA.reeds(seasonKey, (hash(gx + 9, gy + 4) * 9) | 0), sh: 6 } : null;
      if (r < 0.66) return null;                                  // hierba pelada (densidad moderada)
      if (!FLORA) return { blob: true, sh: 9 };
      const pick = hash(gx * 2.7 + 5, gy * 3.1 + 8), vv = (hash(gx * 1.9 + 2, gy * 2.3 + 7) * 99) | 0;
      if (pick < 0.58) { const sp = HacFlora.SPECIES[(hash(gx * 5.1 + 3, gy * 4.7 + 6) * HacFlora.SPECIES.length) | 0]; return { cv: FLORA.tree(sp, seasonKey, vv), sh: 13 }; }
      if (pick < 0.78) return { cv: FLORA.bush(seasonKey, vv), sh: 9 };
      if (pick < 0.90) return { cv: FLORA.rock(seasonKey, vv), sh: 9 };
      return { cv: FLORA.flowers(seasonKey, vv), sh: 5 };
    }
    // Pinta el campo (saltando la huella del suelo de piedra) y reúne los props
    // con su posición «jittered», para colocarlos con orden de profundidad.
    const tLo = Math.floor(-eo), tHX = Math.ceil(GW - 1 + eo), tHY = Math.ceil(GH - 1 + eo);
    const inFloor = (gx, gy) => gx >= loX && gx <= hiX && gy >= loY && gy <= hiY;
    const props = [];
    for (let gy = tLo; gy <= tHY; gy++) for (let gx = tLo; gx <= tHX; gx++) {
      if (inFloor(gx, gy)) continue;
      const riv = isRiver(gx, gy);
      terrTile(gx, gy, riv);
      if (riv) continue;
      // Orla exterior limpia: sin props en el anillo más externo (evita recortes).
      if (gx === tLo || gx === tHX || gy === tLo || gy === tHY) continue;
      const nearWall = gx >= loX - 1 && gx <= hiX + 1 && gy >= loY - 1 && gy <= hiY + 1;
      if (nearWall) continue;
      const riverNear = hasWater && (isRiver(gx - 1, gy) || isRiver(gx + 1, gy) || isRiver(gx, gy - 1) || isRiver(gx, gy + 1));
      const spec = propAt(gx, gy, riverNear);
      if (!spec) continue;
      const jx = (hash(gx + 1, gy + 5) - 0.5) * TILE_W * 0.4, jy = (hash(gx + 7, gy + 2) - 0.5) * TILE_H * 0.4;
      props.push({ gx, gy, sum: gx + gy, lx: X(gx, gy) + jx, ly: Y(gx, gy) + jy, spec });
    }
    const drawProp = (p) => { if (p.spec.cv) blitProp(p.spec.cv, p.lx, p.ly, p.spec.sh); else if (p.spec.blob) drawTreeBlob(p.lx, p.ly); };
    // Delante/detrás de la finca POR BORDE: al sur (gy>hiY) o al este (gx>hiX)
    // van DELANTE (sobre los muros); al norte/oeste, DETRÁS. Dentro de cada grupo,
    // orden isométrico por profundidad (suma de celda).
    props.sort((a, b) => a.sum - b.sum).forEach(p => { if (p.gx > hiX || p.gy > hiY) frontTrees.push(p); else drawProp(p); });
    const drawFrontProps = () => frontTrees.forEach(drawProp);
    for (let by = blk(loY); by <= hiY; by += BS) {
      for (let bx = blk(loX); bx <= hiX; bx += BS) {
        const x0 = Math.max(bx, loX), y0 = Math.max(by, loY);
        const x1 = Math.min(bx + BS - 1, hiX), y1 = Math.min(by + BS - 1, hiY);
        if (x1 < x0 || y1 < y0) continue;
        // rombo de la losa (huella iso del bloque)
        const N = [X(x0, y0), Y(x0, y0) - TILE_H / 2];
        const E = [X(x1, y0) + TILE_W / 2, Y(x1, y0)];
        const Sp = [X(x1, y1), Y(x1, y1) + TILE_H / 2];
        const Wp = [X(x0, y1) - TILE_W / 2, Y(x0, y1)];
        const ctr = [(N[0] + E[0] + Sp[0] + Wp[0]) / 4, (N[1] + E[1] + Sp[1] + Wp[1]) / 4];
        // junta recogida (rombo completo en tono oscuro)
        poly([N, E, Sp, Wp], jointCol);
        // color de la losa: casi uniforme (variación ±3%)
        const hv = hash(bx * 0.7 + 3, by * 0.7 + 7);
        let col; { const t = (hv - 0.5) * 0.06; col = t >= 0 ? light(stoneBase, t) : dark(stoneBase, -t); }
        const onRing = (x0 < 0 || y0 < 0 || x1 >= GW || y1 >= GH);
        const mp = hash(bx * 1.7 + 5, by * 1.7 + 9);
        let mossy = false;
        if (onRing ? mp > 0.66 : mp > 0.88) { mossy = true; col = mix(col, moss, onRing ? 0.4 : 0.28); }
        // losa encogida (deja ver la junta) + bisel tallado
        const s = 0.92;
        const n = lerp2(ctr, N, s), ee = lerp2(ctr, E, s), so = lerp2(ctr, Sp, s), ww = lerp2(ctr, Wp, s);
        poly([n, ee, so, ww], col);
        edge(ww, n, light(col, .17)); edge(n, ee, light(col, .10));   // aristas traseras: luz
        edge(ww, so, dark(col, .13)); edge(so, ee, dark(col, .20));   // aristas delanteras: sombra
        // veta tallada sutil dentro de la losa (determinista)
        if (hv > 0.45) { const a = lerp2(n, ww, 0.3 + hv * 0.25), b = lerp2(ee, so, 0.45); edge(a, b, mix(col, jointCol, 0.35)); }
        // hierba en las juntas con musgo
        if (mossy && hash(bx + 2, by + 8) > 0.5) grassTuft(ctr[0], ctr[1] + TILE_H * 0.3);
      }
    }

    // ── Pabellones: tinte del patio por rol (sobre el suelo, bajo muros) ───
    // La región se recalcula EN VIVO desde la celda-semilla (se adapta a los
    // muros). El NOMBRE se muestra al pasar el ratón (tooltip en la página, vía
    // HacIso.cellAt), no como etiqueta fija, para no recargar la finca.
    const pabList = (B && typeof B.regionPabellon === 'function' && Array.isArray(opts.pabellones)) ? opts.pabellones : [];
    pabList.forEach(p => {
      if (!p || !Array.isArray(p.seed)) return;
      const region = B.regionPabellon(opts.mapa, tier, p.seed[0], p.seed[1]);
      if (!region.length) return;
      const r = B.rolPabellon(p.rol), col = r ? r.color : casa, cc = hexToRgb(col);
      const fill = 'rgba(' + cc[0] + ',' + cc[1] + ',' + cc[2] + ',0.17)';
      region.forEach(([gx, gy]) => {
        const cx = X(gx, gy), cy = Y(gx, gy);
        poly([[cx, cy - TILE_H / 2], [cx + TILE_W / 2, cy], [cx, cy + TILE_H / 2], [cx - TILE_W / 2, cy]], fill);
      });
    });
    // Guarda la proyección para el hit-test celda↔cursor (hover de pabellones).
    canvas._hacProj = { originX, originY, GW, GH };

    // ── Murallas (tras el paseo de ronda) ────────────────────────────────
    const capH = WD.cap === 'tile' ? 4 : 3;
    const wTop = light(WD.base, .14), wL = dark(WD.base, .18), wR = dark(WD.base, .33);
    const capCol = WD.cap === 'tile' ? mix('#933c22', casa, .04) : light(WD.base, .16);
    const capT = light(capCol, .14), capL = dark(capCol, .14), capR = dark(capCol, .30);
    const tileRoof = mix('#933c22', casa, .04), gold = '#d0a84a', dark9 = '#1a120a';
    const wallSegs = [];
    const pennants = [];   // estandartes Han en el color de la casa (con su caja de profundidad)
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
      const jc = dark(WD.base, .26), courses = Math.max(3, Math.round((z1 - z0) / 4.5));
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
      wallSegs.push({ box: [WLo, b, WLi, d], draw: () => {
        box(WLo, b, WLi, d, 0, WD.h, wTop, wL, wR); texFace('E', WLi, b, d, 0, WD.h); cap(WLo, b, WLi, d, WD.h);
        if (WD.cren && even(gy)) merlon('y', WLi, gy - 0.5, WD.h);
      } });
      if (third(gy)) wallSegs.push({ box: [WLi, b, WLi + wt * 0.6, d], draw: () => buttress('E', WLi, gy - 0.5, WD.h) });
    }
    const gateGc = WD.gate ? Math.floor((GW - 1) / 2) : -999;   // eje ceremonial sur↔norte
    // Muro TRASERO-derecho (y), cara al patio (+y). Deja hueco para la North Gate.
    for (let gx = lo; gx <= hiW; gx++) {
      if (WD.gate && Math.abs(gx - gateGc) <= 1) continue;       // hueco del portón norte
      const a = gx - 0.5, c = gx + 0.5;
      wallSegs.push({ box: [a, WTo, c, WTi], draw: () => {
        box(a, WTo, c, WTi, 0, WD.h, wTop, wL, wR); texFace('S', WTi, a, c, 0, WD.h); cap(a, WTo, c, WTi, WD.h);
        if (WD.cren && even(gx)) merlon('x', WTi, gx - 0.5, WD.h);
      } });
      if (third(gx)) wallSegs.push({ box: [a, WTi, c, WTi + wt * 0.6], draw: () => buttress('S', WTi, gx - 0.5, WD.h) });
    }
    // Portón monumental (城門) en un muro horizontal (a lo largo de x). La cara/
    // puerta va en y1 (lado patio): base de sillería con vano y hojas rojas de
    // tachones (門釘) + torre-puerta (城樓). South Gate (delantero) y North Gate
    // (trasero), ambas en el eje central.
    const gate = (gc, y0, y1) => {
      const a = gc - 1.5, c = gc + 1.5, gh = WD.h + 6;
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
    // Muro DELANTERO-izquierdo (x): SOUTH GATE (午門) en el eje (abajo-izquierda).
    for (let gx = lo; gx <= hiW; gx++) {
      if (gx === gateGc) { wallSegs.push({ box: [gx - 1.5, FLi, gx + 1.5, FLo], draw: () => gate(gx, FLi, FLo) }); continue; }
      if (WD.gate && Math.abs(gx - gateGc) <= 1) continue;     // hueco que ocupa el portón (3 celdas)
      const a = gx - 0.5, c = gx + 0.5;
      wallSegs.push({ box: [a, FLi, c, FLo], draw: () => { box(a, FLi, c, FLo, 0, frontH, wTop, wL, wR); texFace('S', FLo, a, c, 0, frontH); cap(a, FLi, c, FLo, frontH); } });
    }
    // Muro DELANTERO-derecho (x), más bajo (sin portón).
    for (let gy = lo; gy <= hiH; gy++) {
      const b = gy - 0.5, d = gy + 0.5;
      wallSegs.push({ box: [FRi, b, FRo, d], draw: () => { box(FRi, b, FRo, d, 0, frontH, wTop, wL, wR); texFace('E', FRo, b, d, 0, frontH); cap(FRi, b, FRo, d, frontH); } });
    }
    // NORTH GATE (神武門) en el muro TRASERO-derecho, en el eje (arriba-derecha).
    if (WD.gate) wallSegs.push({ box: [gateGc - 1.5, WTo, gateGc + 1.5, WTi], draw: () => gate(gateGc, WTo, WTi) });
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
      const cN = -M - 0.5 - wt / 2, cE = GW - 1 + M + 0.5 + wt / 2, cW = GH - 1 + M + 0.5 + wt / 2, tw = 0.64;
      wallSegs.push({ box: [cN - tw, cN - tw, cN + tw, cN + tw], draw: () => tower(cN, cN) });   // esquina N (fondo)
      wallSegs.push({ box: [cE - tw, cN - tw, cE + tw, cN + tw], draw: () => tower(cE, cN) });   // esquina E (der-fondo)
      wallSegs.push({ box: [cN - tw, cW - tw, cN + tw, cW + tw], draw: () => tower(cN, cW) });   // esquina W (izq-frente)
    }
    // Anclas de estandartes (en el color de la casa): astas altas en las esquinas
    // (sobre las torres si las hay) y dos astas monumentales flanqueando la puerta
    // sur. Entran en el orden de profundidad → nunca solapan mal (sin clipping).
    {
      const eN = -M - 0.5 - wt / 2, eE = GW - 1 + M + 0.5 + wt / 2, eW = GH - 1 + M + 0.5 + wt / 2;
      const z0 = WD.towers ? WD.h + 31 : 0, zt = WD.towers ? WD.h + 50 : WD.h + 28;
      [[eN, eN], [eE, eN], [eN, eW]].forEach(([gx, gy], i) => pennants.push({ gx, gy, z0, zt, len: 14, phase: i * 1.3, box: [gx - 0.4, gy - 0.4, gx + 0.4, gy + 0.4] }));
      if (WD.gate) [-2.3, 2.3].forEach((dx, i) => pennants.push({ gx: gateGc + dx, gy: FLi - 0.9, z0: 0, zt: WD.h + 24, len: 14, phase: i * 1.1 + 0.6, box: [gateGc + dx - 0.4, FLi - 1.3, gateGc + dx + 0.4, FLi - 0.5] }));
    }

    // ── Construcciones del jugador ────────────────────────────────────────
    const lista = B ? B.construccionesValidas(opts.mapa, tier)
      : ((opts.mapa && opts.mapa.construcciones) || []);
    const fp = (c) => B ? B.footprintDe(c) : [1, 1];
    const cellsOf = (c) => (B && B.celdasOcupadas) ? B.celdasOcupadas(c) : [[c.pos[0], c.pos[1]]];
    const drawC = (c) => (spritesReady && META) ? sprite(c) : placeholder(c);
    // Capa 'suelo' (jardines, estanques…): PLANA, se pinta sobre el pavimento por
    // DEBAJO de muros y edificios. La declara el catálogo (HacBuild.esSuelo).
    const isFlat = (c) => {
      if (B && typeof B.esSuelo === 'function') return B.esSuelo(c.tipo);
      const d = B && B.tipo(c.tipo); return !!d && (d.altura || 24) <= 8;
    };
    const flatSort = (c) => { const f = fp(c); return (c.pos[0] + f[0] - 1) + (c.pos[1] + f[1] - 1); };
    // Los caminos NO son sprites: se pintan abajo, como enlosado autoconectado.
    lista.filter(c => isFlat(c) && c.tipo !== 'camino').sort((a, b) => flatSort(a) - flatSort(b) || a.pos[0] - b.pos[0]).forEach(drawC);

    // ── Caminos (suelo pavimentado que se autoconecta, trazado inicio→fin) ──
    // Cada celda de camino es una losa-rombo; los bordes que NO lindan con otro
    // camino llevan bordillo (curb) → el sendero se dibuja con sus orillas y se
    // une solo en rectas, esquinas, T y cruces, como las murallas pero plano.
    {
      const cam = lista.filter(c => c.tipo === 'camino');
      if (cam.length) {
        const set = new Set(cam.map(c => c.pos[0] + ',' + c.pos[1]));
        const isCam = (x, y) => set.has(x + ',' + y);
        const pave = mix('#cdc2a6', casa, .05), curb = dark(pave, .34), joint = dark(pave, .16);
        cam.forEach(c => {
          const gx = c.pos[0], gy = c.pos[1], cx = X(gx, gy), cy = Y(gx, gy);
          const N = [cx, cy - TILE_H / 2], E = [cx + TILE_W / 2, cy], S = [cx, cy + TILE_H / 2], Wp = [cx - TILE_W / 2, cy];
          const t = ((gx + gy) & 1) ? -0.025 : 0.025;            // enlosado a damero sutil
          poly([N, E, S, Wp], t >= 0 ? light(pave, t) : dark(pave, -t));
          edge(Wp, E, joint);                                    // junta diagonal tenue
          if (!isCam(gx, gy - 1)) edge(N, E, curb);              // bordillo NE
          if (!isCam(gx + 1, gy)) edge(E, S, curb);              // bordillo SE
          if (!isCam(gx, gy + 1)) edge(S, Wp, curb);             // bordillo SO
          if (!isCam(gx - 1, gy)) edge(Wp, N, curb);             // bordillo NO
        });
      }
    }

    // ── Muros interiores autoconectados (院墙) ─────────────────────────────
    // Se dibujan PROCEDURALMENTE (no por sprite) para que se COMBINEN entre sí
    // (rectas, esquinas, T, cruces y finales) y enganchen con portones, edificios
    // y la muralla exterior. Cada celda mira sus 4 vecinos conectables y traza una
    // barra en X y/o en Y hacia ellos (más un poste central implícito).
    const k2 = (x, y) => x + ',' + y;
    const muroSet = new Set();          // celdas con muralla o portón
    const occSet = new Set();           // celdas ocupadas por edificios
    lista.forEach(c => {
      if (isFlat(c)) return;
      if (c.tipo === 'muralla' || c.tipo === 'porton') muroSet.add(k2(c.pos[0], c.pos[1]));
      else cellsOf(c).forEach(([x, y]) => occSet.add(k2(x, y)));
    });
    const conecta = (x, y) => muroSet.has(k2(x, y)) || occSet.has(k2(x, y));
    const IWT = 0.34, hf = IWT / 2, IBH = 16, ICH = capH;
    // Mismo despiece de piedra clara que la muralla exterior (粉墙) para que
    // combinen; la coronación reutiliza la del tier (teja o piedra).
    const ibT = wTop, ibL = wL, ibR = wR, ibJ = dark(WD.base, .26);
    const icT = capT, icL = capL, icR = capR;
    // Tramo de muro de ladrillo (cuerpo + hiladas de sillería + coronación de teja).
    const wbox = (x0, y0, x1, y1) => {
      box(x0, y0, x1, y1, 0, IBH, ibT, ibL, ibR);
      for (let i = 1; i < 4; i++) { const z = IBH * i / 4; seg(Pg(x1, y0, z), Pg(x1, y1, z), ibJ); seg(Pg(x0, y1, z), Pg(x1, y1, z), ibJ); }
      box(x0 - .1, y0 - .1, x1 + .1, y1 + .1, IBH, IBH + ICH, icT, icL, icR);
    };
    const vecinos = (gx, gy) => {
      const cE = conecta(gx + 1, gy), cW = conecta(gx - 1, gy), cS = conecta(gx, gy + 1), cN = conecta(gx, gy - 1);
      const iso = !cE && !cW && !cS && !cN;
      return { cE, cW, cS, cN, iso, hasX: cE || cW || iso, hasY: cN || cS };
    };
    const iwall = (gx, gy) => {
      const v = vecinos(gx, gy);
      if (v.hasX) wbox((v.cW || v.iso) ? gx - 0.5 : gx - hf, gy - hf, (v.cE || v.iso) ? gx + 0.5 : gx + hf, gy + hf);
      if (v.hasY) wbox(gx - hf, v.cN ? gy - 0.5 : gy - hf, gx + hf, v.cS ? gy + 0.5 : gy + hf);
    };

    // ── Estandarte Han en el color de la casa (牙旗) ────────────────────────
    // Asta con punta de lanza + travesaño, y banderola VERTICAL estrecha que cae
    // con cola de golondrina y leve ondeo (curva congelada). Estilo dinastía Han,
    // no una bandera rectangular genérica. Se dibuja en el orden de profundidad.
    const flav = casa;
    const shF = (t) => t >= 0 ? light(flav, t) : dark(flav, -t);
    const pennant = (p) => {
      const top = Pg(p.gx, p.gy, p.zt), base = Pg(p.gx, p.gy, p.z0), W = 3.2, L = p.len;
      seg(base, top, '#7a5a32'); seg([base[0] + 1, base[1]], [top[0] + 1, top[1]], '#5a4426');     // asta
      poly([[top[0], top[1] - 7], [top[0] - 1.5, top[1] - 2], [top[0] + 1.5, top[1] - 2]], '#d8b048');  // punta de lanza
      poly([[top[0] - W - 1.6, top[1] - 0.4], [top[0] + W + 1.6, top[1] - 0.4], [top[0] + W + 1.6, top[1] + 1.2], [top[0] - W - 1.6, top[1] + 1.2]], '#c2a048');  // travesaño
      const sway = (u) => Math.sin(p.phase + u * 3.2) * 2.4 * (0.25 + u);
      const rows = 10;
      for (let i = 0; i < rows; i++) {
        const u = i / rows, u1 = (i + 1) / rows, cx = top[0] + sway(u), cx1 = top[0] + sway(u1), y = top[1] + 1 + u * L, y1 = top[1] + 1 + u1 * L;
        poly([[cx - W, y], [cx + W, y], [cx1 + W, y1], [cx1 - W, y1]], shF((i % 2 ? -0.05 : 0.05) - u * 0.12));
        seg([cx, y], [cx1, y1], shF(0.18));                          // franja central clara
      }
      const cb = top[0] + sway(1), yb = top[1] + 1 + L;
      poly([[cb - W, yb - 1], [cb - W, yb + 5], [cb, yb + 1.5], [cb + W, yb + 5], [cb + W, yb - 1]], shF(-0.12));   // cola de golondrina
    };

    // ── Orden de pintado: comparador isométrico por caja de huella ─────────
    // Cada objeto lleva su caja [x0,y0,x1,y1]. A se pinta antes (detrás) si está
    // separada hacia el NO de B en algún eje; si se solapan, desempata por la
    // esquina delantera. Resuelve el caso «muro tras un edificio que tiene delante».
    const drawList = wallSegs.slice();
    lista.filter(c => !isFlat(c) && c.tipo !== 'muralla').forEach(c => {
      const f = fp(c), x0 = c.pos[0], y0 = c.pos[1];
      drawList.push({ box: [x0, y0, x0 + f[0], y0 + f[1]], draw: () => drawC(c) });
    });
    lista.filter(c => c.tipo === 'muralla').forEach(c => {
      const gx = c.pos[0], gy = c.pos[1], v = vecinos(gx, gy);
      drawList.push({ box: [gx, gy, gx + 1, gy + 1], draw: () => iwall(gx, gy) });
      // Enganche a la muralla exterior cuando el muro tiene un brazo hacia el borde.
      if (gx === 0 && v.hasX)        drawList.push({ box: [WLi, gy - hf, gx - hf, gy + hf], draw: () => wbox(WLi, gy - hf, gx - hf, gy + hf) });
      if (gx === GW - 1 && v.hasX)   drawList.push({ box: [gx + hf, gy - hf, FRi, gy + hf], draw: () => wbox(gx + hf, gy - hf, FRi, gy + hf) });
      if (gy === 0 && v.hasY)        drawList.push({ box: [gx - hf, WTi, gx + hf, gy - hf], draw: () => wbox(gx - hf, WTi, gx + hf, gy - hf) });
      if (gy === GH - 1 && v.hasY)   drawList.push({ box: [gx - hf, gy + hf, gx + hf, FLi], draw: () => wbox(gx - hf, gy + hf, gx + hf, FLi) });
    });
    pennants.forEach(p => drawList.push({ box: p.box, draw: () => pennant(p) }));
    const before = (A, Z) => {
      if (A[2] <= Z[0] + 1e-6) return true;     // A al oeste de Z → detrás
      if (Z[2] <= A[0] + 1e-6) return false;
      if (A[3] <= Z[1] + 1e-6) return true;     // A al norte de Z → detrás
      if (Z[3] <= A[1] + 1e-6) return false;
      return (A[2] + A[3]) < (Z[2] + Z[3]);     // solapan: por esquina delantera
    };
    drawList.sort((p, q) => before(p.box, q.box) ? -1 : (before(q.box, p.box) ? 1 : 0));
    drawList.forEach(d => d.draw());

    // Props del territorio que quedan DELANTE de la finca: sobre los muros.
    drawFrontProps();

    // ── Grano sutil: rompe el monocromo del suelo y las murallas (textura) ──
    // Ruido de luminancia determinista por píxel; los sprites (ya texturizados)
    // reciben un grano leve que unifica el conjunto.
    try {
      g.setTransform(1, 0, 0, 1, 0, 0);
      // Tabla de ruido 64×64 (evita un sin() por píxel → rápido en fincas grandes).
      const NT = new Int8Array(4096);
      for (let k = 0; k < 4096; k++) { const s = Math.sin((k & 63) * 12.9898 + (k >> 6) * 78.233) * 43758.5453; NT[k] = Math.round(((s - Math.floor(s)) - 0.5) * 6); }
      const id = g.getImageData(0, 0, canvas.width, canvas.height), d = id.data, CW = canvas.width, CH = canvas.height;
      for (let y = 0; y < CH; y++) { const row = (y & 63) << 6; for (let x = 0; x < CW; x++) {
        const i = (y * CW + x) * 4; if (d[i + 3] < 16) continue;
        const j = NT[row | (x & 63)];
        d[i] += j; d[i + 1] += j; d[i + 2] += j;                  // (clamp implícito Uint8ClampedArray)
      } }
      g.putImageData(id, 0, 0);
    } catch (e) { /* getImageData podría fallar por CORS; en ese caso, sin grano */ }

    // ── Escena cacheada para la capa de animación (mecenas paseando) ───────
    // Guarda el FONDO ya pintado + la lista de estructuras (con su orden de
    // profundidad) para que HacFolk recomponga por frame: pinta el fondo y
    // reinserta a los caminantes en el orden correcto, de modo que los muros y
    // edificios que tienen DELANTE los ocultan (oclusión real, no overlay plano).
    try {
      let bg = canvas._hacBgCanvas;
      if (!bg) { bg = document.createElement('canvas'); canvas._hacBgCanvas = bg; }
      bg.width = canvas.width; bg.height = canvas.height;
      bg.getContext('2d').drawImage(canvas, 0, 0);
      canvas._hacScene = { bg, drawList, before, X, Y, SCALE };
    } catch (e) { canvas._hacScene = null; }
    g.setTransform(1, 0, 0, 1, 0, 0);

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

  // Hit-test: punto de pantalla (clientX/Y) → celda [gx,gy] del tablero, o null.
  // Usa la proyección guardada en draw() e invierte la rejilla isométrica.
  // Soporta el pan/zoom (getBoundingClientRect refleja el transform CSS).
  function cellAt(canvas, clientX, clientY) {
    const pr = canvas && canvas._hacProj; if (!pr) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const lx = (clientX - rect.left) / rect.width * canvas.width / SCALE;   // px lógicos
    const ly = (clientY - rect.top) / rect.height * canvas.height / SCALE;
    const a = (lx - pr.originX) / (TILE_W / 2);   // gx - gy
    const b = (ly - pr.originY) / (TILE_H / 2);   // gx + gy
    const gx = Math.round((a + b) / 2), gy = Math.round((b - a) / 2);
    if (gx < 0 || gy < 0 || gx >= pr.GW || gy >= pr.GH) return null;
    return [gx, gy];
  }

  // ── Frame de animación: repinta el fondo cacheado y reinserta a los ACTORES
  // (mecenas) en el orden de profundidad, recomponiendo SOLO las estructuras que
  // tienen delante (las que solapan su caja ampliada) → oclusión correcta sin
  // redibujar toda la finca. actors = [{ fx, fy, draw(g, lx, ly, SCALE) }].
  function frame(canvas, actors, overlays) {
    const sc = canvas && canvas._hacScene;
    if (!sc || !sc.bg) return;
    const g = canvas.getContext('2d'); if (!g) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(sc.bg, 0, 0);
    g.setTransform(sc.SCALE, 0, 0, sc.SCALE, 0, 0);
    // Caja real (celda) para ORDENAR; caja ampliada hacia delante (+x/+y) para
    // FILTRAR qué estructuras altas pueden taparlo (un muro alto en la celda de
    // delante no solapa la celda del actor, pero sí lo cubre en pantalla).
    const acts = (actors || []).map(a => {
      const cx = Math.round(a.fx), cy = Math.round(a.fy);
      return {
        box: [cx, cy, cx + 1, cy + 1],
        fbox: [cx - 0.6, cy - 0.6, cx + 3.5, cy + 3.5],
        draw: () => a.draw(g, sc.X(a.fx, a.fy), sc.Y(a.fx, a.fy), sc.SCALE)
      };
    });
    const ov = (A, B) => !(A[2] <= B[0] || B[2] <= A[0] || A[3] <= B[1] || B[3] <= A[1]);
    // occ conserva el ORDEN GLOBAL de drawList (filter preserva el orden), que es
    // EXACTAMENTE el del fondo cacheado. NO se re-ordena: hacerlo sobre un
    // subconjunto distinto cada frame reordenaba los muros adyacentes (su caja
    // empata bajo `before`, que no es orden total) → parpadeo/solape en las
    // murallas y patios. En su lugar, insertamos a cada actor en su hueco de
    // profundidad SIN tocar el orden de las estructuras.
    const occ = acts.length ? sc.drawList.filter(d => acts.some(a => ov(d.box, a.fbox))) : [];
    const render = occ.slice();
    acts.sort((p, q) => sc.before(p.box, q.box) ? -1 : (sc.before(q.box, p.box) ? 1 : 0));
    acts.forEach(a => {
      let idx = render.length;
      for (let i = 0; i < render.length; i++) { if (sc.before(a.box, render[i].box)) { idx = i; break; } }
      render.splice(idx, 0, a);
    });
    render.forEach(d => d.draw());
    // Capa SIEMPRE encima (banners de edificio + mecenas seleccionado): se pinta
    // sin oclusión, en coords lógicas. draw(g, sc) → puede usar sc.X/sc.Y.
    if (overlays) overlays.forEach(o => o && o.draw && o.draw(g, sc));
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  return { draw, frame, cellAt, TILE_W, TILE_H, SCALE };
})();

if (typeof window !== 'undefined') window.HacIso = HacIso;
if (typeof module !== 'undefined' && module.exports) module.exports = HacIso;
