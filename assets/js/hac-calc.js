/* ═══════════════════════════════════════════════════════════════════════
   hac-calc.js — Lógica PURA de las Haciendas (sin DOM).
   Fuente única de las reglas, usada por la página pública (haciendas.js) y por
   el panel de admin (admin-haciendas.html).

     · haciendaPuntos(h)            → puntos totales (miembros + puntosExtra)
     · tierDePuntos(pts)            → objeto tier deducido de la puntuación
     · progresoHacia(pts, tier)     → {sig, faltan, pct} o null si está al máx
     · rangoDePuntos(pts, tier)     → cargo de un miembro o null
     · clampTier(n)                 → nivel acotado a [1, maxTier]
   Lee HAC_TIERS / HAC_RANGOS (de haciendas-data.js), que deben cargarse antes.
   ═══════════════════════════════════════════════════════════════════════ */
const HacCalc = (function () {
  'use strict';

  const tiers  = () => (typeof HAC_TIERS  !== 'undefined') ? HAC_TIERS  : [];
  const rangos = () => (typeof HAC_RANGOS !== 'undefined') ? HAC_RANGOS : [];
  const num    = (v) => Number(v) || 0;

  const tiersAsc = () => tiers().slice().sort((a, b) => num(a.umbral) - num(b.umbral));
  const maxTier  = () => tiers().reduce((m, t) => Math.max(m, t.nivel || 1), 1);
  const clampTier = (n) => Math.min(maxTier(), Math.max(1, Number(n) || 1));

  function haciendaPuntos(h) {
    return (h.miembros || []).reduce((s, m) => s + num(m.puntos), num(h.puntosExtra));
  }

  function tierDePuntos(pts) {
    const p = num(pts);
    const asc = tiersAsc();
    let actual = asc[0] || { nivel: 1, nombre: 'Nivel 1', zh: '', umbral: 0 };
    for (const t of asc) { if (p >= num(t.umbral)) actual = t; }
    return actual;
  }

  function progresoHacia(pts, tierActual) {
    const p = num(pts);
    const sig = tiersAsc().find(t => num(t.umbral) > num(tierActual.umbral));
    if (!sig) return null;
    const base = num(tierActual.umbral);
    const meta = num(sig.umbral);
    const span = Math.max(1, meta - base);
    return { sig, faltan: Math.max(0, meta - p), pct: Math.round(Math.max(0, Math.min(1, (p - base) / span)) * 100) };
  }

  function rangoDePuntos(pts, tier) {
    const p = num(pts);
    let r = null;
    rangos().forEach(x => { if (p >= num(x.umbral) && (Number(x.tier) || 1) <= tier) r = x; });
    return r;
  }

  // El tier objeto correspondiente a un nivel concreto (1..maxTier).
  function tierPorNivel(n) {
    const nn = clampTier(n);
    return tiers().find(t => (Number(t.nivel) || 1) === nn) || tierDePuntos(0);
  }

  // ── Nivel de la FINCA (separado de los puntos) ───────────────────────────
  // El nivel de la finca es un TRINQUETE: sube cuando los puntos cruzan un
  // umbral, pero NO baja al perder puntos (la rejilla/layout no encoge). El
  // nivel alcanzado se persiste en `mapa.tier`; el efectivo es el mayor entre
  // ese y el que darían los puntos actuales.
  function nivelAlcanzado(h) {
    const t = h && h.mapa && Number(h.mapa.tier);
    return t > 0 ? clampTier(t) : 1;
  }
  function nivelEfectivo(h) {
    const derivado = tierDePuntos(haciendaPuntos(h)).nivel;
    return clampTier(Math.max(Number(derivado) || 1, nivelAlcanzado(h)));
  }
  // Cupo de mecenas según el nivel efectivo de la finca.
  function maxMiembros(h) {
    const t = tierPorNivel(nivelEfectivo(h));
    return (t && Number(t.maxMiembros)) || Infinity;
  }

  return { haciendaPuntos, tierDePuntos, progresoHacia, rangoDePuntos, clampTier, tiersAsc, maxTier,
    tierPorNivel, nivelAlcanzado, nivelEfectivo, maxMiembros };
})();

if (typeof window !== 'undefined') window.HacCalc = HacCalc;
