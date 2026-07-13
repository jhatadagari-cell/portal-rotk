/* ═══════════════════════════════════════════════════════════════════════
   hac-encanim.js — VIÑETAS animadas de los encuentros de escaramuza.
   ─────────────────────────────────────────────────────────────────────────
   Al abrir el informe de una escaramuza resuelta, cada encuentro superado (o
   fallado) se anima en una pequeña escena: el mecenas que lo resolvió HACE algo
   con la banda (impulsarlos por un puente roto y saltar, batirse en duelo,
   parlamentar, gestionar suministros…). Al llegar al clímax se dispara onEnd()
   para que el panel revele «¡Éxito!» + la recompensa DESPUÉS de la acción.

   Reutiliza HacChar para dibujar a los mecenas (mismos sprites que la marcha).
   Los fotogramas se HORNEAN una vez por (actor,dir,frame,pose) y se cachean:
   nunca se reprocesan por frame (cf. «FPS de la finca = prioridad»).

     HacEncAnim.play(canvas, {
       scene:    'bridge' | 'duel' | 'parley' | 'supply',
       obstacle: 'chasm' | 'wall',          // solo 'bridge'
       ok:       bool,                        // desenlace
       hero:     { aptitud, aspecto },        // el mecenas que resolvió
       heroName: string,
       members:  [{ aptitud, aspecto }],      // el resto de la banda (a impulsar)
       onEnd:    fn()                          // se llama UNA vez, al clímax
     }) → { stop() }
   ═══════════════════════════════════════════════════════════════════════ */
