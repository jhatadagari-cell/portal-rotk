/* ═══════════════════════════════════════════════════════════════════════
   hac-solicitudes.js — Solicitudes de ingreso a una hacienda (Supabase).
   ─────────────────────────────────────────────────────────────────────────
   El jugador solicita entrar en UNA hacienda con su personaje. El admin la
   aprueba (y añade el mecenas a la hacienda) o la rechaza. RLS: el jugador solo
   ve/crea/cancela las suyas; el admin ve todas y decide. Tabla: solicitudes.sql.

   Modelo cliente: { id, userId, personajeId, haciendaId, estado, nota, createdAt, decidedAt }
     estado ∈ pendiente | aprobada | rechazada
   ═══════════════════════════════════════════════════════════════════════ */
const HacSolicitudes = (function () {
  'use strict';
  const TABLE = 'solicitudes';

  async function sb() {
    if (typeof Auth === 'undefined') throw new Error('Auth no está cargado');
    await Auth.ready();
    const c = Auth.client();
    if (!c) throw new Error('Supabase no disponible');
    return c;
  }
  function rowToObj(r) {
    return {
      id: r.id, userId: r.user_id, personajeId: r.personaje_id, haciendaId: r.hacienda_id,
      estado: r.estado || 'pendiente', nota: r.nota || '', createdAt: r.created_at, decidedAt: r.decided_at
    };
  }

  // Mi solicitud ACTIVA (no rechazada), o null. El índice único garantiza ≤1.
  async function mine() {
    try {
      const c = await sb();
      const { data, error } = await c.from(TABLE).select('*')
        .neq('estado', 'rechazada').order('created_at', { ascending: false }).limit(1);
      if (error) throw error;
      return (data && data[0]) ? rowToObj(data[0]) : null;
    } catch (e) { console.warn('[HacSolicitudes] mine (¿falta solicitudes.sql?):', e && e.message || e); return null; }
  }

  // Crea una solicitud pendiente. user_id lo pone el DEFAULT (auth.uid()) en BD.
  async function crear({ personajeId, haciendaId }) {
    const c = await sb();
    const user = Auth.current();
    const row = { user_id: user && user.id, personaje_id: personajeId, hacienda_id: haciendaId, estado: 'pendiente' };
    const { data, error } = await c.from(TABLE).insert(row).select().single();
    if (error) throw error;
    return rowToObj(data);
  }

  // El jugador cancela su solicitud (solo mientras esté pendiente).
  async function cancelar(id) {
    const c = await sb();
    const { error } = await c.from(TABLE).delete().eq('id', id);
    if (error) throw error;
  }

  // ── Admin (Fase 4) ────────────────────────────────────────────────────────
  async function pendientes() {
    const c = await sb();
    const { data, error } = await c.from(TABLE).select('*')
      .eq('estado', 'pendiente').order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(rowToObj);
  }
  async function decidir(id, estado, fechaIso) {
    const c = await sb();
    const { error } = await c.from(TABLE).update({ estado, decided_at: fechaIso || null }).eq('id', id);
    if (error) throw error;
  }
  // ADMIN: borra la(s) solicitud(es) de un personaje (al expulsarlo de la hacienda),
  // para que su pertenencia no quede 'aprobada' fantasma. RLS admin permite el delete.
  async function borrarDePersonaje(personajeId) {
    if (!personajeId) return;
    const c = await sb();
    const { error } = await c.from(TABLE).delete().eq('personaje_id', personajeId);
    if (error) throw error;
  }

  return { mine, crear, cancelar, pendientes, decidir, borrarDePersonaje, TABLE };
})();

if (typeof window !== 'undefined') window.HacSolicitudes = HacSolicitudes;
