/* ═══════════════════════════════════════════════════════════════════════
   personajes-data.js — Catálogos de PERSONALIDAD y APTITUD de los personajes.
   ─────────────────────────────────────────────────────────────────────────
   Definiciones fijas (no dependen de la BD). Las usan el panel de admin
   (creación de personajes) y, en el futuro, la simulación de la finca
   (la personalidad determinará el patrón de conducta del mecenas).

     · HAC_PERSONALIDADES  → arquetipo de comportamiento (se elige 1).
     · HAC_DOMINIOS        → los 3 ejes de aptitud (militar/cultural/admin).
     · HAC_APTITUDES       → 6 perfiles: 3 puros + 3 combinaciones de 2 ejes.
       (Hay más combinaciones posibles; de momento cubrimos estas seis.)
   ═══════════════════════════════════════════════════════════════════════ */

/* ── PERSONALIDADES ───────────────────────────────────────────────────────
   Determinarán el patrón de conducta (velocidad, permanencia, deambular…)
   cuando la finca cobre vida. De momento solo se guardan. */
const HAC_PERSONALIDADES = [
  { id: 'audaz',  nombre: 'Audaz',  zh: '勇', desc: 'Impulsivo y enérgico. Se mueve deprisa y busca la acción.' },
  { id: 'sereno', nombre: 'Sereno', zh: '靜', desc: 'Calmado y metódico. Pasos pausados; se demora en cada tarea.' },
  { id: 'astuto', nombre: 'Astuto', zh: '慧', desc: 'Curioso e impredecible. Deambula y explora toda la finca.' }
];

/* ── DOMINIOS (ejes de aptitud) ───────────────────────────────────────────
   Los tres pilares clásicos: armas (武), letras (文) y gobierno (政). */
const HAC_DOMINIOS = {
  militar:        { nombre: 'Militar',        zh: '武', icon: '⚔️' },
  cultural:       { nombre: 'Cultural',       zh: '文', icon: '📜' },
  administrativo: { nombre: 'Administrativo', zh: '政', icon: '🏛️' }
};

/* ── APTITUDES ────────────────────────────────────────────────────────────
   `dominios` = ejes en los que destaca el personaje. 3 puras + 3 mixtas.
   Determinarán sus estadísticas/uso futuro. */
const HAC_APTITUDES = [
  { id: 'guerrero',      nombre: 'Guerrero',      zh: '武', icon: '⚔️',  dominios: ['militar'],                    desc: 'Fuerza y arrojo: nace para el campo de batalla.' },
  { id: 'erudito',       nombre: 'Erudito',       zh: '文', icon: '📜',  dominios: ['cultural'],                   desc: 'Letras, música y saber clásico.' },
  { id: 'administrador', nombre: 'Administrador', zh: '政', icon: '🧮',  dominios: ['administrativo'],             desc: 'Gobierno, finanzas y logística de la casa.' },
  { id: 'estratega',     nombre: 'Estratega',     zh: '略', icon: '🪶',  dominios: ['militar', 'cultural'],        desc: 'El genio militar culto: une el arte de la guerra y el del saber.' },
  { id: 'caudillo',      nombre: 'Caudillo',      zh: '霸', icon: '🐎',  dominios: ['militar', 'administrativo'],  desc: 'Manda tropas y gobierna el territorio que conquista.' },
  { id: 'canciller',     nombre: 'Canciller',     zh: '相', icon: '🐉',  dominios: ['cultural', 'administrativo'], desc: 'El sabio que administra el Estado.' }
];

/* ── Helpers de búsqueda (por id) ─────────────────────────────────────────*/
const HacPersonajeDefs = (function () {
  'use strict';
  const byId = (arr) => arr.reduce((m, x) => (m[x.id] = x, m), {});
  const P = byId(HAC_PERSONALIDADES);
  const A = byId(HAC_APTITUDES);
  return {
    personalidad: (id) => P[id] || null,
    aptitud:      (id) => A[id] || null,
    dominio:      (id) => HAC_DOMINIOS[id] || null,
    PERSONALIDADES: HAC_PERSONALIDADES,
    APTITUDES: HAC_APTITUDES,
    DOMINIOS: HAC_DOMINIOS
  };
})();

if (typeof window !== 'undefined') {
  window.HAC_PERSONALIDADES = HAC_PERSONALIDADES;
  window.HAC_APTITUDES = HAC_APTITUDES;
  window.HAC_DOMINIOS = HAC_DOMINIOS;
  window.HacPersonajeDefs = HacPersonajeDefs;
}
