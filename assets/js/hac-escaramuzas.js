/* ═══════════════════════════════════════════════════════════════════════
   hac-escaramuzas.js — Expediciones COOPERATIVAS (bandas de 2-4 jugadores).
   ─────────────────────────────────────────────────────────────────────────
   Un jugador MONTA una banda (paga), otros se UNEN, el host la LANZA (30 min).
   Caché + lectura/recarga (poll), igual que HacStats/HacOrdenes. Si falta la
   tabla, degrada (caché vacía) sin romper la página. Tabla: escaramuzas.sql.

   Modelo: { id, haciendaId, hostId, hostNombre, plazas, dificultad, estado,
             miembros:[{id,nombre}], coste, inicioMs, finMs, exito,
             botin:[itemId], elecciones:{pjId:itemId}, lootHasta }
     estado ∈ abierta | en_curso | botin | resuelta
   ═══════════════════════════════════════════════════════════════════════ */
const HacEscaramuzas = (function () {
  'use strict';
  const TABLE = 'escaramuzas';
  const DUR_MS = 30 * 60 * 1000;     // 30 min fuera
  const CD_MS = 60 * 60 * 1000;      // cooldown 1 h (uso futuro)
  let cache = [], ok = false, readyPromise = null;

  async function sb() {
    if (typeof Auth === 'undefined') throw new Error('Auth no está cargado');
    await Auth.ready();
    const c = Auth.client();
    if (!c) throw new Error('Supabase no disponible');
    return c;
  }
  const arr = (v) => { try { return Array.isArray(v) ? v : (v ? JSON.parse(v) : []); } catch (e) { return []; } };
  const obj = (v) => { try { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : (v ? JSON.parse(v) : {}); } catch (e) { return {}; } };
  function rowToObj(r) {
    return {
      id: r.id, haciendaId: r.hacienda_id, hostId: r.host_id, hostNombre: r.host_nombre || '',
      plazas: Number(r.plazas) || 3, dificultad: Number(r.dificultad) || 4, estado: r.estado || 'abierta',
      miembros: arr(r.miembros), coste: Number(r.coste) || 0,
      inicioMs: Number(r.inicio_ms) || 0, finMs: Number(r.fin_ms) || 0, exito: r.exito,
      botin: arr(r.botin), elecciones: obj(r.elecciones), lootHasta: Number(r.loot_hasta) || 0,
      doctrina: r.doctrina || '', sucesos: obj(r.sucesos), relacionesHechas: !!r.relaciones_hechas,
      escenario: r.escenario || '',
      reservaciones: obj(r.reservaciones), resultados: obj(r.resultados), cdHecho: !!r.cd_hecho,
    };
  }
  async function load() {
    try {
      const c = await sb();
      const { data, error } = await c.from(TABLE).select('*');
      if (error) throw error;
      cache = (data || []).map(rowToObj); ok = true;
    } catch (e) {
      console.warn('[HacEscaramuzas] tabla no disponible (¿falta escaramuzas.sql?):', e && e.message || e);
      cache = []; ok = false;
    }
    return cache;
  }
  function ready() { return readyPromise || (readyPromise = load()); }
  function reload() { readyPromise = load(); return readyPromise; }

  const all = (hacId) => cache.filter(b => b.haciendaId === hacId);
  const abiertas = (hacId) => all(hacId).filter(b => b.estado === 'abierta');
  // Banda en la que participa el jugador (en cualquier estado), o null.
  function miBanda(hacId, pjId) { return all(hacId).find(b => (b.miembros || []).some(m => m.id === pjId)) || null; }

  // Refleja en caché la fila devuelta por una RPC (insert/update).
  function upsertCache(rowData) {
    if (!rowData) return null;
    const o = rowToObj(rowData);
    const i = cache.findIndex(x => x.id === o.id);
    if (i >= 0) cache[i] = o; else cache.push(o);
    return o;
  }
  // Todas las mutaciones van por funciones SECURITY DEFINER (atómicas en BD).
  async function crear({ haciendaId, hostId, hostNombre, plazas, dificultad, coste, escenario }) {
    const c = await sb();
    const base = { p_hac: haciendaId, p_host: hostId, p_nombre: hostNombre || '', p_plazas: plazas || 3, p_dif: dificultad || 4, p_coste: coste || 0 };
    let { data, error } = await c.rpc('escaramuza_crear', Object.assign({ p_escenario: escenario || '' }, base));
    // Si aún no se ejecutó escaramuzas_escenarios.sql, la RPC no acepta p_escenario:
    // reintenta con la firma antigua (la banda queda sin escenario → eventos genéricos).
    if (error && /escenario|schema cache|does not exist|function|argument/i.test(error.message || '')) {
      ({ data, error } = await c.rpc('escaramuza_crear', base));
    }
    if (error) throw new Error(error.message || 'No se pudo montar la banda');
    return upsertCache(data);
  }
  async function unir(id, miembro) {
    const c = await sb();
    const { data, error } = await c.rpc('escaramuza_unir', { p_id: id, p_pj: miembro.id, p_nombre: miembro.nombre || '' });
    if (error) throw new Error(error.message || 'No se pudo unir');
    return upsertCache(data);
  }
  // Devuelve { disuelta } — la RPC borra la fila si sale el host o queda vacía (data=null).
  async function salir(id, pjId) {
    const c = await sb();
    const { data, error } = await c.rpc('escaramuza_salir', { p_id: id, p_pj: pjId });
    if (error) throw new Error(error.message || 'No se pudo salir');
    if (!data) { cache = cache.filter(x => x.id !== id); return { disuelta: true }; }
    upsertCache(data); return { disuelta: false };
  }
  // El host LANZA: la RPC valida (host, ≥2, abierta) y fija inicio/fin (30 min).
  async function lanzar(id, hostId, nowMs, durMs, doctrina) {
    if (!nowMs) throw new Error('Reloj no disponible');
    const c = await sb();
    const args = { p_id: id, p_host: hostId, p_now: nowMs };
    if (durMs) args.p_dur_ms = durMs;                         // modo test: expedición corta
    if (doctrina) args.p_doctrina = doctrina;                 // A2b: postura del capitán
    const { data, error } = await c.rpc('escaramuza_lanzar', args);
    if (error) throw new Error(error.message || 'No se pudo lanzar');
    return upsertCache(data);
  }
  // A2b-2: el capitán fija en vivo la decisión de un suceso (índice → opción elegida).
  async function suceso(id, hostId, idx, choice) {
    const c = await sb();
    const { data, error } = await c.rpc('escaramuza_suceso', { p_id: id, p_host: hostId, p_idx: idx, p_choice: choice });
    if (error) throw new Error(error.message || 'No se pudo fijar la decisión');
    return upsertCache(data);
  }
  // El host ABORTA la escaramuza en curso: pasa a 'abortando' (vuelta en `durMs`).
  async function abortar(id, hostId, nowMs, durMs) {
    if (!nowMs) throw new Error('Reloj no disponible');
    const c = await sb();
    const args = { p_id: id, p_host: hostId, p_now: nowMs };
    if (durMs) args.p_dur_ms = durMs;
    const { data, error } = await c.rpc('escaramuza_abortar', args);
    if (error) throw new Error(error.message || 'No se pudo abortar');
    return upsertCache(data);
  }
  // ── ENCUENTROS por participante (rework A-coop) ──────────────────────────────
  // RESERVAR un encuentro (slot 0..plazas-1) antes de lanzar. Exclusivo; re-reservar
  // cambia el tuyo. Todos deben reservar para poder lanzar.
  async function reservar(id, pjId, slot) {
    const c = await sb();
    const { data, error } = await c.rpc('escaramuza_reservar', { p_id: id, p_pj: pjId, p_slot: slot });
    if (error) throw new Error(error.message || 'No se pudo reservar el encuentro');
    return upsertCache(data);
  }
  // RESOLVER MI encuentro (live o al volver, mientras 'en_curso'): ok + opción elegida.
  async function resolverEncuentro(id, pjId, slot, ok, opt) {
    const c = await sb();
    const { data, error } = await c.rpc('escaramuza_resolver_encuentro', { p_id: id, p_pj: pjId, p_slot: slot, p_ok: !!ok, p_opt: opt || 0 });
    if (error) throw new Error(error.message || 'No se pudo resolver el encuentro');
    return upsertCache(data);
  }
  // Al llegar fin_ms: aplica el cooldown a todos (anti-secuestro). Idempotente en BD.
  async function cerrarCd(id, nowMs) {
    if (!nowMs) throw new Error('Reloj no disponible');
    const c = await sb();
    const { data, error } = await c.rpc('escaramuza_cerrar_cd', { p_id: id, p_now: nowMs });
    if (error) throw new Error(error.message || 'No se pudo cerrar el cooldown');
    return upsertCache(data);
  }
  // 4d: reclama un objeto del botín (slot). FCFS atómico; un objeto por jugador.
  async function reclamar(id, pjId, slot) {
    const c = await sb();
    const { data, error } = await c.rpc('escaramuza_reclamar', { p_id: id, p_pj: pjId, p_slot: slot });
    if (error) throw new Error(error.message || 'No se pudo recoger');
    return upsertCache(data);
  }
  // RESUELVE al volver (≥ fin). Idempotente en BD: solo el primer cliente surte
  // efecto. Aplica dinero/heridas/cooldown a todos y deja la banda en 'botin'/'resuelta'.
  async function resolver(id, nowMs, exito, botin, share, hostBonus, lootMs, bonos, heridas) {
    const c = await sb();
    const args = { p_id: id, p_now: nowMs, p_exito: !!exito, p_botin: botin || [], p_share: share || 0, p_host_bonus: hostBonus || 0 };
    if (lootMs) args.p_loot_ms = lootMs;
    if (bonos) args.p_bonos = bonos;
    if (heridas != null) args.p_heridas = heridas;   // 虎將: 0 heridas al fracasar
    const { data, error } = await c.rpc('escaramuza_resolver', args);
    if (error) throw new Error(error.message || 'No se pudo resolver');
    return upsertCache(data);
  }

  // ── PEREGRINAJE «En busca del legendario curandero» (escenario especial) ──
  // Reutiliza la misma tabla/fila (crear/unir/salir/abortar), pero LANZAR admite
  // ir solo y dura 1 h, y RESOLVER cura heridas (o deja secuela). Ver peregrinaje.sql.
  async function lanzarPeregrinaje(id, hostId, nowMs, durMs) {
    if (!nowMs) throw new Error('Reloj no disponible');
    const c = await sb();
    const args = { p_id: id, p_host: hostId, p_now: nowMs };
    if (durMs) args.p_dur_ms = durMs;                         // 1 h (o ~1 min en modo test)
    const { data, error } = await c.rpc('peregrinaje_lanzar', args);
    if (error) throw new Error(error.message || 'No se pudo partir');
    return upsertCache(data);
  }
  // Resuelve al volver. Idempotente en BD. El cliente tira el dado: éxito/curadas
  // (1..3), secuela a añadir al fracasar y qué escoltas vuelven heridos.
  async function resolverPeregrinaje(id, nowMs, exito, curadas, perm, escoltas) {
    const c = await sb();
    const args = { p_id: id, p_now: nowMs, p_exito: !!exito, p_curadas: curadas || 0, p_perm: perm || '', p_escoltas: escoltas || [] };
    const { data, error } = await c.rpc('peregrinaje_resolver', args);
    if (error) throw new Error(error.message || 'No se pudo resolver el peregrinaje');
    return upsertCache(data);
  }

  return { ready, reload, all, abiertas, miBanda, crear, unir, salir, lanzar, suceso, resolver, reclamar, abortar, reservar, resolverEncuentro, cerrarCd, lanzarPeregrinaje, resolverPeregrinaje, DUR_MS, CD_MS, dbOk: () => ok, TABLE };
})();
if (typeof window !== 'undefined') window.HacEscaramuzas = HacEscaramuzas;
