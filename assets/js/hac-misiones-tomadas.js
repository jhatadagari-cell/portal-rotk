/* ═══════════════════════════════════════════════════════════════════════
   hac-misiones-tomadas.js — Misiones del tablón que YA cogió el jugador.
   ─────────────────────────────────────────────────────────────────────────
   Cuando coges una misión, desaparece de TU tablón (individual). El tablón se
   rellena a DIARIO: cada fila lleva el `dia`; el tablón solo esconde las de HOY,
   así que al cambiar de día vuelven todas. Estado INDIVIDUAL (RLS: solo lo tuyo).

   Patrón Auth/caché como HacOrdenes: caché en memoria, lectores síncronos tras
   ready(); escritor optimista que persiste. Ver supabase/misiones_tomadas.sql.

   API:
     await HacMisTomadas.ready()            · reload()
     HacMisTomadas.tomadasHoy(hid)          → Set<misId> cogidas HOY (mías)
     HacMisTomadas.estaTomada(hid, misId)   → bool
     await HacMisTomadas.tomar(hid, misId)  → registra (optimista + persiste)
   ═══════════════════════════════════════════════════════════════════════ */
const HacMisTomadas = (function () {
  'use strict';
  const TABLE = 'misiones_tomadas';
  let cache = [], readyPromise = null, ok = false;

  // Día 'AAAA-M-D' en hora de SERVIDOR (igual que el stock diario de la tienda),
  // para que el relleno diario coincida entre clientes.
  function diaStr() {
    const t = (window.HacClock && HacClock.now) ? HacClock.now() : Date.now();
    const d = new Date(t);
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  async function sb() {
    if (typeof Auth === 'undefined') throw new Error('Auth no está cargado');
    await Auth.ready();
    const client = Auth.client();
    if (!client) throw new Error('Supabase no disponible');
    return client;
  }

  function rowToObj(r) {
    return { haciendaId: r.hacienda_id, misionId: r.mision_id, dia: r.dia };
  }

  async function load() {
    try {
      const client = await sb();
      const { data, error } = await client.from(TABLE).select('hacienda_id, mision_id, dia');
      if (error) throw error;
      cache = (data || []).map(rowToObj);
      ok = true;
    } catch (e) {
      console.warn('[HacMisTomadas] tabla no disponible (¿falta misiones_tomadas.sql?):', e && e.message || e);
      cache = []; ok = false;
    }
    return cache;
  }
  function ready() { return readyPromise || (readyPromise = load()); }
  function reload() { readyPromise = load(); return readyPromise; }

  // ── Lectores síncronos (tras ready) ───────────────────────────────────────
  function tomadasHoy(hid) {
    const hoy = diaStr(), s = new Set();
    for (let i = 0; i < cache.length; i++) { const r = cache[i]; if (r.haciendaId === hid && r.dia === hoy) s.add(r.misionId); }
    return s;
  }
  function estaTomada(hid, misId) { const hoy = diaStr(); return cache.some(r => r.haciendaId === hid && r.misionId === misId && r.dia === hoy); }
  function dbOk() { return ok; }

  // ── Escritor (dueño) — optimista ──────────────────────────────────────────
  async function tomar(hid, misId) {
    const dia = diaStr();
    if (!cache.some(r => r.haciendaId === hid && r.misionId === misId && r.dia === dia)) cache.push({ haciendaId: hid, misionId: misId, dia: dia });   // optimista
    try {
      const client = await sb();
      const uid = (window.Auth && Auth.current() && Auth.current().id) || null;
      const { error } = await client.from(TABLE).upsert({ user_id: uid, hacienda_id: hid, mision_id: misId, dia: dia });
      if (error) throw error;
    } catch (e) { console.warn('[HacMisTomadas] tomar:', e && e.message || e); }
  }

  return { ready, reload, tomadasHoy, estaTomada, tomar, dbOk, diaStr, TABLE };
})();
if (typeof window !== 'undefined') window.HacMisTomadas = HacMisTomadas;
