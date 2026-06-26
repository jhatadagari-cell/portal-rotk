/* ═══════════════════════════════════════════════════════════════════════
   haciendas-data.js — Datos de las Haciendas, sus niveles y sus mecenas.
   ─────────────────────────────────────────────────────────────────────────
   ESTE ES EL ÚNICO FICHERO QUE EDITAS A MANO para gestionar la recompensa.

     ▸ Dar de alta una hacienda  → añade un objeto a HAC_HACIENDAS.
     ▸ Añadir un mecenas         → añade un objeto a su lista `miembros`.
     ▸ Cambiar un cargo a alguien→ edita su campo `rango`.
     ▸ Subir de nivel una casa   → edita su campo `tier`.
     ▸ Cargos y niveles se definen UNA sola vez (HAC_RANGOS / HAC_TIERS).

   Tras editar: guarda el fichero y recarga haciendas.html. No hay nada más.
   ═══════════════════════════════════════════════════════════════════════ */


/* ── TIERS (niveles de hacienda) ──────────────────────────────────────────
   El nivel de una hacienda. El nivel YA NO se pone a mano: se deduce de la
   `puntuacion` de cada casa. Cuando la puntuación cruza el `umbral` de un
   nivel, la hacienda asciende sola.
     · nivel  : 1 en adelante.
     · umbral : puntos necesarios para ALCANZAR este nivel. El primero debe
                ser 0. Sube estos números para que cueste más ascender.
     · grid   : dimensiones [ancho, alto] de la rejilla isométrica de la finca
                en ese nivel (alargada: alto > ancho, como las haciendas chinas
                de patios en hilera). Debe crecer con el nivel; la rejilla está
                anidada (cada una contiene a la anterior en su esquina [0,0]).
                También admite un número (rejilla cuadrada).                   */
const HAC_TIERS = [
  {
    nivel: 1,
    nombre: 'Residencia',
    zh: '宅',
    umbral: 0,
    grid: [8, 12],
    maxMiembros: 6,
    desc: 'Una casa recién fundada. Muros modestos, pero su nombre ya cuenta.'
  },
  {
    nivel: 2,
    nombre: 'Mansión',
    zh: '府',
    umbral: 150,
    grid: [12, 20],
    maxMiembros: 12,
    desc: 'Una casa establecida, residencia digna de un dignatario.'
  },
  {
    nivel: 3,
    nombre: 'Hacienda Mayor',
    zh: '邸',
    umbral: 500,
    grid: [24, 20],
    maxMiembros: 20,
    desc: 'Una gran finca señorial. Solo las casas más sostenidas la alcanzan.'
  },
  {
    nivel: 4,
    nombre: 'Casa Solariega',
    zh: '第',
    umbral: 1200,
    grid: [28, 30],
    maxMiembros: 32,
    desc: 'Un recinto amurallado con varios patios y pabellones de servicio.'
  },
  {
    nivel: 5,
    nombre: 'Palacio',
    zh: '宮',
    umbral: 3000,
    grid: [34, 40],
    maxMiembros: 48,
    desc: 'Una residencia palaciega: salones, jardines y torres de vigilancia.'
  },
  {
    nivel: 6,
    nombre: 'Corte Señorial',
    zh: '殿',
    umbral: 6500,
    grid: [42, 52],
    maxMiembros: 72,
    desc: 'La cumbre: una corte digna de un rey, alargada patio tras patio.'
  }
];


/* ── RANGOS (cargos) ──────────────────────────────────────────────────────
   La escalera de cargos dentro de una hacienda, de MENOR a MAYOR.
   `tier`   : nivel de hacienda en que se DESBLOQUEA el cargo. Una hacienda
              de nivel 1 solo puede tener cargos con tier 1; al ascender se
              abren los superiores. El cargo más alto de cada tier es su
              "cargo de élite".
   `umbral` : puntos MÍNIMOS que debe tener un miembro para alcanzar este
              cargo (si el nivel de la hacienda ya lo tiene desbloqueado).
              El cargo de cada miembro se deduce solo de sus puntos.
   `sala`   : nombre del pabellón — se usará en la futura vista pixel art.    */
