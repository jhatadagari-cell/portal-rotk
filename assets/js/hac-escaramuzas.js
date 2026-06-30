/* ═══════════════════════════════════════════════════════════════════════
   hac-escaramuzas.js — Expediciones COOPERATIVAS (bandas de 2-4 jugadores).
   ─────────────────────────────────────────────────────────────────────────
   Un jugador MONTA una banda (paga), otros se UNEN, el host la LANZA (30 min).
   Caché + lectura/recarga (poll), igual que HacStats/HacOrdenes. Si falta la
   tabla, degrada (caché vacía) sin romper la página. Tabla: escaramuzas.sql.

   Modelo: { id, haciendaId, hostId, hostNombre, plazas, dificultad, estado,
             miembros:[{id,nombre}], coste, inicioMs, finMs, exito,
             botin:[itemId], elecciones:{pjId:itemId}, lootHasta }
     estado ∈ abierta | en_curso | botin | resuelta
   ═══════════════════════════════════════════════════════════════════════ */
const HacEscaramuzas = (function () {
  'use strict';
  const TABLE = 'escaramuzas';
  const DUR_MS = 30 * 60 * 1000;     // 30 min fuera
  const CD_MS = 60 * 60 * 1000;      // cooldown 1 h (uso futuro)
  let cache = [], ok = false, readyPromise = null;

  async function sb() {
    if (typeof Auth === 'undefined') throw new Error('Auth no está cargado');
    await Auth.ready();
    const c = Auth.client();
    if (!c) throw new Error('Supabase no disponible');
    return c;
  }
  const arr = (v) => { try { return Array.isArray(v) ? v : (v ? JSON.parse(v) : []); } catch (e) { return []; } };
  const obj = (v) => { try { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : (v ? JSON.parse(v) : {}); } catch (e) { return {}; } };
  function rowToObj(r) {
    return {
      id: r.id, haciendaId: r.hacienda_id, hostId: r.host_id, hostNombre: r.host_nombre || '',
      plazas: Number(r.plazas) || 3, dificultad: Number(r.dificultad) || 4, estado: r.estado || 'abierta',
      miembros: arr(r.miembros), coste: Number(r.coste) || 0,
      inicioMs: Number(r.inicio_ms) || 0, finMs: Number(r.fin_ms) || 0, exito: r.exito,
      botin: arr(r.botin), elecciones: obj(r.elecciones), lootHasta: Number(r.loot_hasta) || 0,
    };
  }
  async function load() {
    try {
      const c = await sb();
      const { data, error } = await c.from(TABLE).select('*');
      if (error) throw error;
      cache = (data || []).map(rowToObj); ok = true;
    } catch (e) {
      console.warn('[HacEscaramuzas] tabla no disponible (¿falta escaramuzas.sql?):', e && e.message || e);
      cache = []; ok = false;
    }
    return cache;
  }
  function ready() { return readyPromise || (readyPromise = load()); }
  function reload() { readyPromise = load(); return readyPromise; }

  const all = (hacId) => cache.filter(b => b.haciendaId === hacId);
  const abiertas = (hacId) => all(hacId).filter(b => b.estado === 'abierta');
  // Banda en la que participa el jugador (en cualquier estado), o null.
  function miBanda(hacId, pjId) { return all(hacId).find(b => (b.miembros || []).some(m => m.id === pjId)) || null; }

  // Refleja en caché la fila devuelta por una RPC (insert/update).
  function upsertCache(rowData) {
    if (!rowData) return null;
    const o = rowToObj(rowData);
    const i = cache.findIndex(x => x.id === o.id);
    if (i >= 0) cache[i] = o; else cache.push(o);
    return o;
  }
  // Todas las mutaciones van por funciones SECURITY DEFINER (atómicas en BD).
  async function crear({ haciendaId, hostId, hostNombre, plazas, dificultad, coste }) {
    const c = await sb();
    const { data, error } = await c.rpc('escaramuza_crear', {
      p_hac: haciendaId, p_host: hostId, p_nombre: hostNombre || '', p_plazas: plazas || 3, p_dif: dificultad || 4, p_coste: coste || 0,
    });
    if (error) throw new Error(error.message || 'No se pudo montar la banda');
    return upsertCache(data);
  }
  async function unir(id, miembro) {
    const c = await sb();
    const { data, error } = await c.rpc('escaramuza_unir', { p_id: id, p_pj: miembro.id, p_nombre: miembro.nombre || '' });
    if (error) throw new Error(error.message || 'No se pudo unir');
    return upsertCache(data);
  }
  // Devuelve { disuelta } — la RPC borra la fila si sale el host o queda vacía (data=null).
  async function salir(id, pjId) {
    const c = await sb();
    const { data, error } = await c.rpc('escaramuza_salir', { p_id: id, p_pj: pjId });
    if (error) throw new Error(error.message || 'No se pudo salir');
    if (!data) { cache = cache.filter(x => x.id !== id); return { disuelta: true }; }
    upsertCache(data); return { disuelta: false };
  }
  // El host LANZA: la RPC valida (host, ≥2, abierta) y fija inicio/fin (30 min).
  async function lanzar(id, hostId, nowMs) {
    if (!nowMs) throw new Error('Reloj no disponible');
    const c = await sb();
    const { data, error } = await c.rpc('escaramuza_lanzar', { p_id: id, p_host: hostId, p_now: nowMs });
    if (error) throw new Error(error.message || 'No se pudo lanzar');
    return upsertCache(data);
  }
  // RESUELVE al volver (≥ fin). Idempotente en BD: solo el primer cliente surte
  // efecto. Aplica dinero/heridas/cooldown a todos y deja la banda en 'botin'/'resuelta'.
  async function resolver(id, nowMs, exito, botin, share, hostBonus) {
    const c = await sb();
    const { data, error } = await c.rpc('escaramuza_resolver', {
      p_id: id, p_now: nowMs, p_exito: !!exito, p_botin: botin || [], p_share: share || 0, p_host_bonus: hostBonus || 0,
    });
    if (error) throw new Error(error.message || 'No se pudo resolver');
    return upsertCache(data);
  }

  return { ready, reload, all, abiertas, miBanda, crear, unir, salir, lanzar, resolver, DUR_MS, CD_MS, dbOk: () => ok, TABLE };
})();
if (typeof window !== 'undefined') window.HacEscaramuzas = HacEscaramuzas;
