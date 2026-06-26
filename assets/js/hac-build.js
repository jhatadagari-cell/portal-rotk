/* ═══════════════════════════════════════════════════════════════════════
   hac-build.js — Lógica PURA de construcciones de una hacienda (sin DOM).
   ─────────────────────────────────────────────────────────────────────────
   Una hacienda tiene un TABLERO isométrico (rejilla NxN que crece con el
   nivel) sobre el que se colocan EDIFICIOS de un catálogo. Cada edificio se
   asigna opcionalmente a un mecenas (`dueno`) que lo administra.

   El TABLERO no se persiste: su tamaño se DEDUCE del nivel de la casa. Solo se
   guardan las construcciones colocadas, en el campo `mapa` de la hacienda:
       mapa = { v:1, construcciones:[ {pos:[gx,gy], tipo, dueno, nivel} ] }

   API (window.HacBuild):
     CONSTRUCCIONES                 catálogo (congelado)
     tipo(id)                       def del catálogo | null
     gridSize(tier)                 lado de la rejilla (3/4/5)
     slotsDesbloqueados(tier)       nº de celdas (9/16/25)
     celdasOcupadas(c)              [[gx,gy],…] según footprint + pos
     dentroDeRejilla(c, tier)       bool
     colisiona(c, lista)            bool (solapa con otra construcción)
     construccionEn(lista, gx, gy)  la construcción que cubre esa celda | null
     puedeColocar(c, tier, lista)   {ok, motivo}
     construccionesValidas(mapa,t)  construcciones que caben en el tier actual
     normalizaMapa(mapa)            {v:1, construcciones:[…]} saneado
   ═══════════════════════════════════════════════════════════════════════ */
