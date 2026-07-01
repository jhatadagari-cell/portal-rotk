/* ═══════════════════════════════════════════════════════════════════════
   hac-relaciones.js — Relaciones entre mecenas (afinidad + vínculos nombrados).
   ─────────────────────────────────────────────────────────────────────────
   Caché + poll de la tabla `relaciones` (lectura pública). La afinidad sube y
   los vínculos (兄弟/争/恨/情) brotan al AZAR al resolver una escaramuza; el
   cliente computa afinidad+forjas DETERMINISTAS (HacRand por band.id+par) y las
   aplica con la RPC idempotente `escaramuza_relaciones`. Si falta la tabla, degrada.

   API: ready()/reload(); get(hac,a,b); deMiembro(hac,pjId) → [rel…];
        par(x,y) → [a,b] ordenado; procesar(bandId,hac,nowMs,afin,forjas);
        TIPOS, defTipo(tipo), etiqueta(rel), esUnilateral(rel).
   ═══════════════════════════════════════════════════════════════════════ */
const HacRelaciones = (function () {
  'use strict';
  const TABLE = 'relaciones';
  let cache = [], ok = false, readyPromise = null;

  // Metadatos de presentación (glifos Han, sin emojis) + frases de cheer (R1b).
  const TIPOS = {
    hermandad: { zh: '兄弟', nombre: 'Hermandad', cls: 'herm', dir: false,
      subs: { jurada: { nombre: 'jurada', cheer: '¡Un solo juramento, hasta la muerte!' },
              prometida: { nombre: 'prometida', cheer: '¡Hombro con hombro, hermano!' } } },
    rivalidad: { zh: '争', nombre: 'Rivalidad', cls: 'riva', dir: false,
      subs: { competitiva: { nombre: 'competitiva', cheer: '¡A ver quién vuelve con más gloria!' },
              envidiosa: { nombre: 'envidiosa', cheer: 'No pienso quedar por debajo de ti.' } } },
    odio: { zh: '恨', nombre: 'Odio', cls: 'odio', dir: true,
      subs: { unilateral: { nombre: 'unilateral', cheer: 'Ojalá no tuviera que verte aquí.' },
              reciproco: { nombre: 'recíproco', cheer: 'Apártate de mi camino.' } } },
    amor: { zh: '情', nombre: 'Amor', cls: 'amor', dir: true,
      subs: { unilateral: { nombre: 'no correspondido', cheer: 'Volveré por ti… aunque no lo sepas.' },
              reciproco: { nombre: 'correspondido', cheer: '¡Vuelve a mi lado sano y salvo!' } } },
  };
  const defTipo = (t) => TIPOS[t] || null;
  const par = (x, y) => (String(x) <= String(y) ? [String(x), String(y)] : [String(y), String(x)]);

  async function sb() {
    if (typeof Auth === 'undefined') throw new Error('Auth no está cargado');
    await Auth.ready();
    const c = Auth.client(); if (!c) throw new Error('Supabase no disponible');
    return c;
  }
  function rowToObj(r) {
    return { id: r.id, haciendaId: r.hacienda_id, a: r.a, b: r.b, afinidad: Number(r.afinidad) || 0,
      tipo: r.tipo || null, subtipo: r.subtipo || null, origen: r.origen || null, creadaMs: Number(r.creada_ms) || 0 };
  }
  async function load() {
    try {
      const c = await sb();
      const { data, error } = await c.from(TABLE).select('*');
      if (error) throw error;
      cache = (data || []).map(rowToObj); ok = true;
    } catch (e) {
      console.warn('[HacRelaciones] tabla no disponible (¿falta relaciones.sql?):', e && e.message || e);
      cache = []; ok = false;
    }
    return cache;
  }
  function ready() { return readyPromise || (readyPromise = load()); }
  function reload() { readyPromise = load(); return readyPromise; }

  function get(hac, x, y) { const [a, b] = par(x, y); return cache.find(r => r.haciendaId === hac && r.a === a && r.b === b) || null; }
  // Relaciones NOMBRADAS de un mecenas (con quién). Cada una incluye el "otro".
  function deMiembro(hac, pjId) {
    return cache.filter(r => r.haciendaId === hac && r.tipo && (r.a === pjId || r.b === pjId))
      .map(r => ({ rel: r, otro: r.a === pjId ? r.b : r.a }));
  }
  const esUnilateral = (rel) => rel && rel.subtipo === 'unilateral';
  // Etiqueta legible ("兄弟 Hermandad jurada"), con matiz.
  function etiqueta(rel) {
    const d = defTipo(rel && rel.tipo); if (!d) return '';
    const sub = d.subs[rel.subtipo]; return `${d.zh} ${d.nombre}${sub ? ' ' + sub.nombre : ''}`;
  }

  // Aplica afinidad + forjas de una banda ya resuelta (idempotente en BD).
  async function procesar(bandId, hac, nowMs, afin, forjas) {
    const c = await sb();
    const { data, error } = await c.rpc('escaramuza_relaciones', {
      p_id: bandId, p_hac: hac, p_now: nowMs, p_afin: afin || [], p_forjas: forjas || [] });
    if (error) throw new Error(error.message || 'No se pudieron procesar relaciones');
    return data;
  }

  return { ready, reload, get, deMiembro, par, procesar, etiqueta, esUnilateral, defTipo, TIPOS, dbOk: () => ok, TABLE };
})();
if (typeof window !== 'undefined') window.HacRelaciones = HacRelaciones;
