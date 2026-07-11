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
    { id: 'pabellon', dominio: 'cultural',          nombre: 'Pabellón',           zh: '亭',   capa: 'edificio', footprint: [1, 2], tierMin: 1, unico: false, cargoMin: null,    color: '#9a6b3a', altura: 22, desc: 'Pabellón abierto para comensales y discípulos.' },
    { id: 'torre', dominio: 'militar',             nombre: 'Torre de Guarda',    zh: '望楼', capa: 'edificio', footprint: [1, 2], tierMin: 1, unico: false, cargoMin: null,    color: '#6a4a28', altura: 40, desc: 'Torre de vigía en los muros de la hacienda.' },
    { id: 'pagoda', dominio: 'cultural',            nombre: 'Pagoda',             zh: '塔',   capa: 'edificio', footprint: [2, 2], tierMin: 1, unico: false, cargoMin: null,    color: '#b5482a', altura: 50, desc: 'Torre de varios aleros; hito vertical de la finca.' },
    { id: 'galeria', dominio: 'cultural',           nombre: 'Galería',            zh: '廊',   capa: 'edificio', footprint: [1, 3], tierMin: 1, unico: false, cargoMin: null,    color: '#7d6a3a', altura: 16, desc: 'Larga galería techada que une los pabellones.' },
    { id: 'armeria', dominio: 'militar',           nombre: 'Armería',            zh: '武库', capa: 'edificio', footprint: [2, 2], tierMin: 2, unico: false, cargoMin: null,    color: '#5a5a6a', altura: 20, desc: 'Depósito de armas y equipamiento de la guarnición.' },
    { id: 'ala', dominio: 'administrativo',               nombre: 'Ala Señorial',       zh: '偏殿', capa: 'edificio', footprint: [2, 3], tierMin: 2, unico: false, cargoMin: null,    color: '#a85a2e', altura: 28, desc: 'Salón lateral para consejeros y vasallos de peso.' },
    { id: 'templo', dominio: 'cultural',            nombre: 'Templo',             zh: '庙',   capa: 'edificio', footprint: [2, 3], tierMin: 2, unico: false, cargoMin: null,    color: '#8a5520', altura: 32, desc: 'Recinto sagrado para ceremonias y ofrendas.' },
    { id: 'gran-pagoda', dominio: 'cultural',       nombre: 'Gran Pagoda',        zh: '七塔', capa: 'edificio', footprint: [2, 4], tierMin: 2, unico: false, cargoMin: null,    color: '#a03020', altura: 80, desc: 'Pagoda de siete pisos; visible desde leguas a la redonda.' },
    { id: 'salon', dominio: 'administrativo',             nombre: 'Salón Principal',    zh: '正殿', capa: 'edificio', footprint: [3, 4], tierMin: 2, unico: true,  cargoMin: 'pilar', color: '#c0532a', altura: 34, principal: true, rango: 1, desc: 'Corazón de la casa; gran salón sede del Pilar. Edificio PRINCIPAL: junto a él se atienden las misiones de la hacienda.' },
    { id: 'templo-ancestral', dominio: 'cultural',  nombre: 'Salón de los Ancestros', zh: '祠堂', capa: 'edificio', footprint: [3, 4], tierMin: 3, unico: true,  cargoMin: null,    color: '#7a2a18', altura: 38, desc: 'El edificio más sagrado: culto a los espíritus de los antepasados.' },
    { id: 'salon-gran', dominio: 'administrativo',        nombre: 'Gran Salón',         zh: '大殿', capa: 'edificio', footprint: [4, 3], tierMin: 3, unico: true,  cargoMin: null,    color: '#b83818', altura: 44, principal: true, rango: 2, desc: 'Salón de audiencias propio de una gran casa señorial. Edificio PRINCIPAL (mejora del 正殿).' },
    { id: 'pabellon-gran', dominio: 'cultural',     nombre: 'Gran Pabellón',      zh: '大亭', capa: 'edificio', footprint: [3, 4], tierMin: 3, unico: false, cargoMin: null,    color: '#a85a2e', altura: 40, desc: 'Amplio pabellón de recreo para banquetes y reuniones.' },
    { id: 'salon-corte', dominio: 'administrativo',       nombre: 'Salón de la Corte',  zh: '朝堂', capa: 'edificio', footprint: [3, 6], tierMin: 4, unico: true,  cargoMin: null,    color: '#bb3c1e', altura: 46, principal: true, rango: 3, desc: 'Largo salón de audiencias donde se recibe a la corte. Edificio PRINCIPAL (mejora del 大殿).' },
    { id: 'palacio', dominio: 'administrativo',           nombre: 'Palacio',            zh: '宮殿', capa: 'edificio', footprint: [4, 6], tierMin: 5, unico: true,  cargoMin: null,    color: '#c43c1a', altura: 60, principal: true, rango: 4, desc: 'El gran salón palaciego: corazón ceremonial de la casa. Edificio PRINCIPAL (mejora del 朝堂).' },
    { id: 'salon-largo', dominio: 'administrativo',       nombre: 'Salón Alargado',     zh: '长殿', capa: 'edificio', footprint: [3, 5], tierMin: 3, unico: false, cargoMin: null,    color: '#bb3c1e', altura: 44, desc: 'Salón de planta alargada para audiencias numerosas.' },
    { id: 'salon-banquete', dominio: 'administrativo',    nombre: 'Salón de Banquetes', zh: '宴殿', capa: 'edificio', footprint: [3, 7], tierMin: 4, unico: false, cargoMin: null,    color: '#b83a1c', altura: 48, desc: 'Largo salón donde la casa celebra sus grandes banquetes.' },
    { id: 'cuartel', dominio: 'militar',           nombre: 'Cuartel',            zh: '营房', capa: 'edificio', footprint: [4, 5], tierMin: 3, unico: false, cargoMin: null,    color: '#6a6a5a', altura: 28, desc: 'Barracones de la guarnición: tropa, oficiales y pertrechos.' },
    // ── Edificios de CLASE: sus tareas SOLO las puede hacer quien DOMINA el dominio (restringido) ──
    { id: 'instruccion', dominio: 'militar',        nombre: 'Campo de Instrucción', zh: '校場', capa: 'edificio', footprint: [3, 3], tierMin: 2, unico: false, cargoMin: null, color: '#4a4a52', altura: 33, restringido: true, desc: 'Patio de armas donde se adiestra a la tropa. Solo los de aptitud militar (军) pueden entrenar aquí.' },
    { id: 'academia', dominio: 'cultural',          nombre: 'Academia',           zh: '太學', capa: 'edificio', footprint: [3, 3], tierMin: 2, unico: false, cargoMin: null, color: '#3a7a4a', altura: 38, restringido: true, desc: 'Aulas de estudio, caligrafía y clásicos. Solo los de aptitud cultural (文) pueden estudiar aquí.' },
    { id: 'cancilleria', dominio: 'administrativo', nombre: 'Cancillería',        zh: '官署', capa: 'edificio', footprint: [3, 3], tierMin: 2, unico: false, cargoMin: null, color: '#2f5a86', altura: 34, restringido: true, desc: 'Despacho de registros y gobierno de la casa. Solo los de aptitud administrativa (政) pueden despachar aquí.' },
    { id: 'campamento', dominio: 'militar',        nombre: 'Campamento Militar', zh: '军营', capa: 'edificio', footprint: [8, 10], tierMin: 3, unico: false, cargoMin: null, color: '#7a6a4a', altura: 46, exterior: true, desc: 'Campamento de tropas: tiendas, empalizada, hoguera y caballerizas. Solo en terreno exterior.' },
    { id: 'mercado', dominio: 'administrativo',    nombre: 'Mercado',            zh: '市',   capa: 'edificio', footprint: [2, 2], tierMin: 2, unico: false, cargoMin: null, funcional: true, color: '#b8863a', altura: 26, desc: 'Puesto de mercado con su mercader: DESBLOQUEA la tienda, donde los mecenas gastan el dinero ganado en misiones (artículos por tiers).' },
    { id: 'tablon',  dominio: 'administrativo',    nombre: 'Tablón de Anuncios', zh: '告示牌', capa: 'edificio', footprint: [1, 1], tierMin: 1, unico: false, cargoMin: null, funcional: true, color: '#9a7a4a', altura: 30, desc: 'Tablón techado donde se pregonan los encargos: DESBLOQUEA las misiones de la hacienda. Los mecenas acuden aquí a buscar trabajo.' },
    { id: 'casa',    dominio: null,                nombre: 'Casa de Mecenas',    zh: '宅',   capa: 'edificio', footprint: [2, 2], tierMin: 1, unico: false, cargoMin: null, color: '#9a7a4a', altura: 24, desc: 'Vivienda de un mecenas. Asígnasela (dueño) y podrá guardar a salvo en casa el dinero que gana.' },
    { id: 'gran-palacio', dominio: 'administrativo',      nombre: 'Gran Palacio',       zh: '大宮', capa: 'edificio', footprint: [4, 7], tierMin: 6, unico: true,  cargoMin: null,    color: '#c43c1a', altura: 70, desc: 'El palacio mayor: triple alero sobre el eje ceremonial de la casa.' },
    // ── Compuestos (huella en L, U o anillo · campo `mask`) ────────────────
    { id: 'ala-l', dominio: 'administrativo',             nombre: 'Ala en Escuadra',    zh: '曲尺', capa: 'edificio', footprint: [3, 3], mask: [[0,0],[0,1],[0,2],[1,2],[2,2]], tierMin: 2, unico: false, cargoMin: null, color: '#a85a30', altura: 28, desc: 'Dos crujías en ángulo recto que cierran la esquina de un patio.' },
    { id: 'ala-l-mayor', dominio: 'administrativo',       nombre: 'Ala en L Mayor',     zh: '大曲尺', capa: 'edificio', footprint: [4, 4], mask: [[0,0],[1,0],[0,1],[1,1],[0,2],[1,2],[2,2],[3,2],[0,3],[1,3],[2,3],[3,3]], tierMin: 3, unico: false, cargoMin: null, color: '#a85a2e', altura: 30, desc: 'Amplia ala en escuadra de doble crujía para flanquear un patio señorial.' },
    { id: 'patio-u', dominio: 'administrativo',           nombre: 'Patio en U',         zh: '三合院', capa: 'edificio', footprint: [5, 3], mask: [[0,0],[1,0],[2,0],[3,0],[4,0],[0,1],[4,1],[0,2],[4,2]], tierMin: 3, unico: false, cargoMin: null, color: '#b34528', altura: 30, desc: 'Salón con dos alas laterales que abrazan un patio (三合院).' },
    { id: 'patio-o', dominio: 'administrativo',           nombre: 'Patio Cerrado',      zh: '四合院', capa: 'edificio', footprint: [4, 4], mask: [[0,0],[1,0],[2,0],[3,0],[0,1],[3,1],[0,2],[3,2],[0,3],[1,3],[2,3],[3,3]], tierMin: 4, unico: false, cargoMin: null, color: '#b03c1c', altura: 30, desc: 'Recinto de cuatro crujías en torno a un patio central (四合院).' },
    // ── Rectángulos monumentales ──────────────────────────────────────────
    { id: 'salon-doble', dominio: 'administrativo',       nombre: 'Salón Doble',        zh: '重殿', capa: 'edificio', footprint: [4, 8], tierMin: 5, unico: false, cargoMin: null, color: '#bb3c1e', altura: 48, desc: 'Doble salón corrido para las grandes audiencias de la casa.' },
    { id: 'gran-recinto', dominio: 'administrativo',      nombre: 'Gran Recinto',       zh: '大院', capa: 'edificio', footprint: [5, 8], tierMin: 6, unico: true,  cargoMin: null, color: '#c43c1a', altura: 56, principal: true, rango: 5, desc: 'Bloque palaciego monumental: la mayor construcción de la finca. Edificio PRINCIPAL (cima de la escalera).' },
    { id: 'pabellon-te', dominio: 'cultural',       nombre: 'Pabellón de Té',     zh: '茶亭', capa: 'edificio', footprint: [1, 1], tierMin: 1, unico: false, cargoMin: null,    color: '#9a6b3a', altura: 26, desc: 'Quiosco abierto para el té, la lectura y la caligrafía.' },
    // ── Monumentos imperiales (variedad para las grandes haciendas de reino) ──
    // Sin sprite procedural: se muestran como bloque placeholder salvo que la
    // hacienda use un TEMA con arte a mano (p.ej. 'wei'). Ver iso-sprites-wei.js.
    { id: 'puerta-imperial', dominio: 'administrativo', nombre: 'Puerta Imperial',   zh: '午門', capa: 'edificio', footprint: [4, 4], tierMin: 4, unico: false, cargoMin: null, color: '#b23b2e', altura: 56, desc: 'Torre-puerta monumental sobre base de piedra: el acceso ceremonial de la muralla exterior de una gran capital.' },
    { id: 'que',             dominio: null,             nombre: 'Torre Que',         zh: '闕',   capa: 'edificio', footprint: [1, 2], tierMin: 4, unico: false, cargoMin: null, color: '#a03828', altura: 46, desc: 'Torre-pilar ceremonial que se alza en pareja flanqueando la entrada del palacio.' },
    { id: 'salon-trono',     dominio: 'administrativo', nombre: 'Salón del Trono',   zh: '太極殿', capa: 'edificio', footprint: [12, 9], tierMin: 5, unico: true,  cargoMin: null, color: '#c43c1a', altura: 88, desc: 'El gran salón del trono imperial: la construcción más imponente del eje.' },
    { id: 'torre-esquina',   dominio: 'militar',        nombre: 'Torre de Esquina',  zh: '角樓', capa: 'edificio', footprint: [2, 2], tierMin: 3, unico: false, cargoMin: null, color: '#7a5a3a', altura: 48, desc: 'Torreón de varios aleros que corona las esquinas de la muralla imperial.' },
    { id: 'muralla-luoyang', dominio: 'militar',        nombre: 'Muralla de Luoyang',zh: '洛陽城牆', capa: 'edificio', footprint: [8, 2], tierMin: 4, unico: false, cargoMin: null, color: '#8a8070', altura: 44, desc: 'Tramo recto de la gran muralla imperial de Luoyang: sillería maciza con adarve transitable y balaustrada. Concaténalos para cerrar el recinto.' },
    { id: 'puerta-luoyang',  dominio: 'administrativo', nombre: 'Portón de Luoyang',  zh: '洛陽門', capa: 'edificio', footprint: [6, 4], tierMin: 4, unico: false, cargoMin: null, color: '#8a8070', altura: 72, desc: 'Torre-puerta monumental de la muralla de Luoyang, sobre base de sillería. Gira para mostrar el frente ceremonial (placa, leones y estandartes) o la cara lisa.' },
    { id: 'pabellon-agua',   dominio: 'cultural',       nombre: 'Pabellón sobre el Agua', zh: '水榭', capa: 'edificio', footprint: [2, 2], tierMin: 3, unico: false, cargoMin: null, color: '#3a6a70', altura: 24, desc: 'Pabellón de recreo que se asoma sobre el estanque para contemplar el agua.' },
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
    instruccion:        { verbo: 'Adiestrándose',          lugar: 'el campo de instrucción' },
    academia:           { verbo: 'Estudiando los clásicos',lugar: 'la academia' },
    cancilleria:        { verbo: 'Despachando asuntos',    lugar: 'la cancillería' },
    mercado:            { verbo: 'Comerciando',            lugar: 'el mercado' },
    tablon:             { verbo: 'Leyendo los encargos',   lugar: 'el tablón de anuncios' },
    casa:               { verbo: 'Descansando',            lugar: 'su casa' },
    'gran-palacio':     { verbo: 'En ceremonia',            lugar: 'el gran palacio' },
    'ala-l':            { verbo: 'Deliberando',             lugar: 'el ala en escuadra' },
    'ala-l-mayor':      { verbo: 'Deliberando',             lugar: 'el ala en L' },
    'patio-u':          { verbo: 'Descansando',             lugar: 'el patio' },
    'patio-o':          { verbo: 'Descansando',             lugar: 'el patio' },
    'salon-doble':      { verbo: 'En audiencia',            lugar: 'el salón doble' },
    'gran-recinto':     { verbo: 'En ceremonia',            lugar: 'el gran recinto' },
    'pabellon-te':      { verbo: 'Tomando el té',           lugar: 'el pabellón de té' },
    'puerta-imperial':  { verbo: 'Custodiando el paso',     lugar: 'la puerta imperial' },
    que:                { verbo: 'De guardia',              lugar: 'la torre que' },
    'salon-trono':      { verbo: 'En audiencia imperial',   lugar: 'el salón del trono' },
    'torre-esquina':    { verbo: 'Vigilando',               lugar: 'la torre de esquina' },
    'pabellon-agua':    { verbo: 'Contemplando el agua',    lugar: 'el pabellón sobre el agua' }
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

  // ── Terreno EXTERIOR (anillo perimetral comprable) ───────────────────────
  // Fuera de las murallas se puede comprar un anillo construible SOLO para
  // edificios exteriores (campamento…). Se compra por tiers (3→6), en orden, con
  // tesorería; cada tier ensancha el anillo. exteriorTier ∈ {0,3,4,5,6} ≤ tier.
  const RING_PASO = 5;                                  // celdas de anillo por tier
  const COSTE_EXTERIOR = { 3: 2000, 4: 4500, 5: 9000, 6: 18000 };
  const ringDepth = (exteriorTier) => { const e = Number(exteriorTier) || 0; return e >= 3 ? (e - 2) * RING_PASO : 0; };
  const costeExterior = (tierAComprar) => COSTE_EXTERIOR[tierAComprar] || 0;
  // ¿La celda (x,y) está en el anillo exterior comprado? (fuera de la rejilla
  // interior pero dentro de la profundidad del anillo).
  function esCeldaExterior(x, y, tier, exteriorTier) {
    const d = ringDepth(exteriorTier); if (d <= 0) return false;
    const [w, h] = gridDims(tier);
    const interior = x >= 0 && y >= 0 && x < w && y < h;
    const dentroAnillo = x >= -d && y >= -d && x < w + d && y < h + d;
    return dentroAnillo && !interior;
  }
  // ¿Todas las celdas de una construcción caen en el anillo exterior?
  const enExterior = (c, tier, exteriorTier) => celdasOcupadas(c).every(([x, y]) => esCeldaExterior(x, y, tier, exteriorTier));

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

  // ── SINERGIA DE PABELLÓN ───────────────────────────────────────────────────
  // Un pabellón de rol X bonifica a TODA la hacienda según cuántos edificios de
  // dominio X contiene (el de CLASE —校場/太學/官署, `restringido`— cuenta doble).
  // De la sinergia por dominio salen bonos pasivos:
  //   文 cultural        → +XP en misiones
  //   政 administrativo  → +dinero de misiones y −precios en el mercado
  // `pabellones` = [{ seed:[sx,sy], rol }] de la hacienda. Devuelve fracciones
  // (0.10 = +10%) y el desglose de sinergia por dominio (para mostrarlo).
  const pctSinergia = (s) => Math.min(0.15, 0.03 * Math.max(0, s || 0));      // 1→3% … 5+→15% (tope)
  const pctSinergiaMil = (s) => Math.min(0.10, 0.025 * Math.max(0, s || 0));   // 军 más LIGERO: tope 10%
  const DR_COPIA = 0.4;   // cada copia EXTRA del mismo edificio aporta ×0.4 de la anterior (rendimientos decrecientes NOTABLES)
  function bonosPabellon(mapa, tier, pabellones) {
    const sin = { militar: 0, cultural: 0, administrativo: 0 };
    const cons = (mapa && Array.isArray(mapa.construcciones)) ? mapa.construcciones : [];
    // 1) Reúne los edificios que PUNTÚAN: dominio == rol del pabellón y dentro de su región.
    const aportan = [];
    (pabellones || []).forEach(p => {
      const rol = p && p.rol; if (!rol || !(rol in sin)) return;
      const seed = (p && p.seed) || [0, 0];
      const cells = new Set(regionPabellon(mapa, tier, seed[0], seed[1]).map(c => c[0] + ',' + c[1]));
      if (!cells.size) return;
      cons.forEach(c => {
        const t = tipo(c && c.tipo); if (!t || t.dominio !== rol || !Array.isArray(c.pos)) return;
        if (celdasOcupadas(c).some(cc => cells.has(cc[0] + ',' + cc[1]))) aportan.push({ c, t, rol });
      });
    });
    // 2) Orden estable por posición → el "nº de copia" es determinista.
    aportan.sort((a, b) => (a.c.pos[1] - b.c.pos[1]) || (a.c.pos[0] - b.c.pos[0]));
    // 3) Suma con RENDIMIENTOS DECRECIENTES por TIPO: la k-ésima copia aporta base·0.4^(k-1).
    const detalle = {}, nTipo = {};
    aportan.forEach(({ c, t, rol }) => {
      const k = (nTipo[t.id] = (nTipo[t.id] || 0) + 1);
      const base = t.restringido ? 2 : 1;
      const efectiva = base * Math.pow(DR_COPIA, k - 1);
      sin[rol] += efectiva;
      detalle[c.pos[0] + ',' + c.pos[1]] = { rol, tipo: t.id, copia: k, base, efectiva };
    });
    return { sinergia: sin, detalle, xp: pctSinergia(sin.cultural), dinero: pctSinergia(sin.administrativo), mercado: pctSinergia(sin.administrativo), xpMil: pctSinergiaMil(sin.militar) };
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
  function puedeColocar(c, tier, lista, exteriorTier) {
    const t = tipo(c && c.tipo);
    if (!t) return { ok: false, motivo: 'Tipo de edificio desconocido.' };
    if (clampTier(tier) < t.tierMin) return { ok: false, motivo: `Requiere nivel ${t.tierMin} de hacienda.` };
    // Exteriores SOLO en el anillo exterior; normales SOLO dentro de la rejilla.
    if (t.exterior) {
      if (!enExterior(c, tier, exteriorTier)) return { ok: false, motivo: 'Solo en terreno exterior (compra la extensión).' };
    } else if (!dentroDeRejilla(c, tier)) {
      return { ok: false, motivo: 'No cabe dentro de la rejilla.' };
    }
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
    const eT = Number(mapa && mapa.exteriorTier) || 0;
    return lista.filter(c => {
      const t = tipo(c.tipo);
      if (!t) return false;
      // Los edificios exteriores viven en el anillo (coords fuera de la rejilla);
      // los normales, dentro de la rejilla.
      return t.exterior ? enExterior(c, tier, eT) : dentroDeRejilla(c, tier);
    });
  }

  // Sanea un `mapa` venido de fuera (BD, semilla) al shape canónico.
  function normalizaMapa(mapa) {
    const lista = (mapa && Array.isArray(mapa.construcciones)) ? mapa.construcciones : [];
    const construcciones = lista.reduce((acc, c) => {
      if (!c || !tipo(c.tipo) || !Array.isArray(c.pos)) return acc;
      // Los edificios exteriores se colocan en el anillo (coords negativas / fuera
      // de la rejilla): NO se pueden recortar a 0; los normales sí.
      const ext = !!tipo(c.tipo).exterior;
      const fx = Math.floor(Number(c.pos[0]) || 0), fy = Math.floor(Number(c.pos[1]) || 0);
      const gx = ext ? fx : Math.max(0, fx);
      const gy = ext ? fy : Math.max(0, fy);
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
    // Tema visual de la hacienda (arte a mano por reino, p.ej. 'wei'). Carga sprites
    // de assets/img/iso/<tema>/. Se guarda en el mapa (jsonb) — sin migración.
    if (mapa && mapa.tema) out.tema = String(mapa.tema).toLowerCase();
    // Fundador (líder) de la casa: id de miembro designado por el admin. Se guarda
    // en el mapa (jsonb) para no requerir migración de la tabla. (Sin esto, la
    // normalización lo descartaba y el selector volvía a «sin fundador».)
    if (mapa && mapa.fundador) out.fundador = String(mapa.fundador);
    // Terreno exterior comprado (tier 3..6) y puntos de tesorería ya gastados.
    const eT = Math.floor(Number(mapa && mapa.exteriorTier) || 0);
    if (eT >= 3) out.exteriorTier = clampTier(eT);
    const ga = Math.floor(Number(mapa && mapa.gastado) || 0);
    if (ga > 0) out.gastado = ga;
    return out;
  }

  // Edificio PRINCIPAL de una finca: de las construcciones presentes que son
  // `principal`, la de mayor `rango` (la escalera 正殿→大殿→朝堂→宮殿→大院). null si no hay.
  function edificioPrincipal(mapa) {
    const cons = (mapa && mapa.construcciones) || [];
    let best = null, bestR = -1;
    cons.forEach(c => { const t = byId[c.tipo]; if (t && t.principal && (t.rango || 0) > bestR) { bestR = t.rango || 0; best = c; } });
    return best;
  }

  return {
    CONSTRUCCIONES, tipo, esSuelo, esLinea, CATEGORIAS, categoriaDe, TAREAS, tareaDe, lugarDe, gridDims, slotsDesbloqueados, footprintDe, celdasOcupadas, edificioPrincipal,
    dentroDeRejilla, colisiona, construccionEn, puedeColocar, patios, enMuro,
    construccionesValidas, normalizaMapa, MAX_TIER,
    ringDepth, costeExterior, esCeldaExterior, enExterior, COSTE_EXTERIOR,
    ROLES_PABELLON, rolPabellon, maxPabellones, MIN_PABELLON, regionPabellon, regionValidaPabellon, bonosPabellon, pctSinergia, pctSinergiaMil, DR_COPIA
  };
})();

if (typeof window !== 'undefined') window.HacBuild = HacBuild;
if (typeof module !== 'undefined' && module.exports) module.exports = HacBuild;
