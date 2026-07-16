/* ═══════════════════════════════════════════════════════════════════════
   combate2.js — Combate por TURNOS (aspecto Sea of Stars), desde 0.
   ─────────────────────────────────────────────────────────────────────────
   · Escena orgánica: claro de tierra suave (sin damero); banda y enemigos
     desplegados de forma natural por el espacio, con variación de sitio/tamaño.
   · Combatientes = modelos procedurales HacChar (aspecto real).
   · Solo TU MECENAS vs 2-3 enemigos. SIEMPRE eliges objetivo (marcador claro),
     luego lanzas el golpe y timeas el/los impacto(s).
   · Ataques DINÁMICOS coreografiados por ARMA (motor de "moves"):
       espada → tajo doble (carrera, MULTI-HIT)   lanza → estocada (largo alcance)
       salto  → mandoble aéreo (SALTO)            arco  → andanada (3 flechas)
     Cada impacto tiene su ventana de TEMPO (multi-hit = varios "¡YA!").
   · Aislado: no toca la finca ni el beta de Octopath (combate.html/hac-combate.js).

   Depende de: HacUtil, HacChar.
   API: Combate.init(rootEl, cfg?)
   ═══════════════════════════════════════════════════════════════════════ */
const Combate = (function () {
  'use strict';

  // ── Utilidades ──────────────────────────────────────────────────────────
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ri = (a, b) => Math.floor(rnd(a, b + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeIn = (t) => t * t;
  const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  const CHAR_W = 40, CHAR_H = 56, CHAR_FEET = 51, SPR_SCALE = 4;

  // ── Estado global ─────────────────────────────────────────────────────────
  let root, cfg, cv, ctx, W = 0, H = 0, dpr = 1, demoMode = false;
  let bg = null, cx0 = 0, cy0 = 0;
  let units = [], orden = [], turnPtr = 0, ronda = 1;
  let phase = 'intro';          // intro | menu | target | anim | over
  let raf = 0, t0 = 0, shake = 0, hitstop = 0;
  let floaters = [], slashes = [], arrows = [], dust = [];
  let anim = null, hovTarget = -1, pendingMove = null, logLine = '';

  // ── Modelos (aspecto) ──────────────────────────────────────────────────
  const MECENAS = { name: 'Tu mecenas', zh: '主公', aptitud: 'caudillo',
    aspecto: { robe: '#7a2f28', accent: '#e0c060', piel: 1, pelo: 0 }, weapon: 'espada' };
  const FOE_ASPECT = { robe: '#b8912f', accent: '#8a6a24', piel: 2, pelo: 1 };

  // ═══════════════════════════════════════════════════════════════════════
  // MOVES (coreografías por arma). Cada hit tiene su ventana de tempo.
  //   approach: dash (carrera) · thrust (poco cuerpo, arma larga) · leap (salto) · stay (a distancia)
  //   weapon:   sabre · spear · bow
  //   hits[]:   {at (fracción de dur), base (daño), fx}
  // ═══════════════════════════════════════════════════════════════════════
  const MOVES = {
    tajo:     { name: 'Tajo doble', ic: '斬', weapon: 'sabre', approach: 'dash', dur: 1000,
                hits: [{ at: 0.44, base: 1, fx: 'slash' }, { at: 0.64, base: 1, fx: 'slash' }] },
    estocada: { name: 'Estocada', ic: '刺', weapon: 'spear', approach: 'thrust', dur: 860,
                hits: [{ at: 0.54, base: 2, fx: 'pierce' }] },
    salto:    { name: 'Mandoble en salto', ic: '躍', weapon: 'sabre', approach: 'leap', dur: 1050,
                hits: [{ at: 0.60, base: 2, fx: 'slam' }] },
    andanada: { name: 'Andanada (3 flechas)', ic: '矢', weapon: 'bow', approach: 'stay', dur: 1200,
                hits: [{ at: 0.40, base: 1, fx: 'arrow' }, { at: 0.56, base: 1, fx: 'arrow' }, { at: 0.72, base: 1, fx: 'arrow' }] },
  };
  const FOE_MOVE = { name: 'Sablazo', ic: '', weapon: 'sabre', approach: 'dash', dur: 900, foe: true,
                     hits: [{ at: 0.54, base: 2, fx: 'slash', enemy: true }] };
  const WIN_PRE = 0.11, WIN_POST = 0.02, RET_SHOW = 0.20;   // ventanas de tempo (fracción de dur)

  // ── Unidades ──────────────────────────────────────────────────────────────
  function mkUnit(o) {
    return Object.assign({
      maxHp: 30, hp: 30, spd: 10, ox: 0, oy: 0, sq: 1, jump: 0, flash: 0,
      bob: rnd(0, 6.28), scale: 0.6, face: 1, spr: {}, dead: false, jx: 0, jy: 0, defending: false,
    }, o);
  }
  function nuevoEncuentro(nFoes) {
    nFoes = nFoes || ri(2, 3);
    units = [];
    units.push(mkUnit({ id: 'yo', side: 'ally', name: MECENAS.name, zh: MECENAS.zh,
      aptitud: MECENAS.aptitud, aspecto: MECENAS.aspecto, weapon: MECENAS.weapon,
      maxHp: 30, hp: 30, spd: 12, face: 1, scale: 0.66,
      skills: ['tajo', 'estocada', 'salto', 'andanada'] }));
    for (let i = 0; i < nFoes; i++) {
      units.push(mkUnit({ id: 'foe' + i, side: 'foe', name: 'Turbante', zh: '黃巾',
        aptitud: 'guerrero', aspecto: FOE_ASPECT, weapon: 'espada',
        maxHp: 3, hp: 3, spd: ri(7, 10), face: -1, scale: rnd(0.56, 0.64),
        jx: rnd(-14, 14), jy: rnd(-10, 10) }));
    }
    buildSprites(); layout();
    ronda = 1; turnPtr = 0; recomputeOrder();
    floaters = []; slashes = []; arrows = []; dust = [];
    phase = 'intro'; anim = { kind: 'intro', t: 0, dur: 650 };
    setLog('¡Emboscada! Derrota a los ' + nFoes + ' turbantes.');
  }

  // Despliegue ORGÁNICO: mecenas a la izquierda; enemigos repartidos a la derecha
  // en un arco suelto con desorden por unidad (nada de rejilla).
  function layout() {
    const foes = units.filter(u => u.side === 'foe');
    const spread = [ { x: 0, y: -6 }, { x: 70, y: 34 }, { x: 8, y: 66 }, { x: 104, y: 4 } ];
    units.forEach(u => {
      if (u.side === 'ally') { u.home = { x: cx0 - 210, y: cy0 + 46 }; return; }
      const i = foes.indexOf(u), s = spread[i] || { x: i * 60, y: i * 24 };
      u.home = { x: cx0 + 118 + s.x + u.jx, y: cy0 - 18 + s.y + u.jy };
    });
  }

  function buildSprites() {
    if (!window.HacChar || !HacChar.draw) return;
    for (const u of units) {
      const d = u.side === 'ally' ? 'SE' : 'SW';
      const c = document.createElement('canvas');
      try { HacChar.draw(c, { aptitud: u.aptitud, aspecto: u.aspecto, dir: d, frame: 0, scale: SPR_SCALE }); } catch (e) {}
      u.spr = c;
      const p = document.createElement('canvas');
      try { HacChar.draw(p, { aptitud: u.aptitud, aspecto: u.aspecto, dir: 'S', frame: 0, scale: 3 }); } catch (e) {}
      u.portrait = p;
    }
  }

  const alive = (u) => !u.dead && u.hp > 0;
  function recomputeOrder() { orden = units.filter(alive).slice().sort((a, b) => b.spd - a.spd || (a.side === 'ally' ? -1 : 1)); }
  const cur = () => orden[turnPtr] || null;
  const foesAlive = () => units.filter(u => u.side === 'foe' && alive(u));
  function setLog(s) { logLine = s; const el = root && root.querySelector('.cb-log'); if (el) el.innerHTML = s; }

  // ═══════════════════════════════════════════════════════════════════════
  // FLUJO DE TURNOS
  // ═══════════════════════════════════════════════════════════════════════
  function nextTurn() {
    if (checkEnd()) return;
    turnPtr++;
    if (turnPtr >= orden.length) { turnPtr = 0; ronda++; recomputeOrder(); }
    const u = cur();
    if (!u || !alive(u)) { nextTurn(); return; }
    (u.side === 'ally') ? openMenu(u) : enemyTurn(u);
  }
  function checkEnd() {
    const foesLeft = units.some(u => u.side === 'foe' && alive(u));
    const allyLeft = units.some(u => u.side === 'ally' && alive(u));
    if (!foesLeft) { endCombat(true); return true; }
    if (!allyLeft) { endCombat(false); return true; }
    return false;
  }

  function openMenu(u) {
    phase = 'menu'; pendingMove = null; renderMenu(u);
    setLog('Turno de <b>' + u.name + '</b>. Elige una acción.');
  }
  function renderMenu(u) {
    const m = root.querySelector('.cb-menu'); if (!m) return;
    if (phase !== 'menu') { m.style.display = 'none'; return; }
    m.style.display = 'flex';
    let html = '';
    (u.skills || ['tajo']).forEach(id => {
      const mv = MOVES[id]; if (!mv) return;
      html += '<div class="cb-act atk" data-a="' + id + '"><b>' + mv.name + '</b><small>' + moveDesc(mv) + '</small></div>';
    });
    html += '<div class="cb-act def" data-a="defender"><b>Defender</b><small>Reduce el próximo golpe</small></div>';
    m.innerHTML = html;
    m.querySelectorAll('.cb-act').forEach(el => el.onclick = () => onAction(u, el.dataset.a));
  }
  function moveDesc(mv) {
    const w = { sabre: 'espada', spear: 'lanza', bow: 'arco' }[mv.weapon];
    const n = mv.hits.length;
    return w + ' · ' + (n > 1 ? n + ' impactos (tempo ×' + n + ')' : 'tempo');
  }
  function onAction(u, a) {
    if (a === 'defender') { u.defending = true; setLog('<b>' + u.name + '</b> alza la guardia.'); animEnd(); return; }
    const mv = MOVES[a]; if (!mv) return;
    pendingMove = mv;
    // SIEMPRE elegir objetivo (aunque quede uno) → así te preparas para el tempo.
    phase = 'target';
    const fs = foesAlive(); hovTarget = units.indexOf(fs[0]);
    renderMenu(u);
    setLog('Objetivo de <b>' + mv.name + '</b>: usa <b>← →</b> y <b>ESPACIO</b>, o haz clic.');
  }
  function cycleTarget(dir) {
    const fs = foesAlive(); if (!fs.length) return;
    let i = fs.findIndex(f => units.indexOf(f) === hovTarget);
    i = (i + dir + fs.length) % fs.length;
    hovTarget = units.indexOf(fs[i]);
  }
  function confirmTarget() {
    const tg = units[hovTarget];
    if (!tg || !alive(tg)) return;
    launchMove(cur(), tg, pendingMove);
  }

  // ── Lanzar un MOVE (jugador o enemigo) ────────────────────────────────────
  function launchMove(u, target, mv) {
    phase = 'anim'; pendingMove = null;
    const m = root.querySelector('.cb-menu'); if (m) m.style.display = 'none';
    u.face = (target.home.x >= u.home.x) ? 1 : -1;
    anim = {
      kind: 'move', by: u, target, move: mv, t: 0, dur: mv.dur,
      applied: mv.hits.map(() => false), perfect: mv.hits.map(() => false),
      curHeld: false, winOpen: false, pendingHit: 0,
      swing: 0, extend: 0, bowDraw: 0,
    };
    if (mv.foe) setLog('¡<b>' + u.name + '</b> ataca! Pulsa <b>ESPACIO</b> para <b>bloquear</b>.');
    else setLog(mv.hits.length > 1 ? '¡Pulsa <b>ESPACIO</b> en CADA impacto!' : '¡Pulsa <b>ESPACIO</b> al golpear!');
  }
  function enemyTurn(u) {
    const target = units.find(x => x.side === 'ally' && alive(x));
    if (!target) { nextTurn(); return; }
    const raw = ri(u.atkMin || 2, u.atkMax || 3);
    launchMove(u, target, Object.assign({}, FOE_MOVE, { raw }));
    anim.raw = raw;
  }

  // ── Aplicar un impacto individual ─────────────────────────────────────────
  function applyHit(hit, perfect) {
    const tg = anim.target, mv = anim.move;
    if (hit.fx === 'arrow') { spawnArrow(anim.by, tg, hit, perfect); return; }   // ranged: aplica al aterrizar
    landDamage(tg, hit, perfect, mv);
  }
  function landDamage(tg, hit, perfect, mv) {
    const sc = { x: tg.home.x + (tg.ox || 0), y: tg.home.y + (tg.oy || 0) };
    if (mv.foe) {
      const blocked = perfect || tg.defending;
      let dmg = anim.raw || hit.base; if (blocked) dmg = Math.max(1, Math.round(dmg / 2));
      hurt(tg, dmg, { foe: true, txt: blocked ? '¡Bloqueo!' : '' });
      tg.defending = false; shake = 8; hitstop = 70;
      spawnSlash(sc.x, sc.y - 40, false, true);
      if (blocked) setLog('¡<b>Bloqueo!</b> Daño reducido.');
    } else {
      const dmg = perfect ? hit.base + 1 : hit.base;
      hurt(tg, dmg, { crit: perfect, txt: perfect ? '¡PERFECTO!' : '' });
      shake = perfect ? 15 : 9; hitstop = perfect ? 90 : 60;
      if (hit.fx === 'slam') { shake = 20; spawnDust(sc.x, sc.y); }
      spawnSlash(sc.x, sc.y - 42, perfect, false, hit.fx);
    }
  }
  function hurt(tg, dmg, o) {
    tg.hp = Math.max(0, tg.hp - dmg); tg.flash = 1;
    const sc = { x: tg.home.x + (tg.ox || 0), y: tg.home.y + (tg.oy || 0) };
    floaters.push({ x: sc.x, y: sc.y - 64, t: 0, dur: 900, txt: o.txt || '', dmg, crit: !!o.crit, foe: !!o.foe });
    if (tg.hp <= 0) { tg.dead = true; setLog('<b>' + tg.name + '</b> cae.'); }
  }
  function spawnSlash(x, y, perfect, foe, fx) { slashes.push({ x, y, t: 0, dur: 260, perfect: !!perfect, foe: !!foe, fx: fx || 'slash', ang: rnd(-0.4, 0.4) }); }
  function spawnDust(x, y) { for (let i = 0; i < 10; i++) dust.push({ x, y, vx: rnd(-1.4, 1.4), vy: rnd(-1.8, -0.3), t: 0, dur: rnd(380, 620), r: rnd(2, 4) }); }
  function spawnArrow(by, tg, hit, perfect) {
    const from = { x: by.home.x + (by.ox || 0) + by.face * 12, y: by.home.y + (by.oy || 0) - 60 };
    const to = { x: tg.home.x + (tg.ox || 0), y: tg.home.y + (tg.oy || 0) - 44 };
    arrows.push({ x0: from.x, y0: from.y, x1: to.x, y1: to.y, t: 0, dur: 200, hit, perfect, tg });
  }

  function animEnd() { anim = { kind: 'pause', t: 0, dur: 200 }; }
  function endCombat(win) {
    phase = 'over';
    const box = root.querySelector('.cb-end');
    box.className = 'cb-end ' + (win ? 'win' : 'lose');
    box.querySelector('.cb-end-t').textContent = win ? 'Victoria' : 'Derrota';
    box.querySelector('.cb-end-s').textContent = win ? 'El claro queda despejado.' : 'Tu mecenas es superado.';
    box.style.display = 'grid';
    const m = root.querySelector('.cb-menu'); if (m) m.style.display = 'none';
  }

  // ── Entrada ────────────────────────────────────────────────────────────────
  function onStrike() { if (phase === 'anim' && anim && anim.kind === 'move' && anim.winOpen) anim.curHeld = true; }
  function onPointer(e) {
    if (phase === 'over') return;
    if (phase === 'target') {
      const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      let best = null, bd = 1e9;
      for (const fo of foesAlive()) { const d = (fo.home.x - mx) ** 2 + (fo.home.y - 44 - my) ** 2; if (d < bd) { bd = d; best = fo; } }
      if (best) { hovTarget = units.indexOf(best); confirmTarget(); }
      return;
    }
    onStrike();
  }
  function onMove(e) {
    if (phase !== 'target') return;
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    let best = null, bd = 1e9;
    for (const fo of foesAlive()) { const d = (fo.home.x - mx) ** 2 + (fo.home.y - 44 - my) ** 2; if (d < bd) { bd = d; best = fo; } }
    if (best) hovTarget = units.indexOf(best);
  }
  function onKey(e) {
    if (phase === 'target') {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); cycleTarget(-1); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'Tab') { e.preventDefault(); cycleTarget(1); }
      else if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); confirmTarget(); }
      return;
    }
    if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); onStrike(); }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = false;
    cx0 = W * 0.52; cy0 = H * 0.54;
    if (units.length) layout();
    bakeArena();
    if (demoMode && units.length) paint();
  }
  // Claro de tierra SUAVE (sin damero) + mota de detalle, horneado 1 vez.
  function bakeArena() {
    bg = document.createElement('canvas'); bg.width = Math.round(W * dpr); bg.height = Math.round(H * dpr);
    const b = bg.getContext('2d'); b.setTransform(dpr, 0, 0, dpr, 0, 0);
    const gsky = b.createLinearGradient(0, 0, 0, H);
    gsky.addColorStop(0, '#241f16'); gsky.addColorStop(0.5, '#332b1d'); gsky.addColorStop(1, '#1e1810');
    b.fillStyle = gsky; b.fillRect(0, 0, W, H);
    // Claro (elipse de hierba/tierra pisada) centrado bajo los combatientes.
    const rw = Math.min(W * 0.42, 520), rh = rw * 0.42;
    b.save(); b.translate(cx0, cy0 + 20); b.scale(1, rh / rw);
    const gc = b.createRadialGradient(0, 0, rw * 0.2, 0, 0, rw);   // en coords LOCALES (ya trasladado)
    gc.addColorStop(0, '#545a38'); gc.addColorStop(0.55, '#454a30'); gc.addColorStop(1, 'rgba(52,44,29,0)');
    b.beginPath(); b.arc(0, 0, rw, 0, 6.283); b.fillStyle = gc; b.fill(); b.restore();
    // Mota de detalle (piedrecitas/matas) repartida en el claro (determinista).
    let seed = 1234;
    const rr = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < 90; i++) {
      const a = rr() * 6.283, rad = Math.sqrt(rr()) * rw * 0.94;
      const x = cx0 + Math.cos(a) * rad, y = cy0 + 20 + Math.sin(a) * rad * (rh / rw);
      const s = rr(); b.globalAlpha = 0.25 + s * 0.3;
      b.fillStyle = s < 0.5 ? '#3c4026' : (s < 0.8 ? '#5c6440' : '#6b5334');
      b.beginPath(); b.ellipse(x, y, 1 + s * 3, (1 + s * 3) * 0.5, 0, 0, 6.283); b.fill();
    }
    b.globalAlpha = 1;
    const gv = b.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.72);
    gv.addColorStop(0, 'rgba(0,0,0,0)'); gv.addColorStop(1, 'rgba(6,5,2,0.7)');
    b.fillStyle = gv; b.fillRect(0, 0, W, H);
  }

  function frame(ts) { raf = requestAnimationFrame(frame); if (!t0) t0 = ts; const dt = Math.min(50, ts - t0); t0 = ts; update(dt); paint(); }

  function update(dt) {
    shake *= Math.pow(0.86, dt / 16); if (shake < 0.4) shake = 0;
    if (hitstop > 0) { hitstop = Math.max(0, hitstop - dt); return; }
    for (const f of floaters) f.t += dt; floaters = floaters.filter(f => f.t < f.dur);
    for (const s of slashes) s.t += dt; slashes = slashes.filter(s => s.t < s.dur);
    for (const d of dust) { d.t += dt; d.x += d.vx; d.y += d.vy; d.vy += 0.05; } dust = dust.filter(d => d.t < d.dur);
    // Flechas: al aterrizar aplican su daño.
    for (const a of arrows) {
      a.t += dt;
      if (a.t >= a.dur && !a.done) { a.done = true; if (alive(a.tg) || a.tg.hp > 0) landArrow(a); }
    }
    arrows = arrows.filter(a => a.t < a.dur + 40);
    for (const u of units) { u.bob += dt / 520; if (u.flash > 0) u.flash = Math.max(0, u.flash - dt / 220); }

    if (!anim) return;
    anim.t += dt; const f = anim.t / anim.dur;
    if (anim.kind === 'intro') { if (anim.t >= anim.dur) { anim = null; nextTurnStart(); } return; }
    if (anim.kind === 'pause') { if (anim.t >= anim.dur) { anim = null; nextTurn(); } return; }
    if (anim.kind === 'move') { updateMove(f); return; }
  }
  function landArrow(a) {
    const tg = a.tg;
    const dmg = a.perfect ? a.hit.base + 1 : a.hit.base;
    hurt(tg, dmg, { crit: a.perfect, txt: a.perfect ? '¡PERFECTO!' : '' });
    shake = a.perfect ? 12 : 7; hitstop = 40;
    spawnSlash(a.x1, a.y1, a.perfect, false, 'arrow');
  }

  function updateMove(f) {
    const by = anim.by, tg = anim.target, mv = anim.move;
    const dx = (tg.home.x - by.home.x), dy = (tg.home.y - by.home.y);
    // ── Cuerpo (approach) ──
    const firstAt = mv.hits[0].at, lastAt = mv.hits[mv.hits.length - 1].at;
    let eng = (f < firstAt) ? easeOut(f / firstAt) : (f < lastAt ? 1 : 1 - easeInOut((f - lastAt) / (1 - lastAt)));
    let reach = 0, lift = 0, sq = 1, jump = 0;
    if (mv.approach === 'dash') { reach = 0.60 * eng; }
    else if (mv.approach === 'thrust') { reach = 0.20 * eng; }
    else if (mv.approach === 'stay') { reach = -0.05 * eng; }
    else if (mv.approach === 'leap') {
      reach = 0.58 * eng;
      if (f < firstAt) { jump = Math.sin((f / firstAt) * Math.PI); lift = -60 * jump; sq = 1 + 0.04 * jump; }
    }
    by.ox = dx * reach; by.oy = dy * reach + lift; by.sq = sq; by.jump = jump;
    // ── Fase del arma respecto al impacto pendiente ──
    let hi = anim.applied.indexOf(false);
    let local;
    if (hi < 0) { local = 1 - clamp((f - lastAt) / (1 - lastAt), 0, 1); anim.winOpen = false; anim.pendingHit = -1; }
    else {
      const h = mv.hits[hi], prevAt = hi > 0 ? mv.hits[hi - 1].at : (mv.approach === 'stay' ? 0.12 : firstAt * 0.4);
      local = clamp((f - prevAt) / (h.at - prevAt), 0, 1);
      const lead = h.at - f;
      anim.pendingHit = hi;
      anim.winOpen = (lead <= WIN_PRE && lead >= -WIN_POST);
      // Aplicar el impacto cuando f cruza h.at.
      if (f >= h.at) { anim.applied[hi] = true; anim.perfect[hi] = anim.curHeld; applyHit(h, anim.curHeld); anim.curHeld = false; }
    }
    anim.swing = local; anim.extend = local; anim.bowDraw = local;
    if (anim.t >= anim.dur) { by.ox = 0; by.oy = 0; by.sq = 1; by.jump = 0; anim.winOpen = false; animEnd(); }
  }
  function nextTurnStart() { const u = cur(); if (u && u.side === 'ally') openMenu(u); else if (u) enemyTurn(u); else nextTurn(); }

  function paint() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = false;
    let sx = 0, sy = 0; if (shake > 0) { sx = rnd(-shake, shake); sy = rnd(-shake, shake) * 0.5; }
    ctx.save(); ctx.translate(sx, sy);
    if (bg) ctx.drawImage(bg, 0, 0, bg.width, bg.height, 0, 0, W, H);

    // Unidades por profundidad (y de los pies).
    const order = units.slice().sort((a, b) => a.home.y - b.home.y);
    for (const u of order) { drawUnit(u); if (u.side === 'ally' || (anim && anim.by === u)) drawWeapon(u); }

    // Marcador de OBJETIVO (claro) en fase target.
    if (phase === 'target') drawTargeting();
    // Arma barriendo + retículo de tempo durante el move.
    if (anim && anim.kind === 'move') drawTempo(anim);

    for (const a of arrows) drawArrow(a);
    for (const s of slashes) drawSlash(s);
    for (const d of dust) drawDust(d);
    for (const f of floaters) drawFloater(f);
    ctx.restore();
    drawTimeline();
  }

  function drawUnit(u) {
    const x = u.home.x + (u.ox || 0), y = u.home.y + (u.oy || 0);
    const bob = alive(u) ? Math.sin(u.bob) * 1.4 : 0;
    // Sombra (se encoge en el salto).
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.32)';
    const shr = 1 - 0.5 * (u.jump || 0);
    ctx.beginPath(); ctx.ellipse(x, u.home.y, 22 * u.scale * shr, 9 * u.scale * shr, 0, 0, 6.283); ctx.fill(); ctx.restore();
    if (!u.spr) return;
    const sq = u.sq || 1;
    const w = CHAR_W * SPR_SCALE * u.scale / Math.sqrt(sq), h = CHAR_H * SPR_SCALE * u.scale * sq;
    const feetOff = (CHAR_FEET / CHAR_H) * h;
    const dx = x - w / 2, dy = y - feetOff + bob;
    ctx.save(); if (!alive(u)) ctx.globalAlpha = 0.35;
    ctx.drawImage(u.spr, 0, 0, u.spr.width, u.spr.height, dx, dy, w, h);
    if (u.flash > 0) {
      ctx.globalAlpha = u.flash * 0.7; ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(u.spr, 0, 0, u.spr.width, u.spr.height, dx, dy, w, h);
    }
    ctx.restore();
    drawHpBar(u, x, u.home.y + 10 * u.scale);
  }

  // Arma en la mano (en reposo o animada según el move activo). Coherencia:
  // el jugador la lleva SIEMPRE; el enemigo solo mientras ataca.
  function drawWeapon(u) {
    const moving = anim && anim.kind === 'move' && anim.by === u;
    const mv = moving ? anim.move : null;
    const wtype = mv ? mv.weapon : (u.weapon === 'lanza' ? 'spear' : u.weapon === 'arco' ? 'bow' : 'sabre');
    const x = u.home.x + (u.ox || 0), y = u.home.y + (u.oy || 0);
    const hx = x + u.face * 9 * u.scale, hy = y - 58 * u.scale;
    const foe = u.side === 'foe';
    if (wtype === 'sabre') drawSabre(hx, hy, moving ? anim.swing : -1, u.face, foe, u.scale);
    else if (wtype === 'spear') drawSpear(hx, hy, moving ? anim.extend : -1, u.face, foe, u.scale);
    else if (wtype === 'bow') drawBow(hx, hy, moving ? anim.bowDraw : -1, u.face, foe, u.scale);
  }
  // swing: -1 = reposo (colgando), 0..1 = alzada→abajo.
  function drawSabre(cx, cy, swing, face, foe, sc) {
    sc = sc || 0.62;
    const rest = swing < 0;
    const A = -2.4, B = 0.7, ang = rest ? 1.25 : lerp(A, B, swing);
    ctx.save(); ctx.translate(cx, cy); ctx.scale(sc / 0.62, sc / 0.62); if (face < 0) ctx.scale(-1, 1);
    if (!rest) { const tr = clamp((swing - 0.3) / 0.6, 0, 1); for (let i = 3; i >= 1; i--) { if (tr <= 0) break; ctx.globalAlpha = 0.10 * i * tr; blade(lerp(A, ang, 1 - i * 0.16)); } }
    ctx.globalAlpha = 1; blade(ang); ctx.restore();
    function blade(aa) {
      ctx.save(); ctx.rotate(aa); const L = 40, base = 8;
      ctx.beginPath(); ctx.moveTo(0, -base / 2); ctx.lineTo(L, -1); ctx.lineTo(L, 1); ctx.lineTo(0, base / 2); ctx.closePath();
      ctx.fillStyle = foe ? '#c4c6cc' : '#d9dde6'; ctx.fill();
      ctx.fillStyle = '#f6f8fb'; ctx.fillRect(3, -1, L - 8, 1);
      ctx.fillStyle = '#caa23c'; ctx.fillRect(-2, -4, 4, 8);
      ctx.fillStyle = '#4a3117'; ctx.fillRect(-8, -1.5, 7, 3); ctx.restore();
    }
  }
  // extend: -1 reposo (vertical), 0..1 = recogida→estirada al frente (largo alcance).
  function drawSpear(cx, cy, extend, face, foe, sc) {
    sc = sc || 0.62; const rest = extend < 0;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(sc / 0.62, sc / 0.62); if (face < 0) ctx.scale(-1, 1);
    if (rest) { // en vertical al costado
      ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(0, -44); ctx.stroke();
      spearhead(0, -44, -Math.PI / 2);
    } else {
      const reach = lerp(-6, 58, easeOut(extend));   // punta avanza al frente
      ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(-18, -2); ctx.lineTo(reach, -6); ctx.stroke();
      spearhead(reach, -6, 0);
      if (extend > 0.6) { ctx.globalAlpha = (extend - 0.6) * 2; ctx.strokeStyle = '#eef2f8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(reach - 14, -6); ctx.lineTo(reach + 6, -6); ctx.stroke(); ctx.globalAlpha = 1; }
    }
    ctx.restore();
    function spearhead(x, y, a) { ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = foe ? '#c4c6cc' : '#e6eaf0'; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-2, -4); ctx.lineTo(-2, 4); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#a83028'; ctx.fillRect(-6, -1.5, 5, 3); ctx.restore(); }
  }
  // draw: -1 reposo, 0..1 = tensado (cuerda atrás).
  function drawBow(cx, cy, draw, face, foe, sc) {
    sc = sc || 0.62; const pull = draw < 0 ? 0 : draw;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(sc / 0.62, sc / 0.62); if (face < 0) ctx.scale(-1, 1);
    ctx.strokeStyle = '#6b4a24'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(2, 0, 20, -1.15, 1.15); ctx.stroke();              // arco
    const tipT = Math.sin(1.15) * 20, tipY = tipT, tipX = 2 + Math.cos(1.15) * 20;
    const nock = -8 * pull;                                                     // cuerda tensada
    ctx.strokeStyle = '#d8cba0'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(tipX, -tipY); ctx.lineTo(nock, 0); ctx.lineTo(tipX, tipY); ctx.stroke();
    if (draw >= 0 && pull > 0.15) { ctx.strokeStyle = '#e6eaf0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(nock, 0); ctx.lineTo(nock + 22, 0); ctx.stroke(); ctx.fillStyle = '#c4c6cc'; ctx.beginPath(); ctx.moveTo(nock + 26, 0); ctx.lineTo(nock + 20, -3); ctx.lineTo(nock + 20, 3); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }

  function drawTargeting() {
    for (const fo of foesAlive()) {
      const on = units.indexOf(fo) === hovTarget;
      const x = fo.home.x, y = fo.home.y;
      // Atenuar los NO objetivo.
      if (!on) { ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = '#0a0805'; ctx.beginPath(); ctx.ellipse(x, y, 26 * fo.scale, 10 * fo.scale, 0, 0, 6.283); ctx.fill(); ctx.restore(); continue; }
      // Anillo en el suelo del objetivo.
      ctx.save(); ctx.strokeStyle = '#f0c060'; ctx.lineWidth = 2.5; ctx.shadowColor = '#f0c060'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.ellipse(x, y, 26 * fo.scale, 10 * fo.scale, 0, 0, 6.283); ctx.stroke(); ctx.restore();
      // Flecha ▼ que bota sobre la cabeza + nombre.
      const ay = y - 118 * fo.scale + Math.sin(performanceNow() / 240) * 4;
      ctx.save(); ctx.fillStyle = '#f0c060'; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - 9, ay); ctx.lineTo(x + 9, ay); ctx.lineTo(x, ay + 12); ctx.closePath(); ctx.stroke(); ctx.fill();
      ctx.font = '700 13px "Noto Serif SC",serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.strokeText(fo.name + ' ' + fo.zh, x, ay - 6); ctx.fillStyle = '#ffe8b8'; ctx.fillText(fo.name + ' ' + fo.zh, x, ay - 6);
      ctx.restore();
    }
  }

  function drawTempo(a) {
    if (a.pendingHit < 0) return;
    const tg = a.target, mv = a.move, f = a.t / a.dur, foe = mv.foe;
    const h = mv.hits[a.pendingHit]; const lead = h.at - f;
    if (lead > RET_SHOW) return;              // aún no toca mostrar el retículo
    const rx = tg.home.x + (tg.ox || 0), ry = tg.home.y + (tg.oy || 0) - 46;
    const R = lerp(7, 40, clamp(lead / RET_SHOW, 0, 1));
    const inWin = a.winOpen;
    ctx.save(); ctx.translate(rx, ry);
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(230,220,190,.3)'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, 6.283); ctx.stroke();
    const col = inWin ? (foe ? '#7fbfff' : '#ffdf80') : 'rgba(235,225,195,.7)';
    ctx.lineWidth = inWin ? 3.5 : 2; ctx.strokeStyle = col; if (inWin) { ctx.shadowColor = col; ctx.shadowBlur = 10; }
    ctx.beginPath(); ctx.arc(0, 0, Math.max(R, 9), 0, 6.283); ctx.stroke(); ctx.restore();
    if (inWin) {
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 17px "Noto Serif SC",serif';
      ctx.fillStyle = foe ? '#bfe0ff' : '#ffe08a'; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.lineWidth = 4;
      const tx = foe ? '¡BLOQUEA!' : '¡YA!'; ctx.strokeText(tx, rx, ry - 26); ctx.fillText(tx, rx, ry - 26); ctx.restore();
    }
  }

  function drawHpBar(u, x, y) {
    if (u.hp <= 0) return;
    const w = (u.side === 'foe' ? 34 : 46) * (0.7 + u.scale * 0.5), h = 5;
    ctx.save();
    ctx.fillStyle = 'rgba(10,7,3,0.7)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
    const pct = clamp(u.hp / u.maxHp, 0, 1);
    ctx.fillStyle = u.side === 'foe' ? '#c85434' : '#8ec062'; ctx.fillRect(x - w / 2, y, w * pct, h);
    if (u.side === 'foe') { ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; for (let i = 1; i < u.maxHp; i++) { const gx = x - w / 2 + w * (i / u.maxHp); ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx, y + h); ctx.stroke(); } }
    ctx.restore();
  }
  function drawArrow(a) {
    const t = clamp(a.t / a.dur, 0, 1), x = lerp(a.x0, a.x1, t), y = lerp(a.y0, a.y1, t) - Math.sin(t * Math.PI) * 10;
    const ang = Math.atan2((a.y1 - a.y0), (a.x1 - a.x0));
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.strokeStyle = '#6b4a24'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(6, 0); ctx.stroke();
    ctx.fillStyle = '#e6eaf0'; ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(4, -3); ctx.lineTo(4, 3); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#d8cba0'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-13, -3); ctx.moveTo(-10, 0); ctx.lineTo(-13, 3); ctx.stroke();
    ctx.restore();
  }
  function drawDust(d) { const p = d.t / d.dur; ctx.save(); ctx.globalAlpha = (1 - p) * 0.6; ctx.fillStyle = '#8a7a56'; ctx.beginPath(); ctx.arc(d.x, d.y, d.r * (1 + p), 0, 6.283); ctx.fill(); ctx.restore(); }
  function drawSlash(s) {
    const f = s.t / s.dur, a = 1 - f;
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.ang); ctx.globalAlpha = a;
    ctx.strokeStyle = s.foe ? '#ff8a6a' : (s.perfect ? '#ffe6a0' : '#f4f0e0'); ctx.lineWidth = s.perfect ? 6 : 4; ctx.lineCap = 'round';
    const r = lerp(10, s.fx === 'slam' ? 58 : 46, easeOut(f));
    const spread = s.fx === 'pierce' ? 0.5 : 0.9;
    ctx.beginPath(); ctx.arc(0, 0, r, -spread, spread); ctx.stroke();
    if (s.perfect) { ctx.globalAlpha = a * 0.6; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r + 6, -spread, spread); ctx.stroke(); }
    ctx.restore();
  }
  function drawFloater(f) {
    const p = f.t / f.dur, y = f.y - p * 34;
    ctx.save(); ctx.globalAlpha = 1 - Math.pow(p, 2); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (f.txt) { ctx.font = '700 15px "Noto Serif SC",serif'; ctx.fillStyle = f.crit ? '#ffe08a' : (f.foe ? '#bfe0ff' : '#e6f0d0'); ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3; ctx.strokeText(f.txt, f.x, y - 16); ctx.fillText(f.txt, f.x, y - 16); }
    ctx.font = '900 ' + (f.crit ? 26 : 20) + 'px "Noto Serif SC",serif'; ctx.fillStyle = f.crit ? '#ffcf6a' : (f.foe ? '#ff9a80' : '#fff');
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 4; ctx.strokeText('-' + f.dmg, f.x, y); ctx.fillText('-' + f.dmg, f.x, y); ctx.restore();
  }

  function drawTimeline() {
    const host = root.querySelector('.cb-order'); if (!host) return;
    const queue = []; let p = turnPtr, o = orden.slice();
    for (let i = 0; i < 6 && o.length; i++) { queue.push(o[p % o.length]); p++; }
    const sig = queue.map(u => u && u.id + (u.hp <= 0 ? 'x' : '')).join(',') + phase;
    if (host.dataset.sig === sig) return;
    host.dataset.sig = sig;
    host.innerHTML = queue.map((u, i) => u ? '<div class="cb-ord ' + (i === 0 ? 'cur ' : '') + (u.side === 'foe' ? 'foe' : '') + '"><canvas class="cb-ord-c" width="88" height="88" data-uid="' + u.id + '"></canvas></div>' : '').join('');
    host.querySelectorAll('.cb-ord-c').forEach(cnv => {
      const u = units.find(x => x.id === cnv.dataset.uid); if (!u || !u.portrait) return;
      const c2 = cnv.getContext('2d'); c2.imageSmoothingEnabled = false; c2.clearRect(0, 0, 88, 88);
      c2.save(); c2.beginPath(); c2.arc(44, 44, 42, 0, 6.283); c2.clip();
      const s = u.portrait, scl = 88 / CHAR_W; c2.drawImage(s, 0, 0, s.width, s.height * 0.72, 44 - (CHAR_W * scl) / 2, 4, CHAR_W * scl, CHAR_H * 0.72 * scl); c2.restore();
    });
  }
  let _pt = 0; function performanceNow() { _pt += 16; return (typeof performance !== 'undefined' && performance.now) ? performance.now() : _pt; }

  // ── Demo (verificación headless sin RAF) ──────────────────────────────────
  function stepAnim(frac) { let g = 0; while (anim && anim.kind === 'move' && anim.t < anim.dur * frac && g++ < 800) update(18); }
  function runDemo(which) {
    resize(); anim = null;
    const me = units.find(u => u.side === 'ally'), foe = foesAlive()[0];
    if (which === 'menu') { openMenu(me); paint(); return; }
    if (which === 'target') { onAction(me, 'tajo'); paint(); return; }
    if (which === 'enemy') { enemyTurn(units.find(u => u.side === 'foe')); stepAnim(0.58); paint(); return; }
    const mvId = MOVES[which] ? which : 'tajo';
    launchMove(me, foe, MOVES[mvId]);
    const fr = mvId === 'andanada' ? 0.58 : mvId === 'salto' ? 0.62 : mvId === 'estocada' ? 0.56 : 0.47;
    // marca perfectos
    const origStrike = anim; anim.curHeld = true; stepAnim(fr); paint();
  }

  function init(rootEl, config) {
    root = rootEl; cfg = config || {};
    root.innerHTML =
      '<div class="cb-scene"><canvas class="cb-cv"></canvas></div>' +
      '<div class="cb-order"></div>' +
      '<div class="cb-hud"><div class="cb-log"></div><div class="cb-menu"></div></div>' +
      '<div class="cb-end"><div class="cb-end-box"><div class="cb-end-t"></div><div class="cb-end-s"></div><button class="cb-end-btn">Reintentar</button></div></div>';
    cv = root.querySelector('.cb-cv'); ctx = cv.getContext('2d');
    root.querySelector('.cb-end-btn').onclick = () => { root.querySelector('.cb-end').style.display = 'none'; nuevoEncuentro(cfg.foes); };
    cv.addEventListener('pointerdown', onPointer);
    cv.addEventListener('pointermove', onMove);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', resize);
    resize(); nuevoEncuentro(cfg.foes);
    const q = (typeof location !== 'undefined') && new URLSearchParams(location.search).get('t');
    if (q) { demoMode = true; setTimeout(() => runDemo(q), 200); return; }
    raf = requestAnimationFrame(frame);
  }

  return { init, _debug: () => ({ units, orden, phase, anim }) };
})();
if (typeof window !== 'undefined') window.Combate = Combate;