const HacEncAnim = (function () {
  'use strict';

  // ── Geometría del sprite horneado (HacChar: W40 H56, pies y=51, eje x=20) ──
  const BS = 2;                              // escala de horneado (nítido)
  const SC = 0.82;                           // factor de dibujo (tamaño en escena)
  const CW = 40, CH = 56, CFEET = 51, CCX = 20;
  const BW = CW * BS, BH = CH * BS;          // 80×112 lienzo horneado
  const dW = BW * SC, dH = BH * SC;
  const dFeet = CFEET * BS * SC, dCX = CCX * BS * SC;

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, p) => a + (b - a) * p;
  const seg = (t, s, d) => clamp((t - s) / d, 0, 1);       // 0..1 en [s, s+d]
  const easeOut = (p) => 1 - (1 - p) * (1 - p);
  const easeIn = (p) => p * p;
  const arch = (p) => 4 * p * (1 - p);                     // 0→1→0 (parábola de salto)
  const reduce = () => { try { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

  // ── Horneado de sprites (cache por actor+dir+frame+pose) ────────────────
  function makeBaker() {
    const cache = new Map();
    let seq = 0;
    return function bake(actor, dir, frame, pose) {
      if (!actor._k) actor._k = 'a' + (seq++);
      const key = actor._k + '|' + dir + '|' + (frame | 0) + '|' + (pose || '');
      let c = cache.get(key);
      if (!c && window.HacChar) {
        c = document.createElement('canvas');
        HacChar.draw(c, { aptitud: actor.aptitud, aspecto: actor.aspecto || {}, dir: dir, frame: frame, scale: BS, pose: pose });
        cache.set(key, c);
      }
      return c || null;
    };
  }

  // ══ helpers de dibujo ══════════════════════════════════════════════════
  function shadow(ctx, cx, gy, jump, w) {
    const k = clamp(1 - (jump || 0) / 90, 0.4, 1);
    ctx.save(); ctx.globalAlpha = 0.26 * k; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(cx, gy + 1, (w || dW) * 0.28 * k, 4.6 * k, 0, 0, 6.283); ctx.fill();
    ctx.restore();
  }
  // Dibuja un actor con su sprite horneado, pies en (cx, gy), elevado `jump` px.
  function actorAt(ctx, bake, actor, dir, frame, cx, gy, jump, pose, opt) {
    opt = opt || {};
    const img = bake(actor, dir, frame, pose); if (!img) return;
    if (opt.shadow !== false) shadow(ctx, cx, gy, jump);
    ctx.save();
    if (opt.tilt) { ctx.translate(cx, gy - jump); ctx.rotate(opt.tilt); ctx.translate(-cx, -(gy - jump)); }
    if (opt.alpha != null) ctx.globalAlpha = opt.alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, BW, BH, cx - dCX, gy - dFeet - (jump || 0), dW, dH);
    // Aura dorada del jugador (halo tenue bajo los pies) si es "mío".
    ctx.restore();
    if (actor.mio) {
      ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = '#e7c66a'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.ellipse(cx, gy + 1, dW * 0.30, 5, 0, 0, 6.283); ctx.stroke(); ctx.restore();
    }
  }
  // Fondo: cielo crepuscular + banda de suelo (paleta de la marcha).
  function backdrop(ctx, W, H, gy, tone) {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, tone && tone.top || '#33342a');
    sky.addColorStop(0.55, '#26251d'); sky.addColorStop(1, '#171410');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    // Estandartes lejanos (decoración estática, barata).
    ctx.save(); ctx.globalAlpha = 0.5;
    [[W * 0.14, '#7a3b34'], [W * 0.86, '#4e6f8f']].forEach(([bx, col]) => {
      ctx.fillStyle = '#2a2118'; ctx.fillRect(bx - 1, gy - 44, 2, 44);
      ctx.fillStyle = col; ctx.fillRect(bx - 1, gy - 44, 12, 15);
    });
    ctx.restore();
    // Suelo.
    const g = ctx.createLinearGradient(0, gy - 8, 0, H);
    g.addColorStop(0, '#3a3527'); g.addColorStop(0.25, '#2b2618'); g.addColorStop(1, '#1a150e');
    ctx.fillStyle = g; ctx.fillRect(0, gy - 6, W, H - gy + 6);
    ctx.fillStyle = 'rgba(201,168,76,.12)'; ctx.fillRect(0, gy - 6, W, 1.5);
  }
  // Nubecilla de habla (parlamento) o de esfuerzo, sobre la cabeza.
  function bubble(ctx, cx, cy, dots, col) {
    ctx.save();
    ctx.fillStyle = col || 'rgba(234,223,206,.92)';
    for (let i = 0; i < 3; i++) {
      const on = i < dots;
      ctx.globalAlpha = on ? 0.95 : 0.18;
      ctx.beginPath(); ctx.arc(cx - 6 + i * 6, cy, 2.1, 0, 6.283); ctx.fill();
    }
    ctx.restore();
  }
  function coin(ctx, x, y, r) {
    ctx.save();
    ctx.fillStyle = '#e7c66a'; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#a9812f'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.fillStyle = '#7a5c1e'; const s = r * 0.5; ctx.fillRect(x - s / 2, y - s / 2, s, s);
    ctx.restore();
  }
  // Destello de choque (duelo).
  function spark(ctx, x, y, r, a) {
    ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#f4e6b0'; ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) { const an = i * 1.047; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r); ctx.stroke(); }
    ctx.fillStyle = '#fff'; ctx.globalAlpha = a * 0.9; ctx.beginPath(); ctx.arc(x, y, r * 0.35, 0, 6.283); ctx.fill();
    ctx.restore();
  }
  // Gota de sudor / signo de esfuerzo (vacilación).
  function sweat(ctx, cx, cy, a) {
    ctx.save(); ctx.globalAlpha = a == null ? 0.9 : a; ctx.fillStyle = '#bfe0ea';
    ctx.beginPath(); ctx.ellipse(cx, cy, 1.8, 2.6, 0, 0, 6.283); ctx.fill(); ctx.restore();
  }
  // Polvareda / choque sordo (aldeanos a las manos).
  function dust(ctx, cx, gy, a) {
    ctx.save(); ctx.globalAlpha = (a == null ? 0.5 : a);
    for (let i = 0; i < 5; i++) { ctx.fillStyle = i % 2 ? 'rgba(180,160,130,.5)' : 'rgba(140,120,96,.5)'; const an = i * 1.25; ctx.beginPath(); ctx.arc(cx + Math.cos(an) * 9, gy - 6 + Math.sin(an) * 5, 3 - i * 0.3, 0, 6.283); ctx.fill(); }
    ctx.restore();
  }
  // Líneas de garra (zarpazo de la fiera).
  function clawMarks(ctx, cx, cy, a) {
    ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#e2554a'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(cx - 10 + i * 5, cy - 12); ctx.lineTo(cx + 6 + i * 5, cy + 12); ctx.stroke(); }
    ctx.restore();
  }

  // ══ FIGURANTES SINTÉTICOS ═══════════════════════════════════════════════
  // Arquetipos (aptitud + aspecto) para hornear con HacChar como el héroe. Los
  // props de la aptitud (lanza del guerrero, etc.) refuerzan el papel.
  const ARQ = {
    bandido:     { aptitud: 'guerrero',      aspecto: { robe: '#4a3b2c', accent: '#7a6b4a', piel: 3, pelo: 4 } },
    oficial:     { aptitud: 'guerrero',      aspecto: { robe: '#3b322c', accent: '#b8b0a0', piel: 3, pelo: 3 } },
    soldado:     { aptitud: 'guerrero',      aspecto: { robe: '#4d5b6a', accent: '#cfd6de', piel: 2, pelo: 2 } },
    poeta:       { aptitud: 'erudito',       aspecto: { robe: '#6a5b3a', accent: '#eae4d2', piel: 1, pelo: 1 } },
    monje:       { aptitud: 'erudito',       aspecto: { robe: '#8a8378', accent: '#c9b98a', piel: 2, pelo: 5 } },
    funcionario: { aptitud: 'canciller',     aspecto: { robe: '#5a3f7a', accent: '#d8b65a', piel: 1, pelo: 2 } },
    mercader:    { aptitud: 'administrador', aspecto: { robe: '#7a5a34', accent: '#d8b65a', piel: 2, pelo: 3 } },
    aldeanoA:    { aptitud: 'administrador', aspecto: { robe: '#6b5a44', accent: '#9a8a6a', piel: 3, pelo: 3 } },
    aldeanoB:    { aptitud: 'erudito',       aspecto: { robe: '#5a6b4a', accent: '#9aa07a', piel: 2, pelo: 4 } },
  };
  // Qué figurante(s) intervienen en cada escena nueva (0, 1 o 2). Las escenas
  // legacy (bridge/duel/parley/supply) conservan su `foe` propio (ver play()).
  const SCENE_FOES = {
    emboscada: ['bandido', 'bandido'], duelo: ['oficial'], fiera: [], patrulla: ['soldado', 'soldado'],
    inscripciones: [], poeta: ['poeta'], rumor: ['aldeanoA'], copista: ['monje'],
    mercader: ['mercader'], peaje: ['funcionario'], disputa: ['aldeanoA', 'aldeanoB'], contrato: ['mercader'],
  };
  // Clona un arquetipo (aspecto propio) para que `bake` le asigne su clave de caché.
  const cloneArq = (id) => id && ARQ[id] ? { aptitud: ARQ[id].aptitud, aspecto: Object.assign({}, ARQ[id].aspecto) } : null;
  // Figurante(s) de una escena. Escenas legacy (bridge/duel/parley/supply): foe único.
  function foesFor(scene) {
    const ids = SCENE_FOES[scene];
    if (ids) return { foe: cloneArq(ids[0]), foe2: cloneArq(ids[1]) };
    const legacy = scene === 'parley'
      ? { aptitud: 'erudito', aspecto: { robe: '#6a5b3a', piel: 1, pelo: 1 } }
      : { aptitud: 'guerrero', aspecto: { robe: '#3b322c', piel: 3, pelo: 3 } };
    return { foe: legacy, foe2: null };
  }

  // ══ PROPS PROCEDURALES ══════════════════════════════════════════════════
  // Paredes rocosas que enmarcan un desfiladero (emboscada).
  function drawRocks(ctx, W, gy) {
    ctx.save();
    const rock = (x0, w, h) => {
      const g = ctx.createLinearGradient(0, gy - h, 0, gy);
      g.addColorStop(0, '#4a4038'); g.addColorStop(1, '#26201a');
      ctx.fillStyle = g; ctx.beginPath();
      ctx.moveTo(x0, gy + 2); ctx.lineTo(x0 + w * 0.12, gy - h * 0.88); ctx.lineTo(x0 + w * 0.42, gy - h);
      ctx.lineTo(x0 + w * 0.74, gy - h * 0.66); ctx.lineTo(x0 + w, gy - h * 0.82); ctx.lineTo(x0 + w, gy + 2);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.32)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0 + w * 0.42, gy - h); ctx.lineTo(x0 + w * 0.5, gy - h * 0.35); ctx.stroke();
    };
    rock(-12, W * 0.30, 74); rock(W * 0.80, W * 0.32, 66);
    ctx.restore();
  }
  // Un gran felino procedural (vista lateral). opt: {dir:±1, jump, scale, run, phase}.
  function drawTiger(ctx, x, gy, opt) {
    opt = opt || {}; const s = opt.scale || 1, dir = opt.dir || 1, jump = opt.jump || 0, ph = opt.phase || 0;
    ctx.save(); ctx.globalAlpha = 0.22; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(x, gy + 1, 26 * s, 5, 0, 0, 6.283); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(x, gy - jump); ctx.scale(dir * s, s);
    const O = '#c8792f', Od = '#9c5a1e', L = '#e6c79a', K = '#241812';
    ctx.strokeStyle = O; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-22, -12); ctx.quadraticCurveTo(-36, -18, -30, -3); ctx.stroke();  // cola
    ctx.fillStyle = Od; [-15, -8, 7, 15].forEach((lx, i) => { const ll = opt.run ? Math.max(0, Math.sin(ph + i * 1.6)) * 3 : 0; ctx.fillRect(lx, -7 - ll, 3, 8); });  // patas
    ctx.fillStyle = O; ctx.beginPath(); ctx.ellipse(-2, -11, 22, 9, 0, 0, 6.283); ctx.fill();          // cuerpo
    ctx.beginPath(); ctx.ellipse(-16, -12, 8, 8, 0, 0, 6.283); ctx.fill();                              // grupa
    ctx.fillStyle = L; ctx.beginPath(); ctx.ellipse(-4, -7, 15, 4, 0, 0, 6.283); ctx.fill();            // vientre
    ctx.fillStyle = O; ctx.beginPath(); ctx.arc(20, -15, 7, 0, 6.283); ctx.fill();                      // cabeza
    ctx.beginPath(); ctx.moveTo(15, -21); ctx.lineTo(17, -25); ctx.lineTo(20, -20); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(23, -20); ctx.lineTo(25, -25); ctx.lineTo(27, -21); ctx.closePath(); ctx.fill();
    ctx.fillStyle = L; ctx.beginPath(); ctx.arc(25, -12, 3, 0, 6.283); ctx.fill();                      // hocico
    ctx.fillStyle = K; ctx.fillRect(22, -17, 2, 2); ctx.fillRect(26, -12, 1, 1);                        // ojo + nariz
    ctx.strokeStyle = K; ctx.lineWidth = 1.5; [-14, -9, -4, 1, 6, 11].forEach(sx => { ctx.beginPath(); ctx.moveTo(sx, -18); ctx.lineTo(sx - 2, -4); ctx.stroke(); });
    ctx.restore();
  }
  // Columnas caídas (santuario en ruinas).
  function drawRuins(ctx, W, gy) {
    ctx.save();
    for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#5c5346' : '#6b6153'; ctx.fillRect(W * 0.07 + i * 15, gy - 7, 14, 9); ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(W * 0.07 + i * 15, gy - 2, 14, 2); }
    ctx.fillStyle = '#6b6153'; ctx.fillRect(W * 0.07, gy - 22, 12, 16); ctx.fillStyle = '#5c5346'; ctx.fillRect(W * 0.07 + 9, gy - 22, 3, 16);   // tocón de columna en pie
    ctx.restore();
  }
  // Estela de piedra con glifos; `glow` (0..1) los enciende (éxito cultural).
  function drawStele(ctx, x, gy, glow) {
    ctx.save();
    ctx.fillStyle = '#7a7062'; ctx.fillRect(x - 9, gy - 46, 18, 46);
    ctx.fillStyle = '#8a8072'; ctx.fillRect(x - 9, gy - 46, 18, 2);
    ctx.fillStyle = '#5c5346'; ctx.fillRect(x + 7, gy - 46, 2, 46);
    if (glow) { ctx.save(); ctx.globalAlpha = glow * 0.4; ctx.fillStyle = '#e9c66a'; ctx.fillRect(x - 11, gy - 48, 22, 50); ctx.restore(); }
    for (let r = 0; r < 5; r++) for (let cc = 0; cc < 2; cc++) { ctx.fillStyle = glow ? 'rgba(233,198,106,' + (0.5 + glow * 0.5) + ')' : 'rgba(30,24,18,.55)'; ctx.fillRect(x - 5 + cc * 7, gy - 40 + r * 8, 4, 4); }
    ctx.restore();
  }
  // Rincón de posada: mesa, jarra y farol colgante que derrama luz cálida.
  function drawTavern(ctx, W, gy) {
    ctx.save();
    ctx.fillStyle = '#5a4326'; ctx.fillRect(W * 0.52, gy - 14, W * 0.32, 6);
    ctx.fillStyle = '#3a2c17'; ctx.fillRect(W * 0.56, gy - 8, 4, 8); ctx.fillRect(W * 0.80, gy - 8, 4, 8);
    ctx.fillStyle = '#8a7a5a'; ctx.fillRect(W * 0.62, gy - 20, 5, 6);
    const lx = W * 0.70, ly = gy - 54;
    ctx.strokeStyle = '#3a2c17'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lx, 6); ctx.lineTo(lx, ly); ctx.stroke();
    const glow = ctx.createRadialGradient(lx, ly + 6, 2, lx, ly + 6, 30);
    glow.addColorStop(0, 'rgba(255,200,90,.45)'); glow.addColorStop(1, 'rgba(255,200,90,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(lx, ly + 6, 30, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#e7c66a'; ctx.fillRect(lx - 4, ly, 8, 11); ctx.fillStyle = '#7a5c1e'; ctx.fillRect(lx - 4, ly, 8, 2);
    ctx.restore();
  }
  // Franja de agua de un vado (mercader varado).
  function drawFord(ctx, W, gy) {
    ctx.save();
    const g = ctx.createLinearGradient(0, gy, 0, gy + 44);
    g.addColorStop(0, '#3a5a66'); g.addColorStop(1, '#20343c');
    ctx.fillStyle = g; ctx.fillRect(0, gy + 2, W, 44);
    ctx.fillStyle = 'rgba(200,220,230,.13)'; for (let i = 0; i < 6; i++) ctx.fillRect(i * W / 6 + 8, gy + 8 + (i % 3) * 5, 22, 1);
    ctx.restore();
  }
  // Carro (de dos ruedas). `tilt` lo inclina; usado también volcado.
  function drawCartProp(ctx, x, gy, tilt) {
    ctx.save(); ctx.translate(x, gy); ctx.rotate(tilt || 0);
    ctx.fillStyle = '#6b4f2c'; ctx.fillRect(-20, -22, 40, 16);
    ctx.fillStyle = '#8a6636'; ctx.fillRect(-20, -22, 40, 3);
    [-12, 12].forEach(wx => { ctx.fillStyle = '#3a2c17'; ctx.beginPath(); ctx.arc(wx, -4, 6, 0, 6.283); ctx.fill(); ctx.fillStyle = '#5a4326'; ctx.beginPath(); ctx.arc(wx, -4, 2.4, 0, 6.283); ctx.fill(); });
    ctx.restore();
  }
  // Mesa baja con pergamino (copista / contrato). `fill` 0..1 llena de renglones;
  // `seal` dibuja el sello de laca ya estampado.
  function drawDesk(ctx, x, gy, fill, seal) {
    ctx.save();
    ctx.fillStyle = '#5a4326'; ctx.fillRect(x - 22, gy - 12, 44, 5); ctx.fillStyle = '#3a2c17'; ctx.fillRect(x - 20, gy - 7, 3, 7); ctx.fillRect(x + 17, gy - 7, 3, 7);
    ctx.fillStyle = '#efe4c4'; ctx.fillRect(x - 16, gy - 17, 32, 6); ctx.fillStyle = '#d8cba6'; ctx.fillRect(x - 16, gy - 12, 32, 1);
    if (fill > 0) { ctx.fillStyle = 'rgba(40,30,20,.7)'; const n = Math.min(5, Math.floor(fill * 5)); for (let i = 0; i < n; i++) ctx.fillRect(x - 13 + i * 6, gy - 15, 4, 1); }
    if (seal) { ctx.fillStyle = '#b0342a'; ctx.beginPath(); ctx.arc(x + 10, gy - 14, 2.6, 0, 6.283); ctx.fill(); }
    ctx.restore();
  }
  // Mancha de tinta derramada (fracaso copista).
  function inkBlot(ctx, x, y, r) {
    ctx.save(); ctx.fillStyle = 'rgba(20,16,28,.85)';
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, 0, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * 0.7, y - r * 0.3, r * 0.35, 0, 6.283); ctx.fill(); ctx.restore();
  }

  // ══ ESCENAS ════════════════════════════════════════════════════════════
  // Cada escena: draw(ctx, W, H, t, S) donde S = estado compartido. Devuelven
  // nada; el clímax se decide por tiempo en climaxOf(). Tras el clímax siguen
  // en un bucle de reposo (jamás se congelan del todo).

  // Reparte a las víctimas del "boost" en la orilla lejana.
  function farSpots(W, i) { return W * 0.66 + i * (W * 0.075); }

  // ── BRIDGE: impulsar a la banda por un puente roto / muro y saltar. ──────
  function drawObstacle(ctx, W, gy, obstacle) {
    const gapL = W * 0.44, gapR = W * 0.60;
    if (obstacle === 'wall') {
      // Empalizada de troncos en el centro.
      const x0 = W * 0.47, w = W * 0.06, top = gy - 40;
      for (let i = 0; i < 4; i++) {
        const lx = x0 + i * (w / 4);
        ctx.fillStyle = i % 2 ? '#5a4326' : '#6b4f2c'; ctx.fillRect(lx, top, w / 4 - 0.5, gy - top);
        ctx.fillStyle = '#3a2c17'; ctx.beginPath(); ctx.moveTo(lx, top); ctx.lineTo(lx + w / 8, top - 5); ctx.lineTo(lx + w / 4 - 0.5, top); ctx.fill();
      }
      return { gapL: x0 - 4, gapR: x0 + w + 4, wall: true };
    }
    // Barranco: hueco oscuro + tablones rotos colgando.
    const grad = ctx.createLinearGradient(0, gy - 4, 0, gy + 60);
    grad.addColorStop(0, '#120f0a'); grad.addColorStop(1, 'rgba(10,8,6,0)');
    ctx.save();
    ctx.fillStyle = '#0d0b07';
    ctx.beginPath(); ctx.moveTo(gapL, gy - 6); ctx.lineTo(gapR, gy - 6); ctx.lineTo(gapR + 8, gy + 70); ctx.lineTo(gapL - 8, gy + 70); ctx.closePath(); ctx.fill();
    ctx.fillStyle = grad; ctx.fillRect(gapL - 10, gy - 6, gapR - gapL + 20, 70);
    // Tablón roto asomando desde la orilla izquierda.
    ctx.fillStyle = '#5a4326'; ctx.save(); ctx.translate(gapL, gy - 6); ctx.rotate(0.20);
    ctx.fillRect(0, -3, (gapR - gapL) * 0.42, 5); ctx.restore();
    ctx.fillStyle = '#4a371f'; ctx.save(); ctx.translate(gapR, gy - 6); ctx.rotate(-0.15);
    ctx.fillRect(-(gapR - gapL) * 0.30, -3, (gapR - gapL) * 0.30, 5); ctx.restore();
    // Cuerda de resto de puente.
    ctx.strokeStyle = 'rgba(120,96,60,.6)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(gapL, gy - 8); ctx.quadraticCurveTo((gapL + gapR) / 2, gy + 10, gapR, gy - 8); ctx.stroke();
    ctx.restore();
    return { gapL, gapR, wall: false };
  }

  function sceneBridge(ctx, W, H, t, S) {
    const gy = S.gy, ok = S.ok, hero = S.hero, allies = S.allies, k = allies.length;
    backdrop(ctx, W, H, gy, { top: '#33342a' });
    const ob = drawObstacle(ctx, W, gy, S.obstacle);
    const edgeX = ob.gapL - 20;                        // dónde espera el héroe
    const T_INTRO = 620, T_BOOST = 780, T_LEAP = 1120;
    const fr = (x) => Math.floor(x / 140) % 4;         // fotograma de andar

    if (ok) {
      // Cada aliado se aproxima y es impulsado al otro lado; luego el héroe salta.
      const queueX = (i) => W * 0.10 + i * 20;
      // Posición de cada aliado según la línea temporal.
      allies.forEach((al, i) => {
        const bs = T_INTRO + i * T_BOOST;
        let x, jump = 0, dir = 'SE', frame = fr(t + i * 60), pose;
        const spot = farSpots(W, i);
        if (t < T_INTRO) { x = lerp(-30 - i * 22, queueX(i), easeOut(seg(t, 0, T_INTRO))); }
        else if (t < bs) { x = queueX(i); frame = 0; }                       // esperando turno
        else if (t < bs + 300) { x = lerp(queueX(i), edgeX - 14, easeOut(seg(t, bs, 300))); }  // se acerca
        else if (t < bs + 460) { const p = seg(t, bs + 300, 460); x = lerp(edgeX - 14, spot, p); jump = arch(p) * 54; frame = 1; }  // ¡vuela!
        else { x = spot; jump = 0; frame = 0; }
        actorAt(ctx, S.bake, al, dir, frame, x, gy, jump, pose);
        if (t >= bs + 300 && t < bs + 340) { // línea de impulso
          ctx.save(); ctx.strokeStyle = 'rgba(244,230,176,.7)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(edgeX - 8, gy - 6); ctx.lineTo(edgeX - 2, gy - 20); ctx.stroke(); ctx.restore();
        }
      });
      // Héroe: espera junto al borde impulsando (bob), luego coge carrerilla y SALTA.
      const leapStart = T_INTRO + k * T_BOOST;
      let hx = edgeX, hj = 0, hframe = 0, hdir = 'SE';
      // ¿está impulsando a alguien ahora? → pequeño empuje (crouch).
      let boosting = false;
      allies.forEach((al, i) => { const bs = T_INTRO + i * T_BOOST; if (t >= bs + 280 && t < bs + 380) boosting = true; });
      if (t < T_INTRO) { hx = lerp(-20, edgeX, easeOut(seg(t, 0, T_INTRO))); }
      else if (t < leapStart) { hx = edgeX; hj = boosting ? 4 : 0; hframe = 0; }
      else if (t < leapStart + 240) { hx = lerp(edgeX, edgeX - 16, easeOut(seg(t, leapStart, 240))); hdir = 'SW'; }  // retrocede
      else if (t < leapStart + 420) { hx = lerp(edgeX - 16, ob.gapL - 6, easeIn(seg(t, leapStart + 240, 180))); hframe = fr(t * 1.4); }  // carrerilla
      else if (t < leapStart + T_LEAP) { const p = seg(t, leapStart + 420, T_LEAP - 420); hx = lerp(ob.gapL - 6, farSpots(W, k), p); hj = arch(p) * 66; hframe = 1; }
      else { // clímax pasado → reposo con saltitos de celebración
        const rest = t - (leapStart + T_LEAP);
        hx = farSpots(W, k); hj = Math.abs(Math.sin(rest / 240)) * 5;
      }
      actorAt(ctx, S.bake, hero, hdir, hframe, hx, gy, hj);
      // Celebración: aliados también dan saltitos tras cruzar todos.
      if (t > leapStart + T_LEAP) {
        allies.forEach((al, i) => {
          const rest = t - (leapStart + T_LEAP) - i * 90;
          if (rest > 0) actorAt(ctx, S.bake, al, 'S', 0, farSpots(W, i), gy, Math.abs(Math.sin(rest / 240)) * 4);
        });
      }
    } else {
      // FRACASO cómico: primer intento se queda corto; el aliado cae al borde y lo
      // rescatan; el héroe se lleva las manos a la cabeza. Los demás esperan.
      const fail0 = allies[0];
      const bs = T_INTRO;
      const mid = (ob.gapL + ob.gapR) / 2;
      // héroe junto al borde
      let hx = edgeX, hframe = 0, hdir = 'SE', hj = 0, htilt = 0;
      if (t < T_INTRO) hx = lerp(-20, edgeX, easeOut(seg(t, 0, T_INTRO)));
      // aliados que esperan (2..k)
      allies.forEach((al, i) => {
        if (i === 0) return;
        const x = t < T_INTRO ? lerp(-30 - i * 22, W * 0.10 + i * 20, easeOut(seg(t, 0, T_INTRO))) : W * 0.10 + i * 20;
        actorAt(ctx, S.bake, al, 'SE', 0, x, gy, 0);
      });
      // aliado 0: se acerca, salta, se queda corto, patalea y lo tiran atrás
      let ax, aj = 0, aframe = 0, atilt = 0;
      if (t < T_INTRO) ax = lerp(-30, W * 0.10, easeOut(seg(t, 0, T_INTRO)));
      else if (t < bs + 300) ax = lerp(W * 0.10, edgeX - 14, easeOut(seg(t, bs, 300)));
      else if (t < bs + 520) { const p = seg(t, bs + 300, 220); ax = lerp(edgeX - 14, mid, p); aj = arch(p) * 30; aframe = 1; }   // salto corto
      else if (t < bs + 760) { const p = seg(t, bs + 520, 240); ax = mid; aj = lerp(28, -6, p); atilt = Math.sin(t / 40) * 0.12; }  // cae y patalea
      else { const p = seg(t, bs + 760, 360); ax = lerp(mid, edgeX - 14, easeOut(p)); aj = lerp(-6, 0, p); atilt = 0; }             // lo rescatan
      actorAt(ctx, S.bake, fail0, 'SE', aframe, ax, gy, aj, undefined, { tilt: atilt });
      // héroe reacciona: manos a la cabeza (temblor) tras el fallo
      if (t >= bs + 520) { hj = 0; htilt = Math.sin(t / 70) * 0.06; hframe = 0; }
      actorAt(ctx, S.bake, hero, hdir, hframe, hx, gy, hj, undefined, { tilt: htilt });
      if (t >= bs + 300 && t < bs + 520) bubble(ctx, ax, gy - dH + 6, ((t / 120) | 0) % 3 + 1, 'rgba(226,160,106,.9)');
    }
  }

  // ── DUEL: el mecenas se bate con un oficial enemigo. ─────────────────────
  function sceneDuel(ctx, W, H, t, S) {
    const gy = S.gy, ok = S.ok, hero = S.hero, foe = S.foe;
    backdrop(ctx, W, H, gy, { top: '#302a22' });
    const cx = W * 0.5, T_IN = 560, T_CLASH = 520;
    let hx, fx, hframe = 0, fframe = 0, htilt = 0, ftilt = 0, ha = 1, fa = 1, hj = 0, fj = 0;
    if (t < T_IN) {
      const p = easeOut(seg(t, 0, T_IN));
      hx = lerp(-24, cx - 42, p); fx = lerp(W + 24, cx + 42, p);
      hframe = Math.floor(t / 130) % 4; fframe = hframe;
    } else if (t < T_IN + T_CLASH) {
      const p = seg(t, T_IN, T_CLASH);
      const lunge = arch(clamp(p * 1.4, 0, 1));
      hx = cx - 42 + lunge * 30; fx = cx + 42 - lunge * 30;
      if (p > 0.42 && p < 0.7) spark(ctx, cx, gy - dH * 0.55, 12 + Math.sin(t / 30) * 4, 0.9);
    } else {
      // resolución: el perdedor sale despedido y cae.
      const p = seg(t, T_IN + T_CLASH, 520);
      if (ok) {
        hx = cx - 28; fx = lerp(cx + 12, cx + 60, easeOut(p)); ftilt = lerp(0, 1.1, easeOut(p)); fj = arch(p) * 10; fa = lerp(1, 0.55, p);
        hj = t > T_IN + T_CLASH + 300 ? Math.abs(Math.sin(t / 240)) * 5 : 0;   // celebra
      } else {
        fx = cx + 28; hx = lerp(cx - 12, cx - 60, easeOut(p)); htilt = lerp(0, -1.0, easeOut(p)); hj = arch(p) * 8; ha = lerp(1, 0.7, p);
      }
    }
    // dibuja al que está detrás primero (por si se solapan)
    actorAt(ctx, S.bake, foe, 'SW', fframe, fx, gy, fj, undefined, { tilt: ftilt, alpha: fa, shadow: fa > 0.6 });
    actorAt(ctx, S.bake, hero, 'SE', hframe, hx, gy, hj, undefined, { tilt: htilt, alpha: ha });
  }

  // ── PARLEY: el mecenas parlamenta con un enviado. ────────────────────────
  function sceneParley(ctx, W, H, t, S) {
    const gy = S.gy, ok = S.ok, hero = S.hero, foe = S.foe;
    backdrop(ctx, W, H, gy, { top: '#2c3226' });
    const T_IN = 560, T_TALK = 1500;
    let hx = W * 0.36, fx = W * 0.64, hframe = 0, fframe = 0, hpose, fpose, hj = 0, fj = 0, hdir = 'SE', fdir = 'SW';
    if (t < T_IN) {
      const p = easeOut(seg(t, 0, T_IN));
      hx = lerp(-24, W * 0.37, p); fx = lerp(W + 24, W * 0.63, p);
      hframe = Math.floor(t / 130) % 4; fframe = hframe;
    } else if (t < T_IN + T_TALK) {
      const p = t - T_IN;
      hx = W * 0.37; fx = W * 0.63;
      hj = Math.max(0, Math.sin(p / 260)) * 2; fj = Math.max(0, Math.sin((p + 600) / 260)) * 2;   // gesticulan por turnos
      if ((Math.floor(p / 520) % 2) === 0) bubble(ctx, hx, gy - dH + 4, ((p / 150) | 0) % 3 + 1);
      else bubble(ctx, fx, gy - dH + 4, ((p / 150) | 0) % 3 + 1);
    } else {
      const p = seg(t, T_IN + T_TALK, 560);
      hx = W * 0.37; fx = W * 0.63;
      if (ok) { hpose = 'bow'; fpose = 'bow'; }                          // reverencia mutua (acuerdo)
      else { fdir = 'SE'; fx = lerp(W * 0.63, W + 30, easeIn(p)); }      // el enviado se marcha
    }
    actorAt(ctx, S.bake, hero, hdir, hframe, hx, gy, hj, hpose);
    actorAt(ctx, S.bake, foe, fdir, fframe, fx, gy, fj, fpose);
  }

  // ── SUPPLY: el mecenas organiza suministros; monedas al aire. ────────────
  function drawCart(ctx, x, gy, tilt) {
    ctx.save(); ctx.translate(x, gy); ctx.rotate(tilt || 0);
    ctx.fillStyle = '#6b4f2c'; ctx.fillRect(-20, -22, 40, 16);
    ctx.fillStyle = '#8a6636'; ctx.fillRect(-20, -22, 40, 3);
    ctx.fillStyle = '#3a2c17';
    [-12, 12].forEach(wx => { ctx.beginPath(); ctx.arc(wx, -4, 6, 0, 6.283); ctx.fill(); ctx.fillStyle = '#5a4326'; ctx.beginPath(); ctx.arc(wx, -4, 2.4, 0, 6.283); ctx.fill(); ctx.fillStyle = '#3a2c17'; });
    ctx.restore();
  }
  function sceneSupply(ctx, W, H, t, S) {
    const gy = S.gy, ok = S.ok, hero = S.hero;
    backdrop(ctx, W, H, gy, { top: '#2b2f34' });
    const T_IN = 620, T_WORK = 1200;
    const cartX = W * 0.58;
    let hx = W * 0.42, hframe = 0, hj = 0, htilt = 0, cartTilt = 0;
    if (t < T_IN) { hx = lerp(-24, W * 0.42, easeOut(seg(t, 0, T_IN))); hframe = Math.floor(t / 130) % 4; }
    else if (t < T_IN + T_WORK) { const p = t - T_IN; hj = Math.max(0, Math.sin(p / 180)) * 3; hframe = 0; }  // carga (bob)
    // monedas: durante el trabajo y al desenlace
    const coins = [];
    if (t > T_IN + 200) {
      for (let i = 0; i < 6; i++) {
        const born = T_IN + 200 + i * 180;
        const life = t - born; if (life < 0 || life > 1400) continue;
        const p = life / 1400;
        const cx = cartX + Math.cos(i * 1.7) * 14;
        const cy = gy - 18 - arch(p) * (ok ? 46 : 12) + (ok ? 0 : p * 30);
        coins.push([cx + Math.sin(i) * p * (ok ? 8 : 26), cy, 3]);
      }
    }
    // desenlace
    if (t > T_IN + T_WORK) {
      const p = seg(t, T_IN + T_WORK, 560);
      if (ok) { hj = Math.abs(Math.sin(t / 240)) * 5; }         // celebra
      else { cartTilt = lerp(0, 0.5, easeOut(p)); htilt = Math.sin(t / 70) * 0.05; }   // el carro vuelca
    }
    drawCart(ctx, cartX, gy, cartTilt);
    actorAt(ctx, S.bake, hero, 'SE', hframe, hx, gy, hj, undefined, { tilt: htilt });
    coins.forEach(([x, y, r]) => coin(ctx, x, y, r));
  }

  // ══════════════ ENCUENTROS DE MISIÓN (protagonista en solitario) ═════════
  // 12 escenas temáticas, cada una con rama éxito (S.ok) y fracaso. El héroe
  // resuelve solo; los figurantes salen de S.foe / S.foe2 (ver SCENE_FOES).
  const walkFrame = (x) => Math.floor(x / 130) % 4;

  // ── 1. EMBOSCADA (militar): forajidos surgen de tras las rocas ───────────
  function sceneAmbush(ctx, W, H, t, S) {
    const gy = S.gy, ok = S.ok, hero = S.hero, b1 = S.foe, b2 = S.foe2;
    backdrop(ctx, W, H, gy, { top: '#2e2a22' });
    drawRocks(ctx, W, gy);
    const cx = W * 0.44, T_IN = 500, T_ACT = 720;
    let hx = cx, hframe = 0, htilt = 0, hj = 0;
    if (t < T_IN) { hx = lerp(-24, cx, easeOut(seg(t, 0, T_IN))); hframe = walkFrame(t); }
    const ap = seg(t, T_IN, 260);                                   // los bandidos surgen
    if (ok) {
      if (t < T_IN + T_ACT) {                                       // amaga el golpe
        const p = seg(t, T_IN, T_ACT); hj = arch(clamp(p * 1.2, 0, 1)) * 6;
        if (b1) actorAt(ctx, S.bake, b1, 'SE', 0, lerp(W * 0.22, W * 0.30, ap), gy, 0, undefined, { alpha: ap });
        if (b2) actorAt(ctx, S.bake, b2, 'SW', 0, lerp(W * 0.84, W * 0.70, ap), gy, 0, undefined, { alpha: ap });
        actorAt(ctx, S.bake, hero, 'SE', 0, hx + p * 8, gy, hj);
        if (p > 0.42 && p < 0.72) spark(ctx, cx + 24, gy - dH * 0.52, 11 + Math.sin(t / 28) * 3, 0.9);
      } else {                                                      // huyen despavoridos
        const p = seg(t, T_IN + T_ACT, 560);
        if (b1) actorAt(ctx, S.bake, b1, 'SW', walkFrame(t), lerp(W * 0.30, -34, easeIn(p)), gy, 0);
        if (b2) actorAt(ctx, S.bake, b2, 'SE', walkFrame(t), lerp(W * 0.70, W + 34, easeIn(p)), gy, 0);
        actorAt(ctx, S.bake, hero, 'SE', 0, cx, gy, Math.abs(Math.sin(t / 240)) * 4);
      }
    } else {
      if (b1) actorAt(ctx, S.bake, b1, 'SE', 0, lerp(W * 0.22, cx - 26, seg(t, T_IN, 420)), gy, 0, undefined, { alpha: ap });
      if (b2) actorAt(ctx, S.bake, b2, 'SW', 0, lerp(W * 0.84, cx + 26, seg(t, T_IN, 420)), gy, 0, undefined, { alpha: ap });
      if (t > T_IN + T_ACT) {                                       // le roban: caen monedas y una escapa
        const p = seg(t, T_IN + T_ACT, 620);
        for (let i = 0; i < 3; i++) coin(ctx, cx + Math.cos(i * 2) * 8 + Math.sin(i) * p * 22, gy - 14 - arch(p) * 16 + p * 8, 3);
        htilt = Math.sin(t / 60) * 0.05;
      } else if (t > T_IN) htilt = Math.sin(t / 46) * 0.08;         // forcejeo
      actorAt(ctx, S.bake, hero, 'SE', 0, cx, gy, 0, undefined, { tilt: htilt });
    }
  }

  // ── 2. DUELO (militar): singular combate con un oficial enemigo ──────────
  function sceneDuelo(ctx, W, H, t, S) {
    const gy = S.gy, ok = S.ok, hero = S.hero, foe = S.foe;
    backdrop(ctx, W, H, gy, { top: '#332a22' });
    const cx = W * 0.5, T_IN = 560, T_CLASH = 520;
    let hx, fx, hframe = 0, fframe = 0, htilt = 0, ftilt = 0, ha = 1, fa = 1, hj = 0, fj = 0;
    if (t < T_IN) { const p = easeOut(seg(t, 0, T_IN)); hx = lerp(-24, cx - 42, p); fx = lerp(W + 24, cx + 42, p); hframe = walkFrame(t); fframe = hframe; }
    else if (t < T_IN + T_CLASH) {
      const p = seg(t, T_IN, T_CLASH), lunge = arch(clamp(p * 1.4, 0, 1));
      hx = cx - 42 + lunge * 30; fx = cx + 42 - lunge * 30;
      if (p > 0.42 && p < 0.7) spark(ctx, cx, gy - dH * 0.55, 13 + Math.sin(t / 28) * 4, 0.92);
    } else {
      const p = seg(t, T_IN + T_CLASH, 520);
      if (ok) { hx = cx - 28; fx = lerp(cx + 12, cx + 62, easeOut(p)); ftilt = lerp(0, 1.15, easeOut(p)); fj = arch(p) * 11; fa = lerp(1, 0.5, p); hj = t > T_IN + T_CLASH + 300 ? Math.abs(Math.sin(t / 240)) * 5 : 0; }
      else { fx = cx + 28; hx = lerp(cx - 12, cx - 62, easeOut(p)); htilt = lerp(0, -1.05, easeOut(p)); hj = arch(p) * 9; ha = lerp(1, 0.68, p); }
    }
    actorAt(ctx, S.bake, foe, 'SW', fframe, fx, gy, fj, undefined, { tilt: ftilt, alpha: fa, shadow: fa > 0.6 });
    actorAt(ctx, S.bake, hero, 'SE', hframe, hx, gy, hj, undefined, { tilt: htilt, alpha: ha });
  }

  // ── 3. FIERA (militar): un tigre cierra el sendero ───────────────────────
  function sceneBeast(ctx, W, H, t, S) {
    const gy = S.gy, ok = S.ok, hero = S.hero;
    backdrop(ctx, W, H, gy, { top: '#2a2e22' });
    const hxHome = W * 0.30, T_IN = 520, T_STALK = 560, T_POUNCE = 420;
    let hx = hxHome, hframe = 0, htilt = 0, hj = 0;
    if (t < T_IN) { hx = lerp(-24, hxHome, easeOut(seg(t, 0, T_IN))); hframe = walkFrame(t); }
    // tigre: acecha desde la derecha, luego salta hacia el héroe
    let tx = W * 0.72, tj = 0, trun = false, tph = t / 60, tdir = -1;
    const acecha = seg(t, T_IN, T_STALK);
    tx = lerp(W * 0.78, W * 0.56, acecha); trun = acecha > 0 && acecha < 1;
    const pounceS = T_IN + T_STALK;
    if (ok) {
      if (t < pounceS + T_POUNCE) {                                 // salta y el héroe se planta
        const p = seg(t, pounceS, T_POUNCE); tx = lerp(W * 0.56, W * 0.40, p); tj = arch(p) * 40; trun = true;
        if (p > 0.4) spark(ctx, W * 0.36, gy - dH * 0.5, 10 + Math.sin(t / 26) * 3, 0.85);
        actorAt(ctx, S.bake, hero, 'SE', 0, hx, gy, 0);
        drawTiger(ctx, tx, gy, { dir: tdir, jump: tj, scale: 0.92, run: trun, phase: tph });
      } else {                                                      // el tigre desiste y huye de un brinco
        const p = seg(t, pounceS + T_POUNCE, 560); const fxT = lerp(W * 0.40, W + 40, easeIn(p));
        drawTiger(ctx, fxT, gy, { dir: 1, jump: arch(seg(t, pounceS + T_POUNCE, 300)) * 24, scale: 0.92, run: true, phase: tph });
        if (t < pounceS + T_POUNCE + 340) coin(ctx, W * 0.42, gy - 12 - arch(seg(t, pounceS + T_POUNCE, 340)) * 20, 3);   // botín (colmillo)
        actorAt(ctx, S.bake, hero, 'SE', 0, hx, gy, Math.abs(Math.sin(t / 240)) * 4);
      }
    } else {
      if (t < pounceS + T_POUNCE) {                                 // embiste y derriba al héroe
        const p = seg(t, pounceS, T_POUNCE); tx = lerp(W * 0.56, W * 0.36, p); tj = arch(p) * 34; trun = true;
        drawTiger(ctx, tx, gy, { dir: tdir, jump: tj, scale: 0.92, run: trun, phase: tph });
        actorAt(ctx, S.bake, hero, 'SE', 0, hx, gy, 0);
      } else {
        const p = seg(t, pounceS + T_POUNCE, 560);
        htilt = lerp(0, -0.9, easeOut(p)); hj = arch(p) * 8;
        drawTiger(ctx, lerp(W * 0.36, W * 0.48, p), gy, { dir: -1, jump: 0, scale: 0.92, run: false, phase: tph });
        actorAt(ctx, S.bake, hero, 'SW', 0, lerp(hx, hx - 14, p), gy, hj, undefined, { tilt: htilt });
        if (p > 0.1 && p < 0.5) clawMarks(ctx, hx - 4, gy - dH * 0.5, 1 - seg(t, pounceS + T_POUNCE + 60, 240));
      }
    }
  }

  // ── 4. PATRULLA (militar): dos soldados con lanza cierran el paso ────────
  function scenePatrol(ctx, W, H, t, S) {
    const gy = S.gy, ok = S.ok, hero = S.hero, s1 = S.foe, s2 = S.foe2;
    backdrop(ctx, W, H, gy, { top: '#2b2c26' });
    const T_IN = 540, T_TALK = 900;
    const s1x = W * 0.60, s2x = W * 0.72;
    let hx = W * 0.40, hframe = 0, hj = 0, htilt = 0, hpose;
    if (t < T_IN) { hx = lerp(-24, W * 0.40, easeOut(seg(t, 0, T_IN))); hframe = walkFrame(t); }
    // soldados apostados
    let s1p = s1x, s2p = s2x;
    if (ok) {
      if (t > T_IN + T_TALK) { const p = seg(t, T_IN + T_TALK, 520); s1p = lerp(s1x, s1x - 16, easeOut(p)); s2p = lerp(s2x, s2x + 16, easeOut(p)); hx = lerp(W * 0.40, W * 0.52, easeOut(p)); hframe = walkFrame(t); }
      else if (t > T_IN) { hj = Math.max(0, Math.sin((t - T_IN) / 220)) * 2; if ((Math.floor((t - T_IN) / 300) % 2) === 0) bubble(ctx, hx, gy - dH + 4, ((t / 150) | 0) % 3 + 1); }   // parlamenta
    } else {
      if (t > T_IN && t < T_IN + T_TALK) { s1p = lerp(s1x, W * 0.48, seg(t, T_IN, 400)); }                 // se le echan encima (cacheo)
      else if (t > T_IN + T_TALK) {                                                                        // le sacan monedas
        s1p = W * 0.48; const p = seg(t, T_IN + T_TALK, 560);
        for (let i = 0; i < 3; i++) coin(ctx, lerp(W * 0.44, W * 0.56, p) + i * 5, gy - 14 - arch(p) * 14, 3);
        htilt = Math.sin(t / 70) * 0.04;
        if (p > 0.5) bubble(ctx, s2x, gy - dH + 4, 1, 'rgba(226,120,106,.9)');                             // uno queda vigilante
      }
    }
    if (s1) actorAt(ctx, S.bake, s1, 'SW', 0, s1p, gy, 0);
    if (s2) actorAt(ctx, S.bake, s2, 'SW', 0, s2p, gy, 0);
    actorAt(ctx, S.bake, hero, 'SE', hframe, hx, gy, hj, hpose, { tilt: htilt });
  }

  // ── 5. INSCRIPCIONES (cultural): estela en un santuario en ruinas ────────
  function sceneStele(ctx, W, H, t, S) {
    const gy = S.gy, ok = S.ok, hero = S.hero;
    backdrop(ctx, W, H, gy, { top: '#2a2e2a' });
    drawRuins(ctx, W, gy);
    const stx = W * 0.66, hxHome = W * 0.48, T_IN = 560, T_READ = 900;
    let hx = hxHome, hframe = 0, hj = 0, glow = 0;
    if (t < T_IN) { hx = lerp(-24, hxHome, easeOut(seg(t, 0, T_IN))); hframe = walkFrame(t); }
    else if (t < T_IN + T_READ) hj = Math.max(0, Math.sin((t - T_IN) / 240)) * 2;   // examina (bob)
    if (ok) {
      if (t > T_IN + T_READ) { const p = seg(t, T_IN + T_READ, 560); glow = easeOut(p); hj = Math.abs(Math.sin(t / 240)) * 4; }
      else if (t > T_IN) glow = 0.12 + 0.12 * Math.max(0, Math.sin((t - T_IN) / 240));
    } else if (t > T_IN + T_READ && seg(t, T_IN + T_READ, 500) < 0.85) bubble(ctx, hx, gy - dH + 2, 1, 'rgba(200,200,210,.8)');   // se encoge (interrogante)
    drawStele(ctx, stx, gy, glow);
    if (ok && t > T_IN + T_READ) {   // pergamino (botín) que asciende de la estela
      const p = seg(t, T_IN + T_READ, 560), ly = gy - 26 - p * 22;
      ctx.save(); ctx.globalAlpha = clamp(1 - p * 0.3, 0, 1); ctx.fillStyle = '#efe4c4'; ctx.fillRect(stx - 4, ly, 8, 10); ctx.fillStyle = '#c9a84c'; ctx.fillRect(stx - 4, ly, 8, 2); ctx.restore();
    }
    actorAt(ctx, S.bake, hero, 'SE', hframe, hx, gy, hj);
  }

  // ── 6. POETA (cultural): duelo de versos con un poeta errante ────────────
  function scenePoet(ctx, W, H, t, S) {
    const gy = S.gy, ok = S.ok, hero = S.hero, foe = S.foe;
    backdrop(ctx, W, H, gy, { top: '#28302c' });
    const T_IN = 560, T_VERSE = 1200;
    let hx = W * 0.37, fx = W * 0.63, hframe = 0, fframe = 0, hj = 0, fj = 0, hpose, fpose;
    if (t < T_IN) { const p = easeOut(seg(t, 0, T_IN)); hx = lerp(-24, W * 0.37, p); fx = lerp(W + 24, W * 0.63, p); hframe = walkFrame(t); fframe = hframe; }
    else if (t < T_IN + T_VERSE) {
      const p = t - T_IN; hj = Math.max(0, Math.sin(p / 240)) * 2; fj = Math.max(0, Math.sin((p + 600) / 240)) * 2;
      if ((Math.floor(p / 560) % 2) === 0) bubble(ctx, hx, gy - dH + 4, ((p / 150) | 0) % 3 + 1, 'rgba(233,220,180,.9)');
      else bubble(ctx, fx, gy - dH + 4, ((p / 150) | 0) % 3 + 1, 'rgba(233,220,180,.9)');
    } else {
      if (ok) { hj = Math.max(0, Math.sin(t / 200)) * 3; fpose = 'bow'; }                                  // declama; el poeta se inclina
      else { const p = seg(t, T_IN + T_VERSE, 560); sweat(ctx, hx + 8, gy - dH + 8, clamp(1 - p, 0, 1)); if (p > 0.3) coin(ctx, hx, gy - 12 - arch((p - 0.3) / 0.7) * 8 + (p - 0.3) * 6, 3); fj = Math.max(0, Math.sin(t / 200)) * 2; }   // titubea; cae una moneda
    }
    actorAt(ctx, S.bake, foe, 'SW', fframe, fx, gy, fj, fpose);
    actorAt(ctx, S.bake, hero, 'SE', hframe, hx, gy, hj, hpose);
  }

  // ── 7. RUMOR (cultural): escuchar en el rincón de una posada ─────────────
  function sceneTavern(ctx, W, H, t, S) {
    const gy = S.gy, ok = S.ok, hero = S.hero, patron = S.foe;
    backdrop(ctx, W, H, gy, { top: '#302820' });
    drawTavern(ctx, W, gy);
    const hxHome = W * 0.42, px = W * 0.80, T_IN = 540, T_LISTEN = 1000;
    let hx = hxHome, hframe = 0, htilt = 0, hj = 0, hdir = 'SE';
    if (t < T_IN) { hx = lerp(-24, hxHome, easeOut(seg(t, 0, T_IN))); hframe = walkFrame(t); }
    if (ok) {
      if (t > T_IN && t < T_IN + T_LISTEN) { htilt = 0.13; if ((Math.floor((t - T_IN) / 300) % 2) === 0) bubble(ctx, px - 12, gy - dH + 2, ((t / 150) | 0) % 3 + 1, 'rgba(255,210,140,.85)'); }
      else if (t > T_IN + T_LISTEN) { const p = seg(t, T_IN + T_LISTEN, 520); hj = Math.abs(Math.sin(t / 240)) * 3; if (p > 0.2) coin(ctx, hx + 10, gy - 12 - arch((p - 0.2) / 0.8) * 14, 3); }
    } else {
      if (t > T_IN && t < T_IN + T_LISTEN) htilt = 0.10;
      else if (t > T_IN + T_LISTEN) { const p = seg(t, T_IN + T_LISTEN, 560); bubble(ctx, px - 12, gy - dH + 2, 1, 'rgba(226,120,106,.9)'); hx = lerp(hxHome, hxHome - 22, easeOut(p)); hframe = walkFrame(t); hdir = 'SW'; }
    }
    if (patron) actorAt(ctx, S.bake, patron, 'SW', 0, px, gy, 0);
    actorAt(ctx, S.bake, hero, hdir, hframe, hx, gy, hj, undefined, { tilt: htilt });
  }

  // ── 8. COPISTA (cultural): copiar textos en un templo ────────────────────
  function sceneScribe(ctx, W, H, t, S) {
    const gy = S.gy, ok = S.ok, hero = S.hero, monje = S.foe;
    backdrop(ctx, W, H, gy, { top: '#2c2a26' });
    const deskX = W * 0.52, mx = W * 0.72, T_IN = 560, T_WRITE = 1100;
    let hx = W * 0.40, hframe = 0, hj = 0, fill = 0, blot = 0, htilt = 0;
    if (t < T_IN) { hx = lerp(-24, W * 0.40, easeOut(seg(t, 0, T_IN))); hframe = walkFrame(t); }
    else if (t < T_IN + T_WRITE) { hj = Math.max(0, Math.sin((t - T_IN) / 160)) * 2; fill = ok ? seg(t, T_IN, T_WRITE) : Math.min(0.5, seg(t, T_IN, T_WRITE * 0.6)); }
    if (ok) { if (t > T_IN + T_WRITE) { fill = 1; hj = Math.abs(Math.sin(t / 240)) * 3; } }
    else if (t > T_IN + T_WRITE * 0.6) { blot = 1; htilt = Math.sin(t / 70) * 0.05; }
    const monjeBow = ok && t > T_IN + T_WRITE;
    if (monje) actorAt(ctx, S.bake, monje, 'SW', 0, mx, gy, monjeBow ? Math.max(0, Math.sin(t / 240)) * 2 : 0, monjeBow ? 'bow' : undefined);
    drawDesk(ctx, deskX, gy, fill, false);
    if (blot) inkBlot(ctx, deskX + 6, gy - 14, 4);
    else if (fill > 0 && fill < 1) { ctx.save(); ctx.strokeStyle = 'rgba(30,24,40,.8)'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(deskX - 13 + fill * 26, gy - 16); ctx.lineTo(deskX - 11 + fill * 26, gy - 13); ctx.stroke(); ctx.restore(); }
    actorAt(ctx, S.bake, hero, 'SE', hframe, hx, gy, hj, undefined, { tilt: htilt });
  }

  // ── 9. MERCADER (administrativo): enderezar un carro varado en el vado ───
  function sceneFord(ctx, W, H, t, S) {
    const gy = S.gy, ok = S.ok, hero = S.hero, merc = S.foe;
    backdrop(ctx, W, H, gy, { top: '#2a2e34' });
    drawFord(ctx, W, gy);
    const cartX = W * 0.60, mx = W * 0.78, T_IN = 560, T_WORK = 1100;
    let hx = W * 0.38, hframe = 0, hj = 0, cartTilt = 0.5, htilt = 0;
    if (t < T_IN) { hx = lerp(-24, W * 0.38, easeOut(seg(t, 0, T_IN))); hframe = walkFrame(t); }
    else if (t < T_IN + T_WORK) hj = Math.max(0, Math.sin((t - T_IN) / 170)) * 3;
    if (ok) {
      if (t > T_IN && t < T_IN + T_WORK) cartTilt = lerp(0.5, 0.06, seg(t, T_IN, T_WORK));               // se endereza
      else if (t >= T_IN + T_WORK) { cartTilt = 0; hj = Math.abs(Math.sin(t / 240)) * 4; const p = seg(t, T_IN + T_WORK, 560); for (let i = 0; i < 4; i++) coin(ctx, cartX + Math.cos(i * 1.7) * 12 + Math.sin(i) * p * 8, gy - 18 - arch(p) * 38, 3); }
    } else {
      if (t > T_IN) cartTilt = lerp(0.5, 0.95, easeIn(seg(t, T_IN, T_WORK + 400)));                       // resbala más
      if (t > T_IN + T_WORK) { htilt = Math.sin(t / 70) * 0.05; const p = seg(t, T_IN + T_WORK, 400); for (let i = 0; i < 4; i++) { ctx.save(); ctx.globalAlpha = (1 - p) * 0.6; ctx.fillStyle = 'rgba(180,210,220,.7)'; ctx.beginPath(); ctx.arc(cartX + (i - 1.5) * 6, gy + 4 - arch(p) * 14, 2, 0, 6.283); ctx.fill(); ctx.restore(); } }
    }
    const mercBow = ok && t > T_IN + T_WORK;
    if (merc) actorAt(ctx, S.bake, merc, 'SW', 0, mx, gy, mercBow ? Math.max(0, Math.sin(t / 240)) * 2 : 0, mercBow ? 'bow' : undefined);
    drawCartProp(ctx, cartX, gy, cartTilt);
    actorAt(ctx, S.bake, hero, 'SE', hframe, hx, gy, hj, undefined, { tilt: htilt });
  }

  // ── 10. PEAJE (administrativo): un funcionario corrupto exige peaje ──────
  function sceneToll(ctx, W, H, t, S) {
    const gy = S.gy, ok = S.ok, hero = S.hero, fun = S.foe;
    backdrop(ctx, W, H, gy, { top: '#2c2830' });
    const barX = W * 0.56, fx = W * 0.68, T_IN = 540, T_ARG = 1000;
    let hx = W * 0.36, hframe = 0, hj = 0, htilt = 0, barLift = 0;
    if (t < T_IN) { hx = lerp(-24, W * 0.36, easeOut(seg(t, 0, T_IN))); hframe = walkFrame(t); }
    if (ok) {
      if (t > T_IN && t < T_IN + T_ARG) { if ((Math.floor((t - T_IN) / 300) % 2) === 0) bubble(ctx, hx, gy - dH + 4, ((t / 150) | 0) % 3 + 1, 'rgba(216,182,90,.9)'); }
      else if (t > T_IN + T_ARG) { const p = seg(t, T_IN + T_ARG, 520); barLift = easeOut(p); hx = lerp(W * 0.36, W * 0.50, easeOut(p)); hframe = walkFrame(t); }
    } else if (t > T_IN + T_ARG) { const p = seg(t, T_IN + T_ARG, 560); for (let i = 0; i < 3; i++) coin(ctx, lerp(hx + 8, fx - 8, easeIn(p)) + i * 3, gy - 14 - arch(p) * 16, 3); htilt = Math.sin(t / 70) * 0.04; }
    ctx.save(); ctx.translate(barX, gy - 10); ctx.rotate(-barLift * 1.0);
    ctx.fillStyle = '#7a5a2a'; ctx.fillRect(0, -2, W * 0.13, 4); ctx.fillStyle = '#d8b65a'; ctx.fillRect(0, -2, W * 0.13, 1); ctx.restore();
    ctx.fillStyle = '#3a2c17'; ctx.fillRect(barX - 2, gy - 14, 4, 14);   // poste
    if (fun) actorAt(ctx, S.bake, fun, 'SW', 0, fx, gy, 0);
    actorAt(ctx, S.bake, hero, 'SE', hframe, hx, gy, hj, undefined, { tilt: htilt });
  }

  // ── 11. DISPUTA (administrativo): mediar entre dos aldeanos ──────────────
  function sceneMediate(ctx, W, H, t, S) {
    const gy = S.gy, ok = S.ok, hero = S.hero, a = S.foe, b = S.foe2;
    backdrop(ctx, W, H, gy, { top: '#2a2c26' });
    const ax0 = W * 0.40, bx0 = W * 0.62, T_IN = 540, T_ARG = 800;
    let hx = W * 0.15, hframe = 0, hj = 0, hdir = 'S';
    let ax = ax0, bx = bx0, aj = 0, bj = 0, apose, bpose;
    if (t < T_IN + T_ARG) { aj = Math.max(0, Math.sin(t / 160)) * 2; bj = Math.max(0, Math.sin((t + 400) / 160)) * 2; if ((Math.floor(t / 300) % 2) === 0) bubble(ctx, ax, gy - dH + 4, 2, 'rgba(226,140,110,.85)'); else bubble(ctx, bx, gy - dH + 4, 2, 'rgba(226,140,110,.85)'); }
    if (t < T_IN) { hx = lerp(-24, W * 0.30, easeOut(seg(t, 0, T_IN))); hframe = walkFrame(t); } else hx = W * 0.51;   // se interpone
    if (ok) { if (t > T_IN + T_ARG) { const p = seg(t, T_IN + T_ARG, 560); apose = 'bow'; bpose = 'bow'; ax = lerp(ax0, ax0 - 6, p); bx = lerp(bx0, bx0 + 6, p); hj = Math.abs(Math.sin(t / 240)) * 3; } }
    else if (t > T_IN + T_ARG) { const p = seg(t, T_IN + T_ARG, 560); ax = lerp(ax0, W * 0.47, easeOut(Math.min(1, p * 1.5))); bx = lerp(bx0, W * 0.55, easeOut(Math.min(1, p * 1.5))); if (p > 0.3 && p < 0.7) dust(ctx, W * 0.51, gy, 0.6); hx = lerp(W * 0.51, W * 0.34, easeOut(p)); hframe = walkFrame(t); hdir = 'SW'; }
    if (a) actorAt(ctx, S.bake, a, 'SE', 0, ax, gy, aj, apose);
    if (b) actorAt(ctx, S.bake, b, 'SW', 0, bx, gy, bj, bpose);
    actorAt(ctx, S.bake, hero, hdir, hframe, hx, gy, hj);
  }

  // ── 12. CONTRATO (administrativo): estampar el sello de un buen trato ────
  function sceneSeal(ctx, W, H, t, S) {
    const gy = S.gy, ok = S.ok, hero = S.hero, merc = S.foe;
    backdrop(ctx, W, H, gy, { top: '#2e2a22' });
    const deskX = W * 0.5, T_IN = 560, T_DEAL = 1000;
    let hx = W * 0.34, mx = W * 0.66, hframe = 0, mframe = 0, hj = 0, mj = 0, htilt = 0, seal = 0, stampJ = 0;
    if (t < T_IN) { const p = easeOut(seg(t, 0, T_IN)); hx = lerp(-24, W * 0.34, p); mx = lerp(W + 24, W * 0.66, p); hframe = walkFrame(t); mframe = hframe; }
    else if (t < T_IN + T_DEAL) { hj = Math.max(0, Math.sin((t - T_IN) / 260)) * 2; mj = Math.max(0, Math.sin((t - T_IN + 500) / 260)) * 2; if ((Math.floor((t - T_IN) / 500) % 2) === 0) bubble(ctx, hx, gy - dH + 4, ((t / 150) | 0) % 3 + 1); else bubble(ctx, mx, gy - dH + 4, ((t / 150) | 0) % 3 + 1); }
    if (ok) { if (t >= T_IN + T_DEAL) { const p = seg(t, T_IN + T_DEAL, 560); stampJ = p < 0.3 ? arch(p / 0.3) * 10 : 0; seal = p > 0.3 ? 1 : 0; if (p > 0.3) for (let i = 0; i < 3; i++) coin(ctx, deskX + Math.cos(i * 2) * 10 + Math.sin(i) * (p - 0.3) * 14, gy - 16 - arch((p - 0.3) / 0.7) * 30, 3); hj = Math.abs(Math.sin(t / 240)) * 3; } }
    else if (t >= T_IN + T_DEAL) { const p = seg(t, T_IN + T_DEAL, 560); mx = lerp(W * 0.66, W + 30, easeIn(p)); mframe = walkFrame(t); htilt = Math.sin(t / 70) * 0.03; }
    drawDesk(ctx, deskX, gy, 0.8, seal);
    if (stampJ > 0) { ctx.save(); ctx.globalAlpha = 0.7; ctx.fillStyle = '#b0342a'; ctx.beginPath(); ctx.arc(deskX + 10, gy - 14 - stampJ, 3, 0, 6.283); ctx.fill(); ctx.restore(); }
    if (merc) actorAt(ctx, S.bake, merc, 'SW', mframe, mx, gy, mj);
    actorAt(ctx, S.bake, hero, 'SE', hframe, hx, gy, hj, undefined, { tilt: htilt });
  }

  const SCENES = { bridge: sceneBridge, duel: sceneDuel, parley: sceneParley, supply: sceneSupply,
    emboscada: sceneAmbush, duelo: sceneDuelo, fiera: sceneBeast, patrulla: scenePatrol,
    inscripciones: sceneStele, poeta: scenePoet, rumor: sceneTavern, copista: sceneScribe,
    mercader: sceneFord, peaje: sceneToll, disputa: sceneMediate, contrato: sceneSeal };

  // Tiempo del CLÍMAX (cuándo revelar el resultado) por escena/desenlace.
  function climaxOf(scene, ok, k) {
    if (scene === 'bridge') return ok ? (620 + k * 780 + 1120 + 120) : (620 + 760 + 200);
    if (scene === 'duel') return 560 + 520 + (ok ? 420 : 380);
    if (scene === 'parley') return 560 + 1500 + 420;
    if (scene === 'supply') return 620 + 1200 + 420;
    // Encuentros de misión (protagonista solo):
    if (scene === 'emboscada') return ok ? (500 + 720 + 420) : (500 + 720 + 460);
    if (scene === 'duelo') return 560 + 520 + (ok ? 420 : 380);
    if (scene === 'fiera') return 520 + 560 + 420 + (ok ? 380 : 360);
    if (scene === 'patrulla') return 540 + 900 + (ok ? 420 : 460);
    if (scene === 'inscripciones') return 560 + 900 + (ok ? 560 : 500);
    if (scene === 'poeta') return 560 + 1200 + 560;
    if (scene === 'rumor') return 540 + 1000 + (ok ? 520 : 560);
    if (scene === 'copista') return 560 + 1100 + 420;
    if (scene === 'mercader') return 560 + 1100 + 560;
    if (scene === 'peaje') return 540 + 1000 + (ok ? 520 : 560);
    if (scene === 'disputa') return 540 + 800 + 560;
    if (scene === 'contrato') return 560 + 1000 + 560;
    return 1600;
  }

  // ══ API ════════════════════════════════════════════════════════════════
  function play(canvas, opts) {
    opts = opts || {};
    const ctx = canvas && canvas.getContext && canvas.getContext('2d');
    const scene = SCENES[opts.scene] ? opts.scene : 'bridge';
    const fired = { done: false };
    const fire = () => { if (!fired.done) { fired.done = true; try { opts.onEnd && opts.onEnd(); } catch (e) {} } };
    if (!ctx || !window.HacChar) { fire(); return { stop() {} }; }

    const bake = makeBaker();
    const hero = Object.assign({ mio: true }, opts.hero || {});
    const allies = (opts.members || []).map(m => Object.assign({}, m));
    const { foe, foe2 } = foesFor(opts.scene);

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const CHpx = 184;
    function fit() { const w = canvas.clientWidth || 340; canvas.width = Math.round(w * dpr); canvas.height = Math.round(CHpx * dpr); }
    fit();

    const climax = climaxOf(scene, !!opts.ok, allies.length);
    const S = { gy: CHpx * 0.72, ok: !!opts.ok, hero, allies, foe, foe2, bake, obstacle: opts.obstacle || 'chasm' };

    // Movimiento reducido: dibuja el fotograma final y revela ya.
    if (reduce()) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      SCENES[scene](ctx, canvas.clientWidth || 340, CHpx, climax + 400, S);
      fire();
      return { stop() {} };
    }

    let raf = 0, t0 = 0, live = true;
    function frame(ts) {
      if (!live) return;
      if (!t0) t0 = ts; const t = ts - t0;
      const w = canvas.clientWidth || 340;
      if (Math.round(w * dpr) !== canvas.width) fit();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, CHpx);
      SCENES[scene](ctx, w, CHpx, t, S);
      if (t >= climax) fire();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return { stop() { live = false; if (raf) cancelAnimationFrame(raf); } };
  }

  // Depuración: dibuja UN fotograma de una escena a tiempo `t` (para previews).
  function _frame(canvas, opts, t) {
    const ctx = canvas && canvas.getContext && canvas.getContext('2d'); if (!ctx || !window.HacChar) return;
    const scene = SCENES[opts.scene] ? opts.scene : 'bridge';
    const bake = makeBaker();
    const dpr = Math.min(2, window.devicePixelRatio || 1), CHpx = 184;
    const w = canvas.clientWidth || 340;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(CHpx * dpr);
    const hero = Object.assign({ mio: true }, opts.hero || {});
    const allies = (opts.members || []).map(m => Object.assign({}, m));
    const { foe, foe2 } = foesFor(opts.scene);
    const S = { gy: CHpx * 0.72, ok: !!opts.ok, hero, allies, foe, foe2, bake, obstacle: opts.obstacle || 'chasm' };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, CHpx);
    SCENES[scene](ctx, w, CHpx, t, S);
  }

  return { play, climaxOf, _frame };
})();
if (typeof window !== 'undefined') window.HacEncAnim = HacEncAnim;
