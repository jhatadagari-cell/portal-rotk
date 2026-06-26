/* ═══════════════════════════════════════════════════════════════════════
   hac-folk.js — Los mecenas paseando por la finca (capa de animación).
   ─────────────────────────────────────────────────────────────────────────
   Pide a hac-iso que repinte su FONDO cacheado y reinserte a los caminantes en
   el ORDEN DE PROFUNDIDAD (HacIso.frame), de modo que los muros y edificios que
   tienen delante los OCULTAN de verdad. Encima va una capa de OVERLAYS sin
   oclusión: los banners 匾額 de los edificios ocupados y el mecenas SELECCIONADO
   (resaltado, visible aunque esté detrás o dentro de algo).

   Comportamiento (máquina de estados por mecenas):
     · paseando → deambula, prefiriendo los CAMINOS (×4). Cada cierto rato DECIDE
       visitar un edificio (el suyo asignado preferentemente, o uno cercano).
     · yendo    → camina hasta la PUERTA del edificio elegido con pathfinding
       (BFS sobre celdas transitables + portones/puertas interiores).
     · tarea    → entra y permanece DENTRO un rato (~20–40 s) haciendo la tarea
       del edificio. Solo AQUÍ cuenta como "dentro" (decisión deliberada, no por
       rozar una celda). Su presencia se anuncia con el banner 匾額.
     · saliendo → cumplido el tiempo, sale por la puerta y vuelve a pasear.

   API:
     HacFolk.start(iso, { mapa, tier, color, miembros, onState })  ·  stop()
     HacFolk.list()        → [{ id, name, color, inside:<label>|null, activity }]
     HacFolk.select(id)    → resalta a ese mecenas (null = ninguno)
     HacFolk.selected()    → id seleccionado | null
     HacFolk.position(id)  → [lx, ly] lógicos del mecenas (para mover la cámara)
   Además deja en iso._hacSigns los banners (rect lógico + nombres) para el
   hit-test de clic en la página.
   ═══════════════════════════════════════════════════════════════════════ */
