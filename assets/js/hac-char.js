/* ═══════════════════════════════════════════════════════════════════════
   hac-char.js — Modelo PIXEL ART de un personaje (8 direcciones + andar).
   ─────────────────────────────────────────────────────────────────────────
   Figura procedural al estilo Han (tres reinos), dibujada en un lienzo lógico
   pequeño y escalada con image-rendering:pixelated. Mismo idioma que
   hac-pixel.js (helper px(), paleta derivada con mix/light/dark).

   · 8 vistas (S, SE, E, NE, N, NW, W, SW). Las 3 de la izquierda se obtienen
     espejando S/SE/E/NE/N (que miran a la DERECHA/al frente). El cuerpo gira
     de verdad: de frente es ancho y simétrico, de perfil se estrecha, la cara
     se pone de perfil y el brazo/prop pasan al frente.
   · Andar: ciclo de 4 fotogramas (contacto/paso) con bob vertical, zancada de
     botas y balanceo de mangas.
   · El ATUENDO depende de la APTITUD (guerrero→armadura+lanza, erudito→túnica
     +pergamino…). Túnica, piel y pelo salen de `aspecto`.

   API:
     HacChar.draw(canvas, { aptitud, aspecto, dir, frame, scale, bg })
     HacChar.DIRS    → ['S','SE','E','NE','N','NW','W','SW']
     HacChar.FRAMES  → fotogramas del ciclo de andar
     HacChar.W, HacChar.H → tamaño lógico del fotograma
   ═══════════════════════════════════════════════════════════════════════ */
