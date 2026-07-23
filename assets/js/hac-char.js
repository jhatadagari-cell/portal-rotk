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
    canciller:     { kind: 'robe',  prop: 'tablet', robe: '#5b2c83', accent: '#d8b65a', ornate: true, beard: 2 },
    // Modelo ESPECIAL (Cao Cao, canciller de Wei con aire imperial): armadura de
    // escamas oscura + capa púrpura imperial que ondea/se arrastra + corona alta
    // dorada (通天冠). No es una aptitud de juego: se asigna por `aspecto.atuendo`.
    emperador:     { kind: 'armor', prop: 'none',   robe: '#4a2f6b', accent: '#e6c15a', cape: true, capeLong: true, imperial: true, crown: true, beard: 2 },
    // Modelo ESPECIAL (Sun Quan, soberano de Wu): túnica ROJA larga y ondulada que
    // se arrastra por el suelo, MANGAS RECOGIDAS (antebrazo a la vista) y pelo recogido
    // con corona/pincho imperial (topknot). Se asigna por `aspecto.atuendo` = 'soberano'.
    soberano:      { kind: 'robe',  prop: 'none',   robe: '#b0323a', accent: '#e6c15a', beard: 2, beardLong: true, robeLong: true, sleevesRolled: true, topknot: true, ornate: true },
    // Modelo ESPECIAL (Liu Bei, soberano de Shu): túnica BLANCA larga + MANTO verde
    // jade con brocado dorado sobre los hombros, HEBILLA de león y sus DOS ESPADAS
    // gemelas (雌雄雙股劍) al cinto. Aire virtuoso y humilde pero regio. `atuendo`='virtuoso'.
    virtuoso:      { kind: 'robe',  prop: 'none',   robe: '#dcd6c4', accent: '#d8b65a', beard: 2, robeLong: true, topknot: true, mantle: '#3f6b4a', dualSwords: true, beastBuckle: true },
    // Modelo ESPECIAL (Guan Yu, 關羽 el Dios de la Guerra): gran TÚNICA verde y dorada,
    // BARBA larguísima (美髯公), pañuelo verde 綸巾, tez algo rojiza (rasgo icónico) y su
    // GUANDAO 青龍偃月刀 en la mano. Además, ligeramente más ALTO (hac-folk lee la talla).
    // `atuendo`='general'.
    general:       { kind: 'robe',  prop: 'none',   arma: 'guandao', robe: '#2f6a41', accent: '#e6c15a', beard: 2, beardLong: true, robeLong: true, ornate: true, headwrap: true, ruddy: true },
    // Modelo ESPECIAL (Zhang Fei, 張飛 el fiero del puente de Changban): ARMADURA
    // oscura de escamas con oro, CAPA roja, BANDANA roja 紅巾, BARBA hirsuta (虎鬚) y
    // su LANZA SERPIENTE 丈八蛇矛 (punta ondulada con banderín rojo). `atuendo`='fiero'.
    fiero:         { kind: 'armor', prop: 'none',   arma: 'serpentspear', robe: '#33402c', accent: '#d8b65a', imperial: true, cape: true, capeLong: true, capeColor: '#9e2f27', bandana: true, beard: 2, beardWild: true }
  };
  const SKINS = ['#eac9a0', '#dcb487', '#c89a6e', '#ad7d54'];
  // Índices 0..3 = tonos oscuros originales (retrocompat); 4 entrecano, 5 canoso.
  const HAIRS = ['#1b1712', '#2c2318', '#46301a', '#0f0d0b', '#6b5b4a', '#9a938a'];

  function palette(aptId, aspecto) {
    aspecto = aspecto || {};
    // `aspecto.atuendo` fuerza un MODELO concreto (p.ej. 'emperador' para Cao Cao)
    // sin cambiar la aptitud de juego del personaje. Si no, el atuendo va por aptitud.
    const o = OUTFIT[aspecto.atuendo] || OUTFIT[aptId] || { kind: 'robe', prop: 'none', robe: '#5b4a8a', accent: '#d8b65a' };
    const robe = okHex(aspecto.robe) ? aspecto.robe : o.robe;
    const accent = okHex(aspecto.accent) ? aspecto.accent : o.accent;
    // Tez: normal por índice, o ROJIZA (Guan Yu, 關公 la cara roja) si el atuendo lo pide.
    const skin = o.ruddy ? '#c06a4e' : SKINS[(Number(aspecto.piel) || 0) % SKINS.length];
    const hair = HAIRS[(Number(aspecto.pelo) || 0) % HAIRS.length];
    // Flags de modelo: por defecto los del atuendo, con override opcional por aspecto.
    const flag = (k) => aspecto[k] != null ? !!aspecto[k] : !!o[k];
    const imperial = flag('imperial');
    // BARBA editable por `aspecto.barba` (índice 0..5); si no, la del atuendo (retrocompat).
    //  0 rasurado · 1 corta · 2 perilla (candado) · 3 larga · 4 hirsuta · 5 bigote caído (八字鬍)
    let beard = o.beard || 0, beardLong = !!o.beardLong, beardWild = !!o.beardWild, beardStyle = '';
    if (aspecto.barba != null) {
      const bi = Number(aspecto.barba) || 0;
      beard = 0; beardLong = false; beardWild = false; beardStyle = '';
      if (bi === 1) beard = 1;
      else if (bi === 2) beardStyle = 'perilla';
      else if (bi === 3) beardLong = true;
      else if (bi === 4) beardWild = true;
      else if (bi === 5) beardStyle = 'fumanchu';
    }
    return {
      // `aspecto.kind`/`aspecto.torsoLujo` permiten que una ROPA DE TORSO equipada
      // (HacTienda item.viste) redefina el atuendo del tronco sin tocar la cabeza:
      // p. ej. un guerrero (armadura) que se pone una túnica pasa a kind 'robe'.
      kind: aspecto.kind || o.kind, prop: o.prop, arma: aspecto.arma || o.arma || null, cape: flag('cape'), capeLong: flag('capeLong'), imperial, crown: flag('crown'), topknot: flag('topknot'), headwrap: flag('headwrap'), futou: flag('futou'), robeLong: flag('robeLong'), sleevesRolled: flag('sleevesRolled'), ornate: !!o.ornate, torsoLujo: !!aspecto.torsoLujo, torsoGala: !!aspecto.torsoGala,
      // `gala` = SELLO VISUAL de la ROPA DE TORSO RARA equipada ('general', 'erudito',
      // 'ministro', 'estratega', 'preceptor', 'intendente'): cada prenda de gala se
      // dibuja DISTINTA (cf. galaSello y la rama armor de torso), no solo recoloreada.
      gala: aspecto.torsoGala ? String(aspecto.gala || '') : '', beard, beardLong, beardStyle,
      mantle: okHex(aspecto.mantle) ? aspecto.mantle : (okHex(o.mantle) ? o.mantle : null), dualSwords: flag('dualSwords'), beastBuckle: flag('beastBuckle'),
      capeColor: okHex(aspecto.capeColor) ? aspecto.capeColor : (okHex(o.capeColor) ? o.capeColor : null), bandana: flag('bandana'), beardWild,
      robe, robeHi: light(robe, 0.16), robeDk: dark(robe, 0.30), robeSh: dark(robe, 0.50),
      beardC: dark(hair, 0.05),
      sash: dark(mix(robe, accent, 0.25), 0.05),
      trim: accent, trimHi: light(accent, 0.22), trimDk: dark(accent, 0.3),
      skin, skinHi: light(skin, 0.13), skinDk: dark(skin, 0.22),
      hair, hairHi: light(hair, 0.18),
      // Armadura IMPERIAL: acero casi negro (escamas oscuras de la lámina) en vez del gris.
      steel: imperial ? '#3b3946' : '#9aa4ae', steelHi: imperial ? '#615d70' : '#cfd6dd', steelDk: imperial ? '#201e28' : '#565e68',
      capeC: dark(robe, 0.42), capeHi: dark(robe, 0.26),
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

  function figure(px, P, base, g, pose, sec) {
    sec = sec || {};
    const v = viewOf(base);
    if (pose === 'sit') { figureSit(px, P, v, sec); return; }
    if (pose === 'bow') { figureBow(px, P, v); return; }
    if (pose === 'work') { figureWork(px, P, v, sec); return; }
    shadow(px);
    const longCape = P.cape && P.capeLong;
    const capeOverBack = longCape && v.back;   // DE ESPALDAS la capa cae sobre la espalda y TAPA el cuerpo
    if (P.cape && !capeOverBack) (longCape ? capeImperial : cape)(px, P, v, g);   // capa por DETRÁS (frente/perfil)
    legs(px, P, v, g);
    torso(px, P, v, g);
    if (P.robeLong) robeSkirtLong(px, P, v, g);    // TÚNICA larga: cubre las piernas y se arrastra por el suelo
    if (P.mantle) robeMantle(px, P, v, g);         // MANTO (Liu Bei): sobretúnica verde jade con brocado
    if (P.dualSwords) beltSwords(px, P, v, g);     // DOS espadas gemelas al cinto
    if (capeOverBack) capeImperial(px, P, v, g);   // capa POR ENCIMA: cubre la espalda entera
    // GESTO de debate: reemplaza los brazos en reposo por brazos expresivos (y la
    // cara la resuelve headFace con sec.expr). Los brazos van por delante de la cabeza.
    if (sec.gesture) { if (longCape) capeCollar(px, P, v, g); head(px, P, v, g, sec); gestureArms(px, P, v, g, sec); return; }
    if (!capeOverBack) backArm(px, P, v, g);     // brazo lejano (detrás del torso); de espaldas va bajo la capa
    if (longCape) capeCollar(px, P, v, g);       // esclavina + cuello dorado sobre los hombros (siempre encima)
    head(px, P, v, g, sec);
    // MANCO: falta el brazo cercano (y lo que sostuviera). Se ve el costado desnudo.
    if (!capeOverBack && !sec.manco) { frontArm(px, P, v, g); prop(px, P, v, g); }
  }

  // Pose SENTADA (descansando en el jardín). Figura compacta apoyada en el suelo.
  function figureSit(px, P, v, sec) {
    sec = sec || {};
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
    headFace(px, P, v, c, hy, sec);
    hairAndCap(px, P, v, c, hy);
  }

  // ── Poses de TRABAJO (jornada de producción) ────────────────────────────
  // forja (martillea el yunque), letras (traza con el pincel), campo (siega con
  // la hoz). Diseñadas para la vista SE (mira a la derecha); la animación llega
  // en sec.workPhase∈[0,1). SW sale por espejo del transform.
  function figureWork(px, P, v, sec) {
    sec = sec || {};
    if (sec.oficio === 'campo') { figureWorkCampo(px, P, v, sec); return; }
    // forja y letras comparten CUERPO sentado en un taburete, mirando la labor.
    const baseY = BASEY, c = CX + Math.round(v.dx * 0.6), lean = 2;
    const wood = '#6b4a2a', woodHi = light(wood, 0.18), woodDk = dark(wood, 0.3);
    shadow(px);
    // Taburete.
    px(c - 6, baseY - 3, 12, 3, wood); px(c - 6, baseY - 3, 12, 1, woodHi);
    px(c - 5, baseY, 2, 3, woodDk); px(c + 3, baseY, 2, 3, woodDk);
    // Muslos hacia delante + espinilla + pie.
    px(c - 4, baseY - 9, 12, 5, P.robe); px(c - 4, baseY - 9, 12, 1, P.robeHi); px(c - 4, baseY - 5, 12, 1, P.robeSh);
    px(c + 7, baseY - 9, 4, 4, P.robeDk);
    px(c + 7, baseY - 5, 4, 5, P.robe);
    px(c + 6, baseY, 5, 2, P.boot); px(c + 6, baseY, 5, 1, P.bootHi);
    // Torso erguido, ligeramente inclinado al frente.
    const tBot = baseY - 9, tTop = baseY - 26;
    for (let y = tTop; y < tBot; y++) {
      const t = (y - tTop) / (tBot - tTop), lx = c - 5 + Math.round(lean * (1 - t));
      px(lx, y, 10, 1, P.robe); px(lx, y, 2, 1, P.robeHi); px(lx + 8, y, 2, 1, P.robeDk);
    }
    if (!v.back) for (let i = 0; i < 7; i++) px(c - 3 + lean + i, tTop + 2 + i, 2, 1, P.trim);   // solapa
    px(c - 5 + lean, tBot - 3, 10, 2, P.sash);                                                   // faja
    // Cabeza mirando la labor.
    const hy = tTop - 10;
    px(c - 2 + lean, tTop - 3, 4, 4, P.skinDk);                                                  // cuello
    headFace(px, P, v, c + lean, hy, sec);
    hairAndCap(px, P, v, c + lean, hy);
    const shY = tTop + 1, fx = c - 3 + lean, nx = c + 5 + lean, w = P.kind === 'armor' ? 3 : 4;
    if (sec.oficio === 'letras') figureWorkLetras(px, P, v, sec, c, baseY, shY, fx, nx, w);
    else figureWorkForja(px, P, v, sec, c, baseY, shY, fx, nx, w);
  }

  // FORJA: sentado ante el yunque, el martillo pivota en el codo (siempre a la
  // DERECHA, despejando la cara): se alza y golpea la pieza al rojo.
  function figureWorkForja(px, P, v, sec, c, baseY, shY, fx, nx, w) {
    const iron = '#41474e', ironHi = '#5b636c', ironDk = '#2b2f34', wood = '#6b4a2a', woodHi = light(wood, 0.2);
    const ember = '#ff8a3c', emberHi = '#ffd15a', emberCore = '#fff2b0';
    const ax = c + 8, atop = baseY - 15;
    px(ax - 1, baseY - 7, 8, 7, ironDk);                                       // base
    px(ax + 1, baseY - 10, 4, 3, iron);                                        // cintura
    px(ax - 2, atop, 10, 4, iron); px(ax - 2, atop, 10, 1, ironHi); px(ax - 2, atop + 3, 10, 1, ironDk);   // cara
    px(ax + 8, atop + 1, 2, 2, iron);                                          // cuerno
    const bar = ax + 1;                                                        // pieza al rojo
    px(bar, atop - 1, 5, 1, emberHi); px(bar, atop, 6, 1, ember); px(bar + 1, atop - 1, 3, 1, emberCore);
    const ph = sec.workPhase || 0;
    let lift; if (ph < 0.55) lift = 1; else if (ph < 0.72) lift = 1 - (ph - 0.55) / 0.17;
    else if (ph < 0.80) lift = 0; else lift = (ph - 0.80) / 0.20;
    // Mano FIJA agarrando; la cabeza del martillo pivota en la muñeca de alzada
    // (arriba, despejando la cara) a golpe (sobre la pieza al rojo).
    const H = { x: c + 6, y: baseY - 19 };                                     // muñeca
    const tx = Math.round((bar + 2) + ((H.x + 5) - (bar + 2)) * lift);          // cabeza: brasa→arriba-dcha
    const ty = Math.round((atop - 1) + ((H.y - 12) - (atop - 1)) * lift);
    // Brazo de apoyo con TENAZAS sujetando la pieza sobre el yunque.
    armBent(px, P, fx, shY, c + 2, shY + 6, bar - 2, atop + 1, P.robeDk, w, true);
    px(bar - 2, atop - 1, 1, 3, ironDk); px(bar - 1, atop, 3, 1, ironDk);       // tenazas
    // Brazo del martillo hasta la muñeca fija.
    limbSeg(px, P.robe, nx, shY, c + 6, shY + 6, w); limbSeg(px, P.robe, c + 6, shY + 6, H.x, H.y, Math.max(2, w - 1));
    hand(px, P, H.x, H.y, false);
    // Mango + cabeza (bloque perpendicular al mango).
    limbSeg(px, wood, H.x, H.y, tx, ty, 2); px(tx - 1, ty - 1, 2, 2, woodHi);
    const dx = tx - H.x, dy = ty - H.y, len = Math.max(1, Math.hypot(dx, dy)), pcx = -dy / len, pcy = dx / len;
    for (let s = -2; s <= 2; s++) { const bx = Math.round(tx + s * pcx), by = Math.round(ty + s * pcy); px(bx - 1, by - 1, 2, 2, s < 0 ? ironHi : iron); }
    if (lift < 0.2 && ph > 0.68 && ph < 0.9) {                                 // chispas en el impacto
      px(bar + 1, atop - 3, 1, 1, emberCore); px(bar + 3, atop - 4, 1, 1, emberHi);
      px(bar - 1, atop - 3, 1, 1, ember); px(bar + 4, atop - 2, 1, 1, emberHi);
    }
  }

  // LETRAS: sentado a una mesita alta, el pincel traza sobre el papel y los
  // caracteres se acumulan por ciclo.
  function figureWorkLetras(px, P, v, sec, c, baseY, shY, fx, nx, w) {
    const wood = '#6b4a2a', woodHi = light(wood, 0.18), woodDk = dark(wood, 0.3);
    const paper = '#ece0c2', paperSh = dark(paper, 0.15), inkC = P.ink;
    const dx0 = c + 2, dtop = shY + 9;                                         // tablero a la altura del regazo/pecho
    px(dx0, dtop, 13, 2, wood); px(dx0, dtop, 13, 1, woodHi);                   // tablero
    px(dx0 + 1, dtop + 2, 2, baseY - 2 - (dtop + 2), woodDk);                   // patas
    px(dx0 + 10, dtop + 2, 2, baseY - 2 - (dtop + 2), woodDk);
    px(dx0 + 1, dtop - 2, 8, 2, paper); px(dx0 + 1, dtop - 2, 8, 1, light(paper, 0.15)); px(dx0 + 1, dtop, 8, 1, paperSh);  // papel
    px(dx0 + 10, dtop - 1, 2, 1, inkC);                                        // piedra de tinta
    const ph = sec.workPhase || 0, col = Math.floor(ph * 4);
    for (let k = 0; k <= col && k < 4; k++) { px(dx0 + 2 + k * 2, dtop - 2, 1, 2, inkC); px(dx0 + 2 + k * 2, dtop - 1, 2, 1, inkC); }  // trazos
    const bx = dx0 + 2 + Math.min(col, 3) * 2, by = dtop - 3 - Math.round(Math.abs(Math.sin(ph * Math.PI * 4)));
    armBent(px, P, fx, shY, c + 1, shY + 6, dx0 + 1, dtop - 1, P.robeDk, w, true);  // mano de apoyo en la mesa
    armBent(px, P, nx, shY, c + 6, shY + 5, bx, by, P.robe, w, false);          // brazo del pincel
    px(bx, by - 4, 1, 4, wood); px(bx, by, 1, 2, inkC);                         // pincel (mango + punta)
  }

  // CAMPO: agachado entre las espigas, la hoz barre a ras de suelo.
  function figureWorkCampo(px, P, v, sec) {
    const baseY = BASEY, c = CX + Math.round(v.dx * 0.6);
    const grain = P.gold, grainHi = P.goldHi, stalk = '#a9812f';
    const steel = P.steel, steelHi = P.steelHi, wood = '#6b4a2a';
    shadow(px);
    for (let i = 0; i < 4; i++) { const gx = c + 6 + i * 2; px(gx, baseY - 10, 1, 10, stalk); px(gx - 1, baseY - 12, 3, 2, grain); px(gx, baseY - 13, 1, 1, grainHi); }  // espigas
    px(c - 6, baseY - 6, 8, 6, P.robe); px(c - 6, baseY - 6, 8, 1, P.robeHi);   // muslos plegados
    px(c - 6, baseY, 4, 2, P.boot); px(c + 1, baseY, 4, 2, P.boot);             // pies
    const hipY = baseY - 6, shY = baseY - 20;
    for (let y = shY; y < hipY; y++) { const t = (y - shY) / (hipY - shY), lx = c - 4 + Math.round(6 * t); px(lx, y, 9, 1, P.robe); px(lx, y, 2, 1, P.robeHi); px(lx + 7, y, 2, 1, P.robeDk); }  // torso inclinado
    px(c - 3, hipY - 2, 9, 2, P.sash);
    const hcx = c + 5, hy = shY - 8;                                            // cabeza agachada
    px(hcx - 2, shY - 2, 4, 3, P.skinDk);
    headFace(px, P, v, hcx, hy, sec); hairAndCap(px, P, v, hcx, hy);
    const ph = sec.workPhase || 0, sweep = Math.sin(ph * Math.PI * 2);
    const hx = c + 9 + Math.round(sweep * 3), hyv = baseY - 10, w = P.kind === 'armor' ? 3 : 4;
    armBent(px, P, c + 4, shY + 2, c + 7, shY + 6, hx, hyv, P.robe, w, false);        // brazo de la hoz
    armBent(px, P, c - 1, shY + 2, c + 2, shY + 7, c + 4, baseY - 9, P.robeDk, w, true);  // recoge las espigas
    // HOZ: mango corto en la mano + hoja de acero curva (gancho) a ras de las espigas.
    px(hx, hyv - 2, 2, 4, wood); px(hx, hyv - 2, 1, 4, light(wood, 0.2));       // mango
    px(hx - 4, hyv, 5, 1, steel); px(hx - 4, hyv, 5, 1, steelHi);               // filo horizontal
    px(hx - 6, hyv - 1, 2, 1, steel); px(hx - 6, hyv - 2, 1, 1, steel);         // punta que curva hacia arriba
    px(hx - 4, hyv + 1, 4, 1, dark(steel, 0.3));                                 // sombra del filo
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
    if (P.crown) {                                                         // corona imperial picada
      px(c - 4, topY - 4, 9, 4, P.gold); px(c - 4, topY - 4, 9, 1, P.goldHi);
      px(c - 1, topY - 4, 1, 4, dark(P.gold, 0.22)); px(c + 1, topY - 4, 1, 4, dark(P.gold, 0.22));
      px(c - 6, topY - 2, 13, 1, P.goldHi);                               // horquilla 簪
    } else if (P.kind === 'armor') {                                       // casco con cresta al frente
      px(c - 5, topY - 1, 10, 3, P.steel); px(c - 5, topY - 1, 10, 1, P.steelHi); px(c - 5, topY + 2, 10, 1, P.steelDk);
      px(c - 1, topY - 4, 3, 4, P.torsoGala ? '#a83a2e' : P.trim); px(c - 1, topY - 5, 3, 1, P.torsoGala ? '#c5543f' : P.goldHi);   // cresta (escarlata en la coraza de gala)
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

  // COJERA: una pierna sana da el paso; la otra se ARRASTRA, rígida y plantada más
  // baja, sin apenas levantarse. Da la marcha renqueante del herido (peregrinaje).
  function legsLimp(px, P, v) {
    const y = BASEY;
    if (v.side >= 1) {                                   // perfil: pierna buena delante, mala rezagada
      const fx = CX + 2, bx = CX - 6;
      px(bx, y - 1, 6, 5, P.boot); px(bx, y - 1, 6, 1, P.bootHi);        // mala: arrastrada, plantada baja
      px(fx, y - 4, 6, 4, P.bootHi); px(fx, y - 3, 6, 3, P.boot);        // buena: adelantada
    } else {                                             // frente/espalda: izq buena, der arrastra
      const lx = CX - 6, rx = CX + 1;
      px(lx, y - 4, 5, 5, P.boot); px(lx, y - 4, 5, 1, P.bootHi);        // buena: pisa firme
      px(rx, y - 1, 5, 5, P.boot); px(rx, y - 1, 5, 1, P.bootHi);        // mala: plantada más baja, rígida
    }
  }
  // Botas: en perfil zancada en X; de frente/espalda lado a lado alternando.
  function legs(px, P, v, g) {
    if (g.limp) { legsLimp(px, P, v); return; }
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
        for (let s = -aHalf + 1 + off; s < aHalf; s += 2) px(c + s, aTop + r, 1, 1, P.imperial ? P.gold : P.steelHi);   // tachones dorados en la armadura imperial
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
      // GALA de armadura: la Casaca del General (rara) o una ARMADURA ÉPICA (Lü Bu / Sun
      // Quan). Cada una remata la coraza con su sello propio. Ver galaArmor.
      if (P.torsoGala) galaArmor(px, P, v, { c, top, aTop, aH, aHalf });
    } else {
      // Hombros + cuello.
      px(c - shHalf, top, shHalf * 2, 2, P.robeHi);
      // GALA = ropa de torso RARA: dorados extra (charreteras con tachón, brocado del
      // placket, bajo dorado doble y medallón), por encima del acabado `torsoLujo`.
      const gala = P.torsoGala;
      // ROPA DE TORSO fina (torsoLujo): charreteras de acento en ambos hombros.
      if (P.torsoLujo) { px(c - shHalf, top, 3, 2, P.trim); px(c + shHalf - 3, top, 3, 2, P.trim); px(c - shHalf, top, 3, 1, P.trimHi); px(c + shHalf - 3, top, 3, 1, P.trimHi); }
      if (gala) { px(c - shHalf + 1, top, 1, 1, P.goldHi); px(c + shHalf - 2, top, 1, 1, P.goldHi); }   // tachón dorado en cada charretera
      // Solapa cruzada (jiaoling) con ribete. En las galas de CORTE (ministro,
      // preceptor) es dorada; las de letras/viaje (erudito, estratega) llevan la
      // vuelta CLARA del acento y el intendente la conserva sobria para que su
      // bandolera de cuero se lea sin maraña.
      const lapelC = gala ? ((P.gala === 'ministro' || P.gala === 'preceptor' || !P.gala) ? P.gold : P.trim) : P.trim;
      if (!v.back) {
        for (let i = 0; i < 12; i++) px(c - 6 + i + Math.round(v.dx * 0.5), top + 2 + i, 2, 1, i < 2 ? P.skinDk : lapelC);
        px(c - 5 + Math.round(v.dx * 0.5), top + 2, 2, 2, P.robeHi);   // cuello interior
      }
      // Placket/brocado frontal (banda central). Dorado con tachones en ornate o en
      // las galas de corte; el resto de galas lo llevan sobrio (su sello va aparte).
      if (!v.back) {
        const bandTop = top + 3, bandBot = beltY, rico = P.ornate || (gala && lapelC === P.gold);
        px(c - 1 + Math.round(v.dx * 0.4), bandTop, 2, bandBot - bandTop, rico ? P.gold : P.trimDk);
        if (rico) for (let yy = bandTop + 1; yy < bandBot; yy += 2) px(c + Math.round(v.dx * 0.4), yy, 1, 1, gala ? P.goldHi : P.robeDk);
      }
      // Faja.
      px(c - hemHalf + 1, beltY, hemHalf * 2 - 2, 3, P.sash);
      px(c - hemHalf + 1, beltY, hemHalf * 2 - 2, 1, light(P.sash, 0.12));
      px(c - hemHalf + 1, beltY + 2, hemHalf * 2 - 2, 1, dark(P.sash, 0.2));
      if (v.front) { px(c - 2, beltY + 2, 4, 4, P.trim); px(c - 1, beltY + 6, 2, 3, P.trimDk); }  // nudo + caída
      // MEDALLÓN de gala: gema de jade con marco dorado sobre la faja (solo de frente).
      // Solo en las galas SIN sello con colgante propio (el preceptor lo conserva).
      if (gala && v.front && (!P.gala || P.gala === 'preceptor')) { px(c - 2, beltY + 1, 4, 4, P.gold); px(c - 1, beltY + 2, 2, 2, P.jade); }
      if (P.ornate || gala) { px(c - hemHalf, hemY - 3, hemHalf * 2, 1, P.goldHi); px(c - hemHalf, hemY - 2, hemHalf * 2, 1, P.gold); px(c - hemHalf, hemY - 1, hemHalf * 2, 1, P.trimDk); if (v.front && P.ornate) px(c - 1, beltY + 2, 2, 3, P.jade); }
      // ROPA DE TORSO fina: banda de ribete en el bajo (si no es ya la ornamentada dorada).
      else if (P.torsoLujo) { px(c - hemHalf, hemY - 2, hemHalf * 2, 1, P.trimDk); px(c - hemHalf, hemY - 1, hemHalf * 2, 1, P.trim); }
      // Pliegues verticales de la falda.
      const sTop = beltY + 4;
      px(c - Math.round(hemHalf * 0.5), sTop, 1, hemY - sTop, P.robeDk);
      px(c + Math.round(hemHalf * 0.45), sTop, 1, hemY - sTop, P.robeDk);
      px(c + Math.round(hemHalf * 0.45) + 1, sTop, 1, hemY - sTop, P.robeHi);
      // SELLO VISUAL de la ropa rara (encima de todo el acabado genérico).
      if (gala && P.gala) galaSello(px, P, v, { c, top, beltY, hemY, shHalf, hemHalf, rows });
    }
  }

  // ── SELLO de las CORAZAS de gala (kind 'armor'): la Casaca del General (rara) y las
  // ARMADURAS ÉPICAS (戰神鎧 Lü Bu, 江東鎧 Sun Quan). `q` trae la geometría de la coraza.
  function galaArmor(px, P, v, q) {
    const { c, top, aTop, aH, aHalf } = q;
    const dx4 = Math.round(v.dx * 0.4), mx = c + dx4;
    if (P.gala === 'epic-zhanshen') {
      // 戰神鎧 — DIOS DE LA GUERRA (Lü Bu): coraza negra laqueada con TODO el filo dorado,
      // hombreras de cabeza de bestia (獸吞) doradas y GRAN espejo pectoral con relieve.
      const negro = '#1e1b24', filo = P.gold;
      for (let r = 0; r < aH; r += 2) { px(c - aHalf, aTop + r, aHalf * 2, 1, negro); px(c - aHalf, aTop + r + 1, aHalf * 2, 1, filo); }  // láminas negras, filo oro
      px(c - 5, top, 10, 2, negro); px(c - 5, top, 10, 1, P.goldHi);                        // gola negra ribeteada en oro
      // Hombreras 獸吞 (fauces de bestia doradas que "muerden" el hombro).
      const shoulder = (sx) => { px(sx, top, 5, 4, filo); px(sx, top, 5, 1, P.goldHi); px(sx + 1, top + 2, 1, 1, '#7a2620'); px(sx + 3, top + 2, 1, 1, '#7a2620'); px(sx, top + 3, 5, 1, dark(P.gold, 0.35)); };
      if (v.side < 1) shoulder(c - aHalf - 3); shoulder(c + aHalf - 2);
      if (!v.back) {                                                                        // GRAN espejo pectoral 護心鏡 con relieve
        px(mx - 4, aTop + 2, 2, 1, negro); px(mx + 3, aTop + 2, 2, 1, negro);               // correas
        px(mx - 3, aTop + 2, 6, 6, filo); px(mx - 3, aTop + 2, 6, 1, P.goldHi);             // marco dorado
        px(mx - 2, aTop + 3, 4, 4, '#2a2630'); px(mx - 1, aTop + 4, 2, 2, P.goldHi);        // espejo oscuro con brillo central
      }
      px(c - aHalf - 1, aTop + aH - 1, aHalf * 2 + 2, 2, filo);                             // cinturón dorado ancho
      if (v.front) { px(c - 1, aTop + aH + 1, 2, 5, '#7a2620'); px(c - 1, aTop + aH + 1, 2, 1, '#b8402f'); }  // fajín de guerra granate
      for (let s = -aHalf + 1; s <= aHalf - 3; s += 3) px(c + s, aTop + aH + 6, 3, 1, filo);                  // puntas doradas de los tassets
    } else if (P.gala === 'epic-jiangdong') {
      // 江東鎧 — SEÑOR DE WU (Sun Quan): coraza escarlata y BRONCE, con espejo pectoral
      // redondo bruñido y ribetes de bronce; cinturón con placa central.
      const rojo = '#7a2620', rojoHi = '#a8352a', bronce = '#c98a3a', bronceHi = '#e6b878';
      for (let r = 0; r < aH; r += 2) { px(c - aHalf, aTop + r, aHalf * 2, 1, rojo); px(c - aHalf, aTop + r, aHalf * 2, 1, r % 4 === 0 ? rojoHi : rojo); px(c - aHalf, aTop + r + 1, aHalf * 2, 1, bronce); }  // escamas rojas, filo bronce
      px(c - 5, top, 10, 2, rojo); px(c - 5, top, 10, 1, bronceHi);                         // gola escarlata ribete bronce
      if (v.side < 1) { px(c - aHalf - 3, top + 1, 5, 4, bronce); px(c - aHalf - 3, top + 1, 5, 1, bronceHi); }  // hombreras de bronce
      px(c + aHalf - 2, top + 1, 5, 4, bronce); px(c + aHalf - 2, top + 1, 5, 1, bronceHi);
      if (!v.back) { px(mx - 3, aTop + 3, 6, 5, bronce); px(mx - 3, aTop + 3, 6, 1, bronceHi); px(mx - 2, aTop + 4, 4, 3, rojoHi); px(mx - 1, aTop + 5, 2, 1, bronceHi); }  // espejo redondo bruñido
      px(c - aHalf - 1, aTop + aH - 1, aHalf * 2 + 2, 2, bronce);                           // cinturón de bronce
      if (v.front) { px(c - 2, aTop + aH - 1, 4, 3, bronceHi); px(c - 1, aTop + aH, 2, 1, rojoHi); }  // placa central de la hebilla
      for (let s = -aHalf + 1; s <= aHalf - 3; s += 3) px(c + s, aTop + aH + 6, 3, 1, bronce);
    } else {
      // Casaca del General 名將袍 (RARA): gola y láminas con filo dorado, hombreras
      // ribeteadas, espejo pectoral 護心鏡 con correas y fajín de mando escarlata.
      px(c - 5, top, 10, 1, P.goldHi);
      for (let r = 0; r < aH; r += 4) px(c - aHalf, aTop + r + 1, aHalf * 2, 1, P.gold);
      if (v.side < 1) px(c - aHalf - 3, top + 1, 5, 1, P.gold);
      px(c + aHalf - 2, top + 1, 5, 1, P.gold);
      if (!v.back) {
        px(mx - 4, aTop + 3, 3, 1, P.robeSh); px(mx + 2, aTop + 3, 3, 1, P.robeSh);
        px(mx - 2, aTop + 2, 4, 4, P.gold); px(mx - 1, aTop + 3, 2, 2, P.steelHi);
      }
      if (v.front) { px(c - 1, aTop + aH + 1, 2, 4, '#a83a2e'); px(c - 1, aTop + aH + 1, 2, 1, '#c5543f'); }
      for (let s = -aHalf + 1; s <= aHalf - 3; s += 3) px(c + s, aTop + aH + 6, 3, 1, P.gold);
    }
  }

  // ── SELLO VISUAL de cada ROPA DE TORSO RARA (P.gala, cf. catálogo HacTienda) ──
  // Cada gala de túnica añade un rasgo PROPIO reconocible de un vistazo (la del
  // General no pasa por aquí: es kind 'armor' y se remata en la rama de armadura).
  // `q` trae la geometría del torso ya calculada para la vista actual.
  function galaSello(px, P, v, q) {
    const { c, top, beltY, hemY, shHalf, hemHalf } = q;
    const dx5 = Math.round(v.dx * 0.5), dx4 = Math.round(v.dx * 0.4);
    if (P.gala === 'erudito') {
      // GRAN ERUDITO 鴻儒: vuelta clara paralela a la solapa, colgante de jade 玉佩
      // al cinto y nubes claras bordadas en la falda.
      if (!v.back) for (let i = 2; i < 11; i++) px(c - 4 + i + dx5, top + 2 + i, 1, 1, P.trimHi);
      if (v.front) { px(c - 3, beltY + 3, 1, 3, P.trimDk); px(c - 4, beltY + 6, 3, 3, P.jade); px(c - 3, beltY + 7, 1, 1, dark(P.jade, 0.45)); }
      px(c + Math.round(hemHalf * 0.35), beltY + 7, 2, 1, P.trimHi);
      px(c - Math.round(hemHalf * 0.55), beltY + 9, 2, 1, P.trimHi);
      px(c + 1, hemY - 6, 2, 1, P.trimHi);
    } else if (P.gala === 'ministro') {
      // MINISTRO 相國: cinturón de placas DORADAS con jades engastados (玉帶) en vez
      // de faja de tela + cordón escarlata del cargo (綬) colgando del cinto.
      px(c - hemHalf + 1, beltY, hemHalf * 2 - 2, 3, P.gold);
      px(c - hemHalf + 1, beltY, hemHalf * 2 - 2, 1, P.goldHi);
      px(c - hemHalf + 1, beltY + 2, hemHalf * 2 - 2, 1, dark(P.gold, 0.35));
      for (let s = -hemHalf + 3; s <= hemHalf - 5; s += 4) px(c + s, beltY + 1, 2, 1, P.jade);
      if (v.front) { px(c + 3, beltY + 3, 2, 5, '#a83a2e'); px(c + 3, beltY + 8, 2, 1, P.gold); }
    } else if (P.gala === 'estratega') {
      // GRAN ESTRATEGA 臥龍: esclavina de viaje sobre los hombros (vivo claro en el
      // borde, broche al frente) y el trigrama ☰ a la espalda.
      const mC = dark(P.robe, 0.26), mHi = dark(P.robe, 0.10);
      for (let i = 0; i < 7; i++) {
        const t = i / (q.rows - 1);
        const hw = Math.round(shHalf + (hemHalf - shHalf) * Math.pow(t, 0.8)) + 1;
        px(c - hw, top + i, hw * 2, 1, i === 6 ? P.trimHi : mC);
        if (i < 6) px(c - hw, top + i, 2, 1, mHi);
      }
      if (!v.back) px(c - 1 + dx4, top + 3, 2, 2, P.trim);                                   // broche de la esclavina
      else { px(c - 2, top + 1, 4, 1, P.trimHi); px(c - 2, top + 3, 4, 1, P.trimHi); px(c - 2, top + 5, 4, 1, P.trimHi); }  // ☰
    } else if (P.gala === 'preceptor') {
      // PRECEPTOR 太傅: cuello de nubes dorado (vuelta + festón por la solapa) y
      // brocado de trazos dorados sobre el bajo. Conserva el medallón de jade.
      px(c - shHalf, top + 1, shHalf * 2, 1, P.gold);
      if (!v.back) for (let i = 1; i < 11; i += 2) px(c - 6 + i + dx5, top + 2 + i, 1, 1, P.goldHi);
      for (let s = -hemHalf + 2; s <= hemHalf - 3; s += 3) px(c + s, hemY - 5, 1, 2, P.gold);
    } else if (P.gala === 'intendente') {
      // GRAN INTENDENTE 大司農: bandolera de cuero cruzada (con remaches y hebilla
      // dorada) y bolsas de avituallamiento colgadas del cinto.
      for (let i = 0; i < 13; i++) {
        const bx = v.back ? c - 6 + i : c + 5 - i + dx5;
        px(bx, top + 2 + i, 2, 1, i % 5 === 2 ? P.bootHi : P.boot);
      }
      if (!v.back) px(c - 1 + dx4, top + 8, 2, 2, P.gold);                                   // hebilla
      if (v.front) { px(c - 7, beltY + 3, 4, 4, P.boot); px(c - 7, beltY + 3, 4, 1, P.bootHi); px(c + 4, beltY + 4, 3, 3, P.boot); px(c + 4, beltY + 4, 3, 1, P.bootHi); }  // bolsas
    } else if (P.gala === 'epic-hechang') {
      // 鶴氅 — PLUMAS DE GRULLA (Zhuge Liang): manto níveo con esclavina de plumas (vivo
      // celeste marcado para dar contraste sobre el blanco), una GRULLA volando bordada al
      // pecho, columna de jades por la solapa y ancho ribete celeste con nubes en el bajo.
      const celeste = P.trim, celHi = P.trimHi, celDk = P.trimDk;
      for (let i = 0; i < 7; i++) {
        const hw = Math.round(shHalf + (hemHalf - shHalf) * Math.pow(i / (q.rows - 1), 0.8)) + 1;
        px(c - hw, top + i, hw * 2, 1, i >= 5 ? celeste : '#f6f9fc');                     // capa de plumas, borde celeste
        if (i === 4) px(c - hw, top + i, hw * 2, 1, celHi);                               // vivo claro intermedio
        if (i < 5) { px(c - hw, top + i, 1, 1, celDk); px(c + hw - 1, top + i, 1, 1, celDk); }  // cantos celestes (contraste)
      }
      if (!v.back) {                                                                      // columna de jades por la solapa
        for (let yy = top + 8; yy < beltY; yy += 3) px(c - 4 + Math.round(v.dx * 0.5), yy, 2, 1, celeste);
      }
      if (v.front) {                                                                      // GRULLA volando (alas en V + cuello arqueado)
        px(c - 1, top + 10, 2, 2, celeste);                                               // cuerpo
        px(c - 4, top + 9, 3, 1, celeste); px(c + 2, top + 9, 3, 1, celeste);             // alas abiertas
        px(c - 5, top + 8, 1, 1, celHi); px(c + 4, top + 8, 1, 1, celHi);                 // puntas de las alas
        px(c + 1, top + 8, 1, 2, celeste); px(c + 1, top + 7, 1, 1, celDk);               // cuello arqueado + cabeza
      }
      px(c - hemHalf, hemY - 4, hemHalf * 2, 1, celeste); px(c - hemHalf, hemY - 3, hemHalf * 2, 1, celHi);   // ancho ribete celeste
      for (let s = -hemHalf + 1; s <= hemHalf - 2; s += 3) px(c + s, hemY - 2, 2, 1, celeste);                // nubes del bajo
      if (v.back) { px(c - 4, top + 3, 8, 1, celeste); px(c - 5, top + 6, 10, 1, celeste); }                  // pliegues de la esclavina por detrás
    } else if (P.gala === 'epic-manpao') {
      // 蟒袍 — DRAGÓN IMPERIAL (Wei): dragón dorado ascendente al frente, cuello de nubes
      // doradas, cinturón de jade y olas doradas (海水江崖) en el bajo.
      px(c - shHalf, top + 1, shHalf * 2, 1, P.gold);                                         // cuello de nubes
      if (!v.back) {
        // DRAGÓN dorado serpenteante ascendente (cuerpo fino ondulado de 1px + cabeza y
        // garra), a lo largo del eje del pecho: se lee como criatura, no como aspa.
        const dxb = c + dx4;
        const seg = [[-1, beltY - 1], [0, beltY - 3], [1, beltY - 5], [0, beltY - 7], [-1, beltY - 9], [0, beltY - 11]];
        seg.forEach(([ox, oy], i) => { px(dxb + ox, oy, 1, 2, i % 2 ? P.goldHi : P.gold); });   // cuerpo ondulado
        px(dxb - 1, beltY - 12, 3, 2, P.goldHi);                                              // cabeza
        px(dxb + 2, beltY - 13, 1, 1, P.gold); px(dxb - 2, beltY - 13, 1, 1, P.gold);          // cuernos/melena
        px(dxb - 3, beltY - 6, 1, 1, P.gold); px(dxb + 2, beltY - 8, 1, 1, P.gold);            // garras
      } else { px(c, top + 5, 1, 2, P.gold); px(c - 1, top + 8, 1, 2, P.gold); px(c, top + 11, 1, 2, P.gold); px(c - 1, top + 14, 1, 2, P.gold); }  // dragón sugerido subiendo por la espalda
      px(c - hemHalf + 1, beltY, hemHalf * 2 - 2, 3, P.gold); px(c - hemHalf + 1, beltY, hemHalf * 2 - 2, 1, P.goldHi);   // cinturón dorado
      for (let s = -hemHalf + 3; s <= hemHalf - 5; s += 4) px(c + s, beltY + 1, 2, 1, P.jade);  // jades del cinturón
      for (let s = -hemHalf; s <= hemHalf - 2; s += 2) { px(c + s, hemY - 2, 2, 1, P.gold); px(c + s + 1, hemY - 3, 1, 1, P.goldHi); }  // olas 海水江崖 del bajo
    } else if (P.gala === 'epic-wusheng') {
      // 武聖袍 — SABIO MARCIAL (Guan Yu): sobreveste verde jade sobre coraza insinuada,
      // banda cruzada dorada al pecho y borde dorado; el pañuelo verde va en hairAndCap.
      const jadeV = P.trim;
      if (!v.back) { for (let i = 0; i < 11; i++) px(c - 5 + i + dx5, top + 3 + i, 2, 1, i < 3 ? dark(jadeV, 0.2) : P.gold); }  // banda cruzada dorada
      px(c - shHalf, top, shHalf * 2, 1, P.gold);                                             // hombro ribeteado
      if (v.front) { px(c - 3, beltY - 3, 6, 2, P.steelDk); px(c - 3, beltY - 3, 6, 1, P.steelHi); }   // coraza insinuada bajo la veste
      px(c - hemHalf, hemY - 2, hemHalf * 2, 1, P.gold); px(c - hemHalf, hemY - 1, hemHalf * 2, 1, dark(P.gold, 0.3));  // bajo dorado
      for (let s = -hemHalf + 3; s <= hemHalf - 3; s += 4) px(c + s, hemY - 5, 1, 2, P.gold);  // grecas
    } else if (P.gala === 'epic-jiuxi') {
      // 九錫袍 — NUEVE DISTINCIONES (Sima Yi): vestidura oscura con cuello alto de nubes
      // doradas y NUEVE emblemas dorados (符命) dispuestos en el pecho y la falda.
      px(c - shHalf, top, shHalf * 2, 1, P.gold); px(c - shHalf, top + 1, shHalf * 2, 1, P.goldHi);   // cuello alto dorado
      if (!v.back) for (let i = 0; i < 11; i += 2) px(c - 6 + i + dx5, top + 2 + i, 1, 1, P.goldHi);   // festón de la solapa
      // Nueve emblemas 符命: 3 filas × 3, dorados, sobre el torso/falda.
      const ey = [beltY - 6, beltY + 2, hemY - 5];
      ey.forEach((yy, ri) => { for (let k = -1; k <= 1; k++) { px(c + k * 4 + (ri === 1 ? 0 : 0), yy, 2, 2, P.gold); px(c + k * 4, yy, 1, 1, P.goldHi); } });
      if (v.front) { px(c - 2, beltY + 1, 4, 3, P.gold); px(c - 1, beltY + 2, 2, 1, P.jade); }   // placa de jade central
    }
  }

  // Manga + puño + mano. wide=manga ancha (túnica).
  function sleeve(px, P, x, y, sw, sh, front) {
    const base = front ? P.robe : P.robeDk;
    // MANGAS RECOGIDAS: manga corta hasta el codo + puño dorado + antebrazo y mano a la vista.
    if (P.sleevesRolled) {
      const up = sh - 5;
      px(x, y, sw, up, base); px(x, y, sw, 1, front ? P.robeHi : P.robe);
      px(x, y + up, sw, 2, front ? P.trim : P.trimDk);                       // vuelta/puño dorado
      px(x, y + up, sw, 1, front ? P.trimHi : P.trim);
      const fx = x + 1;
      px(fx, y + up + 2, sw - 2, 3, front ? P.skin : P.skinDk);              // antebrazo desnudo
      px(fx, y + up + 2, sw - 2, 1, front ? P.skinHi : P.skin);
      px(fx, y + up + 5, sw - 2, 2, front ? P.skin : P.skinDk);              // mano
      return;
    }
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

  // ── GESTOS DE DEBATE ──────────────────────────────────────────────────────
  // Segmento "grueso" (brazo) entre dos puntos, pintado por pasos.
  function limbSeg(px, color, x0, y0, x1, y1, w) {
    const dx = x1 - x0, dy = y1 - y0, n = Math.max(Math.abs(dx), Math.abs(dy), 1), h = (w / 2) | 0;
    for (let i = 0; i <= n; i++) px(Math.round(x0 + dx * i / n) - h, Math.round(y0 + dy * i / n) - h, w, w, color);
  }
  function hand(px, P, x, y, far) {
    px(x - 1, y - 1, 3, 3, far ? P.skinDk : P.skin);
    px(x - 1, y - 1, 3, 1, far ? P.skin : P.skinHi);
  }
  // Un brazo desde el hombro, doblado por el codo hasta la mano.
  function armBent(px, P, sx, sy, ex, ey, hx, hy, col, w, far) {
    limbSeg(px, col, sx, sy, ex, ey, w);
    limbSeg(px, col, ex, ey, hx, hy, Math.max(2, w - 1));
    hand(px, P, hx, hy, far);
  }
  // Brazos según el GESTO. Diseñados para la vista 3/4 (SE); SW sale por espejo.
  function gestureArms(px, P, v, g, sec) {
    const A = anchors(g), shY = A.shoulder + 2, hyv = A.hy;
    const c = CX + Math.round(v.dx * 0.6), sh = shHalfOf(v);
    const w = P.kind === 'armor' ? 3 : 4;
    const near = P.robe, far = P.robeDk;
    const nx = c + sh - 1, fx = c - sh + 1;                 // hombros cercano / lejano
    switch (sec.gesture) {
      case 'frustrado':                                     // ambas manos a las sienes
        armBent(px, P, fx, shY, c - 9, shY - 3, c - 5, hyv + 1, far, w, true);
        armBent(px, P, nx, shY, c + 9, shY - 3, c + 5, hyv + 1, near, w, false);
        break;
      case 'ofensiva':                                      // dedo señalando al frente
        armBent(px, P, fx, shY, fx - 1, shY + 8, c - 3, shY + 11, far, w, true);
        armBent(px, P, nx, shY, c + sh + 3, shY + 3, c + sh + 9, shY + 7, near, w, false);
        px(c + sh + 10, shY + 7, 2, 1, P.skin);
        break;
      case 'cautelosa':                                     // mano a la barbilla (medita)
        armBent(px, P, fx, shY, c - 4, shY + 8, c - 1, shY + 10, far, w, true);
        armBent(px, P, nx, shY, c + sh + 2, shY + 6, c + 2, hyv + 9, near, w, false);
        break;
      case 'ingeniosa':                                     // índice en alto (¡idea!)
        armBent(px, P, fx, shY, fx - 1, shY + 9, fx, shY + 12, far, w, true);
        armBent(px, P, nx, shY, c + sh + 2, shY + 1, c + sh + 3, shY - 6, near, w, false);
        px(c + sh + 3, shY - 9, 2, 3, P.skin);
        break;
      default:                                              // 'habla': antebrazo alzado al frente
        armBent(px, P, fx, shY, fx - 1, shY + 10, fx, shY + 13, far, w, true);
        armBent(px, P, nx, shY, c + sh + 2, shY + 5, c + 3, shY + 1, near, w, false);
    }
  }

  // Expresión facial (encima de los rasgos base). Derivada del gesto si no se pide.
  function gestureExpr(gest) {
    return { habla: 'habla', ofensiva: 'enfadado', cautelosa: 'calmo', ingeniosa: 'sonrisa', frustrado: 'enfadado' }[gest] || null;
  }
  function exprOverpaint(px, P, v, c, hy, sec) {
    const e = sec.expr || gestureExpr(sec.gesture);
    if (!e) return;
    const open = (e === 'grito' || e === 'enfadado') || (e === 'habla' && (sec.gframe % 2 === 0));
    if (v.side >= 1) {                                       // PERFIL
      if (e === 'enfadado') { px(c + 2, hy + 4, 3, 1, P.hair); px(c + 3, hy + 5, 1, 1, P.ink); }
      if (e === 'sonrisa') { px(c + 2, hy + 8, 3, 1, P.skinDk); px(c + 2, hy + 7, 1, 1, P.skinDk); }
      if (open) { px(c + 2, hy + 8, 2, 2, P.ink); px(c + 2, hy + 7, 2, 1, dark(P.skin, 0.4)); }
      return;
    }
    const mx = v.front ? c - 1 : c + 1;                     // x de la boca según 3/4
    if (e === 'enfadado') {                                 // cejas fruncidas hacia dentro
      if (v.front) { px(c - 2, hy + 6, 2, 1, P.hair); px(c + 1, hy + 6, 2, 1, P.hair); }
      else { px(c, hy + 6, 1, 1, P.hair); px(c + 2, hy + 6, 2, 1, P.hair); }
    }
    if (open) { px(mx, hy + 8, 3, 3, P.ink); px(mx, hy + 8, 3, 1, dark(P.skin, 0.4)); }
    else if (e === 'sonrisa') { px(mx, hy + 9, 1, 1, P.skinDk); px(mx + 1, hy + 10, 2, 1, P.skinDk); px(mx + 3, hy + 9, 1, 1, P.skinDk); }
    else if (e === 'habla') { px(mx, hy + 9, 3, 1, dark(P.skin, 0.35)); }
  }

  // Cabeza redondeada con rasgos + barba (perfiles civiles).
  function headBlock(px, c, hy, halfW, h, skin, hi, dk) {
    for (let i = 0; i < h; i++) {
      const inset = (i === 0 || i === h - 1) ? 1 : 0;
      px(c - halfW + inset, hy + i, halfW * 2 - inset * 2, 1, skin);
    }
    px(c - halfW + 1, hy, halfW * 2 - 2, 1, hi);            // luz arriba
    px(c + halfW - 2, hy + 1, 1, h - 2, dk);               // sombra lado derecho
  }

  function head(px, P, v, g, sec) {
    const A = anchors(g), top = A.shoulder, hy = A.hy, c = CX + Math.round(v.dx * 0.6);
    px(c - 2, top - 3, 4, 4, P.skinDk);                                        // cuello
    headFace(px, P, v, c, hy, sec);
    hairAndCap(px, P, v, c, hy);
  }

  // Parche de OJO (secuela 'tuerto'): cuero oscuro sobre un ojo + correa cruzada.
  // Posición por vista (perfil / frontal / 3-4), encima de los rasgos ya pintados.
  function eyePatch(px, P, v, c, hy) {
    const patch = dark(P.boot, 0.10), strap = dark(P.boot, 0.25);
    if (v.side >= 1) {                                   // perfil: sobre el ojo (c+3)
      px(c + 2, hy + 4, 3, 3, patch); px(c + 2, hy + 4, 3, 1, light(patch, 0.12));
      px(c - 1, hy + 3, 8, 1, strap);
    } else if (v.front) {                                // frontal: tapa el ojo derecho
      px(c + 1, hy + 5, 3, 3, patch); px(c + 1, hy + 5, 3, 1, light(patch, 0.12));
      px(c - 4, hy + 4, 9, 1, strap);
    } else if (!v.back) {                                // 3/4 frontal
      px(c + 2, hy + 5, 3, 3, patch); px(c + 2, hy + 5, 3, 1, light(patch, 0.12));
      px(c - 3, hy + 4, 8, 1, strap);
    }
  }

  // Cara + rasgos + barba en (c, hy). Reutilizado por la pose de pie y la sentada.
  function headFace(px, P, v, c, hy, sec) {
    if (v.side >= 1) {                                                          // PERFIL
      headBlock(px, c + 1, hy, 4, 11, P.skin, P.skinHi, P.skinDk);
      px(c + 5, hy + 5, 1, 2, P.skin); px(c + 5, hy + 5, 1, 1, P.skinHi);       // nariz
      px(c + 3, hy + 5, 1, 1, P.ink);                                          // ojo
      px(c + 2, hy + 4, 2, 1, P.hair);                                         // ceja
      px(c + 2, hy + 8, 2, 1, P.skinDk);                                       // boca
      px(c - 2, hy + 5, 1, 2, P.skinDk);                                       // oreja
      if (P.beard) { px(c, hy + 9, 5, 1 + P.beard, P.beardC); px(c + 4, hy + 7, 1, 2 + P.beard, P.beardC); } // barba al frente
      if (P.beardLong) { px(c, hy + 9, 5, 1, P.beardC); px(c + 1, hy + 10, 4, 4, P.beardC); px(c + 2, hy + 14, 3, 3, dark(P.beardC, 0.05)); px(c + 2, hy + 17, 2, 2, dark(P.beardC, 0.1)); px(c + 3, hy + 19, 1, 2, dark(P.beardC, 0.14)); }  // barba larga (perfil) — arranca en la mandíbula (hy+9), sin hueco
      if (P.beardWild) { px(c - 1, hy + 8, 7, 5, P.beardC); px(c + 5, hy + 9, 1, 4, P.beardC); px(c, hy + 13, 6, 2, P.beardC); px(c + 1, hy + 15, 2, 3, P.beardC); px(c + 3, hy + 15, 2, 2, P.beardC); px(c - 1, hy + 8, 7, 1, dark(P.beardC, 0.18)); }  // barba HIRSUTA (perfil)
      if (P.beardStyle === 'perilla') { px(c + 1, hy + 7, 4, 1, P.beardC); px(c + 3, hy + 9, 2, 4, P.beardC); px(c + 3, hy + 13, 1, 2, dark(P.beardC, 0.1)); }  // PERILLA/candado (perfil)
      if (P.beardStyle === 'fumanchu') { px(c + 1, hy + 7, 4, 1, P.beardC); px(c + 4, hy + 8, 1, 5, P.beardC); px(c + 4, hy + 13, 1, 2, dark(P.beardC, 0.12)); }  // bigote CAÍDO 八字 (perfil)
    } else {
      headBlock(px, c, hy, 5, 11, P.skin, P.skinHi, P.skinDk);
      if (!v.back) {
        if (v.front) {
          px(c - 3, hy + 5, 2, 1, P.hair); px(c + 2, hy + 5, 2, 1, P.hair);     // cejas
          px(c - 2, hy + 6, 1, 1, P.ink);  px(c + 2, hy + 6, 1, 1, P.ink);      // ojos
          px(c, hy + 6, 1, 3, P.skinDk);                                       // nariz
          px(c - 1, hy + 9, 3, 1, dark(P.skin, 0.3));                          // boca
          if (P.beard) { px(c - 2, hy + 9, 5, 1, P.beardC); px(c - 1, hy + 10, 3, P.beard === 2 ? 4 : 2, P.beardC); }
          if (P.beardLong) { px(c - 2, hy + 9, 5, 1, P.beardC); px(c - 1, hy + 10, 3, 4, P.beardC); px(c - 1, hy + 14, 3, 3, dark(P.beardC, 0.05)); px(c, hy + 17, 2, 2, dark(P.beardC, 0.1)); px(c, hy + 19, 1, 2, dark(P.beardC, 0.14)); }  // barba larga (frente) — conecta con la barbilla
          if (P.beardWild) { px(c - 4, hy + 8, 9, 5, P.beardC); px(c - 5, hy + 9, 1, 3, P.beardC); px(c + 4, hy + 9, 1, 3, P.beardC); px(c - 4, hy + 13, 8, 2, P.beardC); px(c - 4, hy + 15, 2, 2, P.beardC); px(c - 1, hy + 15, 2, 3, P.beardC); px(c + 2, hy + 15, 2, 2, P.beardC); px(c - 4, hy + 8, 9, 1, dark(P.beardC, 0.18)); }  // barba HIRSUTA (frente)
          if (P.beardStyle === 'perilla') { px(c - 2, hy + 8, 5, 1, P.beardC); px(c - 1, hy + 10, 3, 3, P.beardC); px(c, hy + 13, 1, 2, dark(P.beardC, 0.1)); }  // PERILLA/candado (frente)
          if (P.beardStyle === 'fumanchu') { px(c - 2, hy + 8, 5, 1, P.beardC); px(c - 2, hy + 9, 1, 5, P.beardC); px(c + 2, hy + 9, 1, 5, P.beardC); px(c - 2, hy + 14, 1, 1, dark(P.beardC, 0.12)); px(c + 2, hy + 14, 1, 1, dark(P.beardC, 0.12)); }  // bigote CAÍDO 八字 (frente)
        } else {                                                               // 3/4 frontal
          px(c, hy + 5, 2, 1, P.hair); px(c + 3, hy + 5, 1, 1, P.hair);
          px(c, hy + 6, 1, 1, P.ink); px(c + 3, hy + 6, 1, 1, P.ink);
          px(c + 4, hy + 6, 1, 2, P.skinDk);                                   // nariz (perfil insinuado)
          px(c + 1, hy + 9, 3, 1, dark(P.skin, 0.3));
          if (P.beard) { px(c, hy + 9, 5, 1, P.beardC); px(c + 1, hy + 10, 3, P.beard === 2 ? 4 : 2, P.beardC); }
          if (P.beardLong) { px(c - 1, hy + 9, 5, 1, P.beardC); px(c, hy + 10, 4, 4, P.beardC); px(c + 1, hy + 14, 3, 3, dark(P.beardC, 0.05)); px(c + 1, hy + 17, 2, 2, dark(P.beardC, 0.1)); px(c + 2, hy + 19, 1, 2, dark(P.beardC, 0.14)); }  // barba larga (¾) — conecta con la barbilla
          if (P.beardWild) { px(c - 3, hy + 8, 9, 5, P.beardC); px(c + 5, hy + 9, 1, 3, P.beardC); px(c - 3, hy + 13, 8, 2, P.beardC); px(c - 2, hy + 15, 2, 2, P.beardC); px(c + 1, hy + 15, 2, 3, P.beardC); px(c + 3, hy + 15, 2, 2, P.beardC); px(c - 3, hy + 8, 9, 1, dark(P.beardC, 0.18)); }  // barba HIRSUTA (¾)
          if (P.beardStyle === 'perilla') { px(c, hy + 8, 5, 1, P.beardC); px(c + 1, hy + 10, 3, 3, P.beardC); px(c + 2, hy + 13, 1, 2, dark(P.beardC, 0.1)); }  // PERILLA/candado (¾)
          if (P.beardStyle === 'fumanchu') { px(c, hy + 8, 5, 1, P.beardC); px(c, hy + 9, 1, 5, P.beardC); px(c + 4, hy + 9, 1, 5, P.beardC); px(c, hy + 14, 1, 1, dark(P.beardC, 0.12)); px(c + 4, hy + 14, 1, 1, dark(P.beardC, 0.12)); }  // bigote CAÍDO 八字 (¾)
        }
      }
    }
    if (sec && (sec.gesture || sec.expr)) exprOverpaint(px, P, v, c, hy, sec);   // gesto de debate
    if (sec && sec.tuerto) eyePatch(px, P, v, c, hy);   // secuela: parche en el ojo
  }

  function hairAndCap(px, P, v, c, hy) {
    // Pelo: cubre la coronilla y baja por las sienes; moño 髻 arriba.
    px(c - 5, hy - 1, 11, 3, P.hair); px(c - 5, hy - 1, 11, 1, P.hairHi);
    if (v.back) { px(c - 4, hy, 9, 9, P.hair); px(c - 5, hy + 1, 1, 7, P.hair); px(c + 4, hy + 1, 1, 7, P.hair); }
    else { px(c - 5, hy, 1, 6, P.hair); px(c + 4, hy, 1, 6, P.hair); }
    if (P.gala && P.gala.indexOf('epic-') === 0) { galaTocado(px, P, v, c, hy); return; }   // tocado/casco de armadura ÉPICA
    if (P.crown) { crownImperial(px, P, v, c, hy); return; }                   // corona alta dorada (通天冠)
    if (P.topknot) { crownTopknot(px, P, v, c, hy); return; }                  // moño recogido con corona/pincho
    if (P.headwrap) { headWrap(px, P, v, c, hy); return; }                     // pañuelo 綸巾 (Guan Yu)
    if (P.bandana) { redBandana(px, P, v, c, hy); return; }                    // bandana roja 紅巾 (Zhang Fei)
    if (P.futou) { futou(px, P, v, c, hy); return; }                          // 幞頭 gorro de comerciante/oficial
    if (P.kind === 'armor') {                                                  // casco con frontal y cresta
      px(c - 5, hy - 3, 11, 4, P.steel); px(c - 5, hy - 3, 11, 1, P.steelHi);
      px(c - 5, hy + 1, 11, 1, P.steelDk);
      // Cresta: dorada de serie; PENACHO ESCARLATA en la coraza de gala (General).
      const cresta = P.torsoGala ? '#a83a2e' : P.trim;
      px(c - 1, hy - 7, 3, 4, cresta); px(c - 1, hy - 8, 3, 1, P.torsoGala ? '#c5543f' : P.goldHi);
      if (P.torsoGala) px(c - 5, hy - 3, 11, 1, P.goldHi);                     // frontal dorado del casco de gala
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

  // ── TOCADO/CASCO de las ARMADURAS ÉPICAS (絕品) ──────────────────────────────
  // Cada épica corona la cabeza con su sello: el casco de plumas de faisán de Lü Bu,
  // la corona daoísta de Zhuge Liang, la de cuentas del soberano de Wei, el pañuelo
  // verde de Guan Yu, el casco de bronce de Sun Quan y el tocado del gran tutor.
  function galaTocado(px, P, v, c, hy) {
    const g = P.gala;
    if (g === 'epic-zhanshen') {
      // 雉尾冠 — casco negro y oro con DOS plumas de faisán largas que se elevan (Lü Bu).
      px(c - 5, hy - 3, 11, 4, '#26232c'); px(c - 5, hy - 3, 11, 1, P.goldHi);          // casco negro, frontal dorado
      px(c - 5, hy + 1, 11, 1, dark('#26232c', 0.3));
      px(c - 5, hy + 1, 1, 4, '#1a1820'); px(c + 5, hy + 1, 1, 4, '#1a1820');            // carrilleras
      px(c - 1, hy - 1, 3, 1, P.gold);                                                   // remache/frente dorado
      // Dos plumas de faisán (雉尾): curvas, largas, con vivo claro; se abren en V.
      const pluma = (sx, dir) => {
        for (let i = 0; i < 9; i++) { const yy = hy - 4 - i, xx = sx + dir * Math.round(i * 0.6); px(xx, yy, 2, 1, i < 3 ? '#8a2620' : (i < 6 ? '#c98a3a' : '#e6c060')); if (i > 2) px(xx + dir, yy, 1, 1, P.goldHi); }
      };
      pluma(c - 2, -1); pluma(c + 2, 1);
    } else if (g === 'epic-jiangdong') {
      // Casco de BRONCE con cresta y borde escarlata (Sun Quan).
      const bronce = '#c98a3a', bronceHi = '#e6b878';
      px(c - 5, hy - 3, 11, 4, bronce); px(c - 5, hy - 3, 11, 1, bronceHi);
      px(c - 5, hy + 1, 11, 1, dark(bronce, 0.35));
      px(c - 1, hy - 7, 3, 4, '#7a2620'); px(c - 1, hy - 8, 3, 1, '#b8402f');            // cresta escarlata
      px(c - 5, hy + 1, 1, 4, dark(bronce, 0.3)); px(c + 5, hy + 1, 1, 4, dark(bronce, 0.3));  // carrilleras
      px(c, hy - 1, 1, 1, bronceHi);
    } else if (g === 'epic-hechang') {
      // 綸巾 — corona/pañuelo daoísta claro con banda de jade y horquilla (Zhuge Liang).
      px(c - 5, hy - 5, 11, 5, '#e8ecf0'); px(c - 5, hy - 5, 11, 1, '#ffffff');          // paño níveo alto
      px(c - 5, hy, 11, 1, dark('#e8ecf0', 0.2));
      px(c - 4, hy - 6, 9, 1, P.trim);                                                   // cresta de la corona
      if (!v.back) { px(c - 2, hy - 4, 4, 2, P.trim); px(c - 1, hy - 3, 2, 1, P.jade); } // banda + jade frontal
      px(c + 4, hy - 1, 2, 4, '#dfe4ea');                                                // caída trasera del paño
    } else if (g === 'epic-manpao') {
      // 冕旒 — corona plana del soberano con tablero y CUENTAS colgantes (Wei).
      px(c - 5, hy - 2, 11, 2, P.ink); px(c - 5, hy - 2, 11, 1, light(P.ink, 0.2));      // casquete
      px(c - 6, hy - 5, 13, 3, P.gold); px(c - 6, hy - 5, 13, 1, P.goldHi);              // tablero 綖 dorado (plano y ancho)
      px(c - 6, hy - 3, 13, 1, dark(P.gold, 0.3));
      if (!v.back) { for (let k = -4; k <= 4; k += 2) { px(c + k, hy - 2, 1, 3, P.jade); px(c + k, hy - 2, 1, 1, P.goldHi); } }  // 旒: sartas de cuentas de jade colgando
      else { px(c - 5, hy - 2, 11, 2, dark(P.gold, 0.2)); }
    } else if (g === 'epic-wusheng') {
      // 綠巾 — pañuelo VERDE anudado (Guan Yu), a juego con la sobreveste de jade.
      const verde = '#1f5a3a', verdeHi = '#2f7a4a';
      px(c - 5, hy - 4, 11, 4, verde); px(c - 5, hy - 4, 11, 1, verdeHi);
      if (!v.back) px(c - 1, hy - 3, 2, 1, P.gold);                                      // broche dorado
      px(c - 5, hy - 5, 3, 1, verdeHi); px(c + 3, hy - 5, 3, 1, verdeHi);                // pliegues altos del nudo
      px(c + 4, hy - 1, 2, 4, verde);                                                    // caída trasera
    } else if (g === 'epic-jiuxi') {
      // 進賢冠 alto — tocado oscuro del gran tutor con doble banda dorada y gema (Sima Yi).
      px(c - 4, hy - 6, 9, 5, '#1a1a22'); px(c - 4, hy - 6, 9, 1, P.gold);
      px(c - 2, hy - 9, 4, 3, '#1a1a22'); px(c - 1, hy - 9, 1, 1, P.goldHi);             // realce superior
      px(c - 4, hy - 2, 9, 1, P.gold); px(c - 4, hy - 4, 9, 1, dark(P.gold, 0.25));      // doble banda dorada
      if (!v.back) px(c - 1, hy - 5, 2, 1, P.jade);                                      // gema frontal
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

  // Corona imperial alta 通天冠: casquete negro + bloque dorado vertical con
  //梁 (crestas), gema frontal y horquilla 簪 atravesada. Reemplaza casco/tocado.
  function crownImperial(px, P, v, c, hy) {
    // top = hy-6: la corona se mantiene DENTRO del lienzo incluso con el bob del andar
    // (que sube la figura 2px en los fotogramas de paso). Antes se recortaba por arriba.
    const top = hy - 6;
    px(c - 5, hy - 2, 11, 2, P.ink); px(c - 5, hy - 2, 11, 1, light(P.ink, 0.20));   // casquete/base
    px(c + 4, hy, 2, 3, P.ink);                                                        // caída trasera del paño
    // Cuerpo alto de la corona (bloque dorado con relieve y 梁/ranuras).
    px(c - 3, top, 7, 6, P.gold);
    px(c - 3, top, 7, 1, P.goldHi);
    px(c - 3, top, 1, 6, P.goldHi); px(c + 3, top, 1, 6, dark(P.gold, 0.28));
    px(c - 1, top, 1, 6, dark(P.gold, 0.22)); px(c + 1, top, 1, 6, dark(P.gold, 0.22));
    if (!v.back) { px(c - 1, top + 2, 2, 2, P.jade); px(c - 1, top + 2, 1, 1, light(P.jade, 0.2)); }  // gema frontal
    // Horquilla 簪 dorada atravesando la corona de lado a lado.
    px(c - 6, top + 2, 13, 1, P.goldHi);
    px(c - 6, top + 2, 1, 1, dark(P.gold, 0.35)); px(c + 6, top + 2, 1, 1, dark(P.gold, 0.35));
    px(c - 6, top + 3, 1, 1, dark(P.gold, 0.15)); px(c + 6, top + 3, 1, 1, dark(P.gold, 0.15));
  }

  // Capa IMPERIAL larga y DRAPEADA (pixelart cuidado): cae de los hombros al suelo
  // con PLIEGUES verticales (columnas luz/sombra que dan volumen de tela), FILO
  // dorado a ambos lados, festón y hem dorado en el bajo, ONDEO sutil al andar y
  // COLA que se arrastra por detrás (opuesta al avance). De ESPALDAS se dibuja sobre
  // el cuerpo (lo cubre); de frente/perfil, por detrás. El cuello va en capeCollar.
  function capeImperial(px, P, v, g) {
    const A = anchors(g), top = A.shoulder - 1, c = CX + Math.round(v.dx * 0.6);
    const phase = g.f, ground = BASEY + 2, span = ground - top;
    const side = v.side >= 1;
    const facing = side ? (v.dx >= 0 ? 1 : -1) : 0;               // PERFIL: hacia dónde mira
    const dragDir = v.dx > 0 ? -1 : (v.dx < 0 ? 1 : 0);           // "detrás" = opuesto al avance
    const topHalf = v.back ? 8 : (side ? 5 : 6);
    const botHalf = side ? 11 : 15;                               // de espaldas/frente cubre ancho
    const RB = P.capeColor || P.robe;                            // color de la capa (independiente de la túnica)
    const lit  = mix(RB, '#ffffff', 0.14);                       // pliegue iluminado
    const mid  = dark(RB, 0.24);                                 // tela base
    const sh   = dark(RB, 0.42);                                 // pliegue en sombra
    const deep = dark(RB, 0.60);                                 // filo hondo
    const goldD = dark(P.gold, 0.24);                             // ribete dorado
    for (let i = 0; i <= span; i++) {
      const y = top + i, t = i / span;
      const base = Math.max(3, Math.round(topHalf + (botHalf - topHalf) * Math.pow(t, 0.82)));
      const wave = Math.round(1.2 * Math.sin(t * 3.0 + phase * 0.8));           // ondeo del vuelo
      const tail = Math.round(dragDir * 4 * Math.pow(t, 2.0));                  // arrastre creciente
      const cx = c + wave + tail;
      // En PERFIL la capa cuelga por DETRÁS: lado trasero ancho, delantero corto (bajo el cuerpo).
      let hwL = base, hwR = base;
      if (facing) { const fr = Math.max(2, 2 + Math.round(1.6 * t)); if (facing > 0) { hwR = fr; hwL = base + 2; } else { hwL = fr; hwR = base + 2; } }
      const w = hwL + hwR, cc = cx - hwL;
      px(cc, y, w, 1, mid);                                                      // relleno base
      [0.16, 0.40, 0.62, 0.84].forEach((fr, k) => px(cc + Math.round(fr * w), y, 1, 1, k % 2 ? lit : sh));  // pliegues
      px(cx - hwL, y, 1, 1, deep); px(cx - hwL + 1, y, 1, 1, goldD);            // filo + ribete izq
      px(cx + hwR - 1, y, 1, 1, sh); px(cx + hwR - 2, y, 1, 1, goldD);          // filo + ribete dcho
    }
    // Bajo de la capa: festón + hem dorado que se ARRASTRA por el suelo (en perfil,
    // sobre todo por detrás → cola que sigue al mecenas). Recortado al lienzo (sin clipping raro).
    const bt = Math.round(dragDir * 5), sweep = phase % 2 ? 1 : 0;
    const back = facing ? botHalf + 2 + sweep : botHalf + 1;      // extensión trasera (la cola)
    const front = facing ? 3 : botHalf + 1;                       // delante, corto
    const left = facing > 0 ? back : front, right = facing > 0 ? front : back;
    for (let x = -left; x < right; x++) {
      const xx = c + bt + x; if (xx < 1 || xx >= W - 1) continue;               // no clipar el borde
      const y = ground - (x & 1 ? 1 : 0);
      px(xx, y - 1, 1, 1, P.gold); px(xx, y, 1, 1, goldD);
    }
  }

  // Esclavina + cuello alto dorado, SIEMPRE sobre los hombros (encima de la capa y
  // el torso). Da el remate de canciller imperial y separa la cabeza de la capa.
  function capeCollar(px, P, v, g) {
    const A = anchors(g), top = A.shoulder - 1, c = CX + Math.round(v.dx * 0.6);
    const RB = P.capeColor || P.robe;
    const mid = dark(RB, 0.22), lit = mix(RB, '#ffffff', 0.16), sh = dark(RB, 0.44);
    const hw = v.side >= 1 ? 6 : 9;
    // Esclavina redondeada sobre los hombros (se estrecha hacia arriba).
    for (let i = 0; i < 3; i++) {
      const y = top + i, w = hw - i;
      px(c - w, y, w * 2, 1, i === 0 ? lit : mid);
      px(c - w, y, 1, 1, sh); px(c + w - 1, y, 1, 1, sh);
      px(c - w, y, 1, 1, dark(P.gold, 0.28)); px(c + w - 1, y, 1, 1, dark(P.gold, 0.28));   // ribete dorado del borde
    }
    // Cuello alto dorado (de espaldas sube y ensancha para tapar la nuca sin hueco).
    const cw = v.back ? 5 : 4, ctop = top - (v.back ? 3 : 2);
    px(c - cw, ctop, cw * 2, 1, P.goldHi); px(c - cw, ctop + 1, cw * 2, 1, P.gold);
    px(c - cw, ctop + 2, cw * 2, 1, dark(P.gold, 0.30)); if (v.back) px(c - cw, ctop + 3, cw * 2, 1, dark(P.gold, 0.42));
    // Fíbula con gema (frente/perfil).
    if (!v.back) { px(c - 1, top + 1, 2, 2, P.goldHi); px(c, top + 2, 1, 1, P.jade); }
  }

  // TÚNICA larga (soberano): la falda cae de la cintura al SUELO cubriendo las
  // piernas, ONDULA (pliegues verticales + bordes ondeantes) y se ARRASTRA por el
  // suelo, con más cola por detrás al andar. Centrada (cubre frente y espalda). Va
  // por ENCIMA de las piernas; el ribete dorado del bajo remata como en la lámina.
  function robeSkirtLong(px, P, v, g) {
    const A = anchors(g), c = CX + Math.round(v.dx * 0.6);
    const topY = A.belt + 2, ground = BASEY + 2, span = ground - topY;
    const phase = g.f, dragDir = v.dx > 0 ? -1 : (v.dx < 0 ? 1 : 0);
    const hi = P.robeHi, mid = P.robe, dk = P.robeDk, sh = P.robeSh;
    const gold = P.trim, goldHi = P.trimHi, goldD = dark(P.trim, 0.2);
    // Fracciones de los PLIEGUES (columnas de sombra/luz que dan cuerpo pomposo a la tela).
    const foldsSh = [-0.62, -0.30, 0.02, 0.34, 0.66];
    for (let i = 0; i <= span; i++) {
      const y = topY + i, t = i / span;
      const hw = Math.round(10 + 7 * Math.pow(t, 0.76));                        // falda amplia que se abre
      const wave = Math.round(1.5 * Math.sin(t * 3.2 + phase * 0.7));           // ondulación de la tela
      const tail = Math.round(dragDir * 3 * Math.pow(t, 2.0));                  // arrastre creciente
      const cx = c + wave + tail;
      px(cx - hw, y, hw * 2, 1, mid);                                           // relleno
      px(cx - hw, y, Math.max(1, Math.round(hw * 0.30)), 1, hi);               // luz (izq)
      px(cx + Math.round(hw * 0.52), y, hw - Math.round(hw * 0.52), 1, dk);     // sombra (der)
      // Pliegues verticales alternando sombra honda / realce → tela con volumen.
      foldsSh.forEach((fr, k) => px(cx + Math.round(fr * hw), y, 1, 1, k % 2 ? light(mid, 0.10) : sh));
      px(cx - hw, y, 1, 1, sh); px(cx + hw - 1, y, 1, 1, dk);                   // filos
      // Brocado dorado central (banda de 2px con tachones), como el ribete de la lámina.
      if (!v.back && i > 1) { px(cx - 1, y, 2, 1, gold); if (i % 3 === 0) px(cx - 1, y, 2, 1, goldHi); }
    }
    // Bajo: ribete dorado ondulante que se arrastra (algo más de cola por detrás).
    const bt = Math.round(dragDir * 4), extra = phase % 2 ? 1 : 0;
    const bhw = 17;
    for (let x = -bhw; x < bhw + (dragDir < 0 ? 0 : extra); x++) {
      const xx = c + bt + x; if (xx < 1 || xx >= W - 1) continue;
      const y = ground - (x & 1 ? 1 : 0);
      px(xx, y - 1, 1, 1, gold); px(xx, y, 1, 1, goldD);
    }
  }

  // MANTO (Liu Bei): sobretúnica de color propio (verde jade) sobre los hombros y
  // los costados, ABIERTA por el centro para que asome la túnica blanca; solapa con
  // brocado dorado en V y hombrera dorada. Cubre hasta la cadera (la falda blanca
  // fluye por debajo). De espaldas cubre toda la espalda.
  function robeMantle(px, P, v, g) {
    const A = anchors(g), top = A.shoulder - 1, beltY = A.belt, c = CX + Math.round(v.dx * 0.6);
    const mid = P.mantle, hi = light(mid, 0.14), dk = dark(mid, 0.30), sh = dark(mid, 0.48);
    const gold = P.trim, goldHi = P.trimHi, goldD = dark(P.trim, 0.22);
    const shHalf = Math.round(9 - 3 * v.side), bottom = beltY + 6;
    for (let y = top + 1; y <= bottom; y++) {
      const t = (y - top) / (bottom - top);
      const outer = Math.round(shHalf + 2 + 2 * t);
      const inner = Math.round(3 + 3 * t);
      if (v.back) {
        px(c - outer, y, outer * 2, 1, y % 2 ? mid : hi);
        px(c - outer, y, 1, 1, sh); px(c + outer - 1, y, 1, 1, dk);
      } else {
        px(c + inner, y, outer - inner, 1, y % 2 ? mid : hi);        // panel derecho
        px(c + outer - 1, y, 1, 1, dk); px(c + inner, y, 1, 1, goldD);
        px(c - outer, y, outer - inner, 1, y % 2 ? dk : mid);        // panel izquierdo
        px(c - outer, y, 1, 1, sh); px(c - inner - 1, y, 1, 1, goldD);
      }
    }
    // Solapa/cuello verde con brocado dorado en V + hombrera dorada (león).
    px(c - shHalf, top, shHalf * 2, 2, mid); px(c - shHalf, top, shHalf * 2, 1, hi);
    if (!v.back) { for (let i = 0; i < 7; i++) px(c - 4 + i, top + 2 + i, 1, 1, i % 2 ? gold : goldHi); }
    if (!v.back) { px(c + shHalf - 2, top - 1, 4, 3, gold); px(c + shHalf - 1, top - 1, 2, 1, goldHi); px(c + shHalf, top + 1, 1, 1, P.ink); }
  }

  // DOS ESPADAS gemelas (雌雄雙股劍) al cinto: vainas diagonales con guarda dorada,
  // empuñadura y pomo. Colgadas juntas del costado; de espaldas solo asoman las
  // puntas. Diseñadas para leerse a este tamaño (frente/perfil).
  function beltSwords(px, P, v, g) {
    const A = anchors(g), beltY = A.belt, c = CX + Math.round(v.dx * 0.6);
    const scab = dark(P.boot, 0.02), scabHi = light(scab, 0.16), wrap = dark(P.boot, 0.24);
    const gold = P.trim, goldHi = P.trimHi, cord = '#a83a2e';
    // Una espada COMPACTA y legible: pomo + empuñadura + guarda + vaina con herrajes
    // dorados (garganta, abrazadera y contera) que rompen la mancha oscura → se lee
    // como espada, no como raya. Corta (no baja hasta el bajo). ang = inclinación.
    const sword = (hx, hy, ang, scLen) => {
      px(hx, hy - 3, 2, 1, goldHi);                                     // pomo
      px(hx, hy - 2, 2, 2, wrap);                                       // empuñadura
      px(hx - 1, hy, 4, 1, gold); px(hx - 1, hy, 1, 1, goldHi);         // guarda (tsuba)
      const mid = Math.max(2, (scLen / 2) | 0);
      for (let i = 1; i <= scLen; i++) {
        const x = Math.round(hx + ang * i), y = hy + i;
        const col = (i === 1 || i === scLen || i === mid) ? gold : (i % 2 ? scab : scabHi);   // herrajes dorados intercalados
        px(x, y, 2, 1, col);
      }
    };
    if (v.back) {
      // DE ESPALDAS: solo asoman los pomos y el arranque de las vainas por el costado
      // (su cadera izq), NO barras en el centro. Cortas, junto al cuerpo.
      const hx = c - 8;
      px(hx, beltY - 1, 2, 1, goldHi); px(hx + 3, beltY, 2, 1, goldHi);      // pomos
      px(hx, beltY + 1, 2, 4, scab); px(hx + 3, beltY + 2, 2, 4, scab);      // vainas cortas
      px(hx, beltY + 5, 2, 1, gold); px(hx + 3, beltY + 6, 2, 1, gold);      // conteras doradas
      return;
    }
    // Frente/perfil: las dos gemelas juntas, en la cadera, cortas y algo inclinadas.
    const baseX = v.side >= 1 ? c + 2 : c - 7;                          // perfil: cadera cercana · frente: a un lado
    px(baseX - 1, beltY, 9, 2, cord); px(baseX - 1, beltY, 9, 1, light(cord, 0.15));   // tirante rojo del cinto
    sword(baseX, beltY + 2, -0.12, 8);
    sword(baseX + 3, beltY + 3, 0.10, 9);
    // Hebilla de LEÓN dorada sobre el cinto (centro), rasgo de la lámina.
    if (P.beastBuckle) { px(c + 1, beltY, 4, 3, gold); px(c + 1, beltY, 4, 1, goldHi); px(c + 2, beltY + 1, 2, 1, P.ink); }
  }

  // Pelo RECOGIDO (moño 髻) con corona/pincho imperial PROMINENTE: moño alto ceñido
  // por un aro dorado ancho, guan sobre él, gema de jade y horquilla 簪 larga. Más
  // rotundo que antes (a la altura del porte de Cao Cao), pero recogido (no la torre).
  function crownTopknot(px, P, v, c, hy) {
    // Casquete de pelo ceñido.
    px(c - 5, hy - 1, 11, 2, P.hair); px(c - 5, hy - 1, 11, 1, P.hairHi);
    // Moño ancho y alto.
    px(c - 3, hy - 5, 6, 4, P.hair); px(c - 3, hy - 5, 6, 1, P.hairHi);
    px(c - 3, hy - 5, 1, 4, dark(P.hair, 0.3)); px(c + 2, hy - 5, 1, 4, dark(P.hair, 0.2));
    // Aro dorado ANCHO (2px) que ciñe el moño (束髮嵌寶金冠).
    px(c - 4, hy - 2, 8, 2, P.gold); px(c - 4, hy - 2, 8, 1, P.goldHi); px(c - 4, hy - 1, 8, 1, dark(P.gold, 0.32));
    // Guan dorado que corona el moño + pináculo.
    px(c - 2, hy - 6, 4, 2, P.gold); px(c - 2, hy - 6, 4, 1, P.goldHi);
    px(c - 1, hy - 7, 2, 1, P.gold); px(c, hy - 7, 1, 1, P.goldHi);
    // Gema de jade frontal engastada en el aro.
    if (!v.back) { px(c - 1, hy - 2, 2, 2, P.jade); px(c - 1, hy - 2, 1, 1, light(P.jade, 0.25)); }
    // Horquilla 簪 larga atravesada (asoma más a ambos lados).
    px(c - 6, hy - 3, 13, 1, P.goldHi);
    px(c - 6, hy - 3, 1, 1, dark(P.gold, 0.35)); px(c + 6, hy - 3, 1, 1, dark(P.gold, 0.35));
    px(c - 6, hy - 2, 1, 1, dark(P.gold, 0.2)); px(c + 6, hy - 2, 1, 1, dark(P.gold, 0.2));
  }

  // Pañuelo/turbante 綸巾 verde (Guan Yu): paño ceñido con nudo alto, broche dorado
  // y caída trasera. Toma el verde de la túnica (algo más oscuro).
  function headWrap(px, P, v, c, hy) {
    const wrap = dark(P.robe, 0.12), wd = dark(P.robe, 0.34), wl = light(P.robe, 0.12);
    px(c - 5, hy - 4, 11, 5, wrap); px(c - 5, hy - 4, 11, 1, wl); px(c - 5, hy, 11, 1, wd);   // paño
    px(c - 5, hy - 4, 1, 5, wd); px(c + 5, hy - 4, 1, 5, wd);                                  // lados
    px(c - 2, hy - 6, 4, 2, wrap); px(c - 2, hy - 6, 4, 1, wl);                                // nudo/pico superior
    if (!v.back) { px(c - 1, hy - 3, 2, 1, P.gold); px(c - 1, hy - 3, 1, 1, P.goldHi); }       // broche dorado frontal
    px(c + 4, hy, 2, 4, wd);                                                                   // caída trasera del paño
  }

  // Bandana ROJA 紅巾 (Zhang Fei): banda ceñida a la frente con nudo lateral y COLA
  // que ondea. Deja ver el pelo salvaje por debajo. Toma el rojo de la capa.
  function redBandana(px, P, v, c, hy) {
    const red = P.capeColor || '#9e2f27', rd = dark(red, 0.28), rl = light(red, 0.14);
    px(c - 5, hy - 3, 11, 3, red); px(c - 5, hy - 3, 11, 1, rl); px(c - 5, hy - 1, 11, 1, rd);   // banda a la frente
    px(c - 5, hy - 3, 1, 3, rd); px(c + 5, hy - 3, 1, 3, rd);
    if (!v.back) { px(c - 1, hy - 2, 2, 1, P.gold); }                                            // tachón dorado
    // Nudo lateral + cola ondeante (a un lado).
    px(c - 7, hy - 1, 2, 2, red); px(c - 7, hy - 1, 2, 1, rl);                                   // nudo
    px(c - 9, hy, 2, 1, red); px(c - 10, hy + 1, 2, 1, rd); px(c - 9, hy + 2, 1, 1, red);        // cola volando
  }

  // 幞頭 (futou): gorro negro de comerciante/oficial Han con casquete redondeado y dos
  // ALAS horizontales (翅) que sobresalen a los lados — silueta inconfundible de mercader.
  function futou(px, P, v, c, hy) {
    const neg = '#211c16', ng = light(neg, 0.16), nd = dark(neg, 0.4);
    // Casquete abombado (dos escalones para dar volumen de gorro).
    px(c - 5, hy - 5, 11, 5, neg); px(c - 4, hy - 7, 9, 2, neg);
    px(c - 5, hy - 5, 11, 1, ng); px(c - 4, hy - 7, 9, 1, ng);
    px(c - 5, hy - 1, 11, 1, nd);
    if (v.back) {
      // Alas por detrás, más juntas; nudo del paño en la nuca.
      px(c - 8, hy - 3, 3, 2, neg); px(c + 5, hy - 3, 3, 2, neg);
      px(c - 8, hy - 3, 3, 1, ng); px(c + 5, hy - 3, 3, 1, ng);
      px(c - 1, hy - 1, 2, 2, nd);
      return;
    }
    // Alas laterales horizontales (una por lado; en perfil solo la trasera se insinúa).
    if (v.side < 1) { px(c - 9, hy - 4, 4, 2, neg); px(c - 9, hy - 4, 4, 1, ng); px(c - 9, hy - 2, 4, 1, nd); }
    px(c + 5, hy - 4, 4, 2, neg); px(c + 5, hy - 4, 4, 1, ng); px(c + 5, hy - 2, 4, 1, nd);
    if (v.front) px(c - 1, hy - 5, 2, 1, P.gold);   // broche dorado al frente
  }

  // ARMA equipada (兵): sustituye al prop de la aptitud cuando el mecenas empuña una.
  // Se dibuja en la mano delantera (o como asta si es de asta). key = viste.arma.
  function drawArma(px, P, v, g) {
    const A = anchors(g), c = CX + Math.round(v.dx * 0.6), baseY = A.baseY, key = P.arma;
    // GUANDAO 青龍偃月刀 (Guan Yu): asta larga con gran hoja en MEDIA LUNA, borla roja
    // y punta. Arma de asta → visible también de espaldas. Empuñada al costado.
    if (key === 'guandao') {
      // Empuñada al COSTADO (junto a la mano), no cruzada por la espalda. De espaldas
      // se acerca un poco pero sigue al lado del cuerpo, no sobre él.
      const hx = v.back ? c + 9 : c + 10, wood = '#5a3a1e';
      // ── Asta larga con anillas doradas y regatón ──
      px(hx, baseY - 46, 1, 46, wood); px(hx, baseY - 46, 1, 1, '#7a5a30');
      px(hx, baseY - 28, 1, 1, P.gold); px(hx, baseY - 12, 1, 1, P.gold);                       // anillas
      px(hx, baseY - 1, 1, 1, P.steelHi);                                                       // regatón
      // ── MANO que agarra el asta (a la altura del puño) → se lee como empuñada ──
      const gy = baseY - 17 + (g.step > 0 ? -1 : 1);
      px(hx - 1, gy, 2, 3, v.back ? P.skinDk : P.skin); px(hx - 1, gy, 2, 1, v.back ? P.skin : P.skinHi);
      px(hx - 1, gy + 1, 2, 1, dark(v.back ? P.skinDk : P.skin, 0.2));                          // nudillos
      // ── Collar de DRAGÓN 青龍 dorado donde nace la hoja + borla roja ──
      px(hx - 1, baseY - 40, 3, 3, P.gold); px(hx - 1, baseY - 40, 3, 1, P.goldHi);
      if (!v.back) px(hx + 1, baseY - 39, 1, 1, P.jade);                                        // ojo de jade del dragón
      px(hx - 1, baseY - 37, 3, 1, '#b83a2e'); px(hx, baseY - 36, 1, 4, '#a83a2e'); px(hx, baseY - 32, 1, 1, dark('#a83a2e', 0.3));  // borla roja
      // ── HOJA en MEDIA LUNA 偃月: ancha, nace del collar, se abre hacia fuera con
      // vientre en el medio, filo exterior brillante y punta afilada arriba ──
      const bx = hx + 1, topB = baseY - 50;
      const outer = [1, 2, 3, 4, 5, 5, 6, 6, 5, 4, 3, 2];                                        // ancho por fila (vientre al medio)
      for (let i = 0; i < outer.length; i++) {
        const y = topB + i, wdt = outer[i];
        px(bx, y, wdt, 1, P.steel);                                                             // cuerpo
        px(bx, y, 1, 1, P.steelDk);                                                             // lomo (junto al asta)
        px(bx + wdt - 1, y, 1, 1, P.steelHi);                                                   // filo exterior brillante
        if (i >= 3 && i <= 8) px(bx + 1, y, 1, 1, '#bfe6dd');                                   // reflejo verde-azulado (青)
      }
      px(bx, topB - 1, 1, 2, P.steelHi);                                                        // punta afilada
      // ── Púa/gancho trasero del lomo, al otro lado del asta ──
      px(hx - 2, baseY - 44, 2, 1, P.steelDk); px(hx - 3, baseY - 44, 1, 1, P.steelHi); px(hx - 2, baseY - 43, 1, 1, P.steelDk);
      return;
    }
    // LANZA SERPIENTE 丈八蛇矛 (Zhang Fei): asta larga con punta ONDULADA (llama
    // serpenteante) y banderín rojo. Arma de asta → visible también de espaldas.
    if (key === 'serpentspear') {
      const hx = v.back ? c + 9 : c + 10, wood = '#4a3320';
      px(hx, baseY - 46, 1, 46, wood); px(hx, baseY - 46, 1, 1, '#6a4a2a');                       // asta
      px(hx, baseY - 1, 1, 1, P.steelHi);                                                         // regatón
      const gy = baseY - 17 + (g.step > 0 ? -1 : 1);                                              // mano que agarra
      px(hx - 1, gy, 2, 3, v.back ? P.skinDk : P.skin); px(hx - 1, gy, 2, 1, v.back ? P.skin : P.skinHi);
      // Abrazadera + banderín/borla ROJA bajo la punta.
      px(hx - 1, baseY - 40, 3, 1, P.gold);
      px(hx - 3, baseY - 39, 3, 2, '#a83028'); px(hx - 4, baseY - 38, 1, 2, dark('#a83028', 0.2)); px(hx - 2, baseY - 37, 2, 1, '#a83028');   // banderín ondeando
      // PUNTA serpenteante (蛇矛): hoja en S con ACERO BRILLANTE (independiente del
      // acero oscuro de la armadura), onda clara izquierda/derecha y punta afilada.
      const st = '#c2cbd3', stHi = '#eef3f8', stDk = '#6c757f', t = baseY - 51;
      px(hx, t, 1, 2, stHi);                                                                      // punta
      px(hx, t + 2, 2, 1, st); px(hx + 1, t + 2, 1, 1, stHi);                                     // ola →
      px(hx - 1, t + 3, 2, 1, st); px(hx - 1, t + 3, 1, 1, stHi);                                 // ola ←
      px(hx - 1, t + 4, 2, 1, st);
      px(hx, t + 5, 2, 1, st); px(hx + 1, t + 5, 1, 1, stHi);                                     // ola →
      px(hx, t + 6, 2, 1, st);
      px(hx - 1, t + 7, 2, 1, st); px(hx - 1, t + 7, 1, 1, stHi);                                 // ola ←
      px(hx, t + 8, 1, 2, st);                                                                    // cuello al asta
      px(hx, t + 2, 1, 6, stDk);                                                                  // nervio central
      return;
    }
    // Armas de ASTA: visibles incluso de espaldas (como la lanza).
    if (key === 'ji' || key === 'jie' || key === 'lanza') {
      const hx = v.back ? c + 6 : c + 10;
      px(hx, baseY - 46, 1, 46, P.boot); px(hx, baseY - 46, 1, 1, P.bootHi);      // asta
      if (key === 'ji') {                                                          // alabarda 戟: punta + media luna
        px(hx, baseY - 52, 1, 6, P.steelHi); px(hx - 1, baseY - 51, 3, 1, P.steel); px(hx - 1, baseY - 49, 3, 1, P.steelDk);
        px(hx - 3, baseY - 47, 1, 5, P.steel); px(hx - 4, baseY - 46, 1, 3, P.steelHi); px(hx - 2, baseY - 44, 2, 1, P.steelDk);  // media luna
        px(hx - 1, baseY - 41, 3, 1, P.trim); px(hx - 1, baseY - 40, 3, 1, P.trimDk);
      } else if (key === 'jie') {                                                  // vara de mando 節: pomo + borlas
        px(hx - 1, baseY - 49, 3, 3, P.gold); px(hx, baseY - 51, 1, 2, P.goldHi);
        for (let i = 0; i < 6; i++) px(hx - 2 + (i % 2) * 4, baseY - 45 + i, 1, 1, (i % 2) ? '#a83a2e' : P.trim);   // borlas
      } else {                                                                     // lanza QUEBRADIZA 折矛: punta simple y mellada, sin borla
        px(hx, baseY - 51, 1, 5, P.steel); px(hx, baseY - 51, 1, 1, P.steelHi); px(hx - 1, baseY - 50, 2, 1, P.steelDk);
        px(hx - 1, baseY - 38, 3, 1, P.trimDk);                                    // atadura basta
        px(hx, baseY - 22, 1, 2, dark(P.boot, 0.35)); px(hx - 1, baseY - 21, 1, 1, dark(P.boot, 0.4));  // astilla/mella del asta
      }
      return;
    }
    if (v.back) return;                                                            // el resto no se ve de espaldas
    const handY = baseY - 17 + (g.step > 0 ? -1 : 1);
    const hx = v.side >= 1 ? c + 6 : c + shHalfOf(v) + 4;
    switch (key) {
      case 'jian':                                                                 // espada recta 劍
        px(hx, handY - 18, 2, 18, P.steel); px(hx, handY - 18, 1, 18, P.steelHi); px(hx, handY - 19, 2, 1, light(P.steelHi, 0.3));
        px(hx - 1, handY, 4, 1, P.gold); px(hx, handY + 1, 2, 4, P.boot); px(hx, handY + 5, 2, 1, P.goldHi);
        break;
      case 'dao':                                                                  // sable curvo 刀
        for (let i = 0; i < 16; i++) { const off = Math.round(Math.sin(i / 16 * 1.25) * 2); px(hx + off, handY - 16 + i, 2, 1, P.steel); px(hx + off, handY - 16 + i, 1, 1, P.steelHi); }
        px(hx - 1, handY, 4, 1, P.gold); px(hx, handY + 1, 2, 4, P.boot);
        break;
      case 'fan2':                                                                 // abanico de plumas 羽扇
        px(hx, handY, 1, 6, P.boot);
        px(hx - 3, handY - 9, 8, 10, '#f2ecdd'); px(hx - 3, handY - 9, 8, 1, '#d8cfb4'); px(hx - 3, handY - 9, 1, 10, P.gold);
        for (let i = 0; i < 10; i += 2) px(hx, handY - 9 + i, 1, 1, '#cdbf9c');
        break;
      case 'dizi':                                                                 // flauta de jade 玉笛
        px(hx - 5, handY - 1, 10, 2, P.jade); px(hx - 5, handY - 1, 10, 1, light(P.jade, 0.25));
        for (let i = -3; i <= 3; i += 2) px(hx + i, handY, 1, 1, dark(P.jade, 0.4));
        px(hx + 4, handY - 1, 1, 3, '#a83a2e');
        break;
      case 'bi':                                                                   // pincel del juez 判官筆
        px(hx, handY - 14, 2, 12, '#c8462f'); px(hx, handY - 15, 2, 1, P.gold);
        px(hx, handY - 2, 2, 5, P.ink); px(hx, handY + 3, 2, 2, dark(P.ink, 0.2));
        break;
      case 'hu2':                                                                  // tabla de audiencia 笏
        px(hx, handY - 10, 3, 15, '#efe9d8'); px(hx, handY - 10, 3, 1, P.jade); px(hx + 2, handY - 9, 1, 13, dark('#efe9d8', 0.15));
        break;
      case 'bian':                                                                 // fusta/maza segmentada 鞭
        px(hx, handY - 13, 2, 14, P.steelDk);
        for (let i = 0; i < 4; i++) px(hx, handY - 12 + i * 3, 2, 1, P.steelHi);
        px(hx - 1, handY, 4, 1, P.gold); px(hx, handY + 1, 2, 3, P.boot);
        break;
    }
  }

  // Prop por aptitud. Por la espalda solo asoma la lanza.
  function prop(px, P, v, g) {
    if (P.arma) { drawArma(px, P, v, g); return; }
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
  function paintFigure(ctx, base, mirror, P, g, pose, sec) {
    ctx.save();
    if (mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
    figure(px, P, base, g, pose, sec);
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
    // GESTO expresivo (debate): brazos + cara animados. Congela la marcha (sin
    // bobbing de andar) y usa `frame` como fase del gesto (boca que se abre/cierra…).
    const gesture = opts.gesture || null;
    const g = gesture ? { f: 0, bob: 0, step: 0 } : gait(opts.frame || 0);
    // SECUELAS permanentes (cosméticas) + pose de COJERA. `secuelas` = ['manco','tuerto',…].
    const secArr = Array.isArray(opts.secuelas) ? opts.secuelas : [];
    const sec = { manco: secArr.indexOf('manco') >= 0, tuerto: secArr.indexOf('tuerto') >= 0,
                  gesture, expr: opts.expr || null, gframe: (opts.frame | 0),
                  oficio: opts.oficio || null, workPhase: (typeof opts.workPhase === 'number' ? opts.workPhase : 0) };
    if (opts.pose === 'limp') g.limp = true;   // el herido arrastra una pierna (peregrinaje)
    const wantOutline = opts.outline !== false && typeof document !== 'undefined' && document.createElement;

    if (wantOutline) {
      // Render en lienzo lógico (W×H) → contorno → escalado nítido al destino.
      const off = document.createElement('canvas'); off.width = W; off.height = H;
      const o = off.getContext('2d'); o.imageSmoothingEnabled = false;
      paintFigure(o, base, mirror, P, g, opts.pose, sec);
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
    paintFigure(ctx, base, mirror, P, g, opts.pose, sec);
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

  // ── MANOS en PRIMERA PERSONA (para el mostrador del mercado al VENDER) ────────
  // Dos antebrazos que entran desde abajo y ofrecen las palmas abiertas hacia el
  // mostrador. Mangas del color de la TÚNICA del jugador (robe) con puño de acento;
  // manos de su tono de piel. Se dibuja en lienzo lógico y se escala nítido.
  function firstPersonHands(canvas, opts) {
    if (!canvas) return; opts = opts || {};
    // Deriva TODOS los colores del MISMO motor que la figura (palette), a partir del
    // aspecto del mecenas → la piel (incluida la rojiza de atuendos), la túnica y el acento
    // salen idénticos a su personaje. Fallback a los campos sueltos si no se pasa aspecto.
    const asp = opts.aspecto || { robe: opts.robe, accent: opts.accent, piel: opts.piel };
    const P = palette('', asp);
    const robe = P.robe, robeHi = P.robeHi, robeDk = P.robeDk, robeSh = P.robeSh;
    const skin = P.skin, skinHi = P.skinHi, skinDk = P.skinDk;
    const cuff = P.trim, cuffHi = P.trimHi;
    const scale = Math.max(1, Math.round(opts.scale || 6));
    const W2 = 120, H2 = 62;
    const off = document.createElement('canvas'); off.width = W2; off.height = H2;
    const o = off.getContext('2d'); if (!o) return; o.imageSmoothingEnabled = false;
    const px = (x, y, w, h, c) => { o.fillStyle = c; o.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
    // Un brazo: manga desde una esquina inferior subiendo a la muñeca (interior), puño
    // dorado y MANO abierta con la palma hacia arriba y dedos definidos. dir=+1 mano
    // izquierda (a la izquierda, palma mirando al centro), dir=-1 mano derecha (espejo).
    function arm(bottomX, wristX, dir) {
      const wy = 24;                                        // altura de la muñeca
      for (let y = H2 - 1; y >= wy; y--) {                  // manga: interpola de la esquina inferior a la muñeca
        const t = (H2 - 1 - y) / (H2 - 1 - wy);
        const cx = bottomX + (wristX - bottomX) * t;
        const w = 17 - t * 5;
        px(cx - w / 2, y, w, 1, robe);
        px(cx - w / 2, y, Math.max(2, w * 0.3), 1, dir > 0 ? robeHi : robeSh);
        px(cx + w / 2 - 2, y, 2, 1, dir > 0 ? robeSh : robeHi);
      }
      const wx = wristX;
      px(wx - 6, wy - 2, 12, 3, cuff); px(wx - 6, wy - 2, 12, 1, cuffHi);           // puño
      // palma (cuenco de la mano)
      px(wx - 6, wy - 8, 12, 6, skin); px(wx - 6, wy - 8, 12, 1, skinHi); px(wx - 6, wy - 3, 12, 1, skinDk);
      // 4 dedos abiertos con surco oscuro entre ellos
      for (let f = 0; f < 4; f++) { const fx = wx - 6 + f * 3; px(fx, wy - 15, 2, 8, skin); px(fx, wy - 15, 2, 1, skinHi); px(fx + 2, wy - 14, 1, 7, skinDk); }
      // pulgar hacia el centro (lado interior de cada mano)
      px(wx + dir * 5, wy - 7, 3, 5, skin); px(wx + dir * 5, wy - 7, 1, 5, skinHi); px(wx + dir * 5, wy - 3, 3, 1, skinDk);
    }
    arm(22, 34, 1); arm(98, 86, -1);   // manos separadas → hueco central para ofrecer los objetos
    outlinePass(o);
    canvas.width = W2 * scale; canvas.height = H2 * scale;
    const ctx = canvas.getContext('2d'); if (!ctx) return; ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, 0, 0, W2, H2, 0, 0, W2 * scale, H2 * scale);
  }

  return {
    draw, firstPersonHands, DIRS, FRAMES, W, H, palette, OUTFIT, SKINS, HAIRS,
    sprite, imgFor, pngReady: () => PNG_ENABLED && pngReadyFlag, PNG_W, PNG_H, PNG_FEET, PNG_NF,
    // Fracciones del MAESTRO (para la capa de personajes nítida, que dibuja el
    // maestro de alta resolución directamente): pies y ancho relativos a su alto.
    feetFrac: M_FEET / M_H, aspect: M_W / M_H
  };
})();

if (typeof window !== 'undefined') window.HacChar = HacChar;
if (typeof module !== 'undefined' && module.exports) module.exports = HacChar;