const HacFolk = (function () {
  'use strict';

  const TW = (window.HacIso && HacIso.TILE_W) || 36;
  const TH = (window.HacIso && HacIso.TILE_H) || 18;

  let raf = null, iso = null, opts = null, walkers = [], wk = null, names = {};
  let lastT = 0, running = false, visible = true, onScreen = true, io = null;
  let selectedId = null, stateSig = '', hailCd = 20;

  const { hexToRgb, reduced, neigh, rnd, rng } = HacUtil;
  const proj = () => iso && iso._hacProj;
  function logic(fx, fy) { const p = proj(); if (!p) return [0, 0]; return [p.originX + (fx - fy) * TW / 2, p.originY + (fx + fy) * TH / 2]; }

  // ── Modelo pixel-art (HacChar) ────────────────────────────────────────────
  const SCALE = (window.HacIso && HacIso.SCALE) || 2;   // px de dispositivo por px lógico
  const SPRITE_DISP = 1;                                // px de dispositivo por px del sprite (1 = ratio entero, nítido)
  const spriteCache = new Map();                        // key → canvas ya con contorno
  // Dirección de 8 según el vector de movimiento en pantalla (no en la rejilla):
  // +gx va a la derecha-abajo, +gy a la izquierda-abajo en el isométrico.
  const DIRS8 = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
  function faceFromGrid(gdx, gdy) {
    if (!gdx && !gdy) return null;
    const sdx = gdx - gdy, sdy = gdx + gdy;
    const deg = (Math.atan2(sdy, sdx) * 180 / Math.PI + 360) % 360;
    return DIRS8[Math.round(deg / 45) % 8];
  }
  // Sprite cacheado para (aptitud+aspecto, dir, frame). Evita rehacer el contorno
  // cada fotograma; muchos walkers comparten combinaciones.
  function spriteFor(w, dir, frame, pose) {
    const a = w.aspecto || {};
    const key = (w.aptitud || '_') + '|' + (a.robe || '') + '|' + (a.piel || 0) + '|' + (a.pelo || 0) + '|' + dir + '|' + frame + '|' + (pose || 's');
    let cv = spriteCache.get(key);
    if (!cv && window.HacChar) {
      cv = document.createElement('canvas');
      HacChar.draw(cv, { aptitud: w.aptitud, aspecto: a, dir: dir, frame: frame, scale: 1, pose: pose });
      spriteCache.set(key, cv);
    }
    return cv;
  }

  // Composición de la línea de actividad ("de camino al cuartel" / "Entrenando
  // en el cuartel"). lugar viene con artículo en minúscula ("el cuartel").
  const aLugar = (l) => { l = l || 'el edificio'; return l.slice(0, 3) === 'el ' ? 'al ' + l.slice(3) : 'a ' + l; };
  const enLugar = (l) => 'en ' + (l || 'el edificio');
  const lugarDe = (tipo) => (window.HacBuild && HacBuild.lugarDe) ? HacBuild.lugarDe(tipo) : null;
  const tareaTipo = (tipo) => (window.HacBuild && HacBuild.tareaDe) ? HacBuild.tareaDe(tipo) : null;

  // ── Mapa de la finca ──────────────────────────────────────────────────────
  // Celdas transitables, caminos, edificios y su PUERTA (celda interior + celda
  // de aproximación transitable adyacente) para que los mecenas entren de verdad.
  function build(mapa, tier) {
    const B = window.HacBuild;
    const dims = B ? B.gridDims(tier) : [8, 12];
    const GW = dims[0], GH = dims[1];
    const lista = B ? B.construccionesValidas(mapa, tier) : ((mapa && mapa.construcciones) || []);
    const PASS = new Set(['porton', 'chuihuamen']);   // se cruzan
    const PLANT = new Set(['jardin', 'jardin-flores', 'bonsai']);   // jardines PISABLES (plantas)
    const WATER = new Set(['estanque', 'lago']);                     // agua: NO pisable
    const blocked = new Set(), cam = new Set(), garden = new Set(), water = new Set(), ownByMember = {};
    const buildings = new Map();
    lista.forEach(c => {
      const cells = (B && B.celdasOcupadas) ? B.celdasOcupadas(c) : [[c.pos[0], c.pos[1]]];
      if (c.dueno) { (ownByMember[c.dueno] = ownByMember[c.dueno] || []).push.apply(ownByMember[c.dueno], cells.map(p => p[0] + ',' + p[1])); }
      const cat = (B && B.categoriaDe) ? B.categoriaDe(c.tipo) : 'edificio';
      if (cat === 'edificio') {
        const id = c.pos[0] + ',' + c.pos[1], def = (B && B.tipo(c.tipo)) || {};
        let sx = 0, sy = 0; cells.forEach(p => { sx += p[0]; sy += p[1]; });
        const cx = Math.round(sx / cells.length), cy = Math.round(sy / cells.length);
        buildings.set(id, { id, tipo: c.tipo, cx, cy, cells, altura: def.altura || 24, dueno: c.dueno || null, nombre: def.nombre || 'Edificio', dominio: def.dominio || null });
      }
      if (PASS.has(c.tipo)) return;
      if (B && B.esSuelo && B.esSuelo(c.tipo)) {
        if (c.tipo === 'camino') cells.forEach(p => cam.add(p[0] + ',' + p[1]));
        else if (PLANT.has(c.tipo)) cells.forEach(p => garden.add(p[0] + ',' + p[1]));
        else if (WATER.has(c.tipo)) cells.forEach(p => { const k = p[0] + ',' + p[1]; blocked.add(k); water.add(k); });
        return;
      }
      cells.forEach(p => blocked.add(p[0] + ',' + p[1]));
    });
    // Celdas transitables (no bloqueadas y dentro de la rejilla).
    const set = new Set(), cells = [], camCells = [];
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const k = x + ',' + y;
      if (!blocked.has(k)) { set.add(k); cells.push([x, y]); if (cam.has(k)) camCells.push([x, y]); }
    }
    // Puerta de cada edificio: una celda interior (spot) con un vecino transitable
    // (approach). Se prefiere que la aproximación caiga sobre un CAMINO. Sin
    // aproximación accesible → no es "visitable".
    const visitable = [];
    buildings.forEach(b => {
      let chosen = null, onCam = false;
      for (let i = 0; i < b.cells.length && !onCam; i++) {
        const p = b.cells[i];
        const ns = neigh(p[0], p[1]);
        for (let j = 0; j < ns.length; j++) {
          const nk = ns[j][0] + ',' + ns[j][1];
          if (!set.has(nk)) continue;
          const isCam = cam.has(nk);
          if (!chosen || (isCam && !onCam)) { chosen = { spot: p, app: ns[j] }; onCam = isCam; }
          if (isCam) break;
        }
      }
      if (chosen) { b.spotCell = chosen.spot; b.approach = chosen.app; b.approachKey = chosen.app[0] + ',' + chosen.app[1]; b.visitable = true; visitable.push(b); }
    });
    // Lista de celdas de césped PISABLE (para que los mecenas que pasean cerca
    // decidan acercarse a descansar en la hierba).
    const gardenCells = [];
    garden.forEach(k => { if (set.has(k)) { const p = k.split(',').map(Number); gardenCells.push(p); } });
    return { set, cells, cam, camCells, garden, gardenCells, water, GW, GH, ownByMember, buildings, visitable };
  }

  // BFS sobre celdas transitables: de `start` a la primera celda de `goalKeys`.
  // Devuelve la lista de celdas a recorrer (sin la de inicio, con la meta), o null.
  function bfs(start, goalKeys) {
    const sk = start[0] + ',' + start[1];
    if (goalKeys.has(sk)) return [];
    const prev = new Map(); prev.set(sk, null);
    const q = [start]; let head = 0;
    while (head < q.length) {
      const cur = q[head++];
      const ns = neigh(cur[0], cur[1]);
      for (let i = 0; i < ns.length; i++) {
        const nx = ns[i][0], ny = ns[i][1], k = nx + ',' + ny;
        if (prev.has(k) || !wk.set.has(k)) continue;
        prev.set(k, cur);
        if (goalKeys.has(k)) {
          const path = []; let p = [nx, ny];
          while (p) { path.push(p); p = prev.get(p[0] + ',' + p[1]); }
          path.reverse(); path.shift();   // quita la celda de inicio
          return path;
        }
        q.push([nx, ny]);
      }
    }
    return null;
  }

  function spawn(mapa, tier, miembros, color) {
    wk = build(mapa, tier);
    names = {}; (miembros || []).forEach(m => { names[m.id] = m.nombre || ''; });
    if (!wk.cells.length) return [];
    return (miembros || []).slice(0, 24).map(m => {
      // Edificio propio (si administra alguno): se usa como "hogar" al que gravita
      // y que visita más a menudo.
      let homeBid = null, home = null, start = null;
      wk.buildings.forEach(b => { if (b.dueno === m.id && b.visitable) homeBid = b.id; });
      if (homeBid) { const b = wk.buildings.get(homeBid); home = b.spotCell; start = b.approach; }
      if (!start) start = (wk.camCells.length && Math.random() < 0.7) ? wk.camCells[rnd(wk.camCells.length)] : wk.cells[rnd(wk.cells.length)];
      // Modelo del mecenas: aptitud/aspecto de su personaje registrado. Si no
      // tiene personaje vinculado, modelo por defecto con el color de la casa.
      const pj = (m.personajeId && window.HacPersonajes && HacPersonajes.get) ? HacPersonajes.get(m.personajeId) : null;
      const aptitud = pj ? pj.aptitud : '';
      const aspecto = pj ? (pj.aspecto || {}) : { robe: color };
      const cargo = (window.HacCalc && HacCalc.rangoDePuntos) ? HacCalc.rangoDePuntos(Number(m.puntos) || 0, tier) : null;
      const aptDef = (aptitud && window.HacPersonajeDefs) ? HacPersonajeDefs.aptitud(aptitud) : null;
      return {
        id: m.id, name: m.nombre || '', color, aptitud, aspecto,
        cargoIcon: cargo ? (cargo.icon || '') : '', cargoNombre: cargo ? cargo.nombre : '', cargoTier: cargo ? (cargo.tier || 1) : 0,
        aptIcon: aptDef ? (aptDef.icon || '') : '', dominios: aptDef ? (aptDef.dominios || []) : [],
        fx: start[0], fy: start[1], tx: start[0], ty: start[1], moving: false, dir: 'S',
        state: 'paseando', path: null, goalBid: null, insideId: null, task: null,
        homeBid, home, taskTimer: 0, strollTimer: rng(2, 6), wait: Math.random() * 1.2,
        idleTimer: 0, gardenCd: rng(4, 12), socialCd: rng(4, 12), chatWith: null,
        chatLead: false, convo: null, convoIdx: 0, turnTimer: 0, speech: null,
        meetWith: null, meetLead: false, meetTimer: 0, restIntent: null,
        phase: Math.random() * 6.28
      };
    });
  }

  // Elige un edificio a visitar, sesgado por el DOMINIO del mecenas (militar va
  // a edificios militares, etc.) y por su cargo (los altos frecuentan los salones
  // administrativos/nobles). Con frecuencia, el propio.
  function chooseBuilding(w) {
    if (!wk.visitable.length) return null;
    if (w.homeBid && Math.random() < 0.5) { const b = wk.buildings.get(w.homeBid); if (b && b.visitable) return b; }
    const doms = w.dominios || [], noble = (w.cargoTier || 0) >= 2;
    const weighted = [];
    wk.visitable.forEach(b => {
      let wt = 1;
      if (b.dominio && doms.indexOf(b.dominio) >= 0) wt += 4;
      if (noble && b.dominio === 'administrativo') wt += 2;
      for (let i = 0; i < wt; i++) weighted.push(b);
    });
    return weighted.length ? weighted[rnd(weighted.length)] : wk.visitable[rnd(wk.visitable.length)];
  }

  // Intenta arrancar una visita: traza el camino a la puerta y entra en 'yendo'.
  function startVisit(w) {
    const b = chooseBuilding(w); if (!b) return false;
    const start = [Math.round(w.fx), Math.round(w.fy)];
    const path = bfs(start, new Set([b.approachKey]));
    if (!path) return false;
    path.push(b.spotCell);            // último paso: cruzar la puerta hacia dentro
    w.path = path; w.state = 'yendo'; w.goalBid = b.id; w.moving = false;
    return true;
  }

  // Sale del edificio: a la celda de aproximación y luego a un punto de paseo.
  function startLeave(w) {
    const b = wk.buildings.get(w.insideId);
    w.insideId = null; w.goalBid = null; w.task = null;
    if (!b) { w.state = 'paseando'; w.strollTimer = rng(2, 6); return; }
    const goal = (wk.camCells.length && Math.random() < 0.8) ? wk.camCells[rnd(wk.camCells.length)] : wk.cells[rnd(wk.cells.length)];
    const out = bfs(b.approach, new Set([goal[0] + ',' + goal[1]])) || [];
    w.path = [b.approach].concat(out); w.state = 'saliendo'; w.moving = false;
  }

  function onPathDone(w) {
    if (w.state === 'yendo') {
      w.state = 'tarea'; w.insideId = w.goalBid; w.phase = Math.random() * 6.28;
      // Elige una tarea del edificio (varias por tipo) y su duración configurada;
      // jitter ±15% para que no entren/salgan todos en lockstep.
      const b = wk.buildings.get(w.goalBid);
      const task = (b && window.HacTareas && HacTareas.pick) ? HacTareas.pick(b.tipo) : null;
      w.task = task;
      w.taskTimer = (task ? task.duracionSeg : 30) * (0.85 + Math.random() * 0.3);
    } else if (w.state === 'saliendo') {
      w.state = 'paseando'; w.strollTimer = rng(2, 6); w.wait = rng(0.2, 0.8); w.task = null;
    }
    w.path = null;
  }

  // Paso a lo largo de un camino prefijado (yendo/saliendo).
  function followPath(w, dt, SPD) {
    if (!w.moving) {
      if (w.path && w.path.length) { const c = w.path.shift(); w.tx = c[0]; w.ty = c[1]; w.moving = true; }
      else { onPathDone(w); return; }
    }
    const dx = w.tx - w.fx, dy = w.ty - w.fy, d = Math.hypot(dx, dy), adv = SPD * dt;
    const fd = faceFromGrid(dx, dy); if (fd) w.dir = fd;
    if (d <= adv) { w.fx = w.tx; w.fy = w.ty; w.moving = false; w.phase += dt * 8; if (!(w.path && w.path.length)) onPathDone(w); }
    else { w.fx += dx / d * adv; w.fy += dy / d * adv; w.phase += dt * 8; }
  }

  // Deambular: elige un vecino transitable, sesgado a caminos y hacia el hogar.
  function wanderPick(w) {
    const cx = Math.round(w.fx), cy = Math.round(w.fy);
    const cand = neigh(cx, cy).filter(([x, y]) => wk.set.has(x + ',' + y));
    if (!cand.length) { w.wait = 0.6; return; }
    const weighted = [];
    cand.forEach(([x, y]) => {
      let wgt = wk.cam.has(x + ',' + y) ? 4 : 1;
      if (w.home) {
        const dNow = Math.abs(cx - w.home[0]) + Math.abs(cy - w.home[1]);
        const dNew = Math.abs(x - w.home[0]) + Math.abs(y - w.home[1]);
        if (dNew < dNow) wgt += (dNow > 4 ? 5 : 2);
      }
      for (let i = 0; i < wgt; i++) weighted.push([x, y]);
    });
    const t = weighted[rnd(weighted.length)];
    w.tx = t[0]; w.ty = t[1]; w.moving = true;
  }

  function wander(w, dt, SPD) {
    if (w.moving) {
      const dx = w.tx - w.fx, dy = w.ty - w.fy, d = Math.hypot(dx, dy), adv = SPD * dt;
      const fd = faceFromGrid(dx, dy); if (fd) w.dir = fd;
      if (d <= adv) { w.fx = w.tx; w.fy = w.ty; w.moving = false; w.wait = rng(0.3, 1.9); maybeGarden(w); }
      else { w.fx += dx / d * adv; w.fy += dy / d * adv; }
      w.phase += dt * 8;
      return;
    }
    w.wait -= dt; w.strollTimer -= dt;
    if (w.wait > 0) return;
    if (w.strollTimer <= 0) { if (startVisit(w)) return; w.strollTimer = rng(3, 9); }
    if (maybeRest(w)) return;     // ¿pasa cerca de un jardín y decide acercarse a la hierba?
    wanderPick(w);
  }

  // ── Reacciones al entorno ──────────────────────────────────────────────────
  function faceTowards(w, cx, cy, set) {
    const t = neigh(cx, cy).find(([x, y]) => set.has(x + ',' + y));
    if (t) { const fd = faceFromGrid(t[0] - cx, t[1] - cy); if (fd) w.dir = fd; }
  }
  // Atracción por PROXIMIDAD al jardín: si pasea a <=2 teselas de césped pisable
  // (sin estar ya en él), con cierta probabilidad se acerca a la hierba a tumbarse
  // o a contemplar. Así no depende de que cruce el jardín por azar (es una
  // construcción y no la pisarían sin motivo).
  function maybeRest(w) {
    if (w.gardenCd > 0 || !wk.gardenCells.length) return false;
    const cx = Math.round(w.fx), cy = Math.round(w.fy);
    if (wk.garden.has(cx + ',' + cy)) return false;   // ya está en césped → lo gestiona maybeGarden
    let best = null, bestD = 99;
    for (let i = 0; i < wk.gardenCells.length; i++) {
      const g = wk.gardenCells[i], d = Math.abs(g[0] - cx) + Math.abs(g[1] - cy);
      if (d >= 1 && d <= 2 && d < bestD) { bestD = d; best = g; }
    }
    if (!best) return false;
    if (Math.random() >= 0.35) { w.gardenCd = rng(6, 14); return false; }   // pasa cerca pero esta vez sigue su camino
    const path = bfs([cx, cy], new Set([best[0] + ',' + best[1]]));
    if (!path || !path.length) { w.gardenCd = rng(6, 14); return false; }
    w.path = path; w.moving = false;
    w.restIntent = (Math.random() < 0.6) ? 'tumbado' : 'contemplando';      // la mayoría se tumba en la hierba
    w.state = 'a-descansar';
    return true;
  }
  // Llegado al césped, adopta la pose de descanso elegida.
  function applyRest(w) {
    const cx = Math.round(w.fx), cy = Math.round(w.fy);
    if (w.restIntent === 'contemplando') { w.state = 'contemplando'; w.idleTimer = rng(6, 12); w.gardenCd = rng(25, 50); faceTowards(w, cx, cy, wk.garden); }
    else { w.state = 'tumbado'; w.idleTimer = rng(12, 24); w.gardenCd = rng(45, 85); }
    w.restIntent = null; w.moving = false; w.path = null;
  }
  // Al pisar un jardín al pasar (con cooldown), o junto al agua: a veces se para
  // a contemplar o a descansar un momento.
  function maybeGarden(w) {
    if (w.state !== 'paseando' || w.gardenCd > 0) return;
    const cx = Math.round(w.fx), cy = Math.round(w.fy);
    const onGarden = wk.garden.has(cx + ',' + cy);
    // El agua no es pisable: solo se contempla desde una celda contigua.
    const nearWater = !onGarden && neigh(cx, cy).some(([x, y]) => wk.water.has(x + ',' + y));
    if (!onGarden && !nearWater) return;
    const r = Math.random();
    if (onGarden) {
      if (r < 0.40) { w.state = 'contemplando'; w.idleTimer = rng(5, 11); w.gardenCd = rng(25, 50); faceTowards(w, cx, cy, wk.garden); }
      else if (r < 0.68) { w.state = 'tumbado'; w.idleTimer = rng(10, 20); w.gardenCd = rng(40, 80); }   // se sienta a descansar (solo sobre plantas)
      else { w.gardenCd = rng(8, 16); }                                                                    // esta vez nada
    } else {                                  // junto al agua: solo contemplar
      if (r < 0.55) { w.state = 'contemplando'; w.idleTimer = rng(6, 12); w.gardenCd = rng(25, 50); faceTowards(w, cx, cy, wk.water); }
      else { w.gardenCd = rng(10, 20); }
    }
  }

  // Si dos mecenas paseando se cruzan, con cierta probabilidad se saludan y se
  // quedan conversando un rato, mirándose y turnándose la palabra (bocadillos).
  // El iniciador (a) lleva la batuta del guion; el otro solo le sigue.
  function faceChat(a, b) {
    const fa = faceFromGrid(b.fx - a.fx, b.fy - a.fy); if (fa) a.dir = fa;
    const fb = faceFromGrid(a.fx - b.fx, a.fy - b.fy); if (fb) b.dir = fb;
  }
  function startChat(a, b) {
    a.meetWith = b.meetWith = null; a.meetLead = b.meetLead = false;    // por si venían de una llamada a distancia
    a.state = b.state = 'charlando'; a.idleTimer = b.idleTimer = 60;   // tope de seguridad; el guion marca el fin
    a.moving = b.moving = false; a.path = b.path = null;
    a.chatWith = b.id; b.chatWith = a.id;
    a.chatLead = true; b.chatLead = false;
    a.convo = HacDialog.charla(a.aptitud); a.convoIdx = -1; b.convo = null;
    a.speech = b.speech = null;
    faceChat(a, b);
    convoAdvance(a);                                                   // arranca el primer turno
  }
  // Avanza el guion: muestra la siguiente réplica en el bocadillo del que habla
  // y limpia el del que escucha. Al agotarse las réplicas, termina la charla.
  function convoAdvance(lead) {
    const o = walkers.find(x => x.id === lead.chatWith);
    lead.convoIdx++;
    if (!o || !lead.convo || lead.convoIdx >= lead.convo.length || lead.idleTimer <= 0) { endChat(lead); return; }
    const line = lead.convo[lead.convoIdx];
    const speaker = (lead.convoIdx % 2 === 0) ? lead : o;
    const listener = (speaker === lead) ? o : lead;
    speaker.speech = line; listener.speech = null;
    lead.turnTimer = Math.min(5.2, Math.max(2.6, 1.6 + line.length * 0.05));   // dura según longitud + pausa
    faceChat(lead, o);
  }
  function resetFromChat(w) {
    w.state = 'paseando'; w.strollTimer = rng(2, 6); w.wait = rng(0.2, 0.8);
    w.chatWith = null; w.chatLead = false; w.convo = null; w.speech = null; w.socialCd = rng(20, 50);
  }
  function endChat(w) {
    const o = walkers.find(x => x.id === w.chatWith);
    resetFromChat(w);
    if (o && o.state === 'charlando') resetFromChat(o);
  }
  function encounters() {
    for (let i = 0; i < walkers.length; i++) {
      const a = walkers[i]; if (a.state !== 'paseando' || a.socialCd > 0) continue;
      for (let j = i + 1; j < walkers.length; j++) {
        const b = walkers[j]; if (b.state !== 'paseando' || b.socialCd > 0) continue;
        const dx = a.fx - b.fx, dy = a.fy - b.fy;
        if (dx * dx + dy * dy > 1.7) continue;          // ~1.3 tiles
        if (Math.random() < 0.5) startChat(a, b);
        else { a.socialCd = b.socialCd = rng(6, 14); }  // este cruce no; reintenta luego
        break;
      }
    }
  }

  // ── Llamada a distancia ────────────────────────────────────────────────────
  // De vez en cuando un mecenas avista a otro a media distancia, le grita una
  // exclamación y lo "llama"; el otro responde y ambos caminan a su encuentro
  // antes de ponerse a charlar. El texto sale de HacDialog ({n} = nombre del otro).
  function fillName(tpl, name) { const n = String(name || '').split(' ')[0] || 'amigo'; return tpl.replace('{n}', n); }

  // Celda transitable más cercana a un punto (búsqueda en anillos crecientes).
  function findMeetCell(mx, my) {
    if (wk.set.has(mx + ',' + my)) return [mx, my];
    for (let r = 1; r <= 5; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
      const x = mx + dx, y = my + dy; if (wk.set.has(x + ',' + y)) return [x, y];
    }
    return null;
  }
  function resetMeet(w) {
    w.state = 'paseando'; w.strollTimer = rng(2, 6); w.wait = rng(0.2, 0.8);
    w.meetWith = null; w.meetLead = false; w.speech = null; w.path = null; w.socialCd = rng(15, 35);
  }
  function abortMeet(w) {
    const o = walkers.find(x => x.id === w.meetWith);
    resetMeet(w);
    if (o && (o.state === 'avisado' || o.state === 'acudiendo' || o.state === 'llamando')) resetMeet(o);
  }
  function startHail(a, b) {
    a.state = 'llamando'; a.idleTimer = rng(1.5, 2.3); a.moving = false; a.path = null;
    a.speech = fillName(HacDialog.hail(), b.name);
    b.state = 'avisado'; b.idleTimer = 6; b.moving = false; b.path = null;     // espera a que el líder arranque
    b.speech = fillName(HacDialog.ack(), a.name);
    a.meetWith = b.id; b.meetWith = a.id; a.meetLead = true; b.meetLead = false;
    faceChat(a, b);
  }
  // Pasada la exclamación, ambos trazan ruta a un punto de encuentro intermedio.
  function beginApproach(lead) {
    const o = walkers.find(x => x.id === lead.meetWith);
    if (!o || o.state !== 'avisado') { abortMeet(lead); return; }
    const mx = Math.round((lead.fx + o.fx) / 2), my = Math.round((lead.fy + o.fy) / 2);
    const cell = findMeetCell(mx, my);
    let pa = null, pb = null;
    if (cell) {
      const goal = new Set([cell[0] + ',' + cell[1]]);
      pa = bfs([Math.round(lead.fx), Math.round(lead.fy)], goal);
      pb = bfs([Math.round(o.fx), Math.round(o.fy)], goal);
    }
    if (!cell || (pa === null && pb === null)) { abortMeet(lead); return; }
    lead.path = pa || []; o.path = pb || [];
    lead.state = o.state = 'acudiendo'; lead.moving = o.moving = false;
    lead.speech = o.speech = null; lead.meetTimer = 12;
  }
  // Avanza por la ruta de aproximación; al agotarla, se queda quieto esperando.
  function approachStep(w, dt, SPD) {
    if (!w.moving) {
      if (w.path && w.path.length) { const c = w.path.shift(); w.tx = c[0]; w.ty = c[1]; w.moving = true; }
      else return;
    }
    const dx = w.tx - w.fx, dy = w.ty - w.fy, d = Math.hypot(dx, dy), adv = SPD * dt;
    const fd = faceFromGrid(dx, dy); if (fd) w.dir = fd;
    if (d <= adv) { w.fx = w.tx; w.fy = w.ty; w.moving = false; w.phase += dt * 8; }
    else { w.fx += dx / d * adv; w.fy += dy / d * adv; w.phase += dt * 8; }
  }
  // Busca, con espaciado temporal (hailCd), un par a media distancia para que uno
  // llame al otro. No es habitual: tras una llamada, largo cooldown global.
  function hails(dt) {
    if (hailCd > 0) { hailCd -= dt; return; }
    for (let i = 0; i < walkers.length; i++) {
      const a = walkers[i]; if (a.state !== 'paseando' || a.socialCd > 0) continue;
      for (let j = i + 1; j < walkers.length; j++) {
        const b = walkers[j]; if (b.state !== 'paseando' || b.socialCd > 0) continue;
        const dx = a.fx - b.fx, dy = a.fy - b.fy, d2 = dx * dx + dy * dy;
        if (d2 < 9 || d2 > 64) continue;                 // entre ~3 y ~8 teselas: ni de cerca, ni lejísimos
        if (Math.random() < 0.5) { startHail(a, b); hailCd = rng(30, 70); return; }
      }
    }
    hailCd = rng(2, 5);                                   // nadie elegible/aceptó: reintenta pronto
  }

  function step(dt) {
    const SPD = 1.1;
    walkers.forEach(w => {
      if (w.gardenCd > 0) w.gardenCd -= dt;
      if (w.socialCd > 0) w.socialCd -= dt;
      switch (w.state) {
        case 'tarea': w.taskTimer -= dt; w.phase += dt * 1.2; if (w.taskTimer <= 0) startLeave(w); break;
        case 'yendo':
        case 'saliendo': followPath(w, dt, SPD); break;
        case 'a-descansar':
          approachStep(w, dt, SPD);
          if (!w.moving && !(w.path && w.path.length)) applyRest(w);
          break;
        case 'contemplando':
        case 'tumbado': w.idleTimer -= dt; w.phase += dt * 0.4; if (w.idleTimer <= 0) { w.state = 'paseando'; w.strollTimer = rng(2, 6); w.wait = rng(0.2, 0.8); } break;
        case 'charlando':
          w.idleTimer -= dt; w.phase += dt * 0.6;
          if (w.chatLead) { w.turnTimer -= dt; if (w.turnTimer <= 0) convoAdvance(w); }
          else if (w.idleTimer <= 0) endChat(w);                 // red de seguridad si el líder desaparece
          break;
        case 'llamando':
          w.idleTimer -= dt; w.phase += dt * 0.5;
          if (w.meetLead && w.idleTimer <= 0) beginApproach(w);
          break;
        case 'avisado':
          w.idleTimer -= dt; w.phase += dt * 0.5;
          if (w.idleTimer <= 0) abortMeet(w);                    // el líder nunca arrancó: vuelve a pasear
          break;
        case 'acudiendo': {
          approachStep(w, dt, SPD * 1.12);                       // con un poco de prisa por saludar
          if (!w.meetLead) break;
          const o = walkers.find(x => x.id === w.meetWith);
          if (!o || o.state !== 'acudiendo') { abortMeet(w); break; }
          w.meetTimer -= dt;
          const dx = w.fx - o.fx, dy = w.fy - o.fy, d2 = dx * dx + dy * dy;
          const bothStill = !w.moving && !o.moving && !(w.path && w.path.length) && !(o.path && o.path.length);
          if (d2 <= 2.3) { faceChat(w, o); startChat(w, o); }
          else if (bothStill || w.meetTimer <= 0) { if (d2 <= 9) { faceChat(w, o); startChat(w, o); } else abortMeet(w); }
          break;
        }
        default: wander(w, dt, SPD); break;
      }
    });
    encounters();
    hails(dt);
  }

  // ── Dibujo (coords LÓGICAS; el ctx ya está a escala SCALE) ────────────────
  function drawWalker(g, lx, ly, w, o) {
    o = o || {};
    // Glow del seleccionado (en coords lógicas, bajo los pies).
    if (o.highlight) {
      const r = 8 + Math.sin(w.phase * 0.5) * 1.4;
      g.fillStyle = 'rgba(255,224,130,0.22)'; g.beginPath(); g.ellipse(lx, ly, r, r * 0.5, 0, 0, 6.2832); g.fill();
      g.strokeStyle = 'rgba(255,224,130,0.95)'; g.lineWidth = 1.4; g.beginPath(); g.ellipse(lx, ly, r, r * 0.5, 0, 0, 6.2832); g.stroke();
    }
    const moving = w.moving && w.state !== 'tarea';
    const frame = moving ? (Math.floor(w.phase * 1.2) % HacChar.FRAMES) : 0;
    const pose = (w.state === 'tumbado') ? 'sit' : 'stand';
    const cv = window.HacChar ? spriteFor(w, w.dir || 'S', frame, pose) : null;
    const disp = SPRITE_DISP, FEET = HacChar ? HacChar.H - 5 : 51;
    if (cv) {
      // Blit en espacio de DISPOSITIVO (transform identidad) para que el pixel-art
      // quede nítido (igual que los sprites de edificio). Pies del sprite sobre (lx,ly).
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.imageSmoothingEnabled = false;
      const dx = Math.round(lx * SCALE - HacChar.W * 0.5 * disp);
      const dy = Math.round(ly * SCALE - FEET * disp);
      g.drawImage(cv, dx, dy, Math.round(HacChar.W * disp), Math.round(HacChar.H * disp));
      g.restore();
    }
    if (o.banner !== false) banner(g, lx, ly - Math.round(FEET * disp / SCALE) + 1, w, o.highlight);
  }

  // Rectángulo redondeado (coords lógicas).
  function rr(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  // Bocadillo de diálogo sobre la cabeza de un mecenas que habla. (lx,lyFeet) son
  // los pies en coords lógicas; el texto se ajusta en varias líneas si hace falta.
  function speechBubble(g, lx, lyFeet, text) {
    const disp = SPRITE_DISP, FEET = HacChar ? HacChar.H - 5 : 51;
    const headY = lyFeet - FEET * disp / SCALE;
    const baseY = headY - 18;                       // por encima del banner del nombre
    g.font = '600 7px "Noto Sans SC",sans-serif';
    const maxW = 94, padX = 5, padY = 4, lh = 8.6;
    const words = String(text || '').split(' '), lines = []; let cur = '';
    for (let i = 0; i < words.length; i++) {
      const t = cur ? cur + ' ' + words[i] : words[i];
      if (cur && g.measureText(t).width > maxW) { lines.push(cur); cur = words[i]; } else cur = t;
    }
    if (cur) lines.push(cur);
    let tw = 0; for (let i = 0; i < lines.length; i++) tw = Math.max(tw, g.measureText(lines[i]).width);
    const bw = tw + padX * 2, bh = lines.length * lh + padY * 2;
    const bx = lx - bw / 2, by = baseY - bh;
    g.fillStyle = 'rgba(247,239,219,0.98)';
    g.beginPath(); g.moveTo(lx - 3.5, by + bh - 0.5); g.lineTo(lx + 3.5, by + bh - 0.5); g.lineTo(lx, by + bh + 4.5); g.closePath(); g.fill();
    rr(g, bx, by, bw, bh, 3.5); g.fill();
    g.strokeStyle = '#6a4a28'; g.lineWidth = 1; g.stroke();
    g.fillStyle = '#2a2018'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < lines.length; i++) g.fillText(lines[i], lx, by + padY + lh * i + lh / 2);
  }

  function banner(g, cx, topY, w, hot) {
    const name = String(w.name || '').slice(0, 16);
    const pre = (w.cargoIcon ? w.cargoIcon + ' ' : '') + (w.aptIcon ? w.aptIcon + ' ' : '');
    const label = pre + name;
    g.font = '700 8px "Noto Serif SC","Noto Sans SC",sans-serif';
    const padX = 5, tw = g.measureText(label).width, bw = Math.max(16, tw + padX * 2), bh = 13;
    const bx = cx - bw / 2, by = topY - bh - 7;
    g.strokeStyle = '#6a4a28'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(cx, topY); g.lineTo(cx, by); g.stroke();
    g.fillStyle = hot ? '#b8331f' : '#9c2b1e';
    g.beginPath();
    g.moveTo(bx, by); g.lineTo(bx + bw, by); g.lineTo(bx + bw, by + bh);
    g.lineTo(cx + 2.4, by + bh); g.lineTo(cx, by + bh + 3); g.lineTo(cx - 2.4, by + bh); g.lineTo(bx, by + bh);
    g.closePath(); g.fill();
    g.strokeStyle = hot ? '#ffe082' : '#741c12'; g.lineWidth = 1; g.stroke();
    g.strokeStyle = '#d8b65a'; g.lineWidth = 1; g.strokeRect(bx + 1.3, by + 1.3, bw - 2.6, bh - 2.6);
    g.fillStyle = '#f6ecd6'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, cx, by + bh / 2 + 0.4);
  }

  // Banner 匾額 (placa horizontal) sobre un edificio ocupado. Devuelve el rect
  // LÓGICO para el hit-test. n = personas dentro.
  function buildingSign(g, lx, ly, label, n) {
    label = String(label || '').slice(0, 20);
    g.font = '700 8px "Noto Serif SC","Noto Sans SC",serif';
    const padX = 6, tw = g.measureText(label).width, bw = Math.max(26, tw + padX * 2 + 8), bh = 14;
    const bx = lx - bw / 2, by = ly - bh;
    g.fillStyle = 'rgba(26,18,10,0.95)';
    g.fillRect(bx, by, bw, bh);
    g.strokeStyle = '#d8b65a'; g.lineWidth = 1; g.strokeRect(bx + 0.6, by + 0.6, bw - 1.2, bh - 1.2);
    g.fillStyle = '#f0e2c2'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(label, bx + padX, by + bh / 2 + 0.3);
    // Badge con el nº de personas dentro.
    const bcx = bx + bw - 5, bcy = by + 4;
    g.fillStyle = '#b8331f'; g.beginPath(); g.arc(bcx, bcy, 4.4, 0, 6.2832); g.fill();
    g.strokeStyle = '#ffe082'; g.lineWidth = 0.8; g.stroke();
    g.fillStyle = '#fff'; g.font = '700 7px "Noto Sans SC",sans-serif'; g.textAlign = 'center';
    g.fillText(String(n), bcx, bcy + 0.4);
    // pico inferior (apunta al edificio)
    g.fillStyle = 'rgba(26,18,10,0.95)'; g.beginPath(); g.moveTo(lx - 3, by + bh); g.lineTo(lx + 3, by + bh); g.lineTo(lx, by + bh + 4); g.closePath(); g.fill();
    return [bx, by, bw, bh];
  }

  const memberName = (id) => names[id] || '—';

  function paint() {
    if (!window.HacIso || !HacIso.frame) return;
    // Agrupa quién está DENTRO de cada edificio (estado 'tarea').
    const inside = {};   // buildingId → [walker]
    walkers.forEach(w => { if (w.insideId) (inside[w.insideId] = inside[w.insideId] || []).push(w); });

    const actors = [], overlays = [], signs = [];
    const FEET = HacChar ? HacChar.H - 5 : 51, bannerDy = Math.round(FEET * SPRITE_DISP / SCALE) - 1;
    walkers.forEach(w => {
      if (w.id === selectedId) return;                 // el seleccionado va en overlay (encima)
      actors.push({ fx: w.fx, fy: w.fy, draw: (g, lx, ly) => drawWalker(g, lx, ly, w, { banner: false }) });
      // El nombre va en overlay (siempre encima, sin recorte de región).
      if (!w.insideId) overlays.push({ draw: (g) => { const p = logic(w.fx, w.fy); banner(g, p[0], p[1] - bannerDy, w, false); } });
    });

    // Banners 匾額 de los edificios ocupados (capa overlay) + rects para hit-test.
    Object.keys(inside).forEach(bid => {
      const b = wk.buildings.get(bid); if (!b) return;
      const people = inside[bid];
      // El banner rotula el EDIFICIO (quien entra puede no ser su dueño), no al
      // mecenas asignado.
      const label = b.nombre || 'Edificio';
      const [lx, lyBase] = logic(b.cx, b.cy);
      const ly = lyBase - b.altura - 12;
      overlays.push({ draw: (g) => { const r = buildingSign(g, lx, ly, label, people.length); signs.push({ lx: r[0], ly: r[1], w: r[2], h: r[3], label, names: people.map(p => p.name), ids: people.map(p => p.id), buildingId: bid }); } });
    });

    // Mecenas SELECCIONADO: siempre encima, resaltado (aunque esté dentro/detrás).
    const sel = walkers.find(w => w.id === selectedId);
    if (sel) overlays.push({ draw: (g) => drawWalker(g, logic(sel.fx, sel.fy)[0], logic(sel.fx, sel.fy)[1], sel, { highlight: true }) });

    // Bocadillos de las charlas: capa overlay, encima de todo y sin oclusión.
    walkers.forEach(w => {
      if (!w.speech) return;
      overlays.push({ draw: (g) => { const p = logic(w.fx, w.fy); speechBubble(g, p[0], p[1], w.speech); } });
    });

    iso._hacSigns = signs;
    HacIso.frame(iso, actors, overlays);
  }

  // Avisa a la página cuando cambia el "estado social" (quién hace qué, o el
  // seleccionado) para que refresque el listado lateral.
  function pushState() {
    const sig = selectedId + '|' + walkers.map(w => w.id + ':' + w.state + ':' + (w.insideId || w.goalBid || '')).join(',');
    if (sig !== stateSig) { stateSig = sig; if (opts && typeof opts.onState === 'function') opts.onState(); }
  }

  function tick(ts) {
    if (!running) return;
    const dt = Math.min(0.05, (ts - lastT) / 1000 || 0); lastT = ts;
    if (visible && onScreen) { step(dt); paint(); pushState(); }
    raf = requestAnimationFrame(tick);
  }

  function onVis() { visible = !document.hidden; lastT = 0; }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf); raf = null;
    document.removeEventListener('visibilitychange', onVis);
    if (io) { io.disconnect(); io = null; }
  }

  // Con motion reducido: pose ESTÁTICA. Los administradores aparecen DENTRO de
  // su edificio (banner), el resto repartido por la finca; sin animación.
  function staticPose() {
    walkers.forEach(w => {
      if (w.homeBid) { const b = wk.buildings.get(w.homeBid); if (b && b.spotCell) { w.state = 'tarea'; w.insideId = w.homeBid; w.fx = b.spotCell[0]; w.fy = b.spotCell[1]; } }
    });
  }

  function start(isoCanvas, o) {
    stop();
    iso = isoCanvas; opts = o || {}; selectedId = null; stateSig = '';
    if (!iso) return;
    // Asegura el catálogo de tareas en caché para cuando un mecenas entre.
    if (window.HacTareas && HacTareas.ready) HacTareas.ready();
    walkers = spawn(opts.mapa, opts.tier, opts.miembros, opts.color || '#c9a84c');
    if (!walkers.length) { iso._hacSigns = []; return; }
    if (reduced()) { staticPose(); paint(); pushState(); return; }
    running = true; lastT = 0; hailCd = rng(15, 40); visible = !document.hidden; onScreen = true;
    document.addEventListener('visibilitychange', onVis);
    if ('IntersectionObserver' in window) { io = new IntersectionObserver(es => { onScreen = es.some(e => e.isIntersecting); }, { threshold: 0 }); io.observe(iso); }
    raf = requestAnimationFrame(tick);
  }

  // ── API para la página ────────────────────────────────────────────────────
  // Texto de lo que está haciendo un mecenas ahora mismo.
  function activityText(w) {
    if (w.state === 'a-descansar') return 'Buscando un rincón de hierba';
    if (w.state === 'contemplando') return 'Contemplando el jardín';
    if (w.state === 'tumbado') return 'Descansando entre las plantas';
    if (w.state === 'charlando') { const o = walkers.find(x => x.id === w.chatWith); return 'Conversando' + (o && o.name ? ' con ' + o.name : ''); }
    if (w.state === 'llamando' || w.state === 'avisado' || w.state === 'acudiendo') {
      const o = walkers.find(x => x.id === w.meetWith);
      return (w.state === 'llamando' ? 'Llamando a ' : 'Yendo al encuentro de ') + (o && o.name ? o.name : 'otro mecenas');
    }
    if (w.state === 'tarea') {
      const b = wk.buildings.get(w.insideId);
      const lugar = b ? lugarDe(b.tipo) : null;
      // verbo de la tarea ELEGIDA (BD); si no hay, cae al catálogo cliente.
      const verbo = (w.task && w.task.verbo) || (b ? (tareaTipo(b.tipo) || {}).verbo : null);
      return (verbo && lugar) ? (verbo + ' ' + enLugar(lugar)) : ('En ' + (b ? b.nombre : 'el edificio'));
    }
    if (w.state === 'yendo') {
      const b = wk.buildings.get(w.goalBid), lugar = b ? lugarDe(b.tipo) : null;
      return 'De camino ' + (lugar ? aLugar(lugar) : 'a ' + (b ? b.nombre : 'un edificio'));
    }
    if (w.state === 'saliendo') return 'Saliendo a pasear';
    return 'Paseando por la finca';
  }
  function list() {
    return walkers.map(w => {
      const b = w.insideId && wk ? wk.buildings.get(w.insideId) : null;
      const inside = b ? (b.dueno ? memberName(b.dueno) : b.nombre) : null;
      return { id: w.id, name: w.name, color: w.color, inside, activity: activityText(w) };
    });
  }
  function select(id) { selectedId = id || null; if (!running) paint(); pushState(); }
  const selected = () => selectedId;
  function position(id) { const w = walkers.find(x => x.id === id); return w ? logic(w.fx, w.fy) : null; }

  return { start, stop, list, select, selected, position };
})();
if (typeof window !== 'undefined') window.HacFolk = HacFolk;