const HAC_RANGOS = [
  {
    id: 'comensal',
    nombre: 'Comensal',
    zh: '食客',
    tier: 1,
    umbral: 1,
    sala: 'La mesa de la casa',
    desc: 'Recibido en la hacienda: come de su mesa y porta su nombre.'
  },
  {
    id: 'discipulo',
    nombre: 'Discípulo',
    zh: '門生',
    tier: 1,
    umbral: 5,
    sala: 'Patio de los discípulos',
    desc: 'Formado bajo el estandarte de la hacienda.'
  },
  {
    id: 'vasallo',
    nombre: 'Vasallo',
    zh: '家臣',
    tier: 1,
    umbral: 15,
    sala: 'Ala de los vasallos',
    desc: 'Jura servicio a la casa y cumple una función en ella.'
  },
  {
    id: 'consejero',
    nombre: 'Consejero',
    zh: '幕賓',
    tier: 2,
    umbral: 30,
    sala: 'Pabellón del consejero',
    desc: 'Su voz pesa en las decisiones de la hacienda.'
  },
  {
    id: 'intendente',
    nombre: 'Intendente',
    zh: '主簿',
    tier: 2,
    umbral: 45,
    sala: 'Despacho del intendente',
    desc: 'Lleva los registros, las cuentas y la intendencia de la casa.'
  },
  {
    id: 'pilar',
    nombre: 'Pilar de la Casa',
    zh: '棟梁',
    tier: 3,
    umbral: 60,
    sala: 'Salón principal',
    desc: 'Sostiene el linaje: su nombre se graba en el salón principal.'
  },
  {
    id: 'mayordomo',
    nombre: 'Mayordomo Mayor',
    zh: '長史',
    tier: 3,
    umbral: 100,
    sala: 'Cámara del mayordomo',
    desc: 'Dirige al servicio y la administración diaria de la hacienda.'
  },
  {
    id: 'comandante',
    nombre: 'Comandante',
    zh: '都督',
    tier: 4,
    umbral: 150,
    sala: 'Sala de mando',
    desc: 'Manda la guardia y las tropas al servicio de la casa.'
  },
  {
    id: 'gobernador',
    nombre: 'Gobernador',
    zh: '太守',
    tier: 4,
    umbral: 210,
    sala: 'Pabellón del gobernador',
    desc: 'Administra los dominios y territorios de la hacienda.'
  },
  {
    id: 'ministro',
    nombre: 'Ministro',
    zh: '九卿',
    tier: 5,
    umbral: 300,
    sala: 'Salón de los ministros',
    desc: 'Voz de peso en el gobierno de la casa, par de la corte.'
  },
  {
    id: 'marques',
    nombre: 'Marqués',
    zh: '列侯',
    tier: 5,
    umbral: 430,
    sala: 'Ala del marqués',
    desc: 'Ennoblecido por la casa; porta título y feudo propios.'
  },
  {
    id: 'excelencia',
    nombre: 'Gran Excelencia',
    zh: '三公',
    tier: 6,
    umbral: 620,
    sala: 'Salón de la corte',
    desc: 'Una de las tres dignidades supremas de la casa.'
  },
  {
    id: 'duque',
    nombre: 'Duque del Reino',
    zh: '國公',
    tier: 6,
    umbral: 850,
    sala: 'Salón ducal',
    desc: 'La cumbre del escalafón: pilar y sangre del reino.'
  }
];


/* ── HACIENDAS (semilla inicial) ──────────────────────────────────────────
   ESTO ES LA SEMILLA. Los datos reales viven en la tabla `haciendas` de
   Supabase (gestionados desde admin-haciendas.html). Esta semilla se usa como
   "Restaurar ejemplo (Sima)" del panel y como fallback de solo lectura si
   Supabase no responde.

   La PUNTUACIÓN de la casa = suma de los puntos de sus miembros (+ puntosExtra).
   El NIVEL de la casa se deduce de esa puntuación, y el CARGO de cada miembro
   se deduce de SUS puntos (limitado por el nivel de la casa).

   Campos de cada hacienda:
     · puntosExtra : puntos sueltos de la casa (p.ej. futuras misiones). Se
                     SUMAN al total. Pon 0 si no aplica.
   Cada miembro: { nombre, puntos, desde, nota }
     · nombre : nombre/alias visible del mecenas.
     · puntos : sus puntos. Determinan su cargo automáticamente.
     · desde  : mes de alta, formato 'AAAA-MM' (opcional).
     · nota   : opcional, una línea de dedicatoria o detalle (o '').          */
const HAC_HACIENDAS = [
  {
    id: 'sima',
    nombre: 'Hacienda Sima',
    zh: '司馬莊',
    color: '#8820b0',                       // acento de la casa (morado Jin)
    puntosExtra: 0,                         // puntos de misiones (futuro)
    lema: 'El tiempo lo conquista todo.',
    fundada: '2026',
    descripcion: 'La primera hacienda del portal. Quien la sostiene comparte ' +
                 'el destino de un linaje que supo esperar su hora.',
    miembros: [
      // ▼▼▼ EJEMPLOS — bórralos cuando tengas mecenas reales ▼▼▼
      { id: 'm-ej1', nombre: 'Mecenas de ejemplo', puntos: 110, desde: '2026-05', nota: 'Sostuvo la hacienda desde su fundación.' },
      { id: 'm-ej2', nombre: 'Otro ejemplo',       puntos: 20,  desde: '2026-05', nota: '' },
      { id: 'm-ej3', nombre: 'Tercer ejemplo',     puntos: 5,   desde: '2026-05', nota: '' }
      // ▲▲▲ EJEMPLOS ▲▲▲
    ],
    // TABLERO de construcciones (ver hac-build.js). La rejilla se deduce del
    // nivel; aquí solo los edificios colocados. pos=[gx,gy] celda ancla,
    // rot=0..3 (×90°). El dueño es el mecenas que administra el hall.
    mapa: {
      v: 1,
      construcciones: [
        { pos: [0, 0], tipo: 'salon',    rot: 0, dueno: 'm-ej1', nivel: 1 },
        { pos: [3, 0], tipo: 'pabellon', rot: 0, dueno: 'm-ej2', nivel: 1 },
        { pos: [0, 3], tipo: 'galeria',  rot: 1, dueno: null,    nivel: 1 }
      ]
    }
  }
];
