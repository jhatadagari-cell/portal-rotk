/* ═══════════════════════════════════════════════════════════════════════
   hac-misiones.js — Pool de MISIONES externas (tablón del edificio principal).
   ─────────────────────────────────────────────────────────────────────────
   Datos puros. Cada misión tiene un DOMINIO (武/文/政) y una DIFICULTAD (1-6).
   El RIESGO de fracaso depende de tu nivel EFECTIVO en ese dominio (nivel por XP
   + bonos de equipo): a más nivel sobre la dificultad, menos riesgo. Equiparte
   un objeto "+militar" baja el riesgo de las misiones militares. La recompensa
   (dinero + XP) escala con la dificultad. Al fracasar pierdes parte del monedero.

   API:
     HacMisiones.POOL
     HacMisiones.get(id)
     HacMisiones.disponibles(tier)      → misiones con dif ≤ tier+1
     HacMisiones.riesgo(nivelEf, dif)   → prob. de fracaso [0.03..0.85]
     HacMisiones.recompensa(m)          → { dinero, xp, dom }
     HacMisiones.nivelColor(pct)        → 'baja' | 'media' | 'alta'
   ═══════════════════════════════════════════════════════════════════════ */
const HacMisiones = (function () {
  'use strict';
  // dom: militar|cultural|administrativo · dif: 1..6 · dur en segundos
  // enc: ENCUENTROS de la expedición (0-2 según dificultad). Cada uno exige una APTITUD
  //   (su icono se ve en el tablón ANTES de aceptar) y se resuelve como una tirada única
  //   contra tu nivel en ese dominio. A menudo cruzan de dominio para premiar variar.
  const POOL = Object.freeze([
    // 武 Militar
    { id: 'patrulla',    dom: 'militar', dif: 1, enc: [],                              nombre: 'Patrulla fronteriza',        desc: 'Recorrer los lindes de la hacienda.' },
    { id: 'bandidos',    dom: 'militar', dif: 2, enc: ['administrativo'],              nombre: 'Sofocar a unos bandidos',    desc: 'Una partida hostiga los caminos.' },
    { id: 'escolta',     dom: 'militar', dif: 3, enc: ['administrativo'],              nombre: 'Escoltar una caravana',      desc: 'Proteger mercancías hasta el mercado vecino.' },
    { id: 'desertores',  dom: 'militar', dif: 3, enc: ['cultural'],                    nombre: 'Cazar desertores',           desc: 'Dar caza a soldados huidos.' },
    { id: 'vado',        dom: 'militar', dif: 4, enc: ['militar'],                     nombre: 'Defender un vado',           desc: 'Impedir el paso del río al enemigo.' },
    { id: 'fortin',      dom: 'militar', dif: 5, enc: ['militar', 'administrativo'],   nombre: 'Asaltar un fortín rebelde',  desc: 'Tomar una posición fortificada.' },
    { id: 'asedio',      dom: 'militar', dif: 6, enc: ['militar', 'cultural'],         nombre: 'Romper un asedio',           desc: 'Acudir en auxilio de una plaza sitiada.' },
    // 文 Cultural
    { id: 'misiva',      dom: 'cultural', dif: 1, enc: [],                             nombre: 'Llevar una misiva',         desc: 'Entregar una carta a una casa amiga.' },
    { id: 'estudios',    dom: 'cultural', dif: 2, enc: ['cultural'],                   nombre: 'Viaje de estudios',         desc: 'Visitar a un maestro de provincias.' },
    { id: 'embajada',    dom: 'cultural', dif: 3, enc: ['administrativo'],             nombre: 'Embajada a una casa vecina',desc: 'Negociar cortesías entre señores.' },
    { id: 'archivos',    dom: 'cultural', dif: 3, enc: ['cultural'],                   nombre: 'Copiar archivos de un templo', desc: 'Reproducir textos antiguos.' },
    { id: 'disputa',     dom: 'cultural', dif: 4, enc: ['administrativo'],             nombre: 'Mediar en una disputa',     desc: 'Apaciguar a dos clanes enfrentados.' },
    { id: 'manuscrito',  dom: 'cultural', dif: 5, enc: ['cultural', 'militar'],        nombre: 'Recuperar un manuscrito',   desc: 'Rastrear una obra perdida.' },
    { id: 'corte',       dom: 'cultural', dif: 6, enc: ['cultural', 'administrativo'], nombre: 'Debatir ante la corte',     desc: 'Defender la casa en un gran debate.' },
    // 政 Administrativo
    { id: 'censo',       dom: 'administrativo', dif: 1, enc: [],                            nombre: 'Censar una aldea',    desc: 'Contar familias y tierras.' },
    { id: 'tributos',    dom: 'administrativo', dif: 2, enc: ['militar'],                   nombre: 'Recaudar tributos',   desc: 'Cobrar las rentas del trimestre.' },
    { id: 'graneros',    dom: 'administrativo', dif: 3, enc: ['administrativo'],            nombre: 'Inspeccionar graneros', desc: 'Revisar reservas de grano.' },
    { id: 'grano',       dom: 'administrativo', dif: 3, enc: ['cultural'],                  nombre: 'Negociar un contrato de grano', desc: 'Asegurar el abasto del año.' },
    { id: 'auditar',     dom: 'administrativo', dif: 4, enc: ['cultural'],                  nombre: 'Auditar un distrito', desc: 'Examinar las cuentas de un magistrado.' },
    { id: 'mercado',     dom: 'administrativo', dif: 5, enc: ['administrativo', 'militar'], nombre: 'Reorganizar un mercado', desc: 'Poner orden en una feria caótica.' },
    { id: 'prefectura',  dom: 'administrativo', dif: 6, enc: ['administrativo', 'cultural'],nombre: 'Sanear una prefectura', desc: 'Enderezar las finanzas de toda una comarca.' },
  ]);

  const byId = {}; POOL.forEach(m => { byId[m.id] = m; });
  const get = (id) => byId[id] || null;
  const durSeg = (m) => 90 + m.dif * 15;                       // 105 s … 180 s
  const disponibles = (tier) => POOL.filter(m => m.dif <= (tier || 1) + 1);

  // Riesgo de fracaso en función del MARGEN = tu nivel efectivo − dificultad.
  //   · A tu nivel (margen 0): ~40 % → una misión pareja es una apuesta real.
  //   · Superarla ayuda con RENDIMIENTOS DECRECIENTES y nunca baja del 12 %:
  //       margen  0→40 %  1→30 %  2→22 %  3→16 %  4→12 %  5+→12 %
  //     (antes bastaba con superar la dif. para caer al 3 %; ya no: ni sobrada
  //      una misión es "gratis").
  //   · Ir por debajo dispara el riesgo (barrera de dificultad):
  //       −1→56 %  −2→72 %  −3→88 %  (tope 93 %).
  function riesgo(nivelEf, dif) {
    const m = (nivelEf || 0) - dif;
    return (m >= 0) ? Math.max(0.12, 0.40 * Math.pow(0.74, m))
                    : Math.min(0.93, 0.40 + (-m) * 0.16);
  }
  // Recompensa BASE por dificultad. El multiplicador por "reto" (misiones muy por
  // debajo de tu nivel rinden menos) lo aplica la página, que conoce tu nivel.
  function recompensa(m) {
    return { dom: m.dom, dinero: 6 + m.dif * 9, xp: 8 + m.dif * 9 };
  }
  // Multiplicador de recompensa por MARGEN: a tu nivel (o por encima de la misión)
  // rinde full; muy por debajo de tu nivel es "rutina" y rinde progresivamente menos.
  // Empuja a variar: sobre-subir un dominio hace que sus misiones fáciles paguen poco.
  //   margen ≤1 → ×1 · 2 → ×0.86 · 3 → ×0.72 · 4 → ×0.58 · 5 → ×0.44 · 6+ → ×0.30
  function retoMult(nivelEf, dif) {
    const margen = (nivelEf || 0) - dif;
    return (margen <= 1) ? 1 : Math.max(0.30, 1 - (margen - 1) * 0.14);
  }
  const nivelColor = (pct) => pct < 0.20 ? 'baja' : (pct < 0.45 ? 'media' : 'alta');

  // Coste de ENERGÍA: las misiones difíciles cansan más (más lejos / más duras).
  const coste = (m) => 14 + m.dif * 8;                       // dif1=22 … dif6=62

  // Botín al volver: prob. BAJA que sube con la dificultad. A más dificultad,
  // mejores objetos posibles (equipables mayores). Devuelve un id o null.
  const LOOT_ENERGIA = ['raciones', 'te', 'vianda'];
  const LOOT_EQUIPO_BAJO = ['tratado-mil', 'clasicos', 'codigo', 'combo-wenwu', 'combo-wenzheng', 'combo-zhengwu'];
  const LOOT_EQUIPO_ALTO = ['tratado-mayor', 'clasicos-mayor', 'codigo-mayor'];
  const lootChance = (dif) => Math.min(0.45, 0.06 + dif * 0.05);   // ~11 % (dif1) … 36 % (dif6)
  function lootPool(dif) {
    const pool = LOOT_ENERGIA.slice();
    if (dif >= 2) pool.push.apply(pool, LOOT_EQUIPO_BAJO);
    if (dif >= 4) pool.push.apply(pool, LOOT_EQUIPO_ALTO);
    return pool;
  }
  // Tira el botín de una misión (usa Math.random; lado jugador, no el sim). id|null.
  function botin(m) {
    if (Math.random() >= lootChance(m.dif)) return null;
    const pool = lootPool(m.dif);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  return { POOL, get, disponibles, durSeg, riesgo, recompensa, retoMult, nivelColor, coste, lootChance, botin };
})();
if (typeof window !== 'undefined') window.HacMisiones = HacMisiones;
