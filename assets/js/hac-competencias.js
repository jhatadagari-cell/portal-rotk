/* ═══════════════════════════════════════════════════════════════════════
   hac-competencias.js — Competencias de los mecenas (Supabase).
   ─────────────────────────────────────────────────────────────────────────
   Un mecenas DOMINA ciertos dominios (militar/cultural/administrativo). Tener la
   competencia de un dominio ABARATA las misiones a edificios de ese dominio
   (modelo SUAVE). La competencia INICIAL se deriva de la APTITUD del personaje
   (no se guarda); aquí se cachean las OTORGADAS extra (las escribe el admin).

   Clave `miembroId` = id del PERSONAJE (= walker.id), igual que órdenes/energía.

   API:
     await HacCompetencias.ready()                · reload()
     HacCompetencias.DOMINIOS                      → ['militar','cultural','administrativo']
     HacCompetencias.def(dominio)                  → { nombre, zh, icon } (de HacPersonajeDefs)
     HacCompetencias.initialFor(aptitud)           → dominios de la aptitud (inicial)
     HacCompetencias.effective(hid, mid, aptitud)  → Set de dominios (inicial ∪ otorgados)
     HacCompetencias.has(hid, mid, aptitud, dom)   → bool
     HacCompetencias.granted(hid, mid)             → dominios otorgados (solo extra)
     await HacCompetencias.grant(hid, mid, dom) / revoke(hid, mid, dom)   (admin)
   ═══════════════════════════════════════════════════════════════════════ */
const HacCompetencias = (function () {
  'use strict';
  const TABLE = 'mecenas_competencias';
  const DOMINIOS = ['militar', 'cultural', 'administrativo'];
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
      cache = (data || []).map(r => ({ haciendaId: r.hacienda_id, miembroId: r.miembro_id, dominio: r.dominio }));
      ok = true;
    } catch (e) {
      console.warn('[HacCompetencias] tabla no disponible (¿falta competencias.sql?):', e && e.message || e);
      cache = []; ok = false;
    }
    return cache;
  }
  function ready() { return readyPromise || (readyPromise = load()); }
  function reload() { readyPromise = load(); return readyPromise; }

  function def(dom) { return (window.HacPersonajeDefs && HacPersonajeDefs.dominio) ? HacPersonajeDefs.dominio(dom) : null; }
  function initialFor(aptitud) {
    const a = (window.HacPersonajeDefs && HacPersonajeDefs.aptitud) ? HacPersonajeDefs.aptitud(aptitud) : null;
    return (a && a.dominios) ? a.dominios.slice() : [];
  }
  function granted(hid, mid) { return cache.filter(c => c.haciendaId === hid && c.miembroId === mid).map(c => c.dominio); }
  function effective(hid, mid, aptitud) {
    const s = new Set(initialFor(aptitud));
    granted(hid, mid).forEach(d => s.add(d));
    return s;
  }
  function has(hid, mid, aptitud, dom) { return effective(hid, mid, aptitud).has(dom); }
  function isInitial(aptitud, dom) { return initialFor(aptitud).indexOf(dom) >= 0; }

  async function grant(hid, mid, dom) {
    if (cache.some(c => c.haciendaId === hid && c.miembroId === mid && c.dominio === dom)) return;
    cache.push({ haciendaId: hid, miembroId: mid, dominio: dom });   // optimista
    try { const client = await sb(); const { error } = await client.from(TABLE).upsert({ hacienda_id: hid, miembro_id: mid, dominio: dom }); if (error) throw error; }
    catch (e) { console.error('[HacCompetencias] grant', e); }
  }
  async function revoke(hid, mid, dom) {
    cache = cache.filter(c => !(c.haciendaId === hid && c.miembroId === mid && c.dominio === dom));   // optimista
    try { const client = await sb(); const { error } = await client.from(TABLE).delete().eq('hacienda_id', hid).eq('miembro_id', mid).eq('dominio', dom); if (error) throw error; }
    catch (e) { console.error('[HacCompetencias] revoke', e); }
  }

  return { ready, reload, DOMINIOS, def, initialFor, effective, has, granted, isInitial, grant, revoke, dbOk: () => ok, TABLE };
})();
if (typeof window !== 'undefined') window.HacCompetencias = HacCompetencias;
