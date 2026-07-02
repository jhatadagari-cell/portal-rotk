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
  // ── Escaramuza: concentración coreografiada en la puerta antes de partir ──
  // escMap[walkerId] = { inicioMs, idx, n } de su banda lanzada (lo fija la página).
  // Sincronizado por inicioMs (reloj de servidor) → todos los clientes lo ven igual.
  let escMap = {};
  function setEscaramuzas(m) { escMap = m || {}; }
  // caballos[ownerId] = { nombre } — mascotas que rondan por FUERA de la finca.
  // La página lo alimenta desde HacStats; `horses` (más abajo) es su encarnación viva.
  let caballos = {}, horses = [];
  function setCaballos(m) { caballos = m || {}; if (Object.keys(caballos).length) ensureHorses(); }
  const ESC_MUSTER_MS = 26000;   // ventana de concentración en la puerta: amplia para que
                                 // todos los mecenas (incluso clientes con poll lento / app en
                                 // segundo plano) lleguen y ESPEREN antes del grito conjunto.
  const ESC_CHEER_MS = 4200;     // 拱手 + grito de guerra (sub-ventana final, simultáneo)
  const ESC_RUSH = 2.3;          // los mecenas ACUDEN al portón a paso ligero (van a la guerra):
                                 // así cruzan incluso una finca grande dentro de la ventana.
  const ESC_CRY = '¡A la batalla!';
  // Grito de guerra de un mecenas al partir: si tiene un VÍNCULO con un co-miembro
  // de su banda, dice una frase temática (R1b); si no, el genérico. Los unilaterales
  // (odio/amor no correspondido) solo los "dice" quien SIENTE el vínculo.
  function escCheerFor(w) {
    if (!window.HacRelaciones || !haciendaId || !escMap[w.id]) return ESC_CRY;
    const mine = escMap[w.id];
    const co = Object.keys(escMap).filter(id => id !== w.id && escMap[id] && escMap[id].inicioMs === mine.inicioMs);
    for (let i = 0; i < co.length; i++) {
      const rel = HacRelaciones.get(haciendaId, w.id, co[i]); if (!rel || !rel.tipo) continue;
      const def = HacRelaciones.TIPOS[rel.tipo]; if (!def) continue;
      const sub = def.subs[rel.subtipo]; if (!sub || !sub.cheer) continue;
      if (def.dir && rel.subtipo === 'unilateral' && rel.origen !== w.id) continue;   // el no-correspondido calla
      return sub.cheer;
    }
    return ESC_CRY;
  }
  // Hora de simulación (ms) del estado actual — base de las misiones.
  // (La energía es un recurso del jugador independiente del sim → HacEnergia.)
  function nowSimMs() { return simNowMs; }
  const proj = () => iso && iso._hacProj;
  function logic(fx, fy) { const p = proj(); if (!p) return [0, 0]; return [p.originX + (fx - fy) * TW / 2, p.originY + (fx + fy) * TH / 2]; }

  // ── Modelo pixel-art (HacChar) ────────────────────────────────────────────
  const SCALE = (window.HacIso && HacIso.SCALE) || 2;   // px de dispositivo por px lógico
  const SPRITE_DISP = 1;                                // px de dispositivo por px del sprite (1 = ratio entero, nítido)
  const MERCHANT_LOOK = { robe: '#3f6e9c', accent: '#d4a83a', piel: 1, pelo: 1 };   // aspecto del mercader
  const MKT_CRIES = ['¡Buen té!', '¡Pasad y ved!', '¡Té recién llegado!', '¡Té de las montañas!', '¡El mejor de la comarca!', '¡Probad, señor!', '¡Hojas de primavera!'];
  const BOARD_CRIES = ['¿Visteis la nueva recompensa?', 'Esa de la frontera es peligrosa…', 'Yo no me atrevería con esa', 'Buen botín para quien ose', '¿Recaudar tributos otra vez?', 'Necesitaría mejor equipo', 'Demasiado riesgo para mí', '¡Gloria al que la cumpla!', 'Mucho oro promete esa', 'Habrá que entrenar más', 'Ésta es para un veterano'];
  const CLERK_PREGON = ['¡Nuevas misiones en el tablón!', '¡Se buscan valientes!', '¡Honor y oro para quien sirva!', '¡Acercaos, hay encargos!', '¡La casa necesita brazos!', '¡Atended, atended!', '¡Por orden del señor de la casa!'];
  const CLERK_GAWKER = ['¿Alguna de su agrado?', 'Buena elección sería ésa', 'Animaos, mi señor', 'Apuntaos cuando gustéis', 'Hay encargos para todo talento', 'Decidíos, no temáis'];
  const MKT_SALUDOS = ['¡Bienvenido, señor!', '¡Adelante, adelante!', '¡Honráis mi puesto!', '¿Un buen té?'];
  const MKT_DIRS = ['S', 'SE', 'SW', 'E', 'S', 'SE'];   // mira sobre todo al cliente (sur)
  // RNG propio del mercader (NO toca el stream compartido R → no desincroniza el sim).
  function mrand(mk) { mk._r = (mk._r * 1664525 + 1013904223) >>> 0; return mk._r / 4294967296; }
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
    // Rework PNG: si el sprite de calidad está horneado, se usa (todos los
    // mecenas comparten el sprite por defecto → sin cachear por walker).
    if (window.HacChar && HacChar.sprite) {
      const png = HacChar.sprite(dir, pose, frame);
      if (png) return png;
    }
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
  // Dimensiones del sprite ACTIVO (PNG de calidad si está listo, si no procedural).
  const pngOn  = () => !!(window.HacChar && HacChar.pngReady && HacChar.pngReady());
  const charW  = () => pngOn() ? HacChar.PNG_W : (window.HacChar ? HacChar.W : 40);
  const charH  = () => pngOn() ? HacChar.PNG_H : (window.HacChar ? HacChar.H : 56);
  const charFEET = () => pngOn() ? HacChar.PNG_FEET : (window.HacChar ? HacChar.H - 5 : 51);
  const charNF = () => pngOn() ? HacChar.PNG_NF : (window.HacChar ? HacChar.FRAMES : 4);

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
    // MERCADER: personaje fijo (mismo render que los mecenas) parado al frente de
    // cada mercado, mirando al cliente. Se dibuja como actor, no es un walker.
    const merchants = [];
    visitable.forEach(b => {
      if (b.tipo !== 'mercado') return;
      // Se planta en la celda de APROXIMACIÓN (DELANTE del puesto), no en el spot
      // interior: así no queda tapado por el sprite grande del puesto y mira al cliente.
      const at = b.approach || b.spotCell; if (!at) return;
      const ax = at[0], ay = at[1];
      // Pequeño "itinerario": la celda de delante + vecinas TRANSITABLES por las que
      // pasea atendiendo el puesto (máx 3).
      const stations = [[ax, ay]];
      [[ax - 1, ay], [ax + 1, ay], [ax, ay + 1]].forEach(([sx, sy]) => { if (stations.length < 3 && set.has(sx + ',' + sy)) stations.push([sx, sy]); });
      let seed = 2166136261; const sid = 'mkt@' + b.id; for (let i = 0; i < sid.length; i++) { seed = (seed ^ sid.charCodeAt(i)) * 16777619 >>> 0; }
      merchants.push({ id: sid, bid: b.id, name: 'Mercader', aptitud: '', aspecto: MERCHANT_LOOK,
        fx: ax, fy: ay, tx: ax, ty: ay, dir: 'S', phase: 0, moving: false, state: 'idle', bowing: false,
        stations, timer: 1 + (seed % 100) / 30, speech: null, speechT: 0, _r: seed });
    });
    // FUNCIONARIO (文官) junto al EDIFICIO PRINCIPAL: atiende el tablón de misiones.
    const clerks = []; let mainBid = null, boardSlots = [];
    const princ = (B && B.edificioPrincipal) ? B.edificioPrincipal(mapa) : null;
    if (princ) {
      mainBid = princ.pos[0] + ',' + princ.pos[1];
      const mb = buildings.get(mainBid);
      if (mb && mb.approach) {
        // Coloca al funcionario en una celda ABIERTA cerca de la entrada: transitable
        // y cuyas vecinas HACIA LA CÁMARA (+x,+y) no sean muro (si no, una muralla/
        // portón delante lo taparía). Elige la más adelantada (mayor gx+gy) y cercana.
        const ax = mb.approach[0], ay = mb.approach[1];
        const inGrid = (x, y) => x >= 0 && y >= 0 && x < GW && y < GH;
        const abierta = (x, y) => set.has(x + ',' + y)
          && (!inGrid(x + 1, y) || set.has((x + 1) + ',' + y))
          && (!inGrid(x, y + 1) || set.has(x + ',' + (y + 1)));
        let best = null, bestS = -Infinity;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > 2) continue;
          const x = ax + dx, y = ay + dy; if (!abierta(x, y)) continue;
          const s = (x + y) - (Math.abs(dx) + Math.abs(dy)) * 0.15;   // adelantada + cercana
          if (s > bestS) { bestS = s; best = [x, y]; }
        }
        const sp = best || [ax, ay];
        let cfx = sp[0], cfy = sp[1];   // medio tile a un lado solo si la vecina es transitable
        if (set.has((cfx + 1) + ',' + cfy)) cfx += 0.5; else if (set.has((cfx - 1) + ',' + cfy)) cfx -= 0.5;
        clerks.push({ id: 'clerk@' + mainBid, name: 'Funcionario', aptitud: 'administrador', aspecto: {}, fx: cfx, fy: cfy, dir: 'S', phase: 0, moving: false, state: 'stand', bowing: false, _r: 0x9e3779b9 });
        // Huecos en SEMICÍRCULO al frente del tablón donde los curiosos se asoman.
        const cax = mb.approach[0], cay = mb.approach[1];
        [[-2, 0], [2, 0], [-1, 1], [1, 1], [0, 2], [-2, 1], [2, 1]].forEach(([ox, oy]) => {
          const x = cax + ox, y = cay + oy;
          if (boardSlots.length < 6 && set.has(x + ',' + y)) boardSlots.push({ cell: [x, y], by: null });
        });
      }
    }
    return { set, cells, cam, camCells, garden, gardenCells, water, GW, GH, ownByMember, buildings, visitable, gates, merchants, clerks, mainBid, boardSlots, exitCell, exitKey: exitCell ? exitCell[0] + ',' + exitCell[1] : null, outNear, outFar };
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
    if (w.onMission || ['exped-out', 'exped-in', 'fuera', 'saludo', 'esc-cheer'].indexOf(w.state) >= 0) return false;
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

  // CONSULTAR el tablón de misiones (local): el mecenas va al edificio principal,
  // se planta delante del funcionario con un cartelito 📜 sobre la cabeza y espera
  // a que el jugador lo pulse. No lo bloquea: una misión/orden lo saca. Devuelve
  // 'walking' / 'now' (ya está) / false (ocupado/sin ruta).
  function consultar(id, buildingId) {
    const w = walkers.find(x => x.id === id); if (!w || !wk) return false;
    if (w.onMission || ['exped-out', 'exped-in', 'fuera', 'saludo', 'esc-cheer'].indexOf(w.state) >= 0) return false;
    const b = buildingId ? wk.buildings.get(buildingId) : null;
    if (!b || !b.approachKey) return false;
    if (w.state === 'consultando' && w.consultBid === b.id) return 'now';   // ya está allí
    const path = bfs([Math.round(w.fx), Math.round(w.fy)], new Set([b.approachKey]));
    if (!path) return false;
    w.insideId = null; w.speech = null; w.chatWith = null; w.meetWith = null;
    w.path = path; w.state = 'a-consultar'; w.consultBid = b.id; w.consultFace = [b.cx, b.cy]; w.moving = false;
    return 'walking';
  }
  // ¿está mi mecenas plantado esperando en el tablón? (para abrir al pulsarlo)
  function consultando(id) { const w = walkers.find(x => x.id === id); return !!(w && w.state === 'consultando'); }
  function dejarConsulta(id) { const w = walkers.find(x => x.id === id); if (w && (w.state === 'consultando' || w.state === 'a-consultar')) { w.state = 'paseando'; w.strollTimer = 1; w.speech = null; w.consultFace = null; } }

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
    // ESCARAMUZA en ventana de concentración: se detiene EN el portón (no cruza aún)
    // y espera a los demás. El resto (o si la ventana ya cerró) sigue hasta el campo.
    const em = escMap[w.id];
    const musterActive = em && nowSimMs() < em.inicioMs + ESC_MUSTER_MS;
    if (!musterActive) {
      if (wk.outNear) path.push(wk.outNear);
      if (wk.outFar) path.push(wk.outFar);                            // cruza el vano y se aleja por el campo
    }
    w.path = path; w.state = 'exped-out'; w.goalBid = null; w.insideId = null; w.task = null; w.moving = false;
  }
  // Vuelve: APARECE en el exterior (lejos), camina hacia la puerta, CRUZA el vano y da
  // un par de pasos adentro. La misión termina AQUÍ (endMission → recompensa): así el
  // mecenas cobra justo al reaparecer en la finca, sin recorrer todo el recinto hasta
  // una celda lejana. Desde dentro, retoma el paseo normal por su cuenta.
  function startReturn(w) {
    const e = wk.exitCell || [Math.round(w.fx), Math.round(w.fy)];
    const far = wk.outFar || e;
    w.fx = far[0]; w.fy = far[1]; w.tx = far[0]; w.ty = far[1];        // reaparece FUERA, a lo lejos
    const path = [];
    if (wk.outNear) path.push(wk.outNear);                            // se acerca al portón desde fuera
    path.push(e);                                                     // cruza el vano
    // Un par de celdas HACIA EL INTERIOR (hacia el centro) para quedar claramente
    // dentro, sin cruzar toda la finca.
    const cxC = (wk.GW - 1) / 2, cyC = (wk.GH - 1) / 2;
    let cx = e[0], cy = e[1];
    for (let s = 0; s < 2; s++) {
      const nx = cx + Math.sign(cxC - cx), ny = cy + Math.sign(cyC - cy);
      const cand = [[cx, ny], [nx, cy], [nx, ny]].find(c => (c[0] !== cx || c[1] !== cy) && wk.set.has(c[0] + ',' + c[1]));
      if (!cand) break;
      cx = cand[0]; cy = cand[1]; path.push([cx, cy]);
    }
    w.path = path; w.state = 'exped-in'; w.moving = false;
  }
  // ¿Está el mecenas MÁS ALLÁ de la rejilla interior (fuera de la muralla)? Solo en
  // expedición se sale; cualquier otra cosa ahí fuera es un mecenas varado.
  function fueraDeFinca(w) {
    if (!wk) return false;
    return w.fx < -0.5 || w.fy < -0.5 || w.fx > wk.GW - 0.5 || w.fy > wk.GH - 0.5;
  }
  // Trae de vuelta a un mecenas que quedó FUERA de la finca (expedición cortada):
  // camina del campo al vano del portón y entra. R-free (rutas fijas).
  function enterFromOutside(w) {
    const e = wk.exitCell;
    if (!e) { const c = wk.cells && wk.cells[0]; if (c) { w.fx = c[0]; w.fy = c[1]; w.tx = c[0]; w.ty = c[1]; } w.state = 'paseando'; w.strollTimer = 2; w.wait = 0.4; w.path = null; w.moving = false; return; }
    const path = [];
    if (wk.outNear) path.push(wk.outNear);
    path.push(e);                                       // cruza el vano hacia el interior
    w.path = path; w.state = 'exped-in'; w.insideId = null; w.moving = false;
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
    if (w.state === 'a-consultar') {
      // Llegó al edificio principal: se planta y mira al funcionario. El AVISO de
      // "revisar el tablón" lo pinta la página como botón DOM (local del jugador),
      // no como bocadillo (que verían todos y molestaría a los diálogos).
      w.state = 'consultando'; w.idleTimer = 60; w.moving = false; w.path = null; w.phase = 0; w.speech = null;
      if (w.consultFace) { const fd = faceFromGrid(w.consultFace[0] - w.fx, w.consultFace[1] - w.fy); if (fd) w.dir = fd; }
      return;
    }
    if (w.state === 'a-ojear') {
      // Llegó a su hueco del semicírculo: ojea el tablón, de cara al funcionario.
      w.state = 'ojeando'; w.idleTimer = w.gawkDur || 18; w.moving = false; w.path = null; w.phase = 0;
      if (w.gawkFace) { const fd = faceFromGrid(w.gawkFace[0] - w.fx, w.gawkFace[1] - w.fy); if (fd) w.dir = fd; }
      return;
    }
    if (w.state === 'a-curiosear') {
      // Llegó al puesto: se queda mirando el género 15-30 s, de cara al mostrador.
      w.state = 'curioseando'; w.idleTimer = w.browseDur || 20; w.moving = false; w.path = null; w.phase = 0;
      if (w.browseFace) { const fd = faceFromGrid(w.browseFace[0] - w.fx, w.browseFace[1] - w.fy); if (fd) w.dir = fd; }
      return;
    }
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
      // Llegó al portón. Si es una ESCARAMUZA y aún estamos en la ventana de
      // concentración, FORMA FILA y espera a los demás para el grito de guerra
      // (sincronizado). Si no, "sale del mapa" (oculto) hasta cumplir la duración.
      const em = escMap[w.id], t0 = nowSimMs();
      if (em && t0 < em.inicioMs + ESC_MUSTER_MS) {
        w.moving = false; w.path = null; w.state = 'esc-cheer'; w.bowing = false; w.speech = null;
        w._escEnd = em.inicioMs + ESC_MUSTER_MS; w.dir = 'S';
        const e = wk.exitCell;
        if (e) { const off = (em.idx - (em.n - 1) / 2) * 0.85; w.fx = e[0] + off; w.fy = e[1]; w.tx = w.fx; w.ty = w.fy; }
      } else {
        w.moving = false; w.path = null; w.state = 'fuera';
        const o = escOrder(w) || w.order, endOut = o ? o.startMs + (o.durMs || 120000) : t0;
        w.outTimer = Math.max(2, (endOut - t0) / 1000);
      }
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
  // Orden SINTÉTICA de escaramuza derivada del estado de banda COMPARTIDO (escMap):
  // así TODOS los miembros salen, se concentran y vuelven con el MISMO inicioMs/finMs
  // en CADA cliente, sin depender de que la orden individual de cada uno (RLS: solo la
  // escribe su dueño) se haya propagado. La orden real solo sirve para el bookkeeping
  // de recompensa del propio mecenas.
  function escOrder(w) {
    const em = escMap[w.id]; if (!em) return null;
    const fin = em.finMs || (em.inicioMs + 1800000);
    return { startMs: em.inicioMs, durMs: Math.max(30000, fin - em.inicioMs), tipo: 'expedicion', targetId: 'escaramuza', esc: true };
  }

  function endMission(w) {
    const eo = escOrder(w) || w.order;
    if (eo) w.missionDoneFor = eo.startMs;   // marca ESTA orden como cumplida (no re-activar)
    w.onMission = false; w.bowing = false; w.missionTask = null;
    // Si terminó FUERA de la finca (expedición cumplida/cortada fuera), que entre.
    if (!w.insideId && fueraDeFinca(w)) { enterFromOutside(w); return; }
    if (w.insideId) startLeave(w);
    else { w.state = 'paseando'; w.strollTimer = rng(2, 6); w.path = null; w.moving = false; }
  }
  // Activa la MISIÓN del jugador en su ventana (timestamp compartido). La TAREA en
  // sí dura desde que LLEGA (ver onPathDone); aquí solo arrancamos (saludo) y damos
  // un tope de seguridad por si el viaje se atasca. Termina al completar la tarea.
  function missionGate(w) {
    const o = escOrder(w) || w.order;   // la escaramuza (estado compartido) tiene prioridad
    if (!o) { if (w.onMission) endMission(w); return; }   // orden retirada → al ambiente
    const t = nowSimMs(), dur = o.durMs || 60000, winEnd = o.startMs + dur + MISSION_GRACE_MS;
    // En una ESCARAMUZA, y SOLO dentro de la ventana de concentración, reintentamos
    // acudir al portón aunque una vez fallara el trazado (p.ej. el mecenas estaba dentro
    // de un edificio): así nadie se queda descolgado. Pasada la ventana, el guardián
    // normal evita re-disparos (que provocarían bucles de "regreso").
    const enMuster = o.esc && t < o.startMs + ESC_MUSTER_MS;
    const yaHecha = w.missionDoneFor === o.startMs && !enMuster;
    if (t >= o.startMs && t < winEnd && !w.onMission && !yaHecha) {
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
      if (w.browseCd > 0) w.browseCd -= dt;
      // Auto-recuperación: si quedó VARADO FUERA de la rejilla (más allá de la
      // muralla) y no está en tránsito de expedición, que vuelva a entrar. OJO: se
      // comprueba por LÍMITES de rejilla, no por `set` (hay muchas celdas válidas
      // fuera de `set`: puertas, bordes… comprobarlo así mandaba a TODOS al portón).
      if (w.state !== 'exped-out' && w.state !== 'exped-in' && w.state !== 'fuera' && !w.insideId && fueraDeFinca(w)) enterFromOutside(w);
      missionGate(w);
      switch (w.state) {
        // Curiosear el mercado (flavor LOCAL, sin R): va al puesto, mira el género
        // un rato y vuelve a pasear. Una misión lo saca (lo gestiona missionGate).
        case 'a-consultar': followPath(w, dt, SPD); break;
        case 'consultando':
          w.idleTimer -= dt; w.phase += dt * 0.4;
          if (w.consultFace) { const fd = faceFromGrid(w.consultFace[0] - w.fx, w.consultFace[1] - w.fy); if (fd) w.dir = fd; }
          if (w.idleTimer <= 0) { w.state = 'paseando'; w.strollTimer = 1.2; w.consultFace = null; }
          break;
        case 'a-curiosear': followPath(w, dt, SPD); break;
        case 'curioseando':
          w.idleTimer -= dt; w.phase += dt * 0.4;
          if (w.browseFace) { const fd = faceFromGrid(w.browseFace[0] - w.fx, w.browseFace[1] - w.fy); if (fd) w.dir = fd; }
          if (w.idleTimer <= 0) { w.state = 'paseando'; w.strollTimer = 1.2; w.wait = 0.4; w.browseFace = null; }
          break;
        case 'a-ojear': followPath(w, dt, SPD); break;
        case 'ojeando':
          w.idleTimer -= dt; w.phase += dt * 0.4;
          if (w.speechT > 0) { w.speechT -= dt; if (w.speechT <= 0) w.speech = null; }
          if (w.gawkFace) { const fd = faceFromGrid(w.gawkFace[0] - w.fx, w.gawkFace[1] - w.fy); if (fd) w.dir = fd; }
          if (w.idleTimer <= 0) { w.state = 'paseando'; w.strollTimer = 1.2; w.wait = 0.4; w.gawkFace = null; w.speech = null; }
          break;
        case 'saludo': { w.phase += dt * 0.5; w.missionTimer -= dt; if (w.missionTimer <= 0) { w.bowing = false; const so = escOrder(w) || w.order; (so && so.tipo === 'expedicion') ? startExpedition(w) : startMissionVisit(w); } break; }
        case 'exped-out': followPath(w, dt, escMap[w.id] ? SPD * ESC_RUSH : SPD); break;
        case 'exped-in': followPath(w, dt, SPD); break;
        case 'esc-cheer': {
          // Espera en la puerta; en la sub-ventana final, 拱手 + grito al unísono.
          w.phase += dt * 0.5;
          if (w.speechT > 0) { w.speechT -= dt; if (w.speechT <= 0) w.speech = null; }
          const t0 = nowSimMs(), end = w._escEnd || t0;
          if (t0 >= end - ESC_CHEER_MS && !w.bowing) { w.bowing = true; w.speech = escCheerFor(w); w.speechT = ESC_CHEER_MS / 1000; w.dir = 'S'; }
          if (t0 >= end) {
            // Grito hecho: SALEN JUNTOS cruzando el portón hacia el campo.
            w.bowing = false; w.speech = null;
            const out = [];
            if (wk.outNear) out.push(wk.outNear);
            if (wk.outFar) out.push(wk.outFar);
            if (out.length) { w.path = out; w.state = 'exped-out'; w.moving = false; }
            else {
              w.state = 'fuera';
              const o = escOrder(w) || w.order, endOut = o ? o.startMs + (o.durMs || 120000) : t0;
              w.outTimer = Math.max(2, (endOut - t0) / 1000);
            }
          }
          break;
        }
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
    stepMerchants(dt);
    stepBoard(dt);
    stepHorses(dt);
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

  // Al pregonar, los mecenas que PASEAN cerca pueden picar (25%) y acercarse a
  // curiosear el género 15-30 s. Flavor LOCAL (RNG del mercader, sin tocar R): no
  // los bloquea — una misión los saca (missionGate manda). Máx 2 por pregón.
  const BROWSE_OK = ['paseando', 'saliendo'];
  function attractBrowsers(mk) {
    const b = mk.bid && wk ? wk.buildings.get(mk.bid) : null; if (!b) return;
    let pulled = 0;
    for (let i = 0; i < walkers.length && pulled < 2; i++) {
      const w = walkers[i];
      if (w.onMission || (w.browseCd || 0) > 0 || BROWSE_OK.indexOf(w.state) < 0) continue;
      const dx = w.fx - mk.fx, dy = w.fy - mk.fy;
      if (dx * dx + dy * dy > 25) continue;            // "a cierta distancia" (~5 celdas)
      if (mrand(mk) < 0.25 && startBrowse(w, b, mk)) pulled++;
    }
  }
  function startBrowse(w, b, mk) {
    const goals = (mk.stations || []).map(s => s[0] + ',' + s[1]);
    if (b.approachKey) goals.push(b.approachKey);
    const path = bfs([Math.round(w.fx), Math.round(w.fy)], new Set(goals));
    if (!path) return false;
    w.path = path; w.state = 'a-curiosear'; w.moving = false; w.speech = null; w.chatWith = null; w.meetWith = null;
    w.browseDur = 15 + mrand(mk) * 15;                 // 15-30 s (sin R)
    w.browseFace = [b.cx, b.cy]; w.browseCd = 45 + mrand(mk) * 30;
    return true;
  }
  // TABLÓN de misiones (flavor LOCAL): los mecenas que pasean cerca a veces se
  // acercan a "ojear" las misiones nuevas y se colocan en semicírculo delante del
  // funcionario. Comentan ESCALONADO (un cooldown compartido → 1-2 hablando a la
  // vez, sin solaparse). RNG del funcionario (no toca R). Una misión los saca.
  let boardGawkCd = 5, boardTalkCd = 3;
  function stepBoard(dt) {
    if (!wk || !wk.clerks || !wk.clerks.length || !wk.boardSlots || !wk.boardSlots.length) return;
    const ck = wk.clerks[0], fx = ck.fx, fy = ck.fy;
    if (ck.speechT > 0) { ck.speechT -= dt; if (ck.speechT <= 0) ck.speech = null; }
    // Libera huecos de quien ya no está ojeando (misión, se fue, etc.).
    wk.boardSlots.forEach(s => { if (s.by) { const w = walkers.find(x => x.id === s.by); if (!w || (w.state !== 'a-ojear' && w.state !== 'ojeando')) s.by = null; } });
    const lectores = walkers.filter(w => w.state === 'ojeando' || w.state === 'a-ojear');
    // VIDA del funcionario: si hay curiosos, los MIRA (gira hacia uno); si no, otea
    // y de vez en cuando cambia de cara. Reverencia leve si alguien acaba de llegar.
    ck._t = (ck._t || 0) - dt;
    if (lectores.length) {
      const tg = lectores[Math.floor(mrand(ck) * lectores.length)];
      const fd = faceFromGrid(tg.fx - fx, tg.fy - fy); if (fd) ck.dir = fd;
      ck.bowing = lectores.some(w => w.state === 'a-ojear');   // saluda a los que llegan
    } else { ck.bowing = false; if (ck._t <= 0) { ck.dir = ['S', 'SE', 'SW', 'E'][Math.floor(mrand(ck) * 4)]; ck._t = 3 + mrand(ck) * 3; } }
    boardGawkCd -= dt; boardTalkCd -= dt;
    // Reclutar un curioso de vez en cuando (a un hueco libre del semicírculo).
    if (boardGawkCd <= 0) {
      boardGawkCd = 3 + mrand(ck) * 4;
      const fi = wk.boardSlots.findIndex(s => !s.by);
      if (fi >= 0 && mrand(ck) < 0.55) {
        for (let i = 0; i < walkers.length; i++) {
          const w = walkers[i];
          if (w.onMission || (w.gawkCd || 0) > 0 || (w.state !== 'paseando' && w.state !== 'saliendo')) continue;
          const dx = w.fx - fx, dy = w.fy - fy; if (dx * dx + dy * dy > 36) continue;   // ~6 celdas
          const slot = wk.boardSlots[fi];
          const path = bfs([Math.round(w.fx), Math.round(w.fy)], new Set([slot.cell[0] + ',' + slot.cell[1]]));
          if (!path) continue;
          slot.by = w.id; w.boardSlot = fi; w.gawkFace = [fx, fy]; w.gawkDur = 14 + mrand(ck) * 16; w.gawkCd = 50 + mrand(ck) * 40;
          w.path = path; w.state = 'a-ojear'; w.moving = false; w.speech = null; w.chatWith = null; w.meetWith = null;
          break;
        }
      }
    }
    // Comentarios ESCALONADOS (cola compartida funcionario+curiosos): como mucho uno
    // nuevo cada ~3 s → 1-2 bocadillos a la vez, sin solaparse.
    if (boardTalkCd <= 0) {
      const readers = walkers.filter(w => w.state === 'ojeando' && !w.speech);
      const r = mrand(ck);
      if (readers.length && r < 0.5) {                              // habla un curioso
        const w = readers[Math.floor(mrand(ck) * readers.length)];
        w.speech = BOARD_CRIES[Math.floor(mrand(ck) * BOARD_CRIES.length)]; w.speechT = 2.8;
        boardTalkCd = 2.6 + mrand(ck) * 2.4;
      } else if (!ck.speech && readers.length) {                    // COMENTA a los curiosos presentes
        ck.speech = CLERK_GAWKER[Math.floor(mrand(ck) * CLERK_GAWKER.length)]; ck.speechT = 2.8;
        boardTalkCd = 4 + mrand(ck) * 3;
      } else if (!ck.speech && mrand(ck) < 0.22) {                  // PREGÓN al aire: solo de vez en cuando
        ck.speech = CLERK_PREGON[Math.floor(mrand(ck) * CLERK_PREGON.length)]; ck.speechT = 2.8;
        boardTalkCd = 16 + mrand(ck) * 14;                          // y espacia bien el siguiente
      } else boardTalkCd = 7 + mrand(ck) * 6;                       // en silencio: reintenta más tarde
    }
  }
  // Vida del MERCADER (flavor, local): atiende el puesto — pasea entre un par de
  // sitios, se gira, pregona su mercancía y hace una reverencia 抱拳 si pasa alguien.
  const MKT_SPD = 1.5;
  function stepMerchants(dt) {
    if (!wk || !wk.merchants || !wk.merchants.length) return;
    for (const mk of wk.merchants) {
      if (mk.speechT > 0) { mk.speechT -= dt; if (mk.speechT <= 0) mk.speech = null; }
      // ¿hay un mecenas cerca? → reverencia de bienvenida (solo parado).
      let near = false;
      for (let i = 0; i < walkers.length; i++) { const w = walkers[i]; if (w.insideId || w.state === 'fuera') continue; const dx = w.fx - mk.fx, dy = w.fy - mk.fy; if (dx * dx + dy * dy <= 1.7 * 1.7) { near = true; break; } }
      if (mk.state === 'walking') {
        const dx = mk.tx - mk.fx, dy = mk.ty - mk.fy, d = Math.hypot(dx, dy);
        if (d < 0.06) { mk.fx = mk.tx; mk.fy = mk.ty; mk.moving = false; mk.state = 'idle'; mk.timer = 2 + mrand(mk) * 4; mk.dir = 'S'; }
        else { const s = Math.min(d, MKT_SPD * dt); mk.fx += dx / d * s; mk.fy += dy / d * s; mk.moving = true; mk.phase += dt * 6; const fd = faceFromGrid(dx, dy); if (fd) mk.dir = fd; }
        mk.bowing = false;
        continue;
      }
      // Parado: si pasa un cliente, reverencia; si no, decide qué hacer al expirar el timer.
      mk.bowing = near;
      if (near && !mk.speech && mrand(mk) < 0.02) { mk.speech = MKT_SALUDOS[Math.floor(mrand(mk) * MKT_SALUDOS.length)]; mk.speechT = 1.8; }
      mk.timer -= dt;
      if (mk.timer > 0) continue;
      const r = mrand(mk);
      if (r < 0.30 && mk.stations.length > 1) {                   // pasea a otro sitio del puesto
        let s, tries = 0; do { s = mk.stations[Math.floor(mrand(mk) * mk.stations.length)]; } while (++tries < 4 && s[0] === Math.round(mk.fx) && s[1] === Math.round(mk.fy));
        mk.tx = s[0]; mk.ty = s[1]; mk.state = 'walking';
      } else if (r < 0.68) {                                       // pregona su mercancía
        mk.speech = MKT_CRIES[Math.floor(mrand(mk) * MKT_CRIES.length)]; mk.speechT = 2.4; mk.timer = 4 + mrand(mk) * 5;
        attractBrowsers(mk);                                       // puede atraer curiosos al puesto
      } else {                                                     // se gira a mirar
        mk.dir = MKT_DIRS[Math.floor(mrand(mk) * MKT_DIRS.length)]; mk.timer = 3 + mrand(mk) * 4;
      }
    }
  }

  // ── Dibujo (coords LÓGICAS; el ctx ya está a escala SCALE) ────────────────
  // ── MONTURA (caballo) ──────────────────────────────────────────────────────
  // Ciclo de andar: 4 direcciones (SW/SE/NW/NE, las diagonales del motor) × 7
  // frames, en px de DISPOSITIVO, con ancla en los cascos (ax,ay). Las 8 direcciones
  // del walker se mapean a las 4 vistas. `seatY` = altura de la silla sobre el suelo;
  // `seatDx` = desplazamiento lateral del jinete (a afinar a ojo con ?mount=1).
  const HORSE_NF = 7;
  // riderY = altura (px disp.) de los PIES colgantes del jinete sentado sobre el
  // suelo (sube al jinete hasta la silla); riderDx = ajuste lateral sobre la silla.
  const HORSE_META = {
    SW: { w: 56, h: 69, ax: 18, ay: 69, riderY: 9, riderDx: 5 },
    SE: { w: 55, h: 68, ax: 15, ay: 68, riderY: 9, riderDx: -5 },
    NW: { w: 50, h: 76, ax: 11, ay: 76, riderY: 12, riderDx: 4 },
    NE: { w: 48, h: 75, ax: 36, ay: 75, riderY: 12, riderDx: -4 },
  };
  const HORSE_VIEW = { E: 'SE', SE: 'SE', S: 'SE', SW: 'SW', W: 'SW', NW: 'NW', N: 'NW', NE: 'NE' };
  const horseImg = {}; let horseReady = false, horseLoadStarted = false;
  // Carga DIFERIDA: los 28 frames del caballo solo se piden la primera vez que de
  // verdad se necesita una montura (no en cada finca aunque nadie vaya montado).
  function ensureHorses() {
    if (horseLoadStarted || typeof Image === 'undefined') return;
    horseLoadStarted = true;
    let n = 0; const need = 4 * HORSE_NF;
    ['SW', 'SE', 'NW', 'NE'].forEach(v => {
      horseImg[v] = [];
      for (let i = 0; i < HORSE_NF; i++) {
        const im = new Image(); im.onload = () => { if (++n >= need) horseReady = true; };
        im.src = 'assets/img/iso/horse-' + v + '-' + i + '.png?v=2'; horseImg[v].push(im);
      }
    });
  }
  // ¿Va montado este walker? (de momento solo un flag de depuración global para
  // previsualizar; el disparador real —p.ej. expediciones militares— vendrá luego.)
  if (typeof window !== 'undefined' && /[?&]mount=1/.test(window.location.search || '')) window.__HAC_MOUNT_ALL = true;   // previsualización
  // Estados en los que el mecenas está de VIAJE (sale/vuelve de expedición o escaramuza):
  // si tiene caballo, los recorre MONTADO (usa su propio corcel, que deja de rondar).
  const MOUNT_STATES = { 'exped-out': 1, 'exped-in': 1, 'esc-cheer': 1 };
  function montaSuCaballo(w) { return !!(w && caballos[w.id] && MOUNT_STATES[w.state]); }
  function isMounted(w) {
    const want = !!(w && (w.mounted || montaSuCaballo(w) || (typeof window !== 'undefined' && window.__HAC_MOUNT_ALL)));
    if (want) ensureHorses();
    return want && horseReady;
  }
  // Dibuja el caballo (frame del ciclo según el paso) bajo el jinete sentado en la silla.
  function drawMount(g, lx, ly, w, moving) {
    const v = HORSE_VIEW[w.dir || 'S'] || 'SW', m = HORSE_META[v];
    const fi = moving ? (Math.floor(w.phase * 1.6) % HORSE_NF) : 0;   // 0 = en reposo
    const variante = (caballos[w.id] && caballos[w.id].variante) || 'caballo';
    const img = horseFrame(variante, v, fi);
    const fx = lx * SCALE, fy = ly * SCALE;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false;
    if (img) g.drawImage(img, Math.round(fx - m.ax), Math.round(fy - m.ay), m.w, m.h);
    // Jinete: sprite del mecenas SENTADO, elevado hasta la silla.
    const cv = window.HacChar ? spriteFor(w, w.dir || 'S', 0, 'sit') : null;
    if (cv) {
      const FEET = charFEET();
      const dx = Math.round(fx - charW() * 0.5 + (m.riderDx || 0));
      const dy = Math.round(fy - FEET - (m.riderY || 0));
      g.imageSmoothingEnabled = pngOn();   // sprite pintado del jinete: suavizar (no el caballo)
      g.drawImage(cv, dx, dy, charW(), charH());
    }
    g.restore();
  }
  // Registro de VARIANTES de caballo (preparado para más caballos con distintas
  // características). Cada variante puede teñir el sprite (tono) — se HORNEA una vez
  // por (variante,vista,frame) y se cachea, sin coste por fotograma. En el futuro una
  // variante podría además apuntar a otro juego de sprites.
  const HORSE_SKINS = { caballo: { tono: null } };
  const horseTintCache = new Map();
  function horseFrame(variante, v, fi) {
    const arr = horseImg[v], base = arr && arr[fi]; if (!base) return null;
    const skin = HORSE_SKINS[variante] || HORSE_SKINS.caballo;
    if (!skin || !skin.tono) return base;                 // sin tinte → sprite crudo (caso actual)
    const key = variante + '|' + v + '|' + fi;
    let cv = horseTintCache.get(key);
    if (!cv) {
      const m = HORSE_META[v]; cv = document.createElement('canvas'); cv.width = m.w; cv.height = m.h;
      const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
      c.drawImage(base, 0, 0, m.w, m.h);
      c.globalCompositeOperation = 'source-atop'; c.globalAlpha = 0.38; c.fillStyle = skin.tono;
      c.fillRect(0, 0, m.w, m.h);
      horseTintCache.set(key, cv);
    }
    return cv;
  }
  // Dibuja un caballo SUELTO (sin jinete) rondando el campo exterior.
  function drawHorse(g, lx, ly, h) {
    const v = HORSE_VIEW[h.dir || 'SE'] || 'SE', m = HORSE_META[v];
    const fi = h.moving ? (Math.floor(h.phase * 1.6) % HORSE_NF) : 0;
    const img = horseFrame(h.variante || 'caballo', v, fi); if (!img) return;
    const fx = lx * SCALE, fy = ly * SCALE;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false;
    g.drawImage(img, Math.round(fx - m.ax), Math.round(fy - m.ay), m.w, m.h);
    g.restore();
  }
  // Crea la encarnación de un caballo: hogar ESTABLE (semilla por dueño) en el campo
  // que hay frente al portón sur, para que varios caballos no se amontonen.
  function makeHorse(id, info) {
    const e = wk && wk.exitCell; if (!e) return null;
    let seed = 2166136261; for (let i = 0; i < id.length; i++) seed = (seed ^ id.charCodeAt(i)) * 16777619 >>> 0;
    const r0 = (seed % 997) / 997;                         // 0..1 estable por dueño
    const homeX = e[0] + (r0 * 2 - 1) * 1.8;               // desplazamiento lateral estable
    const homeY = e[1] + 2.8 + r0 * 1.2;                   // al sur, fuera de la muralla (entre outNear y outFar)
    return { id, nombre: (info && info.nombre) || 'Corcel', variante: (info && info.variante) || 'caballo',
      _r: seed || 1, homeX, homeY, fx: homeX, fy: homeY, tx: homeX, ty: homeY, dir: 'SE', phase: 0, moving: false, pauseT: 1 + r0 * 3 };
  }
  // VIDA del caballo: pasta un rato, camina a un punto cercano del pastizal, se para.
  // Semi-determinista (mrand por dueño) → todos los clientes lo ven parecido. Se
  // auto-sincroniza con `caballos` (crea/quita) por si el mapa llega antes que la finca.
  function stepHorses(dt) {
    if (!wk || !wk.exitCell) return;
    const ids = Object.keys(caballos);
    if (horses.length !== ids.length || horses.some(h => !caballos[h.id])) {
      horses = horses.filter(h => caballos[h.id]);
      ids.forEach(id => { if (!horses.find(h => h.id === id)) { const nh = makeHorse(id, caballos[id]); if (nh) horses.push(nh); } });
    }
    const SPD = 0.62;
    horses.forEach(h => {
      const c = caballos[h.id]; if (c && c.nombre) h.nombre = c.nombre;
      if (h.moving) h.phase += dt * 4;
      if (h.pauseT > 0) { h.pauseT -= dt; return; }
      if (h.moving) {
        const dx = h.tx - h.fx, dy = h.ty - h.fy, d = Math.sqrt(dx * dx + dy * dy), adv = SPD * dt;
        const fd = faceFromGrid(dx, dy); if (fd) h.dir = fd;
        if (d <= adv || d < 0.02) { h.fx = h.tx; h.fy = h.ty; h.moving = false; h.pauseT = 2.5 + mrand(h) * 6; }
        else { h.fx += dx / d * adv; h.fy += dy / d * adv; }
      } else if (mrand(h) < 0.55) {                        // se pone a caminar por el pastizal
        h.tx = h.homeX + (mrand(h) * 2 - 1) * 1.3;
        h.ty = h.homeY + (mrand(h) * 2 - 1) * 0.9;
        h.moving = true;
      } else h.pauseT = 2 + mrand(h) * 5;                  // sigue pastando quieto
    });
  }

  function drawWalker(g, lx, ly, w, o) {
    o = o || {};
    // Glow del seleccionado (en coords lógicas, bajo los pies).
    if (o.highlight) {
      const r = 8 + Math.sin(w.phase * 0.5) * 1.4;
      g.fillStyle = 'rgba(255,224,130,0.22)'; g.beginPath(); g.ellipse(lx, ly, r, r * 0.5, 0, 0, 6.2832); g.fill();
      g.strokeStyle = 'rgba(255,224,130,0.95)'; g.lineWidth = 1.4; g.beginPath(); g.ellipse(lx, ly, r, r * 0.5, 0, 0, 6.2832); g.stroke();
    }
    const moving = w.moving && w.state !== 'tarea';
    const frame = moving ? (Math.floor(w.phase * 1.2) % charNF()) : 0;
    const pose = (w.state === 'tumbado') ? 'sit' : (w.bowing ? 'bow' : (moving ? 'walk' : 'stand'));
    const cv = window.HacChar ? spriteFor(w, w.dir || 'S', frame, pose) : null;
    const disp = SPRITE_DISP, FEET = charFEET();
    if (isMounted(w)) {
      drawMount(g, lx, ly, w, moving);   // caballo (ciclo de andar) + jinete sobre la silla
    } else if (cv) {
      // Blit en espacio de DISPOSITIVO (transform identidad) para que el sprite
      // quede nítido (igual que los sprites de edificio). Pies del sprite sobre (lx,ly).
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.imageSmoothingEnabled = pngOn();
      const dx = Math.round(lx * SCALE - charW() * 0.5 * disp);
      const dy = Math.round(ly * SCALE - FEET * disp);
      g.drawImage(cv, dx, dy, Math.round(charW() * disp), Math.round(charH() * disp));
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
    const disp = SPRITE_DISP, FEET = charFEET();
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

  // Cartel de NPC (mercader, funcionario…): placa de MADERA con marco de bronce,
  // a propósito DISTINTA del pendón dorado de un mecenas, para no confundirlos.
  // (cx, topY) = cabeza del NPC. `icon` = glifo de rol opcional.
  function npcBanner(g, cx, topY, label, icon) {
    const txt = (icon ? icon + ' ' : '') + String(label || '').slice(0, 16);
    g.font = '700 7.5px "Noto Sans SC",sans-serif';
    const tw = g.measureText(txt).width, bw = Math.max(20, tw + 11), bh = 12;
    const by = topY - bh - 6, bx = cx - bw / 2;
    g.strokeStyle = '#4a3a26'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(cx, topY); g.lineTo(cx, by + bh); g.stroke();   // asta corta
    rr(g, bx, by, bw, bh, 2.5); g.fillStyle = '#33424a'; g.fill();                         // placa teja-pizarra (NO dorada)
    g.strokeStyle = '#9c7b3a'; g.lineWidth = 1; rr(g, bx + 0.8, by + 0.8, bw - 1.6, bh - 1.6, 2); g.stroke();   // marco bronce
    g.fillStyle = '#8a6a3a'; [[bx + 2.4, by + 2.2], [bx + bw - 2.4, by + 2.2]].forEach(p => { g.beginPath(); g.arc(p[0], p[1], 0.8, 0, 6.2832); g.fill(); });   // tachones
    g.fillStyle = '#e8dcc0'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(txt, cx, by + bh / 2 + 0.5);
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
    const FEET = charFEET(), bannerDy = Math.round(FEET * SPRITE_DISP / SCALE) - 1;
    // Portones: hojas animadas (overlay; el sprite no las trae). Primero, para
    // quedar bajo los banners y bocadillos. Coste mínimo: 2 polígonos por portón.
    if (wk && wk.gates) wk.gates.forEach(gate => overlays.push({ draw: (g) => drawGate(g, gate) }));
    // Mercader(es): personajes fijos al frente de cada mercado (mismo render).
    const npcDy = bannerDy;
    if (wk && wk.merchants) wk.merchants.forEach(mk => {
      actors.push({ fx: mk.fx, fy: mk.fy, draw: (g, lx, ly) => drawWalker(g, lx, ly, mk, { banner: false }) });
      overlays.push({ draw: (g) => { const p = logic(mk.fx, mk.fy); npcBanner(g, p[0], p[1] - npcDy, mk.name, '市'); } });
    });
    if (wk && wk.clerks) wk.clerks.forEach(ck => {
      actors.push({ fx: ck.fx, fy: ck.fy, draw: (g, lx, ly) => drawWalker(g, lx, ly, ck, { banner: false }) });
      overlays.push({ draw: (g) => { const p = logic(ck.fx, ck.fy); npcBanner(g, p[0], p[1] - npcDy, ck.name, '📜'); } });
    });
    // Caballos sueltos: sprite como actor (con oclusión/profundidad) + su nombre encima.
    // Si su dueño está de VIAJE (lo va montando), el corcel no ronda: viaja con él.
    if (horses.length && horseReady) {
      const enViaje = {};
      walkers.forEach(w => { if (w.state === 'exped-out' || w.state === 'exped-in' || w.state === 'esc-cheer' || w.state === 'fuera') enViaje[w.id] = 1; });
      horses.forEach(h => {
        if (enViaje[h.id]) return;                     // lo lleva su jinete
        actors.push({ fx: h.fx, fy: h.fy, draw: (g, lx, ly) => drawHorse(g, lx, ly, h) });
        overlays.push({ draw: (g) => { const p = logic(h.fx, h.fy); const m = HORSE_META[HORSE_VIEW[h.dir || 'SE'] || 'SE']; npcBanner(g, p[0], p[1] - (Math.round(m.h * SPRITE_DISP / SCALE) - 1), h.nombre, '🐎'); } });
      });
    }
    // Mecenas visibles: el sprite va como actor (con oclusión); el NOMBRE va aparte.
    const nameCands = [];
    walkers.forEach(w => {
      if (w.id === selectedId) return;                 // el seleccionado va en overlay (encima)
      if (w.insideId) return;                          // DENTRO de un edificio: oculto (su presencia la anuncia el banner 匾額)
      if (w.state === 'fuera') return;                 // EN EXPEDICIÓN fuera de la finca: oculto hasta volver
      actors.push({ fx: w.fx, fy: w.fy, draw: (g, lx, ly) => drawWalker(g, lx, ly, w, { banner: false }) });
      nameCands.push(w);
    });
    // Banners de nombre (overlay): de DELANTE hacia atrás, se CLAMPEAN en horizontal
    // (no se recortan en los bordes) y se OMITE el que solaparía a otro ya dibujado
    // (declutter cuando los mecenas se agolpan). El seleccionado va aparte, siempre.
    nameCands.sort((a, b) => (b.fx + b.fy) - (a.fx + a.fy));
    const bannerBoxes = [], logicW = iso.width / SCALE;
    nameCands.forEach(w => {
      overlays.push({ draw: (g) => {
        const p = logic(w.fx, w.fy), s = bannerSprite(w, false);
        const Wd = s.cv.width / SCALE, Hd = s.cv.height / SCALE, topY = p[1] - bannerDy;
        const cx = Math.max(s.ax, Math.min(logicW - (Wd - s.ax), p[0]));
        const box = { x: cx - s.ax, y: topY - s.ay, w: Wd, h: Hd };
        if (bannerBoxes.some(b => !(box.x + box.w < b.x || box.x > b.x + b.w || box.y + box.h < b.y || box.y > b.y + b.h))) return;
        bannerBoxes.push(box);
        banner(g, cx, topY, w, false);
      } });
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
    // Pregones del mercader.
    if (wk && wk.merchants) wk.merchants.forEach(mk => { if (mk.speech) overlays.push({ draw: (g) => { const p = logic(mk.fx, mk.fy); speechBubble(g, p[0], p[1], mk.speech); } }); });
    if (wk && wk.clerks) wk.clerks.forEach(ck => { if (ck.speech) overlays.push({ draw: (g) => { const p = logic(ck.fx, ck.fy); speechBubble(g, p[0], p[1], ck.speech); } }); });

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
    horses = [];   // se recolocan sobre la finca nueva al re-sincronizar caballos
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
    const enEsc = !!escMap[w.id];
    if (w.state === 'esc-cheer') return w.bowing ? '¡A la batalla!' : 'Formando en el portón';
    if (w.state === 'saludo') return enEsc ? 'Se prepara para la escaramuza' : 'Recibe tus órdenes';
    if (w.state === 'fuera') return enEsc ? 'Combatiendo en la escaramuza' : 'En expedición fuera de la finca';
    if (w.state === 'exped-out') return enEsc ? 'Acude al portón' : 'Saliendo de la finca';
    if (w.state === 'exped-in') return 'Regresando de la expedición';
    if (w.state === 'a-consultar') return 'Va al tablón de misiones';
    if (w.state === 'consultando') return 'Consultando el tablón de misiones';
    if (w.state === 'a-ojear') return 'Se acerca al tablón de misiones';
    if (w.state === 'ojeando') return 'Ojeando las misiones del tablón';
    if (w.state === 'a-curiosear') return 'Atraído por el mercado';
    if (w.state === 'curioseando') return 'Curioseando el género del mercado';
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
    const frame = moving ? (Math.floor(w.phase * 1.2) % charNF()) : 0;
    const pose = (w.state === 'tumbado') ? 'sit' : (w.bowing ? 'bow' : (moving ? 'walk' : 'stand'));
    // Retrato: usa el MASTER de alta resolución (nítido) si está; si no, el sprite de finca.
    const cv = (HacChar.imgFor && HacChar.imgFor(w.dir || 'S', pose, frame)) || spriteFor(w, w.dir || 'S', frame, pose);
    if (!cv) return;
    g.imageSmoothingEnabled = pngOn();
    const cw = cv.width || charW(), ch = cv.height || charH();
    const s = Math.min(canvas.width / cw, canvas.height / ch);
    const dw = Math.round(cw * s), dh = Math.round(ch * s);
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

  function mainBuildingId() { return wk ? (wk.mainBid || null) : null; }
  return { start, stop, list, select, selected, position, buildings, buildingTypes, setOrders, setEscaramuzas, setCaballos, drawAvatar, goHome, consultar, consultando, dejarConsulta, mainBuildingId };
})();
if (typeof window !== 'undefined') window.HacFolk = HacFolk;