const HacChar = (function () {
  'use strict';

  // ── Color helpers ───────────────────────────────────────────────────────
  const { hexToRgb, clamp255, rgbToHex } = HacUtil;
  function mix(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }
  const light = (c, t) => mix(c, '#ffffff', t);
  const dark  = (c, t) => mix(c, '#000000', t);
  const okHex = (c) => /^#?[0-9a-fA-F]{3,6}$/.test(String(c || ''));

  // ── Lienzo lógico ─────────────────────────────────────────────────────────
  const W = 40, H = 56, BASEY = 51, CX = 20;

  const DIRS   = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];
  const BASE   = { S: 'S', SE: 'SE', E: 'E', NE: 'NE', N: 'N', NW: 'NE', W: 'E', SW: 'SE' };
  const MIRROR = { NW: true, W: true, SW: true };
  const FRAMES = 4;

  // Atuendo por aptitud.
  const OUTFIT = {
    guerrero:      { kind: 'armor', prop: 'spear',  robe: '#8a2f25', accent: '#d8b65a' },
    erudito:       { kind: 'robe',  prop: 'scroll', robe: '#2f5a6e', accent: '#cfe0e6', beard: 1 },
    administrador: { kind: 'robe',  prop: 'tablet', robe: '#284b3c', accent: '#d8b65a', beard: 1 },
    estratega:     { kind: 'robe',  prop: 'fan',    robe: '#6a6f86', accent: '#eae4d2', beard: 2 },
    caudillo:      { kind: 'armor', prop: 'none',   robe: '#5a1f1f', accent: '#d8b65a', cape: true, beard: 1 },
    canciller:     { kind: 'robe',  prop: 'tablet', robe: '#5b2c83', accent: '#d8b65a', ornate: true, beard: 2 }
  };
  const SKINS = ['#eac9a0', '#dcb487', '#c89a6e', '#ad7d54'];
  const HAIRS = ['#1b1712', '#2c2318', '#46301a', '#0f0d0b'];

  function palette(aptId, aspecto) {
    aspecto = aspecto || {};
    const o = OUTFIT[aptId] || { kind: 'robe', prop: 'none', robe: '#5b4a8a', accent: '#d8b65a' };
    const robe = okHex(aspecto.robe) ? aspecto.robe : o.robe;
    const accent = okHex(aspecto.accent) ? aspecto.accent : o.accent;
    const skin = SKINS[(Number(aspecto.piel) || 0) % SKINS.length];
    const hair = HAIRS[(Number(aspecto.pelo) || 0) % HAIRS.length];
    return {
      kind: o.kind, prop: o.prop, cape: !!o.cape, ornate: !!o.ornate, beard: o.beard || 0,
      robe, robeHi: light(robe, 0.16), robeDk: dark(robe, 0.30), robeSh: dark(robe, 0.50),
      beardC: dark(hair, 0.05),
      sash: dark(mix(robe, accent, 0.25), 0.05),
      trim: accent, trimDk: dark(accent, 0.3),
      skin, skinHi: light(skin, 0.13), skinDk: dark(skin, 0.22),
      hair, hairHi: light(hair, 0.18),
      steel: '#9aa4ae', steelHi: '#cfd6dd', steelDk: '#565e68',
      capeC: dark(robe, 0.45), capeHi: dark(robe, 0.30),
      boot: '#241a12', bootHi: '#3a2c1d',
      gold: '#d8b65a', goldHi: '#f0d98a', jade: '#7fc9a0', ink: '#16110b'
    };
  }

  // Vista → cuánto de frente/espalda/perfil y desplazamiento de giro (dx>0 = mira a la derecha).
  function viewOf(base) {
    switch (base) {
      case 'S':  return { front: true,  back: false, side: 0,   dx: 0 };
      case 'SE': return { front: true,  back: false, side: 0.5, dx: 2 };
      case 'E':  return { front: false, back: false, side: 1,   dx: 3 };
      case 'NE': return { front: false, back: true,  side: 0.5, dx: 2 };
      default:   return { front: false, back: true,  side: 0,   dx: 0 }; // N
    }
  }

  // Ciclo de andar. f:0 contacto · 1 paso(sube) · 2 contacto · 3 paso(sube).
  function gait(frame) {
    const f = ((frame % FRAMES) + FRAMES) % FRAMES;
    return { f, bob: (f === 1 || f === 3) ? -2 : 0, step: [1, 0, -1, 0][f] };
  }

  // ════════════════════════════════════════════════════════════════════════
  // Anclas verticales de la figura (relativas al suelo + bob).
  function anchors(g) {
    const baseY = BASEY + g.bob;
    return { baseY, shoulder: baseY - 32, hem: baseY - 1, belt: baseY - 18, hy: baseY - 43 };
  }

  function figure(px, P, base, g, pose) {
    const v = viewOf(base);
    if (pose === 'sit') { figureSit(px, P, v); return; }
    if (pose === 'bow') { figureBow(px, P, v); return; }
    shadow(px);
    if (P.cape) cape(px, P, v, g);
    legs(px, P, v, g);
    torso(px, P, v, g);
    backArm(px, P, v, g);     // brazo lejano (detrás del torso)
    head(px, P, v, g);
    frontArm(px, P, v, g);    // brazo cercano (delante)
    prop(px, P, v, g);
  }

  // Pose SENTADA (descansando en el jardín). Figura compacta apoyada en el suelo.
  function figureSit(px, P, v) {
    const baseY = BASEY, c = CX + Math.round(v.dx * 0.6);
    shadow(px);
    // Regazo / piernas plegadas: montículo ancho de túnica abajo.
    const seatTop = baseY - 13;
    for (let i = 0; i < 13; i++) {
      const t = i / 12, hw = Math.round(7 + 7 * Math.pow(t, 0.6)), y = seatTop + i;
      px(c - hw, y, hw * 2, 1, P.kind === 'armor' ? P.robeDk : P.robe);
      px(c - hw, y, Math.max(1, Math.round(hw * 0.4)), 1, P.robeHi);
      px(c + Math.round(hw * 0.55), y, hw - Math.round(hw * 0.55), 1, P.robeDk);
    }
    px(c - 14, baseY - 1, 28, 1, P.robeSh);
    px(c - 7, baseY - 3, 4, 3, dark(P.robe, 0.18)); px(c + 3, baseY - 3, 4, 3, dark(P.robe, 0.18)); // rodillas
    // Torso erguido (corto).
    const tTop = baseY - 25, tBot = seatTop + 1;
    for (let y = tTop; y < tBot; y++) { px(c - 5, y, 10, 1, P.robe); px(c - 5, y, 2, 1, P.robeHi); px(c + 3, y, 2, 1, P.robeDk); }
    if (P.kind === 'armor') for (let r = 0; r < tBot - tTop - 1; r += 2) { px(c - 5, tTop + r, 10, 1, P.steel); px(c - 4, tTop + r, 8, 1, P.steelDk); }
    else if (!v.back) for (let i = 0; i < 7; i++) px(c - 4 + i, tTop + 2 + i, 2, 1, P.trim);   // solapa
    px(c - 5, seatTop - 3, 10, 2, P.sash);                                                     // faja
    // Brazos descansando en el regazo + manos.
    px(c - 7, baseY - 13, 3, 6, P.robeDk); px(c + 4, baseY - 13, 3, 6, P.robe);
    px(c - 3, baseY - 9, 6, 2, P.skin);
    // Cabeza (más baja que de pie).
    const hy = tTop - 11;
    px(c - 2, tTop - 2, 4, 3, P.skinDk);
    headFace(px, P, v, c, hy);
    hairAndCap(px, P, v, c, hy);
  }

  // Pose de REVERENCIA (抱拳禮 Bào Quán Lǐ): saludo marcial deferente. La cabeza
  // se PICA mirando al suelo (se ve la coronilla, no la cara) y las manos se
  // alzan al frente: puño derecho ENVUELTO por la palma izquierda. Reutiliza el
  // torso/piernas de pie (ya pulidos), con marcha estática.
  function figureBow(px, P, v) {
    const g0 = { f: 0, bob: 0, step: 0 };
    const c = CX + Math.round(v.dx * 0.6);
    const dir = (v.dx >= 0) ? 1 : -1;                       // hacia dónde mira al picar
    const armor = P.kind === 'armor';
    const A = anchors(g0);
    shadow(px);
    legs(px, P, v, g0);
    torso(px, P, v, g0);
    // Cabeza PICADA: testa vista desde la coronilla, baja y algo adelantada, de
    // modo que se ve el pelo/tocado y apenas la frente (mira al suelo).
    headBowed(px, P, v, c + dir, A.shoulder - 5);
    // Manos en 抱拳禮 al frente, alzadas a la altura del pecho: puño (al lado de
    // la dirección) envuelto por la palma. Antebrazos/mangas confluyendo debajo.
    const hy = A.shoulder + 4;
    px(c - 6, hy + 1, 12, 4, armor ? P.steelDk : P.robeDk);                // antebrazos/mangas
    px(c - 6, hy + 1, 12, 1, armor ? P.steel : P.robe);
    if (!armor) px(c - 6, hy + 4, 12, 1, P.trim);                          // ribete de los puños
    const fistX = c + 2 * dir;
    px(fistX - 3, hy - 2, 6, 5, P.skinDk);                                 // PALMA que envuelve
    px(fistX - 3, hy - 2, 6, 1, P.skinHi);
    px(fistX - 3 + (dir > 0 ? 4 : 0), hy - 1, 2, 4, P.skin);               // PUÑO asomando por un lado
    px(fistX - 1, hy, 2, 1, dark(P.skin, 0.30));                           // junta entre palma y puño
  }

  // Testa picada (vista de coronilla) para la reverencia: pelo/tocado arriba,
  // un sliver de frente abajo; sin ojos (mira al suelo).
  function headBowed(px, P, v, c, topY) {
    // Casquete de pelo en cúpula.
    for (let i = 0; i < 7; i++) {
      const t = i / 6, w = Math.round(10 * (0.55 + 0.45 * Math.sin((t + 0.12) * Math.PI)));
      px(c - Math.round(w / 2), topY + i, w, 1, P.hair);
    }
    px(c - 4, topY + 1, 8, 1, P.hairHi);                                   // brillo de la coronilla
    if (!v.back) { px(c - 3, topY + 7, 6, 2, P.skin); px(c - 3, topY + 7, 6, 1, P.skinHi); px(c - 3, topY + 9, 6, 1, P.skinDk); } // frente agachada
    // Tocado / casco inclinado hacia el observador.
    if (P.kind === 'armor') {                                              // casco con cresta al frente
      px(c - 5, topY - 1, 10, 3, P.steel); px(c - 5, topY - 1, 10, 1, P.steelHi); px(c - 5, topY + 2, 10, 1, P.steelDk);
      px(c - 1, topY - 4, 3, 4, P.trim); px(c - 1, topY - 5, 3, 1, P.goldHi);   // cresta
    } else if (P.ornate) {                                                 // tocado alto de oficial
      px(c - 4, topY - 3, 9, 4, P.ink); px(c - 4, topY - 3, 9, 1, dark(P.gold, 0.1)); px(c - 1, topY - 5, 3, 2, P.ink); px(c, topY - 5, 1, 1, P.gold);
    } else {                                                              // moño 髻 + gorro
      px(c - 5, topY - 2, 10, 3, P.ink); px(c - 5, topY - 2, 10, 1, light(P.ink, 0.18)); px(c - 1, topY - 4, 3, 2, P.ink); px(c, topY - 4, 1, 1, P.gold);
    }
  }

  function shadow(px) {
    px(CX - 8, BASEY + 1, 16, 2, 'rgba(0,0,0,0.30)');
    px(CX - 5, BASEY + 3, 10, 1, 'rgba(0,0,0,0.16)');
  }

  // Botas: en perfil zancada en X; de frente/espalda lado a lado alternando.
  function legs(px, P, v, g) {
    const y = BASEY + g.bob;
    if (v.side >= 1) {
      const fx = CX + 1 + (g.step > 0 ? 3 : 0), bx = CX - 5 - (g.step < 0 ? 3 : 0);
      const fl = g.step > 0 ? -1 : 0, bl = g.step < 0 ? -1 : 0;
      px(bx, y - 3 + bl, 6, 4, P.boot); px(bx, y - 3 + bl, 6, 1, P.bootHi);
      px(fx, y - 3 + fl, 6, 4, P.bootHi); px(fx, y - 2 + fl, 6, 3, P.boot);
    } else {
      const lx = CX - 6, rx = CX + 1;
      const lo = g.step > 0 ? 0 : -1, ro = g.step < 0 ? 0 : -1;
      px(lx, y - 3 + lo, 5, 4, P.boot); px(lx, y - 3 + lo, 5, 1, P.bootHi);
      px(rx, y - 3 + ro, 5, 4, P.boot); px(rx, y - 3 + ro, 5, 1, P.bootHi);
    }
  }

  // Hombrera/placa redondeada (armadura).
  function plate(px, P, x, y, w, h) {
    px(x, y, w, h, P.steel); px(x, y, w, 1, P.steelHi); px(x, y + h - 1, w, 1, P.steelDk);
    px(x, y, 1, h, P.steelHi); px(x + w - 1, y, 1, h, P.steelDk);
  }

  // Cuerpo: trapecio que se ESTRECHA de perfil y se desplaza con el giro.
  function torso(px, P, v, g) {
    const A = anchors(g), top = A.shoulder, hemY = A.hem, beltY = A.belt;
    const c = CX + Math.round(v.dx * 0.6);
    const shHalf = Math.round(8 - 3 * v.side);
    const sway = (g.f % 2 === 0) ? 1 : 0;
    const hemHalf = Math.round(12 - 5 * v.side) + sway;
    const rows = hemY - top;
    for (let i = 0; i < rows; i++) {
      const t = i / (rows - 1);
      const hw = Math.round(shHalf + (hemHalf - shHalf) * Math.pow(t, 0.8));
      const y = top + i;
      px(c - hw, y, hw * 2, 1, P.robe);
      px(c - hw, y, Math.max(1, Math.round(hw * 0.4)), 1, P.robeHi);            // luz izq
      px(c + Math.round(hw * 0.55), y, hw - Math.round(hw * 0.55), 1, P.robeDk); // sombra der
    }
    if (v.side >= 1) for (let i = 8; i < rows; i++) px(c - hemHalf - 1, top + i, 1, 1, P.robeSh); // drapeado trasero
    px(c, top + 4, 1, rows - 6, P.robeDk);                  // pliegue central
    px(c - hemHalf, hemY, hemHalf * 2, 1, P.robeSh);        // sombra del bajo

    if (P.kind === 'armor') {
      const aTop = top + 4, aH = 15, aHalf = Math.max(4, shHalf - 1);
      // Gola (protección del cuello).
      px(c - 5, top, 10, 2, P.steel); px(c - 5, top, 10, 1, P.steelHi);
      // Escamas solapadas con tachones (filas alternas).
      for (let r = 0; r < aH; r += 2) {
        px(c - aHalf, aTop + r, aHalf * 2, 2, P.steelDk);
        px(c - aHalf, aTop + r, aHalf * 2, 1, P.steel);
        const off = ((r / 2) % 2) ? 1 : 0;
        for (let s = -aHalf + 1 + off; s < aHalf; s += 2) px(c + s, aTop + r, 1, 1, P.steelHi);
      }
      // Hombreras redondeadas.
      if (v.side < 1) plate(px, P, c - aHalf - 3, top + 1, 5, 5);
      plate(px, P, c + aHalf - 2, top + 1, 5, 5);
      // Faldón de tassets (tiras con tachón).
      for (let s = -aHalf + 1; s <= aHalf - 3; s += 3) { px(c + s, aTop + aH, 3, 7, P.robeDk); px(c + s + 1, aTop + aH + 1, 1, 1, P.trim); }
      // Cinturón + hebilla.
      px(c - aHalf - 1, aTop + aH - 1, aHalf * 2 + 2, 2, P.trim);
      px(c - 1, aTop + aH - 1, 3, 2, P.goldHi);
      // Pliegues de la falda blindada.
      const sTop = aTop + aH + 1;
      px(c - Math.round(hemHalf * 0.45), sTop, 1, hemY - sTop, P.robeSh);
      px(c + Math.round(hemHalf * 0.4), sTop, 1, hemY - sTop, P.robeSh);
    } else {
      // Hombros + cuello.
      px(c - shHalf, top, shHalf * 2, 2, P.robeHi);
      // Solapa cruzada (jiaoling) con ribete.
      if (!v.back) {
        for (let i = 0; i < 12; i++) px(c - 6 + i + Math.round(v.dx * 0.5), top + 2 + i, 2, 1, i < 2 ? P.skinDk : P.trim);
        px(c - 5 + Math.round(v.dx * 0.5), top + 2, 2, 2, P.robeHi);   // cuello interior
      }
      // Placket/brocado frontal (banda central).
      if (!v.back) {
        const bandTop = top + 3, bandBot = beltY;
        px(c - 1 + Math.round(v.dx * 0.4), bandTop, 2, bandBot - bandTop, P.ornate ? P.gold : P.trimDk);
        if (P.ornate) for (let yy = bandTop + 1; yy < bandBot; yy += 2) px(c + Math.round(v.dx * 0.4), yy, 1, 1, P.robeDk);
      }
      // Faja.
      px(c - hemHalf + 1, beltY, hemHalf * 2 - 2, 3, P.sash);
      px(c - hemHalf + 1, beltY, hemHalf * 2 - 2, 1, light(P.sash, 0.12));
      px(c - hemHalf + 1, beltY + 2, hemHalf * 2 - 2, 1, dark(P.sash, 0.2));
      if (v.front) { px(c - 2, beltY + 2, 4, 4, P.trim); px(c - 1, beltY + 6, 2, 3, P.trimDk); }  // nudo + caída
      if (P.ornate) { px(c - hemHalf, hemY - 2, hemHalf * 2, 1, P.gold); px(c - hemHalf, hemY - 1, hemHalf * 2, 1, P.goldHi); if (v.front) px(c - 1, beltY + 2, 2, 3, P.jade); }
      // Pliegues verticales de la falda.
      const sTop = beltY + 4;
      px(c - Math.round(hemHalf * 0.5), sTop, 1, hemY - sTop, P.robeDk);
      px(c + Math.round(hemHalf * 0.45), sTop, 1, hemY - sTop, P.robeDk);
      px(c + Math.round(hemHalf * 0.45) + 1, sTop, 1, hemY - sTop, P.robeHi);
    }
  }

  // Manga + puño + mano. wide=manga ancha (túnica).
  function sleeve(px, P, x, y, sw, sh, front) {
    const base = front ? P.robe : P.robeDk;
    px(x, y, sw, sh, base);
    px(x, y, sw, 1, front ? P.robeHi : P.robe);
    px(x, y + sh - 2, sw, 2, P.robeSh);                    // puño en sombra
    if (P.kind === 'robe') px(x, y + sh - 2, sw, 1, P.trim);  // ribete del puño
    else px(x, y + sh - 3, sw, 1, front ? P.steel : P.steelDk); // vambrace
    px(x + Math.floor((sw - 2) / 2), y + sh, 2, 2, front ? P.skin : P.skinDk);  // mano
  }

  function backArm(px, P, v, g) {
    if (v.side >= 1) return;
    const A = anchors(g), top = A.shoulder + 2, c = CX + Math.round(v.dx * 0.6);
    const wide = P.kind === 'robe', sw = wide ? 6 : 4, sh = wide ? 15 : 14;
    const x = c - shHalfOf(v) - sw + 1 - Math.round(v.dx * 0.4);
    sleeve(px, P, x, top + (g.step < 0 ? -1 : 1), sw, sh, false);
  }

  function frontArm(px, P, v, g) {
    const A = anchors(g), top = A.shoulder + 2, c = CX + Math.round(v.dx * 0.6);
    const wide = P.kind === 'robe', sw = wide ? 6 : 4, sh = wide ? 15 : 14;
    let x, y;
    if (v.side >= 1) { x = c + 1 + (g.step > 0 ? 2 : -1); y = top + 1; }
    else { x = c + shHalfOf(v) - 1 + Math.round(v.dx * 0.4); y = top + (g.step > 0 ? -1 : 1); }
    sleeve(px, P, x, y, sw, sh, true);
  }
  const shHalfOf = (v) => Math.round(8 - 3 * v.side);

  // Cabeza redondeada con rasgos + barba (perfiles civiles).
  function headBlock(px, c, hy, halfW, h, skin, hi, dk) {
    for (let i = 0; i < h; i++) {
      const inset = (i === 0 || i === h - 1) ? 1 : 0;
      px(c - halfW + inset, hy + i, halfW * 2 - inset * 2, 1, skin);
    }
    px(c - halfW + 1, hy, halfW * 2 - 2, 1, hi);            // luz arriba
    px(c + halfW - 2, hy + 1, 1, h - 2, dk);               // sombra lado derecho
  }

  function head(px, P, v, g) {
    const A = anchors(g), top = A.shoulder, hy = A.hy, c = CX + Math.round(v.dx * 0.6);
    px(c - 2, top - 3, 4, 4, P.skinDk);                                        // cuello
    headFace(px, P, v, c, hy);
    hairAndCap(px, P, v, c, hy);
  }

  // Cara + rasgos + barba en (c, hy). Reutilizado por la pose de pie y la sentada.
  function headFace(px, P, v, c, hy) {
    if (v.side >= 1) {                                                          // PERFIL
      headBlock(px, c + 1, hy, 4, 11, P.skin, P.skinHi, P.skinDk);
      px(c + 5, hy + 5, 1, 2, P.skin); px(c + 5, hy + 5, 1, 1, P.skinHi);       // nariz
      px(c + 3, hy + 5, 1, 1, P.ink);                                          // ojo
      px(c + 2, hy + 4, 2, 1, P.hair);                                         // ceja
      px(c + 2, hy + 8, 2, 1, P.skinDk);                                       // boca
      px(c - 2, hy + 5, 1, 2, P.skinDk);                                       // oreja
      if (P.beard) { px(c, hy + 9, 5, 1 + P.beard, P.beardC); px(c + 4, hy + 7, 1, 2 + P.beard, P.beardC); } // barba al frente
    } else {
      headBlock(px, c, hy, 5, 11, P.skin, P.skinHi, P.skinDk);
      if (!v.back) {
        if (v.front) {
          px(c - 3, hy + 5, 2, 1, P.hair); px(c + 2, hy + 5, 2, 1, P.hair);     // cejas
          px(c - 2, hy + 6, 1, 1, P.ink);  px(c + 2, hy + 6, 1, 1, P.ink);      // ojos
          px(c, hy + 6, 1, 3, P.skinDk);                                       // nariz
          px(c - 1, hy + 9, 3, 1, dark(P.skin, 0.3));                          // boca
          if (P.beard) { px(c - 2, hy + 9, 5, 1, P.beardC); px(c - 1, hy + 10, 3, P.beard === 2 ? 4 : 2, P.beardC); }
        } else {                                                               // 3/4 frontal
          px(c, hy + 5, 2, 1, P.hair); px(c + 3, hy + 5, 1, 1, P.hair);
          px(c, hy + 6, 1, 1, P.ink); px(c + 3, hy + 6, 1, 1, P.ink);
          px(c + 4, hy + 6, 1, 2, P.skinDk);                                   // nariz (perfil insinuado)
          px(c + 1, hy + 9, 3, 1, dark(P.skin, 0.3));
          if (P.beard) { px(c, hy + 9, 5, 1, P.beardC); px(c + 1, hy + 10, 3, P.beard === 2 ? 4 : 2, P.beardC); }
        }
      }
    }
  }

  function hairAndCap(px, P, v, c, hy) {
    // Pelo: cubre la coronilla y baja por las sienes; moño 髻 arriba.
    px(c - 5, hy - 1, 11, 3, P.hair); px(c - 5, hy - 1, 11, 1, P.hairHi);
    if (v.back) { px(c - 4, hy, 9, 9, P.hair); px(c - 5, hy + 1, 1, 7, P.hair); px(c + 4, hy + 1, 1, 7, P.hair); }
    else { px(c - 5, hy, 1, 6, P.hair); px(c + 4, hy, 1, 6, P.hair); }
    if (P.kind === 'armor') {                                                  // casco con frontal y cresta
      px(c - 5, hy - 3, 11, 4, P.steel); px(c - 5, hy - 3, 11, 1, P.steelHi);
      px(c - 5, hy + 1, 11, 1, P.steelDk);
      px(c - 1, hy - 7, 3, 4, P.trim); px(c - 1, hy - 8, 3, 1, P.goldHi);       // cresta
      px(c - 5, hy + 1, 1, 4, P.steelDk); px(c + 5, hy + 1, 1, 4, P.steelDk);   // carrilleras
      px(c, hy - 1, 1, 1, P.goldHi);                                           // remache frontal
    } else if (P.ornate) {                                                     // tocado alto de oficial (進賢冠)
      px(c - 4, hy - 6, 9, 5, P.ink); px(c - 4, hy - 6, 9, 1, dark(P.gold, 0.1));
      px(c - 2, hy - 9, 4, 3, P.ink); px(c - 1, hy - 9, 1, 1, P.gold);
      px(c - 4, hy - 2, 9, 1, P.gold);                                         // banda dorada
    } else {                                                                   // paño/gorro (巾)
      px(c - 5, hy - 4, 11, 4, P.ink); px(c - 5, hy - 4, 11, 1, light(P.ink, 0.18));
      if (!v.back) px(c - 1, hy - 3, 2, 1, P.gold);                            // broche
      px(c + 4, hy - 1, 2, 3, P.ink);                                          // caída trasera
    }
  }

  function cape(px, P, v, g) {
    const A = anchors(g), top = A.shoulder - 1, c = CX + Math.round(v.dx * 0.6);
    const sway = (g.f % 2 === 0) ? 0 : 2, half = 11 + sway, bottom = BASEY - 1;
    for (let y = top; y < bottom; y++) {
      const t = (y - top) / (bottom - top), hw = Math.round(5 + half * t);
      px(c - hw, y, hw * 2, 1, (y % 2 === 0) ? P.capeC : P.capeHi);
      px(c - hw, y, 1, 1, dark(P.capeC, 0.3));
      px(c + hw - 1, y, 1, 1, light(P.capeC, 0.08));
    }
    px(c - 5, top - 1, 10, 1, P.trim); px(c - 5, top, 10, 1, P.trimDk);        // cuello de la capa
  }

  // Prop por aptitud. Por la espalda solo asoma la lanza.
  function prop(px, P, v, g) {
    const A = anchors(g), c = CX + Math.round(v.dx * 0.6), baseY = A.baseY;
    if (P.prop === 'spear') {
      const hx = v.back ? c + 6 : c + 10;
      px(hx, baseY - 44, 1, 44, P.boot); px(hx, baseY - 44, 1, 1, P.bootHi);    // asta
      px(hx, baseY - 50, 1, 6, P.steelHi);                                      // hoja
      px(hx - 1, baseY - 48, 3, 1, P.steel); px(hx - 1, baseY - 46, 3, 1, P.steelDk);
      px(hx - 1, baseY - 43, 3, 1, P.trim); px(hx - 1, baseY - 42, 3, 1, P.trimDk); // borla
      return;
    }
    if (v.back) return;
    const handY = baseY - 17 + (g.step > 0 ? -1 : 1);
    const hx = v.side >= 1 ? c + 6 : c + shHalfOf(v) + 4;
    if (P.prop === 'fan') {                                                     // abanico de plumas (羽扇)
      px(hx, handY, 1, 5, P.boot);
      px(hx - 2, handY - 8, 6, 9, '#efe9d8'); px(hx - 2, handY - 8, 6, 1, '#cfc6ac');
      for (let i = 0; i < 9; i += 2) px(hx, handY - 8 + i, 1, 1, '#d8d0b6');     // nervios
    } else if (P.prop === 'scroll') {                                           // pergamino
      px(hx, handY - 1, 4, 8, '#e6dcc2'); px(hx, handY - 1, 4, 1, P.trim); px(hx, handY + 6, 4, 1, P.trimDk);
      px(hx + 2, handY, 1, 6, dark('#e6dcc2', 0.18));
    } else if (P.prop === 'tablet') {                                           // tableta de corte (笏)
      px(hx, handY - 6, 2, 11, '#efe9d8'); px(hx, handY - 6, 2, 1, P.trim); px(hx + 1, handY - 5, 1, 9, dark('#efe9d8', 0.15));
    }
  }

  // Pase de CONTORNO: pinta 1px oscuro alrededor de la silueta (vecindad-4).
  // Da "peso" a la figura y la separa del fondo de la finca.
  function outlinePass(o) {
    const img = o.getImageData(0, 0, W, H), d = img.data, out = new Uint8ClampedArray(d);
    const al = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : d[(y * W + x) * 4 + 3];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i + 3] === 0 && (al(x - 1, y) || al(x + 1, y) || al(x, y - 1) || al(x, y + 1))) {
        out[i] = 16; out[i + 1] = 11; out[i + 2] = 7; out[i + 3] = 255;
      }
    }
    o.putImageData(new ImageData(out, W, H), 0, 0);
  }

  // Dibuja la figura (vista + andar) sobre un contexto a escala lógica 1.
  function paintFigure(ctx, base, mirror, P, g, pose) {
    ctx.save();
    if (mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
    figure(px, P, base, g, pose);
    ctx.restore();
  }

  // ── API de dibujo ───────────────────────────────────────────────────────
  function draw(canvas, opts) {
    if (!canvas) return;
    opts = opts || {};
    const dir = DIRS.indexOf(opts.dir) >= 0 ? opts.dir : 'S';
    const base = BASE[dir], mirror = !!MIRROR[dir];
    const scale = Math.max(1, Math.round(opts.scale || 1));
    const P = palette(opts.aptitud, opts.aspecto);
    const g = gait(opts.frame || 0);
    const wantOutline = opts.outline !== false && typeof document !== 'undefined' && document.createElement;

    if (wantOutline) {
      // Render en lienzo lógico (W×H) → contorno → escalado nítido al destino.
      const off = document.createElement('canvas'); off.width = W; off.height = H;
      const o = off.getContext('2d'); o.imageSmoothingEnabled = false;
      paintFigure(o, base, mirror, P, g, opts.pose);
      outlinePass(o);
      canvas.width = W * scale; canvas.height = H * scale;
      const ctx = canvas.getContext('2d'); if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (opts.bg) { ctx.fillStyle = opts.bg; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      ctx.drawImage(off, 0, 0, W, H, 0, 0, W * scale, H * scale);
      return;
    }
    // Fallback directo (sin contorno; p.ej. Node).
    canvas.width = W * scale; canvas.height = H * scale;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (opts.bg) { ctx.fillStyle = opts.bg; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.save(); ctx.scale(scale, scale);
    paintFigure(ctx, base, mirror, P, g, opts.pose);
    ctx.restore();
  }

  // ══════════════════════════════════════════════════════════════════════
  // Capa SPRITES PNG (rework de calidad). Sustituye al procedural SOLO en el
  // render de la finca (hac-folk). Onboarding/avatares de barra siguen con draw().
  //
  //   assets/img/char/mecenas-{idle,walk-<i>}-{SW,SE,NW,NE}.png
  //   · 4 vistas diagonales: SW/SE = FRONTAL (misma tira), NW/NE = ESPALDA.
  //     8 dirs del motor → 4 vía PNG_VIEW. Andar = 8 fotogramas (alterna piernas).
  //   · mecenas-sit-<dir> (montar): si no existe, cae al idle.
  //   · Maestros 300×520 (pies y=496, eje x=150). Se HORNEAN una vez a tamaño de
  //     juego y se cachean; nunca se reprocesan por frame (cf. FPS de la finca).
  // ══════════════════════════════════════════════════════════════════════
  // INTERRUPTOR: mecenas con sprites PNG de alta resolución (capa nítida) vs el
  // personaje PROCEDURAL pixel-art clásico (con su bobbing). Desactivado por
  // decisión de diseño → se usa el procedural; poner true para recuperar el HD.
  const PNG_ENABLED = false;
  const PNG_DIRS  = ['SW', 'SE', 'NW', 'NE'];
  const PNG_VIEW  = { E: 'SE', SE: 'SE', S: 'SE', SW: 'SW', W: 'SW', NW: 'NW', N: 'NW', NE: 'NE' };
  const PNG_NF    = 8;
  const M_W = 352, M_H = 592, M_FEET = 532;   // maestros de ALTA resolución (8× del juego): nítidos en la capa de personajes a cualquier zoom
  const PNG_H = 74;
  const PNG_W = Math.round(M_W * PNG_H / M_H);
  const PNG_FEET = Math.round(M_FEET * PNG_H / M_H);
  let pngImgs = null, pngBaked = null, pngReadyFlag = false;

  function pngBake() {
    const bake = (img) => {
      const c = document.createElement('canvas'); c.width = PNG_W; c.height = PNG_H;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      x.drawImage(img, 0, 0, PNG_W, PNG_H); return c;
    };
    const baked = {};
    PNG_DIRS.forEach(v => {
      const im = pngImgs[v]; const idle = bake(im.idle);
      baked[v] = { idle, sit: im.sit ? bake(im.sit) : idle, walk: im.walk.filter(Boolean).map(bake) };
    });
    pngBaked = baked; pngReadyFlag = true;
  }
  function pngLoad() {
    if (typeof document === 'undefined' || !document.createElement) return;
    const base = 'assets/img/char/', V = '?v=8';
    pngImgs = {}; let need = 0, got = 0;
    const done = () => { if (++got >= need && !pngReadyFlag) { try { pngBake(); } catch (e) {} } };
    PNG_DIRS.forEach(v => {
      pngImgs[v] = { idle: null, sit: null, walk: [] };
      const L = (src, set) => { need++; const im = new Image(); im.onload = () => { set(im); done(); }; im.onerror = done; im.src = base + src + V; };
      L('mecenas-idle-' + v + '.png', im => pngImgs[v].idle = im);
      L('mecenas-sit-' + v + '.png', im => pngImgs[v].sit = im);   // opcional (montar); si 404 → cae al idle
      for (let i = 0; i < PNG_NF; i++) (function (i) { L('mecenas-walk-' + v + '-' + i + '.png', im => pngImgs[v].walk[i] = im); })(i);
    });
  }
  // Lienzo horneado para (dir, pose, frame) o null si aún no está listo.
  function sprite(dir, pose, frame) {
    if (!pngReadyFlag) return null;
    const b = pngBaked[PNG_VIEW[dir] || 'SE']; if (!b) return null;
    if (pose === 'sit' || pose === 'tumbado') return b.sit;
    if (pose === 'walk') { const n = b.walk.length; if (!n) return b.idle; return b.walk[(((frame | 0) % n) + n) % n]; }
    return b.idle;
  }
  // Imagen MAESTRA (alta resolución, 2× del juego) para (dir,pose,frame). Útil para
  // el retrato del panel, que se muestra más grande que el sprite de la finca.
  function imgFor(dir, pose, frame) {
    if (!pngImgs) return null;
    const im = pngImgs[PNG_VIEW[dir] || 'SE']; if (!im) return null;
    if (pose === 'sit' || pose === 'tumbado') return im.sit || im.idle;
    if (pose === 'walk') { const a = (im.walk || []).filter(Boolean); return a.length ? a[(((frame | 0) % a.length) + a.length) % a.length] : im.idle; }
    return im.idle;
  }
  if (PNG_ENABLED) pngLoad();   // desactivado → no se cargan los maestros HD

  return {
    draw, DIRS, FRAMES, W, H, palette, OUTFIT, SKINS, HAIRS,
    sprite, imgFor, pngReady: () => PNG_ENABLED && pngReadyFlag, PNG_W, PNG_H, PNG_FEET, PNG_NF,
    // Fracciones del MAESTRO (para la capa de personajes nítida, que dibuja el
    // maestro de alta resolución directamente): pies y ancho relativos a su alto.
    feetFrac: M_FEET / M_H, aspect: M_W / M_H
  };
})();

if (typeof window !== 'undefined') window.HacChar = HacChar;
if (typeof module !== 'undefined' && module.exports) module.exports = HacChar;
