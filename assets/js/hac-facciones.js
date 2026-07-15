/* ═══════════════════════════════════════════════════════════════════════
   hac-facciones.js — Registro de FACCIONES (Supabase).
   ─────────────────────────────────────────────────────────────────────────
   Facciones creadas por el admin (bandos/clanes) para organizar a los
   personajes NPC. Cada personaje tiene `faccion` (id) opcional. El admin
   agrupa por facción y usa su `color` en el listado y al añadir mecenas.

   Mismo patrón que HacPersonajes: caché en memoria, lectores SÍNCRONOS tras
   ready(); escritores optimistas que persisten en Supabase (solo admin, RLS).
   Si la tabla `facciones` no existe aún, degrada a caché vacía y dbOk()=false.

   Modelo en cliente: { id, nombre, color, zh, orden }
   ═══════════════════════════════════════════════════════════════════════ */
const HacFacciones = (function () {
  'use strict';
  const TABLE = 'facciones';

  let cache = [];
  let readyPromise = null;
  let ok = false;

  function rowToObj(r) {
    return {
      id: r.id,
      nombre: r.nombre || '',
      color: r.color || '#c9a84c',
      zh: r.zh || '',
      orden: Number(r.orden) || 0
    };
  }
  function objToRow(f) {
    return {
      id: f.id,
      nombre: f.nombre || '',
      color: f.color || '#c9a84c',
      zh: f.zh || '',
      orden: Number(f.orden) || 0
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
        .select('*').order('orden', { ascending: true }).order('nombre', { ascending: true });
      if (error) throw error;
      cache = (data || []).map(rowToObj);
      ok = true;
    } catch (e) {
      console.warn('[HacFacciones] tabla no disponible (¿falta facciones.sql?):', e && e.message || e);
      cache = []; ok = false;
    }
    return cache;
  }
  function ready() { return readyPromise || (readyPromise = load()); }
  function reload() { readyPromise = load(); return readyPromise; }

  function all() { return cache.slice(); }
  function get(id) { return id ? (cache.find(f => f.id === id) || null) : null; }
  function dbOk() { return ok; }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  async function add(f) {
    const obj = { id: uuid(), nombre: (f.nombre || '').trim(), color: f.color || '#c9a84c', zh: f.zh || '', orden: Number(f.orden) || (cache.length + 1) };
    cache.push(obj);
    const client = await sb();
    const { error } = await client.from(TABLE).insert(objToRow(obj));
    if (error) { console.error('[HacFacciones] add', error); throw error; }
    return obj;
  }
  async function update(f) {
    const i = cache.findIndex(x => x.id === f.id);
    if (i >= 0) cache[i] = Object.assign({}, cache[i], f); else cache.push(f);
    const client = await sb();
    const { error } = await client.from(TABLE).upsert(objToRow(cache[i >= 0 ? i : cache.length - 1]));
    if (error) { console.error('[HacFacciones] update', error); throw error; }
    return f;
  }
  async function remove(id) {
    cache = cache.filter(f => f.id !== id);
    const client = await sb();
    const { error } = await client.from(TABLE).delete().eq('id', id);
    if (error) { console.error('[HacFacciones] remove', error); throw error; }
  }

  return { ready, reload, all, get, dbOk, add, update, remove, TABLE };
})();

if (typeof window !== 'undefined') window.HacFacciones = HacFacciones;
