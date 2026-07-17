/* ═══════════════════════════════════════════════════════════════════════
   hac-enviados.js — ENVIADO de una hacienda NPC a tu finca (Supabase).
   ─────────────────────────────────────────────────────────────────────────
   Una hacienda de NPC (Chengdu 成都 · Shu 蜀, etc.) manda un enviado que
   espera FUERA del portón sur (estado 'esperando'), saludando a quien pasa.
   El FUNDADOR puede invitarlo a pasar ('visita' → pasea con él). Estado
   COMPARTIDO: todos los que abren la hacienda ven lo mismo (tabla `enviados`).

   El enviado es un PERSONAJE del registro global (HacPersonajes) → de ahí
   salen nombre, 字 cortesía, aptitud, stats y equipo. Este store solo lleva
   el vínculo hacienda→personaje + estado de la visita.

   Descriptor de cliente (lo consume HacFolk.setEnviado):
     { id, estado, invitadoPor, faccionId?, name?, cortesia?, aptitud?, aspecto? }
   `id` = personajeId del enviado (= id de walker). Los campos name/cortesia/…
   son OPCIONALES: solo se usan como fallback de un SEED de desarrollo cuando
   no hay personaje registrado (sin Supabase); con DB los resuelve HacPersonajes.

   Si la tabla `enviados` no existe aún, degrada a caché vacía y dbOk()=false
   (se puede seguir probando con HacEnviados.seed(...) en local).
   ═══════════════════════════════════════════════════════════════════════ */
const HacEnviados = (function () {
  'use strict';
  const TABLE = 'enviados';

  // Caché por hacienda: haciendaId → descriptor activo (o null si no hay).
  let cache = {};
  let seedMap = {};             // seeds de desarrollo (client-only), por hacienda
  let readyMap = {};            // haciendaId → promise de carga
  let ok = false;

  function rowToDesc(r) {
    if (!r) return null;
    return {
      id: r.personaje_id,
      estado: r.estado || 'esperando',
      invitadoPor: r.invitado_por || null,
      rowId: r.id
    };
  }

  async function sb() {
    if (typeof Auth === 'undefined') throw new Error('Auth no está cargado');
    await Auth.ready();
    const client = Auth.client();
    if (!client) throw new Error('Supabase no disponible');
    return client;
  }

  async function load(haciendaId) {
    try {
      const client = await sb();
      const { data, error } = await client.from(TABLE)
        .select('*')
        .eq('hacienda_id', haciendaId)
        .neq('estado', 'concluido')
        .limit(1);
      if (error) throw error;
      ok = true;
      cache[haciendaId] = (data && data[0]) ? rowToDesc(data[0]) : null;
    } catch (e) {
      console.warn('[HacEnviados] tabla no disponible (¿falta enviados.sql?):', e && e.message || e);
      ok = false;
      // Degradación: si hay un seed local para esta hacienda, úsalo.
      cache[haciendaId] = seedMap[haciendaId] || null;
    }
    return cache[haciendaId];
  }

  // Carga (memoizada) el enviado activo de una hacienda. Reload fuerza recarga.
  function ready(haciendaId) { return readyMap[haciendaId] || (readyMap[haciendaId] = load(haciendaId)); }
  function reload(haciendaId) { readyMap[haciendaId] = load(haciendaId); return readyMap[haciendaId]; }

  function activo(haciendaId) {
    if (haciendaId in cache) return cache[haciendaId];
    return seedMap[haciendaId] || null;
  }
  function dbOk() { return ok; }

  // SEED de desarrollo (client-only): fuerza un enviado en una hacienda sin
  // depender de Supabase — para iterar el look/feel. name/cortesia/aptitud/
  // aspecto/faccionId alimentan el fallback del walker si no hay personaje.
  function seed(haciendaId, desc) {
    if (!desc) { delete seedMap[haciendaId]; if (!ok) delete cache[haciendaId]; return; }
    seedMap[haciendaId] = Object.assign({ estado: 'esperando', invitadoPor: null }, desc);
    if (!ok || !(haciendaId in cache) || !cache[haciendaId]) cache[haciendaId] = seedMap[haciendaId];
  }

  // El FUNDADOR invita a pasar al enviado (esperando → visita). p_pj = su personajeId.
  async function invitar(haciendaId, pj) {
    const client = await sb();
    const { data, error } = await client.rpc('enviado_invitar', { p_hac: haciendaId, p_pj: pj });
    if (error) { console.error('[HacEnviados] invitar', error); throw error; }
    const desc = rowToDesc(data);
    cache[haciendaId] = desc;
    return desc;
  }

  // El FUNDADOR despide al enviado (→ concluido). Devuelve null (ya no activo).
  async function concluir(haciendaId, pj) {
    const client = await sb();
    const { error } = await client.rpc('enviado_concluir', { p_hac: haciendaId, p_pj: pj });
    if (error) { console.error('[HacEnviados] concluir', error); throw error; }
    cache[haciendaId] = null;
    return null;
  }

  return { ready, reload, activo, dbOk, seed, invitar, concluir, TABLE };
})();

if (typeof window !== 'undefined') window.HacEnviados = HacEnviados;
