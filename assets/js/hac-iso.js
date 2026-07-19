/* ═══════════════════════════════════════════════════════════════════════
   hac-iso.js — Render ISOMÉTRICO del tablero de una hacienda.
   ─────────────────────────────────────────────────────────────────────────
   Dibuja la rejilla (NxN según el nivel) y los edificios colocados (campo
   `mapa`, ver hac-build.js). Usa SPRITES isométricos fijos (assets/img/iso/*.png,
   generados por tools/gen-iso-sprites.js, con anclajes en window.ISO_SPRITES_META).
   Mientras las imágenes cargan —o si faltan— cae a un placeholder de prismas.

   La capa de LAYOUT (geometría iso + orden de pintado) es la misma para sprite
   y placeholder; solo cambia cómo se pinta cada edificio.

   API:  HacIso.draw(canvas, { mapa, tier, color, estacion, tema })
         `tema` (opcional, p.ej. 'wei') carga arte a mano por hacienda desde
         assets/img/iso/<tema>/ con anclajes en window.ISO_SPRITES_THEMES.
   Estático (sin bucles de animación; precarga de imágenes una sola vez).
   ═══════════════════════════════════════════════════════════════════════ */
const HacIso = (function () {
  'use strict';

  const TILE_W = 36, TILE_H = 18;     // rombo isométrico 2:1 (LÓGICO)
  const SCALE = 2;                    // densidad de píxeles del lienzo (debe igualar S del generador)
  const TOP_MARGIN = 132;             // hueco arriba para edificios altos, murallas y torres
  const PAD_X = 40;                   // margen lateral para murallas y paseo de ronda
  const SPRITE_BASE = 'assets/img/iso/';
  const SPRITE_VER = '59';  // súbelo al regenerar los PNG (cache-busting)

  // ── Color helpers (para el placeholder) ─────────────────────────────────
  const { hexToRgb, clamp255: cl } = HacUtil;
  const toHex = (r, g, b) => '#' + [r, g, b].map(v => cl(v).toString(16).padStart(2, '0')).join('');
  function mix(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }
  const light = (c, t) => mix(c, '#ffffff', t);
  const dark  = (c, t) => mix(c, '#000000', t);
  const safeColor = (c) => /^#?[0-9a-fA-F]{3,6}$/.test(String(c || '')) ? c : '#c9a84c';

  // ── Precarga de sprites ─────────────────────────────────────────────────
  const META = (typeof window !== 'undefined' && window.ISO_SPRITES_META) || null;
  // Overlays de TEMA por hacienda (arte a mano por reino). Cada tema aporta su
  // propia meta (anclaje/tamaño) para las claves que redefine; el resto cae al set
  // por defecto (gris). Ver assets/js/iso-sprites-wei.js.
  const THEMES = (typeof window !== 'undefined' && window.ISO_SPRITES_THEMES) || {};
  const SPRITES = {};          // storageKey → Image  (base: 'bld-x-0'; tema: 'wei/bld-x-0')
  const themeReady = {};       // tema → bool (todas sus imágenes resueltas)
  const themeStarted = {};     // tema → bool (precarga lanzada)
  let _NT = null;
  function noiseT() {
    if (!_NT) { _NT = new Int8Array(4096); for (let k = 0; k < 4096; k++) { const s = Math.sin((k & 63) * 12.9898 + (k >> 6) * 78.233) * 43758.5453; _NT[k] = Math.round(((s - Math.floor(s)) - 0.5) * 6); } }
    return _NT;
  }
  function applyNoise(g, x0, y0, w, h, W2, H2) {
    x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0);
    w = Math.min(W2 - x0, w | 0); h = Math.min(H2 - y0, h | 0);
    if (w <= 0 || h <= 0) return;
    const NT = noiseT(), id = g.getImageData(x0, y0, w, h), d = id.data;
    for (let y = 0; y < h; y++) { const row = ((y0 + y) & 63) << 6; for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4; if (d[i + 3] < 16) continue;
      const j = NT[row | ((x0 + x) & 63)]; d[i] += j; d[i + 1] += j; d[i + 2] += j;
    } }
    g.putImageData(id, x0, y0);
  }
  let spritesReady = false, preloadStarted = false;
  const pending = new Map();   // canvas → opts (para re-render al cargar)
  // Tiles de SUELO a mano (assets/img/iso/floor/*.png, rombos 144×72 con esquinas
  // transparentes). De momento solo `grass`/`soil*` (exterior) y solo en verano.
  const FLOOR = {};
  // Props/plantas a mano (assets/img/iso/props/*.png), a ~2× device: matas, rocas,
  // helechos y flores que se plantan por el campo exterior mezclados con la flora.
  const PLANTS = {};
  // Árboles a mano (props/tree-*.png). En verano SUSTITUYEN a los procedurales.
  const TREES = {};
  let floorStarted = false, floorReady = false;

  // Normaliza el tema pedido: '' si no existe overlay para él (→ set por defecto).
  const normTheme = (t) => { t = String(t || '').toLowerCase(); return (t && THEMES[t]) ? t : ''; };

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
      // Extensión por sprite: los hechos a mano grandes van en .webp (marcados con
      // `webp:true` en el meta); los generados por gen-iso-sprites siguen en .png.
      const ext = (META[k] && META[k].webp) ? '.webp' : '.png';
      img.src = SPRITE_BASE + k + ext + '?v=' + SPRITE_VER;
    });
  }
  // Precarga del arte a mano de un TEMA (assets/img/iso/<tema>/). Solo las claves
  // que el tema redefine; se guardan como 'tema/clave'. Las que falten (aún sin
  // dibujar) simplemente no entran → el render cae al set por defecto (gris).
  function preloadTheme(t) {
    const tema = normTheme(t);
    if (!tema || themeStarted[tema] || typeof Image === 'undefined') return;
    themeStarted[tema] = true;
    const tmeta = THEMES[tema], keys = Object.keys(tmeta);
    let left = keys.length;
    if (!left) { themeReady[tema] = true; return; }
    keys.forEach(k => {
      const img = new Image();
      const done = () => { if (--left === 0) { themeReady[tema] = true; flush(); } };
      img.onload = () => { SPRITES[tema + '/' + k] = img; done(); };
      img.onerror = done;
      const ext = (tmeta[k] && tmeta[k].webp) ? '.webp' : '.png';
      img.src = SPRITE_BASE + tema + '/' + k + ext + '?v=' + SPRITE_VER;
    });
  }
  // Precarga de los tiles de suelo a mano (floor/). Si falta alguno (404) no pasa
  // nada: floorReady se marca igual y el render cae al suelo procedural.
  function preloadFloor() {
    if (floorStarted || typeof Image === 'undefined') return;
    floorStarted = true;
    const tiles = ['grass', 'soil', 'soil2', 'soil3', 'soil4'];
    const plants = ['bush', 'bushrock', 'rock', 'fern', 'flowers', 'fern2'];
    const trees = ['pine', 'willow', 'oak', 'fruit'];
    let left = tiles.length + plants.length + trees.length;
    const done = () => { if (--left === 0) { floorReady = true; flush(); } };
    tiles.forEach(name => {
      const img = new Image();
      img.onload = () => { FLOOR[name] = img; done(); };
      img.onerror = done;
      img.src = SPRITE_BASE + 'floor/' + name + '.png?v=' + SPRITE_VER;
    });
    plants.forEach(name => {
      const img = new Image();
      img.onload = () => { PLANTS[name] = img; done(); };
      img.onerror = done;
      img.src = SPRITE_BASE + 'props/plant-' + name + '.png?v=' + SPRITE_VER;
    });
    trees.forEach(name => {
      const img = new Image();
      img.onload = () => { TREES[name] = img; done(); };
      img.onerror = done;
      img.src = SPRITE_BASE + 'props/tree-' + name + '.png?v=' + SPRITE_VER;
    });
  }
  // ¿Está todo lo que ESTE lienzo necesita (base + su tema) ya cargado?
  function readyFor(opts) {
    const tema = normTheme(opts && opts.tema);
    return spritesReady && floorReady && (!tema || themeReady[tema]);
  }
  function flush() {
    Array.from(pending.entries()).forEach(([canvas, opts]) => {
      render(canvas, opts);
      if (readyFor(opts)) pending.delete(canvas);   // sigue pendiente si aún falta su tema
    });
  }

  // ── Punto de entrada ────────────────────────────────────────────────────
  function draw(canvas, opts) {
    if (!canvas) return;
    opts = opts || {};
    preload();
    preloadTheme(opts.tema);
    preloadFloor();
    render(canvas, opts);
    // Si los sprites (base o del tema) aún no están, re-renderizamos al cargar.
    if (META && !readyFor(opts)) pending.set(canvas, opts);
  }

  // ── Render ──────────────────────────────────────────────────────────────
  function render(canvas, opts) {
    const B = (typeof HacBuild !== 'undefined') ? HacBuild : null;
    const tier = Math.max(1, Math.min(B ? B.MAX_TIER : 3, Number(opts.tier) || 1));
    const dims = B ? B.gridDims(tier) : [2 + tier, 2 + tier];
    const GW = dims[0], GH = dims[1];
    const casa = safeColor(opts.color);

    // Resolución de sprites por TEMA (arte a mano por hacienda): una clave que el
    // tema redefine usa SU meta (anclaje/tamaño) e imagen de 'tema/clave'; el resto
    // cae al set por defecto (gris). metaOf/imgOf se usan en todo el render.
    const tema = normTheme(opts.tema);
    const TMETA = tema ? THEMES[tema] : null;
    const metaOf = (k) => (k && TMETA && TMETA[k]) || (k && META ? META[k] : null) || null;
    const imgOf  = (k) => SPRITES[(k && TMETA && TMETA[k]) ? (tema + '/' + k) : k];

    // Murallas: datos del nivel (necesarios para dimensionar el lienzo).
    const WALLS = {
      1: { h: 12, wt: 0.26, base: mix('#bcae90', casa, .04), cap: false,   cren: false, towers: false, tex: 'rammed', gate: true },
      2: { h: 18, wt: 0.32, base: mix('#c2b491', casa, .04), cap: 'stone', cren: false, towers: false, tex: 'block',  gate: true },
      3: { h: 24, wt: 0.36, base: mix('#c7ba93', casa, .04), cap: 'tile',  cren: true,  towers: false, tex: 'block',  gate: true },
      4: { h: 31, wt: 0.42, base: mix('#cdc098', casa, .04), cap: 'tile',  cren: true,  towers: true,  tex: 'block',  gate: true }
    };
    const wallLvl = ({ 1: 1, 2: 2, 3: 3, 4: 4, 5: 4, 6: 4 })[tier] || 1;
    const WD = WALLS[wallLvl];
    const wt = WD.wt, frontH = Math.max(9, Math.round(WD.h * 0.52));
    const M = 1;                       // paseo de ronda: anillo de pavimento entre edificios y muros
    const e = M + 0.5 + wt;            // alcance exterior (cara externa del muro) en celdas
    const TERR = 3.4;                  // anchura del TERRITORIO exterior (campo) en celdas
    // ── Edificios EXTERIORES (anillo perimetral, fuera de los muros) ────────
    // El lienzo se extiende SOLO hacia donde hay edificios exteriores (crecimiento
    // DIRECCIONAL, no simétrico) y abarca su SPRITE ENTERO —que sobresale mucho de
    // la huella (tiendas, astas)— para que no se recorte. extCells = sus celdas
    // (±1) → no plantar árboles encima.
    const eoBase = e + TERR;                 // orla salvaje simétrica alrededor de la finca
    let gxLo = -eoBase, gxHi = (GW - 1) + eoBase, gyLo = -eoBase, gyHi = (GH - 1) + eoBase;
    const extCells = new Set(), extSprites = [];
    if (B && opts.mapa && Array.isArray(opts.mapa.construcciones)) {
      const eT = Number(opts.mapa.exteriorTier) || 0;
      opts.mapa.construcciones.forEach(c => {
        const t = B.tipo(c.tipo);
        if (!t || !t.exterior || !B.enExterior(c, tier, eT)) return;
        B.celdasOcupadas(c).forEach(([x, y]) => {
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) extCells.add((x + dx) + ',' + (y + dy));
          gxLo = Math.min(gxLo, x - 1.5); gxHi = Math.max(gxHi, x + 1.5);   // orla de campo en torno a la huella
          gyLo = Math.min(gyLo, y - 1.5); gyHi = Math.max(gyHi, y + 1.5);
        });
        const m = metaOf(spriteKey(c));
        if (m) extSprites.push({ c, m });
      });
    }
    // Holgura para que las COPAS de los árboles del territorio (altas y anchas)
    // no se recorten en el borde trasero (cielo) ni en los laterales.
    const SKY = 64, SIDEPAD = 26;

    // AABB de pantalla en coords PRE-ORIGEN (X0=(gx−gy)·TW/2, Y0=(gx+gy)·TH/2):
    // las 4 esquinas del rombo de terreno + el rect de cada sprite exterior.
    const X0 = (gx, gy) => (gx - gy) * TILE_W / 2, Y0 = (gx, gy) => (gx + gy) * TILE_H / 2;
    let minX0 = X0(gxLo, gyHi), maxX0 = X0(gxHi, gyLo);     // esquinas O / E del rombo
    let minY0 = Y0(gxLo, gyLo), maxY0 = Y0(gxHi, gyHi);     // esquinas N / S del rombo
    extSprites.forEach(({ c, m }) => {
      const sx = X0(c.pos[0], c.pos[1]), sy = Y0(c.pos[0], c.pos[1]);
      minX0 = Math.min(minX0, sx - m.ox / SCALE); maxX0 = Math.max(maxX0, sx + (m.w - m.ox) / SCALE);
      minY0 = Math.min(minY0, sy - m.oy / SCALE); maxY0 = Math.max(maxY0, sy + (m.h - m.oy) / SCALE);
    });
    const W = Math.round(maxX0 - minX0) + 2 * (PAD_X + SIDEPAD);
    const originX = Math.round(PAD_X + SIDEPAD - minX0);
    const originY = Math.round(TOP_MARGIN + SKY - minY0);
    const H = originY + Math.round(maxY0) + TILE_H + 30;
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

    // ── Suelo: patio embaldosado con LADRILLO GRIS (青砖), estilo Han ───────
    // Losas grandes (2×2 celdas) de ladrillo gris cocido —no mármol blanco, que
    // sería palaciego tardío—, con junta fina y bisel tallado. Variación tonal
    // mínima para un conjunto cohesivo.
    const frac = (n) => n - Math.floor(n);
    const hash = (gx, gy) => frac(Math.sin(gx * 127.1 + gy * 311.7) * 43758.5453);
    const stoneBase = mix('#9e9b90', casa, 0.04);     // ladrillo gris cocido (青砖), apenas teñido
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
    // BS = tamaño de la losa en celdas. 1 = una baldosa por CELDA, así el pavimento
    // coincide con la rejilla de colocación (el camino y los edificios caen en las
    // juntas visibles, no cortan por el medio de losas 2×2 como antes).
    const loX = -M, hiX = GW - 1 + M, loY = -M, hiY = GH - 1 + M, BS = 1;
    const blk = (v) => v - (((v % BS) + BS) % BS);     // alinea costuras a la rejilla

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
    // Tile de hierba a mano: SOLO en verano y si ya cargó (si no, suelo procedural).
    const useGrassTile = seasonKey === 'verano' && !!FLOOR.grass;
    const soilTiles = [FLOOR.soil, FLOOR.soil2, FLOOR.soil3, FLOOR.soil4].filter(Boolean);
    const hasWater = !!(opts.mapa && Array.isArray(opts.mapa.construcciones) && opts.mapa.construcciones.some(c => c && (c.tipo === 'estanque' || c.tipo === 'lago')));

    // ── CAMINO de tierra desde el 午門 (portón SUROESTE) ──────────────────────
    // Sale RECTO del portón (eje central, perpendicular al muro delantero) hacia
    // afuera (+y = abajo-izquierda en pantalla). En esas celdas se pinta TIERRA (soil)
    // en vez de hierba, y se DESPEJA de árboles/arbustos (el camino +1 a cada lado)
    // para que nada se superponga. Requiere las tiles soil cargadas (si no, se omite).
    const PATH_W = 2;                                            // ancho del camino en tiles
    const pathCol = WD.gate ? Math.floor((GW - 1) / 2) : null;   // = gateGc del muro delantero
    const pathC0 = pathCol != null ? pathCol - Math.floor(PATH_W / 2) : null;   // 1ª columna del camino
    const pathC1 = pathC0 != null ? pathC0 + PATH_W - 1 : null;                 // última columna
    const pathFromGy = GH - 1 + M + 1;                           // 1ª fila FUERA del muro delantero
    const onPath = (gx, gy) => pathC0 != null && soilTiles.length && gx >= pathC0 && gx <= pathC1 && gy >= pathFromGy;
    const pathClear = (gx, gy) => pathC0 != null && soilTiles.length && gx >= pathC0 - 1 && gx <= pathC1 + 1 && gy >= pathFromGy;
    // EXPLANADA SUR del portón: la caravana de tributo aparca a un lado del vano y los
    // ÁRBOLES altos de ahí la tapaban («molestan»). En una banda ancha y poco profunda
    // frente a la puerta se prohíben SOLO los árboles (las matas/rocas/flores bajas
    // siguen dando vida sin ocluir). pathCol es la columna del vano.
    const aproSurArbol = (gx, gy) => pathCol != null && gy >= pathFromGy && gy <= pathFromGy + 6 && gx >= pathC0 - 4 && gx <= pathC1 + 4;

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
      // CAMINO de tierra que sale del portón: siempre soil (todas las estaciones).
      if (onPath(gx, gy)) {
        const tile = soilTiles[(hash(gx * 5.7 + 1, gy * 4.3 + 9) * soilTiles.length) | 0];
        poly([N, E, S, Wp], P.soil);                 // base OPACA: sin costura (halo blanco) entre rombos
        g.imageSmoothingEnabled = false;             // 2:1 exacto → bordes duros que teselan sin fleco
        g.drawImage(tile, cx - TILE_W / 2, cy - TILE_H / 2, TILE_W, TILE_H);
        return;
      }
      // Tile de HIERBA a mano (solo verano por ahora): rombo 144×72 dibujado a
      // tamaño de celda (36×18 lógico → 72×36 device). Reemplaza el suelo procedural.
      // Alguna celda suelta lleva un parche de TIERRA (variantes soil) por variedad.
      if (useGrassTile) {
        let tile = FLOOR.grass, base = P.g2;
        if (soilTiles.length && hash(gx * 3.1 + 2, gy * 2.3 + 6) > 0.9) {
          tile = soilTiles[(hash(gx * 5.7 + 1, gy * 4.3 + 9) * soilTiles.length) | 0]; base = P.soil;
        }
        poly([N, E, S, Wp], base);                   // base OPACA bajo la tile: sin costura (halo blanco)
        g.imageSmoothingEnabled = false;             // 2:1 exacto → bordes duros que teselan sin fleco
        g.drawImage(tile, cx - TILE_W / 2, cy - TILE_H / 2, TILE_W, TILE_H);
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
    // Igual pero para una PLANTA por imagen (arte a ~2× device): se dibuja a media
    // resolución (nítida) anclada por su base, con sombra de contacto.
    function blitPlant(img, lx, ly, shR, scale) {
      const s = scale || 0.5, w = img.width * s, h = img.height * s;
      g.fillStyle = 'rgba(0,0,0,0.20)'; g.beginPath(); g.ellipse(lx, ly + 1, shR, shR * 0.42, 0, 0, 6.2832); g.fill();
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = true;
      g.drawImage(img, Math.round(lx * SCALE - w / 2), Math.round(ly * SCALE - h + 3), w, h);
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
    // Arte a mano disponible (solo verano; es de temporada verde).
    const imgPlants = seasonKey === 'verano'
      ? ['bush', 'bushrock', 'rock', 'fern', 'flowers', 'fern2'].filter(k => PLANTS[k])
      : [];
    const hasImgTrees = seasonKey === 'verano' && (TREES.pine || TREES.oak || TREES.willow || TREES.fruit);
    // Elige un árbol a mano DISCRETO por celda: pino/roble/sauce comunes, frutal raro.
    function pickTree(gx, gy) {
      const roll = hash(gx * 8.3 + 4, gy * 6.1 + 7);
      let k = roll < 0.32 ? 'oak' : roll < 0.62 ? 'pine' : roll < 0.9 ? 'willow' : 'fruit';
      if (!TREES[k]) k = ['pine', 'oak', 'willow', 'fruit'].find(t => TREES[t]);
      return TREES[k];
    }
    function propAt(gx, gy, riverNear) {
      const r = hash(gx * 7.3 + 1, gy * 7.7 + 2);
      if (riverNear && r < 0.5) return FLORA ? { cv: FLORA.reeds(seasonKey, (hash(gx + 9, gy + 4) * 9) | 0), sh: 6 } : null;
      if (r < 0.66) return null;                                  // hierba pelada (densidad moderada)
      const pick = hash(gx * 2.7 + 5, gy * 3.1 + 8), vv = (hash(gx * 1.9 + 2, gy * 2.3 + 7) * 99) | 0;
      // ÁRBOLES a mano (verano): reemplazan a los procedurales. Menos frecuentes que
      // antes (son grandes → que no sature) — el resto son matas/rocas bajas.
      if (hasImgTrees && pick < 0.20) return { img: pickTree(gx, gy), sh: 12, scale: 0.46, tree: true };
      if (FLORA && !hasImgTrees && pick < 0.5) { const sp = HacFlora.SPECIES[(hash(gx * 5.1 + 3, gy * 4.7 + 6) * HacFlora.SPECIES.length) | 0]; return { cv: FLORA.tree(sp, seasonKey, vv), sh: 13, tree: true }; }
      if (imgPlants.length) { const k = imgPlants[(hash(gx * 4.9 + 6, gy * 3.7 + 2) * imgPlants.length) | 0]; return { img: PLANTS[k], sh: k === 'rock' || k === 'bushrock' ? 8 : 6 }; }
      if (!FLORA) return { blob: true, sh: 9 };
      if (pick < 0.78) return { cv: FLORA.bush(seasonKey, vv), sh: 9 };
      if (pick < 0.90) return { cv: FLORA.rock(seasonKey, vv), sh: 9 };
      return { cv: FLORA.flowers(seasonKey, vv), sh: 5 };
    }
    // Pinta el campo (saltando la huella del suelo de piedra) y reúne los props
    // con su posición «jittered», para colocarlos con orden de profundidad.
    const txLo = Math.floor(gxLo), txHi = Math.ceil(gxHi), tyLo = Math.floor(gyLo), tyHi = Math.ceil(gyHi);
    const inFloor = (gx, gy) => gx >= loX && gx <= hiX && gy >= loY && gy <= hiY;
    // Exclusión de props bajo la SILUETA real de un edificio exterior (no solo su
    // huella ±1): el arte sobresale mucho —p.ej. la torre y la explanada de tierra
    // del campamento— y, sin esto, se plantarían árboles/bambú encima o por
    // delante (rompiendo la oclusión). Muestreamos el alpha del sprite ya cargado.
    const extAlpha = extSprites.map(({ c, m }) => {
      const img = imgOf(spriteKey(c));
      if (!img || !img.width) return null;
      try {
        const oc = document.createElement('canvas'); oc.width = img.width; oc.height = img.height;
        const og = oc.getContext('2d'); og.drawImage(img, 0, 0);
        return { ax: Math.round(X(c.pos[0], c.pos[1]) * SCALE - m.ox), ay: Math.round(Y(c.pos[0], c.pos[1]) * SCALE - m.oy), w: img.width, h: img.height, data: og.getImageData(0, 0, img.width, img.height).data };
      } catch (e) { return null; }
    }).filter(Boolean);
    // Muestrea el centro de la celda y un anillo a ±½ tile (tolerancia ≈1 celda)
    // para excluir también props pegados al borde de la silueta (p.ej. el bambú
    // junto a la atalaya, cuya base cae justo fuera de la explanada).
    const SAMPLE = [[0, 0], [18, 0], [-18, 0], [0, 9], [0, -9]];
    const underExtSprite = (gx, gy) => {
      const px = X(gx, gy) * SCALE, py = Y(gx, gy) * SCALE;
      for (const s of extAlpha) {
        for (const [dx, dy] of SAMPLE) {
          const ix = Math.round(px + dx - s.ax), iy = Math.round(py + dy - s.ay);
          if (ix >= 0 && iy >= 0 && ix < s.w && iy < s.h && s.data[(iy * s.w + ix) * 4 + 3] > 40) return true;
        }
      }
      return false;
    };
    const props = [];
    for (let gy = tyLo; gy <= tyHi; gy++) for (let gx = txLo; gx <= txHi; gx++) {
      if (inFloor(gx, gy)) continue;
      const riv = isRiver(gx, gy);
      terrTile(gx, gy, riv);
      if (riv) continue;
      if (pathClear(gx, gy)) continue;             // camino del portón (±1): sin árboles ni matas que lo tapen
      if (extCells.has(gx + ',' + gy)) continue;   // no plantar props sobre/junto a un edificio exterior
      if (underExtSprite(gx, gy)) continue;         // ni bajo la silueta de su sprite (torre, explanada…)
      // Orla exterior limpia: sin props en el anillo más externo (evita recortes).
      if (gx === txLo || gx === txHi || gy === tyLo || gy === tyHi) continue;
      const nearWall = gx >= loX - 1 && gx <= hiX + 1 && gy >= loY - 1 && gy <= hiY + 1;
      if (nearWall) continue;
      const riverNear = hasWater && (isRiver(gx - 1, gy) || isRiver(gx + 1, gy) || isRiver(gx, gy - 1) || isRiver(gx, gy + 1));
      const spec = propAt(gx, gy, riverNear);
      if (!spec) continue;
      if ((spec.tree || spec.blob) && aproSurArbol(gx, gy)) continue;   // sin árboles altos frente al portón (tapaban la caravana)
      const jx = (hash(gx + 1, gy + 5) - 0.5) * TILE_W * 0.4, jy = (hash(gx + 7, gy + 2) - 0.5) * TILE_H * 0.4;
      props.push({ gx, gy, sum: gx + gy, lx: X(gx, gy) + jx, ly: Y(gx, gy) + jy, spec });
    }
    const drawProp = (p) => { if (p.spec.img) blitPlant(p.spec.img, p.lx, p.ly, p.spec.sh, p.spec.scale); else if (p.spec.cv) blitProp(p.spec.cv, p.lx, p.ly, p.spec.sh); else if (p.spec.blob) drawTreeBlob(p.lx, p.ly); };
    // rect de PANTALLA (device) que ocupa el sprite del prop. La recomposición por
    // frame lo usa para saber que un árbol ALTO cubre celdas lejos de su base y
    // redibujarlo SOBRE los mecenas que pasen por delante (si no, el mecenas se ve
    // por encima del árbol: el "cuadrado" que lo atraviesa todo).
    const propSrect = (p) => {
      if (p.spec.img) { const s = p.spec.scale || 0.5, w = p.spec.img.width * s, h = p.spec.img.height * s; return [p.lx * SCALE - w / 2, p.ly * SCALE - h + 3, p.lx * SCALE + w / 2, p.ly * SCALE + 3]; }
      if (p.spec.cv) { const cv = p.spec.cv; return [p.lx * SCALE - cv.width / 2, p.ly * SCALE - cv.height + 6, p.lx * SCALE + cv.width / 2, p.ly * SCALE + 6]; }
      return null;
    };
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
    const pabList = (B && typeof B.regionDePabellon === 'function' && Array.isArray(opts.pabellones)) ? opts.pabellones : [];
    pabList.forEach(p => {
      if (!p || !Array.isArray(p.seed)) return;
      const region = B.regionDePabellon(p, tier);
      if (!region.length) return;
      const r = B.rolPabellon(p.rol), col = r ? r.color : casa, cc = hexToRgb(col);
      // Relleno MUY suave (una veladura de color, no una mancha) sobre el suelo.
      const fill = 'rgba(' + cc[0] + ',' + cc[1] + ',' + cc[2] + ',0.11)';
      region.forEach(([gx, gy]) => {
        const cx = X(gx, gy), cy = Y(gx, gy);
        poly([[cx, cy - TILE_H / 2], [cx + TILE_W / 2, cy], [cx, cy + TILE_H / 2], [cx - TILE_W / 2, cy]], fill);
      });
      // BORDE limpio: como la región es un rectángulo, trazamos su contorno
      // uniendo los 4 vértices extremos (líneas iso rectas, sin escalera).
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      region.forEach(([gx, gy]) => { if (gx < minx) minx = gx; if (gy < miny) miny = gy; if (gx > maxx) maxx = gx; if (gy > maxy) maxy = gy; });
      const vTop = [X(minx, miny), Y(minx, miny) - TILE_H / 2];
      const vRight = [X(maxx, miny) + TILE_W / 2, Y(maxx, miny)];
      const vBot = [X(maxx, maxy), Y(maxx, maxy) + TILE_H / 2];
      const vLeft = [X(minx, maxy) - TILE_W / 2, Y(minx, maxy)];
      const trace = () => { g.beginPath(); g.moveTo(vTop[0], vTop[1]); g.lineTo(vRight[0], vRight[1]); g.lineTo(vBot[0], vBot[1]); g.lineTo(vLeft[0], vLeft[1]); g.closePath(); };
      g.lineJoin = 'round';
      // Halo oscuro por debajo (para que el borde se lea sobre cualquier suelo).
      trace(); g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 4; g.stroke();
      trace(); g.strokeStyle = 'rgba(' + cc[0] + ',' + cc[1] + ',' + cc[2] + ',0.85)'; g.lineWidth = 1.5; g.stroke();
    });
    // Guarda la proyección para el hit-test celda↔cursor (hover de pabellones).
    canvas._hacProj = { originX, originY, GW, GH };

    // ── Murallas (tras el paseo de ronda) ────────────────────────────────
    const capH = WD.cap === 'tile' ? 4 : 3;
    const wTop = light(WD.base, .14), wL = dark(WD.base, .18), wR = dark(WD.base, .33);
    const capCol = WD.cap === 'tile' ? mix('#5b6068', casa, .04) : light(WD.base, .16);
    const capT = light(capCol, .14), capL = dark(capCol, .14), capR = dark(capCol, .30);
    const tileRoof = mix('#5b6068', casa, .04), gold = '#d0a84a', dark9 = '#1a120a';
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

    // ── MURALLA por TILES (SOLO tema Wei): sustituye al muro procedural ───────
    // Coloca el kit de tiles (assets/img/iso/wei/wall-*) alrededor del perímetro,
    // con el 午門 (gate-wall) en el eje. Recinto cerrado (4 lados a altura completa).
    const WEI = (typeof window !== 'undefined' && window.ISO_SPRITES_THEMES && window.ISO_SPRITES_THEMES.wei) || null;
    // Muralla exterior: SIEMPRE procedural (como las demás haciendas). Se descartó la
    // vía por imagen (muralla-luoyang / portones-luoyang / torre de esquina): nunca
    // cuadraban bien en los vértices. El Salón del Trono sigue siendo arte a mano.
    const weiWalls = false;
    const gateGcW = WD.gate ? Math.floor((GW - 1) / 2) : -999;
    function drawWeiTile(key, fx, fy, flip, S, box) {
      const m = WEI && WEI[key], img = SPRITES['wei/' + key]; if (!m || !img) return;
      const vx = X(fx, fy) * SCALE, vy = (Y(fx, fy) + TILE_H) * SCALE;   // vértice frontal-bajo destino (device)
      wallSegs.push({ box, draw: () => {
        if (flip) g.setTransform(-S, 0, 0, S, vx + m.ox * S, vy - m.oy * S);
        else      g.setTransform(S, 0, 0, S, vx - m.ox * S, vy - m.oy * S);
        g.imageSmoothingEnabled = true;      // arte a mano (tema) reescalado → sin aliasing
        g.drawImage(img, 0, 0);
        g.imageSmoothingEnabled = false;
        g.setTransform(SCALE, 0, 0, SCALE, 0, 0);
      } });
    }
    // Dibuja un sprite de EDIFICIO del tema (convención meta: ox/oy = esquina N,
    // tamaño m.w×m.h en device) en la celda (gx,gy), con espejo horizontal opcional
    // (para las rectas que corren por el eje gy). Empuja a wallSegs con su caja de
    // orden. Se usa para tejer la muralla exterior de Luoyang con las piezas a mano.
    function drawWeiBld(key, gx, gy, flip, box, s, obox) {
      const m = WEI && WEI[key], img = SPRITES['wei/' + key]; if (!m || !img) return;
      s = s || 1;                                    // factor de escala por pieza
      const ox = m.ox * s, oy = m.oy * s, w = m.w * s, h = m.h * s;
      const nx = X(gx, gy) * SCALE, ny = Y(gx, gy) * SCALE;   // esquina N (pos) en device
      wallSegs.push({ box, obox, draw: () => {
        g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = true;
        if (flip) { g.save(); g.translate(Math.round(nx + ox), Math.round(ny - oy)); g.scale(-1, 1); g.drawImage(img, 0, 0, w, h); g.restore(); }
        else g.drawImage(img, Math.round(nx - ox), Math.round(ny - oy), w, h);
        g.imageSmoothingEnabled = false; g.setTransform(SCALE, 0, 0, SCALE, 0, 0);
      } });
    }

    function drawWeiPerimeter() {
      // ── Muralla exterior de LUOYANG (piezas a mano) ────────────────────────
      // Si están las piezas nuevas, tejemos el perímetro con muralla-luoyang [8×2]
      // + portón-luoyang [6×4] (frente 洛阳宫 al SO, lisa al NO). Lados gx (FL sur/SO,
      // WT norte/NE) → rot 0; lados gy (WL oeste/NO, FR este/SE) → espejo. Sin esquinas
      // aún (llegarán aparte): v1 para iterar. Fallback al kit viejo si faltan.
      const luo = SPRITES['wei/bld-muralla-luoyang-0'] && SPRITES['wei/bld-puerta-luoyang-1'];
      if (luo) {
        const SEG = 8, gcX = Math.floor((GW - 1) / 2);
        const nearC = (v, c) => Math.abs(v + SEG / 2 - c) < SEG / 2 + 2;   // el segmento [v,v+8] pisa el centro c
        // Portones en los lados gx PARALELOS: FRENTE (洛阳宫) al SO (FL), TRASERA (lisa)
        // al NE (WT). Ambos rot 0 (mismo eje) → sin flip. WL/FR: solo muro (espejo).
        const SG = 0.7;             // escala de los portones (algo menor que el muro)
        const C = 2;                // reserva de ESQUINA (= grosor del muro): hueco a
                                    // dejar en cada vértice para la futura torre 角樓.
        // Teja piezas de SEG celdas desde `a` hasta `b` a lo largo del eje, a ras en
        // ambos extremos (la última se solapa un pelín si el tramo no es múltiplo de
        // SEG). `place(p)` dibuja una pieza cuyo borde arranca en el offset p.
        const tileAxis = (a, b, place) => {
          if (b - a < SEG + 1e-6) { if (b - a > 1e-6) place(a); return; }
          const pos = []; let p = a;
          for (; p + SEG <= b + 1e-6; p += SEG) pos.push(p);
          if (pos[pos.length - 1] + SEG < b - 1e-6) pos.push(b - SEG);   // remate a ras
          pos.forEach(place);
        };
        // Alinear el VANO (puerta roja) con el eje ceremonial (columna gcX): al
        // escalar a SG el vano se corre hacia el ancla del sprite, así que deslizamos
        // el portón por el muro (+gx desliza a lo largo del muro, no cambia la
        // profundidad) para devolver el vano al centro del footprint. Deltas medidos
        // del arte a SG=0.7 — vano frente 洛阳宫 en px≈(201,449); trasero liso ≈(142,335)
        // — con Δgx = [144 + SG·(ox+2·oy − px − 2·py)] / 72 (independiente del tier).
        const DXF = 1.17, DXB = 0.89;   // corrimiento gx del portón FRENTE / TRASERO (ajustado a render)
        // Lados gx (horizontales): tramos de muro con HUECO de C celdas en cada esquina
        // y el portón en el centro. FL (sur, mira al SO): portón FRENTE ceremonial.
        tileAxis(C, GW - C, x => { if (nearC(x, gcX)) return; drawWeiBld('bld-muralla-luoyang-0', x, GH - 2, false, [x, GH - 2, x + SEG, GH]); });
        drawWeiBld('bld-puerta-luoyang-1', gcX - 2 + DXF, GH - 3, false, [gcX - 2 + DXF, GH - 3, gcX + 2 + DXF, GH], SG);
        // WT (norte, mira al NE): portón TRASERO (lisa) en el centro.
        tileAxis(C, GW - C, x => { if (nearC(x, gcX)) return; drawWeiBld('bld-muralla-luoyang-0', x, 0, false, [x, 0, x + SEG, 2]); });
        drawWeiBld('bld-puerta-luoyang-0', gcX - 2 + DXB, 0, false, [gcX - 2 + DXB, 0, gcX + 2 + DXB, 3], SG);
        // Lados gy (verticales, espejo): también con hueco de esquina.
        tileAxis(C, GH - C, y => drawWeiBld('bld-muralla-luoyang-0', 0, y, true, [0, y, 2, y + SEG]));       // WL oeste (mira NO)
        tileAxis(C, GH - C, y => drawWeiBld('bld-muralla-luoyang-0', GW - 2, y, true, [GW - 2, y, GW, y + SEG])); // FR este (mira SE)
        // Torre de esquina: la vía IMAGEN queda descartada (nunca cuadra bien en el
        // vértice). Se generará PROCEDURALMENTE como en las demás haciendas.
        return;
      }
      const S = 0.46, ST = 2;
      for (let gy = lo; gy <= hiH; gy += ST) drawWeiTile('wall-straight2-front', FRi, gy, false, S, [FRi - 1, gy - 1, FRi + 1, gy + 1]); // FR este (frente)
      for (let gy = lo; gy <= hiH; gy += ST) drawWeiTile('wall-straight2-front', WLi, gy, false, S, [WLi - 1, gy - 1, WLi + 1, gy + 1]); // WL oeste (fondo)
      for (let gx = lo; gx <= hiW; gx += ST) drawWeiTile('wall-straight2-front', gx, WTi, true,  S, [gx - 1, WTi - 1, gx + 1, WTi + 1]); // WT norte (fondo)
      for (let gx = lo; gx <= hiW; gx += ST) { if (Math.abs(gx - gateGcW) <= 1) continue; drawWeiTile('wall-straight2-front', gx, FLi, true, S, [gx - 1, FLi - 1, gx + 1, FLi + 1]); } // FL sur (frente) + hueco puerta
      drawWeiTile('wall-corner-out-front', FRi, FLi, false, S, [FRi - 1, FLi - 1, FRi + 1, FLi + 1]); // esquina S (frente-abajo)
      drawWeiTile('wall-corner-out-back',  WLi, WTi, false, S, [WLi - 1, WTi - 1, WLi + 1, WTi + 1]); // esquina N (fondo-arriba)
      drawWeiTile('wall-corner-out-front', WLi, FLi, true,  S, [WLi - 1, FLi - 1, WLi + 1, FLi + 1]); // esquina W (izq)
      drawWeiTile('wall-corner-out-back',  FRi, WTi, true,  S, [FRi - 1, WTi - 1, FRi + 1, WTi + 1]); // esquina E (der)
      drawWeiTile('gate-wall-front', gateGcW, FLi, false, S, [gateGcW - 2, FLi - 2, gateGcW + 2, FLi + 2]); // 午門 en el eje sur
    }

    if (!weiWalls) {
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
      // Vano ABIERTO (pasaje oscuro) con las dos hojas rojas PLEGADAS planas a los
      // lados (sin batir hacia dentro): los mecenas entran y salen por aquí. (La
      // animación cerrada→abierta al acercarse vendrá luego.)
      const dz = gh * 0.6, doorTop = dz + 0.4, HW = 0.56;
      // Hojas de madera lacada CERRADAS (門釘 de bronce): así por defecto no es un
      // hueco negro ni queda permanentemente abierto. En la finca pública, la capa
      // hac-folk las abre HACIA AFUERA cuando un mecenas cruza (overlay animado).
      const shadow = mix('#241a14', casa, .02);   // recess oscuro CÁLIDO tras las hojas (no negro)
      poly([Pg(gc - 0.62, y1, 0), Pg(gc + 0.62, y1, 0), Pg(gc + 0.62, y1, doorTop + 0.25), Pg(gc - 0.62, y1, doorTop + 0.25)], shadow);
      const woodLintel = dark(mix('#5a3a22', casa, .03), .1);
      poly([Pg(gc - 0.66, y1, doorTop + 0.05), Pg(gc + 0.66, y1, doorTop + 0.05), Pg(gc + 0.66, y1, doorTop + 0.7), Pg(gc - 0.66, y1, doorTop + 0.7)], woodLintel);
      const lac = mix('#7a2a1c', casa, .03);
      const leaf = (x0, x1, fill) => {
        poly([Pg(x0, y1, 0), Pg(x1, y1, 0), Pg(x1, y1, doorTop), Pg(x0, y1, doorTop)], fill);
        for (let t = 1; t < 3; t++) { const xx = x0 + (x1 - x0) * t / 3; seg(Pg(xx, y1, 0.3), Pg(xx, y1, doorTop - 0.3), dark(fill, .16)); }   // tablones
        g.fillStyle = gold;   // tachones 門釘 en rejilla
        const rows = Math.max(3, Math.round(doorTop / 3.2));
        for (let r = 0; r < rows; r++) { const zz = doorTop * (r + 0.6) / (rows + 0.2);
          for (let cI = 0; cI < 2; cI++) { const xx = x0 + (x1 - x0) * (cI ? 0.66 : 0.34); const p = Pg(xx, y1, zz); g.beginPath(); g.arc(p[0], p[1], 0.55, 0, 6.2832); g.fill(); } }
      };
      leaf(gc - HW, gc - 0.02, lac);              // hoja izquierda
      leaf(gc + 0.02, gc + HW, dark(lac, .07));   // hoja derecha (un punto en sombra)
      seg(Pg(gc, y1, 0.2), Pg(gc, y1, doorTop), shadow);   // junta central
      g.strokeStyle = gold; g.lineWidth = 0.6;             // tiradores 鋪首 (anillas de bronce)
      [-0.2, 0.2].forEach(dx0 => { const p = Pg(gc + dx0, y1, doorTop * 0.46); g.beginPath(); g.arc(p[0], p[1], 1.0, 0, 6.2832); g.stroke(); });
      seg(Pg(gc - HW, y1, 0.14), Pg(gc + HW, y1, 0.14), dark(capCol, .2));   // umbral de piedra
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
    // Geometría del SOUTH GATE para que hac-folk anime sus hojas (abrir hacia afuera,
    // +y) al cruzar un mecenas. Coords de celda (= proyección logic() de folk).
    if (WD.gate) canvas._hacGates = [{ orient: 'x', gc: gateGc, yFace: FLo, z0: 0, zTop: (WD.h + 6) * 0.6 + 0.4, hw: 0.56, swing: 1 }];
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
    } else { drawWeiPerimeter(); }

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
        const pave = mix('#a99c78', casa, .03), curb = dark(pave, .34), joint = dark(pave, .16);   // sendero de tierra/gravilla apisonada (contrasta con el ladrillo gris del patio)
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
    // Los muros/portones perimetrales se marcan (`wall:true`) para que la
    // recomposición por frame garantice su oclusión sobre los actores que tienen
    // DETRÁS (evita que un mecenas «se cuele» por delante de la torre-puerta).
    const drawList = wallSegs.map(s => { s.wall = true; return s; });
    lista.filter(c => !isFlat(c) && c.tipo !== 'muralla').forEach(c => {
      const f = fp(c), x0 = c.pos[0], y0 = c.pos[1];
      // srect = rectángulo de PANTALLA (device) que ocupa el sprite. Sirve para que
      // la recomposición por frame sepa que una estructura ALTA/ANCHA (p.ej. el
      // campamento, 720×444) cubre celdas lejos de su footprint y debe redibujarse
      // sobre los mecenas que tape (si no, los "chafan").
      const sk = spriteKey(c), m = sk && metaOf(sk);
      const sox = X(x0, y0) * SCALE, soy = Y(x0, y0) * SCALE;
      const srect = m ? [sox - m.ox, soy - m.oy, sox - m.ox + m.w, soy - m.oy + m.h] : null;
      // Caja de OCLUSIÓN opcional (m.occ = [oeste, norte, este, sur] en celdas a
      // recortar de la huella). Cuando el sprite tiene una base PLANA ancha (terraza,
      // escalinatas) mayor que el cuerpo ALTO —caso del Salón del Trono—, encogemos
      // la caja que decide si el edificio tapa a un actor: así quien pasa por DELANTE
      // (al sur del cuerpo) no queda oculto tras la piedra, y solo se tapa quien va
      // por detrás. Solo afecta a la oclusión de mecenas (frame), NO al orden de
      // pintado entre estructuras (que sigue usando la huella real). [rot 0/1]
      let obox = null;
      if (m && m.occ) { const o = m.occ; obox = [x0 + (o[0] || 0), y0 + (o[1] || 0), x0 + f[0] - (o[2] || 0), y0 + f[1] - (o[3] || 0)]; }
      drawList.push({ box: [x0, y0, x0 + f[0], y0 + f[1]], srect, obox, draw: () => drawC(c) });
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
    // Props del territorio (árboles, matas, rocas): ENTRAN en el drawList con su
    // caja de huella (1 celda) + srect, para que ordenen en profundidad con muros/
    // edificios/mecenas y se recompongan bien por frame (no van al bgFloor: si no,
    // el mecenas se dibujaría siempre por encima del árbol).
    props.forEach(p => drawList.push({ box: [p.gx, p.gy, p.gx + 1, p.gy + 1], srect: propSrect(p), draw: () => drawProp(p) }));
    // (El comparador `before` y el ordenador `depthOrder` viven a nivel de módulo.)
    // Zócalo/escalinata de los edificios que lo tienen: capa baja, sobre el
    // suelo y bajo el resto (decoración, muros, edificios, mecenas).
    lista.filter(c => !isFlat(c) && metaOf('bld-' + c.tipo + '-base-' + (((c.rot || 0) % 4 + 4) % 4)))
      .sort((a, b) => flatSort(a) - flatSort(b) || a.pos[0] - b.pos[0])
      .forEach(drawBaseSprite);

    let bgFloor = null;
    try {
      bgFloor = canvas._hacBgFloor || (canvas._hacBgFloor = document.createElement('canvas'));
      bgFloor.width = canvas.width; bgFloor.height = canvas.height;
      const bfg = bgFloor.getContext('2d');
      bfg.drawImage(canvas, 0, 0);
      // Hornea el MISMO grano determinista en el suelo cacheado. Así la recomposición
      // por frame (alrededor de cada mecenas) NO tiene que reaplicar ruido con
      // getImageData/putImageData —que hundía los FPS—: el grano ya cuadra pixel a
      // pixel con `bg`.
      applyNoise(bfg, 0, 0, bgFloor.width, bgFloor.height, bgFloor.width, bgFloor.height);
    } catch (e) { bgFloor = null; }

    // Pintado atrás→delante por PROFUNDIDAD escalar (esquina delantera; ver depthOrder).
    depthOrder(drawList, d => d.box).forEach(d => d.draw());

    // DEBUG: contorno de la huella (celdas ocupadas) de cada edificio. Activar con
    // window.HAC_DEBUG_FOOTPRINT = true (solo para calibrar anclajes en el harness).
    if (typeof window !== 'undefined' && window.HAC_DEBUG_FOOTPRINT && B) {
      g.save();
      g.setTransform(SCALE, 0, 0, SCALE, 0, 0);
      lista.filter(c => !isFlat(c)).forEach(c => {
        (cellsOf(c) || []).forEach(([gx, gy]) => {
          const top = [X(gx, gy), Y(gx, gy) - TILE_H / 2];
          const rgt = [X(gx, gy) + TILE_W / 2, Y(gx, gy)];
          const bot = [X(gx, gy), Y(gx, gy) + TILE_H / 2];
          const lft = [X(gx, gy) - TILE_W / 2, Y(gx, gy)];
          g.beginPath(); g.moveTo(top[0], top[1]); g.lineTo(rgt[0], rgt[1]);
          g.lineTo(bot[0], bot[1]); g.lineTo(lft[0], lft[1]); g.closePath();
          g.fillStyle = 'rgba(0,255,0,0.30)'; g.fill();
          g.strokeStyle = 'rgba(0,220,0,0.9)'; g.lineWidth = 1; g.stroke();
        });
      });
      g.restore();
    }

    // (Los props del territorio ya van en drawList, ordenados en profundidad.)

    // ── Grano sutil: rompe el monocromo del suelo y las murallas (textura) ──
    // Ruido de luminancia determinista por píxel; los sprites (ya texturizados)
    // reciben un grano leve que unifica el conjunto.
    try {
      g.setTransform(1, 0, 0, 1, 0, 0);
      applyNoise(g, 0, 0, canvas.width, canvas.height, canvas.width, canvas.height);
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
      canvas._hacScene = { bg, bgFloor, drawList, before, X, Y, SCALE };
    } catch (e) { canvas._hacScene = null; }
    g.setTransform(1, 0, 0, 1, 0, 0);

    // Clave de sprite: tipo + rotación 0..3 (cada una con la puerta en su cara).
    function spriteKey(c) {
      const def = B && B.tipo(c.tipo);
      if (!def) return null;
      const k = 'bld-' + c.tipo + '-' + (((c.rot || 0) % 4 + 4) % 4);
      // Si no hay sprite para esa rotación (edificios de vista ÚNICA, p.ej. el
      // campamento), cae al sprite base (-0) en vez de al placeholder de prisma.
      return metaOf(k) ? k : ('bld-' + c.tipo + '-0');
    }

    function sprite(c) {
      const key = spriteKey(c);
      const img = key && imgOf(key);
      const m = key && metaOf(key);
      if (!img || !m) { placeholder(c); return; }
      // El sprite está horneado a SCALE× (meta en px de dispositivo). Lo pintamos a
      // tamaño de META (m.w×m.h): para el set procedural coincide con el nativo (1:1,
      // nítido); para el arte a mano por tema, la meta fija el tamaño en pantalla.
      // El arte de tema (TMETA) suele venir a mayor resolución que su tamaño en
      // pantalla → activamos suavizado para reducirlo sin aliasing (el procedural va 1:1).
      const isTheme = !!(TMETA && TMETA[key]);
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (isTheme) g.imageSmoothingEnabled = true;
      g.drawImage(img, Math.round(X(c.pos[0], c.pos[1]) * SCALE - m.ox), Math.round(Y(c.pos[0], c.pos[1]) * SCALE - m.oy), m.w, m.h);
      if (isTheme) g.imageSmoothingEnabled = false;
      g.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    }

    function drawBaseSprite(c) {
      const key = 'bld-' + c.tipo + '-base-' + (((c.rot || 0) % 4 + 4) % 4);
      const img = imgOf(key), m = metaOf(key);
      if (!img || !m) return;
      const isTheme = !!(TMETA && TMETA[key]);
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (isTheme) g.imageSmoothingEnabled = true;
      g.drawImage(img, Math.round(X(c.pos[0], c.pos[1]) * SCALE - m.ox), Math.round(Y(c.pos[0], c.pos[1]) * SCALE - m.oy), m.w, m.h);
      if (isTheme) g.imageSmoothingEnabled = false;
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

  // Comparador isométrico por caja de huella [x0,y0,x1,y1]: A se pinta ANTES
  // (detrás) de Z si está separada al NO en algún eje; si se solapan, desempata por
  // la esquina delantera. Es un orden PARCIAL (muchos pares son incomparables).
  function before(A, Z) {
    if (A[2] <= Z[0] + 1e-6) return true;   // A al oeste de Z → detrás
    if (Z[2] <= A[0] + 1e-6) return false;
    if (A[3] <= Z[1] + 1e-6) return true;   // A al norte de Z → detrás
    if (Z[3] <= A[1] + 1e-6) return false;
    return (A[2] + A[3]) < (Z[2] + Z[3]);   // solapan: por esquina delantera
  }

  // Clave de profundidad iso: la ESQUINA DELANTERA (x1+y1) de la huella. Es el punto
  // más cercano a la cámara; a mayor clave, más «delante» (se pinta después).
  function depthKey(box) { return box[2] + box[3]; }

  // Ordena objetos {box} de ATRÁS a DELANTE por su clave de profundidad escalar
  // (esquina delantera; desempate: más al este = más delante; luego orden de entrada).
  //
  // Por qué escalar y no un comparador tipo `before`: `before` es un orden PARCIAL
  // que, mezclando separación O/N con el desempate por esquina, contiene CICLOS
  // (A detrás de B, B de C, C de A) — ningún orden lineal puede satisfacerlo, y darlo
  // a Array.sort (que exige orden TOTAL) producía resultados inconsistentes y
  // dependientes del contenido → el bug «el edificio se superpone a quien tiene
  // delante» y sus regresiones al tocar cualquier cosa. La clave escalar es un orden
  // TOTAL y transitivo (sin ciclos), y para los pares que SE SOLAPAN en pantalla —los
  // únicos que producen artefactos— coincide exactamente con `before`. Requiere que
  // los objetos sean COMPACTOS (los muros ya van partidos por celda); un objeto muy
  // alargado necesitaría trocearse (o z-buffer por píxel) — no es el caso aquí.
  function depthOrder(items, boxOf) {
    const box = boxOf || ((d) => d.box);
    return items
      .map((d, i) => { const b = box(d); return { d, s: b[2] + b[3], x: b[2], i }; })
      .sort((p, q) => (p.s - q.s) || (p.x - q.x) || (p.i - q.i))
      .map((o) => o.d);
  }

  // ¿El ACTOR (punto en fx,fy, sus pies) queda DETRÁS de la caja de una estructura?
  // Reglas por posición REAL (sin redondear a celda): al sur del frente → delante;
  // al norte → detrás; si no, al este → delante; al oeste → detrás; y DENTRO de la
  // huella (pasaje del portón, porche de la galería) → detrás (la estructura lo tapa).
  // Sustituye al comparador de cajas para actor-vs-estructura: con huellas ALARGADAS
  // (galería 1×3, portón 3×wt) el desempate por esquina delantera + el redondeo a
  // celda hacían «saltar» al mecenas encima del tejado al pasar por detrás, o lo
  // dejaban tapado por el portón cuando ya había emergido por delante.
  function actorBehind(fx, fy, B) {
    if (fy >= B[3] - 1e-6) return false;   // al SUR de la cara frontal → delante
    if (fy <= B[1] + 1e-6) return true;    // al NORTE → detrás
    if (fx >= B[2] - 1e-6) return false;   // al ESTE → delante
    if (fx <= B[0] + 1e-6) return true;    // al OESTE → detrás
    return true;                           // DENTRO de la huella → lo tapa
  }

  // ── Frame de animación: repinta el fondo cacheado y reinserta a los ACTORES
  // (mecenas) en el orden de profundidad, recomponiendo SOLO las estructuras que
  // tienen delante (las que solapan su caja ampliada) → oclusión correcta sin
  // redibujar toda la finca. actors = [{ fx, fy, draw(g, lx, ly, SCALE) }].
  // `dbox` opcional: caja de profundidad a medida (p.ej. las hojas animadas del
  // portón perimetral, que ocupan 3 celdas y no una).
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
        box: a.dbox || [cx, cy, cx + 1, cy + 1],
        fx: a.fx, fy: a.fy,
        fbox: [cx - 0.6, cy - 0.6, cx + 3.5, cy + 3.5],
        lx: sc.X(a.fx, a.fy), ly: sc.Y(a.fx, a.fy),
        bound: a.bound,   // caja de recomposición a medida (px disp. sobre los pies); p.ej. un jinete es más alto/ancho que el clip por defecto
        draw: () => a.draw(g, sc.X(a.fx, a.fy), sc.Y(a.fx, a.fy), sc.SCALE)
      };
    });
    const ov = (A, B) => !(A[2] <= B[0] || B[2] <= A[0] || A[3] <= B[1] || B[3] <= A[1]);
    // Recompón SOLO la zona alrededor de cada actor: restaura suelo+zócalos
    // limpios (sin estructuras), repinta las estructuras CERCANAS una vez (back y
    // front) + el actor en su profundidad, y reaplica el grano. Así no se repinta
    // ninguna estructura sobre su propia copia (lo que acumulaba bordes y hacía que
    // los muros se vieran "raros" al pasar un mecenas).
    if (acts.length && sc.bgFloor) {
      const S = sc.SCALE;
      // Recuadro por actor: el jinete/caballo declaran un `bound` (px disp. sobre los
      // pies) porque sobresalen del clip por defecto (morro del caballo, cabeza del
      // jinete) y, si no, se recortarían y "entrecortarían" al moverse.
      const rects = acts.map(a => a.bound
        ? [Math.floor(a.lx * S - a.bound.l), Math.floor(a.ly * S - a.bound.up), Math.ceil(a.bound.w), Math.ceil(a.bound.h)]
        : [Math.floor((a.lx - 18) * S), Math.floor((a.ly - 36) * S), Math.ceil(36 * S), Math.ceil(44 * S)]);
      // Cercanas = por footprint (±3 celdas) O por SPRITE (su rect de pantalla solapa
      // el recuadro recompuesto del mecenas). Lo segundo capta estructuras altas/anchas
      // (campamento, pagodas…) que tapan al mecenas aunque su footprint esté lejos.
      const near = sc.drawList.filter(d =>
        acts.some(a => ov(d.box, [a.box[0] - 3, a.box[1] - 3, a.box[2] + 3, a.box[3] + 3]))
        || (d.srect && rects.some(r => ov(d.srect, [r[0], r[1], r[0] + r[2], r[1] + r[3]]))));
      // Orden de pintado (estructuras cercanas + actores) por PROFUNDIDAD escalar:
      // un actor DELANTE de un edificio tiene mayor clave → se pinta después → jamás
      // queda tapado; uno DETRÁS, menor clave → se oculta. Sin heurísticas ni tiritas,
      // y transitivo (no hay reordenaciones sorpresa). Para el actor-vs-estructura
      // usamos `obox` (huella encogida en bases anchas: terraza del salón, etc.).
      const render = depthOrder(near.concat(acts), d => d.obox || d.box);
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.beginPath();
      rects.forEach(r => g.rect(r[0], r[1], r[2], r[3]));
      g.clip();
      g.drawImage(sc.bgFloor, 0, 0);
      g.setTransform(S, 0, 0, S, 0, 0);
      render.forEach(d => d.draw());
      g.restore();
      // El grano ya está horneado en sc.bgFloor (y en sc.bg), así que NO se reaplica
      // por frame: la zona recompuesta cuadra con el fondo sin coste de getImageData.
    }
    if (overlays) overlays.forEach(o => o && o.draw && o.draw(g, sc));
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  return { draw, frame, cellAt, TILE_W, TILE_H, SCALE, _occ: { before, depthOrder } };
})();

if (typeof window !== 'undefined') window.HacIso = HacIso;
if (typeof module !== 'undefined' && module.exports) module.exports = HacIso;
