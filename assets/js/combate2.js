/* ═══════════════════════════════════════════════════════════════════════
   combate2.js — Combate por TURNOS (aspecto Sea of Stars), desde 0.
   ─────────────────────────────────────────────────────────────────────────
   · Arena 2D ISOMÉTRICA (suelo de rombos 2:1, horneado 1 vez → FPS suave).
   · Combatientes = modelos procedurales HacChar (aspecto real del personaje).
   · Solo TU MECENAS vs 2-3 enemigos débiles (aguantan 2 golpes; 1 si clavas
     el TEMPO del impacto extra estilo Sea of Stars). Los enemigos pegan flojo.
   · Núcleo a testear: turnos + GOLPE CON TEMPO (ventana de pulsación → ¡Perfecto!
     → golpe extra que remata) y DEFENSA CON TEMPO (bloqueo que mitiga).
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
  const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // ── Geometría isométrica de la ARENA (propia, no la del tablero de finca) ─
  const TILE_W = 74, TILE_H = 37;    // rombo 2:1 (px de pantalla, generoso para lectura)
  const GW = 6, GH = 6;              // celdas del claro
  const SPR_SCALE = 4;               // escala del modelo HacChar (logico 40×56 → 160×224)
  const CHAR_W = 40, CHAR_H = 56, CHAR_FEET = 51;   // constantes lógicas de HacChar

  // ── Estado global del combate ────────────────────────────────────────────
  let root, cfg, cv, ctx, W = 0, H = 0, dpr = 1, demoMode = false;
  let bg = null;                     // arena horneada (offscreen)
  let units = [], orden = [], turnPtr = 0, ronda = 1;
  let phase = 'intro';               // intro | menu | target | anim | over
  let raf = 0, t0 = 0, shake = 0;
  let floaters = [], slashes = [], pips = [];
  let anim = null;                   // animación de acción en curso
  let hovTarget = -1;                // índice de enemigo resaltado al elegir objetivo
  let pendingAction = null;          // acción elegida en el menú, esperando objetivo
  let strikeHeld = false;            // ¿pulsó el jugador dentro de la ventana de tempo?
  let logLine = '';

  // ── Modelos (aspecto) ──────────────────────────────────────────────────
  // Mecenas de prueba: general con armadura. Al integrar en la finca se sustituye
  // por el aspecto real del personaje del jugador.
  const MECENAS = { name: 'Tu mecenas', zh: '主公', aptitud: 'caudillo',
    aspecto: { robe: '#7a2f28', accent: '#e0c060', piel: 1, pelo: 0 } };
  // Enemigos: tropa de Turbantes Amarillos (aspecto tosco, túnica ocre).
  const FOE_ASPECT = { robe: '#b8912f', accent: '#8a6a24', piel: 2, pelo: 1 };

  // ── Proyección iso: celda (cx,cy) → punto de pantalla (pies del personaje) ─
  let originX = 0, originY = 0;
  function cellToScreen(cx, cy) {
    return { x: originX + (cx - cy) * (TILE_W / 2),
             y: originY + (cx + cy) * (TILE_H / 2) };
  }

  // ── Construir las unidades del encuentro ─────────────────────────────────
  function mkUnit(o) {
    return Object.assign({
      dir: 'SE', maxHp: 30, hp: 30, spd: 10, atkMin: 2, atkMax: 3,
      ox: 0, oy: 0, flash: 0, bob: rnd(0, 6.28), spr: {}, dead: false,
    }, o);
  }
  function nuevoEncuentro(nFoes) {
    nFoes = nFoes || ri(2, 3);
    units = [];
    // Mecenas (bando aliado), pie en la franja izquierda mirando al frente-derecha.
    units.push(mkUnit({ id: 'yo', side: 'ally', name: MECENAS.name, zh: MECENAS.zh,
      aptitud: MECENAS.aptitud, aspecto: MECENAS.aspecto, dir: 'SE',
      maxHp: 30, hp: 30, spd: 12, cell: { x: 1, y: 4 } }));
    // Enemigos en la franja derecha, mirando a la izquierda-frente.
    const slots = [ { x: 4, y: 1 }, { x: 5, y: 3 }, { x: 3, y: 2 } ];
    for (let i = 0; i < nFoes; i++) {
      units.push(mkUnit({ id: 'foe' + i, side: 'foe', name: 'Turbante', zh: '黃巾',
        aptitud: 'guerrero', aspecto: FOE_ASPECT, dir: 'SW',
        maxHp: 2, hp: 2, spd: ri(7, 10), atkMin: 2, atkMax: 3, cell: slots[i] }));
    }
    buildSprites();
    ronda = 1; turnPtr = 0; recomputeOrder();
    phase = 'intro'; anim = { kind: 'intro', t: 0, dur: 700 };
    setLog('¡Emboscada! Derrota a los ' + nFoes + ' turbantes.');
  }

  // ── Sprites: renderizar cada modelo a un lienzo (cacheado por dirección) ──
  function buildSprites() {
    if (!window.HacChar || !HacChar.draw) return;
    for (const u of units) {
      for (const d of [u.dir]) {
        const c = document.createElement('canvas');
        try { HacChar.draw(c, { aptitud: u.aptitud, aspecto: u.aspecto, dir: d, frame: 0, scale: SPR_SCALE }); } catch (e) {}
        u.spr[d] = c;
      }
      // Retrato pequeño (para la línea de turnos): mira al frente (S).
      const p = document.createElement('canvas');
      try { HacChar.draw(p, { aptitud: u.aptitud, aspecto: u.aspecto, dir: 'S', frame: 0, scale: 3 }); } catch (e) {}
      u.portrait = p;
    }
  }

  // ── Orden de turnos (por velocidad; se recalcula cada ronda) ─────────────
  const alive = (u) => !u.dead && u.hp > 0;
  function recomputeOrder() {
    orden = units.filter(alive).slice().sort((a, b) => b.spd - a.spd || (a.side === 'ally' ? -1 : 1));
  }
  const cur = () => orden[turnPtr] || null;

  // ── Log (línea diegética inferior) ───────────────────────────────────────
  function setLog(s) { logLine = s; const el = root.querySelector('.cb-log'); if (el) el.innerHTML = s; }

  // ═══════════════════════════════════════════════════════════════════════
  // FLUJO DE TURNOS
  // ═══════════════════════════════════════════════════════════════════════
  function nextTurn() {
    if (checkEnd()) return;
    turnPtr++;
    if (turnPtr >= orden.length) { turnPtr = 0; ronda++; recomputeOrder(); }
    const u = cur();
    if (!u || !alive(u)) { nextTurn(); return; }
    if (u.side === 'ally') { openMenu(u); }
    else { enemyTurn(u); }
  }

  function checkEnd() {
    const foesLeft = units.some(u => u.side === 'foe' && alive(u));
    const allyLeft = units.some(u => u.side === 'ally' && alive(u));
    if (!foesLeft) { endCombat(true); return true; }
    if (!allyLeft) { endCombat(false); return true; }
    return false;
  }

  // ── Turno del jugador: menú de acciones ──────────────────────────────────
  function openMenu(u) {
    phase = 'menu'; pendingAction = null; renderMenu(u);
    setLog('Turno de <b>' + u.name + '</b>. Elige una acción.');
  }
  function renderMenu(u) {
    const m = root.querySelector('.cb-menu');
    if (!m) return;
    if (phase !== 'menu' && phase !== 'target') { m.style.display = 'none'; return; }
    m.style.display = 'block';
    if (phase === 'target') {
      m.innerHTML = '<div class="cb-menu-hint">Elige a quién atacar</div>';
      return;
    }
    m.innerHTML =
      '<div class="cb-act atk" data-a="atacar"><b>Atacar</b><small>Espada · tempo = golpe extra</small></div>' +
      '<div class="cb-act def" data-a="defender"><b>Defender</b><small>Reduce el próximo golpe</small></div>';
    m.querySelectorAll('.cb-act').forEach(el => el.onclick = () => onAction(u, el.dataset.a));
  }
  function onAction(u, a) {
    if (a === 'defender') { u.defending = true; setLog('<b>' + u.name + '</b> alza la guardia.'); animEnd(); return; }
    if (a === 'atacar') {
      const foes = units.filter(x => x.side === 'foe' && alive(x));
      if (foes.length === 1) { startAttack(u, foes[0]); }
      else { phase = 'target'; pendingAction = 'atacar'; hovTarget = units.indexOf(foes[0]); renderMenu(u); setLog('Elige a quién atacar (clic).'); }
    }
  }

  // ── Ataque del jugador con TEMPO ──────────────────────────────────────────
  function startAttack(u, target) {
    phase = 'anim'; pendingAction = null; strikeHeld = false;
    renderMenu(u);
    u.dir = target.cell.x >= u.cell.x ? 'SE' : 'SW'; ensureSprite(u);
    anim = {
      kind: 'attack', by: u, target, t: 0, dur: 560,
      impact: false, perfectApplied: false,
      // Ventana de tempo (fracción de dur) alrededor del impacto (0.5).
      win: [0.40, 0.58], impactAt: 0.50,
    };
    setLog('¡Pulsa <b>ESPACIO</b> (o clic) al conectar el golpe!');
  }

  // ── Turno del enemigo (pega al mecenas; el jugador puede BLOQUEAR con tempo) ─
  function enemyTurn(u) {
    const target = units.find(x => x.side === 'ally' && alive(x));
    if (!target) { nextTurn(); return; }
    phase = 'anim'; strikeHeld = false;
    u.dir = target.cell.x >= u.cell.x ? 'SE' : 'SW'; ensureSprite(u);
    const raw = ri(u.atkMin, u.atkMax);
    anim = {
      kind: 'enemyAtk', by: u, target, t: 0, dur: 620, impact: false, applied: false,
      win: [0.42, 0.60], impactAt: 0.52, raw,
    };
    setLog('¡<b>' + u.name + '</b> ataca! Pulsa <b>ESPACIO</b> para <b>bloquear</b>.');
  }

  function ensureSprite(u) {
    if (u.spr[u.dir]) return;
    const c = document.createElement('canvas');
    try { HacChar.draw(c, { aptitud: u.aptitud, aspecto: u.aspecto, dir: u.dir, frame: 0, scale: SPR_SCALE }); } catch (e) {}
    u.spr[u.dir] = c;
  }

  // ── Entrada del jugador (tempo) ───────────────────────────────────────────
  function onStrike() {
    if (phase === 'target') return;   // en target la selección es por clic de objetivo
    if (phase !== 'anim' || !anim) return;
    if (anim.kind !== 'attack' && anim.kind !== 'enemyAtk') return;
    const f = anim.t / anim.dur;
    if (f >= anim.win[0] && f <= anim.win[1]) strikeHeld = true;
  }

  // ── Aplicar el impacto (se llama una vez al cruzar impactAt) ──────────────
  function applyImpact() {
    const target = anim.target, by = anim.by;
    const sc = cellToScreen(target.cell.x, target.cell.y);
    if (anim.kind === 'attack') {
      const perfect = strikeHeld;
      const dmg = perfect ? 2 : 1;
      target.hp = Math.max(0, target.hp - dmg);
      target.flash = 1; shake = perfect ? 16 : 9;
      spawnSlash(sc.x, sc.y - 44, perfect);
      floaters.push({ x: sc.x, y: sc.y - 70, vy: -0.5, t: 0, dur: 900, txt: perfect ? '¡PERFECTO!' : '', dmg: dmg, crit: perfect });
      if (perfect) setLog('¡<b>Tempo perfecto!</b> Golpe extra.');
      if (target.hp <= 0) { target.dead = true; setLog('<b>' + target.name + '</b> cae.'); }
    } else if (anim.kind === 'enemyAtk') {
      const blocked = strikeHeld || target.defending;
      let dmg = anim.raw;
      if (blocked) dmg = Math.max(1, Math.round(dmg / 2));
      target.hp = Math.max(0, target.hp - dmg);
      target.flash = 1; shake = 8;
      spawnSlash(sc.x, sc.y - 44, false, true);
      floaters.push({ x: sc.x, y: sc.y - 70, vy: -0.5, t: 0, dur: 900, txt: blocked ? '¡Bloqueo!' : '', dmg: dmg, crit: false, foe: true });
      if (blocked) setLog('¡<b>Bloqueo!</b> Daño reducido.');
      target.defending = false;
      if (target.hp <= 0) { target.dead = true; }
    }
  }

  function spawnSlash(x, y, perfect, foe) {
    slashes.push({ x, y, t: 0, dur: 260, perfect: !!perfect, foe: !!foe, ang: rnd(-0.5, 0.5) });
  }

  // ── Fin de acción → siguiente turno ───────────────────────────────────────
  function animEnd() {
    anim = null; strikeHeld = false;
    // pequeño respiro antes del siguiente turno
    anim = { kind: 'pause', t: 0, dur: 220, then: 'next' };
  }

  function endCombat(win) {
    phase = 'over';
    const box = root.querySelector('.cb-end');
    box.className = 'cb-end ' + (win ? 'win' : 'lose');
    box.querySelector('.cb-end-t').textContent = win ? 'Victoria' : 'Derrota';
    box.querySelector('.cb-end-s').textContent = win ? 'El claro queda despejado.' : 'Tu mecenas es superado.';
    box.style.display = 'grid';
    const m = root.querySelector('.cb-menu'); if (m) m.style.display = 'none';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    // Origen: centra el rombo del tablero en pantalla, algo hacia arriba.
    originX = W / 2;
    originY = H / 2 - (GW + GH) * TILE_H / 4 + 40;
    bakeArena();
    if (demoMode && units.length) paint(0);   // demo: sin RAF, repinta tras cada resize/bake
  }

  // Arena HORNEADA (una vez): suelo de rombos + viñeta. En cada frame solo se blitea.
  function bakeArena() {
    bg = document.createElement('canvas');
    bg.width = Math.round(W * dpr); bg.height = Math.round(H * dpr);
    const b = bg.getContext('2d'); b.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Fondo (cielo/tierra al atardecer).
    const gsky = b.createLinearGradient(0, 0, 0, H);
    gsky.addColorStop(0, '#2a2418'); gsky.addColorStop(0.55, '#3a3120'); gsky.addColorStop(1, '#241d12');
    b.fillStyle = gsky; b.fillRect(0, 0, W, H);
    // Suelo de rombos (dos verdes apagados en damero + surco de tierra).
    for (let sum = 0; sum <= (GW - 1) + (GH - 1); sum++) {
      for (let cx = 0; cx < GW; cx++) {
        const cy = sum - cx; if (cy < 0 || cy >= GH) continue;
        const p = cellToScreen(cx, cy);
        diamond(b, p.x, p.y, TILE_W, TILE_H, ((cx + cy) % 2) ? '#4a5334' : '#565e3a', '#3a4128');
      }
    }
    // Viñeta.
    const gv = b.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28, W / 2, H / 2, Math.max(W, H) * 0.72);
    gv.addColorStop(0, 'rgba(0,0,0,0)'); gv.addColorStop(1, 'rgba(6,5,2,0.72)');
    b.fillStyle = gv; b.fillRect(0, 0, W, H);
  }
  function diamond(c, x, y, w, h, fill, stroke) {
    c.beginPath();
    c.moveTo(x, y - h / 2); c.lineTo(x + w / 2, y); c.lineTo(x, y + h / 2); c.lineTo(x - w / 2, y); c.closePath();
    c.fillStyle = fill; c.fill();
    c.strokeStyle = stroke; c.lineWidth = 1; c.stroke();
  }

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (!t0) t0 = ts;
    const dt = Math.min(50, ts - t0); t0 = ts;
    update(dt);
    paint(ts);
  }

  function update(dt) {
    shake *= Math.pow(0.86, dt / 16);
    if (shake < 0.4) shake = 0;
    for (const f of floaters) f.t += dt;
    floaters = floaters.filter(f => f.t < f.dur);
    for (const s of slashes) s.t += dt;
    slashes = slashes.filter(s => s.t < s.dur);
    for (const u of units) { u.bob += dt / 520; if (u.flash > 0) u.flash = Math.max(0, u.flash - dt / 220); }

    if (!anim) return;
    anim.t += dt;
    const f = anim.t / anim.dur;

    if (anim.kind === 'intro') {
      if (anim.t >= anim.dur) { anim = null; nextTurnStart(); }
      return;
    }
    if (anim.kind === 'pause') {
      if (anim.t >= anim.dur) { anim = null; nextTurn(); }
      return;
    }
    if (anim.kind === 'attack' || anim.kind === 'enemyAtk') {
      // Embestida: sale hacia el objetivo y vuelve. dx/dy en px de pantalla.
      const by = anim.by, tg = anim.target;
      const from = cellToScreen(by.cell.x, by.cell.y);
      const to = cellToScreen(tg.cell.x, tg.cell.y);
      const dx = (to.x - from.x), dy = (to.y - from.y);
      const reach = 0.62;                 // no se solapa del todo con el objetivo
      let k;                              // 0=reposo, 1=pegado al objetivo
      if (f < 0.5) k = easeOut(f / 0.5); else k = 1 - easeInOut((f - 0.5) / 0.5);
      by.ox = dx * reach * k; by.oy = dy * reach * k - Math.sin(Math.min(1, f * 2) * Math.PI) * 10;
      // Impacto (una vez).
      if (!anim.impact && f >= anim.impactAt) { anim.impact = true; applyImpact(); }
      if (anim.t >= anim.dur) { by.ox = 0; by.oy = 0; animEnd(); }
      return;
    }
  }
  // El primer turno tras la intro.
  function nextTurnStart() {
    const u = cur();
    if (u && u.side === 'ally') openMenu(u); else if (u) enemyTurn(u); else nextTurn();
  }

  function paint(ts) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    // Sacudida de cámara.
    let sx = 0, sy = 0;
    if (shake > 0) { sx = rnd(-shake, shake); sy = rnd(-shake, shake) * 0.5; }
    ctx.save(); ctx.translate(sx, sy);
    // Arena horneada.
    if (bg) ctx.drawImage(bg, 0, 0, bg.width, bg.height, 0, 0, W, H);

    // Resaltar celda del objetivo en fase target.
    if (phase === 'target') {
      const foes = units.filter(x => x.side === 'foe' && alive(x));
      for (const fo of foes) {
        const p = cellToScreen(fo.cell.x, fo.cell.y);
        const on = units.indexOf(fo) === hovTarget;
        diamond(ctx, p.x, p.y, TILE_W, TILE_H, on ? 'rgba(200,60,40,0.5)' : 'rgba(200,120,40,0.22)', on ? '#f0c090' : '#a86a30');
      }
    }
    // Marca de "turno actual" bajo la unidad activa.
    const c = cur();
    if (c && (phase === 'menu' || phase === 'target')) {
      const p = cellToScreen(c.cell.x, c.cell.y);
      diamond(ctx, p.x, p.y, TILE_W, TILE_H, 'rgba(224,192,96,0.28)', '#e0c060');
    }

    // Unidades ordenadas por profundidad (suma de celda).
    const draworder = units.slice().sort((a, b) => (a.cell.x + a.cell.y) - (b.cell.x + b.cell.y));
    for (const u of draworder) drawUnit(u);

    // FX por encima.
    for (const s of slashes) drawSlash(s);
    for (const f of floaters) drawFloater(f);
    ctx.restore();

    // HUD (línea de turnos) fuera de la sacudida.
    drawTimeline();
  }

  function drawUnit(u) {
    const p = cellToScreen(u.cell.x, u.cell.y);
    const x = p.x + (u.ox || 0), y = p.y + (u.oy || 0);
    const bob = alive(u) ? Math.sin(u.bob) * 1.5 : 0;
    const spr = u.spr[u.dir];
    // Sombra.
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 20, 9, 0, 0, 6.283); ctx.fill();
    ctx.restore();
    if (!spr) return;
    const dw = CHAR_W * SPR_SCALE, dh = CHAR_H * SPR_SCALE;
    // Anclar los PIES (CHAR_FEET lógico) a la celda. Escala a pantalla ~0.9.
    const drawScale = 0.62;
    const w = dw * drawScale, h = dh * drawScale;
    const feetOff = (CHAR_FEET / CHAR_H) * h;
    const dx = x - w / 2, dy = y - feetOff + bob;
    ctx.save();
    if (!alive(u)) { ctx.globalAlpha = 0.35; }
    ctx.drawImage(spr, 0, 0, spr.width, spr.height, dx, dy, w, h);
    // Destello de impacto (tinte blanco/rojo).
    if (u.flash > 0) {
      ctx.globalAlpha = u.flash * 0.7;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(spr, 0, 0, spr.width, spr.height, dx, dy, w, h);
      ctx.fillStyle = u.side === 'foe' ? 'rgba(255,120,90,0.5)' : 'rgba(255,230,180,0.5)';
      ctx.globalCompositeOperation = 'source-atop';
    }
    ctx.restore();

    // Barra de vida bajo los pies (sigue al sprite en la embestida).
    drawHpBar(u, x, p.y + 8);
  }

  function drawHpBar(u, x, y) {
    if (!alive(u) && u.hp <= 0) return;
    const w = u.side === 'foe' ? 34 : 46, h = 5;
    ctx.save();
    ctx.fillStyle = 'rgba(10,7,3,0.7)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
    const pct = clamp(u.hp / u.maxHp, 0, 1);
    ctx.fillStyle = u.side === 'foe' ? '#c85434' : '#8ec062';
    ctx.fillRect(x - w / 2, y, w * pct, h);
    // Enemigo: marcas de "golpes" (2).
    if (u.side === 'foe') {
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1;
      for (let i = 1; i < u.maxHp; i++) { const gx = x - w / 2 + w * (i / u.maxHp); ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx, y + h); ctx.stroke(); }
    }
    ctx.restore();
  }

  function drawSlash(s) {
    const f = s.t / s.dur, a = 1 - f;
    ctx.save();
    ctx.translate(s.x, s.y); ctx.rotate(s.ang);
    ctx.globalAlpha = a;
    ctx.strokeStyle = s.foe ? '#ff8a6a' : (s.perfect ? '#ffe6a0' : '#f4f0e0');
    ctx.lineWidth = s.perfect ? 6 : 4; ctx.lineCap = 'round';
    const r = lerp(10, 46, easeOut(f));
    ctx.beginPath(); ctx.arc(0, 0, r, -0.9, 0.9); ctx.stroke();
    if (s.perfect) { ctx.globalAlpha = a * 0.6; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r + 6, -0.9, 0.9); ctx.stroke(); }
    ctx.restore();
  }

  function drawFloater(f) {
    const p = f.t / f.dur, y = f.y - p * 34;
    ctx.save();
    ctx.globalAlpha = 1 - Math.pow(p, 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (f.txt) {
      ctx.font = '700 15px "Noto Serif SC",serif';
      ctx.fillStyle = f.crit ? '#ffe08a' : (f.foe ? '#bfe0ff' : '#e6f0d0');
      ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3; ctx.strokeText(f.txt, f.x, y - 16); ctx.fillText(f.txt, f.x, y - 16);
    }
    ctx.font = '900 ' + (f.crit ? 26 : 20) + 'px "Noto Serif SC",serif';
    ctx.fillStyle = f.crit ? '#ffcf6a' : (f.foe ? '#ff9a80' : '#fff');
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 4;
    ctx.strokeText('-' + f.dmg, f.x, y); ctx.fillText('-' + f.dmg, f.x, y);
    ctx.restore();
  }

  // Línea de turnos (arriba a la derecha): retratos ensartados.
  function drawTimeline() {
    const host = root.querySelector('.cb-order');
    if (!host) return;
    // Construir la lista de los próximos ~6 turnos.
    const queue = [];
    let p = turnPtr, o = orden.slice();
    for (let i = 0; i < 6 && o.length; i++) { queue.push(o[p % o.length]); p++; }
    let html = '';
    queue.forEach((u, i) => {
      if (!u) return;
      html += '<div class="cb-ord ' + (i === 0 ? 'cur ' : '') + (u.side === 'foe' ? 'foe' : '') + '"><canvas class="cb-ord-c" width="88" height="88" data-uid="' + u.id + '"></canvas></div>';
    });
    if (host.dataset.sig !== queue.map(u => u && u.id).join(',') + phase) {
      host.dataset.sig = queue.map(u => u && u.id).join(',') + phase;
      host.innerHTML = html;
      host.querySelectorAll('.cb-ord-c').forEach(cnv => {
        const u = units.find(x => x.id === cnv.dataset.uid); if (!u || !u.portrait) return;
        const c2 = cnv.getContext('2d'); c2.imageSmoothingEnabled = false;
        c2.clearRect(0, 0, 88, 88);
        // Recorte circular del retrato (cabeza+torso).
        c2.save(); c2.beginPath(); c2.arc(44, 44, 42, 0, 6.283); c2.clip();
        const s = u.portrait; const sc = 88 / (CHAR_W); // encuadra a lo ancho
        c2.drawImage(s, 0, 0, s.width, s.height * 0.72, 44 - (CHAR_W * sc) / 2, 4, CHAR_W * sc, CHAR_H * 0.72 * sc);
        c2.restore();
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ENTRADA / DOM
  // ═══════════════════════════════════════════════════════════════════════
  function onPointer(e) {
    if (phase === 'over') return;
    if (phase === 'target') {
      // Elegir objetivo por cercanía al clic.
      const r = cv.getBoundingClientRect();
      const mx = (e.clientX - r.left), my = (e.clientY - r.top);
      const foes = units.filter(x => x.side === 'foe' && alive(x));
      let best = null, bd = 1e9;
      for (const fo of foes) { const p = cellToScreen(fo.cell.x, fo.cell.y); const d = (p.x - mx) ** 2 + (p.y - my - 40) ** 2; if (d < bd) { bd = d; best = fo; } }
      if (best) { hovTarget = units.indexOf(best); startAttack(cur(), best); }
      return;
    }
    onStrike();
  }
  function onKey(e) {
    if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); onStrike(); }
  }

  function init(rootEl, config) {
    root = rootEl; cfg = config || {};
    root.innerHTML =
      '<div class="cb-scene"><canvas class="cb-cv"></canvas></div>' +
      '<div class="cb-order"></div>' +
      '<div class="cb-hud"><div class="cb-log"></div><div class="cb-menu"></div></div>' +
      '<div class="cb-end"><div class="cb-end-box"><div class="cb-end-t"></div><div class="cb-end-s"></div>' +
      '<button class="cb-end-btn">Reintentar</button></div></div>';
    cv = root.querySelector('.cb-cv'); ctx = cv.getContext('2d');
    root.querySelector('.cb-end-btn').onclick = () => { root.querySelector('.cb-end').style.display = 'none'; nuevoEncuentro(cfg.foes); };
    cv.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', resize);
    resize();
    nuevoEncuentro(cfg.foes);
    // Modo DEMO (verificación headless): ?t=menu|attack|enemy → avanza síncrono y pinta,
    // SIN bucle RAF (headless lo frena/atropella) para congelar el frame elegido.
    const q = (typeof location !== 'undefined') && new URLSearchParams(location.search).get('t');
    if (q) { demoMode = true; setTimeout(() => runDemo(q), 200); return; }
    raf = requestAnimationFrame(frame);
  }

  // Verificación sin RAF (headless lo frena): avanza la simulación a mano y pinta 1 frame.
  function stepAnim(frac) { let guard = 0; while (anim && (anim.kind === 'attack' || anim.kind === 'enemyAtk') && anim.t < anim.dur * frac && guard++ < 500) update(18); }
  function runDemo(which) {
    resize();                 // re-bakea la arena con las dimensiones ya asentadas
    anim = null;
    const me = units.find(u => u.side === 'ally');
    const foe = units.find(u => u.side === 'foe' && alive(u));
    if (which === 'menu') { openMenu(me); paint(0); return; }
    if (which === 'enemy') { const e = units.find(u => u.side === 'foe'); enemyTurn(e); strikeHeld = false; stepAnim(0.60); paint(0); return; }
    // 'attack': ataque con TEMPO PERFECTO congelado justo tras el impacto (mecenas embistiendo).
    startAttack(me, foe); strikeHeld = true; stepAnim(0.53); paint(0);
  }

  return { init, _debug: () => ({ units, orden, phase, anim }) };
})();
if (typeof window !== 'undefined') window.Combate = Combate;
