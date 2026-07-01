/* ═══════════════════════════════════════════════════════════════════════
   hac-bitacora.js — Registro de actividad del mecenas (diario del jugador).
   ─────────────────────────────────────────────────────────────────────────
   Cada jugador registra SUS eventos (expediciones, escaramuzas, tareas, progreso)
   en la tabla `bitacora` (Supabase). Caché + poll. Si falta la tabla, degrada.
   `clave` opcional evita duplicar un mismo evento (resolución de banda, etc.).

   API:  HacBitacora.ready()/reload()
         HacBitacora.log(personajeId, tipo, texto, { clave, ts })   → añade (dedup por clave)
         HacBitacora.listar(personajeId, n)                          → últimas n (desc)
   ═══════════════════════════════════════════════════════════════════════ */
const HacBitacora = (function () {
  'use strict';
  const TABLE = 'bitacora';
  const MAX_SHOW = 60;
  let cache = [], ok = false, readyPromise = null;

  async function sb() {
    if (typeof Auth === 'undefined') throw new Error('Auth no está cargado');
    await Auth.ready();
    const c = Auth.client();
    if (!c) throw new Error('Supabase no disponible');
    return c;
  }
  function rowToObj(r) {
    return { id: r.id, personajeId: r.personaje_id, ts: Number(r.ts) || 0, tipo: r.tipo || '', texto: r.texto || '', clave: r.clave || '' };
  }
  async function load() {
    try {
      const c = await sb();
      const { data, error } = await c.from(TABLE).select('*').order('ts', { ascending: false }).limit(200);
      if (error) throw error;
      cache = (data || []).map(rowToObj); ok = true;
    } catch (e) {
      console.warn('[HacBitacora] tabla no disponible (¿falta bitacora.sql?):', e && e.message || e);
      cache = []; ok = false;
    }
    return cache;
  }
  function ready() { return readyPromise || (readyPromise = load()); }
  function reload() { readyPromise = load(); return readyPromise; }

  function listar(personajeId, n) {
    return cache.filter(e => e.personajeId === personajeId).slice(0, n || MAX_SHOW);
  }
  // Añade una entrada. Si `clave` ya existe (en caché) no duplica. Optimista en caché.
  async function log(personajeId, tipo, texto, opts) {
    opts = opts || {};
    if (!personajeId || !texto) return;
    if (opts.clave && cache.some(e => e.clave === opts.clave && e.personajeId === personajeId)) return;   // ya registrado
    const ts = opts.ts || ((window.HacClock && HacClock.now) ? HacClock.now() : Date.now());
    const local = { id: 'tmp-' + ts + '-' + Math.round(ts % 100000), personajeId, ts, tipo: tipo || '', texto, clave: opts.clave || '' };
    cache.unshift(local);   // refleja al instante
    try {
      const c = await sb();
      const user = Auth.current();
      const row = { user_id: user && user.id, personaje_id: personajeId, ts, tipo: tipo || '', texto, clave: opts.clave || null };
      const { data, error } = await c.from(TABLE).insert(row).select().single();
      if (error) throw error;
      const i = cache.indexOf(local); if (i >= 0) cache[i] = rowToObj(data);
    } catch (e) { console.warn('[HacBitacora] log', e && e.message || e); }
  }
  function dbOk() { return ok; }

  return { ready, reload, listar, log, dbOk, TABLE };
})();
if (typeof window !== 'undefined') window.HacBitacora = HacBitacora;
