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
   El nivel de una hacienda. A futuro subirá solo según una puntuación
   (apoyo de los mecenas + misiones de la web); por ahora lo subes tú a mano
   con el campo `tier` de cada hacienda. `nivel` va de 1 en adelante.        */
const HAC_TIERS = [
  {
    nivel: 1,
    nombre: 'Residencia',
    zh: '宅',
    desc: 'Una casa recién fundada. Muros modestos, pero su nombre ya cuenta.'
  },
  {
    nivel: 2,
    nombre: 'Mansión',
    zh: '府',
    desc: 'Una casa establecida, residencia digna de un dignatario.'
  },
  {
    nivel: 3,
    nombre: 'Hacienda Mayor',
    zh: '邸',
    desc: 'Una gran finca señorial. Solo las casas más sostenidas la alcanzan.'
  }
];


/* ── RANGOS (cargos) ──────────────────────────────────────────────────────
   La escalera de cargos dentro de una hacienda, de MENOR a MAYOR.
   `tier`   : nivel de hacienda en que se DESBLOQUEA el cargo. Una hacienda
              de nivel 1 solo puede tener cargos con tier 1; al ascender se
              abren los superiores. El cargo más alto de cada tier es su
              "cargo de élite".
   `umbral` : donación/puntuación orientativa — referencia para ti, no se
              calcula nada solo.
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


/* ── HACIENDAS ────────────────────────────────────────────────────────────
   Campos de cada hacienda:
     · tier       : nivel actual (1-3). Solo admite cargos de ese tier o menor.
     · puntuacion : puntuación global de la casa. MANUAL por ahora — el
                    sistema que la calcula (apoyo + misiones) llegará después.
                    Pon 0 u omítelo si aún no aplica.
   Cada miembro: { mecenas, rango, desde, nota }
     · mecenas : nombre/alias visible del donante.
     · rango   : DEBE coincidir con un `id` de HAC_RANGOS y estar permitido
                 por el `tier` de la hacienda.
     · desde   : mes de alta, formato 'AAAA-MM'.
     · nota    : opcional, una línea de dedicatoria o detalle (o '').

   Los miembros del ejemplo están marcados — bórralos cuando tengas mecenas
   reales y ajusta el `tier` de la hacienda al real.                         */
const HAC_HACIENDAS = [
  {
    id: 'sima',
    nombre: 'Hacienda Sima',
    zh: '司馬莊',
    color: '#8820b0',                       // acento de la casa (morado Jin)
    tier: 2,                                // Mansión 府 — abre hasta Consejero
    puntuacion: 0,                          // manual; sistema de puntos pendiente
    lema: 'El tiempo lo conquista todo.',
    fundada: '2026',
    descripcion: 'La primera hacienda del portal. Quien la sostiene comparte ' +
                 'el destino de un linaje que supo esperar su hora.',
    miembros: [
      // ▼▼▼ EJEMPLOS — bórralos cuando tengas mecenas reales ▼▼▼
      { mecenas: 'Mecenas de ejemplo', rango: 'consejero', desde: '2026-05', nota: 'Sostuvo la hacienda desde su fundación.' },
      { mecenas: 'Otro ejemplo',       rango: 'vasallo',   desde: '2026-05', nota: '' },
      { mecenas: 'Tercer ejemplo',     rango: 'comensal',  desde: '2026-05', nota: '' }
      // ▲▲▲ EJEMPLOS ▲▲▲
    ]
  }
];