const HacBuild = (function () {
  'use strict';

  // Niveles de hacienda (de HAC_TIERS, en haciendas-data.js). El tamaño de la
  // rejilla y el nivel máximo se DEDUCEN de ahí; si no está cargado, fallback.
  const tiersData = () => (typeof HAC_TIERS !== 'undefined') ? HAC_TIERS : [];
  const MAX_TIER = (function () {
    const t = tiersData();
    return t.length ? Math.max.apply(null, t.map(x => Number(x.nivel) || 1)) : 3;
  })();

  // ── Catálogo de construcciones ──────────────────────────────────────────
  // footprint:[ancho,alto] en celdas — cada construcción tiene un tamaño distinto.
  // Se pueden ROTAR (campo `rot` 0..3 = ×90°); la ocupación usa el footprint
  // rotado (ver footprintDe). unico: máximo uno por hacienda. tierMin: nivel de
  // hacienda necesario. cargoMin: DIFERIDO (roles self-service pendientes).
  //
  // capa: tipifica CÓMO se pinta y se comporta la construcción —
  //   'suelo'    → elemento PLANO (jardines, estanques, plazas…): se dibuja como
  //                capa sobre el pavimento, por DEBAJO de muros y edificios.
  //   'edificio' → elemento VOLUMÉTRICO (halls, torres, pagodas…): entra en el
  //                orden de profundidad y se superpone correctamente.
  // Al añadir una construcción nueva, basta declarar su `capa` y se comportará
  // sola (no hay heurísticas por altura en el render). Por defecto: 'edificio'.
  const CONSTRUCCIONES = Object.freeze([
    // ── Edificios (capa volumétrica) ──────────────────────────────────────
    { id: 'pabellon',          nombre: 'Pabellón',           zh: '亭',   capa: 'edificio', footprint: [1, 2], tierMin: 1, unico: false, cargoMin: null,    color: '#9a6b3a', altura: 22, desc: 'Pabellón abierto para comensales y discípulos.' },
    { id: 'torre',             nombre: 'Torre de Guarda',    zh: '望楼', capa: 'edificio', footprint: [1, 2], tierMin: 1, unico: false, cargoMin: null,    color: '#6a4a28', altura: 40, desc: 'Torre de vigía en los muros de la hacienda.' },
    { id: 'pagoda',            nombre: 'Pagoda',             zh: '塔',   capa: 'edificio', footprint: [2, 2], tierMin: 1, unico: false, cargoMin: null,    color: '#b5482a', altura: 50, desc: 'Torre de varios aleros; hito vertical de la finca.' },
    { id: 'galeria',           nombre: 'Galería',            zh: '廊',   capa: 'edificio', footprint: [1, 3], tierMin: 1, unico: false, cargoMin: null,    color: '#7d6a3a', altura: 16, desc: 'Larga galería techada que une los pabellones.' },
    { id: 'armeria',           nombre: 'Armería',            zh: '武库', capa: 'edificio', footprint: [2, 2], tierMin: 2, unico: false, cargoMin: null,    color: '#5a5a6a', altura: 20, desc: 'Depósito de armas y equipamiento de la guarnición.' },
    { id: 'ala',               nombre: 'Ala Señorial',       zh: '偏殿', capa: 'edificio', footprint: [2, 3], tierMin: 2, unico: false, cargoMin: null,    color: '#a85a2e', altura: 28, desc: 'Salón lateral para consejeros y vasallos de peso.' },
    { id: 'templo',            nombre: 'Templo',             zh: '庙',   capa: 'edificio', footprint: [2, 3], tierMin: 2, unico: false, cargoMin: null,    color: '#8a5520', altura: 32, desc: 'Recinto sagrado para ceremonias y ofrendas.' },
    { id: 'gran-pagoda',       nombre: 'Gran Pagoda',        zh: '七塔', capa: 'edificio', footprint: [2, 4], tierMin: 2, unico: false, cargoMin: null,    color: '#a03020', altura: 80, desc: 'Pagoda de siete pisos; visible desde leguas a la redonda.' },
    { id: 'salon',             nombre: 'Salón Principal',    zh: '正殿', capa: 'edificio', footprint: [3, 3], tierMin: 2, unico: true,  cargoMin: 'pilar', color: '#c0532a', altura: 34, desc: 'Corazón de la casa; gran salón sede del Pilar.' },
    { id: 'templo-ancestral',  nombre: 'Salón de los Ancestros', zh: '祠堂', capa: 'edificio', footprint: [3, 4], tierMin: 3, unico: true,  cargoMin: null,    color: '#7a2a18', altura: 38, desc: 'El edificio más sagrado: culto a los espíritus de los antepasados.' },
    { id: 'salon-gran',        nombre: 'Gran Salón',         zh: '大殿', capa: 'edificio', footprint: [4, 3], tierMin: 3, unico: true,  cargoMin: null,    color: '#b83818', altura: 44, desc: 'Salón de audiencias propio de una gran casa señorial.' },
    { id: 'pabellon-gran',     nombre: 'Gran Pabellón',      zh: '大亭', capa: 'edificio', footprint: [3, 4], tierMin: 3, unico: false, cargoMin: null,    color: '#a85a2e', altura: 40, desc: 'Amplio pabellón de recreo para banquetes y reuniones.' },
    { id: 'salon-corte',       nombre: 'Salón de la Corte',  zh: '朝堂', capa: 'edificio', footprint: [3, 6], tierMin: 4, unico: true,  cargoMin: null,    color: '#bb3c1e', altura: 46, desc: 'Largo salón de audiencias donde se recibe a la corte.' },
    { id: 'palacio',           nombre: 'Palacio',            zh: '宮殿', capa: 'edificio', footprint: [4, 6], tierMin: 5, unico: true,  cargoMin: null,    color: '#c43c1a', altura: 60, desc: 'El gran salón palaciego: corazón ceremonial de la casa.' },
    { id: 'salon-largo',       nombre: 'Salón Alargado',     zh: '长殿', capa: 'edificio', footprint: [3, 5], tierMin: 3, unico: false, cargoMin: null,    color: '#bb3c1e', altura: 44, desc: 'Salón de planta alargada para audiencias numerosas.' },
    { id: 'salon-banquete',    nombre: 'Salón de Banquetes', zh: '宴殿', capa: 'edificio', footprint: [3, 7], tierMin: 4, unico: false, cargoMin: null,    color: '#b83a1c', altura: 48, desc: 'Largo salón donde la casa celebra sus grandes banquetes.' },
    { id: 'cuartel',           nombre: 'Cuartel',            zh: '营房', capa: 'edificio', footprint: [4, 5], tierMin: 3, unico: false, cargoMin: null,    color: '#6a6a5a', altura: 28, desc: 'Barracones de la guarnición: tropa, oficiales y pertrechos.' },
    { id: 'gran-palacio',      nombre: 'Gran Palacio',       zh: '大宮', capa: 'edificio', footprint: [4, 7], tierMin: 6, unico: true,  cargoMin: null,    color: '#c43c1a', altura: 70, desc: 'El palacio mayor: triple alero sobre el eje ceremonial de la casa.' },
    // ── Compuestos (huella en L, U o anillo · campo `mask`) ────────────────
    { id: 'ala-l',             nombre: 'Ala en Escuadra',    zh: '曲尺', capa: 'edificio', footprint: [3, 3], mask: [[0,0],[0,1],[0,2],[1,2],[2,2]], tierMin: 2, unico: false, cargoMin: null, color: '#a85a30', altura: 28, desc: 'Dos crujías en ángulo recto que cierran la esquina de un patio.' },
    { id: 'ala-l-mayor',       nombre: 'Ala en L Mayor',     zh: '大曲尺', capa: 'edificio', footprint: [4, 4], mask: [[0,0],[1,0],[0,1],[1,1],[0,2],[1,2],[2,2],[3,2],[0,3],[1,3],[2,3],[3,3]], tierMin: 3, unico: false, cargoMin: null, color: '#a85a2e', altura: 30, desc: 'Amplia ala en escuadra de doble crujía para flanquear un patio señorial.' },
    { id: 'patio-u',           nombre: 'Patio en U',         zh: '三合院', capa: 'edificio', footprint: [5, 3], mask: [[0,0],[1,0],[2,0],[3,0],[4,0],[0,1],[4,1],[0,2],[4,2]], tierMin: 3, unico: false, cargoMin: null, color: '#b34528', altura: 30, desc: 'Salón con dos alas laterales que abrazan un patio (三合院).' },
    { id: 'patio-o',           nombre: 'Patio Cerrado',      zh: '四合院', capa: 'edificio', footprint: [4, 4], mask: [[0,0],[1,0],[2,0],[3,0],[0,1],[3,1],[0,2],[3,2],[0,3],[1,3],[2,3],[3,3]], tierMin: 4, unico: false, cargoMin: null, color: '#b03c1c', altura: 30, desc: 'Recinto de cuatro crujías en torno a un patio central (四合院).' },
    // ── Rectángulos monumentales ──────────────────────────────────────────
    { id: 'salon-doble',       nombre: 'Salón Doble',        zh: '重殿', capa: 'edificio', footprint: [4, 8], tierMin: 5, unico: false, cargoMin: null, color: '#bb3c1e', altura: 48, desc: 'Doble salón corrido para las grandes audiencias de la casa.' },
    { id: 'gran-recinto',      nombre: 'Gran Recinto',       zh: '大院', capa: 'edificio', footprint: [5, 8], tierMin: 6, unico: true,  cargoMin: null, color: '#c43c1a', altura: 56, desc: 'Bloque palaciego monumental: la mayor construcción de la finca.' },
    { id: 'pabellon-te',       nombre: 'Pabellón de Té',     zh: '茶亭', capa: 'edificio', footprint: [1, 1], tierMin: 1, unico: false, cargoMin: null,    color: '#9a6b3a', altura: 26, desc: 'Quiosco abierto para el té, la lectura y la caligrafía.' },
    { id: 'yingbi',            nombre: 'Muro de los Espíritus', zh: '影壁', capa: 'edificio', footprint: [1, 3], tierMin: 2, unico: false, cargoMin: null, color: '#8a6a4a', altura: 20, desc: 'Pantalla ornamentada tras la puerta; da privacidad y detiene a los malos espíritus.' },
    { id: 'chuihuamen',        nombre: 'Puerta Floral',      zh: '垂花門', capa: 'edificio', footprint: [1, 2], tierMin: 3, unico: false, cargoMin: null, color: '#a85a2e', altura: 30, puerta: true, desc: 'Puerta interior tallada que separa el patio público del privado.' },
    { id: 'muralla',           nombre: 'Muro Interior',      zh: '院墙', capa: 'edificio', footprint: [1, 1], tierMin: 1, unico: false, cargoMin: null, color: '#8a8070', altura: 19, desc: 'Tramo de muro para dividir el recinto en patios a tu gusto (gira para orientarlo).' },
    { id: 'porton',            nombre: 'Portón',             zh: '院門', capa: 'edificio', footprint: [1, 1], tierMin: 1, unico: false, cargoMin: null, color: '#9c3c22', altura: 26, puerta: true, desc: 'Portón techado a juego con el Muro Interior; ábrele un paso entre patios (colócalo sobre un muro para sustituirlo).' },
    // ── Decoración (1×1) ──────────────────────────────────────────────────
    { id: 'farol',             nombre: 'Farol de Piedra',    zh: '石燈', capa: 'edificio', footprint: [1, 1], tierMin: 1, unico: false, cargoMin: null,    color: '#8a8478', altura: 16, desc: 'Linterna de piedra que ilumina los senderos de la finca.' },
    { id: 'antorcha',          nombre: 'Antorcha',           zh: '火炬', capa: 'edificio', footprint: [1, 1], tierMin: 1, unico: false, cargoMin: null,    color: '#5a3a22', altura: 24, desc: 'Pebetero en alto con llama viva para las noches.' },
    { id: 'brasero',           nombre: 'Brasero',            zh: '火盆', capa: 'edificio', footprint: [1, 1], tierMin: 1, unico: false, cargoMin: null,    color: '#7a5a3a', altura: 12, desc: 'Brasero de bronce con brasas que caldean el patio.' },
    { id: 'ding',              nombre: 'Caldero Ritual',     zh: '鼎',   capa: 'edificio', footprint: [1, 1], tierMin: 2, unico: false, cargoMin: null,    color: '#4a6a52', altura: 16, desc: 'Trípode ritual de bronce, símbolo de autoridad y linaje.' },
    { id: 'estandarte',        nombre: 'Estandarte',         zh: '旗',   capa: 'edificio', footprint: [1, 1], tierMin: 1, unico: false, cargoMin: null,    color: '#b83018', altura: 32, desc: 'Asta con el pendón de la casa ondeando al viento.' },
    // ── Jardines (capa de suelo, plana) ───────────────────────────────────
    { id: 'bonsai',            nombre: 'Jardín de Bonsáis',  zh: '盆景', capa: 'suelo',    footprint: [1, 1], tierMin: 1, unico: false, cargoMin: null,    color: '#5a7a3a', altura:  6, desc: 'Pequeño jardín de árboles enanos en macetas sobre un estrado.' },
    { id: 'jardin',            nombre: 'Jardín',             zh: '园',   capa: 'suelo',    footprint: [2, 3], tierMin: 1, unico: false, cargoMin: null,    color: '#4a7040', altura:  4, desc: 'Jardín de piedras, bambú y sendero de gravilla.' },
    { id: 'jardin-flores',     nombre: 'Jardín de Flores',   zh: '花苑', capa: 'suelo',    footprint: [2, 4], tierMin: 2, unico: false, cargoMin: null,    color: '#7a4a60', altura:  4, desc: 'Macizos de ciruelo, peonías y begonias.' },
    { id: 'estanque',          nombre: 'Estanque de Loto',   zh: '荷池', capa: 'suelo',    footprint: [3, 3], tierMin: 2, unico: false, cargoMin: null,    color: '#2a6070', altura:  2, desc: 'Estanque con flores de loto y carpas doradas.' },
    { id: 'lago',              nombre: 'Jardín del Lago',    zh: '湖苑', capa: 'suelo',    footprint: [4, 4], tierMin: 3, unico: false, cargoMin: null,    color: '#1a4a6a', altura:  2, desc: 'Gran lago de palacio con puente en zigzag y pabellón sobre el agua.' },
    // ── Caminos (suelo pavimentado autoconectado · se traza de inicio a fin) ──
    { id: 'camino',            nombre: 'Camino',             zh: '路',   capa: 'suelo',    footprint: [1, 1], tierMin: 1, unico: false, cargoMin: null,    color: '#cdc2a6', altura:  1, linea: true, desc: 'Sendero enlosado que une patios y pabellones. Traza el inicio y el final como una muralla.' }
  ].map(Object.freeze));

  const byId = {};
  CONSTRUCCIONES.forEach(t => { byId[t.id] = t; });

  const clampTier = (t) => Math.max(1, Math.min(MAX_TIER, Number(t) || 1));
  const tipo = (id) => byId[id] || null;
  // ¿La construcción es de capa SUELO (plana)? Si no se declara `capa`, se asume
  // 'edificio' (volumétrico). El render usa esto para pintar el suelo por debajo.
  const esSuelo = (id) => { const t = byId[id]; return !!t && t.capa === 'suelo'; };
  // ¿Se construye con la herramienta de LÍNEA (dos clics: inicio→fin)? Murallas,
  // portones (sobre muro) y caminos. Lo declara el catálogo con `linea:true`.
  const _lineaIds = new Set(['muralla', 'camino']);
  const esLinea = (id) => { const t = byId[id]; return _lineaIds.has(id) || !!(t && t.linea); };
  // ── Categorías para AGRUPAR el selector del admin ─────────────────────────
  // En orden de aparición. La categoría se DERIVA de capa/puerta/tipo, así que
  // toda construcción nueva cae sola en su grupo (suelos, muros, decoración…).
  const CATEGORIAS = Object.freeze([
    { key: 'jardin',     label: 'Suelos y jardines' },
    { key: 'muro',       label: 'Muros y puertas' },
    { key: 'edificio',   label: 'Edificios' },
    { key: 'decoracion', label: 'Decoración' }
  ]);
  const _murosIds = new Set(['muralla', 'porton', 'chuihuamen', 'yingbi']);
  const _decorIds = new Set(['farol', 'antorcha', 'brasero', 'ding', 'estandarte']);
  const categoriaDe = (id) => {
    const t = byId[id]; if (!t) return 'edificio';
    if (t.capa === 'suelo') return 'jardin';
    if (_murosIds.has(id) || t.puerta) return 'muro';
    if (_decorIds.has(id)) return 'decoracion';
    return 'edificio';
  };

  // ── Tareas de los edificios ─────────────────────────────────────────────
  // Una TAREA por tipo de edificio: la actividad que un mecenas "va a hacer"
  // cuando entra (los muros, puertas, suelos y decoración NO tienen tarea).
  // De momento es FLAVOR puramente VISUAL (no da puntos); cuando se añada la
  // gamificación de misiones, esto migrará a una tabla en Supabase.
  //   verbo → gerundio para la línea de actividad ("Entrenando").
  //   lugar → nombre con artículo en minúscula ("el cuartel"), para componer
  //           "de camino al cuartel" / "Entrenando en el cuartel".
  const TAREAS = Object.freeze({
    pabellon:           { verbo: 'Departiendo',             lugar: 'el pabellón' },
    torre:              { verbo: 'Vigilando',               lugar: 'la torre de guarda' },
    pagoda:             { verbo: 'Contemplando las vistas', lugar: 'la pagoda' },
    galeria:            { verbo: 'Conversando',             lugar: 'la galería' },
    armeria:            { verbo: 'Revisando el armamento',  lugar: 'la armería' },
    ala:                { verbo: 'Deliberando',             lugar: 'el ala señorial' },
    templo:             { verbo: 'Orando',                  lugar: 'el templo' },
    'gran-pagoda':      { verbo: 'Contemplando las vistas', lugar: 'la gran pagoda' },
    salon:              { verbo: 'Presidiendo audiencia',   lugar: 'el salón principal' },
    'templo-ancestral': { verbo: 'Honrando a los ancestros',lugar: 'el salón de los ancestros' },
    'salon-gran':       { verbo: 'En audiencia',            lugar: 'el gran salón' },
    'pabellon-gran':    { verbo: 'En el banquete',          lugar: 'el gran pabellón' },
    'salon-corte':      { verbo: 'En audiencia de corte',   lugar: 'el salón de la corte' },
    palacio:            { verbo: 'En ceremonia',            lugar: 'el palacio' },
    'salon-largo':      { verbo: 'En audiencia',            lugar: 'el salón alargado' },
    'salon-banquete':   { verbo: 'En el banquete',          lugar: 'el salón de banquetes' },
    cuartel:            { verbo: 'Entrenando',              lugar: 'el cuartel' },
    'gran-palacio':     { verbo: 'En ceremonia',            lugar: 'el gran palacio' },
    'ala-l':            { verbo: 'Deliberando',             lugar: 'el ala en escuadra' },
    'ala-l-mayor':      { verbo: 'Deliberando',             lugar: 'el ala en L' },
    'patio-u':          { verbo: 'Descansando',             lugar: 'el patio' },
    'patio-o':          { verbo: 'Descansando',             lugar: 'el patio' },
    'salon-doble':      { verbo: 'En audiencia',            lugar: 'el salón doble' },
    'gran-recinto':     { verbo: 'En ceremonia',            lugar: 'el gran recinto' },
    'pabellon-te':      { verbo: 'Tomando el té',           lugar: 'el pabellón de té' }
  });
  // Tarea de un tipo de edificio | null si no es un edificio "visitable".
  // Fallback genérico para edificios nuevos sin entrada explícita. (El catálogo
  // TAREAS es la SEMILLA; las tareas vivas se administran en BD vía HacTareas.)
  const tareaDe = (id) => {
    if (categoriaDe(id) !== 'edificio') return null;
    return TAREAS[id] || { verbo: 'Atendiendo sus asuntos', lugar: 'el ' + ((byId[id] && byId[id].nombre || 'edificio').toLowerCase()) };
  };
  // "Lugar" articulado de un edificio para la línea de actividad ("el cuartel"):
  // se queda SIEMPRE en cliente (deriva del nombre); solo el verbo/duración de
  // cada tarea viven en BD. null si el tipo no es un edificio.
  const lugarDe = (id) => {
    if (categoriaDe(id) !== 'edificio') return null;
    return (TAREAS[id] && TAREAS[id].lugar) || ('el ' + ((byId[id] && byId[id].nombre || 'edificio').toLowerCase()));
  };

  // Dimensiones [ancho, alto] de la rejilla de un nivel: del campo `grid` de
  // HAC_TIERS, que puede ser [w,h] (rectangular) o un número (cuadrado); si
  // falta, fallback cuadrado 2+nivel. Las haciendas son ALARGADAS (h>w).
  const gridDims = (tier) => {
    const n = clampTier(tier);
    const t = tiersData().find(x => (Number(x.nivel) || 1) === n);
    const g = t && t.grid;
    if (Array.isArray(g) && g.length === 2) return [Number(g[0]) || (2 + n), Number(g[1]) || (2 + n)];
    if (Number(g)) return [Number(g), Number(g)];
    return [2 + n, 2 + n];
  };
  const slotsDesbloqueados = (tier) => { const [w, h] = gridDims(tier); return w * h; };

  // Footprint EFECTIVO de una construcción según su rotación. Las rotaciones
  // impares (90°/270°) intercambian ancho y alto; las pares lo dejan igual.
  // (El giro completo 0..3 se usará para orientar el sprite en Fase 3.)
  function footprintDe(c) {
    const t = tipo(c && c.tipo);
    const base = t ? t.footprint : [1, 1];
    return (((c && c.rot) || 0) % 2) ? [base[1], base[0]] : [base[0], base[1]];
  }

  // Rota una celda (dx,dy) DENTRO de la caja base [w,h] según rot (0..3, ×90° en
  // sentido horario). Las rotaciones impares devuelven coords en una caja [h,w].
  // La usan tanto celdasOcupadas (lógica) como el generador de sprites (arte): si
  // ambos rotan igual, el sprite cae exactamente sobre las celdas que ocupa.
  function rotaCelda(dx, dy, w, h, rot) {
    rot = ((rot % 4) + 4) % 4;
    if (rot === 1) return [h - 1 - dy, dx];
    if (rot === 2) return [w - 1 - dx, h - 1 - dy];
    if (rot === 3) return [dy, w - 1 - dx];
    return [dx, dy];
  }

  // Celdas que ocupa una construcción dado su footprint (rotado) y su pos ancla.
  // Si el tipo declara una `mask` (huella NO rectangular: L, U, anillo…), se usan
  // esas celdas relativas rotadas; si no, se rellena la caja rectangular entera.
  function celdasOcupadas(c) {
    const t = tipo(c && c.tipo);
    const base = t ? t.footprint : [1, 1];
    const gx = (c && c.pos && Number(c.pos[0])) || 0;
    const gy = (c && c.pos && Number(c.pos[1])) || 0;
    const rot = (c && c.rot) || 0;
    const out = [];
    if (t && Array.isArray(t.mask)) {
      t.mask.forEach(m => { const r = rotaCelda(m[0], m[1], base[0], base[1], rot); out.push([gx + r[0], gy + r[1]]); });
      return out;
    }
    const fp = footprintDe(c);
    for (let dx = 0; dx < fp[0]; dx++)
      for (let dy = 0; dy < fp[1]; dy++) out.push([gx + dx, gy + dy]);
    return out;
  }

  function dentroDeRejilla(c, tier) {
    const [w, h] = gridDims(tier);
    return celdasOcupadas(c).every(([x, y]) => x >= 0 && y >= 0 && x < w && y < h);
  }

  // ¿Las celdas de `c` chocan con las de alguna construcción de `lista`?
  // (Compara por conjunto de celdas; ignora una entrada con la MISMA pos que c,
  // para poder validar reemplazos en el mismo sitio.)
  function colisiona(c, lista) {
    const mias = new Set(celdasOcupadas(c).map(p => p[0] + ',' + p[1]));
    return (lista || []).some(o => {
      if (o === c) return false;
      if (o.pos && c.pos && o.pos[0] === c.pos[0] && o.pos[1] === c.pos[1]) return false;
      return celdasOcupadas(o).some(p => mias.has(p[0] + ',' + p[1]));
    });
  }

  function construccionEn(lista, gx, gy) {
    return (lista || []).find(o =>
      celdasOcupadas(o).some(p => p[0] === gx && p[1] === gy)) || null;
  }

  // ── Pabellones (patios temáticos cerrados por murallas interiores) ────────
  // Geometría + catálogo de roles. La PERSISTENCIA es una tabla aparte
  // (1 hacienda ↔ N pabellones); aquí solo lógica pura.
  const ROLES_PABELLON = Object.freeze([
    { id: 'administrativo', nombre: 'Administrativo', zh: '政', color: '#3a6ea5', desc: 'Intendencia, registros y gobierno de la casa.' },
    { id: 'militar',        nombre: 'Militar',        zh: '军', color: '#b23b2e', desc: 'Cuartel, adiestramiento y guarnición.' },
    { id: 'cultural',       nombre: 'Cultural',       zh: '文', color: '#3a8a5a', desc: 'Estudio, caligrafía, música, poesía y arte.' }
  ].map(Object.freeze));
  const rolPabellon = (id) => ROLES_PABELLON.find(r => r.id === id) || null;
  // Nº máximo de pabellones por nivel (contenido: pocos y relevantes).
  const PAB_POR_TIER = [1, 1, 2, 2, 3, 3];
  const maxPabellones = (tier) => PAB_POR_TIER[clampTier(tier) - 1] || 1;
  const MIN_PABELLON = 6;       // celdas mínimas para poder bautizar un patio

  // Celdas ocupadas por MUROS interiores (muralla + portón): frontera del patio.
  function murosInternosSet(mapa) {
    const s = new Set();
    const lista = (mapa && Array.isArray(mapa.construcciones)) ? mapa.construcciones : [];
    lista.forEach(c => { if ((c.tipo === 'muralla' || c.tipo === 'porton') && Array.isArray(c.pos)) s.add(c.pos[0] + ',' + c.pos[1]); });
    return s;
  }
  // Región CERRADA que contiene (sx,sy): inunda en 4 direcciones sin cruzar muros
  // interiores ni el borde de la rejilla. Los edificios SÍ son interior del patio.
  // Devuelve [[gx,gy],…] (vacío si la semilla cae sobre un muro o fuera).
  function regionPabellon(mapa, tier, sx, sy) {
    const dims = gridDims(tier), GW = dims[0], GH = dims[1];
    sx = Math.floor(sx); sy = Math.floor(sy);
    if (sx < 0 || sy < 0 || sx >= GW || sy >= GH) return [];
    const muros = murosInternosSet(mapa);
    if (muros.has(sx + ',' + sy)) return [];
    const seen = new Set([sx + ',' + sy]), out = [[sx, sy]], stack = [[sx, sy]];
    while (stack.length) {
      const cur = stack.pop(), x = cur[0], y = cur[1];
      const vec = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
      for (let i = 0; i < 4; i++) {
        const nx = vec[i][0], ny = vec[i][1];
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const k = nx + ',' + ny;
        if (seen.has(k) || muros.has(k)) continue;
        seen.add(k); out.push([nx, ny]); stack.push([nx, ny]);
      }
    }
    return out;
  }
  // ¿La región vale como pabellón? Tamaño mínimo, no es toda la finca y está
  // realmente delimitada por al menos un muro interior contiguo.
  function regionValidaPabellon(mapa, tier, cells) {
    if (!cells || cells.length < MIN_PABELLON) return false;
    const dims = gridDims(tier), GW = dims[0], GH = dims[1];
    if (cells.length >= GW * GH) return false;
    const muros = murosInternosSet(mapa);
    if (!muros.size) return false;
    // El "sobrante" exterior toca los 4 bordes de la rejilla → no es un patio.
    let bL = false, bR = false, bT = false, bB = false, tocaMuro = false;
    for (let i = 0; i < cells.length; i++) {
      const x = cells[i][0], y = cells[i][1];
      if (x === 0) bL = true; if (x === GW - 1) bR = true;
      if (y === 0) bT = true; if (y === GH - 1) bB = true;
      if (!tocaMuro && (muros.has((x + 1) + ',' + y) || muros.has((x - 1) + ',' + y) || muros.has(x + ',' + (y + 1)) || muros.has(x + ',' + (y - 1)))) tocaMuro = true;
    }
    if (bL && bR && bT && bB) return false;
    return tocaMuro;
  }

  // Patios al estilo 府第: una REJILLA de patios ~cuadrados. A lo largo del eje
  // (进, filas) y, en complejos grandes, ejes laterales (跨院, columnas). Los
  // muros separan los patios: `hdiv` = filas-muro (transversales), `vdiv` =
  // columnas-muro (longitudinales). La Puerta Floral va en el EJE CENTRAL; los
  // muros longitudinales llevan pasos laterales en el centro de cada banda.
  // Cada celda de muro queda reservada (no se construye en ella). Fuente única
  // para render y validación. Patio objetivo ≈ 14 celdas.
  function patios(tier) {
    const [GW, GH] = gridDims(tier);
    const axisGx = Math.floor((GW - 1) / 2);              // eje ceremonial (sur→norte, a lo largo de gy)
    const hasSpine = GW >= 22;
    let spineL = 0, spineR = GW, vdiv = [];
    if (hasSpine) {                                       // eje central ancho flanqueado por alas laterales
      const spineW = Math.max(10, Math.round(GW * 0.36));
      spineL = Math.round((GW - spineW) / 2); spineR = spineL + spineW; vdiv = [spineL, spineR];
    }
    // Divisiones MAYORES (cruzan TODO): pocas → patios ceremoniales LARGOS en el eje.
    const majN = Math.max(1, Math.min(3, Math.round(GH / 22)));
    const hdivMajor = [];
    for (let k = 1; k < majN; k++) hdivMajor.push(Math.round(GH * k / majN));
    // Subdivisiones LATERALES (solo en las alas): patios residenciales pequeños.
    let hdivSide = [];
    if (hasSpine) {
      const sideN = Math.max(1, Math.min(5, Math.round(GH / 12)));
      for (let k = 1; k < sideN; k++) { const y = Math.round(GH * k / sideN); if (hdivMajor.every(m => Math.abs(m - y) >= 2)) hdivSide.push(y); }
    }
    // Centros de banda en el eje (para los pasos laterales hacia las alas).
    const ejes = [0].concat(hdivMajor, [GH]).sort((a, b) => a - b);
    const bandasY = [];
    for (let i = 0; i < ejes.length - 1; i++) bandasY.push(Math.round((ejes[i] + ejes[i + 1]) / 2));
    return { GW, GH, axisGx, spineL, spineR, vdiv, hdivMajor, hdivSide, bandasY, hasSpine, divisores: hdivMajor };
  }
  // ¿La celda (gx,gy) la ocupa un muro de patio? (vdiv en todo; hdivMajor en
  // todo; hdivSide solo en las alas laterales.)
  function enMuro(gx, gy, tier) {
    const pt = patios(tier);
    return pt.vdiv.indexOf(gx) >= 0 || pt.hdivMajor.indexOf(gy) >= 0 ||
      (pt.hdivSide.indexOf(gy) >= 0 && (gx < pt.spineL || gx >= pt.spineR));
  }

  // Valida una colocación. Devuelve {ok:true} o {ok:false, motivo:'…'}.
  function puedeColocar(c, tier, lista) {
    const t = tipo(c && c.tipo);
    if (!t) return { ok: false, motivo: 'Tipo de edificio desconocido.' };
    if (clampTier(tier) < t.tierMin) return { ok: false, motivo: `Requiere nivel ${t.tierMin} de hacienda.` };
    if (!dentroDeRejilla(c, tier)) return { ok: false, motivo: 'No cabe dentro de la rejilla.' };
    if (t.unico && (lista || []).some(o => o.tipo === t.id && !(o.pos && c.pos && o.pos[0] === c.pos[0] && o.pos[1] === c.pos[1])))
      return { ok: false, motivo: `Ya existe un ${t.nombre} en esta hacienda.` };
    if (colisiona(c, lista)) return { ok: false, motivo: 'Se solapa con otro edificio.' };
    return { ok: true };
  }

  // Construcciones que se deben PINTAR en el tier actual (tipo válido y dentro
  // de la rejilla). Las que quedaron fuera al bajar de nivel se omiten, pero NO
  // se borran del `mapa`.
  function construccionesValidas(mapa, tier) {
    const lista = (mapa && Array.isArray(mapa.construcciones)) ? mapa.construcciones : [];
    return lista.filter(c => tipo(c.tipo) && dentroDeRejilla(c, tier));
  }

  // Sanea un `mapa` venido de fuera (BD, semilla) al shape canónico.
  function normalizaMapa(mapa) {
    const lista = (mapa && Array.isArray(mapa.construcciones)) ? mapa.construcciones : [];
    const construcciones = lista.reduce((acc, c) => {
      if (!c || !tipo(c.tipo) || !Array.isArray(c.pos)) return acc;
      const gx = Math.max(0, Math.floor(Number(c.pos[0]) || 0));
      const gy = Math.max(0, Math.floor(Number(c.pos[1]) || 0));
      acc.push({
        pos: [gx, gy],
        tipo: c.tipo,
        rot: ((Math.floor(Number(c.rot) || 0)) % 4 + 4) % 4,
        dueno: (c.dueno == null || c.dueno === '') ? null : String(c.dueno),
        nivel: Math.max(1, Math.floor(Number(c.nivel) || 1))
      });
      return acc;
    }, []);
    const out = { v: 1, construcciones };
    // Nivel ALCANZADO de la finca (trinquete): la rejilla no encoge aunque
    // bajen los puntos. Se conserva si viene en el mapa.
    if (mapa && mapa.tier != null) out.tier = clampTier(mapa.tier);
    // Estación del territorio exterior (primavera/verano/otono/invierno). Se
    // guarda en el mapa (jsonb) para no requerir migración de la tabla.
    const EST = { primavera: 1, verano: 1, otono: 1, invierno: 1 };
    if (mapa && EST[String(mapa.estacion || '').toLowerCase().replace('ñ', 'n')]) out.estacion = String(mapa.estacion).toLowerCase().replace('ñ', 'n');
    return out;
  }

  return {
    CONSTRUCCIONES, tipo, esSuelo, esLinea, CATEGORIAS, categoriaDe, TAREAS, tareaDe, lugarDe, gridDims, slotsDesbloqueados, footprintDe, celdasOcupadas,
    dentroDeRejilla, colisiona, construccionEn, puedeColocar, patios, enMuro,
    construccionesValidas, normalizaMapa, MAX_TIER,
    ROLES_PABELLON, rolPabellon, maxPabellones, MIN_PABELLON, regionPabellon, regionValidaPabellon
  };
})();

if (typeof window !== 'undefined') window.HacBuild = HacBuild;
if (typeof module !== 'undefined' && module.exports) module.exports = HacBuild;
