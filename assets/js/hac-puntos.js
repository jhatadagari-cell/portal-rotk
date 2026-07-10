/* ═══════════════════════════════════════════════════════════════════════
   hac-puntos.js — Puntos ganados en misiones (Supabase).
   ─────────────────────────────────────────────────────────────────────────
   Cada misión completada da una recompensa BAJA de puntos según la energía
   gastada y la duración. Se acumulan en un ledger propio del jugador (la tabla
   `haciendas` solo la escribe el admin). El total de un mecenas = puntos base
   (admin) + estos. Las haciendas progresan colectivamente sumándolos.

   Clave `miembroId` = id del PERSONAJE (= walker.id). Patrón Auth/caché como
   HacEnergia; escritura solo del dueño (RLS).

   API:
     await HacPuntos.ready()                 · reload()
     HacPuntos.deMiembro(hid, miembroId)     → puntos de misión acumulados (0 si no hay)
     HacPuntos.totalHacienda(hid)            → suma de todos (aporte colectivo)
     await HacPuntos.award(hid, miembroId, n)→ suma n al ledger
     HacPuntos.recompensa(coste, duracionSeg)→ puntos que daría una misión (BAJOS)
   ═══════════════════════════════════════════════════════════════════════ */
const HacPuntos = (function () {
  'use strict';
  const TABLE = 'puntos_mision';
  let cache = [], readyPromise = null, ok = false;

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
      const { data, error } = await client.from(TABLE).select('*');
      if (error) throw error;
      cache = (data || []).map(r => ({ haciendaId: r.hacienda_id, miembroId: r.miembro_id, puntos: Number(r.puntos) || 0 }));
      ok = true;
    } catch (e) {
      console.warn('[HacPuntos] tabla no disponible (¿falta puntos_mision.sql?):', e && e.message || e);
      cache = []; ok = false;
    }
    return cache;
  }
  function ready() { return readyPromise || (readyPromise = load()); }
  function reload() { readyPromise = load(); return readyPromise; }

  function deMiembro(hid, mid) { const r = cache.find(x => x.haciendaId === hid && x.miembroId === mid); return r ? r.puntos : 0; }
  function totalHacienda(hid) { return cache.filter(x => x.haciendaId === hid).reduce((s, x) => s + x.puntos, 0); }

  // Recompensa BAJA: ∝ energía gastada + tiempo. Tuneable.
  function recompensa(coste, duracionSeg) {
    return Math.max(1, Math.round((coste || 0) * 0.1 + (duracionSeg || 0) / 60 * 1.5));
  }

  async function award(hid, mid, n) {
    if (!n) return;
    // ANTI-PISOTÓN: calcula el valor nuevo SOLO con la caché ya cargada. Si la
    // carga no tuvo éxito (ok=false), no escribimos: si no, deMiembro() daría 0
    // y el upsert machacaría los puntos reales con solo el incremento.
    await ready();
    if (!ok) { console.warn('[HacPuntos] award omitido: datos no cargados'); return; }
    const nv = deMiembro(hid, mid) + n;
    const i = cache.findIndex(x => x.haciendaId === hid && x.miembroId === mid);
    if (i >= 0) cache[i].puntos = nv; else cache.push({ haciendaId: hid, miembroId: mid, puntos: nv });   // optimista
    try {
      const client = await sb();
      const { error } = await client.from(TABLE).upsert({ hacienda_id: hid, miembro_id: mid, puntos: nv, actualizado: new Date().toISOString() });
      if (error) throw error;
    } catch (e) { console.error('[HacPuntos] award', e); }
    return nv;
  }

  return { ready, reload, deMiembro, totalHacienda, award, recompensa, dbOk: () => ok, TABLE };
})();
if (typeof window !== 'undefined') window.HacPuntos = HacPuntos;
