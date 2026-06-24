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
                ser 0. Sube estos números para que cueste más ascender.       */
const HAC_TIERS = [
  {
    nivel: 1,
    nombre: 'Residencia',
    zh: '宅',
    umbral: 0,
    desc: 'Una casa recién fundada. Muros modestos, pero su nombre ya cuenta.'
  },
  {
    nivel: 2,
    nombre: 'Mansión',
    zh: '府',
    umbral: 100,
    desc: 'Una casa establecida, residencia digna de un dignatario.'
  },
  {
    nivel: 3,
    nombre: 'Hacienda Mayor',
    zh: '邸',
    umbral: 300,
    desc: 'Una gran finca señorial. Solo las casas más sostenidas la alcanzan.'
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
    id: 'pilar',
    nombre: 'Pilar de la Casa',
    zh: '棟梁',
    tier: 3,
    umbral: 60,
    sala: 'Salón principal',
    desc: 'Sostiene el linaje: su nombre se graba en el salón principal.'
  }
];


/* ── HACIENDAS (semilla inicial) ──────────────────────────────────────────
   ESTO ES LA SEMILLA. En cuanto uses el panel de admin (admin-haciendas.html),
   los datos pasan a guardarse en el navegador (localStorage) y este fichero
   deja de mandar. Para volver a la semilla: botón "Restaurar ejemplo" del panel.

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
      { nombre: 'Mecenas de ejemplo', puntos: 110, desde: '2026-05', nota: 'Sostuvo la hacienda desde su fundación.' },
      { nombre: 'Otro ejemplo',       puntos: 20,  desde: '2026-05', nota: '' },
      { nombre: 'Tercer ejemplo',     puntos: 5,   desde: '2026-05', nota: '' }
      // ▲▲▲ EJEMPLOS ▲▲▲
    ]
  }
];
