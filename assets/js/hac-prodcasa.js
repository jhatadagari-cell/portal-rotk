/* ═══════════════════════════════════════════════════════════════════════
   hac-prodcasa.js — TESORERÍA + ALMACÉN de CASA (cliente). Hilo 2.
   ─────────────────────────────────────────────────────────────────────────
   Espejo en cliente de la tabla `produccion_casa` (supabase/produccion_casa.sql):
   el diezmo de los miembros llena la tesorería (monedas) y el almacén de casa
   (materia prima en bruto); el fundador los gasta para construir.

   Caché por haciendaId + wrappers de las RPC SECURITY DEFINER. Si falta la tabla,
   degrada (todo a cero) sin romper la página, igual que HacDebates/HacEscaramuzas.

   Modelo: { haciendaId, almacen:{hierro,tinta,grano}, tesoreria, aportes:{pj:{...}} }
     aportes[pj] = { nombre, hierro, tinta, grano, dinero, dia }  (crédito + último diezmo)
   ═══════════════════════════════════════════════════════════════════════ */
const HacProdCasa = (function () {
  'use strict';
  const TABLE = 'produccion_casa';
  const RECS = ['hierro', 'tinta', 'grano'];
  let cache = {}, ok = false, readyPromise = null;   // cache por haciendaId

  async function sb() {
    if (typeof Auth === 'undefined') throw new Error('Auth no está cargado');
    await Auth.ready();
    const c = Auth.client();
    if (!c) throw new Error('Supabase no disponible');
    return c;
  }
  const int = (v) => Math.max(0, Math.floor(Number(v) || 0));
  function rowToObj(r) {
    const a = (r.almacen && typeof r.almacen === 'object') ? r.almacen : {};
    return {
      haciendaId: r.hacienda_id,
      almacen: { hierro: int(a.hierro), tinta: int(a.tinta), grano: int(a.grano) },
      tesoreria: int(r.tesoreria),
      aportes: (r.aportes && typeof r.aportes === 'object') ? r.aportes : {},
    };
  }
  async function load() {
    try {
      const c = await sb();
      const { data, error } = await c.from(TABLE).select('*');
      if (error) throw error;
      cache = {}; (data || []).forEach(r => { const o = rowToObj(r); cache[o.haciendaId] = o; }); ok = true;
    } catch (e) {
      console.warn('[HacProdCasa] tabla no disponible (¿falta produccion_casa.sql?):', e && e.message || e);
      cache = {}; ok = false;
    }
    return cache;
  }
  function ready() { return readyPromise || (readyPromise = load()); }
  function reload() { readyPromise = load(); return readyPromise; }
  function dbOk() { return ok; }

  const row = (hacId) => cache[hacId] || { haciendaId: hacId, almacen: { hierro: 0, tinta: 0, grano: 0 }, tesoreria: 0, aportes: {} };
  const almacen = (hacId) => row(hacId).almacen;
  const tesoreria = (hacId) => row(hacId).tesoreria;
  const aporteDe = (hacId, pj) => row(hacId).aportes[pj] || {};
  // ¿Ese miembro ya pagó el diezmo HOY? (para el bufo "al día con pagos" / debufo).
  const pagadoHoy = (hacId, pj, dia) => { const a = row(hacId).aportes[pj]; return !!(a && a.dia && a.dia === dia); };

  function upsertCache(rowData) { if (!rowData) return null; const o = rowToObj(rowData); cache[o.haciendaId] = o; return o; }

  // Pagar el diezmo (o aportar): monedas → tesorería, materiales → almacén. El
  // cliente ya ha descontado de la Casa de Mecenas al confirmar (optimista: solo
  // descuenta si la RPC va bien). dia = HacProd.diaStr() sella el "al día".
  async function diezmo({ haciendaId, pj, pjNombre, dinero, lote, dia }) {
    const c = await sb();
    const { data, error } = await c.rpc('casa_diezmo', {
      p_hac: haciendaId, p_pj: pj, p_pj_nombre: pjNombre || '',
      p_dinero: int(dinero), p_lote: lote || {}, p_dia: dia || '',
    });
    if (error) throw new Error(error.message || 'No se pudo pagar el diezmo');
    return upsertCache(data);
  }
  // El FUNDADOR levanta un edificio (gasta tesorería + materiales, anexa al mapa).
  // Devuelve { mapa, almacen, tesoreria }. Actualiza la caché de almacén/tesorería.
  async function construir({ haciendaId, pj, tipo, pos, rot, dueno, mat, dinero }) {
    const c = await sb();
    const { data, error } = await c.rpc('casa_construir', {
      p_hac: haciendaId, p_pj: pj, p_tipo: tipo, p_pos: pos, p_rot: int(rot),
      p_dueno: dueno || null, p_mat: mat || {}, p_dinero: int(dinero),
    });
    if (error) throw new Error(error.message || 'No se pudo construir');
    if (data && data.almacen) {
      const o = row(haciendaId);
      cache[haciendaId] = { haciendaId, almacen: { hierro: int(data.almacen.hierro), tinta: int(data.almacen.tinta), grano: int(data.almacen.grano) }, tesoreria: int(data.tesoreria), aportes: o.aportes };
    }
    return data;
  }

  return { ready, reload, dbOk, almacen, tesoreria, aporteDe, pagadoHoy, diezmo, construir, RECS, TABLE };
})();
if (typeof window !== 'undefined') window.HacProdCasa = HacProdCasa;
