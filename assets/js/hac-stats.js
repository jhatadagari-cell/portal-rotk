/* ═══════════════════════════════════════════════════════════════════════
   hac-stats.js — Stats personales del mecenas: dinero + XP por dominio (Supabase).
   ─────────────────────────────────────────────────────────────────────────
   "Poder personal" del personaje (distinto del cargo/prestigio que aporta a la
   casa, que vive en HacPuntos). Aquí está lo SUYO: el dinero del monedero y la
   experiencia por dominio 武/文/政. El NIVEL de cada dominio se DERIVA del XP.

   Sube al COMPLETAR misiones/expediciones del dominio correspondiente. Patrón
   Auth/caché como HacPuntos/HacEnergia; escritura solo del dueño (RLS). Degrada
   limpio si falta la tabla (todo a 0).

   Clave `miembroId` = id del PERSONAJE (= walker.id). Es PERSONAL, no por hacienda.

   API:
     await HacStats.ready()                 · reload()
     HacStats.dinero(mid)                   → monedas que lleva encima (0 si no hay)
     HacStats.xp(mid, dom)                  → XP del dominio ('militar'|'cultural'|'administrativo')
     HacStats.nivel(mid, dom)               → nivel derivado del XP (1..)
     HacStats.progresoNivel(mid, dom)       → {nivel, falta, pct} hacia el siguiente
     await HacStats.award(mid, {dinero, xp:{dom:n}})  → suma y persiste
     HacStats.recompensaExped(dom, durSeg)  → {dinero, xp, dom} que daría una expedición
   ═══════════════════════════════════════════════════════════════════════ */
const HacStats = (function () {
  'use strict';
  const TABLE = 'mecenas_stats';
  const DOMS = ['militar', 'cultural', 'administrativo'];
  const COL = { militar: 'xp_militar', cultural: 'xp_cultural', administrativo: 'xp_administrativo' };
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
      miembroId: r.miembro_id, dinero: Number(r.dinero) || 0,
      militar: Number(r.xp_militar) || 0, cultural: Number(r.xp_cultural) || 0,
      administrativo: Number(r.xp_administrativo) || 0,
    };
  }
  async function load() {
    try {
      const client = await sb();
      const { data, error } = await client.from(TABLE).select('*');
      if (error) throw error;
      cache = (data || []).map(rowToObj); ok = true;
    } catch (e) {
      console.warn('[HacStats] tabla no disponible (¿falta mecenas_stats.sql?):', e && e.message || e);
      cache = []; ok = false;
    }
    return cache;
  }
  function ready() { return readyPromise || (readyPromise = load()); }
  function reload() { readyPromise = load(); return readyPromise; }

  function row(mid) { return cache.find(r => r.miembroId === mid) || null; }
  function dinero(mid) { const r = row(mid); return r ? r.dinero : 0; }
  function xp(mid, dom) { const r = row(mid); return r ? (r[dom] || 0) : 0; }

  // Curva de nivel: cada nivel n→n+1 cuesta 50·n XP (acumulado: 25·n·(n-1)).
  // Nivel 1 = 0 XP, 2 = 50, 3 = 150, 4 = 300, 5 = 500…
  const xpAcum = n => 25 * n * (n - 1);
  function nivel(mid, dom) {
    const x = xp(mid, dom); let n = 1;
    while (xpAcum(n + 1) <= x) n++;
    return n;
  }
  function progresoNivel(mid, dom) {
    const x = xp(mid, dom), n = nivel(mid, dom);
    const base = xpAcum(n), next = xpAcum(n + 1), span = next - base;
    return { nivel: n, xp: x, falta: Math.max(0, next - x), pct: span ? Math.min(1, (x - base) / span) : 0 };
  }

  // Recompensa de una expedición (BAJA, tuneable). XP al dominio + dinero.
  function recompensaExped(dom, durSeg) {
    const mins = (durSeg || 120) / 60;
    return { dom: DOMS.indexOf(dom) >= 0 ? dom : null, xp: Math.max(8, Math.round(mins * 12)), dinero: Math.max(5, Math.round(mins * 9)) };
  }

  async function award(mid, gain) {
    if (!mid || !gain) return;
    let r = row(mid);
    if (!r) { r = { miembroId: mid, dinero: 0, militar: 0, cultural: 0, administrativo: 0 }; cache.push(r); }
    if (gain.dinero) r.dinero += gain.dinero;
    if (gain.xp) for (const d of DOMS) if (gain.xp[d]) r[d] += gain.xp[d];
    try {
      const client = await sb();
      const { error } = await client.from(TABLE).upsert({
        miembro_id: mid, dinero: r.dinero, xp_militar: r.militar, xp_cultural: r.cultural,
        xp_administrativo: r.administrativo, actualizado: new Date().toISOString(),
      });
      if (error) throw error;
    } catch (e) { console.error('[HacStats] award', e); }
    return r;
  }

  return { ready, reload, dinero, xp, nivel, progresoNivel, award, recompensaExped, DOMS, dbOk: () => ok, TABLE };
})();
if (typeof window !== 'undefined') window.HacStats = HacStats;
