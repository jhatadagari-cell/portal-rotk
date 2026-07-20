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

  let raf = null, iso = null, opts = null, walkers = [], wk = null, names = {}, curTier = 1;
  let enviadoDesc = null;   // descriptor del ENVIADO activo (tabla `enviados`); null = ninguno
  let enviadoRevelado = false;   // ¿este cliente ya conoce el nombre del enviado? (local, por jugador)
  let running = false, visible = true, onScreen = true, io = null;
  let selectedId = null, stateSig = '', hailCd = 20;
  // Capa de personajes NÍTIDA: los mecenas/mercaderes/escribanos se dibujan en un
  // lienzo aparte a resolución de PANTALLA (desde el maestro de alta resolución),
  // proyectando mundo→pantalla con el transform de la cámara cada frame. Así se ven
  // nítidos a cualquier zoom (el lienzo del mundo es pixel-art horneado a SCALE=2 y
  // se emborrona al ampliar). Compromiso: se pierde la oclusión por edificios altos.
  let ovCanvas = null, ovCtx = null, lastOv = { people: [], sel: null };
  // Celdas RESALTADAS (amarillo) sobre el mapa (p.ej. elegir jardín para un debate).
  let hlCells = [], hlPhase = 0;
  function setHighlight(cells) { hlCells = Array.isArray(cells) ? cells.slice() : []; }

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
  // ── Debate: dos mecenas caminan a un jardín y debaten 5 min (feature Debates) ──
  // debateMap[walkerId] = { inicioMs, finMs, jardinCell:"x,y", partnerId, side:0|1, seed }
  // (lo fija la página desde HacDebates; sincronizado por inicioMs → igual en todos).
  let debateMap = {};
  function setDebate(m) { debateMap = m || {}; }
  // Burbujas del debate: SIN emojis. Puntos suspensivos ANIMADOS, notas musicales o
  // exclamaciones. (Los frustrados solo sueltan exclamaciones.)
  const DEB_DOTS = ['·', '··', '···'];
  const DEBATE_MUSIC = ['♪', '♫', '♪♫'];
  const DEBATE_EXCL = ['!', '?', '¡!', '¿?'];
  const DEBATE_FRUST_EXCL = ['‼', '?!', '¡!', '!', '?'];
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
  // PEREGRINAJE «En busca del legendario curandero»: no es un grito de guerra. Lo
  // anuncia el ESCOLTA (el "ayudante"); el herido va callado, cojeando. Si parte solo,
  // el propio herido murmura su propósito.
  const PEREG_CRY = '¡Vamos a por el legendario curandero!';
  const PEREG_SOLO_CRY = 'Debo llegar hasta el gran sabio de la montaña…';
  // Grito de guerra de un mecenas al partir: si tiene un VÍNCULO con un co-miembro
  // de su banda, dice una frase temática (R1b); si no, el genérico. Los unilaterales
  // (odio/amor no correspondido) solo los "dice" quien SIENTE el vínculo.
  function escCheerFor(w) {
    const mine = escMap[w.id];
    // ── Peregrinaje: lo canta el ayudante, no el herido ──
    if (mine && mine.pereg) {
      const co = Object.keys(escMap).filter(id => escMap[id] && escMap[id].inicioMs === mine.inicioMs);
      const escoltas = co.filter(id => !escMap[id].hurt).sort((a, b) => escMap[a].idx - escMap[b].idx);
      if (escoltas.length) return (escoltas[0] === w.id) ? PEREG_CRY : null;   // el ayudante de menor rango habla; el resto (y el herido) callan
      return mine.hurt ? PEREG_SOLO_CRY : null;                                // sin escolta: el herido murmura
    }
    if (!window.HacRelaciones || !haciendaId || !mine) return ESC_CRY;
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
  function spriteFor(w, dir, frame, pose, oficio, workPhase) {
    // Rework PNG: si el sprite de calidad está horneado, se usa (todos los
    // mecenas comparten el sprite por defecto → sin cachear por walker). El trabajo
    // (pose 'work') es procedural (no hay PNG) → cae al render de abajo.
    if (window.HacChar && HacChar.sprite && !oficio) {
      const png = HacChar.sprite(dir, pose, frame);
      if (png) return png;
    }
    // Aspecto base + ROPA DE TORSO equipada (fusión EN VIVO, como las secuelas): así
    // equipar/quitar una prenda se refleja al instante y entra en la clave de caché.
    const a = (window.HacStats && HacStats.vestir) ? HacStats.vestir(w.id, w.aspecto || {}) : (w.aspecto || {});
    // SECUELAS permanentes (manco/tuerto…): forman parte del aspecto → entran en la clave
    // de caché y se dibujan siempre (finca + retrato del panel), no solo en el peregrinaje.
    const sec = (window.HacStats && HacStats.secuelas) ? HacStats.secuelas(w.id) : [];
    const secKey = sec.length ? sec.slice().sort().join(',') : '';
    const wpKey = oficio ? '|' + oficio + Math.floor((workPhase || 0) * 6) : '';   // labor cuantizada (6 pasos) → cacheable
    const key = (w.aptitud || '_') + '|' + (a.atuendo || '') + '|' + (a.robe || '') + '|' + (a.accent || '') + '|' + (a.kind || '') + (a.torsoLujo ? 'L' : '') + (a.torsoGala ? 'G' : '') + (a.gala || '') + '|' + (a.arma || '') + '|' + (a.piel || 0) + '|' + (a.pelo || 0) + '|' + dir + '|' + frame + '|' + (pose || 's') + wpKey + (secKey ? '|' + secKey : '');
    let cv = spriteCache.get(key);
    if (!cv && window.HacChar) {
      cv = document.createElement('canvas');
      HacChar.draw(cv, { aptitud: w.aptitud, aspecto: a, dir: dir, frame: frame, scale: 1, pose: pose, oficio: oficio || null, workPhase: workPhase || 0, secuelas: sec });
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
      if (best) {
        b.approach = best.app; b.approachKey = best.app[0] + ',' + best.app[1];
        // El TABLÓN no se "entra": nada de tareas DENTRO ni banner 匾額 de ocupantes.
        // Solo se CONSULTA de pie delante (el flujo usa approach/approachKey), así que
        // le damos aproximación pero NO lo marcamos visitable (queda fuera del vagabundeo
        // ambiente que mete mecenas dentro). Su "spot" es la propia celda de delante.
        if (b.tipo === 'tablon') { b.spotCell = best.app; }
        else { b.spotCell = best.spot; b.visitable = true; visitable.push(b); }
      }
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
    // TABLÓN DE ANUNCIOS (告示牌): punto de consulta de las MISIONES. Sustituye al
    // antiguo funcionario. `mainBid` = el tablón MÁS AL FRENTE (mayor gx+gy) → es
    // el que se consulta. Ya NO hay funcionario: la vida del tablón (curiosos que
    // se asoman y comentan) gira en torno al propio tablón (`boardFocus`).
    const clerks = [];                                    // sin funcionario
    let mainBid = null, boardSlots = [], boardFocus = null;
    let bestBoard = -Infinity;
    buildings.forEach(b => { if (b.tipo === 'tablon' && (b.cx + b.cy) > bestBoard) { bestBoard = b.cx + b.cy; mainBid = b.id; } });
    const board = mainBid ? buildings.get(mainBid) : null;
    if (board) {
      boardFocus = [board.cx, board.cy];
      // Huecos en SEMICÍRCULO AL FRENTE del tablón (+x/+y en iso) donde los curiosos
      // se asoman mirándolo. Se salta la celda de aproximación (donde se planta el
      // mecenas que consulta) y las no transitables.
      const ap = board.approachKey;
      [[1, 1], [0, 1], [1, 0], [2, 1], [1, 2], [2, 2], [0, 2]].forEach(([ox, oy]) => {
        const x = board.cx + ox, y = board.cy + oy, k = x + ',' + y;
        if (boardSlots.length < 5 && set.has(k) && k !== ap) boardSlots.push({ cell: [x, y], by: null });
      });
    }
    const boardRng = { _r: 0x9e3779b9 };                  // RNG propio del tablón (no toca R)
    return { set, cells, cam, camCells, garden, gardenCells, water, GW, GH, ownByMember, buildings, visitable, gates, merchants, clerks, mainBid, boardSlots, boardFocus, boardRng, exitCell, exitKey: exitCell ? exitCell[0] + ',' + exitCell[1] : null, outNear, outFar };
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
    curTier = tier;
    wk = build(mapa, tier);
    names = {}; (miembros || []).forEach(m => { names[m.id] = m.nombre || ''; });
    if (!wk.cells.length) return [];
    // NO saturar la finca: TODOS los jugadores + solo unos pocos NPC (talentos/客).
    // El resto de NPC existen en los datos (roster) pero no deambulan por el mapa.
    const players = (miembros || []).filter(m => !m.npc);
    const npcs = (miembros || []).filter(m => m.npc).slice(0, 6);
    return players.concat(npcs).slice(0, 24).map(m => {
      // Edificio propio (si administra alguno): se usa como "hogar" al que gravita
      // y que visita más a menudo.
      let homeBid = null, home = null, start = null;
      wk.buildings.forEach(b => { if (b.dueno === m.id && b.visitable) homeBid = b.id; });
      if (homeBid) { const b = wk.buildings.get(homeBid); home = b.spotCell; start = b.approach; }
      if (!start) start = (wk.camCells.length && R.next() < 0.7) ? wk.camCells[rnd(wk.camCells.length)] : wk.cells[rnd(wk.cells.length)];
      // Modelo del mecenas: aptitud/aspecto de su personaje registrado. Si no
      // tiene personaje vinculado, modelo por defecto con el color de la casa.
      const pj = (m.personajeId && window.HacPersonajes && HacPersonajes.get) ? HacPersonajes.get(m.personajeId) : null;
      const aptitud = pj ? pj.aptitud : (m.aptitud || '');
      // Aspecto BASE del personaje. La ROPA DE TORSO equipada se fusiona EN VIVO en
      // spriteFor() (como las secuelas), para que equipar/quitar se vea sin re-spawn.
      // NPC reclutados (talentos) llevan su propio `aspecto` para verse como su retrato.
      const aspecto = pj ? (pj.aspecto || {}) : (m.aspecto || { robe: color });
      // Prestigio TOTAL = base (admin) + ganado en misiones/escaramuzas, para que el
      // cargo del mecenas que camina por la finca refleje lo jugado, no solo la base.
      const ganado = (window.HacPuntos && HacPuntos.deMiembro && m.personajeId && haciendaId) ? (Number(HacPuntos.deMiembro(haciendaId, m.personajeId)) || 0) : 0;
      const totPts = (Number(m.puntos) || 0) + ganado;
      const cargo = (window.HacCalc && HacCalc.rangoDePuntos) ? HacCalc.rangoDePuntos(totPts, tier) : null;
      const rankIdx = (window.HacCalc && HacCalc.rangoIndex) ? HacCalc.rangoIndex(totPts, tier) : -1;
      const aptDef = (aptitud && window.HacPersonajeDefs) ? HacPersonajeDefs.aptitud(aptitud) : null;
      return {
        // id del walker = id del PERSONAJE (clave estable para órdenes/energía/
        // competencias y verificable en RLS). Fallback al id de miembro si no hay
        // personaje vinculado (mecenas sin cuenta, no controlable por un jugador).
        id: m.personajeId || m.id, name: m.nombre || '', color, aptitud, aspecto, npc: !!m.npc,
        // NOMBRE DE CORTESÍA (字) y atuendo: para dirigirse por cortesía (no «¡eh, Guan!»)
        // y detectar la HERMANDAD (Liu Bei/Guan Yu/Zhang Fei) al charlar.
        cortesia: (aspecto && aspecto.cortesia) || '', atuendo: (aspecto && aspecto.atuendo) || '',
        // TALLA: factor de tamaño del sprite. Guan Yu (atuendo 'general') va algo más
        // alto que el resto; o vía aspecto.talla explícita. 1 = normal.
        talla: (aspecto && Number(aspecto.talla)) || (aspecto && aspecto.atuendo === 'general' ? 1.10 : 1),
        basePuntos: Number(m.puntos) || 0,   // puntos base (admin); el ganado se suma al vuelo en refreshCargos
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

  // ── ENVIADO (visitante de otra hacienda) ──────────────────────────────────
  // Un enviado NO es miembro: es un walker especial que ESPERA fuera del portón
  // sur ('esperando'), girándose y haciendo una reverencia 抱拳 con una palabra
  // cortés cuando un mecenas pasa cerca. Si el fundador lo INVITA ('visita'),
  // pasa dentro (el paseo guiado es Fase 3). Su modelo (aptitud/aspecto/字/color
  // de facción) sale de su personaje registrado; con seed de dev, de `desc`.
  const ENVOY_GREET = [
    '抱拳 Salud, noble mecenas.', 'Larga vida a esta casa.', 'Honor a quien aquí mora.',
    '抱拳 Un placer conoceros.', 'Prósperos vuestros campos.', 'Que el cielo os sea propicio.'
  ];
  function envoyGreet() { return ENVOY_GREET[rnd(ENVOY_GREET.length)]; }

  function makeVisitor(desc) {
    if (!desc || !desc.id || !wk) return null;
    const pj = (window.HacPersonajes && HacPersonajes.get) ? HacPersonajes.get(desc.id) : null;
    const aptitud = pj ? pj.aptitud : (desc.aptitud || '');
    const aspecto = pj ? (pj.aspecto || {}) : (desc.aspecto || {});
    const name = (pj && pj.nombre) || desc.name || 'Enviado';
    const faccionId = (pj && pj.faccion) || desc.faccionId || null;
    const fac = (faccionId && window.HacFacciones && HacFacciones.get) ? HacFacciones.get(faccionId) : null;
    const color = (fac && fac.color) || desc.color || '#9a7b4f';
    const aptDef = (aptitud && window.HacPersonajeDefs) ? HacPersonajeDefs.aptitud(aptitud) : null;
    // Se planta a UN LADO del vano (suroeste), no en el eje: así no tapa la puerta
    // ni pisa el pastizal de los caballos, pero el tránsito que sale por el portón
    // le pasa lo bastante cerca para que se sobresalte y se aparte.
    const base = wk.outNear || wk.exitCell || wk.cells[0];
    const spot = [base[0] - 1.3, base[1]];
    const invitado = desc.estado === 'visita';
    // Si YA viene invitado (carga en frío: otro jugador lo hizo pasar antes), aparece
    // DENTRO paseando; el cruce andando del portón solo se anima en la invitación en vivo.
    const startCell = (invitado && wk.exitCell) ? wk.exitCell : spot;
    return {
      id: desc.id, name, color, aptitud, aspecto, npc: true,
      cortesia: (aspecto && aspecto.cortesia) || desc.cortesia || '', atuendo: (aspecto && aspecto.atuendo) || '',
      talla: (aspecto && Number(aspecto.talla)) || (aspecto && aspecto.atuendo === 'general' ? 1.10 : 1),
      basePuntos: 0, cargoIcon: '', cargoNombre: '', cargoTier: 0, rankIdx: -1,
      aptIcon: aptDef ? (aptDef.icon || '') : '', dominios: aptDef ? (aptDef.dominios || []) : [],
      fx: startCell[0], fy: startCell[1], tx: startCell[0], ty: startCell[1], moving: false, dir: 'SE',
      state: invitado ? 'visita-pasea' : 'esperando', path: null, goalBid: null, insideId: null, task: null,
      homeBid: null, home: null, taskTimer: 0, strollTimer: 0, wait: null,
      idleTimer: 0, gardenCd: 0, socialCd: 0, chatWith: null, chatLead: false, chatRole: null,
      bowing: false, bowTimer: 0, convo: null, convoIdx: 0, turnTimer: 0, speech: null, speechT: 0,
      meetWith: null, meetLead: false, meetTimer: 0, restIntent: null, phase: R.next() * 6.28,
      order: null, onMission: false, missionTimer: 0, missionEndMs: 0, missionTask: null, missionDoneFor: null,
      // marca de enviado (facNombre/facZh: fallback del badge con seed de dev sin DB)
      visitante: true, reveal: enviadoRevelado, faccionId, facNombre: desc.facNombre || (fac && fac.nombre) || '', facZh: desc.facZh || (fac && fac.zh) || '',
      bowCd: rng(1, 3), spot: [spot[0], spot[1]]
    };
  }

  // Reconcilia el walker visitante con `enviadoDesc` (fuente = tabla `enviados`):
  // lo añade si falta, lo reconstruye si cambió de persona, ajusta su estado, o
  // lo quita si ya no hay enviado. Se llama tras (re)poblar y en setEnviado (vivo).
  function syncEnviado() {
    if (!wk) return;
    const i = walkers.findIndex(w => w.visitante);
    // Si ya no hay enviado activo, quita su walker — SALVO que se esté DESPIDIENDO
    // (camina de vuelta a su hacienda): déjalo terminar la salida y ya se autoquita.
    if (!enviadoDesc || !enviadoDesc.id) { if (i >= 0 && walkers[i].state !== 'visita-sale' && walkers[i].state !== 'visita-ido') walkers.splice(i, 1); return; }
    if (i < 0) { const v = makeVisitor(enviadoDesc); if (v) walkers.push(v); return; }
    const cur = walkers[i];
    if (cur.id !== enviadoDesc.id) { const v = makeVisitor(enviadoDesc); if (v) walkers[i] = v; return; }
    const invitado = enviadoDesc.estado === 'visita';
    const dentro = ['visita-entra', 'visita-pasea'].indexOf(cur.state) >= 0;
    if (invitado && cur.state === 'esperando') {
      startEnvoyEntry(cur);   // invitación EN VIVO: cruza el portón andando y se pone a pasear
    } else if (!invitado && dentro) {
      // Se le retira la invitación (p.ej. dev toggle): vuelve a su puesto ante el vano.
      cur.state = 'esperando'; cur.path = null; cur.bowing = false; cur.dir = 'SE';
      cur.dodgeTX = null; cur.dodgeTY = null; cur.paceReturn = false;
      cur.fx = cur.spot[0]; cur.fy = cur.spot[1]; cur.tx = cur.spot[0]; cur.ty = cur.spot[1];
    }
  }

  // ── Movimiento del enviado (independiente del sim de miembros) ──────────────
  const SPD_ENVOY = 1.0;   // ritmo tranquilo y digno

  // Mover simple a lo largo de w.path SIN pasar por onPathDone (que asume mecenas
  // con cargo/misiones). Devuelve true cuando ha consumido todo el camino.
  function envoyMove(w, dt, SPD) {
    if (!w.moving) {
      if (w.path && w.path.length) { const c = w.path.shift(); w.tx = c[0]; w.ty = c[1]; w.moving = true; }
      else return true;
    }
    const dx = w.tx - w.fx, dy = w.ty - w.fy, d = Math.hypot(dx, dy), adv = (SPD || SPD_ENVOY) * dt;
    const fd = faceFromGrid(dx, dy); if (fd) w.dir = fd;
    if (d <= adv) { w.fx = w.tx; w.fy = w.ty; w.moving = false; return !(w.path && w.path.length); }
    w.fx += dx / d * adv; w.fy += dy / d * adv; return false;
  }

  // Cruza el portón ANDANDO (esperando → visita-entra). Como el punto de espera está
  // FUERA de la rejilla (no en wk.set), el bfs no lo alcanza: se construye a mano un
  // par de waypoints (acercarse al vano → umbral → dentro), igual que la expedición
  // apila outNear/outFar. Ya dentro, 'visita-pasea' toma el relevo.
  function startEnvoyEntry(w) {
    w.bowing = false; w.speech = null; w.dodging = false; w.dodgeTX = null; w.dodgeTY = null;
    const inside = wk.exitCell;
    if (!inside) { w.state = 'visita-pasea'; w.path = null; w.moving = false; w.wait = null; return; }
    const wps = [];
    if (wk.outNear) wps.push(wk.outNear);          // acércate al vano desde fuera
    wps.push([inside[0], inside[1] + 1]);          // umbral
    wps.push([inside[0], inside[1]]);              // dentro del vano
    w.path = wps; w.state = 'visita-entra'; w.moving = false;
  }

  // DESPEDIDA: el enviado deja la finca ANDANDO — camina hasta el vano, cruza el
  // portón sur y se aleja al campo (rumbo a su hacienda). Al llegar lejos, 'visita-ido'
  // (el sim lo autoquita). Waypoints a mano fuera de la rejilla (como la expedición).
  function startEnvoyLeave(w) {
    w.bowing = false; w.speech = '抱拳 Que el Cielo os guarde, buen señor.'; w.speechT = 3; w.dodging = false; w.dodgeTX = null; w.dodgeTY = null;
    const start = [Math.round(w.fx), Math.round(w.fy)];
    const inPath = (wk.exitKey ? bfs(start, new Set([wk.exitKey])) : null) || [];
    const wps = inPath.slice();
    if (wk.exitCell) wps.push([wk.exitCell[0], wk.exitCell[1] + 1]);   // umbral del vano
    if (wk.outNear) wps.push(wk.outNear);
    if (wk.outFar) wps.push(wk.outFar);                               // se pierde al sur
    w.path = wps.length ? wps : null; w.state = wps.length ? 'visita-sale' : 'visita-ido'; w.moving = false;
  }

  // Objetivo del paseo de invitado: preferentemente el jardín; si no, un camino o
  // cualquier celda del recinto. Devuelve una clave "x,y" o null.
  function envoyStrollTarget(w) {
    const g = (wk.gardenCells && wk.gardenCells.length) ? wk.gardenCells : null;
    const pool = (g && R.next() < 0.6) ? g : (wk.camCells && wk.camCells.length ? wk.camCells : wk.cells);
    if (!pool || !pool.length) return null;
    const c = pool[rnd(pool.length)];
    return c[0] + ',' + c[1];
  }

  // Paseo de invitado dentro de la finca: camina a un punto (jardín/camino), hace una
  // pausa mirando alrededor y elige otro. No entra en edificios (dominios=[]).
  function envoyStroll(w, dt) {
    if (w.moving || (w.path && w.path.length)) { envoyMove(w, dt, SPD_ENVOY); return; }
    if (w.wait == null) w.wait = rng(1.5, 3.5);
    w.wait -= dt;
    if (w.wait > 0) {   // pausa: observa el recinto como un huésped curioso
      w.idleLook = (w.idleLook != null ? w.idleLook : rng(2, 4)) - dt;
      if (w.idleLook <= 0) { const dirs = ['SE', 'S', 'SW', 'E', 'NE']; w.dir = dirs[rnd(dirs.length)]; w.idleLook = rng(2.5, 5); }
      return;
    }
    w.wait = rng(1.8, 4.0);
    const target = envoyStrollTarget(w);
    if (target) { const p = bfs([Math.round(w.fx), Math.round(w.fy)], new Set([target])); if (p && p.length) { w.path = p; w.moving = false; } }
  }

  // Tick del enviado. 'esperando': aguarda ante el portón — se gira, hace una
  // reverencia cortés a quien pasa, se sobresalta si le rozan y da algún paseíllo
  // para no ser un pasmarote. 'visita-entra': cruza el portón andando. 'visita-pasea':
  // deambula por el patio/jardín como huésped invitado.
  const ENVOY_STARTLE = ['¡Oh!', '¡Uy, disculpad!', '¡Ah, perdón!'];
  function visitorStep(w, dt) {
    w.phase += dt * (w.moving ? 8 : 0.3);   // piernas cíclando de verdad al andar; leve mecerse al parar
    if (w.speechT > 0) { w.speechT -= dt; if (w.speechT <= 0) w.speech = null; }
    if (w.bowCd > 0) w.bowCd -= dt;

    if (w.state === 'visita-entra') {
      if (envoyMove(w, dt, SPD_ENVOY)) { w.state = 'visita-pasea'; w.moving = false; w.wait = rng(1, 2.5); w.dir = 'SE'; }
      return;
    }
    if (w.state === 'visita-sale') { if (envoyMove(w, dt, SPD_ENVOY)) w.state = 'visita-ido'; return; }   // despedida: camina fuera; al llegar, el sim lo quita
    if (w.state === 'visita-ido') return;
    if (w.state === 'visita-pasea') { envoyStroll(w, dt); return; }
    if (w.state !== 'esperando') return;

    const spot = w.spot || [w.fx, w.fy];
    // Intruso más cercano: cualquier mecenas (no visitante) o CABALLO. Los que
    // salen por el portón le pasan justo por encima → se sobresalta y se aparta.
    let near = null, nd = 1e9;
    for (let k = 0; k < walkers.length; k++) {
      const o = walkers[k]; if (o === w || o.visitante) continue;
      if (o.insideId) continue;   // dentro de un edificio: no cuenta
      const dx = o.fx - w.fx, dy = o.fy - w.fy, d = dx * dx + dy * dy;
      if (d < nd) { nd = d; near = o; }
    }
    for (let k = 0; k < horses.length; k++) {
      const hh = horses[k]; if (hh.fx == null) continue;
      const dx = hh.fx - w.fx, dy = hh.fy - w.fy, d = dx * dx + dy * dy;
      if (d < nd) { nd = d; near = { fx: hh.fx, fy: hh.fy, horse: true }; }
    }

    const STARTLE = 2.4;   // radio² ≈ 1.55 celdas: se aparta para no superponerse
    if (near && nd < STARTLE) {
      if (!w.dodging) {
        w.dodging = true; w.bowing = false;
        w.speech = near.horse ? '¡So, caballo! 抱拳' : ENVOY_STARTLE[rnd(ENVOY_STARTLE.length)];
        w.speechT = 1.6;
        const side = (near.fx <= w.fx) ? 1 : -1;      // apártate al lado opuesto al intruso
        w.dodgeTX = spot[0] + side * 1.7;
        w.dodgeTY = spot[1] + 0.7;                    // y un pelín afuera, despejando el vano
      }
    } else if (w.dodging && (!near || nd > STARTLE * 2.6)) {
      w.dodging = false; w.dodgeTX = spot[0]; w.dodgeTY = spot[1];   // ya pasó: vuelve a su sitio
    }

    // Paseíllo de espera: cada tanto da un paso al lado y vuelve, para no quedarse
    // clavado. Reutiliza el objetivo dodgeTX/TY, pero a paso tranquilo (sin sobresalto).
    if (!w.dodging && !w.bowing && w.dodgeTX == null) {
      w.paceTimer = (w.paceTimer != null ? w.paceTimer : rng(12, 22)) - dt;
      if (w.paceTimer <= 0) {
        const side = rnd(2) ? 1 : -1;
        w.dodgeTX = spot[0] + side * 0.9; w.dodgeTY = spot[1] + rng(0, 0.4);
        w.paceReturn = true; w.paceTimer = rng(14, 26);
      }
    }

    // Movimiento hacia el objetivo (apartándose o volviendo). Se aparta más rápido
    // (sobresalto) de lo que regresa (con calma). Sin BFS: es un apartarse local.
    const tgtX = (w.dodgeTX != null) ? w.dodgeTX : spot[0];
    const tgtY = (w.dodgeTY != null) ? w.dodgeTY : spot[1];
    const ddx = tgtX - w.fx, ddy = tgtY - w.fy, dist = Math.sqrt(ddx * ddx + ddy * ddy);
    if (dist > 0.05) {
      const sp = (w.dodging ? 2.4 : 1.3) * dt, stp = Math.min(sp, dist);
      w.fx += ddx / dist * stp; w.fy += ddy / dist * stp; w.moving = true;
      const fd = faceFromGrid(ddx, ddy); if (fd) w.dir = fd;
      return;   // mientras se mueve, ni reverencia ni saludo
    }
    w.moving = false;
    // Parado y sin sobresalto → suelta el objetivo puntual (paseíllo o vuelta tras el
    // esquive) para volver al sitio y quedar listo para el próximo paso lateral.
    if (!w.dodging) { w.dodgeTX = null; w.dodgeTY = null; w.paceReturn = false; }

    // VIDA AMBIENTAL (no ser un pasmarote aunque no pase nadie): mira alrededor y,
    // de vez en cuando, hace una reverencia 抱拳 cortés al aire. Si alguien pasa
    // cerca (radio mayor), le dedica el saludo a él.
    w.idleLook = (w.idleLook != null ? w.idleLook : rng(1, 3)) - dt;
    w.idleBow = (w.idleBow != null ? w.idleBow : rng(6, 12)) - dt;
    if (!w.dodging && !w.bowing && w.bowCd <= 0) {
      if (near && nd < 16) {                         // ~4 celdas: saluda a quien pase
        const fd = faceFromGrid(near.fx - w.fx, near.fy - w.fy); if (fd) w.dir = fd;
        w.bowing = true; w.bowTimer = rng(1.4, 2.0); w.speech = envoyGreet(); w.speechT = 2.6; w.bowCd = rng(5, 9);
      } else if (w.idleBow <= 0) {                   // reverencia ambiental: si hay
        // algún residente a la vista (aunque esté al otro lado del patio), se orienta
        // hacia él y a veces le brinda un saludo — así «interactúa» con la casa aunque
        // nadie salga por el portón. Si no hay nadie, mira al frente.
        const isMec = near && !near.horse;
        const fd = isMec ? faceFromGrid(near.fx - w.fx, near.fy - w.fy) : null;
        w.dir = fd || 'SE'; w.bowing = true; w.bowTimer = rng(1.2, 1.8); w.bowCd = rng(4, 7); w.idleBow = rng(10, 18);
        w.speech = (isMec && rng(0, 1) < 0.4) ? envoyGreet() : null; if (w.speech) w.speechT = 2.6;
      }
    }
    // Girar la cabeza/cuerpo de tanto en tanto para dar sensación de espera atenta.
    if (!w.bowing && !w.dodging && w.idleLook <= 0) {
      const dirs = ['SE', 'S', 'SW', 'E']; w.dir = dirs[rnd(dirs.length)]; w.idleLook = rng(2.2, 4.5);
    }
    if (w.bowing) { w.bowTimer -= dt; if (w.bowTimer <= 0) { w.bowing = false; w.idleLook = rng(1.5, 3); } }
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
    if (w.onMission || ['exped-out', 'exped-in', 'fuera', 'saludo', 'esc-cheer', 'esc-form', 'monta-out', 'silbando'].indexOf(w.state) >= 0) return false;
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

  // CONSULTAR el tablón de misiones (local): el mecenas va al TABLÓN de anuncios,
  // se planta delante con un cartelito 📜 sobre la cabeza y espera
  // a que el jugador lo pulse. No lo bloquea: una misión/orden lo saca. Devuelve
  // 'walking' / 'now' (ya está) / false (ocupado/sin ruta).
  function consultar(id, buildingId) {
    const w = walkers.find(x => x.id === id); if (!w || !wk) return false;
    if (w.onMission || ['exped-out', 'exped-in', 'fuera', 'saludo', 'esc-cheer', 'esc-form', 'monta-out', 'silbando'].indexOf(w.state) >= 0) return false;
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

  // Recalcula el cargo de cada mecenas con su prestigio TOTAL (base + ganado en
  // misiones/escaramuzas). El prestigio se carga async y crece al jugar, así que la
  // página llama a esto tras cargar/actualizar HacPuntos. El banner del nombre se
  // cachea por (icono, cargoTier, …): al cambiar esos campos, se re-hornea solo en
  // el siguiente frame; no hace falta forzar repintado.
  function refreshCargos() {
    if (!walkers.length || !window.HacCalc || !HacCalc.rangoDePuntos) return false;
    let changed = false;
    walkers.forEach(w => {
      const ganado = (window.HacPuntos && HacPuntos.deMiembro && haciendaId) ? (Number(HacPuntos.deMiembro(haciendaId, w.id)) || 0) : 0;
      const tot = (Number(w.basePuntos) || 0) + ganado;
      const cargo = HacCalc.rangoDePuntos(tot, curTier);
      const ci = cargo ? (cargo.icon || '') : '', cn = cargo ? cargo.nombre : '', ct = cargo ? (cargo.tier || 1) : 0;
      const ri = HacCalc.rangoIndex ? HacCalc.rangoIndex(tot, curTier) : -1;
      if (ci !== w.cargoIcon || cn !== w.cargoNombre || ct !== w.cargoTier || ri !== w.rankIdx) {
        w.cargoIcon = ci; w.cargoNombre = cn; w.cargoTier = ct; w.rankIdx = ri; changed = true;
      }
    });
    return changed;
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
    // ESCARAMUZA en ventana de concentración: se detiene EN el portón (no cruza aún)
    // y espera a los demás. El resto (o si la ventana ya cerró) sigue hasta el campo.
    const em = escMap[w.id];
    const musterActive = em && nowSimMs() < em.inicioMs + ESC_MUSTER_MS;
    // CON CABALLO (salida individual): se para justo fuera del vano, silba y espera a su
    // caballo; luego monta y se aleja. En escaramuza la coreografía la lleva el muster.
    if (!musterActive && caballos[w.id] && wk.outNear) {
      path.push(wk.outNear);
      w.path = path; w.state = 'monta-out'; w.goalBid = null; w.insideId = null; w.task = null; w.moving = false;
      return;
    }
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
  // Desmonta: suelta al corcel, que reaparece pastando fuera (junto a su querencia).
  function dismount(w) {
    w._escHorse = null; if (!w.mounted) return; w.mounted = false;
    const hh = horseOf(w.id);
    if (hh) { hh.rider = null; hh.summonTo = null; hh.arrived = false; hh.fx = hh.homeX; hh.fy = hh.homeY; hh.tx = hh.fx; hh.ty = hh.fy; hh.moving = false; hh.pauseT = 1 + mrand(hh) * 3; }
  }
  function startReturn(w) {
    dismount(w);   // si volvía a caballo, desmonta y libera al corcel
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
      // Llegó al tablón: se planta y lo mira de frente. El AVISO de
      // "revisar el tablón" lo pinta la página como botón DOM (local del jugador),
      // no como bocadillo (que verían todos y molestaría a los diálogos).
      w.state = 'consultando'; w.idleTimer = 60; w.moving = false; w.path = null; w.phase = 0; w.speech = null;
      if (w.consultFace) { const fd = faceFromGrid(w.consultFace[0] - w.fx, w.consultFace[1] - w.fy); if (fd) w.dir = fd; }
      return;
    }
    if (w.state === 'a-ojear') {
      // Llegó a su hueco del semicírculo: ojea el tablón, de cara a él.
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
        w.moving = false; w.bowing = false; w.speech = null; w._escEnd = em.inicioMs + ESC_MUSTER_MS; w.dir = 'S';
        // CAMINA (no se teletransporta) a formar FUERA de la hacienda (todos), separados por
        // su idx para no solaparse. Los de a pie en la primera línea; los CON caballo en una
        // línea algo más al sur (hay sitio para el corcel), para silbar y montar allí.
        const e = wk.exitCell, off = (em.idx - (em.n - 1) / 2) * 1.3;
        w._escOff = off;   // se CONSERVA al salir: cada quien mantiene su carril y no se fusionan en un píxel
        if (wk.outNear) {
          if (caballos[w.id]) { w._formSpot = [wk.outNear[0] + off, wk.outNear[1] + 1.4]; w._escHorse = 'pending'; }
          else { w._formSpot = [wk.outNear[0] + off, wk.outNear[1]]; w._escHorse = null; }
        } else if (e) { w._formSpot = [e[0] + off, e[1]]; w._escHorse = null; }
        else { w._formSpot = null; w._escHorse = null; }
        if (w._formSpot) { w.path = [w._formSpot]; w.state = 'esc-form'; }
        else { w.state = 'esc-cheer'; w.path = null; }
      } else {
        w.moving = false; w.path = null; w.state = 'fuera';
        const o = escOrder(w) || w.order, endOut = o ? o.startMs + (o.durMs || 120000) : t0;
        w.outTimer = Math.max(2, (endOut - t0) / 1000);
      }
    } else if (w.state === 'monta-out') {
      // Justo fuera del vano: se para de cara al campo, SILBA y llama a su caballo.
      w.state = 'silbando'; w.moving = false; w.path = null; w.dir = 'S';
      w.speech = '♪ ♫'; w.speechT = 99; w.whistleT = 1.3; w._mountWait = 0;
      summonHorse(w.id, w.fx, w.fy + 1.0);   // el caballo acude por el eje del portón (al sur), no al lado (donde aparca el carro)
    } else if (w.state === 'esc-form') {
      // Llegó a su sitio de formación. Los de a pie esperan; los de caballo silban y llaman.
      w.state = 'esc-cheer'; w.moving = false; w.path = null; w.dir = 'S';
      if (w._escHorse === 'pending') {
        w._escHorse = 'summon'; w.whistleT = 1.2; w._mountWait = 0; w.speech = '♪ ♫'; w.speechT = 99;
        summonHorse(w.id, w.fx, w.fy + 0.8);   // el caballo acude desde el campo, al sur
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

  // ── SÉQUITO (部曲): los NPC de la casa hacen LABORES por su pabellón según su
  // aptitud, en teselas VACÍAS fuera de los caminos (forja 武 · letras 文 · campo 政).
  const LABOR_OFICIO = { militar: 'forja', cultural: 'letras', administrativo: 'campo' };
  const oficioDe = (apt) => LABOR_OFICIO[apt] || 'campo';
  function startLabor(w) {
    if (!wk || !wk.cells || !wk.cells.length) return false;
    const cx = Math.round(w.fx), cy = Math.round(w.fy);
    // Tesela transitable, FUERA de camino (no cam), cercana y no en el vano del portón.
    const pool = wk.cells.filter(([x, y]) => {
      if (wk.cam.has(x + ',' + y)) return false;
      const dd = Math.abs(x - cx) + Math.abs(y - cy);
      return dd >= 2 && dd <= 6;
    });
    if (!pool.length) return false;
    const t = pool[rnd(pool.length)];
    w.tx = t[0]; w.ty = t[1]; w.moving = true; w._laborOficio = oficioDe(w.aptitud);
    return true;
  }
  function wander(w, dt, SPD) {
    if (w.laborCd > 0) w.laborCd -= dt;
    if (w.moving) {
      const dx = w.tx - w.fx, dy = w.ty - w.fy, d = Math.sqrt(dx * dx + dy * dy), adv = SPD * dt;
      const fd = faceFromGrid(dx, dy); if (fd) w.dir = fd;
      if (d <= adv) {
        w.fx = w.tx; w.fy = w.ty; w.moving = false;
        if (w._laborOficio) { w.state = 'laborando'; w.oficioActivo = w._laborOficio; w._laborOficio = null; w.laborTimer = rng(8, 18); w.workPhase = 0; w.dir = 'SE'; w.laborCd = rng(30, 60); w.phase = 0; return; }
        w.wait = rng(0.3, 1.9); maybeGarden(w);
      }
      else { w.fx += dx / d * adv; w.fy += dy / d * adv; }
      w.phase += dt * 8;
      return;
    }
    w.wait -= dt; w.strollTimer -= dt;
    if (w.wait > 0) return;
    // Séquito: de vez en cuando se va a una tesela vacía a hacer su labor.
    if (w.npc && w.aptitud && !(w.laborCd > 0) && Math.random() < 0.45 && startLabor(w)) return;
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
    // Entre HERMANOS jurados no hay directiva de rango: charlan como iguales (hermandad).
    const bros = bothBrothers(a, b);
    const directive = !bros && (ra >= 0 && rb >= 0 && Math.abs(ra - rb) >= RANK_GAP);
    const lead = directive ? (ra >= rb ? a : b) : a;
    const follow = (lead === a) ? b : a;
    lead.chatWith = follow.id; follow.chatWith = lead.id;
    lead.chatLead = true; follow.chatLead = false;
    lead.chatRole = directive ? 'mentor' : null; follow.chatRole = directive ? 'pupil' : null;
    lead.bowing = false; follow.bowing = directive;
    lead.convo = bros ? HacDialog.hermandad() : (directive ? HacDialog.directiva(lead.aptitud) : HacDialog.charla(lead.aptitud));
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
    speaker.speech = fillAddr(line, speaker, listener); listener.speech = null;   // {n} = trato al otro (hermano/cortesía)
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
  // ── HERMANDAD del jardín de los melocotoneros ──────────────────────────────
  // Se detecta por el atuendo especial de cada uno. Rango: 1=mayor (Liu Bei),
  // 2=segundo (Guan Yu), 3=tercero (Zhang Fei). Término fraterno por rango del
  // que RECIBE el trato. Cortesía por defecto (字) si el admin no la rellenó.
  const BROTHER_RANK = { virtuoso: 1, general: 2, fiero: 3 };
  const BROTHER_TERM = { 1: 'hermano mayor', 2: 'segundo hermano', 3: 'tercer hermano' };
  const DEFAULT_CORTESIA = { virtuoso: 'Xuande', general: 'Yunchang', fiero: 'Yide' };
  const brotherRank = (w) => (w && BROTHER_RANK[w.atuendo]) || 0;
  const cortesiaDe = (w) => (w && (w.cortesia || DEFAULT_CORTESIA[w.atuendo])) || '';
  // Cómo se dirige `speaker` a `listener`: entre hermanos, por rango fraterno; si el
  // destinatario tiene nombre de cortesía (字), por él; si no, por su nombre de pila.
  function addressOf(speaker, listener) {
    if (brotherRank(speaker) && brotherRank(listener)) {
      const term = BROTHER_TERM[brotherRank(listener)], cort = cortesiaDe(listener);
      return (cort && R.next() < 0.5) ? cort : term;     // mezcla: a veces por cortesía, a veces trato fraterno
    }
    const cort = cortesiaDe(listener); if (cort) return cort;   // a los demás, por su nombre de cortesía (字) si lo tienen
    return String(listener.name || '').split(' ')[0] || 'amigo';
  }
  const bothBrothers = (a, b) => !!(brotherRank(a) && brotherRank(b));
  function fillName(tpl, name) { const n = String(name || '').split(' ')[0] || 'amigo'; return tpl.replace('{n}', n); }
  const fillAddr = (tpl, speaker, listener) => tpl.replace('{n}', addressOf(speaker, listener));

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
    const herm = bothBrothers(a, b);
    a.state = 'llamando'; a.idleTimer = rng(1.5, 2.3); a.moving = false; a.path = null;
    a.speech = fillAddr(herm ? HacDialog.hailHermano() : HacDialog.hail(), a, b);
    b.state = 'avisado'; b.idleTimer = 6; b.moving = false; b.path = null;     // espera a que el líder arranque
    b.speech = fillAddr(herm ? HacDialog.ackHermano() : HacDialog.ack(), b, a);
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

  // ── DEBATE (coreografía) ────────────────────────────────────────────────────
  // Episodios de FRUSTRACIÓN deterministas (mismo seed → mismos episodios en todos
  // los clientes y en la repetición). Cada episodio marca qué LADO (0/1) se frustra.
  function debateSchedule(seed, inicioMs, finMs) {
    const eps = [];
    if (!(window.HacRand && HacRand.make) || finMs <= inicioMs) return eps;
    const rng = HacRand.make('frust#' + seed);
    let t = inicioMs + 20000;                       // nada de frustración en los primeros 20 s
    while (t < finMs - 20000) {
      if (rng.next() < 0.28) {                      // MÁS RARA que antes
        const len = 12000 + rng.next() * 10000;     // pero MÁS LARGA (12-22 s)
        eps.push({ start: t, end: Math.min(finMs - 8000, t + len), side: rng.next() < 0.5 ? 0 : 1 });
        t += len;
      }
      t += 15000 + rng.next() * 20000;              // huecos largos entre episodios
    }
    return eps;
  }
  const debFrustNow = (w, t) => {
    const s = w.debSchedule; if (!s) return false;
    for (let i = 0; i < s.length; i++) if (t >= s[i].start && t < s[i].end && s[i].side === w.debSide) return true;
    return false;
  };
  // Suelta una burbuja: frustrado → exclamación; si no, alterna puntos ANIMADOS /
  // notas / exclamación. Los puntos se animan luego en stepDebate (debKind='dots').
  function debSay(w, frust) {
    const i = (w.debBubbleI = (w.debBubbleI || 0) + 1);
    if (frust) { w.debKind = 'excl'; w.speech = DEBATE_FRUST_EXCL[i % DEBATE_FRUST_EXCL.length]; w.speechT = 2.4; return; }
    const kind = i % 3;
    if (kind === 0) { w.debKind = 'dots'; w.speech = DEB_DOTS[0]; w.speechT = 2.8; }
    else if (kind === 1) { w.debKind = 'music'; w.speech = DEBATE_MUSIC[i % DEBATE_MUSIC.length]; w.speechT = 2.2; }
    else { w.debKind = 'excl'; w.speech = DEBATE_EXCL[i % DEBATE_EXCL.length]; w.speechT = 1.8; }
  }

  function startDebate(w, dm) {
    if (w.chatWith) endChat(w);
    if (w.meetWith) abortMeet(w);
    w.onMission = false; w.insideId = null; w.bowing = false; w.speech = null;
    w.chatWith = null; w.meetWith = null;
    w.debFin = dm.finMs; w.debPartner = dm.partnerId; w.debSide = dm.side || 0;
    w.debSchedule = debateSchedule(dm.seed || '', dm.inicioMs, dm.finMs);
    w.debBubbleCd = 2 + (w.debSide ? 1.5 : 0); w.debSit = false; w.debKind = null;
    // Dos celdas de pie junto al jardín: el lado 0 en la celda base, el 1 en una vecina.
    const jc = (dm.jardinCell || '').split(',').map(Number);
    const base = (jc.length === 2 && !isNaN(jc[0])) ? findMeetCell(jc[0], jc[1]) : null;
    let cell = base;
    if (base && (dm.side || 0) === 1) {
      const alt = neigh(base[0], base[1]).find(n => wk.set.has(n[0] + ',' + n[1]));
      if (alt) cell = alt;
    }
    if (!cell) { w.state = 'paseando'; w.strollTimer = rng(1, 3); return; }
    w.debCell = cell;
    w.path = bfs([Math.round(w.fx), Math.round(w.fy)], new Set([cell[0] + ',' + cell[1]])) || [];
    w.state = 'a-debatir'; w.moving = false;
  }
  function endDebate(w) {
    w.state = 'paseando'; w.strollTimer = rng(2, 6); w.wait = rng(0.3, 0.9);
    w.speech = null; w.debKind = null; w.debSit = false; w.debFin = 0; w.debPartner = null; w.debSchedule = null; w.debCell = null;
  }
  // Reclama al walker si tiene un debate EN CURSO (dentro de su ventana). Devuelve
  // true si lo gestiona el debate (para saltar missionGate). Espejo de escOrder/missionGate.
  function debateGate(w) {
    const dm = debateMap[w.id];
    const inDeb = w.state === 'a-debatir' || w.state === 'debate' || w.state === 'debate-frustrado';
    if (!dm) { if (inDeb) endDebate(w); return false; }
    const t = nowSimMs();
    if (t >= dm.finMs) { if (inDeb) endDebate(w); return false; }   // terminado → recompensa la página
    if (t < dm.inicioMs) return false;
    if (!inDeb) { startDebate(w, dm); return true; }
    if (w.debFin !== dm.finMs) {   // reconcilia tras restaurar un snapshot a mitad de debate
      w.debFin = dm.finMs; w.debPartner = dm.partnerId; w.debSide = dm.side || 0;
      w.debSchedule = debateSchedule(dm.seed || '', dm.inicioMs, dm.finMs);
    }
    return true;
  }
  // Paso de un walker que está en el debate (llegando, debatiendo o frustrado).
  function stepDebate(w, dt, SPD) {
    const t = nowSimMs();
    if (w.state === 'a-debatir') {
      approachStep(w, dt, SPD);
      if (!w.moving && !(w.path && w.path.length)) { w.state = 'debate'; w.phase = 0; w.debSit = false; w.debBubbleCd = 1 + (w.debSide ? 1 : 0); }
      return;
    }
    if (t >= (w.debFin || 0)) { endDebate(w); return; }
    if (w.speechT > 0) { w.speechT -= dt; if (w.speechT <= 0) { w.speech = null; w.debKind = null; } }
    if (w.debKind === 'dots' && w.speechT > 0) w.speech = DEB_DOTS[Math.floor(t / 350) % DEB_DOTS.length];   // puntos ANIMADOS
    const o = walkers.find(x => x.id === w.debPartner);
    const frustrado = debFrustNow(w, t);
    if (frustrado && w.state !== 'debate-frustrado') { w.state = 'debate-frustrado'; }
    else if (!frustrado && w.state === 'debate-frustrado') {   // se calma: vuelve a su sitio a sentarse
      w.state = 'debate';
      if (w.debCell) w.path = bfs([Math.round(w.fx), Math.round(w.fy)], new Set([w.debCell[0] + ',' + w.debCell[1]])) || [];
      w.moving = false;
    }
    if (w.state === 'debate-frustrado') {
      // El SACADO DE QUICIO se LEVANTA y da vueltas DEPRISA; suelta exclamaciones.
      w.debSit = false; w.phase += dt * 2.4;
      approachStep(w, dt, SPD * 1.8);
      if (!w.moving && !(w.path && w.path.length)) {
        const c = w.debCell || [Math.round(w.fx), Math.round(w.fy)];
        const here = Math.abs(w.fx - c[0]) + Math.abs(w.fy - c[1]) < 0.1;
        const opts = neigh(c[0], c[1]).filter(n => wk.set.has(n[0] + ',' + n[1]));
        const target = (here && opts.length) ? opts[(w.debBubbleI = (w.debBubbleI || 0) + 1) % opts.length] : c;
        w.path = [target]; w.moving = false;
      }
      w.debBubbleCd -= dt;
      if (w.debBubbleCd <= 0) { debSay(w, true); w.debBubbleCd = 2.4; }
    } else if ((w.path && w.path.length) || w.moving) {
      w.debSit = false; w.phase += dt * 0.4; approachStep(w, dt, SPD);   // volviendo a su sitio tras calmarse
    } else {
      // SENTADO debatiendo tranquilo: mira al rival y suelta burbujas de vez en cuando.
      w.debSit = true; w.moving = false; w.phase += dt * 0.4;
      if (o) { const fd = faceFromGrid(o.fx - w.fx, o.fy - w.fy); if (fd) w.dir = fd; }
      w.debBubbleCd -= dt;
      if (w.debBubbleCd <= 0 && (!w.speech || w.debKind !== 'dots')) { debSay(w, false); w.debBubbleCd = 4.5; }
    }
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
    w.onMission = false; w.bowing = false; w.missionTask = null; dismount(w);   // por si acabó montado
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
    // El enviado que se despidió ya llegó al campo → se retira de la finca.
    if (walkers.some(w => w.visitante && w.state === 'visita-ido')) walkers = walkers.filter(w => !(w.visitante && w.state === 'visita-ido'));
    stepCaravan(dt);
    walkers.forEach(w => {
      if (w.visitante) { visitorStep(w, dt); return; }   // enviado: lógica propia, ajeno al sim de miembros
      if (w.gardenCd > 0) w.gardenCd -= dt;
      if (w.socialCd > 0) w.socialCd -= dt;
      if (w.browseCd > 0) w.browseCd -= dt;
      // Auto-recuperación: si quedó VARADO FUERA de la rejilla (más allá de la
      // muralla) y no está en tránsito de expedición, que vuelva a entrar. OJO: se
      // comprueba por LÍMITES de rejilla, no por `set` (hay muchas celdas válidas
      // fuera de `set`: puertas, bordes… comprobarlo así mandaba a TODOS al portón).
      if (['exped-out', 'exped-in', 'fuera', 'monta-out', 'silbando', 'esc-cheer', 'esc-form'].indexOf(w.state) < 0 && !w.insideId && fueraDeFinca(w)) enterFromOutside(w);
      const inDebate = debateGate(w);   // un debate en curso tiene prioridad sobre órdenes
      if (!inDebate) missionGate(w);
      switch (w.state) {
        case 'a-debatir':
        case 'debate':
        case 'debate-frustrado': stepDebate(w, dt, SPD); break;
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
        case 'monta-out': followPath(w, dt, SPD); break;
        case 'esc-form': followPath(w, dt, escMap[w.id] ? SPD * ESC_RUSH : SPD); break;
        case 'silbando': {
          w.phase += dt * 0.5;
          if (w.whistleT > 0) w.whistleT -= dt;
          w._mountWait = (w._mountWait || 0) + dt;
          const hh = horseOf(w.id), llegado = hh && hh.arrived;
          if (hh && !llegado) { const fd = faceFromGrid(hh.fx - w.fx, hh.fy - w.fy); if (fd) w.dir = fd; }   // mira al caballo que acude
          if ((llegado && w.whistleT <= 0) || w._mountWait > 9) {   // MONTA (o timeout de seguridad)
            if (hh) { hh.rider = w.id; hh.summonTo = null; }
            w.mounted = !!hh; w.speech = null; w.speechT = 0; w.dir = 'S';
            const ox = w._escOff || 0;
            const out = []; if (wk.outFar) out.push([wk.outFar[0] + ox, wk.outFar[1]]);
            w.path = out.length ? out : null; w.state = out.length ? 'exped-out' : 'fuera'; w.moving = false;
            if (w.state === 'fuera') { const o = escOrder(w) || w.order, t0 = nowSimMs(), endOut = o ? o.startMs + (o.durMs || 120000) : t0; w.outTimer = Math.max(2, (endOut - t0) / 1000); }
          }
          break;
        }
        case 'exped-out': followPath(w, dt, escMap[w.id] ? SPD * ESC_RUSH : SPD); break;
        case 'exped-in': followPath(w, dt, SPD); break;
        case 'esc-cheer': {
          // Los de a pie esperan en la puerta; los de caballo, fuera, silban y montan.
          // En la sub-ventana final, todos gritan al unísono; luego salen juntos.
          w.phase += dt * 0.5;
          if (w.speechT > 0) { w.speechT -= dt; if (w.speechT <= 0 && w._escHorse !== 'summon') w.speech = null; }
          const t0 = nowSimMs(), end = w._escEnd || t0;
          // Fase CABALLO: acude la montura y monta (mientras dure el silbido).
          if (w._escHorse === 'summon') {
            if (w.whistleT > 0) w.whistleT -= dt;
            w._mountWait = (w._mountWait || 0) + dt;
            const hh = horseOf(w.id), llegado = hh && hh.arrived;
            if (hh && !llegado) { const fd = faceFromGrid(hh.fx - w.fx, hh.fy - w.fy); if (fd) w.dir = fd; }
            if ((llegado && w.whistleT <= 0) || w._mountWait > 9) {
              if (hh) { hh.rider = w.id; hh.summonTo = null; }
              w.mounted = !!hh; w._escHorse = 'ready'; w.speech = null; w.speechT = 0; w.dir = 'S';
            }
          }
          if (w._escHorse !== 'summon' && t0 >= end - ESC_CHEER_MS && !w.bowing) { w.bowing = true; w.speech = escCheerFor(w); w.speechT = ESC_CHEER_MS / 1000; w.dir = 'S'; }
          if (t0 >= end) {
            // Grito hecho: SALEN JUNTOS hacia el campo (los montados ya están fuera).
            // Si un dueño de caballo no llegó a montar, monta ahora (parte a caballo igual).
            if (caballos[w.id] && !w.mounted) { const hh = horseOf(w.id); if (hh) { hh.rider = w.id; hh.summonTo = null; w.mounted = true; } }
            w.bowing = false; w.speech = null; w._escHorse = null;
            const ox = w._escOff || 0;
            const out = [];
            if (wk.outNear && !w.mounted) out.push([wk.outNear[0] + ox, wk.outNear[1]]);
            if (wk.outFar) out.push([wk.outFar[0] + ox, wk.outFar[1]]);
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
        case 'laborando':
          w.laborTimer -= dt; w.workPhase = (w.workPhase + dt * 0.7) % 1;
          if (w.laborTimer <= 0) { w.state = 'paseando'; w.oficioActivo = null; w.strollTimer = rng(3, 8); w.wait = rng(0.3, 1); }
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

  // Estados en los que un mecenas CRUZA el vano de la muralla o aguarda justo
  // fuera antes de partir (salir a llamar al caballo, silbarlo y montar; formar
  // para una escaramuza): el portón perimetral debe estar ABIERTO en todos ellos.
  // Antes solo contaban exped-out/in, así que con caballo la puerta se abría tarde
  // (al montar) pese a que el mecenas ya había cruzado para llamar al corcel.
  const GATE_CROSS_STATES = ['exped-out', 'exped-in', 'monta-out', 'silbando', 'esc-form', 'esc-cheer'];
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
        // El portón PERIMETRAL solo se abre para quien CRUZA el vano (sale/entra de
        // expedición o va a formar), no para los que pasean cerca del frente del patio.
        if (gate.perimeter && GATE_CROSS_STATES.indexOf(w2.state) < 0) continue;
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
  // tablón. Comentan ESCALONADO (un cooldown → 1-2 bocadillos a la vez). RNG propio
  // del tablón (no toca R). Una misión los saca. Ya no hay funcionario.
  let boardGawkCd = 5, boardTalkCd = 3;
  function stepBoard(dt) {
    if (!wk || !wk.boardFocus || !wk.boardSlots || !wk.boardSlots.length) return;
    const fx = wk.boardFocus[0], fy = wk.boardFocus[1];
    const rng = wk.boardRng || (wk.boardRng = { _r: 0x9e3779b9 });
    // Libera huecos de quien ya no está ojeando (misión, se fue, etc.).
    wk.boardSlots.forEach(s => { if (s.by) { const w = walkers.find(x => x.id === s.by); if (!w || (w.state !== 'a-ojear' && w.state !== 'ojeando')) s.by = null; } });
    boardGawkCd -= dt; boardTalkCd -= dt;
    // Reclutar un curioso de vez en cuando (a un hueco libre del semicírculo).
    if (boardGawkCd <= 0) {
      boardGawkCd = 3 + mrand(rng) * 4;
      const fi = wk.boardSlots.findIndex(s => !s.by);
      if (fi >= 0 && mrand(rng) < 0.55) {
        for (let i = 0; i < walkers.length; i++) {
          const w = walkers[i];
          if (w.onMission || (w.gawkCd || 0) > 0 || (w.state !== 'paseando' && w.state !== 'saliendo')) continue;
          const dx = w.fx - fx, dy = w.fy - fy; if (dx * dx + dy * dy > 36) continue;   // ~6 celdas
          const slot = wk.boardSlots[fi];
          const path = bfs([Math.round(w.fx), Math.round(w.fy)], new Set([slot.cell[0] + ',' + slot.cell[1]]));
          if (!path) continue;
          slot.by = w.id; w.boardSlot = fi; w.gawkFace = [fx, fy]; w.gawkDur = 14 + mrand(rng) * 16; w.gawkCd = 50 + mrand(rng) * 40;
          w.path = path; w.state = 'a-ojear'; w.moving = false; w.speech = null; w.chatWith = null; w.meetWith = null;
          break;
        }
      }
    }
    // Comentarios ESCALONADOS de los curiosos: como mucho uno nuevo cada ~3 s.
    if (boardTalkCd <= 0) {
      const readers = walkers.filter(w => w.state === 'ojeando' && !w.speech);
      if (readers.length && mrand(rng) < 0.6) {
        const w = readers[Math.floor(mrand(rng) * readers.length)];
        w.speech = BOARD_CRIES[Math.floor(mrand(rng) * BOARD_CRIES.length)]; w.speechT = 2.8;
        boardTalkCd = 2.6 + mrand(rng) * 2.4;
      } else boardTalkCd = 6 + mrand(rng) * 6;                      // en silencio: reintenta más tarde
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
  function ensureHorses() { /* no-op: caballo procedural, sin sprites PNG */ }
  // ¿El mecenas va MONTADO ahora mismo? (flag puesto por la coreografía de salida.)
  function isMounted(w) { return !!(w && w.mounted && caballos[w.id]); }
  // Jinete sobre la silla: sube al mecenas sentado hasta el asiento del caballo procedural.
  const RIDER_DX = 0;      // ajuste lateral del jinete sobre la silla (px disp.)
  const RIDER_UP = 40;     // altura del asiento sobre el suelo (px disp.): sienta al jinete en la silla
  // Dibuja el caballo PROCEDURAL con el mecenas montado encima (ciclo de trote al moverse).
  function drawMount(g, lx, ly, w, moving) {
    const view = HORSE_VIEW[w.dir || 'SE'] || 'SE';
    const back = (view === 'NE' || view === 'NW'), mirror = (view === 'SW' || view === 'NW');
    const frame = moving ? (Math.floor(w.phase * 1.1) % HORSE_FRAMES) : 0;
    const coat = (caballos[w.id] && caballos[w.id].tono) || '#8a5630';
    const tier = (caballos[w.id] && caballos[w.id].tier) || 0;
    const cv = horseBaked(back, frame, coat, tier, moving);
    const fx = lx * SCALE, fy = ly * SCALE;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false;
    g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.ellipse(fx, fy, 15 * HDRAW * 0.75, 6, 0, 0, 6.2832); g.fill();   // sombra
    // En vistas traseras (NE/NW) el jinete va DELANTE del caballo; en frontales, detrás.
    const drawHorseNow = () => { g.save(); g.translate(fx, fy); if (mirror) g.scale(-1, 1); g.drawImage(cv, -HCX * HDRAW, -HFEET * HDRAW, HW * HDRAW, HH * HDRAW); g.restore(); };
    const drawRiderNow = () => {
      const rcv = window.HacChar ? spriteFor(w, w.dir || 'S', 0, 'sit') : null; if (!rcv) return;
      const dx = Math.round(fx - charW() * 0.5 + RIDER_DX), dy = Math.round(fy - RIDER_UP - charFEET());
      g.imageSmoothingEnabled = pngOn(); g.drawImage(rcv, dx, dy, charW(), charH()); g.imageSmoothingEnabled = false;
    };
    if (back) { drawHorseNow(); drawRiderNow(); } else { drawHorseNow(); drawRiderNow(); }
    g.restore();
  }
  // Compositor de MONTURA reutilizable para lienzos FUERA del motor iso (p.ej. la marcha
  // de la escaramuza en el panel): caballo procedural (horseBaked) + jinete sentado
  // (HacChar), con la misma geometría probada del retrato montado. Devuelve un canvas con
  // los CASCOS anclados al borde inferior y el eje X centrado; el llamador lo dibuja como
  // cualquier sprite de a pie (ancla en los pies). opts: { aptitud, aspecto, secuelas,
  // dir:'SE'|'NW'|…, coat, tier, frame, moving }.
  function mountSprite(opts) {
    opts = opts || {};
    if (!window.HacChar || !HacChar.draw) return null;
    const dir = opts.dir || 'SE';
    const view = HORSE_VIEW[dir] || 'SE';
    const back = (view === 'NE' || view === 'NW'), mirror = (view === 'SW' || view === 'NW');
    const frame = opts.moving ? ((((opts.frame | 0) % HORSE_FRAMES) + HORSE_FRAMES) % HORSE_FRAMES) : 0;
    const coat = opts.coat || '#8a5630';
    const hcv = horseBaked(back, frame, coat, opts.tier || 0, !!opts.moving);
    if (!hcv) return null;
    const rcv = document.createElement('canvas');
    HacChar.draw(rcv, { aptitud: opts.aptitud || '', aspecto: opts.aspecto || {}, dir: dir, frame: 0, scale: 1, pose: 'sit', secuelas: opts.secuelas || [] });
    const NWp = HW * HDRAW, NHp = HH * HDRAW;
    const cW = Math.max(NWp, charW()), cH = RIDER_UP + charH();
    const cv = document.createElement('canvas'); cv.width = cW; cv.height = cH;
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    const fx = cW / 2, fy = cH;                                  // cascos al borde inferior, eje al centro
    g.save(); g.translate(fx, fy); if (mirror) g.scale(-1, 1);
    g.drawImage(hcv, -HCX * HDRAW, -HFEET * HDRAW, NWp, NHp); g.restore();
    g.imageSmoothingEnabled = pngOn();
    g.drawImage(rcv, Math.round(fx - charW() * 0.5 + RIDER_DX), Math.round(fy - RIDER_UP - charFEET()), charW(), charH());
    return cv;
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
  // ── CABALLO PROCEDURAL (pixel-art, sin PNG) ──────────────────────────────
  // Se dibuja en un lienzo lógico HW×HH y se HORNEA una vez por (vista, frame, capa),
  // con un pase de contorno para separarlo del campo. 4 vistas iso (SE/SW frontales,
  // NE/NW traseras) por espejo + variante trasera; ciclo de trote de 6 fotogramas.
  const HORSE_FRAMES = 8;
  const HW = 44, HH = 38, HFEET = 34, HCX = 22;   // lienzo lógico, pies (y) y eje (x)
  const HDRAW = 2;                                 // factor de dibujo (px enteros, nítido): caballo grande, montable
  // Cajas de recomposición (px DISP. sobre los pies) para HacIso.frame: el jinete y
  // el caballo sobresalen del clip por defecto; sin esto se les recorta morro/cabeza.
  const MOUNT_BOUND = { l: 50, up: 104, w: 100, h: 124 };   // caballo + jinete montado
  const HORSE_BOUND = { l: 50, up: 78,  w: 100, h: 94 };    // caballo suelto pastando
  const ENVOY_BOUND = { l: 40, up: 92,  w: 80,  h: 112 };   // enviado de pie (con holgura para la talla de general)
  const _hx = (c) => { c = c.replace('#', ''); return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]; };
  const mixc = (a, b, t) => { const A = _hx(a), B = _hx(b); return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' + Math.round(A[1] + (B[1] - A[1]) * t) + ',' + Math.round(A[2] + (B[2] - A[2]) * t) + ')'; };
  // GUALDRAPA/JAECES por TIER de raza (0=común … 5=汗血): a más tier, paño más noble,
  // ribete dorado y adornos (tachones, borla, penacho). Así se NOTA la mejoría además
  // del pelaje. tier viene de la raza (razaDe(variante).tier), 0 si no hay.
  const CAPARISON = [
    { blanket: '#6b5138', trim: '#8a7048', studs: false, tassel: false, plume: null },   // 0 común
    { blanket: '#cfd6dc', trim: '#eef3f7', studs: false, tassel: false, plume: null },   // 1 白馬
    { blanket: '#7a2f25', trim: '#d8b65a', studs: false, tassel: true,  plume: null },   // 2 涼州
    { blanket: '#2f5a44', trim: '#cbb968', studs: true,  tassel: true,  plume: null },   // 3 烏孫
    { blanket: '#243a5c', trim: '#d8b65a', studs: true,  tassel: true,  plume: '#e0b85a' }, // 4 河曲 (penacho dorado)
    { blanket: '#7a1f18', trim: '#f0d27a', studs: true,  tassel: true,  plume: '#c8342a' }, // 5 汗血 (penacho carmesí)
  ];
  function horsePalette(coat, tier) {
    const cap = CAPARISON[Math.max(0, Math.min(5, tier | 0))] || CAPARISON[0];
    return {
      base: coat, hi: mixc(coat, '#ffffff', 0.26), edge: mixc(coat, '#ffffff', 0.5),
      dk: mixc(coat, '#000000', 0.22), sh: mixc(coat, '#000000', 0.42), belly: mixc(coat, '#000000', 0.55),
      mane: mixc(coat, '#160d06', 0.75), maneHi: mixc(coat, '#160d06', 0.55),
      muzzle: mixc(coat, '#000000', 0.5), hoof: '#241a12', eye: '#0c0805',
      blanket: cap.blanket, trim: cap.trim, leather: '#4a2f18', leatherHi: '#6a4526', stirrup: '#aab0b6',
      studs: cap.studs ? mixc(cap.trim, '#ffffff', 0.3) : null, tassel: cap.tassel ? cap.trim : null, plume: cap.plume,
    };
  }
  // Contorno 1px oscuro (vecindad-4) para que el caballo destaque sobre la hierba.
  function horseOutline(c) {
    const img = c.getImageData(0, 0, HW, HH), d = img.data, out = new Uint8ClampedArray(d);
    const al = (x, y) => (x < 0 || y < 0 || x >= HW || y >= HH) ? 0 : d[(y * HW + x) * 4 + 3];
    for (let y = 0; y < HH; y++) for (let x = 0; x < HW; x++) {
      const i = (y * HW + x) * 4;
      if (d[i + 3] === 0 && (al(x - 1, y) || al(x + 1, y) || al(x, y - 1) || al(x, y + 1))) { out[i] = 26; out[i + 1] = 18; out[i + 2] = 12; out[i + 3] = 255; }
    }
    c.putImageData(new ImageData(out, HW, HH), 0, 0);
  }
  // ── Caballo PROCEDURAL rediseñado: anatomía con volumen (barril/grupa/pecho),
  // cuello arqueado, crin y cola con vuelo, y un TROTE articulado (rodilla/corvejón,
  // balanceo del cuerpo y cabeceo). Se hornea por (vista,frame,coat,tier,movimiento).
  function hEllip(c, cx, cy, rx, ry, col) { c.fillStyle = col; for (let y = -ry; y <= ry; y++) { const w = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry)))); c.fillRect(Math.round(cx - w), Math.round(cy + y), 2 * w + 1, 1); } }
  function hDisc(c, cx, cy, r, col) { hEllip(c, cx, cy, r, r, col); }
  function hSeg(c, x0, y0, x1, y1, w, col) { x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1); const dx = x1 - x0, dy = y1 - y0, n = Math.max(Math.abs(dx), Math.abs(dy), 1); c.fillStyle = col; for (let i = 0; i <= n; i++) { const x = Math.round(x0 + dx * i / n), y = Math.round(y0 + dy * i / n); c.fillRect(x - ((w - 1) >> 1), y, w, 1); } }
  // pie de una pata según fase (0..1): apoyo (retrocede) + vuelo (arco hacia delante).
  function hFoot(phase, stride, lift) { phase = ((phase % 1) + 1) % 1; let x, y; if (phase < 0.5) { const u = phase / 0.5; x = stride * (0.5 - u); y = 0; } else { const u = (phase - 0.5) / 0.5; x = stride * (u - 0.5); y = -lift * Math.sin(u * Math.PI); } return [x, y]; }
  function hLimb(c, hx, hy, phase, stride, lift, col, hoof) { const f = hFoot(phase, stride, lift), footX = Math.round(hx + f[0]), footY = HFEET + f[1], ky = Math.round(hy + (footY - hy) * 0.55); hSeg(c, hx, hy, footX, ky, 3, col); c.fillStyle = col; c.fillRect(footX - 1, ky, 2, Math.max(1, Math.round(footY) - ky)); c.fillRect(footX - 1, ky - 1, 3, 2); c.fillStyle = hoof; c.fillRect(footX - 1, Math.round(footY) - 2, 3, 2); }
  function hLimbBack(c, hx, hy, phase, stride, lift, col, hoof) { const f = hFoot(phase, stride, lift), footY = HFEET + f[1], x = Math.round(hx); hSeg(c, x, Math.round(hy), x, Math.round(footY), 3, col); c.fillStyle = hoof; c.fillRect(x - 1, Math.round(footY) - 2, 3, 2); }
  // Vista TRASERA 3/4 (el caballo se aleja): grupa hacia el observador, cabeza girada.
  function paintBack(c, frame, coat, tier, moving) {
    const P = horsePalette(coat, tier), px = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };
    const p = moving ? frame / HORSE_FRAMES : 0, pA = p, pB = (p + 0.5) % 1;
    const stride = moving ? 3 : 0, lift = moving ? 4 : 0;
    const by = moving ? -(0.5 - 0.5 * Math.cos(p * 4 * Math.PI)) * 1.2 : 0, B = v => v + by;
    // pata trasera LEJANA
    hLimbBack(c, 26, B(22), pB, stride, lift, P.sh, P.dk);
    // CUELLO corto tras la grupa + CABEZA mirando atrás sobre el hombro (perfil claro).
    const nbx = 24;
    hSeg(c, nbx, B(15), nbx + 1, B(8), 6, P.base);
    c.fillStyle = P.mane; for (let i = 0; i < 6; i++) { const t = i / 5; px(nbx + 2.2 - t * 0.4, B(8.5) + t * 6, 2, 2); }   // crin del cuello
    hDisc(c, nbx + 1, B(6.5), 2.6, P.base);
    hSeg(c, nbx, B(7), nbx - 4, B(8.6), 3, P.base);   // cara hacia el morro (mira a la izquierda)
    px(nbx - 5, B(8.6), 2, 2, P.muzzle);
    px(nbx - 5, B(9.6), 1, 1, P.eye);
    px(nbx - 1, B(6.4), 1, 1, P.eye); px(nbx - 1, B(5.8), 1, 1, P.edge);
    px(nbx - 0.5, B(2.6), 2, 3, P.base); px(nbx - 0.5, B(2.6), 1, 3, P.dk);
    px(nbx + 2, B(2.6), 2, 3, P.base); px(nbx + 2, B(2.6), 1, 3, P.dk);
    px(nbx + 0.5, B(3.7), 2, 2, P.mane);
    if (P.plume) { px(nbx + 0.5, B(-0.4), 2, 4, P.plume); px(nbx + 1.5, B(0.6), 1, 2, mixc(P.plume, '#ffffff', 0.4)); }
    // grupa hacia el observador (tapa la base del cuello)
    hEllip(c, 20, B(22), 8.5, 7, P.base);
    hEllip(c, 20, B(17), 7, 2.2, P.hi);
    px(20, B(17), 1, 12, P.dk);
    px(12.5, B(23), 2, 3, P.sh); px(27, B(23), 2, 3, P.sh);
    const gyB = B(14);
    px(13, gyB, 15, 4, P.blanket); px(13, gyB + 4, 15, 1, P.trim);
    px(12, gyB + 2, 2, 4, P.blanket); px(28, gyB + 2, 2, 4, P.blanket);
    if (P.studs) { for (let i = 0; i < 3; i++) px(16 + i * 4, gyB + 1, 1, 1, P.studs); }
    px(17, gyB - 2, 6, 3, P.leather); px(17, gyB - 2, 6, 1, P.leatherHi);
    hLimbBack(c, 15, B(22), pA, stride, lift, P.base, P.hoof);
    // COLA: nace arriba y cae hacia un lado (se recorta contra el fondo → visible).
    const tswB = moving ? Math.sin(p * 2 * Math.PI) * 1.3 : 0;
    c.fillStyle = P.mane; for (let i = 0; i < 13; i++) { const t = i / 12; px(20 - t * 2.5 + tswB * t - 1.5, B(15) + t * 15, 4, 2); }
    c.fillStyle = P.maneHi; for (let i = 0; i < 11; i++) { const t = i / 10; px(20 - t * 2.5 + tswB * t, B(15) + t * 15, 1, 2); }
    px(Math.round(20 - 2.5 + tswB - 2), Math.round(B(30)), 5, 3, P.mane);   // borla del extremo
    horseOutline(c);
  }
  // Vista de PERFIL (mirando a la DERECHA; a la izquierda se dibuja en espejo).
  function paintHorse(c, back, frame, coat, tier, moving) {
    if (back) return paintBack(c, frame, coat, tier, moving);
    const P = horsePalette(coat, tier), px = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };
    const p = moving ? frame / HORSE_FRAMES : 0, pA = p, pB = (p + 0.5) % 1;
    const stride = moving ? 4 : 0, lift = moving ? 4 : 0;
    const by = moving ? -(0.5 - 0.5 * Math.cos(p * 4 * Math.PI)) * 1.4 : 0;
    const nod = moving ? Math.sin(p * 4 * Math.PI) * 1.0 : 0;
    const B = v => v + by;
    const foreHx = 29, foreHy = B(18), hindHx = 13, hindHy = B(18);
    // cola con vuelo
    const tsw = moving ? Math.sin(p * 2 * Math.PI) * 1.2 : 0;
    c.fillStyle = P.mane;
    for (let i = 0; i < 12; i++) { const t = i / 11; const x = 6 - t * 4 + (i % 2 ? 0 : -1), y = B(15) + 2 + t * 13, sw = tsw * t; c.fillRect(Math.round(x + sw), Math.round(y), 3, 2); }
    c.fillStyle = P.maneHi; for (let i = 0; i < 10; i++) { const t = i / 9; c.fillRect(Math.round(6 - t * 3 + tsw * t), Math.round(B(15) + 2 + t * 13), 1, 2); }
    // patas lejanas (diagonal contraria, en sombra)
    hLimb(c, foreHx - 2, foreHy, pB, stride, lift, P.sh, P.dk);
    hLimb(c, hindHx + 2, hindHy, pA, stride, lift, P.sh, P.dk);
    // cuerpo: grupa + barril + pecho con volumen
    hDisc(c, hindHx - 0.5, B(20), 6, P.base);
    hEllip(c, 21, B(20), 10, 6.2, P.base);
    hDisc(c, foreHx + 0.5, B(20), 5, P.base);
    hEllip(c, 21, B(23.5), 9, 2.4, P.belly);   // vientre en sombra
    hEllip(c, 21, B(15.5), 9, 1.8, P.hi);       // lomo iluminado
    px(hindHx - 5, B(18), 2, 2, P.hi);
    px(foreHx + 3, B(21), 1, 3, P.dk);
    // cuello arqueado + cabeza
    const nx = foreHx, nbase = B(16), ntop = B(7) + nod;
    hSeg(c, nx, nbase, nx + 5, ntop, 7, P.base);
    hSeg(c, nx + 5.5, ntop, nx + 6, ntop + 1, 5, P.base);
    px(nx + 1, nbase, 3, 1, P.hi);   // borde delantero del cuello iluminado (sutil)
    const jx = nx + 5, jy = ntop + 1, hx = jx, hy = jy;
    // CABEZA en perfil por FILAS contiguas (sin huecos): frente arriba-izq, morro
    // abajo-dcha, quijada redonda atrás. Cabeza equina limpia, no una cuña.
    px(hx, hy - 2, 4, 1, P.base);
    px(hx - 1, hy - 1, 6, 1, P.base);
    px(hx - 1, hy, 7, 1, P.base);
    px(hx - 1, hy + 1, 8, 1, P.base);   // carrillo + caña (lo más ancho)
    px(hx, hy + 2, 8, 1, P.base);
    px(hx + 2, hy + 3, 6, 1, P.base);
    px(hx + 4, hy + 4, 4, 1, P.base);
    px(hx + 5, hy + 3, 3, 1, P.muzzle); px(hx + 4, hy + 4, 4, 1, P.muzzle);   // morro
    px(hx + 7, hy + 3, 1, 1, P.dk);     // ollar
    px(hx + 5, hy + 4, 1, 1, P.dk);     // boca
    px(hx - 1, hy + 1, 2, 1, P.dk);     // quijada en sombra
    px(hx + 1, hy - 1, 3, 1, P.hi);     // pómulo iluminado (sutil)
    px(hx + 1, hy, 1, 1, P.eye);        // ojo
    px(hx - 1, hy - 5, 2, 3, P.base); px(hx - 1, hy - 5, 1, 2, P.dk);   // oreja
    px(hx + 1, hy - 5, 2, 3, P.base); px(hx + 1, hy - 5, 1, 2, P.dk);   // oreja
    const msw = moving ? Math.sin(p * 2 * Math.PI + 1) * 0.7 : 0;
    c.fillStyle = P.mane;
    for (let i = 0; i < 9; i++) { const t = i / 8; const x = nx - 1 + t * 5.5, y = nbase - 1 - t * 9 + nod * t; c.fillRect(Math.round(x - 1 + msw * t), Math.round(y), 2, 3); }
    c.fillStyle = P.maneHi; for (let i = 0; i < 7; i++) { const t = i / 6; c.fillRect(Math.round(nx - 1 + t * 5.5 + msw * t), Math.round(nbase - 1 - t * 9 + nod * t), 1, 2); }
    px(hx, hy - 3, 2, 2, P.mane);   // tupé entre las orejas
    // gualdrapa / silla (tier); asiento ~y13 para alinear al jinete (RIDER_UP)
    const gy = B(15);
    px(13, gy, 15, 4, P.blanket);
    px(13, gy + 4, 15, 1, P.trim);
    px(13, gy + 5, 2, 2, P.blanket); px(26, gy + 5, 2, 2, P.blanket);
    if (P.studs) { for (let i = 0; i < 4; i++) px(15 + i * 4, gy + 1, 1, 1, P.studs); }
    if (P.tassel) { px(13, gy + 6, 1, 3, P.tassel); px(27, gy + 6, 1, 3, P.tassel); }
    px(16, gy - 2, 9, 3, P.leather); px(16, gy - 2, 9, 1, P.leatherHi);
    px(15, gy - 3, 3, 3, P.leather); px(23, gy - 2, 3, 2, P.leather);
    px(20, gy + 4, 2, 5, P.leather); px(20, gy + 7, 3, 2, P.stirrup);
    // patas cercanas (color base)
    hLimb(c, foreHx, foreHy, pA, stride, lift, P.base, P.hoof);
    hLimb(c, hindHx, hindHy, pB, stride, lift, P.base, P.hoof);
    // penacho (tier)
    if (P.plume) { px(jx, jy - 6, 2, 4, P.plume); px(jx + 1, jy - 5, 1, 2, mixc(P.plume, '#ffffff', 0.4)); px(jx - 1, jy - 4, 1, 1, P.plume); px(jx + 2, jy - 4, 1, 1, P.plume); }
    horseOutline(c);
  }
  const horseCache = new Map();
  function horseBaked(back, frame, coat, tier, moving) {
    const key = (back ? 'B' : 'F') + frame + '|' + coat + '|' + (tier | 0) + '|' + (moving ? 'm' : 's');
    let cv = horseCache.get(key);
    if (cv) return cv;
    cv = document.createElement('canvas'); cv.width = HW; cv.height = HH;
    const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
    paintHorse(c, back, frame, coat, tier, moving);
    horseCache.set(key, cv);
    return cv;
  }
  // Dibuja un caballo SUELTO pastando por el campo (procedural, con sombra).
  function drawHorse(g, lx, ly, h) {
    const view = HORSE_VIEW[h.dir || 'SE'] || 'SE';
    const back = (view === 'NE' || view === 'NW'), mirror = (view === 'SW' || view === 'NW');
    const frame = h.moving ? (Math.floor(h.phase * 1.1) % HORSE_FRAMES) : 0;
    const coat = (caballos[h.id] && caballos[h.id].tono) || '#8a5630';
    const tier = (caballos[h.id] && caballos[h.id].tier) || 0;
    const cv = horseBaked(back, frame, coat, tier, h.moving);
    const fx = lx * SCALE, fy = ly * SCALE;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false;
    g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.ellipse(fx, fy, 15 * HDRAW * 0.75, 6, 0, 0, 6.2832); g.fill();   // sombra
    g.translate(fx, fy); if (mirror) g.scale(-1, 1);
    g.drawImage(cv, -HCX * HDRAW, -HFEET * HDRAW, HW * HDRAW, HH * HDRAW);
    g.restore();
  }

  // ── CARAVANA de tributo (F3 政) ───────────────────────────────────────────
  // Un carro cargado que LLEGA por el camino y ESPERA en la puerta (outNear) a que
  // un mecenas administrativo lo reciba. Sprite horneado una vez (sin coste/frame).
  // Carruaje cubierto ISOMÉTRICO (輜車) con buey y transportista, horneado una vez.
  // Lienzo 180×150 con origen iso en (ORX,ORY); el ancla (ground point que cae en la
  // celda) es el centro del eje entre ruedas → (CCX,CFEET).
  const CW = 180, CH = 150, ORX = 64, ORY = 86, CCX = 78, CFEET = 106, CDRAW = 1.15;   // algo más pequeño para caber a un lado del portón sin pisar a nadie
  // Recuadro de recomposición para HacIso.frame (px disp. sobre el ancla). SIN esto,
  // el clip por defecto (36×44) recortaba la caravana a un cuadradito; PERO si es más
  // grande que el CONTENIDO real (no el lienzo entero con sus márgenes transparentes),
  // el recompuesto borra el decorado de alrededor que el carro ni siquiera tapa.
  // Ajustado a la caja OPACA del sprite (canvas x[24,158] y[16,134]).
  const CARAVAN_BOUND = { l: Math.round((CCX - 24) * CDRAW), up: Math.round((CFEET - 16) * CDRAW), w: Math.round(134 * CDRAW), h: Math.round(118 * CDRAW) };
  let caravanCache = {};
  // Jaeces/estandartes de la caravana por NIVEL de investigación del tributo (1..5): a
  // más nivel, caravana más rica (valance de color, tachones dorados, más banderines
  // 貢, testera del buey). Refleja la escalera de «Rutas de tributo».
  const CARAVAN_TIER = [null,
    { trim: null,      flags: 1, finial: '#d8b65a', studs: false, imperial: false },
    { trim: '#7a2f25', flags: 1, finial: '#d8b65a', studs: false, imperial: false },
    { trim: '#2f5a44', flags: 2, finial: '#d8b65a', studs: false, imperial: false },
    { trim: '#243a5c', flags: 2, finial: '#f0d27a', studs: true,  imperial: false },
    { trim: '#7a1f18', flags: 3, finial: '#f0d27a', studs: true,  imperial: true },
  ];
  // Conductor (transportista) vía HacChar, pose sentada, horneado una vez.
  let caravanDriverCv = null;
  function caravanDriver() {
    if (caravanDriverCv) return caravanDriverCv;
    const c = document.createElement('canvas');
    if (window.HacChar && HacChar.draw) { try { HacChar.draw(c, { aptitud: 'administrador', aspecto: { robe: '#8a5a2e', accent: '#e6c15a', piel: 1, pelo: 2 }, dir: 'SE', frame: 0, scale: 2, pose: 'sit' }); } catch (e) { c.width = 0; } }
    caravanDriverCv = c; return c;
  }
  function caravanBaked(tier) {
    const cfg = CARAVAN_TIER[Math.max(1, Math.min(5, tier | 0)) || 1];
    const ck = 't' + (tier | 0);
    if (caravanCache[ck]) return caravanCache[ck];
    const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    g.save(); g.translate(ORX, ORY);
    const HWc = 16, HHc = 8;
    const P = (gx, gy, gz) => [(gx - gy) * HWc, (gx + gy) * HHc - gz];
    const quad = (pts, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fill(); };
    const line = (a, b, col, w) => { g.strokeStyle = col; g.lineWidth = w || 1; g.lineCap = 'round'; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); };
    const wood = '#6e4a28', woodHi = '#9a7038', woodDk = '#3a240f', woodMid = '#7f5830';
    const iron = '#33373d', ironHi = '#565b63';
    const cloth = '#b23b2e', clothHi = '#d9614e';
    const canopy = '#d8c290', canopyHi = '#efe0b6', canopyDk = '#a88f5c', canopyIn = '#241a10';
    const crate = '#a9812f', crateHi = '#caa043', crateDk = '#7a5a1f';
    const oxBase = '#7c5636', oxHi = '#9c744a', horn = '#e6dcc2', muzzle = '#3a2a1e', oxDk2 = '#553520', oxSh = '#3d2614';
    const x0 = 0.3, x1 = 3.0, y0 = 0.1, y1 = 1.6, zf = 20, zt = 36, ymid = (y0 + y1) / 2;
    const axF = P(1.7, y0, 0), axN = P(1.7, y1, 0);
    g.fillStyle = 'rgba(0,0,0,.30)'; g.beginPath(); g.ellipse(6, 6, 70, 18, 0, 0, 6.2832); g.fill();
    function wheel(hx, hy, r) {
      g.fillStyle = '#241a10'; g.beginPath(); g.ellipse(hx, hy, r * 0.60, r, 0, 0, 6.2832); g.fill();
      g.fillStyle = wood; g.beginPath(); g.ellipse(hx, hy, r * 0.60 - 2.4, r - 2.4, 0, 0, 6.2832); g.fill();
      g.fillStyle = woodDk; g.beginPath(); g.ellipse(hx, hy, r * 0.36, r - 7, 0, 0, 6.2832); g.fill();
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; line([hx, hy], [hx + Math.cos(a) * (r * 0.52), hy + Math.sin(a) * (r - 3)], woodMid, 1.6); }
      g.fillStyle = iron; g.beginPath(); g.ellipse(hx, hy, 3, 4, 0, 0, 6.2832); g.fill();
      g.fillStyle = ironHi; g.beginPath(); g.ellipse(hx - 0.6, hy - 1, 1.2, 1.6, 0, 0, 6.2832); g.fill();
    }
    wheel(axF[0], axF[1] - 16, 17);                                     // rueda lejana
    quad([P(x0, y1, zf), P(x1, y1, zf), P(x1, y1, zt), P(x0, y1, zt)], wood);
    for (let i = 1; i < 7; i++) { const t = x0 + (x1 - x0) * i / 7; line(P(t, y1, zf), P(t, y1, zt), woodDk, 1); }
    line(P(x0, y1, zt), P(x1, y1, zt), woodHi, 1.6); line(P(x0, y1, zf), P(x1, y1, zf), woodDk, 1.4);
    quad([P(x1, y0, zf), P(x1, y1, zf), P(x1, y1, zt), P(x1, y0, zt)], woodMid);
    line(P(x1, y0, zt), P(x1, y1, zt), woodHi, 1.4);
    quad([P(x0, y0, zt), P(x1, y0, zt), P(x1, y1, zt), P(x0, y1, zt)], woodHi);
    quad([P(x0 + 0.1, y0 + 0.1, zt), P(x1 - 0.1, y0 + 0.1, zt), P(x1 - 0.1, y1 - 0.1, zt), P(x0 + 0.1, y1 - 0.1, zt)], '#5a3d1e');
    [1.05, 2.05].forEach(t => { line(P(t, y1, zf), P(t, y1, zt), iron, 2); line(P(t, y1, zf), P(t, y1, zt - 0.5), ironHi, 0.6); });
    if (cfg.studs) { g.fillStyle = cfg.finial; [0.7, 1.4, 2.1, 2.7].forEach(t => { const q = P(t, y1, zt - 6); g.beginPath(); g.arc(q[0], q[1], 1.3, 0, 6.3); g.fill(); }); }   // tachones dorados en el lateral
    const boxIso = (cx, cy, cz, w, d, hh, c, ch, cd) => {
      quad([P(cx, cy + d, cz), P(cx + w, cy + d, cz), P(cx + w, cy + d, cz + hh), P(cx, cy + d, cz + hh)], c);
      quad([P(cx + w, cy, cz), P(cx + w, cy + d, cz), P(cx + w, cy + d, cz + hh), P(cx + w, cy, cz + hh)], cd);
      quad([P(cx, cy, cz + hh), P(cx + w, cy, cz + hh), P(cx + w, cy + d, cz + hh), P(cx, cy + d, cz + hh)], ch);
    };
    boxIso(2.3, 0.35, zt - 3, 0.55, 0.6, 12, crate, crateHi, crateDk);
    boxIso(2.25, 1.0, zt - 3, 0.5, 0.5, 8, crate, crateHi, crateDk);
    // Toldo cubierto (semicilindro).
    const cbx0 = x0 + 0.05, cbx1 = 2.15, A = 26;
    const zc = (t) => zt + 2 + A * Math.sin(Math.PI * t), gyAt = (t) => y0 + (y1 - y0) * t;
    let back = []; for (let s = 0; s <= 14; s++) { const t = s / 14; back.push(P(cbx0, gyAt(t), zc(t))); } back.push(P(cbx0, y1, zt)); back.push(P(cbx0, y0, zt)); quad(back, canopyDk);
    quad([P(cbx0, gyAt(.5), zc(.5)), P(cbx1, gyAt(.5), zc(.5)), P(cbx1, gyAt(.74), zc(.74)), P(cbx0, gyAt(.74), zc(.74))], canopy);
    quad([P(cbx0, gyAt(.74), zc(.74)), P(cbx1, gyAt(.74), zc(.74)), P(cbx1, y1, zt), P(cbx0, y1, zt)], canopyDk);
    quad([P(cbx0, gyAt(.42), zc(.42)), P(cbx1, gyAt(.42), zc(.42)), P(cbx1, gyAt(.52), zc(.52)), P(cbx0, gyAt(.52), zc(.52))], canopyHi);
    for (let r = 0; r <= 5; r++) { const gx = cbx0 + (cbx1 - cbx0) * r / 5; line(P(gx, ymid, zc(0.5)), P(gx, y1, zt), canopyDk, 1.1); }
    // VALANCE (faldón) del color del tier + tachones/ribete dorado en niveles altos.
    if (cfg.trim) {
      quad([P(cbx0, y1, zt), P(cbx1, y1, zt), P(cbx1, y1, zt - 6), P(cbx0, y1, zt - 6)], cfg.trim);
      if (cfg.imperial) quad([P(cbx0, y1, zt - 6), P(cbx1, y1, zt - 6), P(cbx1, y1, zt - 7), P(cbx0, y1, zt - 7)], cfg.finial);
      if (cfg.studs) { for (let r = 0; r <= 5; r++) { const gx = cbx0 + (cbx1 - cbx0) * r / 5; const q = P(gx, y1, zt - 3); g.fillStyle = cfg.finial; g.beginPath(); g.arc(q[0], q[1], 1, 0, 6.3); g.fill(); } }
    }
    let fr = []; for (let s = 0; s <= 14; s++) { const t = s / 14; fr.push(P(cbx1, gyAt(t), zc(t))); } fr.push(P(cbx1, y1, zt)); fr.push(P(cbx1, y0, zt)); quad(fr, canopyIn);
    let ar = []; for (let s = 0; s <= 14; s++) { const t = s / 14; ar.push(P(cbx1, gyAt(t), zc(t))); } g.strokeStyle = canopyDk; g.lineWidth = 1.4; g.beginPath(); ar.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke();
    line(P(x1, y0 + 0.35, zf + 3), P(4.5, y0 + 0.5, zf - 4), woodDk, 2.4);
    line(P(x1, y1 - 0.35, zf + 3), P(4.5, y1 - 0.5, zf - 4), woodDk, 2.4);
    // Conductor en el pescante.
    const seat = P(cbx1 + 0.35, ymid, zt);
    quad([P(cbx1 + 0.05, y0 + 0.2, zt - 1), P(cbx1 + 0.7, y0 + 0.2, zt - 1), P(cbx1 + 0.7, y1 - 0.2, zt - 1), P(cbx1 + 0.05, y1 - 0.2, zt - 1)], woodMid);
    const dcv = caravanDriver();
    if (dcv && dcv.width) {
      // Iguala el tamaño del conductor al de un mecenas: alto = charH()*SPRITE_DISP,
      // dividido por CDRAW (el lienzo entero se dibuja luego ×CDRAW).
      const Ht = (window.HacChar ? charH() : 56) * SPRITE_DISP / CDRAW, Wt = dcv.width * (Ht / dcv.height);
      g.imageSmoothingEnabled = true;
      g.drawImage(dcv, seat[0] - Wt / 2, seat[1] - Ht + 4, Wt, Ht);
      g.imageSmoothingEnabled = false;
    }
    wheel(axN[0], axN[1] - 16, 17);                                     // rueda cercana
    // Buey.
    (function () {
      const b = P(4.7, ymid, 0), bx = Math.round(b[0]), by = Math.round(b[1]);
      const px = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(bx + x, by + y, w, h); };
      const el = (x, y, rx, ry, c) => { g.fillStyle = c; g.beginPath(); g.ellipse(bx + x, by + y, rx, ry, 0, 0, 6.2832); g.fill(); };
      px(-13, -18, 4, 18, oxSh); px(6, -18, 4, 18, oxSh); px(-7, -17, 4, 17, oxDk2); px(11, -17, 4, 17, oxDk2);
      px(-13, -2, 4, 2, '#181009'); px(6, -2, 4, 2, '#181009'); px(-7, -2, 4, 2, '#181009'); px(11, -2, 4, 2, '#181009');
      px(-17, -31, 2, 17, oxDk2); px(-18, -16, 3, 4, '#241a10');
      el(-1, -27, 16, 10, oxBase); el(-3, -32, 12, 4, oxHi); el(2, -20, 12, 3, oxSh);
      el(-9, -35, 6, 6, oxBase); el(-9, -36, 5, 4, oxHi);
      px(9, -34, 9, 14, oxBase); el(21, -25, 8, 7, oxBase); el(19, -28, 4, 3, oxHi); el(27, -20, 5, 4, muzzle);
      px(24, -22, 2, 2, '#0d0906'); px(30, -19, 1, 1, '#0d0906'); px(22, -26, 2, 2, '#110b07'); el(14, -30, 3, 2, oxDk2);
      g.fillStyle = horn;
      g.beginPath(); g.moveTo(bx + 15, by - 32); g.quadraticCurveTo(bx + 11, by - 41, bx + 17, by - 43); g.lineTo(bx + 18, by - 41); g.quadraticCurveTo(bx + 15, by - 38, bx + 18, by - 32); g.fill();
      g.beginPath(); g.moveTo(bx + 25, by - 31); g.quadraticCurveTo(bx + 30, by - 40, bx + 25, by - 44); g.lineTo(bx + 23, by - 42); g.quadraticCurveTo(bx + 26, by - 37, bx + 22, by - 31); g.fill();
      g.fillStyle = woodDk; px(4, -37, 15, 3); g.fillStyle = '#2a1a0d'; px(4, -37, 15, 1);
      if (cfg.trim) { g.fillStyle = cfg.trim; px(4, -38, 15, 2); if (cfg.studs) { g.fillStyle = cfg.finial; px(4, -39, 15, 1); } }   // testera del buey con el color del tier
    })();
    // Asta + BANDERINES 貢 (nº y color según tier) + finial.
    const pole = P(x0, y0, 0);
    g.fillStyle = woodDk; g.fillRect(pole[0] - 1.2, pole[1] - 70, 2.4, 70);
    g.fillStyle = cfg.finial; g.beginPath(); g.arc(pole[0], pole[1] - 70, 2.4, 0, 6.2832); g.fill();
    const flagY = [-68, -52, -36];
    for (let f = 0; f < cfg.flags; f++) {
      const fy = flagY[f], fcol = f === 0 ? cloth : (cfg.trim || cloth);
      quad([[pole[0] + 1, pole[1] + fy], [pole[0] + 18, pole[1] + fy + 4], [pole[0] + 18, pole[1] + fy + 14], [pole[0] + 1, pole[1] + fy + 11]], fcol);
      quad([[pole[0] + 1, pole[1] + fy], [pole[0] + 18, pole[1] + fy + 4], [pole[0] + 18, pole[1] + fy + 6], [pole[0] + 1, pole[1] + fy + 2]], clothHi);
      if (f === 0) { g.fillStyle = '#fff4d8'; g.font = '11px "Noto Serif SC",serif'; g.textBaseline = 'middle'; g.textAlign = 'center'; try { g.fillText('貢', pole[0] + 9, pole[1] + fy + 9); } catch (e) {} }
    }
    g.restore();
    caravanCache[ck] = cv; return cv;
  }
  function drawCaravan(g, lx, ly) {
    const cv = caravanBaked(caravan && caravan.tier || 1), fx = lx * SCALE, fy = ly * SCALE;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false;
    g.translate(fx, fy); g.drawImage(cv, -CCX * CDRAW, -CFEET * CDRAW, CW * CDRAW, CH * CDRAW); g.restore();
  }
  // Estado de la caravana: llega (from→to), espera (idle), se va (to→from) y desaparece.
  let caravan = null;
  const CAR_IN_MS = 1700, CAR_OUT_MS = 1400;
  function setCaravan(on, tier) {
    const nv = Math.max(1, Math.min(5, tier | 0)) || 1;
    if (on) {
      if (caravan && caravan.phase !== 'out') { caravan.tier = nv; return; }       // ya está (refresca nivel)
      // ESPERA CLARAMENTE FUERA del portón (en el campo, al sur de la muralla) y a un
      // lado del eje de tránsito. Antes usaba outNear[1]-0.5 (tirando HACIA la muralla)
      // + un desvío grande en x → en fincas con edificios junto al portón el carro se
      // metía entre las casas. Ahora va MÁS al sur (fuera) y con desvío lateral moderado.
      const to = wk && wk.outNear ? [wk.outNear[0] + 2.2, wk.outNear[1] + 1.4] : null;
      const from = (wk && wk.outFar) || to; if (!to) { caravan = null; return; }
      caravan = { phase: 'in', p: 0, from: from, to: to, fx: from[0], fy: from[1], tier: nv };
    } else if (caravan && caravan.phase !== 'out') {
      caravan = { phase: 'out', p: 0, from: [caravan.fx, caravan.fy], to: (wk && wk.outFar) || [caravan.fx, caravan.fy], fx: caravan.fx, fy: caravan.fy };
    }
  }
  function stepCaravan(dt) {
    if (!caravan) return;
    const lerp = (a, b, t) => a + (b - a) * t;
    if (caravan.phase === 'in') {
      caravan.p = Math.min(1, caravan.p + dt * 1000 / CAR_IN_MS);                  // dt en SEGUNDOS; CAR_*_MS en ms
      const e = 1 - Math.pow(1 - caravan.p, 2);                                    // ease-out
      caravan.fx = lerp(caravan.from[0], caravan.to[0], e); caravan.fy = lerp(caravan.from[1], caravan.to[1], e);
      if (caravan.p >= 1) { caravan.phase = 'idle'; caravan.fx = caravan.to[0]; caravan.fy = caravan.to[1]; }
    } else if (caravan.phase === 'out') {
      caravan.p = Math.min(1, caravan.p + dt * 1000 / CAR_OUT_MS);                 // dt en SEGUNDOS; CAR_*_MS en ms
      caravan.fx = lerp(caravan.from[0], caravan.to[0], caravan.p); caravan.fy = lerp(caravan.from[1], caravan.to[1], caravan.p);
      if (caravan.p >= 1) caravan = null;
    }
  }
  // ¿El toque (lx,ly logicos) cae sobre la caravana? (caja del sprite proyectada).
  function caravanHit(lx, ly) {
    if (!caravan) return false;
    const p = logic(caravan.fx, caravan.fy), hw = CW * CDRAW / SCALE / 2, ht = CH * CDRAW / SCALE;
    return lx >= p[0] - hw && lx <= p[0] + hw && ly >= p[1] - ht && ly <= p[1] + 6;
  }

  // Crea la encarnación de un caballo: hogar ESTABLE (semilla por dueño) en el campo
  // que hay frente al portón sur, para que varios caballos no se amontonen.
  function makeHorse(id, info) {
    const e = wk && wk.exitCell; if (!e) return null;
    let seed = 2166136261; for (let i = 0; i < id.length; i++) seed = (seed ^ id.charCodeAt(i)) * 16777619 >>> 0;
    const r0 = (seed % 997) / 997;                         // 0..1 estable por dueño
    // Pastizal LATERAL (un lado estable por caballo): se aparta del corredor CENTRAL
    // del portón (columna gateC), que es por donde LLEGA y ESPERA la caravana de
    // tributo. Antes pastaban en el eje (e[0]±1.8) y se pisaban con el carro.
    const side = (seed & 1) ? 1 : -1;
    const homeX = e[0] + side * (3.5 + r0 * 1.5);          // a un lado del portón, fuera del paso de la caravana
    const homeY = e[1] + 3.2 + r0 * 1.1;                   // al sur, fuera de la muralla
    return { id, nombre: (info && info.nombre) || 'Corcel', variante: (info && info.variante) || 'caballo',
      _r: seed || 1, homeX, homeY, fx: homeX, fy: homeY, tx: homeX, ty: homeY, dir: 'SE', phase: 0, moving: false, pauseT: 1 + r0 * 3 };
  }
  // VIDA del caballo: pasta un rato, camina a un punto cercano del pastizal, se para.
  // Semi-determinista (mrand por dueño) → todos los clientes lo ven parecido. Se
  // auto-sincroniza con `caballos` (crea/quita) por si el mapa llega antes que la finca.
  const horseOf = (id) => horses.find(x => x.id === id) || null;
  // Llama al caballo del dueño a (tx,ty) — acude a paso ligero (silbido de salida).
  function summonHorse(id, tx, ty) { const hh = horseOf(id); if (hh) { hh.summonTo = [tx, ty]; hh.arrived = false; hh.pauseT = 0; } return !!hh; }
  function stepHorses(dt) {
    if (!wk || !wk.exitCell) return;
    const ids = Object.keys(caballos);
    if (horses.length !== ids.length || horses.some(h => !caballos[h.id])) {
      horses = horses.filter(h => caballos[h.id]);
      ids.forEach(id => { if (!horses.find(h => h.id === id)) { const nh = makeHorse(id, caballos[id]); if (nh) horses.push(nh); } });
    }
    const SPD = 0.62, SUMMON_SPD = 1.5;
    horses.forEach(h => {
      const c = caballos[h.id]; if (c && c.nombre) h.nombre = c.nombre;
      if (h.rider) { h.moving = false; return; }           // MONTADO: lo lleva el jinete (drawMount)
      // Reanudación: el dueño ya está FUERA en expedición (montó en OTRO cliente, o antes
      // de recargar, sin que ESTE cliente viviera la coreografía de silbar/montar). Sin
      // esto, el corcel se quedaría pastando en la finca mientras su jinete está de misión
      // (visible p.ej. desde otra cuenta). Un dueño con caballo SIEMPRE sale montado
      // (expedición individual y escaramuza), así que basta con que su walker esté 'fuera'.
      const away = walkers.find(x => x.id === h.id && x.state === 'fuera');
      if (away) { h.rider = h.id; h.summonTo = null; h.arrived = false; away.mounted = true; h.moving = false; return; }
      if (h.summonTo) {                                     // ACUDE al silbido del dueño
        const dx = h.summonTo[0] - h.fx, dy = h.summonTo[1] - h.fy, d = Math.sqrt(dx * dx + dy * dy), adv = SUMMON_SPD * dt;
        const fd = faceFromGrid(dx, dy); if (fd) h.dir = fd; h.moving = true; h.phase += dt * 4;
        if (d <= adv || d < 0.05) { h.fx = h.summonTo[0]; h.fy = h.summonTo[1]; h.summonTo = null; h.moving = false; h.arrived = true; }
        else { h.fx += dx / d * adv; h.fy += dy / d * adv; }
        return;
      }
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
    // PEREGRINAJE: el herido sale COJEANDO y no hace la reverencia marcial (拱手).
    const em = escMap[w.id];
    const hurt = !!(em && em.hurt);
    let pose = (w.state === 'tumbado' || w.debSit) ? 'sit' : (w.bowing ? 'bow' : (moving ? 'walk' : 'stand'));
    if (hurt) pose = moving ? 'limp' : 'stand';
    let laborOfi = null, laborWp = 0;
    if (w.state === 'laborando' && w.oficioActivo) { pose = 'work'; laborOfi = w.oficioActivo; laborWp = w.workPhase || 0; }   // séquito trabajando
    const cv = window.HacChar ? spriteFor(w, w.dir || 'S', frame, pose, laborOfi, laborWp) : null;
    const disp = SPRITE_DISP, FEET = charFEET();
    // TALLA no uniforme: Guan Yu es más ALTO sin ensancharse apenas (el alto crece con
    // `talla`; el ancho solo un 30% de esa subida). Así se ve espigado, no hinchado.
    const talla = w.talla || 1, kH = talla, kW = 1 + (talla - 1) * 0.3;
    if (isMounted(w)) {
      drawMount(g, lx, ly, w, moving);   // caballo (ciclo de andar) + jinete sobre la silla
    } else if (cv) {
      // Blit en espacio de DISPOSITIVO (transform identidad) para que el sprite
      // quede nítido (igual que los sprites de edificio). Pies del sprite sobre (lx,ly).
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.imageSmoothingEnabled = pngOn();
      const dx = Math.round(lx * SCALE - charW() * 0.5 * disp * kW);
      const dy = Math.round(ly * SCALE - FEET * disp * kH);
      g.drawImage(cv, dx, dy, Math.round(charW() * disp * kW), Math.round(charH() * disp * kH));
      g.restore();
    }
    if (o.banner !== false) banner(g, lx, ly - Math.round(FEET * disp * kH / SCALE) + 1 - (isMounted(w) ? Math.round((RIDER_UP + 4) / SCALE) : 0), w, o.highlight);
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
  // La fuente CJK ("Noto Serif SC") pesa y en MÓVIL (primera visita, sin caché)
  // no suele estar lista al hornear el primer banner: measureText usa entonces
  // métricas de fallback (caja mal dimensionada → el texto se sale) y fillText
  // puede pintar tofu/vacío. Como el sprite queda cacheado, el fallo se congelaba.
  // Al terminar de cargar las fuentes invalidamos la caché para re-hornear con las
  // métricas reales (el tick repinta cada frame). Forzamos además la descarga: el
  // texto pintado en canvas NO la dispara por sí solo en varios navegadores.
  if (typeof document !== 'undefined' && document.fonts) {
    const rebakeBanners = () => {
      bannerCache.clear();
      // Con motion reducido se pinta una sola vez (sin bucle raf): re-hornea ya.
      if (started && !running) { try { paint(); } catch (e) {} }
    };
    try {
      Promise.all([
        document.fonts.load('700 8px "Noto Serif SC"'),
        document.fonts.load('600 7px "Noto Sans SC"'),
      ]).then(rebakeBanners).catch(function () {});
    } catch (e) {}
    document.fonts.ready.then(rebakeBanners).catch(function () {});
    if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', rebakeBanners);
  }
  // Etiqueta del pendón: un ENVIADO sin revelar aparece como «Visitante» (su
  // nombre se descubre HABLANDO con él, y entonces se actualiza solo para ti).
  function bannerLabel(w) { return (w.visitante && !w.reveal) ? 'Visitante' : String(w.name || ''); }
  function bannerKey(w, hot) {
    // Solo el NOMBRE: el rango se lee por el ESTILO del pendón (RANK_STYLE), no por iconos.
    return bannerLabel(w).slice(0, 16) + '|' + (Number(w.cargoTier) || 0) + '|' + (hot ? 1 : 0) + '|' + (w.npc ? 'n' : '');
  }
  function bannerSprite(w, hot) {
    const key = bannerKey(w, hot);
    let s = bannerCache.get(key);
    if (s) return s;
    const label = bannerLabel(w).slice(0, 16);
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
    const label = bannerLabel(w).slice(0, 16);   // solo el nombre (sin iconos): banner limpio
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

  // ── Capa de personajes nítida (overlay a resolución de pantalla) ────────────
  const getT = () => (opts && typeof opts.getTransform === 'function') ? opts.getTransform() : null;
  // Activa solo con sprites PNG listos, cámara disponible y animación en marcha
  // (con motion reducido no hay tick continuo → se queda el sprite del lienzo).
  function ovActive() { return pngOn() && running && !!getT() && !!(window.HacChar && HacChar.imgFor); }
  function ensureOverlay() {
    if (!iso || !iso.parentElement) return null;
    if (ovCanvas && ovCanvas.parentElement === iso.parentElement) return ovCanvas;
    ovCanvas = document.createElement('canvas');
    ovCanvas.className = 'hacp-iso-ov';
    ovCanvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;z-index:1;pointer-events:none;image-rendering:auto';
    iso.parentElement.appendChild(ovCanvas);
    ovCtx = ovCanvas.getContext('2d');
    return ovCanvas;
  }
  function removeOverlay() {
    if (ovCanvas && ovCanvas.parentElement) ovCanvas.parentElement.removeChild(ovCanvas);
    ovCanvas = null; ovCtx = null;
  }
  // Pose/frame de un personaje para el maestro (mismo criterio que drawWalker).
  function ovPose(w) {
    const moving = w.moving && w.state !== 'tarea';
    return {
      dir: w.dir || 'SE',
      pose: (w.state === 'tumbado' || w.debSit) ? 'sit' : (w.bowing ? 'bow' : (moving ? 'walk' : 'stand')),
      frame: moving ? (Math.floor(w.phase * 1.2) % charNF()) : 0
    };
  }
  // Dibuja la lista de personajes (ordenada de atrás→delante) en el overlay, a
  // resolución de pantalla, desde el maestro de alta resolución.
  function paintOverlay(people, sel) {
    const active = ovActive();
    // El resaltado de celdas (jardines) debe verse SIEMPRE, aunque la capa nítida de
    // personajes no esté activa; solo salimos pronto si no hay ni capa ni resaltado.
    if (!active && !hlCells.length) { if (ovCtx && ovCanvas) ovCtx.clearRect(0, 0, ovCanvas.width, ovCanvas.height); return; }
    if (!ensureOverlay()) return;
    const t = getT(); if (!t) { if (ovCtx && ovCanvas) ovCtx.clearRect(0, 0, ovCanvas.width, ovCanvas.height); return; }
    const vp = iso.parentElement, dpr = (window.devicePixelRatio || 1);
    const vw = vp.clientWidth, vh = vp.clientHeight;
    const bw = Math.max(1, Math.round(vw * dpr)), bh = Math.max(1, Math.round(vh * dpr));
    if (ovCanvas.width !== bw || ovCanvas.height !== bh) { ovCanvas.width = bw; ovCanvas.height = bh; }
    const g = ovCtx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, bw, bh);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    const S = SCALE, cs = t.scale, k = cs * dpr;                 // backing px → device px del overlay
    // Celdas RESALTADAS (jardines para el debate): rombos amarillos que PARPADEAN. Se
    // pintan aunque no haya capa de personajes activa (van antes del early-return).
    if (hlCells.length) {
      hlPhase += 0.10;
      const pulse = 0.5 + 0.5 * Math.sin(hlPhase);               // 0..1
      const a = 0.22 + 0.42 * pulse;                             // relleno 0.22..0.64
      const toDev = (X, Y) => [(t.tx + X * S * cs) * dpr, (t.ty + Y * S * cs) * dpr];
      g.lineWidth = Math.max(1.5, 2.2 * cs * dpr);
      hlCells.forEach(c => {
        const lc = logic(c[0], c[1]);
        const N = toDev(lc[0], lc[1] - TH / 2), E = toDev(lc[0] + TW / 2, lc[1]), So = toDev(lc[0], lc[1] + TH / 2), Wo = toDev(lc[0] - TW / 2, lc[1]);
        g.beginPath(); g.moveTo(N[0], N[1]); g.lineTo(E[0], E[1]); g.lineTo(So[0], So[1]); g.lineTo(Wo[0], Wo[1]); g.closePath();
        g.fillStyle = 'rgba(255,222,70,' + a.toFixed(3) + ')'; g.fill();
        g.strokeStyle = 'rgba(255,246,180,' + (0.7 + 0.3 * pulse).toFixed(3) + ')'; g.stroke();
      });
    }
    if (!active) return;                                         // sin capa de personajes: solo el resaltado
    const feetFrac = (HacChar.feetFrac || (charFEET() / charH()));
    const aspect = (HacChar.aspect || (charW() / charH()));
    const one = (p, highlight) => {
      const pr = ovPose(p);
      const master = HacChar.imgFor(pr.dir, pr.pose, pr.frame); if (!master) return;
      const lp = logic(p.fx, p.fy);
      const fsx = (t.tx + lp[0] * S * cs) * dpr;                 // pies en px de dispositivo
      const fsy = (t.ty + lp[1] * S * cs) * dpr;
      const destH = charH() * k, destW = destH * aspect;
      if (highlight) {                                            // glow del seleccionado, bajo los pies
        const rx = (8 + Math.sin(p.phase * 0.5) * 1.4) * S * k, ry = rx * 0.5;
        g.save();
        g.fillStyle = 'rgba(255,224,130,0.22)'; g.beginPath(); g.ellipse(fsx, fsy, rx, ry, 0, 0, 6.2832); g.fill();
        g.strokeStyle = 'rgba(255,224,130,0.95)'; g.lineWidth = 1.4 * k; g.beginPath(); g.ellipse(fsx, fsy, rx, ry, 0, 0, 6.2832); g.stroke();
        g.restore();
      }
      g.drawImage(master, Math.round(fsx - destW * 0.5), Math.round(fsy - destH * feetFrac), Math.round(destW), Math.round(destH));
    };
    people.forEach(p => one(p, false));
    if (sel) one(sel, true);
  }

  function paint() {
    if (!window.HacIso || !HacIso.frame) return;
    // Agrupa quién está DENTRO de cada edificio (estado 'tarea').
    const inside = {};   // buildingId → [walker]
    walkers.forEach(w => { if (w.insideId) (inside[w.insideId] = inside[w.insideId] || []).push(w); });

    const actors = [], overlays = [], signs = [];
    // Capa nítida activa → los personajes (no montados) se recogen aparte y se
    // pintan en el overlay a resolución de pantalla; si no, van al lienzo como antes.
    const OV = ovActive(), ovPeople = [];
    const FEET = charFEET(), bannerDy = Math.round(FEET * SPRITE_DISP / SCALE) - 1;
    // Portones: hojas animadas (el sprite no las trae). Los interiores van como
    // overlay (bajos, coste mínimo). El PERIMETRAL entra como ACTOR con caja de
    // profundidad propia: si fuera overlay, el pasaje oscuro y las hojas abiertas
    // se pintarían ENCIMA del mecenas que está saliendo (ya al sur de la cara del
    // muro), «tragándoselo» justo al cruzar el portón de salida suroeste.
    if (wk && wk.gates) wk.gates.forEach(gate => {
      if (!gate.perimeter) { overlays.push({ draw: (g) => drawGate(g, gate) }); return; }
      if (gate.open <= 0.012) return;                    // cerrado → hojas horneadas por hac-iso
      const gx = gate.gx, gy = gate.gy;                  // (gx = columna, gy = cara del muro, ver push de _hacGates)
      actors.push({
        fx: gx, fy: gy + 0.05,                           // un pelo al sur de la cara: delante de los muros, detrás del que emerge
        dbox: gate.orient === 'x' ? [gx - 1.5, gy - 0.5, gx + 1.5, gy] : [gx - 0.5, gy - 1.5, gx, gy + 1.5],
        bound: { l: 100, up: 80, w: 200, h: 130 },       // recuadro de recomposición (pasaje + hojas abatidas)
        draw: (g) => drawGate(g, gate)
      });
    });
    // Mercader(es): personajes fijos al frente de cada mercado (mismo render).
    const npcDy = bannerDy;
    if (wk && wk.merchants) wk.merchants.forEach(mk => {
      if (OV) ovPeople.push(mk); else actors.push({ fx: mk.fx, fy: mk.fy, draw: (g, lx, ly) => drawWalker(g, lx, ly, mk, { banner: false }) });
      overlays.push({ draw: (g) => { const p = logic(mk.fx, mk.fy); npcBanner(g, p[0], p[1] - npcDy, mk.name, '市'); } });
    });
    // Caballos sueltos: sprite como actor (con oclusión/profundidad) + su nombre encima.
    // Si su dueño está de VIAJE (lo va montando), el corcel no ronda: viaja con él.
    if (horses.length) {                               // caballos procedurales pastando
      const HBANNER = Math.round(HFEET * HDRAW / SCALE) + 3;   // banner justo por encima de las orejas
      horses.forEach(h => {
        if (h.rider) return;                           // MONTADO → se dibuja con el jinete (drawMount), no suelto
        actors.push({ fx: h.fx, fy: h.fy, bound: HORSE_BOUND, draw: (g, lx, ly) => drawHorse(g, lx, ly, h) });
        overlays.push({ draw: (g) => { const p = logic(h.fx, h.fy); npcBanner(g, p[0], p[1] - HBANNER, h.nombre, '🐎'); } });
      });
    }
    // Caravana de tributo: actor (profundidad/oclusión como el resto) + banner 貢.
    if (caravan) {
      // dbox alargado hacia el NORTE (portón/muralla): así esas estructuras entran en
      // la recomposición «cercana» y NO se borran bajo el recuadro alto del carro.
      const ccx = Math.round(caravan.fx), ccy = Math.round(caravan.fy);
      actors.push({ fx: caravan.fx, fy: caravan.fy, bound: CARAVAN_BOUND, dbox: [ccx - 1, ccy - 4, ccx + 2, ccy + 1], draw: (g, lx, ly) => drawCaravan(g, lx, ly) });
      overlays.push({ draw: (g) => { const p = logic(caravan.fx, caravan.fy); npcBanner(g, p[0], p[1] - Math.round((CFEET - 8) * CDRAW / SCALE), 'Tributo', '貢'); } });
    }
    // Mecenas visibles: el sprite va como actor (con oclusión); el NOMBRE va aparte.
    const nameCands = [];
    walkers.forEach(w => {
      if (w.id === selectedId) return;                 // el seleccionado va en overlay (encima)
      if (w.insideId) return;                          // DENTRO de un edificio: oculto (su presencia la anuncia el banner 匾額)
      if (w.state === 'fuera') return;                 // EN EXPEDICIÓN fuera de la finca: oculto hasta volver
      // No montados → capa nítida; montados (caballo+jinete) siguen en el lienzo.
      // EXCEPCIÓN: el enviado espera pegado al portón sur; en la capa nítida (sin
      // oclusión) se veía flotando sobre la muralla. Va por el lienzo (oclusión real
      // vs. muro), como los caballos/caravana que también rondan junto a la tapia.
      if (OV && !isMounted(w) && !w.visitante) ovPeople.push(w);
      else { const act = { fx: w.fx, fy: w.fy, draw: (g, lx, ly) => drawWalker(g, lx, ly, w, { banner: false }) }; if (isMounted(w)) act.bound = MOUNT_BOUND; else if (w.visitante) act.bound = ENVOY_BOUND; actors.push(act); }
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
        // A caballo la cabeza va mucho más arriba: sube el banner para no tapar al jinete.
        const upM = isMounted(w) ? Math.round((RIDER_UP + 4) / SCALE) : 0;
        const Wd = s.cv.width / SCALE, Hd = s.cv.height / SCALE, topY = p[1] - bannerDy - upM;
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
    let ovSel = null;
    if (sel && sel.state !== 'fuera') {
      if (OV && !isMounted(sel)) ovSel = sel;   // resaltado en la capa nítida, siempre encima
      else overlays.push({ draw: (g) => drawWalker(g, logic(sel.fx, sel.fy)[0], logic(sel.fx, sel.fy)[1], sel, { highlight: true }) });
    }

    // Bocadillos de las charlas: capa overlay, encima de todo y sin oclusión.
    walkers.forEach(w => {
      if (!w.speech) return;
      overlays.push({ draw: (g) => { const p = logic(w.fx, w.fy); speechBubble(g, p[0], p[1], w.speech); } });
    });
    // Pregones del mercader.
    if (wk && wk.merchants) wk.merchants.forEach(mk => { if (mk.speech) overlays.push({ draw: (g) => { const p = logic(mk.fx, mk.fy); speechBubble(g, p[0], p[1], mk.speech); } }); });

    iso._hacSigns = signs;
    HacIso.frame(iso, actors, overlays);
    // Capa nítida de personajes (atrás→delante; el seleccionado, encima de todo).
    if (OV) { ovPeople.sort((a, b) => (a.fx + a.fy) - (b.fx + b.fy)); lastOv = { people: ovPeople, sel: ovSel }; paintOverlay(ovPeople, ovSel); }
    else if (hlCells.length) { lastOv = { people: [], sel: null }; paintOverlay([], null); }   // solo resaltado (sin capa nítida)
    else { lastOv = { people: [], sel: null }; if (ovCtx) ovCtx.clearRect(0, 0, ovCanvas.width, ovCanvas.height); }
  }
  // Repinta SOLO la capa nítida (barato) con las posiciones del último frame de sim,
  // reproyectando con el transform ACTUAL. Lo llama la cámara en cada pan/zoom para
  // que los personajes sigan al tablero sin retraso (0 frames de desfase).
  function repaintOverlay() { if (ovActive()) paintOverlay(lastOv.people, lastOv.sel); else if (hlCells.length) paintOverlay([], null); }

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
    syncEnviado();   // añade el enviado (visitante) si lo hay
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
      // El enviado NO se serializa: su estado es autoritativo en la tabla `enviados`
      // y se reconstruye vía setEnviado; guardarlo duplicaría/desincronizaría la foto.
      walkers: walkers.filter(w => !w.visitante).map(w => { const o = { id: w.id }; SER_FIELDS.forEach(k => { o[k] = w[k]; }); return o; }),
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
    syncEnviado();   // el enviado no está en la foto: reconcílialo con la tabla
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
    removeOverlay();
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
    if (w.visitante) return (w.state === 'esperando') ? 'Aguarda ante el portón, esperando ser recibido' : 'De visita por la finca';
    const em = escMap[w.id], enEsc = !!em;
    // Peregrinaje «En busca del legendario curandero»: textos propios.
    if (em && em.pereg) {
      if (w.state === 'esc-cheer') return em.hurt ? 'Aguarda en el portón, dolorido' : 'Reúne al grupo del peregrinaje';
      if (w.state === 'exped-out') return em.hurt ? 'Parte cojeando hacia la montaña' : 'Escolta al herido hacia la montaña';
      if (w.state === 'fuera') return 'De peregrinaje hacia el gran sabio';
      if (w.state === 'exped-in') return 'Regresa del peregrinaje';
      if (w.state === 'saludo') return 'Se prepara para el peregrinaje';
    }
    if (w.state === 'esc-cheer') return w.bowing ? '¡A la batalla!' : 'Formando en el portón';
    if (w.state === 'saludo') return enEsc ? 'Se prepara para la escaramuza' : 'Recibe tus órdenes';
    if (w.state === 'fuera') return enEsc ? 'Combatiendo en la escaramuza' : 'En expedición fuera de la finca';
    if (w.state === 'esc-form') return 'Toma posición en el portón';
    if (w.state === 'monta-out') return 'Sale a por su caballo';
    if (w.state === 'silbando') return 'Silba a su caballo';
    if (w.state === 'exped-out') return w.mounted ? 'Parte a caballo' : (enEsc ? 'Acude al portón' : 'Saliendo de la finca');
    if (w.state === 'exped-in') return 'Regresando de la expedición';
    if (w.state === 'a-debatir') return 'Se dirige al jardín a debatir';
    if (w.state === 'debate' || w.state === 'debate-frustrado') {
      const o = walkers.find(x => x.id === w.debPartner), quien = (o && o.name) ? o.name : 'otro mecenas';
      if (w.state === 'debate-frustrado') return 'Sacado de quicio, tirándose de los pelos';
      if (o && o.state === 'debate-frustrado') return 'Sacando de quicio a ' + quien;
      return 'Debatiendo en el jardín con ' + quien;
    }
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
      // Facción a la que pertenece (junto al nombre en el panel). Directo del
      // personaje registrado; para el enviado con seed de dev, campos en el walker.
      const pjx = (window.HacPersonajes && HacPersonajes.get) ? HacPersonajes.get(w.id) : null;
      const facId = (pjx && pjx.faccion) || w.faccionId || null;
      let fac = (facId && window.HacFacciones && HacFacciones.get) ? HacFacciones.get(facId) : null;
      if (!fac && w.facNombre) fac = { nombre: w.facNombre, zh: w.facZh || '', color: w.color };
      // Enviado sin revelar: se muestra como «Visitante» y sin 字 (se descubre al hablar).
      const oculto = !!w.visitante && !w.reveal;
      const cortesia = oculto ? '' : (w.cortesia || (pjx && pjx.aspecto && pjx.aspecto.cortesia) || '');
      return { id: w.id, name: oculto ? 'Visitante' : w.name, realName: w.name, color: w.color, inside, activity: activityText(w),
        onMission: !!w.onMission, misEnTarea: enTarea, fuera, cortesia, faccion: fac, visitante: !!w.visitante, reveal: !!w.reveal,
        dir: w.dir, bowing: !!w.bowing,
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
    // A CABALLO: retrato compuesto (caballo + jinete). Vale para el flag `mounted` en vivo
    // y para cuando está de expedición fuera (state 'fuera') teniendo caballo (p.ej. tras
    // recargar, donde la fase de montar no se re-ejecuta).
    if (caballos[w.id] && (isMounted(w) || w.state === 'fuera')) {
      const coat = caballos[w.id].tono || '#8a5630';
      const hcv = horseBaked(false, 0, coat);
      const NWp = HW * HDRAW, NHp = HH * HDRAW, compW = NWp, compH = RIDER_UP + charH();
      const tmp = document.createElement('canvas'); tmp.width = compW; tmp.height = compH;
      const tg = tmp.getContext('2d'); tg.imageSmoothingEnabled = false;
      const fx = compW / 2, fy = compH;
      tg.drawImage(hcv, Math.round(fx - HCX * HDRAW), Math.round(fy - HFEET * HDRAW), NWp, NHp);
      const rcv = spriteFor(w, 'SE', 0, 'sit');
      if (rcv) { tg.imageSmoothingEnabled = pngOn(); tg.drawImage(rcv, Math.round(fx - charW() * 0.5), Math.round(fy - RIDER_UP - charFEET()), charW(), charH()); }
      const s = Math.min(canvas.width / compW, canvas.height / compH);
      const dw = Math.round(compW * s), dh = Math.round(compH * s);
      g.imageSmoothingEnabled = false;
      g.drawImage(tmp, Math.round((canvas.width - dw) / 2), canvas.height - dh, dw, dh);
      return;
    }
    // Retrato = pose DIGNA fija, no el frame de andar en vivo (quedaba a media zancada,
    // con la túnica abierta y a menudo de espaldas). Siempre de pie y de cara al espectador
    // (vista frontal SW/SE según hacia dónde mire), salvo si está tumbado/saludando.
    let pose = 'stand', frame = 0, dir;
    if (w.state === 'tumbado' || w.debSit) { pose = 'sit'; dir = w.dir || 'SE'; }
    else if (w.bowing) { pose = 'bow'; dir = w.dir || 'SE'; }
    else { const east = /E$/.test(w.dir || '') || (w.dir || '') === 'S'; dir = east ? 'SE' : 'SW'; }
    // Retrato: usa el MASTER de alta resolución (nítido) si está; si no, el sprite de finca.
    const cv = (HacChar.imgFor && HacChar.imgFor(dir, pose, frame)) || spriteFor(w, dir, frame, pose);
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

  // ENVIADO: fija/actualiza/retira al visitante (fuente = tabla `enviados`). Se
  // puede llamar antes o después de start(): guarda el descriptor y reconcilia en
  // vivo. `esVisitante(id)` distingue al enviado de un miembro en la página.
  function setEnviado(desc) {
    enviadoDesc = (desc && desc.id) ? desc : null;
    syncEnviado();
    if (!running) { paint(); pushState(); }
  }
  function esVisitante(id) { const w = walkers.find(x => x.id === id); return !!(w && w.visitante); }
  // Despide al enviado: en vez de quitarlo de golpe, lo hace SALIR ANDANDO por el
  // portón sur rumbo a su hacienda; al perderse de vista, el sim lo retira. Si no
  // hay walker (o no hay ruta), degrada a quitarlo directamente.
  function despedirEnviado() {
    const w = walkers.find(x => x.visitante);
    enviadoDesc = null;                       // visita concluida (estado compartido)
    if (!w) { syncEnviado(); if (!running) paint(); return; }
    startEnvoyLeave(w);
    if (!running) paint();
  }
  // Aptitud + aspecto del enviado activo (para dibujar su busto en la ventana de charla).
  function enviadoAspecto() { const w = walkers.find(x => x.visitante); return w ? { aptitud: w.aptitud || '', aspecto: w.aspecto || null, nombre: w.name || '', cortesia: w.cortesia || (w.aspecto && w.aspecto.cortesia) || '' } : null; }
  // Revela (o no) el nombre del enviado SOLO para este cliente: el pendón pasa de
  // «Visitante» a su nombre. Persiste en enviadoRevelado para re-spawns.
  function revelarEnviado(v) {
    enviadoRevelado = (v !== false);
    const w = walkers.find(x => x.visitante); if (w) w.reveal = enviadoRevelado;
    if (!running) paint();
  }

  return { start, stop, list, select, selected, position, buildings, buildingTypes, setOrders, setEscaramuzas, setDebate, setHighlight, setCaballos, drawAvatar, mountSprite, MOUNT_NF: HORSE_FRAMES, goHome, consultar, consultando, dejarConsulta, mainBuildingId, repaintOverlay, refreshCargos, setCaravan, caravanHit, caravanActiva: () => !!caravan, setEnviado, esVisitante, revelarEnviado, enviadoAspecto, despedirEnviado };
})();
if (typeof window !== 'undefined') window.HacFolk = HacFolk;
