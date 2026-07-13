/* ═══════════════════════════════════════════════════════════════════════
   hac-retos.js — Retos SEMANALES del jugador (Supabase, individual).
   ─────────────────────────────────────────────────────────────────────────
   4 metas por semana: ganar prestigio, completar misiones del tablón, completar
   escaramuzas y superar encuentros. Al cumplirlas TODAS, el señor de la casa
   convoca al mecenas (ceremonia + «Recompensa semanal»). Clave por SEMANA ISO:
   al cambiar de semana empieza a cero. `estado`: curso → convocado → reclamado.

   Patrón Auth/caché como HacMisTomadas. Ver supabase/retos_semanales.sql.

   API:
     await HacRetos.ready()                 · reload()
     HacRetos.METAS                         → { prestigio, misiones, escaramuzas, encuentros }
     HacRetos.semanaStr()                   → 'AAAA-Wnn' (semana ISO, hora de servidor)
     HacRetos.progreso(hid)                 → { prestigio, misiones, escaramuzas, encuentros, estado }
     HacRetos.completos(hid)                → bool (las 4 metas cumplidas)
     await HacRetos.add(hid, campo, n)      → incrementa un contador (optimista + persiste)
     await HacRetos.marcar(hid, estado)     → 'convocado' | 'reclamado'
   ═══════════════════════════════════════════════════════════════════════ */
const HacRetos = (function () {
  'use strict';
  const TABLE = 'retos_semanales';
  const CAMPOS = ['prestigio', 'misiones', 'escaramuzas', 'encuentros'];
  // Metas por defecto (ajustables). Se cumplen los retos al llegar a TODAS.
  const METAS = Object.freeze({ prestigio: 250, misiones: 6, escaramuzas: 2, encuentros: 4 });
  let cache = [], readyPromise = null, ok = false;

  // Semana ISO 'AAAA-Wnn' en hora de servidor (coherente entre sesiones del jugador).
  function semanaStr() {
    const t = (window.HacClock && HacClock.now) ? HacClock.now() : Date.now();
    const d = new Date(t);
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = (date.getUTCDay() + 6) % 7;             // Lun=0 … Dom=6
    date.setUTCDate(date.getUTCDate() - dayNum + 3);        // jueves de esta semana ISO
    const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
    const ft = (firstThursday.getUTCDay() + 6) % 7;
    const week = 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ft) / 7);
    return date.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
  }

  async function sb() {
    if (typeof Auth === 'undefined') throw new Error('Auth no está cargado');
    await Auth.ready();
    const client = Auth.client();
    if (!client) throw new Error('Supabase no disponible');
    return client;
  }

  function rowToObj(r) {
    return {
      haciendaId: r.hacienda_id, semana: r.semana,
      prestigio: Number(r.prestigio) || 0, misiones: Number(r.misiones) || 0,
      escaramuzas: Number(r.escaramuzas) || 0, encuentros: Number(r.encuentros) || 0,
      estado: r.estado || 'curso',
    };
  }

  async function load() {
    try {
      const client = await sb();
      const { data, error } = await client.from(TABLE).select('*');
      if (error) throw error;
      cache = (data || []).map(rowToObj); ok = true;
    } catch (e) {
      console.warn('[HacRetos] tabla no disponible (¿falta retos_semanales.sql?):', e && e.message || e);
      cache = []; ok = false;
    }
    return cache;
  }
  function ready() { return readyPromise || (readyPromise = load()); }
  function reload() { readyPromise = load(); return readyPromise; }

  // Fila de ESTA semana (o ceros si aún no hay). No muta la caché.
  function progreso(hid) {
    const s = semanaStr();
    const r = cache.find(x => x.haciendaId === hid && x.semana === s);
    return r || { haciendaId: hid, semana: s, prestigio: 0, misiones: 0, escaramuzas: 0, encuentros: 0, estado: 'curso' };
  }
  function completos(hid) { const p = progreso(hid); return CAMPOS.every(c => (p[c] || 0) >= METAS[c]); }
  function dbOk() { return ok; }

  // Fila mutable de la caché para esta semana (la crea si no existe).
  function ensureRow(hid) {
    const s = semanaStr();
    let r = cache.find(x => x.haciendaId === hid && x.semana === s);
    if (!r) { r = { haciendaId: hid, semana: s, prestigio: 0, misiones: 0, escaramuzas: 0, encuentros: 0, estado: 'curso' }; cache.push(r); }
    return r;
  }

  async function persist(hid) {
    const r = ensureRow(hid);
    try {
      const client = await sb();
      const uid = (window.Auth && Auth.current() && Auth.current().id) || null;
      const { error } = await client.from(TABLE).upsert({
        user_id: uid, hacienda_id: hid, semana: r.semana,
        prestigio: r.prestigio, misiones: r.misiones, escaramuzas: r.escaramuzas, encuentros: r.encuentros,
        estado: r.estado, updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    } catch (e) { console.warn('[HacRetos] persist:', e && e.message || e); }
  }

  // Incrementa un contador (no pasa de la meta, para no inflar la cifra). Optimista.
  async function add(hid, campo, n) {
    if (CAMPOS.indexOf(campo) < 0 || !(n > 0)) return;
    const r = ensureRow(hid);
    if ((r[campo] || 0) >= METAS[campo]) return;                       // ya cumplido: no re-escribas
    r[campo] = Math.min(METAS[campo], (r[campo] || 0) + n);            // tope en la meta
    await persist(hid);
  }

  async function marcar(hid, estado) {
    const r = ensureRow(hid);
    if (r.estado === estado) return;
    r.estado = estado;
    await persist(hid);
  }

  return { ready, reload, progreso, completos, add, marcar, semanaStr, METAS, CAMPOS, dbOk, TABLE };
})();
if (typeof window !== 'undefined') window.HacRetos = HacRetos;
