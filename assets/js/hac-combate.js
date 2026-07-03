/* ═══════════════════════════════════════════════════════════════════════
   hac-combate.js — PROTOTIPO de combate por turnos estilo Octopath (CINEMÁTICO).
   ─────────────────────────────────────────────────────────────────────────
   Escena en CANVAS animado (mazmorra con ambiente: antorchas, ascuas, viñeta),
   sprites que se lanzan a atacar, proyectiles, sacudida de cámara, destello y
   números de daño flotantes. UI (turnos/party/menú/registro) en DOM.
   1 encuentro: tu banda (3, jugables) vs 1 enemigo. Escudo+rotura, debilidades
   ocultas (???), BP/Boost, SP. El chino solo adorna; lo accionable en castellano.
   Aislado (combate.html); no toca la finca.
   ═══════════════════════════════════════════════════════════════════════ */
const HacCombate = (function () {
  'use strict';

  const TIPOS = {
    espada: { es: 'Espada', zh: '劍', cat: 'melee', col: '#e6e2d0' },
    lanza:  { es: 'Lanza',  zh: '槍', cat: 'melee', col: '#e6e2d0' },
    arco:   { es: 'Arco',   zh: '弓', cat: 'arrow', col: '#d8c78a' },
    fuego:  { es: 'Fuego',  zh: '火', cat: 'magic', col: '#ff8a3c' },
    viento: { es: 'Viento', zh: '風', cat: 'magic', col: '#7fe3c8' },
  };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ri = (a, b) => Math.floor(rnd(a, b + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  function nuevaParty() {
    return [
      { id: 'g', name: 'Guan Yu', rol: 'Guerrero', aptitud: 'militar', sprite: 'guanyu', aspecto: { robe: '#7a3b34', piel: 1, pelo: 0 },
        maxHp: 130, hp: 130, maxSp: 22, sp: 22, spd: 9, bp: 1, wpn: 'espada', def: false,
        skills: [ { name: 'Tajo doble', type: 'espada', sp: 6, hits: 2, power: 15 }, { name: 'Estocada', type: 'lanza', sp: 8, hits: 1, power: 30 } ] },
      { id: 'a', name: 'Huang Zhong', rol: 'Arquero', aptitud: 'militar', aspecto: { robe: '#4e6f8f', piel: 0, pelo: 2 },
        maxHp: 98, hp: 98, maxSp: 26, sp: 26, spd: 12, bp: 1, wpn: 'arco', def: false,
        skills: [ { name: 'Andanada', type: 'arco', sp: 7, hits: 3, power: 10 }, { name: 'Flecha ígnea', type: 'fuego', sp: 10, hits: 1, power: 26 } ] },
      { id: 'm', name: 'Zhuge Liang', rol: 'Estratega', aptitud: 'cultural', sprite: 'zhugeliang', aspecto: { robe: '#7f9e6a', piel: 0, pelo: 0 },
        maxHp: 84, hp: 84, maxSp: 38, sp: 38, spd: 8, bp: 1, wpn: 'viento', def: false,
        skills: [ { name: 'Llamarada', type: 'fuego', sp: 9, hits: 1, power: 30 }, { name: 'Ventisca', type: 'viento', sp: 9, hits: 2, power: 15 }, { name: 'Vendaval curativo', type: 'cura', sp: 10, heal: 55 } ] },
    ];
  }
  function nuevoEnemigo() {
    const tipos = Object.keys(TIPOS), pool = tipos.slice(), weak = [];
    for (let i = 0; i < 2; i++) weak.push(pool.splice(ri(0, pool.length - 1), 1)[0]);
    return { id: 'foe', name: 'Cabecilla Turbante', zh: '黃巾', aptitud: 'militar', aspecto: { robe: '#caa23c', piel: 2, pelo: 1 },
      maxHp: 460, hp: 460, maxShield: 4, shield: 4, weak: weak, revelado: {}, roto: false, rotoTurnos: 0, spd: 10, atk: [22, 34], foe: true };
  }

  // ── Estado ─────────────────────────────────────────────────────────────────
  let root = null, party = [], enemy = null, orden = [], idx = 0, ronda = 1, busy = false, over = false, sel = { boost: 0 };
  let elScene, elParty, elMenu, elLog, elTimeline, logLines = [];
  // Canvas / animación
  let cv, ctx, bg, bgImg = null, W = 0, H = 0, dpr = 1, raf = 0, t = 0, shake = 0;
  // Spritesheets de ataque (frame 0 = reposo; 0→60 = ataque). Anclados por los pies.
  // thf = altura del CUERPO en pantalla (fracción de H); calibrado para que todos midan igual
  // ignorando lo que sobresale por arriba (p. ej. la guandao de Guan Yu).
  const SHEETS = {
    guanyu:     { src: 'assets/img/guanyu-atk.webp?v=1',     img: null, cols: 8, count: 61, cellW: 361, cellH: 300, pivotX: 233, feetY: 285, charH: 199, thf: 0.300 },
    zhugeliang: { src: 'assets/img/zhugeliang-atk.webp?v=1', img: null, cols: 8, count: 61, cellW: 392, cellH: 300, pivotX: 245, feetY: 293, charH: 275, thf: 0.226 },
  };
  const sheetReady = (u) => !u.foe && u.sprite && SHEETS[u.sprite] && SHEETS[u.sprite].img && SHEETS[u.sprite].img.complete && SHEETS[u.sprite].img.naturalWidth;
  const tweens = [], floaters = [], parts = [], projs = [], slashes = [];
  const alive = (u) => u.hp > 0;
  const partyAlive = () => party.filter(alive);
  const actual = () => orden[idx];

  function log(msg) { logLines.unshift(msg); logLines = logLines.slice(0, 5); if (elLog) elLog.innerHTML = logLines.map((l, i) => `<div class="hcb-log-l" style="opacity:${1 - i * 0.16}">${l}</div>`).join(''); }

  function calcOrden() { const u = [enemy].concat(party).filter(alive); u.sort((a, b) => b.spd - a.spd || (a.foe ? 1 : -1)); orden = u; idx = 0; }

  // ── Sprites (HacChar) por unidad, cacheados como frames de andar ─────────────
  function frames(u) {
    if (u._frames) return u._frames;
    const dir = u.foe ? 'SE' : 'SW';   // enemigo (izq) mira a la dcha; aliados (dcha) miran a la izq
    const arr = [];
    for (let f = 0; f < 4; f++) { const c = document.createElement('canvas'); if (window.HacChar) HacChar.draw(c, { aptitud: u.aptitud, aspecto: u.aspecto, dir: dir, frame: f, scale: 4 }); arr.push(c); }
    u._frames = arr; return arr;
  }

  // ── Enemigo BESPOKE: general Turbante Amarillo (pixel-art propio) ────────────
  const ENC = { yel: '#e8c84a', yelHi: '#f6e08a', yelDk: '#b0892a', skin: '#cb9c6c', skinDk: '#9c7248', beard: '#241a10',
    tunic: '#7a6a44', tunicHi: '#9a8a58', tunicDk: '#54492c', leather: '#463521', leatherHi: '#5c4a2a', sash: '#a83b2b', sashDk: '#7c281c',
    boot: '#2c2118', steel: '#cfd3da', steelDk: '#828892', steelHi: '#eef0f4', gold: '#d8b24a', out: [18, 13, 8] };
  function outlineCanvas(c, col) {
    const g = c.getContext('2d'), w = c.width, h = c.height, im = g.getImageData(0, 0, w, h), d = im.data, o = new Uint8ClampedArray(d);
    const A = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : d[(y * w + x) * 4 + 3];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (d[i + 3] < 20 && (A(x - 1, y) > 40 || A(x + 1, y) > 40 || A(x, y - 1) > 40 || A(x, y + 1) > 40)) { o[i] = col[0]; o[i + 1] = col[1]; o[i + 2] = col[2]; o[i + 3] = 255; } }
    g.putImageData(new ImageData(o, w, h), 0, 0);
  }
  const turbCache = {};
  function turbante(pose) {
    if (turbCache[pose]) return turbCache[pose];
    const w = 48, h = 62, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    const px = (x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); };
    const P = ENC, atk = pose === 'atk', cx = 21, footY = 59;
    // Piernas robustas + botas (pierna dcha adelantada).
    px(cx - 7, footY - 12, 6, 12, P.tunicDk); px(cx + 1, footY - 12, 6, 12, P.tunicDk);
    px(cx - 8, footY - 3, 8, 3, P.boot); px(cx + 1, footY - 3, 9, 3, P.boot);
    px(cx - 8, footY - 3, 8, 1, '#3c2e20'); px(cx + 1, footY - 3, 9, 1, '#3c2e20');
    // Cuerpo (túnica ancha).
    for (let i = 0; i < 22; i++) { const t = i / 21, hw = Math.round(9 + 5 * t), y = footY - 33 + i; px(cx - hw, y, hw * 2, 1, P.tunic); px(cx - hw, y, Math.round(hw * 0.5), 1, P.tunicHi); px(cx + Math.round(hw * 0.4), y, hw - Math.round(hw * 0.4), 1, P.tunicDk); }
    // Coraza de cuero lamelar (pecho).
    for (let r = 0; r < 13; r += 2) { px(cx - 9, footY - 31 + r, 18, 2, P.leather); px(cx - 9, footY - 31 + r, 18, 1, P.leatherHi); for (let s = -8; s < 9; s += 3) px(cx + s, footY - 31 + r, 1, 1, P.gold); }
    // Faja roja.
    px(cx - 10, footY - 16, 20, 3, P.sash); px(cx - 10, footY - 16, 20, 1, '#c25541'); px(cx - 10, footY - 14, 20, 1, P.sashDk);
    px(cx - 3, footY - 15, 5, 6, P.sashDk);   // nudo de la faja
    // Hombreras (placas).
    px(cx - 13, footY - 32, 6, 5, P.steelDk); px(cx - 13, footY - 32, 6, 1, P.steel);
    px(cx + 7, footY - 32, 6, 5, P.steelDk); px(cx + 7, footY - 32, 6, 1, P.steel);
    // Brazo izquierdo (atrás, al costado).
    px(cx - 12, footY - 27, 4, 13, P.tunicDk); px(cx - 12, footY - 15, 4, 2, P.skin);
    // Cabeza.
    const hy = footY - 47;
    px(cx - 6, hy + 1, 13, 11, P.skin); px(cx - 6, hy + 1, 13, 1, P.skinDk); px(cx + 5, hy + 2, 1, 9, P.skinDk);
    px(cx - 5, hy + 4, 3, 2, P.out); px(cx + 3, hy + 4, 3, 2, P.out);            // ceño/ojos furiosos
    px(cx - 5, hy + 3, 4, 1, '#4a3620'); px(cx + 2, hy + 3, 4, 1, '#4a3620');    // cejas
    px(cx - 5, hy + 8, 12, 4, P.beard); px(cx - 3, hy + 7, 8, 1, P.beard);       // barba
    // Turbante amarillo (envoltura + nudo + cola).
    px(cx - 8, hy - 4, 16, 6, P.yel); px(cx - 8, hy - 4, 16, 2, P.yelHi); px(cx - 8, hy + 1, 16, 1, P.yelDk);
    px(cx - 9, hy - 1, 3, 5, P.yel); px(cx + 6, hy - 1, 3, 5, P.yel);
    px(cx + 6, hy - 3, 5, 3, P.yelDk); px(cx + 9, hy + 1, 3, 9, P.yel); px(cx + 9, hy + 1, 2, 9, P.yelHi);  // cola colgante
    // Brazo derecho + DAO (sable curvo). Idle: apoyado; Atk: alzado al frente.
    if (!atk) {
      px(cx + 8, footY - 30, 4, 14, P.tunic); px(cx + 9, footY - 18, 3, 3, P.skin);        // brazo bajo
      px(cx + 12, footY - 22, 2, 12, P.steel); px(cx + 12, footY - 22, 1, 12, P.steelHi);   // hoja hacia abajo
      px(cx + 11, footY - 11, 4, 2, P.gold);                                                // guarda
    } else {
      px(cx + 7, footY - 34, 5, 8, P.tunic); px(cx + 10, footY - 34, 3, 3, P.skin);         // brazo alzado
      for (let k = 0; k < 14; k++) px(cx + 12 + k, footY - 40 - Math.round(k * 0.4), 2, 2, k < 2 ? P.gold : P.steel);  // hoja al frente/arriba
      for (let k = 0; k < 14; k++) px(cx + 12 + k, footY - 40 - Math.round(k * 0.4), 1, 1, P.steelHi);
    }
    outlineCanvas(c, P.out);
    turbCache[pose] = c; return c;
  }

  // ── Aliado BESPOKE: Guan Yu 關羽 (美髯公 — cara rojiza, barbón, verde, guandao) ─
  const GY = { robe: '#3f6b45', robeHi: '#57895b', robeDk: '#294a30', scale: '#b98a3e', scaleHi: '#d8ab55', scaleDk: '#8a6329',
    skin: '#c06a44', skinDk: '#8f4a30', skinHi: '#d68a5c', beard: '#1c1409', beardHi: '#33240f',
    cap: '#2f5738', capHi: '#4a7351', capDk: '#1f3b26', pole: '#6e4326', poleHi: '#8f5c34',
    steel: '#cfd3da', steelHi: '#eef0f4', steelDk: '#7f858f', gold: '#d8b24a', sash: '#c49a3e', out: [16, 12, 7] };
  // Guandao (青龍偃月刀): asta de madera + hoja de media luna, collar dorado (吞口) y borla.
  function drawGuandao(g, hx, hy, ang) {
    g.save(); g.translate(hx, hy); g.rotate(ang); g.lineJoin = 'round';
    // Asta de madera.
    g.fillStyle = GY.pole; g.fillRect(-1.5, -30, 3, 50); g.fillStyle = GY.poleHi; g.fillRect(-1.5, -30, 1, 50);
    const by = -30;
    // Borla roja bajo el collar.
    g.fillStyle = '#a83b2b'; g.fillRect(-3.5, by + 4, 3, 8); g.fillStyle = '#7c281c'; g.fillRect(-3.5, by + 10, 3, 2);
    // Collar dorado (吞口) donde encaja la hoja.
    g.fillStyle = GY.gold; g.beginPath(); g.moveTo(-4, by + 2); g.lineTo(4, by + 2); g.lineTo(3, by - 3); g.lineTo(-3, by - 3); g.closePath(); g.fill();
    g.fillStyle = GY.steelHi; g.fillRect(-3, by - 3, 6, 1);
    // Hoja de media luna (filo convexo hacia -x, punta afilada arriba).
    const grad = g.createLinearGradient(-16, by - 12, 3, by - 12); grad.addColorStop(0, GY.steelHi); grad.addColorStop(0.5, GY.steel); grad.addColorStop(1, GY.steelDk);
    g.fillStyle = grad; g.beginPath();
    g.moveTo(2, by - 2);                                 // base del lomo (junto al asta)
    g.quadraticCurveTo(1, by - 12, -2, by - 23);        // lomo cóncavo → punta
    g.quadraticCurveTo(-11, by - 19, -16, by - 8);      // punta → filo convexo (sale a la izq)
    g.quadraticCurveTo(-15, by - 1, -6, by - 2);        // filo inferior curva de vuelta
    g.closePath(); g.fill();
    // Filo brillante a lo largo del corte.
    g.strokeStyle = GY.steelHi; g.lineWidth = 1.4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-2, by - 23); g.quadraticCurveTo(-11, by - 19, -16, by - 8); g.quadraticCurveTo(-15, by - 1, -6, by - 2); g.stroke();
    // Pequeño espolón en el lomo.
    g.fillStyle = GY.steel; g.beginPath(); g.moveTo(1, by - 10); g.lineTo(7, by - 9); g.lineTo(1, by - 6); g.closePath(); g.fill();
    g.restore();
  }
  const gyCache = {};
  function guanyu(pose) {
    if (gyCache[pose]) return gyCache[pose];
    const w = 56, h = 84, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    const px = (x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); };
    const P = GY, atk = pose === 'atk', cx = 32, footY = 78;
    if (!atk) drawGuandao(g, cx - 17, footY - 24, 0);   // idle: asta erguida por detrás
    // Piernas + botas.
    px(cx - 6, footY - 13, 5, 13, P.robeDk); px(cx + 1, footY - 13, 5, 13, P.robeDk);
    px(cx - 7, footY - 3, 7, 3, '#20160c'); px(cx + 1, footY - 3, 7, 3, '#20160c');
    // Túnica verde (falda ancha).
    for (let i = 0; i < 20; i++) { const t = i / 19, hw = Math.round(8 + 4 * t), y = footY - 31 + i; px(cx - hw, y, hw * 2, 1, P.robe); px(cx - hw, y, Math.max(1, Math.round(hw * 0.5)), 1, P.robeHi); px(cx + Math.round(hw * 0.35), y, hw - Math.round(hw * 0.35), 1, P.robeDk); }
    // Coraza escamada (pecho) + borde dorado.
    for (let r = 0; r < 11; r += 2) { px(cx - 8, footY - 30 + r, 16, 2, P.scale); px(cx - 8, footY - 30 + r, 16, 1, P.scaleHi); for (let s = -7; s < 8; s += 3) px(cx + s, footY - 30 + r, 1, 1, P.scaleDk); }
    px(cx - 8, footY - 31, 16, 1, P.gold);
    // Faja dorada.
    px(cx - 9, footY - 18, 18, 3, P.sash); px(cx - 9, footY - 18, 18, 1, P.gold); px(cx - 9, footY - 15, 18, 1, '#8a6329');
    // Hombreras.
    px(cx - 12, footY - 31, 6, 5, P.scaleDk); px(cx - 12, footY - 31, 6, 1, P.gold);
    px(cx + 6, footY - 31, 6, 5, P.scaleDk); px(cx + 6, footY - 31, 6, 1, P.gold);
    // Brazo trasero (derecha).
    px(cx + 7, footY - 29, 4, 13, P.robe); px(cx + 8, footY - 17, 3, 2, P.skin);
    // Cabeza (cara rojiza).
    const hy = footY - 46;
    px(cx - 5, hy + 1, 12, 11, P.skin); px(cx - 5, hy + 1, 12, 1, P.skinHi); px(cx + 5, hy + 2, 1, 9, P.skinDk); px(cx - 5, hy + 1, 1, 10, P.skinDk);
    px(cx - 4, hy + 4, 3, 1, '#3a2213'); px(cx + 2, hy + 4, 3, 1, '#3a2213');   // cejas (gusano de seda)
    px(cx - 4, hy + 5, 2, 1, P.out); px(cx + 2, hy + 5, 2, 1, P.out);           // ojos fénix
    // Barba larga (美髯公) — cae por el pecho.
    px(cx - 5, hy + 9, 11, 2, P.beard); px(cx - 4, hy + 11, 10, 4, P.beard); px(cx - 3, hy + 15, 8, 5, P.beard);
    px(cx - 2, hy + 20, 6, 5, P.beard); px(cx - 1, hy + 25, 4, 3, P.beardHi); px(cx - 4, hy + 11, 2, 8, P.beardHi);
    // Gorro verde (綸巾) + adorno.
    px(cx - 6, hy - 4, 13, 6, P.cap); px(cx - 6, hy - 4, 13, 2, P.capHi); px(cx - 6, hy + 1, 13, 1, P.capDk);
    px(cx - 5, hy - 7, 5, 3, P.cap); px(cx + 1, hy - 7, 5, 3, P.cap); px(cx - 1, hy - 8, 3, 3, P.gold);
    // Brazo delantero + guandao.
    if (!atk) { px(cx - 11, footY - 28, 5, 4, P.robe); px(cx - 15, footY - 24, 5, 3, P.robe); px(cx - 17, footY - 21, 4, 3, P.skin); }
    else {
      px(cx - 11, footY - 33, 6, 4, P.robe); px(cx - 16, footY - 35, 5, 3, P.robe); px(cx - 19, footY - 36, 4, 3, P.skin);
      drawGuandao(g, cx - 19, footY - 37, -1.15);   // atk: guandao alzado y llevado al frente
    }
    outlineCanvas(c, P.out);
    gyCache[pose] = c; return c;
  }

  // ── Layout de la escena ──────────────────────────────────────────────────────
  function layout() {
    const gy = H * 0.80;
    enemy.ax = W * 0.24; enemy.ay = gy; enemy.th = H * 0.42;
    enemy.ox = 0; enemy.oy = 0; enemy.flash = 0; enemy.deadA = 1; enemy.hitT = 0;
    party.forEach((u, i) => { u.ax = W * 0.66 + i * (W * 0.11); u.ay = gy - i * (H * 0.015); u.th = H * (SHEETS[u.sprite] ? SHEETS[u.sprite].thf : 0.26); u.ox = 0; u.oy = 0; u.flash = 0; u.deadA = 1; u.hitT = 0; });
  }

  // ── Fondo horneado una vez ───────────────────────────────────────────────────
  function bakeBg() {
    bg = document.createElement('canvas'); bg.width = cv.width; bg.height = cv.height;
    const g = bg.getContext('2d'); const w = bg.width, h = bg.height;
    // Fondo pintado: campamento Turbante Amarillo (si ya cargó la imagen).
    if (bgImg && bgImg.complete && bgImg.naturalWidth) {
      const ir = bgImg.naturalWidth / bgImg.naturalHeight, cr = w / h; let dw, dh, dx, dy;
      if (cr > ir) { dw = w; dh = w / ir; dx = 0; dy = (h - dh) * 0.5; } else { dh = h; dw = h * ir; dy = 0; dx = (w - dw) * 0.5; }
      g.imageSmoothingEnabled = true; g.drawImage(bgImg, dx, dy, dw, dh);
      g.fillStyle = 'rgba(10,8,4,.14)'; g.fillRect(0, 0, w, h);                                  // leve oscurecido
      let gr = g.createRadialGradient(w / 2, h * 0.46, h * 0.28, w / 2, h * 0.55, h * 0.95);      // viñeta
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.5)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      gr = g.createLinearGradient(0, h * 0.62, 0, h); gr.addColorStop(0, 'rgba(6,5,2,0)'); gr.addColorStop(1, 'rgba(6,5,2,.42)');
      g.fillStyle = gr; g.fillRect(0, h * 0.62, w, h * 0.38);                                     // penumbra al pie
      bg._photo = true;
      bg._torches = [{ x: (dx + dw * 0.365) / dpr, y: (dy + dh * 0.665) / dpr }, { x: (dx + dw * 0.605) / dpr, y: (dy + dh * 0.665) / dpr }];
      return;
    }
    // Fallback procedural (mazmorra) mientras carga / si falla la imagen.
    bg._photo = false;
    let grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#2b3527'); grad.addColorStop(0.45, '#20281d'); grad.addColorStop(1, '#0e0f0a');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    // muro del fondo con arco
    g.fillStyle = 'rgba(40,44,32,.55)'; g.fillRect(w * 0.30, h * 0.10, w * 0.40, h * 0.55);
    g.fillStyle = 'rgba(12,13,9,.85)';
    g.beginPath(); const ax = w * 0.42, aw = w * 0.16, ay = h * 0.62, ah = h * 0.34;
    g.moveTo(ax, ay); g.lineTo(ax, ay - ah * 0.5); g.arc(ax + aw / 2, ay - ah * 0.5, aw / 2, Math.PI, 0); g.lineTo(ax + aw, ay); g.closePath(); g.fill();
    // suelo en perspectiva
    const fy = h * 0.66; grad = g.createLinearGradient(0, fy, 0, h); grad.addColorStop(0, '#3a3a30'); grad.addColorStop(1, '#1a1a14');
    g.fillStyle = grad; g.fillRect(0, fy, w, h - fy);
    g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = Math.max(1, dpr);
    for (let i = -6; i <= 6; i++) { g.beginPath(); g.moveTo(w / 2 + i * w * 0.05, fy); g.lineTo(w / 2 + i * w * 0.22, h); g.stroke(); }
    for (let j = 1; j <= 5; j++) { const yy = fy + (h - fy) * (j / 5) * (j / 5); g.beginPath(); g.moveTo(0, yy); g.lineTo(w, yy); g.stroke(); }
    // pilares
    g.fillStyle = 'rgba(28,30,22,.9)';
    [0.12, 0.86].forEach(px => { g.fillRect(w * px - w * 0.03, h * 0.05, w * 0.06, h * 0.6); });
    // viñeta
    grad = g.createRadialGradient(w / 2, h * 0.45, h * 0.2, w / 2, h * 0.5, h * 0.85);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,.6)'); g.fillStyle = grad; g.fillRect(0, 0, w, h);
    bg._torches = [{ x: w * 0.12, y: h * 0.30 }, { x: w * 0.86, y: h * 0.30 }];
  }

  // ── Partículas / números ─────────────────────────────────────────────────────
  function floater(x, y, text, col, big) { floaters.push({ x: x * dpr, y: y * dpr, vy: -0.55 * dpr, life: 0, max: 1100, text, col, size: (big ? 34 : 24) * dpr }); }
  function burst(x, y, col, n, spd) { for (let i = 0; i < n; i++) { const a = rnd(0, 6.28), s = rnd(0.3, 1) * (spd || 1) * dpr; parts.push({ x: x * dpr, y: y * dpr, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.3 * dpr, life: 0, max: rnd(400, 800), col, r: rnd(1.5, 3.5) * dpr }); } }
  function ember() { parts.push({ x: rnd(0, W) * dpr, y: H * dpr, vx: rnd(-0.1, 0.1) * dpr, vy: rnd(-0.35, -0.15) * dpr, life: 0, max: rnd(2200, 4200), col: 'rgba(230,150,60,', r: rnd(1, 2.2) * dpr, ember: true }); }
  function slash(x, y, col) { slashes.push({ x: x * dpr, y: y * dpr, t0: now(), dur: 260, col: col || 'rgba(255,255,255,' }); }

  // ── Tween sencillo ───────────────────────────────────────────────────────────
  function tween(dur, on, done) { tweens.push({ t0: now(), dur, on, done }); }
  function wait(ms, cb) { tween(ms, null, cb); }

  // ── Posición de dibujo de una unidad (px CSS) ────────────────────────────────
  const ux = (u) => u.ax + u.ox;
  const uy = (u) => u.ay + u.oy;

  // ── Bucle de render ──────────────────────────────────────────────────────────
  function frame() {
    const tt = now(); const dt = Math.min(50, tt - (frame._p || tt)); frame._p = tt; t = tt;
    // tweens
    for (let i = tweens.length - 1; i >= 0; i--) { const tw = tweens[i]; const p = clamp((tt - tw.t0) / tw.dur, 0, 1); if (tw.on) tw.on(p); if (p >= 1) { tweens.splice(i, 1); if (tw.done) tw.done(); } }
    // ambiente
    if (Math.random() < 0.28) ember();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    const sh = shake > 0.3 ? shake : 0; const sx = (Math.random() * 2 - 1) * sh * dpr, sy = (Math.random() * 2 - 1) * sh * dpr; shake *= 0.86;
    ctx.setTransform(1, 0, 0, 1, sx, sy);
    ctx.drawImage(bg, 0, 0);
    // antorchas (llama parpadeante)
    bg._torches.forEach((to, k) => {
      const fl = 0.7 + Math.sin(tt * 0.01 + k) * 0.15 + Math.random() * 0.1;
      const gx = to.x * dpr, gy = to.y * dpr, r = (bg._photo ? 44 : 60) * dpr * fl;
      const rg = ctx.createRadialGradient(gx, gy, 0, gx, gy, r); rg.addColorStop(0, 'rgba(255,170,70,.5)'); rg.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(gx, gy, r, 0, 6.283); ctx.fill();
      if (!bg._photo) { ctx.fillStyle = 'rgba(255,190,90,.9)'; ctx.beginPath(); ctx.ellipse(gx, gy, 4 * dpr, (9 + Math.sin(tt * 0.02 + k) * 2) * dpr, 0, 0, 6.283); ctx.fill(); }
    });
    // partículas por detrás
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life += dt; if (p.life >= p.max) { parts.splice(i, 1); continue; } p.x += p.vx * dt * 0.06; p.y += p.vy * dt * 0.06; const a = 1 - p.life / p.max; ctx.fillStyle = p.ember ? (p.col + (a * 0.8) + ')') : p.col; ctx.globalAlpha = p.ember ? 1 : a; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (p.ember ? 1 : a + 0.3), 0, 6.283); ctx.fill(); }
    ctx.globalAlpha = 1;
    // unidades: enemigo primero (fondo), luego aliados
    drawUnit(enemy); party.forEach(drawUnit);
    // proyectiles
    for (let i = projs.length - 1; i >= 0; i--) { const pr = projs[i]; const p = clamp((tt - pr.t0) / pr.dur, 0, 1); const x = lerp(pr.x0, pr.x1, p) * dpr, y = (lerp(pr.y0, pr.y1, p) - Math.sin(p * 3.14) * 26) * dpr; drawProj(pr, x, y, p); if (p >= 1) { projs.splice(i, 1); if (pr.onHit) pr.onHit(); } }
    // cortes de sable (crescent)
    for (let i = slashes.length - 1; i >= 0; i--) { const s = slashes[i]; const p = clamp((tt - s.t0) / s.dur, 0, 1); if (p >= 1) { slashes.splice(i, 1); continue; } ctx.save(); ctx.globalAlpha = 1 - p; ctx.strokeStyle = s.col + (1 - p) + ')'; ctx.lineWidth = (7 - 5 * p) * dpr; ctx.lineCap = 'round'; const r = (18 + p * 30) * dpr, a0 = -1.0 + p * 0.5; ctx.beginPath(); ctx.arc(s.x, s.y, r, a0, a0 + 1.7); ctx.stroke(); ctx.restore(); }
    // números flotantes (encima de todo)
    for (let i = floaters.length - 1; i >= 0; i--) { const f = floaters[i]; f.life += dt; if (f.life >= f.max) { floaters.splice(i, 1); continue; } f.y += f.vy * dt * 0.06; f.vy += 0.004 * dpr * dt * 0.06; const a = f.life > f.max * 0.7 ? 1 - (f.life - f.max * 0.7) / (f.max * 0.3) : 1; ctx.globalAlpha = a; ctx.font = `900 ${f.size}px 'Cinzel Decorative',serif`; ctx.textAlign = 'center'; ctx.lineWidth = 4 * dpr; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.strokeText(f.text, f.x, f.y); ctx.fillStyle = f.col; ctx.fillText(f.text, f.x, f.y); }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }
  function drawSaber(w) { ctx.save(); ctx.translate(-w * 0.30, -w * 0.9); ctx.rotate(-0.5); ctx.fillStyle = '#d8b24a'; ctx.fillRect(-2 * dpr, -2 * dpr, 6 * dpr, 4 * dpr); ctx.strokeStyle = '#eef1f6'; ctx.lineWidth = 3 * dpr; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(2 * dpr, 0); ctx.quadraticCurveTo(-16 * dpr, -7 * dpr, -32 * dpr, -1 * dpr); ctx.stroke(); ctx.restore(); }
  function drawBow(h) { ctx.save(); ctx.translate(-h * 0.30, -h * 0.55); const r = h * 0.32; ctx.strokeStyle = '#8a5a2c'; ctx.lineWidth = 3 * dpr; ctx.beginPath(); ctx.arc(0, 0, r, -1.1, 1.1); ctx.stroke(); ctx.strokeStyle = 'rgba(240,240,220,.6)'; ctx.lineWidth = 1 * dpr; ctx.beginPath(); ctx.moveTo(Math.cos(-1.1) * r, Math.sin(-1.1) * r); ctx.lineTo(Math.cos(1.1) * r, Math.sin(1.1) * r); ctx.stroke(); ctx.restore(); }
  // Aliado animado desde spritesheet (reposo = frame 0; ataque = clip 0→60 estirado a la duración de la acción).
  function drawSheet(u) {
    const A = SHEETS[u.sprite]; let fi = 0;
    if (u._atk && u._animT0) { const p = clamp((now() - u._animT0) / (u._animDur || 800), 0, 1); fi = Math.min(A.count - 1, Math.floor(p * A.count)); }
    const col = fi % A.cols, row = Math.floor(fi / A.cols);
    const k = (u.th * dpr) / A.charH;
    const bob = u._atk ? 0 : Math.sin(t * 0.004 + 1) * 2 * dpr;
    const fx = ux(u) * dpr, fy = uy(u) * dpr + bob;
    const dW = A.cellW * k, dH = A.cellH * k, dx = fx - A.pivotX * k, dy = fy - A.feetY * k;
    ctx.save(); ctx.globalAlpha = u.deadA;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(fx, fy, dW * 0.20, dH * 0.028, 0, 0, 6.283); ctx.fill();
    if (u._atk && u._cast) { const rg = ctx.createRadialGradient(fx, fy - dH * 0.42, 0, fx, fy - dH * 0.42, dW * 0.62); rg.addColorStop(0, u._cast); rg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(fx, fy - dH * 0.42, dW * 0.62, 0, 6.283); ctx.fill(); }
    if (u.flash > 0.02) ctx.filter = `brightness(${1 + u.flash * 4})`;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(A.img, col * A.cellW, row * A.cellH, A.cellW, A.cellH, dx, dy, dW, dH);
    ctx.filter = 'none'; ctx.restore(); u.flash *= 0.82;
  }
  function drawUnit(u) {
    if (u.deadA <= 0.01) return;
    if (sheetReady(u)) { drawSheet(u); return; }
    let img, walking;
    if (u.foe) { img = turbante(u._atk ? 'atk' : 'idle'); walking = false; }
    else if (u.sprite === 'guanyu') { img = guanyu(u._atk ? 'atk' : 'idle'); walking = false; }
    else { const fr = frames(u); walking = Math.abs(u.ox) > 1 && !u._atk; img = fr[walking ? (Math.floor(t * 0.012) % 4) : 0]; }
    const th = u.th * dpr, scl = th / img.height, w = img.width * scl, h = th;
    const bob = u._atk ? 0 : Math.sin(t * 0.004 + (u.foe ? 0 : 1)) * 2 * dpr;
    const x = ux(u) * dpr, y = uy(u) * dpr + bob;
    ctx.save(); ctx.globalAlpha = u.deadA;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, y, w * 0.32, h * 0.06, 0, 0, 6.283); ctx.fill();
    if (!u.foe && u._atk && u._cast) { const rg = ctx.createRadialGradient(x, y - h * 0.5, 0, x, y - h * 0.5, w * 0.95); rg.addColorStop(0, u._cast); rg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y - h * 0.5, w * 0.95, 0, 6.283); ctx.fill(); }
    const lean = u._atk ? (u.foe ? 0.13 : -0.16) : 0, sc = u._atk ? 1.06 : 1;
    ctx.translate(x, y); ctx.rotate(lean); ctx.scale(sc, sc);
    let filt = ''; if (u.flash > 0.02) filt = `brightness(${1 + u.flash * 4})`; else if (u.foe && u.roto) filt = 'grayscale(.65) brightness(.8)';
    if (filt) ctx.filter = filt;
    ctx.imageSmoothingEnabled = false; ctx.drawImage(img, -w / 2, -h, w, h); ctx.filter = 'none';
    if (!u.foe && u._atk && !u.sprite) { if (u._wcat === 'melee') drawSaber(w); else if (u._wcat === 'arrow') drawBow(h); }
    ctx.restore();
    u.flash *= 0.82;
  }
  function drawProj(pr, x, y, p) {
    ctx.save();
    if (pr.kind === 'arrow') { ctx.strokeStyle = '#e9d9a6'; ctx.lineWidth = 3 * dpr; const dx = (pr.x1 - pr.x0), dy = (pr.y1 - pr.y0), l = Math.hypot(dx, dy) || 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dx / l * 16 * dpr, y - dy / l * 16 * dpr); ctx.stroke(); }
    else { const col = pr.col || '#ff8a3c'; const rg = ctx.createRadialGradient(x, y, 0, x, y, 12 * dpr); rg.addColorStop(0, '#fff'); rg.addColorStop(0.4, col); rg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, 12 * dpr, 0, 6.283); ctx.fill(); }
    ctx.restore();
  }

  // ── Daño / rotura (un golpe) ─────────────────────────────────────────────────
  function golpeUno(tipo, power) {
    const esDebil = enemy.weak.indexOf(tipo) >= 0; let broke = false;
    if (esDebil) { enemy.revelado[tipo] = true; if (!enemy.roto && enemy.shield > 0) { enemy.shield--; if (enemy.shield === 0) { broke = true; enemy.roto = true; enemy.rotoTurnos = 1; } } }
    const mult = (enemy.roto ? 1.6 : 1) * (esDebil ? 1.3 : 0.7);
    const dmg = Math.max(1, Math.round(power * mult * rnd(0.92, 1.08)));
    enemy.hp = Math.max(0, enemy.hp - dmg);
    return { dmg, esDebil, broke };
  }
  function impactoEnemigo(r) {
    enemy.flash = 1; enemy.ox = (enemy.ox || 0) - 6; tween(240, (p) => { enemy.ox = -6 * (1 - easeOut(p)); }); shake = Math.max(shake, r.broke ? 9 : 4);
    const fx = ux(enemy), fy = uy(enemy) - enemy.th * 0.7;
    floater(fx + rnd(-14, 14), fy, String(r.dmg), r.esDebil ? '#ffcf5c' : '#f3ece0', r.esDebil || r.broke);
    burst(fx, fy, r.esDebil ? 'rgba(255,200,90,' : 'rgba(230,225,210,', r.broke ? 22 : 8, r.broke ? 2 : 1);
    if (r.broke) { floater(fx, fy - 26, '¡ROTO!', '#ff6a58', true); burst(fx, uy(enemy) - enemy.th * 0.5, 'rgba(120,180,220,', 26, 2.2); }
  }

  // ── Ejecutar acción del jugador ──────────────────────────────────────────────
  function ejecutar(u, action) {
    if (busy || over || actual() !== u) return;
    const boost = sel.boost | 0;
    if (action.sp && u.sp < action.sp) { log(`<b>${u.name}</b> no tiene SP para ${action.name}.`); return; }
    if (action.sp) u.sp -= action.sp;
    if (boost > 0) u.bp = Math.max(0, u.bp - boost);
    busy = true; u.def = false; u._atk = true; u._animT0 = now(); u._animDur = 800; renderMenu();

    if (action.defend) { u._atk = false; u.def = true; u.sp = Math.min(u.maxSp, u.sp + 4); log(`<b>${u.name}</b> se pone en guardia.`); floater(ux(u), uy(u) - u.th, 'Guardia', '#7fb6e0'); return finTurno(360); }
    if (action.heal) {
      u._cast = 'rgba(140,210,110,.5)';
      const target = partyAlive().slice().sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0] || u;
      const heal = Math.round(action.heal * (1 + boost * 0.5));
      const anim = !!u.sprite; if (anim) u._animDur = 950;
      const applyAt = anim ? Math.round(u._animDur * 0.80) : 220;   // el efecto ocurre al final del gesto
      if (!anim) tween(260, (p) => { u.oy = -10 * Math.sin(p * 3.14); }, () => { u.oy = 0; });   // sin saltito si tiene animación propia
      wait(applyAt, () => { target.hp = Math.min(target.maxHp, target.hp + heal); target.flash = 0.7; burst(ux(target), uy(target) - target.th * 0.5, 'rgba(140,210,110,', 16, 1.4); floater(ux(target), uy(target) - target.th, '+' + heal, '#8ed16f', true); log(`<b>${u.name}</b> cura a <b>${target.name}</b> (+${heal} PV).`); renderParty(); });
      return finTurno(anim ? applyAt + 240 : 760);
    }
    // Ataque (melee / flecha / magia)
    const cat = TIPOS[action.type] ? TIPOS[action.type].cat : 'melee';
    const hits = (action.hits || 1) + boost;
    const t2 = TIPOS[action.type];
    u._wcat = cat === 'melee' ? 'melee' : (cat === 'arrow' ? 'arrow' : null);
    if (cat === 'magic') u._cast = (t2 ? t2.col : '#ff8a3c') + '99';
    let totalDmg = 0, rompio = false;
    const doHit = () => { const r = golpeUno(action.type, action.power); totalDmg += r.dmg; if (r.broke) rompio = true; impactoEnemigo(r); if (cat === 'melee') slash(ux(enemy), uy(enemy) - enemy.th * 0.55, r.esDebil ? 'rgba(255,210,110,' : 'rgba(255,255,255,'); };
    const resumen = () => { log(`<b>${u.name}</b> · ${action.name} 〔${t2 ? t2.zh : '·'}〕 → ${totalDmg} de daño${rompio ? ' · <span class="hcb-break">¡ESCUDO ROTO!</span>' : ''}`); renderParty(); };

    if (cat === 'melee') {
      u._animDur = 230 + 150 * hits + 340;
      const dx = (enemy.ax - u.ax) * 0.68;
      tween(230, (p) => { u.ox = dx * easeOut(p); }, () => {
        let done = 0; for (let i = 0; i < hits; i++) wait(150 * i, () => { doHit(); if (++done === hits) { resumen(); tween(300, (p) => { u.ox = dx * (1 - easeInOut(p)); }, () => { u.ox = 0; }); } });
      });
      return finTurno(230 + 150 * hits + 340);
    }
    // ranged / magic: proyectil(es). Con animación propia NO hay saltito (se queda en el sitio) y el
    // disparo se retrasa para que salga en el barrido final y el impacto coincida con el fin del clip.
    const anim = !!u.sprite;
    if (!anim) tween(220, (p) => { u.oy = -8 * Math.sin(p * 3.14); }, () => { u.oy = 0; });
    if (anim) u._animDur = 950;
    const projDur = anim ? 200 : 300;
    const launch = anim ? Math.round(u._animDur * 0.80) : 0;   // ~frame 49: momento del conjuro
    const gap = anim ? 110 : 130;
    let done = 0;
    for (let i = 0; i < hits; i++) wait(launch + gap * i, () => {
      projs.push({ t0: now(), dur: projDur, x0: ux(u), y0: uy(u) - u.th * 0.55, x1: ux(enemy), y1: uy(enemy) - enemy.th * 0.55, kind: cat === 'arrow' ? 'arrow' : 'orb', col: t2 ? t2.col : '#ff8a3c', onHit: () => { doHit(); if (++done === hits) resumen(); } });
    });
    return finTurno(launch + gap * (hits - 1) + projDur + 140);
  }
  function finTurno(ms) { wait(ms + 120, () => { enemy._atk = false; party.forEach(x => { x._atk = false; x._wcat = null; x._cast = null; x._animT0 = 0; }); busy = false; avanzar(); }); }

  // ── Turno enemigo ────────────────────────────────────────────────────────────
  function turnoEnemigo() {
    busy = true; renderMenu();
    if (enemy.roto) { enemy.rotoTurnos--; log(`<b>${enemy.name}</b> está aturdido y no puede actuar.`); floater(ux(enemy), uy(enemy) - enemy.th, 'Aturdido', '#bcd8ec'); if (enemy.rotoTurnos <= 0) { enemy.roto = false; enemy.shield = enemy.maxShield; } return finTurno(780); }
    const vivos = partyAlive(); const target = vivos[ri(0, vivos.length - 1)];
    enemy._atk = true;
    const dx = (target.ax - enemy.ax) * 0.7;
    tween(260, (p) => { enemy.ox = dx * easeOut(p); }, () => {
      let dmg = ri(enemy.atk[0], enemy.atk[1]); if (target.def) dmg = Math.round(dmg * 0.5);
      target.hp = Math.max(0, target.hp - dmg); target.flash = 1; shake = Math.max(shake, 5);
      slash(ux(target), uy(target) - target.th * 0.5, 'rgba(255,180,120,');
      target.ox = 8; tween(240, (p) => { target.ox = 8 * (1 - easeOut(p)); });
      floater(ux(target), uy(target) - target.th, String(dmg), '#ff6a58', true); burst(ux(target), uy(target) - target.th * 0.5, 'rgba(220,80,70,', 8, 1);
      log(`<b>${enemy.name}</b> golpea a <b>${target.name}</b> · ${dmg} de daño${target.def ? ' (en guardia)' : ''}.`);
      if (!alive(target)) { target.deadA = 1; tween(500, (p) => { target.deadA = 1 - p; }); }
      renderParty(); tween(320, (p) => { enemy.ox = dx * (1 - easeInOut(p)); }, () => { enemy.ox = 0; });
    });
    finTurno(260 + 340);
  }

  function avanzar() {
    if (fin()) return;
    idx++; if (idx >= orden.length) { ronda++; calcOrden(); }
    while (orden[idx] && !alive(orden[idx])) idx++;
    if (idx >= orden.length) { ronda++; calcOrden(); }
    const u = actual();
    if (u.foe) { renderAll(); setTimeout(turnoEnemigo, 420); }
    else { u.bp = Math.min(5, u.bp + 1); sel = { boost: 0 }; renderAll(); }
  }
  function fin() {
    if (enemy.hp <= 0 && !over) { over = true; enemy.deadA = 1; tween(700, (p) => { enemy.deadA = 1 - p; enemy.oy = 20 * p; }); renderAll(); finPantalla(true); return true; }
    if (!partyAlive().length && !over) { over = true; renderAll(); finPantalla(false); return true; }
    return false;
  }

  // ── UI DOM (timeline / party / menú / registro) ──────────────────────────────
  function bar(v, mx, cls) { return `<div class="hcb-bar ${cls}"><span style="width:${clamp(v / mx * 100, 0, 100)}%"></span></div>`; }
  function bpPips(n) { let s = ''; for (let i = 0; i < 5; i++) s += `<i class="hcb-bp${i < n ? ' on' : ''}"></i>`; return s; }
  function renderTimeline() {
    const chip = (u) => `<div class="hcb-tl-chip${u === actual() ? ' cur' : ''}${u.foe ? ' foe' : ''}" title="${u.name}"><span>${u.foe ? '賊' : u.name[0]}</span></div>`;
    elTimeline.innerHTML = `<div class="hcb-tl-lbl">Ronda ${ronda} · orden</div><div class="hcb-tl-row">${orden.map(chip).join('')}</div>`;
  }
  function weakPips() { return enemy.weak.map(t2 => enemy.revelado[t2] ? `<span class="hcb-wk on" title="${TIPOS[t2].es}">${TIPOS[t2].zh}</span>` : `<span class="hcb-wk">?</span>`).join(''); }
  function renderFoeHud() {
    const hud = root.querySelector('[data-foehud]'); if (!hud) return;
    hud.innerHTML = `<div class="hcb-foe-top"><b>${enemy.name}</b> <span class="hcb-foe-zh">${enemy.zh}</span></div>
      <div class="hcb-foe-row"><span class="hcb-shield${enemy.roto ? ' broken' : ''}"><span class="hcb-shield-ic">🛡</span><b>${enemy.roto ? '¡ROTO!' : enemy.shield}</b></span>
      <span class="hcb-weak"><span class="hcb-weak-lbl">Debilidades</span> ${weakPips()}</span></div>
      ${bar(enemy.hp, enemy.maxHp, 'hp')}<div class="hcb-foe-hp">${enemy.hp}/${enemy.maxHp}</div>`;
  }
  function renderParty() {
    if (!elParty) return;
    elParty.innerHTML = party.map(u => `<div class="hcb-pc${!alive(u) ? ' dead' : ''}${u === actual() ? ' cur' : ''}">
      <div class="hcb-pc-h"><b>${u.name}</b> <span class="hcb-pc-rol">${u.rol}</span>${u.def ? ' <span class="hcb-guard">guardia</span>' : ''}</div>
      <div class="hcb-pc-row"><span class="hcb-pc-k">PV</span>${bar(u.hp, u.maxHp, 'hp')}<span class="hcb-pc-v">${u.hp}/${u.maxHp}</span></div>
      <div class="hcb-pc-row"><span class="hcb-pc-k">SP</span>${bar(u.sp, u.maxSp, 'sp')}<span class="hcb-pc-v">${u.sp}/${u.maxSp}</span></div>
      <div class="hcb-pc-bp">BP ${bpPips(u.bp)}</div></div>`).join('');
  }
  function renderMenu() {
    const u = actual();
    if (over) { elMenu.innerHTML = ''; return; }
    if (u.foe) { elMenu.innerHTML = `<div class="hcb-menu-wait">Turno de <b>${enemy.name}</b>…</div>`; return; }
    if (busy) { elMenu.innerHTML = `<div class="hcb-menu-wait">…</div>`; return; }
    const maxB = Math.min(3, u.bp), wpn = TIPOS[u.wpn];
    const boostRow = `<div class="hcb-boost"><span class="hcb-boost-lbl">Boost</span>${[0, 1, 2, 3].map(n => `<button class="hcb-boost-b${sel.boost === n ? ' on' : ''}${n > maxB ? ' dis' : ''}" data-boost="${n}"${n > maxB ? ' disabled' : ''}>${n === 0 ? '—' : '+' + n}</button>`).join('')}<span class="hcb-boost-hint">cada BP = +1 golpe</span></div>`;
    const btns = [`<button class="hcb-act atk" data-act="basic">Atacar<small>〔${wpn.zh}〕 ${wpn.es}</small></button>`]
      .concat(u.skills.map((s, i) => { const t2 = s.type === 'cura' ? { es: 'Cura', zh: '癒' } : TIPOS[s.type]; const noSp = u.sp < s.sp; return `<button class="hcb-act${noSp ? ' dis' : ''}" data-skill="${i}"${noSp ? ' disabled' : ''}>${s.name}<small>〔${t2.zh}〕 ${s.heal ? '+PV' : (s.hits > 1 ? s.hits + '× ' : '') + t2.es} · ${s.sp} SP</small></button>`; }))
      .concat([`<button class="hcb-act def" data-act="defend">Defender<small>−50% daño</small></button>`]);
    elMenu.innerHTML = `<div class="hcb-menu-who">Actúa <b>${u.name}</b></div>${boostRow}<div class="hcb-acts">${btns.join('')}</div>`;
  }
  function renderAll() { renderTimeline(); renderFoeHud(); renderParty(); renderMenu(); }

  function finPantalla(win) {
    setTimeout(() => {
      const ov = document.createElement('div'); ov.className = 'hcb-end';
      ov.innerHTML = `<div class="hcb-end-box ${win ? 'win' : 'lose'}"><div class="hcb-end-t">${win ? '¡Victoria!' : 'Derrota'}</div>
        <div class="hcb-end-s">${win ? 'La banda ha roto y abatido al enemigo.' : 'La banda ha caído. Volved más fuertes.'}</div>
        <button class="hcb-end-btn" data-restart>Combatir de nuevo</button></div>`;
      root.appendChild(ov); ov.querySelector('[data-restart]').addEventListener('click', () => { ov.remove(); start(); });
    }, 700);
  }

  function onClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.boost != null) { if (busy || over) return; sel.boost = +b.dataset.boost; renderMenu(); return; }
    if (busy || over) return; const u = actual(); if (!u || u.foe) return;
    if (b.dataset.act === 'basic') return ejecutar(u, { name: 'Atacar', type: u.wpn, hits: 1, power: 13, sp: 0 });
    if (b.dataset.act === 'defend') return ejecutar(u, { name: 'Defender', defend: true, sp: 0 });
    if (b.dataset.skill != null) return ejecutar(u, u.skills[+b.dataset.skill]);
  }

  function resize() {
    const r = elScene.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height || 300; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    layout(); bakeBg();
  }

  function start() {
    party = nuevaParty(); enemy = nuevoEnemigo(); ronda = 1; over = false; busy = false; logLines = []; sel = { boost: 0 };
    tweens.length = 0; floaters.length = 0; parts.length = 0; projs.length = 0; slashes.length = 0; shake = 0;
    calcOrden(); resize(); renderAll();
    log('Comienza la escaramuza. Descubre las debilidades del enemigo y rómpele el escudo.');
    const u = actual(); if (u.foe) setTimeout(turnoEnemigo, 700);
  }

  function init(container) {
    root = container;
    bgImg = new Image(); bgImg.onload = () => { if (cv) bakeBg(); }; bgImg.src = 'assets/img/bg-turbantes.jpg?v=1';
    Object.values(SHEETS).forEach(s => { s.img = new Image(); s.img.src = s.src; });
    root.innerHTML = `<div class="hcb">
      <div class="hcb-timeline" data-tl></div>
      <div class="hcb-scene" data-scene><canvas data-cv></canvas><div class="hcb-foehud" data-foehud></div></div>
      <div class="hcb-log" data-log></div>
      <div class="hcb-party" data-party></div>
      <div class="hcb-menu" data-menu></div>
    </div>`;
    elTimeline = root.querySelector('[data-tl]'); elScene = root.querySelector('[data-scene]');
    elParty = root.querySelector('[data-party]'); elMenu = root.querySelector('[data-menu]'); elLog = root.querySelector('[data-log]');
    cv = root.querySelector('[data-cv]'); ctx = cv.getContext('2d');
    root.addEventListener('click', onClick);
    window.addEventListener('resize', () => { if (cv) { const keep = bg; resize(); } });
    start();
    if (raf) cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
  }
  return { init };
})();
if (typeof window !== 'undefined') window.HacCombate = HacCombate;
