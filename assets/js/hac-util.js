/* ═══════════════════════════════════════════════════════════════════════
   hac-util.js — Utilidades compartidas por los módulos de haciendas.
   ─────────────────────────────────────────────────────────────────────────
   Fuente ÚNICA de las funciones que antes estaban duplicadas en hac-char,
   hac-iso, hac-pixel y hac-folk (color, números aleatorios, rejilla, etc.).
   Debe cargarse ANTES que cualquier otro módulo Hac* que las use.
   ═══════════════════════════════════════════════════════════════════════ */
const HacUtil = (function () {
  'use strict';

  // Color ───────────────────────────────────────────────────────────────────
  // '#rgb' o '#rrggbb' → [r,g,b] (0-255). Valor por defecto = dorado de la casa.
  function hexToRgb(h) {
    h = String(h || '').replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (h.length !== 6) h = 'c9a84c';
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const rgbToHex = (r, g, b) => '#' + [r, g, b].map(v => clamp255(v).toString(16).padStart(2, '0')).join('');

  // Números ───────────────────────────────────────────────────────────────────
  const rnd = (n) => Math.floor(Math.random() * n);          // entero en [0, n)
  const rng = (a, b) => a + Math.random() * (b - a);          // real en [a, b)
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Rejilla ───────────────────────────────────────────────────────────────────
  const neigh = (x, y) => [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];   // 4-vecindad

  // Entorno ───────────────────────────────────────────────────────────────────
  const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  return { hexToRgb, clamp255, rgbToHex, rnd, rng, clamp, neigh, reduced };
})();
if (typeof window !== 'undefined') window.HacUtil = HacUtil;
