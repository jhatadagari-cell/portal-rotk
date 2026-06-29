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
  let running = false, visible = true, onScreen = true, io = null;
  let selectedId = null, stateSig = '', hailCd = 20;

  // ── Determinismo / vida compartida (CONTINUA, con snapshots) ────────────────
  // La simulación es función de un STREAM sembrado (R) y de una hora COMPARTIDA
  // (HacClock). Línea de tiempo CONTINUA (sin re-arranques): el estado se persiste
  // en snapshots (HacSnap); quien entra carga la última foto y solo simula desde
  // t_snap hasta ahora. Así no hay saltos, sigue compartido y la carga es acotada.
  const SIM_DT = 1 / 30;                 // paso fijo del sim (30 Hz); el render va a 60
  const SIM_DT_MS = SIM_DT * 1000;
  const CATCHUP_CAP_MS = 20 * 60 * 1000; // si la foto (o el hueco) supera esto → génesis fresco
  const SAVE_EVERY_MS = 4 * 60 * 1000;   // cada cuánto reescribe el cliente la foto
  let R = HacRand.make('boot');          // stream actual de azar
  let seedKey = 'finca';                 // semilla estable de la finca (génesis)
  let haciendaId = null;                 // id para snapshots (null = sin persistencia, p.ej. onboarding)
  let simNowMs = 0;                       // reloj de la simulación (ms); avanza en pasos fijos
  let snapTimer = null;                   // setInterval de guardado
  let started = false;                    // génesis/restauración ya hechos

  // Campos DINÁMICOS de un walker que se serializan en el snapshot (lo demás —
  // identidad, modelo, hogar— se reconstruye al hacer spawn desde miembros/mapa).
  const SER_FIELDS = ['fx', 'fy', 'tx', 'ty', 'moving', 'dir', 'state', 'path', 'goalBid', 'insideId',
    'task', 'taskTimer', 'strollTimer', 'wait', 'idleTimer', 'gardenCd', 'socialCd',
    'chatWith', 'chatLead', 'chatRole', 'bowing', 'convo', 'convoIdx', 'turnTimer', 'speech',
    'meetWith', 'meetLead', 'meetTimer', 'restIntent', 'phase', 'onMission', 'missionTimer', 'missionEndMs', 'missionDoneFor', 'outTimer'];

  const { hexToRgb, reduced, neigh } = HacUtil;
  // rnd/rng ahora tiran del stream determinista R (no de Math.random), así que
  // todos los puntos de uso existentes quedan sincronizados sin más cambios.
  const rnd = (n) => R.int(n);
  const rng = (a, b) => R.range(a, b);

  // ── Misiones del jugador (agencia) ──────────────────────────────────────────
  // Órdenes COMPARTIDAS (Supabase) mapeadas miembroId → { startMs, endMs, targetBid }.
  // Se activan por TIMESTAMP (hora compartida): al activarse el mecenas hace el
  // saludo del puño y la mano (抱拳, pose bow) y luego ejecuta la tarea ~2 min.
  // La energía se DERIVA de esa línea de tiempo (v1 de pruebas: no bloquea).
  let orders = {};
  const SALUTE_SEC = 1.6;
  // Hora de simulación (ms) del estado actual — base de las misiones.
  // (La energía es un recurso del jugador independiente del sim → HacEnergia.)
  function nowSimMs() { return simNowMs; }
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
    const gates = [];   // portones (院門): hojas animadas al pasar un mecenas
    lista.forEach(c => {
      const cells = (B && B.celdasOcupadas) ? B.celdasOcupadas(c) : [[c.pos[0], c.pos[1]]];
      if (c.dueno) { (ownByMember[c.dueno] = ownByMember[c.dueno] || []).push.apply(ownByMember[c.dueno], cells.map(p => p[0] + ',' + p[1])); }
      // Portón: lo dibuja hac-iso como sprite por rotación (sin hojas, solo el vano);
      // aquí guardamos su celda y orientación para animar las hojas. orient 'x' =
      // muro a lo largo de x (puerta en la cara +y); 'y' = a lo largo de y (+x).
      if (c.tipo === 'porton') gates.push({ gx: c.pos[0], gy: c.pos[1], orient: (((c.rot || 0) % 2) === 0) ? 'x' : 'y', open: 0 });
      const cat = (B && B.categoriaDe) ? B.categoriaDe(c.tipo) : 'edificio';
      if (cat === 'edificio') {
        const id = c.pos[0] + ',' + c.pos[1], def = (B && B.tipo(c.tipo)) || {};
        let sx = 0, sy = 0; cells.forEach(p => { sx += p[0]; sy += p[1]; });
        const cx = Math.round(sx / cells.length), cy = Math.round(sy / cells.length);
        buildings.set(id, { id, tipo: c.tipo, cx, cy, cells, altura: def.altura || 24, dueno: c.dueno || null, nombre: def.nombre || 'Edificio', dominio: def.dominio || null, restringido: !!def.restringido });
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
    // Portón PERIMETRAL (muralla): hac-iso exporta su geometría → hojas GRANDES
    // animadas que se abren HACIA AFUERA (+y) cuando un mecenas cruza. (Las hojas
    // cerradas las hornea hac-iso; aquí solo se animan al abrirse.)
    if (iso && iso._hacGates) iso._hacGates.forEach(d => gates.push({
      gx: d.gc, gy: d.yFace, orient: d.orient || 'x', open: 0, perimeter: true,
      hw: d.hw || 0.56, zTop: d.zTop || 14, faceOff: 0, swing: d.swing || 1, r2: 2.6 * 2.6,
    }));
    // Celdas transitables (no bloqueadas y dentro de la rejilla).
    const set = new Set(), cells = [], camCells = [];
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const k = x + ',' + y;
      if (!blocked.has(k)) { set.add(k); cells.push([x, y]); if (cam.has(k)) camCells.push([x, y]); }
    }
    // Puerta de cada edificio: celda interior (spot) + vecino transitable (approach).
    // Elegimos la puerta en la CARA DELANTERA (la que mira al espectador: en iso, la
    // de mayor gx+gy) y CENTRADA en esa cara (no en una esquina), con leve preferencia
    // por un camino. Así el mecenas entra "por la puerta" y no da un rodeo a una
    // esquina trasera. Sin aproximación accesible → no es "visitable".
    const visitable = [];
    buildings.forEach(b => {
      let best = null, bestScore = -Infinity;
      b.cells.forEach(p => {
        neigh(p[0], p[1]).forEach(n => {
          if (!set.has(n[0] + ',' + n[1])) return;                 // vecino transitable
          const frente = n[0] + n[1];                              // ∝ Y en pantalla: + = más al frente
          const dCentro = Math.abs(n[0] - b.cx) + Math.abs(n[1] - b.cy);   // centrado en la cara
          const score = frente - 2 * dCentro + (cam.has(n[0] + ',' + n[1]) ? 1 : 0);
          if (score > bestScore) { bestScore = score; best = { spot: p, app: n }; }
        });
      });
      if (best) { b.spotCell = best.spot; b.approach = best.app; b.approachKey = best.app[0] + ',' + best.app[1]; b.visitable = true; visitable.push(b); }
    });
    // Lista de celdas de césped PISABLE (para que los mecenas que pasean cerca
    // decidan acercarse a descansar en la hierba).
    const gardenCells = [];
    garden.forEach(k => { if (set.has(k)) { const p = k.split(',').map(Number); gardenCells.push(p); } });
    // Celda de SALIDA hacia el exterior (expediciones): la transitable en el EJE del
    // portón sur (午門, columna central gateC) y lo más al FRENTE posible (mayor y) →
    // así el mecenas sale justo por la puerta de la muralla, no por una esquina.
    let exitCell = null, bestE = -Infinity; const gateC = Math.floor((GW - 1) / 2);
    cells.forEach(([x, y]) => { const sc = y * 100 - Math.abs(x - gateC) * 1000; if (sc > bestE) { bestE = sc; exitCell = [x, y]; } });
    // Waypoints EXTERIORES en el eje del portón (fuera de la muralla): el mecenas
    // camina por el campo hasta perderse / aparece allí al volver.
    const outNear = exitCell ? [exitCell[0], exitCell[1] + 2.3] : null;   // justo fuera del vano
    const outFar = exitCell ? [exitCell[0], exitCell[1] + 4.8] : null;    // lejos, donde se oculta/aparece
    return { set, cells, cam, camCells, garden, gardenCells, water, GW, GH, ownByMember, buildings, visitable, gates, exitCell, exitKey: exitCell ? exitCell[0] + ',' + exitCell[1] : null, outNear, outFar };
  }

  // Ruta de `start` a la primera celda de `goalKeys` sobre celdas transitables,
  // PREFIRIENDO los CAMINOS: pisar fuera de camino cuesta más, así los mecenas
  // siguen las sendas al ir a trabajar (salvo que el rodeo sea desproporcionado).
  // Dijkstra por cubos (costes enteros pequeños) — rápido y determinista.
  const W_CAMINO = 1, W_FUERA = 3;   // coste por paso (en/ fuera de camino)
  function bfs(start, goalKeys) {
    const sk = start[0] + ',' + start[1];
    if (goalKeys.has(sk)) return [];
    const dist = new Map([[sk, 0]]);
    const prev = new Map([[sk, null]]);
    const buckets = []; (buckets[0] = []).push(start);
    let d = 0;
    while (true) {
      while (d < buckets.length && (!buckets[d] || !buckets[d].length)) d++;
      if (d >= buckets.length) break;
      const cur = buckets[d].pop();
      const ck = cur[0] + ',' + cur[1];
      if (d > (dist.has(ck) ? dist.get(ck) : Infinity)) continue;   // entrada obsoleta
      if (goalKeys.has(ck)) {
        const path = []; let p = cur;
        while (p) { path.push(p); p = prev.get(p[0] + ',' + p[1]); }
        path.reverse(); path.shift();   // quita la celda de inicio
        return path;
      }
      const ns = neigh(cur[0], cur[1]);
      for (let i = 0; i < ns.length; i++) {
        const nx = ns[i][0], ny = ns[i][1], k = nx + ',' + ny;
        if (!wk.set.has(k)) continue;
        const nd = d + (wk.cam.has(k) ? W_CAMINO : W_FUERA);
        if (nd < (dist.has(k) ? dist.get(k) : Infinity)) {
          dist.set(k, nd); prev.set(k, cur);
          (buckets[nd] = buckets[nd] || []).push([nx, ny]);
        }
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
      if (!start) start = (wk.camCells.length && R.next() < 0.7) ? wk.camCells[rnd(wk.camCells.length)] : wk.cells[rnd(wk.cells.length)];
      // Modelo del mecenas: aptitud/aspecto de su personaje registrado. Si no
      // tiene personaje vinculado, modelo por defecto con el color de la casa.
      const pj = (m.personajeId && window.HacPersonajes && HacPersonajes.get) ? HacPersonajes.get(m.personajeId) : null;
      const aptitud = pj ? pj.aptitud : '';
      const aspecto = pj ? (pj.aspecto || {}) : { robe: color };
      const cargo = (window.HacCalc && HacCalc.rangoDePuntos) ? HacCalc.rangoDePuntos(Number(m.puntos) || 0, tier) : null;
      const rankIdx = (window.HacCalc && HacCalc.rangoIndex) ? HacCalc.rangoIndex(Number(m.puntos) || 0, tier) : -1;
      const aptDef = (aptitud && window.HacPersonajeDefs) ? HacPersonajeDefs.aptitud(aptitud) : null;
      return {
        // id del walker = id del PERSONAJE (clave estable para órdenes/energía/
        // competencias y verificable en RLS). Fallback al id de miembro si no hay
        // personaje vinculado (mecenas sin cuenta, no controlable por un jugador).
        id: m.personajeId || m.id, name: m.nombre || '', color, aptitud, aspecto,
        cargoIcon: cargo ? (cargo.icon || '') : '', cargoNombre: cargo ? cargo.nombre : '', cargoTier: cargo ? (cargo.tier || 1) : 0, rankIdx,
        aptIcon: aptDef ? (aptDef.icon || '') : '', dominios: aptDef ? (aptDef.dominios || []) : [],
        fx: start[0], fy: start[1], tx: start[0], ty: start[1], moving: false, dir: 'S',
        state: 'paseando', path: null, goalBid: null, insideId: null, task: null,
        homeBid, home, taskTimer: 0, strollTimer: rng(2, 6), wait: R.next() * 1.2,
        idleTimer: 0, gardenCd: rng(4, 12), socialCd: rng(4, 12), chatWith: null,
        chatLead: false, chatRole: null, bowing: false, convo: null, convoIdx: 0, turnTimer: 0, speech: null,
        meetWith: null, meetLead: false, meetTimer: 0, restIntent: null,
        phase: R.next() * 6.28,
        // Misión del jugador (estado compartido); null = comportamiento ambiente.
        order: orders[m.id] || null, onMission: false, missionTimer: 0, missionEndMs: 0, missionTask: null, missionDoneFor: null
      };
    });
  }

  // Elige un edificio a visitar, sesgado por el DOMINIO del mecenas (militar va
  // a edificios militares, etc.) y por su cargo (los altos frecuentan los salones
  // administrativos/nobles). Con frecuencia, el propio.
  // Edificios de CLASE (restringido): solo entra quien DOMINA su dominio.
  function puedeEntrar(w, b) { return !b.restringido || (b.dominio && (w.dominios || []).indexOf(b.dominio) >= 0); }
  function chooseBuilding(w) {
    if (!wk.visitable.length) return null;
    if (w.homeBid && R.next() < 0.5) { const b = wk.buildings.get(w.homeBid); if (b && b.visitable && puedeEntrar(w, b)) return b; }
    const doms = w.dominios || [], noble = (w.cargoTier || 0) >= 2;
    const weighted = [], libres = [];
    wk.visitable.forEach(b => {
      if (!puedeEntrar(w, b)) return;            // bloqueo duro: no apto → no entra
      libres.push(b);
      let wt = 1;
      if (b.dominio && doms.indexOf(b.dominio) >= 0) wt += 4;
      if (noble && b.dominio === 'administrativo') wt += 2;
      for (let i = 0; i < wt; i++) weighted.push(b);
    });
    return weighted.length ? weighted[rnd(weighted.length)] : (libres.length ? libres[rnd(libres.length)] : null);
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

  // "IR A CASA" (local, no compartido): el jugador manda a SU mecenas a una casa
  // concreta (buildingId = "gx,gy"); al llegar entra y dispara onArrive (abrir el
  // panel de gestiones). Devuelve 'walking' si echó a andar, 'now' si abre ya (sin
  // ruta / ya está), false si está ocupado (misión/expedición). Cosmético: el
  // campo `errand` no se serializa, así que un snapshot lo descarta sin problema.
  function goHome(id, buildingId, onArrive) {
    const w = walkers.find(x => x.id === id); if (!w || !wk) return false;
    if (w.onMission || ['exped-out', 'exped-in', 'fuera', 'saludo'].indexOf(w.state) >= 0) return false;
    const b = buildingId ? wk.buildings.get(buildingId) : null;
    const callNow = () => { if (onArrive) try { onArrive(); } catch (e) {} };
    if (!b || !b.approachKey) { callNow(); return 'now'; }
    const path = bfs([Math.round(w.fx), Math.round(w.fy)], new Set([b.approachKey]));
    if (!path) { callNow(); return 'now'; }
    path.push(b.spotCell);
    w.insideId = null; w.speech = null; w.chatWith = null; w.meetWith = null;   // corta lo que esté haciendo
    w.path = path; w.state = 'yendo'; w.goalBid = b.id; w.errand = 'home'; w._homeCb = onArrive; w.moving = false;
    return 'walking';
  }

  // Visita FORZADA por una misión: la orden lleva una TAREA (taskId); vamos al
  // edificio de SU tipo MÁS CERCANO al mecenas (determinista). Si no hay, deambula.
  function startMissionVisit(w) {
    const o = w.order;
    const task = (o && o.taskId && window.HacTareas && HacTareas.get) ? HacTareas.get(o.taskId) : null;
    const tipo = task ? task.tipo : (o && o.targetTipo) || null;
    w.missionTask = task;   // para ejecutar SU tarea (su verbo/duración), no una al azar
    let b = null, bestD = Infinity;
    if (tipo) wk.visitable.forEach(x => { if (x.tipo === tipo) { const dx = x.cx - w.fx, dy = x.cy - w.fy, d = dx * dx + dy * dy; if (d < bestD) { bestD = d; b = x; } } });
    if (!b) { w.state = 'paseando'; w.strollTimer = rng(2, 6); return; }
    const path = bfs([Math.round(w.fx), Math.round(w.fy)], new Set([b.approachKey]));
    if (!path) { w.state = 'paseando'; w.strollTimer = rng(2, 6); return; }
    path.push(b.spotCell);
    w.path = path; w.state = 'yendo'; w.goalBid = b.id; w.moving = false;
  }

  // EXPEDICIÓN (misión FUERA): camina al portón sur y SIGUE hacia el exterior
  // (waypoints fuera de la muralla) hasta perderse de vista; luego se oculta.
  function startExpedition(w) {
    const e = wk.exitCell;
    if (!e) { endMission(w); return; }
    const path = bfs([Math.round(w.fx), Math.round(w.fy)], new Set([wk.exitKey]));
    if (!path) { endMission(w); return; }
    if (wk.outNear) path.push(wk.outNear);
    if (wk.outFar) path.push(wk.outFar);                              // cruza el vano y se aleja por el campo
    w.path = path; w.state = 'exped-out'; w.goalBid = null; w.insideId = null; w.task = null; w.moving = false;
  }
  // Vuelve: APARECE en el exterior (lejos), camina hacia la puerta y ENTRA.
  function startReturn(w) {
    const e = wk.exitCell || [Math.round(w.fx), Math.round(w.fy)];
    const far = wk.outFar || e;
    w.fx = far[0]; w.fy = far[1]; w.tx = far[0]; w.ty = far[1];        // reaparece FUERA, a lo lejos
    const goal = (wk.camCells.length && R.next() < 0.7) ? wk.camCells[rnd(wk.camCells.length)] : wk.cells[rnd(wk.cells.length)];
    const inside = bfs(e, new Set([goal[0] + ',' + goal[1]])) || [e];
    const path = [];
    if (wk.outNear) path.push(wk.outNear);                            // se acerca al portón desde fuera
    path.push(e);                                                     // cruza el vano
    path.push.apply(path, inside);                                    // y entra a la finca
    w.path = path; w.state = 'exped-in'; w.moving = false;
  }
  // Sale del edificio: a la celda de aproximación y luego a un punto de paseo.
  function startLeave(w) {
    const b = wk.buildings.get(w.insideId);
    w.insideId = null; w.goalBid = null; w.task = null;
    if (!b) { w.state = 'paseando'; w.strollTimer = rng(2, 6); return; }
    const goal = (wk.camCells.length && R.next() < 0.8) ? wk.camCells[rnd(wk.camCells.length)] : wk.cells[rnd(wk.cells.length)];
    const out = bfs(b.approach, new Set([goal[0] + ',' + goal[1]])) || [];
    w.path = [b.approach].concat(out); w.state = 'saliendo'; w.moving = false;
  }

  function onPathDone(w) {
    if (w.state === 'yendo' && w.errand === 'home') {
      // Llegó a su casa: entra, "descansa" un rato y abre el panel de gestiones.
      w.errand = null; w.state = 'tarea'; w.insideId = w.goalBid; w.phase = R.next() * 6.28;
      w.task = { verbo: 'Descansando', lugar: 'su casa' }; w.taskTimer = 18; w.path = null;
      const cb = w._homeCb; w._homeCb = null; if (cb) try { cb(); } catch (e) {}
      return;
    }
    if (w.state === 'yendo') {
      w.state = 'tarea'; w.insideId = w.goalBid; w.phase = R.next() * 6.28;
      // Elige una tarea del edificio (varias por tipo) y su duración configurada;
      // jitter ±15% para que no entren/salgan todos en lockstep.
      const b = wk.buildings.get(w.goalBid);
      // Elección DETERMINISTA (no HacTareas.pick, que usa Math.random): mismo
      // catálogo + mismo stream → misma tarea para todos.
      const ls = (b && window.HacTareas && HacTareas.byTipo) ? (HacTareas.byTipo(b.tipo) || []) : [];
      let task = ls.length ? ls[R.int(ls.length)] : null;   // consume R igual (con o sin misión)
      if (w.onMission && w.missionTask) task = w.missionTask;  // misión: SU tarea, no al azar
      w.task = task;
      w.taskTimer = (task ? task.duracionSeg : 30) * (0.85 + R.next() * 0.3);
      // En misión, la TAREA dura su duración COMPLETA contada DESDE QUE LLEGA aquí
      // (no desde que se mandó): así el countdown empieza al iniciar la tarea.
      if (w.onMission) w.taskTimer = (w.order && w.order.durMs) ? w.order.durMs / 1000 : (task ? task.duracionSeg : 60);
    } else if (w.state === 'exped-out') {
      // Llegó al portón → "sale del mapa" (oculto) hasta que se cumpla la duración
      // de la misión contada desde su inicio (el resto lo pasa fuera).
      w.moving = false; w.path = null; w.state = 'fuera';
      const o = w.order, t = nowSimMs(), endOut = o ? o.startMs + (o.durMs || 120000) : t;
      w.outTimer = Math.max(2, (endOut - t) / 1000);
    } else if (w.state === 'exped-in') {
      endMission(w);   // de vuelta dentro de la finca → misión cumplida
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
    const dx = w.tx - w.fx, dy = w.ty - w.fy, d = Math.sqrt(dx * dx + dy * dy), adv = SPD * dt;
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
      const dx = w.tx - w.fx, dy = w.ty - w.fy, d = Math.sqrt(dx * dx + dy * dy), adv = SPD * dt;
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
    if (R.next() >= 0.35) { w.gardenCd = rng(6, 14); return false; }   // pasa cerca pero esta vez sigue su camino
    const path = bfs([cx, cy], new Set([best[0] + ',' + best[1]]));
    if (!path || !path.length) { w.gardenCd = rng(6, 14); return false; }
    w.path = path; w.moving = false;
    w.restIntent = (R.next() < 0.6) ? 'tumbado' : 'contemplando';      // la mayoría se tumba en la hierba
    w.state = 'a-descansar';
    return true;
  }
  // Llegado al césped, adopta la pose de descanso elegida.
  function applyRest(w) {
    const cx = Math.round(w.fx), cy = Math.round(w.fy);
    if (w.restIntent === 'contemplando') { w.state = 'contemplando'; w.idleTimer = rng(6, 12); w.gardenCd = rng(25, 50); faceTowards(w, cx, cy, wk.garden); }
    else { w.state = 'tumbado'; w.idleTimer = rng(35, 70); w.gardenCd = rng(45, 85); }
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
    const r = R.next();
    if (onGarden) {
      if (r < 0.40) { w.state = 'contemplando'; w.idleTimer = rng(5, 11); w.gardenCd = rng(25, 50); faceTowards(w, cx, cy, wk.garden); }
      else if (r < 0.68) { w.state = 'tumbado'; w.idleTimer = rng(30, 60); w.gardenCd = rng(40, 80); }   // se sienta a descansar (solo sobre plantas)
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
  // Salto de cargo a partir del cual la charla deja de ser entre iguales y pasa
  // a una DIRECTIVA (orden/consejo/reprimenda) del superior al inferior.
  const RANK_GAP = 3;

  function startChat(a, b) {
    a.meetWith = b.meetWith = null; a.meetLead = b.meetLead = false;    // por si venían de una llamada a distancia
    a.state = b.state = 'charlando'; a.idleTimer = b.idleTimer = 60;   // tope de seguridad; el guion marca el fin
    a.moving = b.moving = false; a.path = b.path = null;
    a.speech = b.speech = null;
    // ¿Hay un salto de rango notable? Entonces manda el de cargo superior: en
    // lugar de charlar de igual a igual le suelta una directiva según SU aptitud,
    // y el inferior responde con deferencia, inclinándose en señal de respeto (揖).
    const ra = (a.rankIdx == null ? -1 : a.rankIdx), rb = (b.rankIdx == null ? -1 : b.rankIdx);
    const directive = (ra >= 0 && rb >= 0 && Math.abs(ra - rb) >= RANK_GAP);
    const lead = directive ? (ra >= rb ? a : b) : a;
    const follow = (lead === a) ? b : a;
    lead.chatWith = follow.id; follow.chatWith = lead.id;
    lead.chatLead = true; follow.chatLead = false;
    lead.chatRole = directive ? 'mentor' : null; follow.chatRole = directive ? 'pupil' : null;
    lead.bowing = false; follow.bowing = directive;
    lead.convo = directive ? HacDialog.directiva(lead.aptitud) : HacDialog.charla(lead.aptitud);
    lead.convoIdx = -1; follow.convo = null;
    faceChat(lead, follow);
    convoAdvance(lead);                                                // arranca el primer turno
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
    w.chatWith = null; w.chatLead = false; w.chatRole = null; w.bowing = false; w.convo = null; w.speech = null; w.socialCd = rng(20, 50);
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
        if (R.next() < 0.5) startChat(a, b);
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
    const dx = w.tx - w.fx, dy = w.ty - w.fy, d = Math.sqrt(dx * dx + dy * dy), adv = SPD * dt;
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
        if (R.next() < 0.5) { startHail(a, b); hailCd = rng(30, 70); return; }
      }
    }
    hailCd = rng(2, 5);                                   // nadie elegible/aceptó: reintenta pronto
  }

  const MISSION_GRACE_MS = 90 * 1000;   // margen (saludo + viaje) sobre la duración de la tarea

  function endMission(w) {
    if (w.order) w.missionDoneFor = w.order.startMs;   // marca ESTA orden como cumplida (no re-activar)
    w.onMission = false; w.bowing = false; w.missionTask = null;
    if (w.insideId) startLeave(w);
    else { w.state = 'paseando'; w.strollTimer = rng(2, 6); w.path = null; w.moving = false; }
  }
  // Activa la MISIÓN del jugador en su ventana (timestamp compartido). La TAREA en
  // sí dura desde que LLEGA (ver onPathDone); aquí solo arrancamos (saludo) y damos
  // un tope de seguridad por si el viaje se atasca. Termina al completar la tarea.
  function missionGate(w) {
    const o = w.order;
    if (!o) { if (w.onMission) endMission(w); return; }   // orden retirada → al ambiente
    const t = nowSimMs(), dur = o.durMs || 60000, winEnd = o.startMs + dur + MISSION_GRACE_MS;
    if (t >= o.startMs && t < winEnd && !w.onMission && w.missionDoneFor !== o.startMs) {
      if (w.chatWith) endChat(w);
      if (w.meetWith) abortMeet(w);
      w.onMission = true; w.moving = false; w.speech = null; w.dir = 'S'; w.path = null;
      const elapsed = t - o.startMs;
      if (o.tipo === 'expedicion') {
        // Reanudación por FASE según el tiempo transcurrido (p.ej. tras recargar):
        // ya fuera, o ya de vuelta, en vez de re-hacer la salida desde casa.
        if (elapsed >= dur) { startReturn(w); }                                  // debería estar volviendo → aparece fuera y entra
        else if (elapsed >= SALUTE_SEC * 1000) { w.state = 'fuera'; w.outTimer = Math.max(2, (o.startMs + dur - t) / 1000); }   // ya fuera (oculto)
        else { w.state = 'saludo'; w.bowing = true; w.missionTimer = SALUTE_SEC - elapsed / 1000; }   // saludo (lo que quede)
      } else {
        w.state = 'saludo'; w.bowing = true; w.missionTimer = SALUTE_SEC;
      }
    } else if (w.onMission && t >= winEnd) {
      endMission(w);   // seguridad: no debería colgarse más allá del tope
    }
  }

  function step(dt) {
    const SPD = 1.1;
    walkers.forEach(w => {
      if (w.gardenCd > 0) w.gardenCd -= dt;
      if (w.socialCd > 0) w.socialCd -= dt;
      missionGate(w);
      switch (w.state) {
        case 'saludo': w.phase += dt * 0.5; w.missionTimer -= dt; if (w.missionTimer <= 0) { w.bowing = false; (w.order && w.order.tipo === 'expedicion') ? startExpedition(w) : startMissionVisit(w); } break;
        case 'exped-out':
        case 'exped-in': followPath(w, dt, SPD); break;
        case 'fuera': w.outTimer -= dt; if (w.outTimer <= 0) startReturn(w); break;
        case 'tarea': w.taskTimer -= dt; w.phase += dt * 1.2; if (w.taskTimer <= 0) { if (w.onMission) endMission(w); else startLeave(w); } break;
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
    stepGates(dt);
  }

  // Apertura/cierre de los portones: se abre si hay un mecenas cerca de la celda
  // del portón; se cierra solo cuando no queda nadie. Easing suave.
  function stepGates(dt) {
    if (!wk || !wk.gates || !wk.gates.length) return;
    const R2 = 1.55 * 1.55;   // ~1.5 celdas alrededor del portón
    for (let k = 0; k < wk.gates.length; k++) {
      const gate = wk.gates[k];
      let near = false;
      const r2 = gate.r2 || R2;
      for (let i = 0; i < walkers.length; i++) {
        const w2 = walkers[i];
        // El portón PERIMETRAL solo se abre para quien CRUZA (sale/entra de expedición),
        // no para los que pasean cerca del frente del patio.
        if (gate.perimeter && w2.state !== 'exped-out' && w2.state !== 'exped-in') continue;
        const dx = w2.fx - gate.gx, dy = w2.fy - gate.gy;
        if (dx * dx + dy * dy <= r2) { near = true; break; }
      }
      const target = near ? 1 : 0;
      const sp = (target > gate.open ? 4.5 : 2.6) * dt;   // abre más rápido de lo que cierra
      gate.open = target > gate.open ? Math.min(target, gate.open + sp) : Math.max(target, gate.open - sp);
    }
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
    const pose = (w.state === 'tumbado') ? 'sit' : (w.bowing ? 'bow' : 'stand');
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

  // ── Ornamentación del banner del nombre por RANGO (cargoTier 0..6) ──────────
  // A mayor rango, más adorno chino, para distinguir al de más peso de un vistazo:
  // color más noble, doble filo dorado, tachones, remate del asta, borlas (流蘇),
  // cola de golondrina (燕尾) y, en lo más alto, cuenta de jade y aura.
  const RANK_STYLE = [
    { bg: ['#6f5836', '#574226'], edge: '#2f2410', gold: '#a98c52', txt: '#f1e7ce', dbl: false, studs: false, finial: 'none',  tassel: 0, tail: 'point',   glow: false },
    { bg: ['#b8331f', '#8f1d11'], edge: '#6c190f', gold: '#d8b65a', txt: '#f6ecd6', dbl: false, studs: false, finial: 'knob',  tassel: 0, tail: 'point',   glow: false },
    { bg: ['#c0341f', '#982313'], edge: '#71170d', gold: '#e2c061', txt: '#f6ecd6', dbl: true,  studs: false, finial: 'knob',  tassel: 0, tail: 'point',   glow: false },
    { bg: ['#cb3c1c', '#a02713'], edge: '#71170d', gold: '#edca62', txt: '#fbf1d6', dbl: true,  studs: true,  finial: 'lotus', tassel: 1, tail: 'point',   glow: false },
    { bg: ['#c23218', '#911f0e'], edge: '#6a150c', gold: '#f2d479', txt: '#fcf3d8', dbl: true,  studs: true,  finial: 'spear', tassel: 1, tail: 'point',   glow: false },
    { bg: ['#caa42c', '#a07f1c'], edge: '#6e4f12', gold: '#fce7a0', txt: '#5a1408', dbl: true,  studs: true,  finial: 'spear', tassel: 2, tail: 'swallow', glow: true  },
    { bg: ['#6a2c93', '#48196a'], edge: '#2f0f4a', gold: '#fadf86', txt: '#fbeecf', dbl: true,  studs: true,  finial: 'jade',  tassel: 2, tail: 'swallow', glow: true  },
  ];
  // Remate del asta, por encima del banner (en y = top del banner).
  function bannerFinial(g, cx, y, kind, gold) {
    if (kind === 'none') return;
    g.strokeStyle = gold; g.lineWidth = 1; g.beginPath(); g.moveTo(cx, y); g.lineTo(cx, y - 2); g.stroke();
    g.fillStyle = gold;
    if (kind === 'knob') { g.beginPath(); g.arc(cx, y - 3.4, 1.7, 0, 6.2832); g.fill(); }
    else if (kind === 'lotus') { g.beginPath(); g.moveTo(cx, y - 6); g.lineTo(cx + 2.4, y - 3.2); g.lineTo(cx, y - 2.2); g.lineTo(cx - 2.4, y - 3.2); g.closePath(); g.fill(); }
    else if (kind === 'spear') { g.beginPath(); g.moveTo(cx, y - 7); g.lineTo(cx + 2, y - 2.6); g.lineTo(cx - 2, y - 2.6); g.closePath(); g.fill(); }
    else if (kind === 'jade') {
      g.beginPath(); g.arc(cx, y - 3.4, 1.6, 0, 6.2832); g.fill();                              // base dorada
      g.fillStyle = '#7fc9a0'; g.beginPath(); g.arc(cx, y - 6, 1.9, 0, 6.2832); g.fill();        // cuenta de jade
      g.fillStyle = '#bfe9d2'; g.beginPath(); g.arc(cx - 0.6, y - 6.6, 0.6, 0, 6.2832); g.fill(); // brillo
      g.strokeStyle = gold; g.lineWidth = 0.7;
      g.beginPath(); g.moveTo(cx - 3, y - 6.4); g.lineTo(cx - 1.7, y - 5.4); g.moveTo(cx + 3, y - 6.4); g.lineTo(cx + 1.7, y - 5.4); g.stroke();  // llamitas
    }
  }
  // Borla colgante 流蘇 desde una esquina inferior del banner.
  function bannerTassel(g, x, yTop, gold, long) {
    const len = long ? 6 : 4;
    g.strokeStyle = gold; g.lineWidth = 1; g.beginPath(); g.moveTo(x, yTop); g.lineTo(x, yTop + 2); g.stroke();
    g.fillStyle = gold; g.beginPath(); g.arc(x, yTop + 2.4, 1.2, 0, 6.2832); g.fill();           // cuenta
    g.lineWidth = 0.7; g.beginPath();
    g.moveTo(x - 1.3, yTop + 3.4); g.lineTo(x - 1.3, yTop + len + 2);
    g.moveTo(x, yTop + 3.6); g.lineTo(x, yTop + len + 2.6);
    g.moveTo(x + 1.3, yTop + 3.4); g.lineTo(x + 1.3, yTop + len + 2); g.stroke();                 // flecos
  }

  // El banner del nombre se PINTA UNA VEZ a un canvas cacheado por (label,rango,
  // selección) y luego solo se BLITEA cada frame. Antes se redibujaba entero por
  // mecenas y por frame (con createLinearGradient incluido), lo que hundía los FPS.
  const bannerCache = new Map();
  let bannerMeasure = null;
  function bannerKey(w, hot) {
    const pre = (w.cargoIcon ? w.cargoIcon + ' ' : '') + (w.aptIcon ? w.aptIcon + ' ' : '');
    return pre + String(w.name || '').slice(0, 16) + '|' + (Number(w.cargoTier) || 0) + '|' + (hot ? 1 : 0);
  }
  function bannerSprite(w, hot) {
    const key = bannerKey(w, hot);
    let s = bannerCache.get(key);
    if (s) return s;
    const pre = (w.cargoIcon ? w.cargoIcon + ' ' : '') + (w.aptIcon ? w.aptIcon + ' ' : '');
    const label = pre + String(w.name || '').slice(0, 16);
    const lvl = Math.max(0, Math.min(6, Number(w.cargoTier) || 0));
    if (!bannerMeasure) bannerMeasure = document.createElement('canvas').getContext('2d');
    bannerMeasure.font = '700 8px "Noto Serif SC","Noto Sans SC",sans-serif';
    const padX = 5 + (lvl >= 5 ? 2 : 0), tw = bannerMeasure.measureText(label).width;
    const bw = Math.max(16, tw + padX * 2), bh = 13;
    const Wd = bw + 12, Hd = bh + 22, ax = bw / 2 + 6, ay = bh + 16;   // ay = punto de anclaje (base del asta)
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(Wd * SCALE); cv.height = Math.ceil(Hd * SCALE);
    const g = cv.getContext('2d'); g.scale(SCALE, SCALE);
    paintBannerInto(g, ax, ay, w, hot);
    s = { cv, ax, ay };
    bannerCache.set(key, s);
    return s;
  }
  // Blit del banner cacheado: su base de asta cae sobre (cx, topY).
  function banner(g, cx, topY, w, hot) {
    const s = bannerSprite(w, hot);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = true;
    g.drawImage(s.cv, Math.round((cx - s.ax) * SCALE), Math.round((topY - s.ay) * SCALE), s.cv.width, s.cv.height);
    g.restore();
  }

  function paintBannerInto(g, cx, topY, w, hot) {
    const name = String(w.name || '').slice(0, 16);
    const pre = (w.cargoIcon ? w.cargoIcon + ' ' : '') + (w.aptIcon ? w.aptIcon + ' ' : '');
    const label = pre + name;
    const lvl = Math.max(0, Math.min(6, Number(w.cargoTier) || 0));
    const S = RANK_STYLE[lvl];
    g.font = '700 8px "Noto Serif SC","Noto Sans SC",sans-serif';
    const padX = 5 + (lvl >= 5 ? 2 : 0), tw = g.measureText(label).width;
    const bw = Math.max(16, tw + padX * 2), bh = 13;
    const bx = cx - bw / 2, by = topY - bh - 7;

    // Asta desde la cabeza hasta el banner.
    g.strokeStyle = '#6a4a28'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(cx, topY); g.lineTo(cx, by); g.stroke();
    // Aura de los rangos supremos (o del seleccionado).
    if (S.glow || hot) { g.fillStyle = hot ? 'rgba(255,224,130,0.32)' : 'rgba(252,231,160,0.22)'; g.beginPath(); g.ellipse(cx, by + bh / 2, bw / 2 + 4, bh / 2 + 4.5, 0, 0, 6.2832); g.fill(); }

    // Cuerpo del banner (degradado vertical) con cola según rango.
    const grad = g.createLinearGradient(0, by, 0, by + bh);
    grad.addColorStop(0, S.bg[0]); grad.addColorStop(1, S.bg[1]);
    g.fillStyle = grad; g.beginPath();
    g.moveTo(bx, by); g.lineTo(bx + bw, by); g.lineTo(bx + bw, by + bh);
    if (S.tail === 'swallow') { g.lineTo(cx + 3, by + bh); g.lineTo(cx, by + bh - 3.2); g.lineTo(cx - 3, by + bh); }
    else { g.lineTo(cx + 2.4, by + bh); g.lineTo(cx, by + bh + 3); g.lineTo(cx - 2.4, by + bh); }
    g.lineTo(bx, by + bh); g.closePath(); g.fill();

    // Filos: contorno + marco dorado (doble en rangos altos) + tachones.
    g.strokeStyle = hot ? '#ffe082' : S.edge; g.lineWidth = 1; g.stroke();
    g.strokeStyle = S.gold; g.lineWidth = 1; g.strokeRect(bx + 1.3, by + 1.3, bw - 2.6, bh - 2.6);
    if (S.dbl) { g.lineWidth = 0.7; g.strokeRect(bx + 3, by + 3, bw - 6, bh - 6); }
    if (S.studs) { g.fillStyle = S.gold; [[bx + 3, by + 3], [bx + bw - 3, by + 3], [bx + 3, by + bh - 3], [bx + bw - 3, by + bh - 3]].forEach(p => { g.beginPath(); g.arc(p[0], p[1], 0.9, 0, 6.2832); g.fill(); }); }

    // Remate del asta y borlas.
    bannerFinial(g, cx, by, hot && S.finial === 'none' ? 'knob' : S.finial, S.gold);
    if (S.tassel >= 1) { bannerTassel(g, bx + 2, by + bh, S.gold, S.tassel >= 2); bannerTassel(g, bx + bw - 2, by + bh, S.gold, S.tassel >= 2); }

    // Nombre.
    g.fillStyle = S.txt; g.textAlign = 'center'; g.textBaseline = 'middle';
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

  // ── Hojas de los portones (animadas) ───────────────────────────────────────
  // El sprite del portón trae solo el vano; aquí pintamos las dos hojas y las
  // hacemos girar sobre su gozne exterior según gate.open (0 cerrado → 1 abierto).
  // GATE_DZ/_FACE deben coincidir con drawWallPiece de gen-iso-sprites.js.
  const GATE_DZ = 10.56, GATE_HW = 0.26, GATE_GAP = 0.02, GATE_FACE = 0.17;
  function gateLeaf(g, gate, hinge, freeClosed) {
    const zTop = gate.zTop || GATE_DZ, face = (gate.faceOff != null) ? gate.faceOff : GATE_FACE, sw = gate.swing || 1;
    const ang = gate.open * 1.30;                              // ~0 → ~74°
    const w = Math.abs(freeClosed - hinge), sgn = (freeClosed - hinge) >= 0 ? 1 : -1;
    const cell = (a, o) => gate.orient === 'x' ? [gate.gx + a, gate.gy + o] : [gate.gx + o, gate.gy + a];
    const pt = (a, o, z) => { const p = logic(cell(a, o)[0], cell(a, o)[1]); return [p[0], p[1] - z]; };
    const aFree = hinge + sgn * w * Math.cos(ang), oFree = face + sw * w * Math.sin(ang);
    const h0 = pt(hinge, face, 0), f0 = pt(aFree, oFree, 0), f1 = pt(aFree, oFree, zTop), h1 = pt(hinge, face, zTop);
    g.beginPath(); g.moveTo(h0[0], h0[1]); g.lineTo(f0[0], f0[1]); g.lineTo(f1[0], f1[1]); g.lineTo(h1[0], h1[1]); g.closePath();
    // Laca roja (cerrada=rojo; al abrirse se ve más de canto → un punto más oscura).
    g.fillStyle = gate.open > 0.5 ? '#8a3420' : '#b0492a'; g.fill();
    g.strokeStyle = '#5a1810'; g.lineWidth = 0.5; g.stroke();
    // Tachones 門釘 de bronce (en rejilla; más filas en el portón grande perimetral).
    g.fillStyle = '#e0b85a';
    const rows = gate.perimeter ? Math.max(3, Math.round(zTop / 3.2)) : 1;
    for (let ci = 0; ci < 2; ci++) { const fw = 0.34 + ci * 0.32;
      const ax = hinge + sgn * w * Math.cos(ang) * fw, ao = face + sw * w * Math.sin(ang) * fw;
      for (let ri = 0; ri < rows; ri++) { const zz = rows > 1 ? zTop * (ri + 0.6) / (rows + 0.2) : zTop * 0.5; const p = pt(ax, ao, zz); g.beginPath(); g.arc(p[0], p[1], gate.perimeter ? 0.7 : 0.6, 0, 6.2832); g.fill(); }
    }
  }
  // Vano del portón perimetral al abrirse: cubre las hojas CERRADAS horneadas por
  // hac-iso y simula un pasaje (no negro) con suelo y claro del patio al fondo.
  function gatePassage(g, gate) {
    const hw = gate.hw || GATE_HW, zTop = gate.zTop || GATE_DZ, face = (gate.faceOff != null) ? gate.faceOff : GATE_FACE;
    const cell = (a, o) => gate.orient === 'x' ? [gate.gx + a, gate.gy + o] : [gate.gx + o, gate.gy + a];
    const pt = (a, o, z) => { const p = logic(cell(a, o)[0], cell(a, o)[1]); return [p[0], p[1] - z]; };
    const quad = (pts, col) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fillStyle = col; g.fill(); };
    quad([pt(-hw - 0.06, face, 0), pt(hw + 0.06, face, 0), pt(hw + 0.06, face, zTop + 0.22), pt(-hw - 0.06, face, zTop + 0.22)], '#241a14');   // túnel en sombra
    quad([pt(-hw * 0.55, face, zTop * 0.12), pt(hw * 0.55, face, zTop * 0.12), pt(hw * 0.55, face, zTop * 0.74), pt(-hw * 0.55, face, zTop * 0.74)], '#6b6256');   // claro del patio al fondo
    quad([pt(-hw, face, 0), pt(hw, face, 0), pt(hw, face, zTop * 0.16), pt(-hw, face, zTop * 0.16)], '#3a3026');   // suelo del pasaje
  }
  function drawGate(g, gate) {
    if (gate.perimeter) {
      if (gate.open <= 0.012) return;        // cerrado → se ven las hojas horneadas por hac-iso
      gatePassage(g, gate);                  // tapa las hojas horneadas y deja ver el pasaje
    }
    const hw = gate.hw || GATE_HW;
    gateLeaf(g, gate, -hw, -GATE_GAP);
    gateLeaf(g, gate, hw, GATE_GAP);
  }

  function paint() {
    if (!window.HacIso || !HacIso.frame) return;
    // Agrupa quién está DENTRO de cada edificio (estado 'tarea').
    const inside = {};   // buildingId → [walker]
    walkers.forEach(w => { if (w.insideId) (inside[w.insideId] = inside[w.insideId] || []).push(w); });

    const actors = [], overlays = [], signs = [];
    const FEET = HacChar ? HacChar.H - 5 : 51, bannerDy = Math.round(FEET * SPRITE_DISP / SCALE) - 1;
    // Portones: hojas animadas (overlay; el sprite no las trae). Primero, para
    // quedar bajo los banners y bocadillos. Coste mínimo: 2 polígonos por portón.
    if (wk && wk.gates) wk.gates.forEach(gate => overlays.push({ draw: (g) => drawGate(g, gate) }));
    walkers.forEach(w => {
      if (w.id === selectedId) return;                 // el seleccionado va en overlay (encima)
      if (w.insideId) return;                          // DENTRO de un edificio: oculto (su presencia la anuncia el banner 匾額)
      if (w.state === 'fuera') return;                 // EN EXPEDICIÓN fuera de la finca: oculto hasta volver
      actors.push({ fx: w.fx, fy: w.fy, draw: (g, lx, ly) => drawWalker(g, lx, ly, w, { banner: false }) });
      // El nombre va en overlay (siempre encima, sin recorte de región).
      overlays.push({ draw: (g) => { const p = logic(w.fx, w.fy); banner(g, p[0], p[1] - bannerDy, w, false); } });
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
    if (sel && sel.state !== 'fuera') overlays.push({ draw: (g) => drawWalker(g, logic(sel.fx, sel.fy)[0], logic(sel.fx, sel.fy)[1], sel, { highlight: true }) });

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

  // GÉNESIS: puebla la finca desde cero con la semilla estable y fija el reloj del
  // sim en `atMs`. Se usa la primera vez (sin snapshot) o tras un hueco enorme.
  function genesis(atMs) {
    R = HacRand.make(seedKey);
    walkers = spawn(opts.mapa, opts.tier, opts.miembros, opts.color || '#c9a84c');
    hailCd = rng(15, 40);
    simNowMs = atMs;
  }
  // Avanza la simulación en pasos FIJOS hasta `targetMs` (sin pintar). El guard es
  // tope de seguridad (~CATCHUP_CAP_MS de sim ≈ 36000 pasos).
  function advanceTo(targetMs) {
    let guard = 0;
    while (simNowMs + SIM_DT_MS <= targetMs && guard++ < 60000) { step(SIM_DT); simNowMs += SIM_DT_MS; }
  }

  // ── Snapshots: serializar / restaurar ───────────────────────────────────────
  function serialize() {
    return {
      rng: R.state(), hailCd: hailCd,
      walkers: walkers.map(w => { const o = { id: w.id }; SER_FIELDS.forEach(k => { o[k] = w[k]; }); return o; }),
    };
  }
  // Restaura sobre los walkers ya creados (por spawn) los campos dinámicos de la
  // foto; reengancha la orden (no se serializa la referencia) y reanuda el azar.
  function deserialize(st, tSnap) {
    if (!st) return;
    R = HacRand.fromState(st.rng | 0);
    hailCd = (typeof st.hailCd === 'number') ? st.hailCd : rng(15, 40);
    simNowMs = tSnap;
    const byId = {}; (st.walkers || []).forEach(s => { byId[s.id] = s; });
    walkers.forEach(w => {
      const s = byId[w.id]; if (!s) return;          // miembro nuevo sin foto → queda en génesis
      SER_FIELDS.forEach(k => { if (k in s) w[k] = s[k]; });
      w.order = orders[w.id] || null;
    });
  }
  function saveSnap() {
    if (!haciendaId || !window.HacSnap) return;
    HacSnap.save(haciendaId, simNowMs, serialize());
  }
  function scheduleSaves() {
    if (!haciendaId || !window.HacSnap) return;   // demo sin persistencia → nada que guardar
    if (snapTimer) clearInterval(snapTimer);
    snapTimer = setInterval(() => { if (running && started) saveSnap(); }, SAVE_EVERY_MS);
  }

  function tick() {
    if (!running) return;
    if (visible && onScreen) {
      const now = HacClock.now();
      if (now - simNowMs > CATCHUP_CAP_MS) genesis(now);   // fuera demasiado tiempo → arranque fresco
      advanceTo(now);
      paint(); pushState();
    }
    raf = requestAnimationFrame(tick);
  }

  // Al ocultar la pestaña, guarda la foto (y deja de pintar). Al volver, el tick
  // rebobina lo que falte (o hace génesis si el hueco fue enorme).
  function onVis() { visible = !document.hidden; if (document.hidden) saveSnap(); }
  function onHide() { saveSnap(); }

  function stop() {
    if (running && started) saveSnap();   // persiste la foto al cerrar/cambiar de finca
    running = false; started = false;
    if (raf) cancelAnimationFrame(raf); raf = null;
    if (snapTimer) { clearInterval(snapTimer); snapTimer = null; }
    document.removeEventListener('visibilitychange', onVis);
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', onHide);
    if (io) { io.disconnect(); io = null; }
  }

  function beginRun() {
    running = true; visible = !document.hidden; onScreen = true;
    document.addEventListener('visibilitychange', onVis);
    if (typeof window !== 'undefined') window.addEventListener('pagehide', onHide);
    if ('IntersectionObserver' in window) { io = new IntersectionObserver(es => { onScreen = es.some(e => e.isIntersecting); }, { threshold: 0 }); io.observe(iso); }
    raf = requestAnimationFrame(tick);
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
    iso = isoCanvas; opts = o || {}; selectedId = null; stateSig = ''; started = false;
    if (!iso) return;
    // Semilla ESTABLE de la finca (génesis). Y el id para snapshots (null = demo
    // sin persistencia, p.ej. onboarding → corre continuo desde génesis local).
    seedKey = String(opts.seedKey || opts.haciendaId
      || ('finca-' + (((opts.miembros || []).map(m => m && m.id).join('-')) || ('t' + (opts.tier || 0)))));
    haciendaId = opts.haciendaId || null;
    orders = opts.ordenes || {};
    if (window.HacTareas && HacTareas.ready) HacTareas.ready();
    if (window.HacClock && HacClock.ready) HacClock.ready();

    // Spawn SÍNCRONO (provisional): construye la estructura (wk) y deja list()/
    // buildings() operativos ya. NO se pinta hasta restaurar la foto, para que no
    // se vea el salto génesis→restaurado.
    const bootNow = (window.HacClock && HacClock.now) ? HacClock.now() : Date.now();
    genesis(bootNow);
    if (!walkers.length) { iso._hacSigns = []; return; }

    const afterReady = () => {
      if (reduced()) { staticPose(); paint(); pushState(); started = true; return; }
      started = true; beginRun(); scheduleSaves();
    };

    if (haciendaId && window.HacSnap) {
      // Restaura la última foto y rebobina hasta ahora; si no hay o es muy vieja,
      // génesis fresco en 'ahora' y ancla la línea de tiempo con una foto nueva.
      HacSnap.load(haciendaId).then(snap => {
        const now = (window.HacClock && HacClock.now) ? HacClock.now() : Date.now();
        if (snap && (now - snap.tSnap) <= CATCHUP_CAP_MS && snap.tSnap <= now + 5000) {
          deserialize(snap.estado, snap.tSnap);
          advanceTo(now);
        } else {
          genesis(now); saveSnap();
        }
        afterReady();
      }).catch(() => { genesis((window.HacClock && HacClock.now) ? HacClock.now() : Date.now()); afterReady(); });
    } else {
      afterReady();   // demo sin persistencia: corre continuo desde el génesis ya hecho
    }
  }

  // ── API para la página ────────────────────────────────────────────────────
  // Texto de lo que está haciendo un mecenas ahora mismo.
  function activityText(w) {
    if (w.state === 'saludo') return 'Recibe tus órdenes';
    if (w.state === 'fuera') return 'En expedición fuera de la finca';
    if (w.state === 'exped-out') return 'Saliendo de la finca';
    if (w.state === 'exped-in') return 'Regresando de la expedición';
    if (w.state === 'a-descansar') return 'Buscando un rincón de hierba';
    if (w.state === 'contemplando') return 'Contemplando el jardín';
    if (w.state === 'tumbado') return 'Descansando entre las plantas';
    if (w.state === 'charlando') {
      const o = walkers.find(x => x.id === w.chatWith), quien = o && o.name ? o.name : null;
      if (w.chatRole === 'mentor') return 'Aleccionando a ' + (quien || 'un subordinado');
      if (w.chatRole === 'pupil') return 'Recibiendo el consejo de ' + (quien || 'un superior');
      return 'Conversando' + (quien ? ' con ' + quien : '');
    }
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
      const enTarea = !!w.onMission && w.state === 'tarea';
      const fuera = w.state === 'fuera';
      return { id: w.id, name: w.name, color: w.color, inside, activity: activityText(w),
        onMission: !!w.onMission, misEnTarea: enTarea, fuera,
        misRestante: enTarea ? Math.max(0, Math.ceil(w.taskTimer)) : (fuera ? Math.max(0, Math.ceil(w.outTimer)) : null) };
    });
  }
  function select(id) { selectedId = id || null; if (!running) paint(); pushState(); }
  const selected = () => selectedId;
  function position(id) { const w = walkers.find(x => x.id === id); return w ? logic(w.fx, w.fy) : null; }

  // Pinta el sprite ACTUAL de un mecenas (su dir/frame/pose en vivo) centrado en un
  // canvas — para el retrato animado del panel de personaje. Se llama cada frame.
  function drawAvatar(canvas, id) {
    if (!canvas || !window.HacChar) return;
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);
    const w = walkers.find(x => x.id === id);
    if (!w) return;
    const moving = w.moving && w.state !== 'tarea' && w.state !== 'saludo';
    const frame = moving ? (Math.floor(w.phase * 1.2) % HacChar.FRAMES) : 0;
    const pose = (w.state === 'tumbado') ? 'sit' : (w.bowing ? 'bow' : 'stand');
    const cv = spriteFor(w, w.dir || 'S', frame, pose);
    if (!cv) return;
    g.imageSmoothingEnabled = false;
    const s = Math.min(canvas.width / HacChar.W, canvas.height / HacChar.H);
    const dw = Math.round(HacChar.W * s), dh = Math.round(HacChar.H * s);
    g.drawImage(cv, Math.round((canvas.width - dw) / 2), canvas.height - dh, dw, dh);   // pies abajo
  }

  // Edificios visitables (instancias). Incluye el DOMINIO para el coste.
  function buildings() { return wk ? wk.visitable.map(b => ({ id: b.id, nombre: b.nombre, tipo: b.tipo, dominio: b.dominio || null })) : []; }
  // TIPOS de edificio visitables, DEDUPLICADOS (si hay 4 cuarteles → un tipo). La
  // UI ofrece tareas por tipo; el sim elige el edificio más cercano de ese tipo.
  function buildingTypes() {
    if (!wk) return [];
    const seen = {}, out = [];
    wk.visitable.forEach(b => { if (!seen[b.tipo]) { seen[b.tipo] = 1; out.push({ tipo: b.tipo, nombre: b.nombre, dominio: b.dominio || null }); } });
    return out;
  }
  // Aplica un nuevo mapa de órdenes (miembroId → { startMs, endMs, targetBid }) y
  // RE-DERIVA la ventana actual para que las misiones se apliquen en su tick
  // exacto (sin teletransporte). Coste ~igual a abrir la finca (<50 ms).
  function setOrders(map) {
    orders = map || {};
    if (opts) opts.ordenes = orders;
    // Reengancha la orden a cada walker EN VIVO (sin re-simular): missionGate la
    // activa hacia delante por timestamp. Así no hay salto al mandar una misión.
    walkers.forEach(w => { w.order = orders[w.id] || null; });
    if (!running) { paint(); pushState(); }
  }

  return { start, stop, list, select, selected, position, buildings, buildingTypes, setOrders, drawAvatar, goHome };
})();
if (typeof window !== 'undefined') window.HacFolk = HacFolk;
