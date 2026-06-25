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

  // ── Catálogo de edificios (halls) ───────────────────────────────────────
  // footprint:[ancho,alto] en celdas — cada edificio tiene un tamaño distinto.
  // Se pueden ROTAR (campo `rot` 0..3 = ×90°); la ocupación usa el footprint
  // rotado (ver footprintDe). unico: máximo uno por hacienda. tierMin: nivel de
  // hacienda necesario. cargoMin: DIFERIDO (roles self-service pendientes).
  const CONSTRUCCIONES = Object.freeze([
    { id: 'pabellon', nombre: 'Pabellón',        zh: '亭',   footprint: [1, 2], tierMin: 1, unico: false, cargoMin: null,    color: '#9a6b3a', altura: 22, desc: 'Pabellón abierto para comensales y discípulos.' },
    { id: 'pagoda',   nombre: 'Pagoda',          zh: '塔',   footprint: [2, 2], tierMin: 1, unico: false, cargoMin: null,    color: '#b5482a', altura: 50, desc: 'Torre de varios aleros; hito vertical de la finca.' },
    { id: 'galeria',  nombre: 'Galería',         zh: '廊',   footprint: [1, 3], tierMin: 1, unico: false, cargoMin: null,    color: '#7d6a3a', altura: 16, desc: 'Larga galería techada que une los pabellones.' },
    { id: 'ala',      nombre: 'Ala Señorial',    zh: '偏殿', footprint: [2, 3], tierMin: 2, unico: false, cargoMin: null,    color: '#a85a2e', altura: 28, desc: 'Salón lateral para consejeros y vasallos de peso.' },
    { id: 'salon',    nombre: 'Salón Principal', zh: '正殿', footprint: [3, 3], tierMin: 2, unico: true,  cargoMin: 'pilar', color: '#c0532a', altura: 34, desc: 'Corazón de la casa; gran salón sede del Pilar.' }
  ].map(Object.freeze));

  const byId = {};
  CONSTRUCCIONES.forEach(t => { byId[t.id] = t; });

  const clampTier = (t) => Math.max(1, Math.min(MAX_TIER, Number(t) || 1));
  const tipo = (id) => byId[id] || null;
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

  // Celdas que ocupa una construcción dado su footprint (rotado) y su pos ancla.
  function celdasOcupadas(c) {
    const fp = footprintDe(c);
    const gx = (c && c.pos && Number(c.pos[0])) || 0;
    const gy = (c && c.pos && Number(c.pos[1])) || 0;
    const out = [];
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
    return { v: 1, construcciones };
  }

  return {
    CONSTRUCCIONES, tipo, gridDims, slotsDesbloqueados, footprintDe, celdasOcupadas,
    dentroDeRejilla, colisiona, construccionEn, puedeColocar,
    construccionesValidas, normalizaMapa, MAX_TIER
  };
})();

if (typeof window !== 'undefined') window.HacBuild = HacBuild;
if (typeof module !== 'undefined' && module.exports) module.exports = HacBuild;
