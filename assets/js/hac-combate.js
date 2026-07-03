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
      { id: 'g', name: 'Guan Yu', rol: 'Guerrero', aptitud: 'militar', aspecto: { robe: '#7a3b34', piel: 1, pelo: 0 },
        maxHp: 130, hp: 130, maxSp: 22, sp: 22, spd: 9, bp: 1, wpn: 'espada', def: false,
        skills: [ { name: 'Tajo doble', type: 'espada', sp: 6, hits: 2, power: 15 }, { name: 'Estocada', type: 'lanza', sp: 8, hits: 1, power: 30 } ] },
      { id: 'a', name: 'Huang Zhong', rol: 'Arquero', aptitud: 'militar', aspecto: { robe: '#4e6f8f', piel: 0, pelo: 2 },
        maxHp: 98, hp: 98, maxSp: 26, sp: 26, spd: 12, bp: 1, wpn: 'arco', def: false,
        skills: [ { name: 'Andanada', type: 'arco', sp: 7, hits: 3, power: 10 }, { name: 'Flecha ígnea', type: 'fuego', sp: 10, hits: 1, power: 26 } ] },
      { id: 'm', name: 'Zhuge Liang', rol: 'Estratega', aptitud: 'cultural', aspecto: { robe: '#7f9e6a', piel: 0, pelo: 0 },
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
  let cv, ctx, bg, W = 0, H = 0, dpr = 1, raf = 0, t = 0, shake = 0;
  const tweens = [], floaters = [], parts = [], projs = [];
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

  // ── Layout de la escena ──────────────────────────────────────────────────────
  function layout() {
    const gy = H * 0.80;
    enemy.ax = W * 0.24; enemy.ay = gy; enemy.th = H * 0.42;
    enemy.ox = 0; enemy.oy = 0; enemy.flash = 0; enemy.deadA = 1; enemy.hitT = 0;
    party.forEach((u, i) => { u.ax = W * 0.66 + i * (W * 0.11); u.ay = gy - i * (H * 0.015); u.th = H * 0.26; u.ox = 0; u.oy = 0; u.flash = 0; u.deadA = 1; u.hitT = 0; });
  }

  // ── Fondo (mazmorra) horneado una vez ────────────────────────────────────────
  function bakeBg() {
    bg = document.createElement('canvas'); bg.width = cv.width; bg.height = cv.height;
    const g = bg.getContext('2d'); const w = bg.width, h = bg.height;
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
      const gx = to.x * dpr, gy = to.y * dpr, r = 60 * dpr * fl;
      const rg = ctx.createRadialGradient(gx, gy, 0, gx, gy, r); rg.addColorStop(0, 'rgba(255,170,70,.5)'); rg.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(gx, gy, r, 0, 6.283); ctx.fill();
      ctx.fillStyle = 'rgba(255,190,90,.9)'; ctx.beginPath(); ctx.ellipse(gx, gy, 4 * dpr, (9 + Math.sin(tt * 0.02 + k) * 2) * dpr, 0, 0, 6.283); ctx.fill();
    });
    // partículas por detrás
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life += dt; if (p.life >= p.max) { parts.splice(i, 1); continue; } p.x += p.vx * dt * 0.06; p.y += p.vy * dt * 0.06; const a = 1 - p.life / p.max; ctx.fillStyle = p.ember ? (p.col + (a * 0.8) + ')') : p.col; ctx.globalAlpha = p.ember ? 1 : a; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (p.ember ? 1 : a + 0.3), 0, 6.283); ctx.fill(); }
    ctx.globalAlpha = 1;
    // unidades: enemigo primero (fondo), luego aliados
    drawUnit(enemy); party.forEach(drawUnit);
    // proyectiles
    for (let i = projs.length - 1; i >= 0; i--) { const pr = projs[i]; const p = clamp((tt - pr.t0) / pr.dur, 0, 1); const x = lerp(pr.x0, pr.x1, p) * dpr, y = (lerp(pr.y0, pr.y1, p) - Math.sin(p * 3.14) * 26) * dpr; drawProj(pr, x, y, p); if (p >= 1) { projs.splice(i, 1); if (pr.onHit) pr.onHit(); } }
    // números flotantes (encima de todo)
    for (let i = floaters.length - 1; i >= 0; i--) { const f = floaters[i]; f.life += dt; if (f.life >= f.max) { floaters.splice(i, 1); continue; } f.y += f.vy * dt * 0.06; f.vy += 0.004 * dpr * dt * 0.06; const a = f.life > f.max * 0.7 ? 1 - (f.life - f.max * 0.7) / (f.max * 0.3) : 1; ctx.globalAlpha = a; ctx.font = `900 ${f.size}px 'Cinzel Decorative',serif`; ctx.textAlign = 'center'; ctx.lineWidth = 4 * dpr; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.strokeText(f.text, f.x, f.y); ctx.fillStyle = f.col; ctx.fillText(f.text, f.x, f.y); }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }
  function drawUnit(u) {
    if (u.deadA <= 0.01) return;
    const fr = frames(u); const walking = Math.abs(u.ox) > 1;
    const img = fr[walking ? (Math.floor(t * 0.012) % 4) : 0];
    const th = u.th * dpr; const scl = th / img.height; const w = img.width * scl, h = th;
    const bob = walking ? 0 : Math.sin(t * 0.004 + (u.foe ? 0 : 1)) * 2 * dpr;
    const x = (ux(u)) * dpr, y = (uy(u)) * dpr + bob;
    ctx.save(); ctx.globalAlpha = u.deadA;
    // sombra
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, y, w * 0.32, h * 0.06, 0, 0, 6.283); ctx.fill();
    let filt = '';
    if (u.flash > 0.02) filt = `brightness(${1 + u.flash * 4})`;
    else if (u.foe && u.roto) filt = 'grayscale(.65) brightness(.8)';
    if (filt) ctx.filter = filt;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, x - w / 2, y - h, w, h);
    ctx.filter = 'none'; ctx.restore();
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
    busy = true; u.def = false; renderMenu();

    if (action.defend) { u.def = true; u.sp = Math.min(u.maxSp, u.sp + 4); log(`<b>${u.name}</b> se pone en guardia.`); floater(ux(u), uy(u) - u.th, 'Guardia', '#7fb6e0'); return finTurno(360); }
    if (action.heal) {
      const target = partyAlive().slice().sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0] || u;
      const heal = Math.round(action.heal * (1 + boost * 0.5));
      tween(260, (p) => { u.oy = -10 * Math.sin(p * 3.14); }, () => { u.oy = 0; });
      wait(220, () => { target.hp = Math.min(target.maxHp, target.hp + heal); target.flash = 0.7; burst(ux(target), uy(target) - target.th * 0.5, 'rgba(140,210,110,', 16, 1.4); floater(ux(target), uy(target) - target.th, '+' + heal, '#8ed16f', true); log(`<b>${u.name}</b> cura a <b>${target.name}</b> (+${heal} PV).`); renderParty(); });
      return finTurno(760);
    }
    // Ataque (melee / flecha / magia)
    const cat = TIPOS[action.type] ? TIPOS[action.type].cat : 'melee';
    const hits = (action.hits || 1) + boost;
    const t2 = TIPOS[action.type];
    let totalDmg = 0, rompio = false;
    const doHit = () => { const r = golpeUno(action.type, action.power); totalDmg += r.dmg; if (r.broke) rompio = true; impactoEnemigo(r); };
    const resumen = () => { log(`<b>${u.name}</b> · ${action.name} 〔${t2 ? t2.zh : '·'}〕 → ${totalDmg} de daño${rompio ? ' · <span class="hcb-break">¡ESCUDO ROTO!</span>' : ''}`); renderParty(); };

    if (cat === 'melee') {
      const dx = (enemy.ax - u.ax) * 0.68;
      tween(230, (p) => { u.ox = dx * easeOut(p); }, () => {
        let done = 0; for (let i = 0; i < hits; i++) wait(150 * i, () => { doHit(); if (++done === hits) { resumen(); tween(300, (p) => { u.ox = dx * (1 - easeInOut(p)); }, () => { u.ox = 0; }); } });
      });
      return finTurno(230 + 150 * hits + 340);
    }
    // ranged / magic: hop + proyectil(es)
    tween(220, (p) => { u.oy = -8 * Math.sin(p * 3.14); }, () => { u.oy = 0; });
    let done = 0;
    for (let i = 0; i < hits; i++) wait(130 * i, () => {
      projs.push({ t0: now(), dur: 300, x0: ux(u), y0: uy(u) - u.th * 0.55, x1: ux(enemy), y1: uy(enemy) - enemy.th * 0.55, kind: cat === 'arrow' ? 'arrow' : 'orb', col: t2 ? t2.col : '#ff8a3c', onHit: () => { doHit(); if (++done === hits) resumen(); } });
    });
    return finTurno(220 + 130 * hits + 300 + 120);
  }
  function finTurno(ms) { wait(ms + 120, () => { busy = false; avanzar(); }); }

  // ── Turno enemigo ────────────────────────────────────────────────────────────
  function turnoEnemigo() {
    busy = true; renderMenu();
    if (enemy.roto) { enemy.rotoTurnos--; log(`<b>${enemy.name}</b> está aturdido y no puede actuar.`); floater(ux(enemy), uy(enemy) - enemy.th, 'Aturdido', '#bcd8ec'); if (enemy.rotoTurnos <= 0) { enemy.roto = false; enemy.shield = enemy.maxShield; } return finTurno(780); }
    const vivos = partyAlive(); const target = vivos[ri(0, vivos.length - 1)];
    const dx = (target.ax - enemy.ax) * 0.7;
    tween(260, (p) => { enemy.ox = dx * easeOut(p); }, () => {
      let dmg = ri(enemy.atk[0], enemy.atk[1]); if (target.def) dmg = Math.round(dmg * 0.5);
      target.hp = Math.max(0, target.hp - dmg); target.flash = 1; shake = Math.max(shake, 5);
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
    tweens.length = 0; floaters.length = 0; parts.length = 0; projs.length = 0; shake = 0;
    calcOrden(); resize(); renderAll();
    log('Comienza la escaramuza. Descubre las debilidades del enemigo y rómpele el escudo.');
    const u = actual(); if (u.foe) setTimeout(turnoEnemigo, 700);
  }

  function init(container) {
    root = container;
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
