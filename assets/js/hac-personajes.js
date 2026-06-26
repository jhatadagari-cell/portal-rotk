/* ═══════════════════════════════════════════════════════════════════════
   hac-personajes.js — Registro GLOBAL de personajes (Supabase).
   ─────────────────────────────────────────────────────────────────────────
   Un personaje se da de alta una vez (nombre + personalidad + aptitud) y
   luego puede ser añadido como MECENAS a cualquier hacienda. Los puntos y la
   nota del mecenazgo viven en cada hacienda (jsonb `miembros`), no aquí.

   Mismo patrón que HacStore/HacTareas: carga una vez en caché, lectores
   SÍNCRONOS tras ready(); escritores optimistas que persisten en Supabase
   (solo admin, RLS). Si la tabla `personajes` no existe aún, se degrada a una
   caché vacía y `dbOk()` devuelve false (la UI avisa de que falta el SQL).

   Modelo en cliente: { id, nombre, personalidad, aptitud, aspecto }
   ═══════════════════════════════════════════════════════════════════════ */
const HacPersonajes = (function () {
  'use strict';
  const TABLE = 'personajes';

  let cache = [];
  let readyPromise = null;
  let ok = false;   // true si la tabla respondió (aunque esté vacía)

  function rowToObj(r) {
    return {
      id: r.id,
      nombre: r.nombre || '',
      personalidad: r.personalidad || '',
      aptitud: r.aptitud || '',
      aspecto: (r.aspecto && typeof r.aspecto === 'object') ? r.aspecto : {}
    };
  }
  function objToRow(p) {
    return {
      id: p.id,
      nombre: p.nombre || '',
      personalidad: p.personalidad || '',
      aptitud: p.aptitud || '',
      aspecto: (p.aspecto && typeof p.aspecto === 'object') ? p.aspecto : {}
    };
  }

  async function sb() {
    if (typeof Auth === 'undefined') throw new Error('Auth no está cargado');
    await Auth.ready();
    const client = Auth.client();
    if (!client) throw new Error('Supabase no disponible');
    return client;
  }

  async function load() {
    try {
      const client = await sb();
      const { data, error } = await client.from(TABLE)
        .select('*').order('nombre', { ascending: true });
      if (error) throw error;
      cache = (data || []).map(rowToObj);
      ok = true;
    } catch (e) {
      console.warn('[HacPersonajes] tabla no disponible (¿falta personajes.sql?):', e && e.message || e);
      cache = []; ok = false;
    }
    return cache;
  }
  function ready() { return readyPromise || (readyPromise = load()); }
  function reload() { readyPromise = load(); return readyPromise; }

  // ── Lectores SÍNCRONOS (tras ready) ─────────────────────────────────────
  function all() { return cache.slice(); }
  function get(id) { return cache.find(p => p.id === id) || null; }
  function dbOk() { return ok; }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  // ── Escritores (admin) — optimistas, persisten en Supabase ──────────────
  async function add(p) {
    const obj = { id: uuid(), nombre: (p.nombre || '').trim(), personalidad: p.personalidad || '', aptitud: p.aptitud || '', aspecto: p.aspecto || {} };
    cache.push(obj);
    const client = await sb();
    const { error } = await client.from(TABLE).insert(objToRow(obj));
    if (error) { console.error('[HacPersonajes] add', error); throw error; }
    return obj;
  }
  async function update(p) {
    const i = cache.findIndex(x => x.id === p.id);
    if (i >= 0) cache[i] = Object.assign({}, cache[i], p); else cache.push(p);
    const client = await sb();
    const { error } = await client.from(TABLE).upsert(objToRow(cache[i >= 0 ? i : cache.length - 1]));
    if (error) { console.error('[HacPersonajes] update', error); throw error; }
    return p;
  }
  async function remove(id) {
    cache = cache.filter(p => p.id !== id);
    const client = await sb();
    const { error } = await client.from(TABLE).delete().eq('id', id);
    if (error) { console.error('[HacPersonajes] remove', error); throw error; }
  }

  return { ready, reload, all, get, dbOk, add, update, remove, TABLE };
})();

if (typeof window !== 'undefined') window.HacPersonajes = HacPersonajes;
