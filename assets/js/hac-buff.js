/* ═══════════════════════════════════════════════════════════════════════
   hac-buff.js — BONOS temporales de hacienda (Debates · Fase 2).
   ─────────────────────────────────────────────────────────────────────────
   Al DONAR un libro de "Conclusiones" al señor de la casa (fundador) se
   enciende un bono de +XP para TODA la hacienda durante 7 días. Caché + poll
   como el resto (HacDebates/HacEscaramuzas); si falta la tabla, degrada a caché
   vacía sin romper la página. Tabla: supabase/buff_hacienda.sql.

   Modelo: { haciendaId, tipo, valor, hasta(ms), calidad, donanteId, donanteNombre }
   API:
     HacBuff.ready()/reload()
     HacBuff.activo(hac, tipo='xp')  → el bono si sigue vivo (hasta > now), o null
     HacBuff.xpActivo(hac)           → fracción de +XP activa (0 si no hay / expiró)
     await HacBuff.presentar({...})  → enciende/mejora el bono (RPC)
   ═══════════════════════════════════════════════════════════════════════ */
const HacBuff = (function () {
  'use strict';
  const TABLE = 'buff_hacienda';
  const DUR_MS = 7 * 24 * 60 * 60 * 1000;   // 7 días

  let cache = [], ok = false, readyPromise = null;

  async function sb() {
    if (typeof Auth === 'undefined') throw new Error('Auth no está cargado');
    await Auth.ready();
    const c = Auth.client();
    if (!c) throw new Error('Supabase no disponible');
    return c;
  }
  function rowToObj(r) {
    return {
      haciendaId: r.hacienda_id, tipo: r.tipo || 'xp', valor: Number(r.valor) || 0,
      hasta: Number(r.hasta) || 0, calidad: r.calidad || '',
      donanteId: r.donante_id || '', donanteNombre: r.donante_nombre || '',
    };
  }
  async function load() {
    try {
      const c = await sb();
      const { data, error } = await c.from(TABLE).select('*');
      if (error) throw error;
      cache = (data || []).map(rowToObj); ok = true;
    } catch (e) {
      console.warn('[HacBuff] tabla no disponible (¿falta buff_hacienda.sql?):', e && e.message || e);
      cache = []; ok = false;
    }
    return cache;
  }
  function ready() { return readyPromise || (readyPromise = load()); }
  function reload() { readyPromise = load(); return readyPromise; }
  function dbOk() { return ok; }
  function now() { return (typeof window !== 'undefined' && window.HacClock && HacClock.now) ? HacClock.now() : Date.now(); }

  function get(hac, tipo) { return cache.find(b => b.haciendaId === hac && b.tipo === (tipo || 'xp')) || null; }
  // El bono si SIGUE vivo (hasta > ahora), o null.
  function activo(hac, tipo) { const b = get(hac, tipo); return (b && b.hasta > now()) ? b : null; }
  // Fracción de +XP activa para la hacienda (0 si no hay o expiró).
  function xpActivo(hac) { const b = activo(hac, 'xp'); return b ? b.valor : 0; }

  function upsertCache(rowData) {
    if (!rowData) return null;
    const o = rowToObj(rowData);
    const i = cache.findIndex(x => x.haciendaId === o.haciendaId && x.tipo === o.tipo);
    if (i >= 0) cache[i] = o; else cache.push(o);
    return o;
  }
  // Presenta un libro al fundador → enciende/mejora el bono (7 días desde ahora).
  async function presentar({ haciendaId, tipo, valor, calidad, donanteId, donanteNombre }) {
    const c = await sb();
    const nowMs = now();
    const { data, error } = await c.rpc('buff_presentar', {
      p_hac: haciendaId, p_tipo: tipo || 'xp', p_valor: valor, p_calidad: calidad || '',
      p_donante: donanteId || '', p_donante_nombre: donanteNombre || '',
      p_hasta: nowMs + DUR_MS, p_now: nowMs,
    });
    if (error) throw new Error(error.message || 'No se pudo presentar el libro');
    return upsertCache(data);
  }

  return { ready, reload, dbOk, activo, xpActivo, presentar, DUR_MS };
})();
if (typeof window !== 'undefined') window.HacBuff = HacBuff;
if (typeof module !== 'undefined' && module.exports) module.exports = HacBuff;
