/* ═══════════════════════════════════════════════════════════════════════
   hac-ordenes.js — Órdenes del jugador a su mecenas (Supabase).
   ─────────────────────────────────────────────────────────────────────────
   Agencia del jugador: el usuario manda a SU personaje una MISIÓN (ir a un
   edificio a hacer su tarea, ~2 min). La orden es ESTADO COMPARTIDO: lectura
   pública para que la simulación determinista de hac-folk.js la aplique igual
   en todos los clientes; la escritura la restringe RLS al dueño del personaje.

   `inicioMs` (hora de servidor) marca cuándo empieza la misión, para que el
   sim la active en el tick correcto (sin teletransporte, simultáneo para todos).

   Patrón Auth/caché como HacPersonajes/HacSolicitudes: cache en memoria,
   lectores síncronos tras ready(); escritores optimistas que persisten.

   API:
     await HacOrdenes.ready()                       · reload()
     HacOrdenes.byHacienda(hid)  → [orden…]
     HacOrdenes.mine(hid, miembroId) → orden | null
     await HacOrdenes.set({ haciendaId, miembroId, tipo?, targetId?, duracionSeg? })
     await HacOrdenes.clear(haciendaId, miembroId)
   Shape orden (cliente): { haciendaId, miembroId, userId, tipo, targetId, inicioMs, duracionSeg }
   ═══════════════════════════════════════════════════════════════════════ */
const HacOrdenes = (function () {
  'use strict';
  const TABLE = 'ordenes';
  let cache = [], readyPromise = null, ok = false;

  async function sb() {
    if (typeof Auth === 'undefined') throw new Error('Auth no está cargado');
    await Auth.ready();
    const client = Auth.client();
    if (!client) throw new Error('Supabase no disponible');
    return client;
  }

  function rowToObj(r) {
    return {
      haciendaId: r.hacienda_id,
      miembroId: r.miembro_id,
      userId: r.user_id || null,
      tipo: r.tipo || 'mision',
      targetId: r.target_id || null,
      inicioMs: r.inicio ? Date.parse(r.inicio) : 0,
      duracionSeg: Number(r.duracion_seg) || 120,
    };
  }

  async function load() {
    try {
      const client = await sb();
      const { data, error } = await client.from(TABLE).select('*');
      if (error) throw error;
      cache = (data || []).map(rowToObj);
      ok = true;
    } catch (e) {
      console.warn('[HacOrdenes] tabla no disponible (¿falta ordenes.sql?):', e && e.message || e);
      cache = []; ok = false;
    }
    return cache;
  }
  function ready() { return readyPromise || (readyPromise = load()); }
  function reload() { readyPromise = load(); return readyPromise; }

  // ── Lectores síncronos (tras ready) ───────────────────────────────────────
  function byHacienda(hid) { return cache.filter(o => o.haciendaId === hid); }
  function mine(hid, miembroId) { return cache.find(o => o.haciendaId === hid && o.miembroId === miembroId) || null; }
  function dbOk() { return ok; }

  // ── Escritores (dueño del personaje) — optimistas ─────────────────────────
  // `inicio` se sella con la hora de SERVIDOR (HacClock) para que el sim de
  // todos los clientes active la misión en el mismo instante.
  async function set(o) {
    const nowMs = (window.HacClock && HacClock.now) ? HacClock.now() : Date.now();
    const rec = {
      haciendaId: o.haciendaId, miembroId: o.miembroId,
      userId: (window.Auth && Auth.current() && Auth.current().id) || null,
      tipo: o.tipo || 'mision', targetId: o.targetId || null,
      inicioMs: nowMs, duracionSeg: o.duracionSeg || 120,
    };
    const i = cache.findIndex(x => x.haciendaId === rec.haciendaId && x.miembroId === rec.miembroId);
    if (i >= 0) cache[i] = rec; else cache.push(rec);   // optimista
    const client = await sb();
    const { error } = await client.from(TABLE).upsert({
      hacienda_id: rec.haciendaId, miembro_id: rec.miembroId,
      tipo: rec.tipo, target_id: rec.targetId,
      inicio: new Date(nowMs).toISOString(), duracion_seg: rec.duracionSeg,
    });
    if (error) { console.error('[HacOrdenes] set', error); throw error; }
    return rec;
  }

  async function clear(hid, miembroId) {
    const i = cache.findIndex(x => x.haciendaId === hid && x.miembroId === miembroId);
    if (i >= 0) cache.splice(i, 1);   // optimista
    const client = await sb();
    const { error } = await client.from(TABLE).delete().eq('hacienda_id', hid).eq('miembro_id', miembroId);
    if (error) { console.error('[HacOrdenes] clear', error); throw error; }
  }

  return { ready, reload, byHacienda, mine, set, clear, dbOk, TABLE };
})();
if (typeof window !== 'undefined') window.HacOrdenes = HacOrdenes;
