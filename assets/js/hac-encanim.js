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

  const SCENES = { bridge: sceneBridge, duel: sceneDuel, parley: sceneParley, supply: sceneSupply };

  // Tiempo del CLÍMAX (cuándo revelar el resultado) por escena/desenlace.
  function climaxOf(scene, ok, k) {
    if (scene === 'bridge') return ok ? (620 + k * 780 + 1120 + 120) : (620 + 760 + 200);
    if (scene === 'duel') return 560 + 520 + (ok ? 420 : 380);
    if (scene === 'parley') return 560 + 1500 + 420;
    if (scene === 'supply') return 620 + 1200 + 420;
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
    // Enviado / oficial enemigo sintético (duelo, parlamento).
    const foe = opts.scene === 'parley'
      ? { aptitud: 'erudito', aspecto: { robe: '#6a5b3a', piel: 1, pelo: 1 } }
      : { aptitud: 'guerrero', aspecto: { robe: '#3b322c', piel: 3, pelo: 3 } };

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const CHpx = 184;
    function fit() { const w = canvas.clientWidth || 340; canvas.width = Math.round(w * dpr); canvas.height = Math.round(CHpx * dpr); }
    fit();

    const climax = climaxOf(scene, !!opts.ok, allies.length);
    const S = { gy: CHpx * 0.72, ok: !!opts.ok, hero, allies, foe, bake, obstacle: opts.obstacle || 'chasm' };

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
    const foe = opts.scene === 'parley' ? { aptitud: 'erudito', aspecto: { robe: '#6a5b3a', piel: 1, pelo: 1 } } : { aptitud: 'guerrero', aspecto: { robe: '#3b322c', piel: 3, pelo: 3 } };
    const S = { gy: CHpx * 0.72, ok: !!opts.ok, hero, allies, foe, bake, obstacle: opts.obstacle || 'chasm' };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, CHpx);
    SCENES[scene](ctx, w, CHpx, t, S);
  }

  return { play, climaxOf, _frame };
})();
if (typeof window !== 'undefined') window.HacEncAnim = HacEncAnim;
