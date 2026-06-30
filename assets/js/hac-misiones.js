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
  const POOL = Object.freeze([
    // 武 Militar
    { id: 'patrulla',    dom: 'militar', dif: 1, nombre: 'Patrulla fronteriza',        desc: 'Recorrer los lindes de la hacienda.' },
    { id: 'bandidos',    dom: 'militar', dif: 2, nombre: 'Sofocar a unos bandidos',    desc: 'Una partida hostiga los caminos.' },
    { id: 'escolta',     dom: 'militar', dif: 3, nombre: 'Escoltar una caravana',      desc: 'Proteger mercancías hasta el mercado vecino.' },
    { id: 'desertores',  dom: 'militar', dif: 3, nombre: 'Cazar desertores',           desc: 'Dar caza a soldados huidos.' },
    { id: 'vado',        dom: 'militar', dif: 4, nombre: 'Defender un vado',           desc: 'Impedir el paso del río al enemigo.' },
    { id: 'fortin',      dom: 'militar', dif: 5, nombre: 'Asaltar un fortín rebelde',  desc: 'Tomar una posición fortificada.' },
    { id: 'asedio',      dom: 'militar', dif: 6, nombre: 'Romper un asedio',           desc: 'Acudir en auxilio de una plaza sitiada.' },
    // 文 Cultural
    { id: 'misiva',      dom: 'cultural', dif: 1, nombre: 'Llevar una misiva',         desc: 'Entregar una carta a una casa amiga.' },
    { id: 'estudios',    dom: 'cultural', dif: 2, nombre: 'Viaje de estudios',         desc: 'Visitar a un maestro de provincias.' },
    { id: 'embajada',    dom: 'cultural', dif: 3, nombre: 'Embajada a una casa vecina',desc: 'Negociar cortesías entre señores.' },
    { id: 'archivos',    dom: 'cultural', dif: 3, nombre: 'Copiar archivos de un templo', desc: 'Reproducir textos antiguos.' },
    { id: 'disputa',     dom: 'cultural', dif: 4, nombre: 'Mediar en una disputa',     desc: 'Apaciguar a dos clanes enfrentados.' },
    { id: 'manuscrito',  dom: 'cultural', dif: 5, nombre: 'Recuperar un manuscrito',   desc: 'Rastrear una obra perdida.' },
    { id: 'corte',       dom: 'cultural', dif: 6, nombre: 'Debatir ante la corte',     desc: 'Defender la casa en un gran debate.' },
    // 政 Administrativo
    { id: 'censo',       dom: 'administrativo', dif: 1, nombre: 'Censar una aldea',    desc: 'Contar familias y tierras.' },
    { id: 'tributos',    dom: 'administrativo', dif: 2, nombre: 'Recaudar tributos',   desc: 'Cobrar las rentas del trimestre.' },
    { id: 'graneros',    dom: 'administrativo', dif: 3, nombre: 'Inspeccionar graneros', desc: 'Revisar reservas de grano.' },
    { id: 'grano',       dom: 'administrativo', dif: 3, nombre: 'Negociar un contrato de grano', desc: 'Asegurar el abasto del año.' },
    { id: 'auditar',     dom: 'administrativo', dif: 4, nombre: 'Auditar un distrito', desc: 'Examinar las cuentas de un magistrado.' },
    { id: 'mercado',     dom: 'administrativo', dif: 5, nombre: 'Reorganizar un mercado', desc: 'Poner orden en una feria caótica.' },
    { id: 'prefectura',  dom: 'administrativo', dif: 6, nombre: 'Sanear una prefectura', desc: 'Enderezar las finanzas de toda una comarca.' },
  ]);

  const byId = {}; POOL.forEach(m => { byId[m.id] = m; });
  const get = (id) => byId[id] || null;
  const durSeg = (m) => 90 + m.dif * 15;                       // 105 s … 180 s
  const disponibles = (tier) => POOL.filter(m => m.dif <= (tier || 1) + 1);

  // Riesgo de fracaso: base 8 %, +13 % por cada nivel de dificultad por ENCIMA de
  // tu nivel efectivo (y baja si lo superas). Acotado a [3 %, 85 %].
  function riesgo(nivelEf, dif) {
    return Math.max(0.03, Math.min(0.85, 0.08 + (dif - (nivelEf || 0)) * 0.13));
  }
  function recompensa(m) {
    return { dom: m.dom, dinero: 6 + m.dif * 9, xp: 8 + m.dif * 9 };
  }
  const nivelColor = (pct) => pct < 0.20 ? 'baja' : (pct < 0.45 ? 'media' : 'alta');

  return { POOL, get, disponibles, durSeg, riesgo, recompensa, nivelColor };
})();
if (typeof window !== 'undefined') window.HacMisiones = HacMisiones;
