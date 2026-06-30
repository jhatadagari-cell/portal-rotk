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

  async function crear({ haciendaId, hostId, hostNombre, plazas, dificultad, coste }) {
    await load();                                          // refresca antes de comprobar
    if (miBanda(haciendaId, hostId)) throw new Error('Ya estás en una banda');
    const c = await sb();
    const row = {
      hacienda_id: haciendaId, host_id: hostId, host_nombre: hostNombre || '',
      plazas: Math.max(2, Math.min(4, plazas || 3)), dificultad: dificultad || 4, estado: 'abierta',
      miembros: [{ id: hostId, nombre: hostNombre || '' }], coste: coste || 0,
    };
    const { data, error } = await c.from(TABLE).insert(row).select().single();
    if (error) throw error;
    const o = rowToObj(data); cache.push(o); return o;
  }
  async function unir(id, miembro) {
    await load();                                         // refresca para reducir la carrera
    const b = cache.find(x => x.id === id);
    if (!b) throw new Error('La banda ya no existe');
    if (b.estado !== 'abierta') throw new Error('La banda ya ha partido');
    if (b.miembros.some(m => m.id === miembro.id)) return b;
    const otra = miBanda(b.haciendaId, miembro.id);
    if (otra && otra.id !== id) throw new Error('Ya estás en otra banda');
    if (b.miembros.length >= b.plazas) throw new Error('La banda está llena');
    const miembros = b.miembros.concat([{ id: miembro.id, nombre: miembro.nombre || '' }]);
    const c = await sb();
    const { error } = await c.from(TABLE).update({ miembros }).eq('id', id);
    if (error) throw error;
    b.miembros = miembros; return b;
  }
  // Sale de la banda. Si sale el HOST o queda vacía, se disuelve (delete).
  async function salir(id, pjId) {
    await load();                                         // refresca para reducir la carrera
    const b = cache.find(x => x.id === id); if (!b) return { disuelta: true };
    const c = await sb();
    const rest = b.miembros.filter(m => m.id !== pjId);
    if (pjId === b.hostId || rest.length === 0) {
      const { error } = await c.from(TABLE).delete().eq('id', id);
      if (error) throw error;
      cache = cache.filter(x => x.id !== id);
      return { disuelta: true };
    }
    const { error } = await c.from(TABLE).update({ miembros: rest }).eq('id', id);
    if (error) throw error;
    b.miembros = rest; return { disuelta: false };
  }
  // El host LANZA la banda: pasa a 'en_curso' 30 min (nowMs lo pasa quien llama,
  // idealmente del reloj de servidor).
  async function lanzar(id, nowMs) {
    if (!nowMs) throw new Error('Reloj no disponible');   // evita inicio/fin en epoch 0
    const b = cache.find(x => x.id === id); if (!b) throw new Error('La banda ya no existe');
    const inicio = nowMs || 0, fin = inicio + DUR_MS;
    const c = await sb();
    const { error } = await c.from(TABLE).update({ estado: 'en_curso', inicio_ms: inicio, fin_ms: fin }).eq('id', id);
    if (error) throw error;
    b.estado = 'en_curso'; b.inicioMs = inicio; b.finMs = fin; return b;
  }

  return { ready, reload, all, abiertas, miBanda, crear, unir, salir, lanzar, DUR_MS, CD_MS, dbOk: () => ok, TABLE };
})();
if (typeof window !== 'undefined') window.HacEscaramuzas = HacEscaramuzas;
