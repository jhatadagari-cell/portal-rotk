/* ═══════════════════════════════════════════════════════════════════════
   hac-energia.js — Energía de los mecenas (Supabase).
   ─────────────────────────────────────────────────────────────────────────
   Recurso PERSISTENTE del jugador: cada mecenas tiene energía que se REGENERA
   con el tiempo y solo se GASTA al darle una orden (misión). NO la consume el
   comportamiento ambiente (pasear/charlar es gratis).

   Persistente y compartida sin guardar un valor por frame: almacenamos el valor
   en un instante de referencia (`tsMs`) y la energía ACTUAL se deriva sumando la
   regeneración hasta `HacClock.now()`. Así todos los clientes calculan lo mismo.

   Patrón Auth/caché como HacOrdenes. Escritura solo del dueño (RLS).

   API:
     await HacEnergia.ready()                 · reload()
     HacEnergia.current(hid, miembroId)  → energía AHORA [0..MAX] (MAX si no hay fila)
     await HacEnergia.spend(hid, miembroId, coste)   → descuenta y persiste
     HacEnergia.MAX, HacEnergia.COSTE_MISION
   ═══════════════════════════════════════════════════════════════════════ */
const HacEnergia = (function () {
  'use strict';
  const TABLE = 'mecenas_energia';
  const MAX = 100;
  const REGEN_POR_SEG = 100 / (8 * 60);   // llena de 0 a 100 en ~8 min
  const COSTE_MISION = 34;                // lo que cuesta mandar una misión

  let cache = [], readyPromise = null, ok = false;

  async function sb() {
    if (typeof Auth === 'undefined') throw new Error('Auth no está cargado');
    await Auth.ready();
    const client = Auth.client();
    if (!client) throw new Error('Supabase no disponible');
    return client;
  }
  function rowToObj(r) {
    return { haciendaId: r.hacienda_id, miembroId: r.miembro_id, energia: Number(r.energia), tsMs: Number(r.energia_ts) || 0 };
  }
  async function load() {
    try {
      const client = await sb();
      const { data, error } = await client.from(TABLE).select('*');
      if (error) throw error;
      cache = (data || []).map(rowToObj); ok = true;
    } catch (e) {
      console.warn('[HacEnergia] tabla no disponible (¿falta energia.sql?):', e && e.message || e);
      cache = []; ok = false;
    }
    return cache;
  }
  function ready() { return readyPromise || (readyPromise = load()); }
  function reload() { readyPromise = load(); return readyPromise; }

  const now = () => (window.HacClock && HacClock.now) ? HacClock.now() : Date.now();
  function row(hid, mid) { return cache.find(r => r.haciendaId === hid && r.miembroId === mid) || null; }

  // Energía AHORA = valor guardado + regeneración desde su instante, topada a MAX.
  function current(hid, mid) {
    const r = row(hid, mid);
    if (!r) return MAX;
    const regen = REGEN_POR_SEG * Math.max(0, now() - r.tsMs) / 1000;
    return Math.max(0, Math.min(MAX, r.energia + regen));
  }

  // Suma energía (p.ej. comida del mercado), topada a MAX, y persiste.
  async function add(hid, mid, amount) {
    const nowMs = now();
    const nv = Math.max(0, Math.min(MAX, current(hid, mid) + (amount || 0)));
    const i = cache.findIndex(r => r.haciendaId === hid && r.miembroId === mid);
    const rec = { haciendaId: hid, miembroId: mid, energia: nv, tsMs: nowMs };
    if (i >= 0) cache[i] = rec; else cache.push(rec);     // optimista
    try {
      const client = await sb();
      const { error } = await client.from(TABLE).upsert({ hacienda_id: hid, miembro_id: mid, energia: nv, energia_ts: nowMs });
      if (error) throw error;
    } catch (e) { console.error('[HacEnergia] add', e); }
    return nv;
  }

  // Segundos hasta llenar al MÁX desde ahora (0 si ya está llena).
  function tiempoLleno(hid, mid) {
    const c = current(hid, mid);
    return c >= MAX ? 0 : (MAX - c) / REGEN_POR_SEG;
  }

  // Descuenta `coste` de la energía ACTUAL y persiste (instante = ahora).
  async function spend(hid, mid, coste) {
    const nowMs = now();
    const nv = Math.max(0, current(hid, mid) - (coste || 0));
    const i = cache.findIndex(r => r.haciendaId === hid && r.miembroId === mid);
    const rec = { haciendaId: hid, miembroId: mid, energia: nv, tsMs: nowMs };
    if (i >= 0) cache[i] = rec; else cache.push(rec);     // optimista
    try {
      const client = await sb();
      const { error } = await client.from(TABLE).upsert({
        hacienda_id: hid, miembro_id: mid, energia: nv, energia_ts: nowMs,
      });
      if (error) throw error;
    } catch (e) { console.error('[HacEnergia] spend', e); }
    return nv;
  }

  return { ready, reload, current, tiempoLleno, spend, add, dbOk: () => ok, MAX, COSTE_MISION, REGEN_POR_SEG, REGEN_POR_MIN: REGEN_POR_SEG * 60, TABLE };
})();
if (typeof window !== 'undefined') window.HacEnergia = HacEnergia;
