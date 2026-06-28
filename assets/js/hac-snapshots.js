/* ═══════════════════════════════════════════════════════════════════════
   hac-snapshots.js — Snapshots de la vida de una finca (Supabase).
   ─────────────────────────────────────────────────────────────────────────
   Para que la simulación de mecenas (hac-folk.js) sea CONTINUA (sin saltos) y a
   la vez de carga acotada: en vez de re-arrancar por ventanas, guardamos una
   "foto" del estado (posiciones, temporizadores, cursor del azar…) en `t_snap`.
   Quien entra carga la última foto y solo simula desde ahí hasta ahora.

   1 fila por hacienda (upsert). Lectura pública (compartido); escritura de
   cualquier autenticado (modelo de CONFIANZA, opción a). Ver supabase/finca_snapshots.sql.

   API:
     await HacSnap.load(haciendaId)        → { tSnap, estado } | null
     await HacSnap.save(haciendaId, tSnap, estado)
   ═══════════════════════════════════════════════════════════════════════ */
const HacSnap = (function () {
  'use strict';
  const TABLE = 'finca_snapshots';

  async function sb() {
    if (typeof Auth === 'undefined') throw new Error('Auth no está cargado');
    await Auth.ready();
    const client = Auth.client();
    if (!client) throw new Error('Supabase no disponible');
    return client;
  }

  async function load(hid) {
    try {
      const client = await sb();
      const { data, error } = await client.from(TABLE)
        .select('t_snap, estado').eq('hacienda_id', hid).maybeSingle();
      if (error) throw error;
      return data ? { tSnap: Number(data.t_snap), estado: data.estado } : null;
    } catch (e) {
      console.warn('[HacSnap] load (¿falta finca_snapshots.sql?):', e && e.message || e);
      return null;
    }
  }

  async function save(hid, tSnap, estado) {
    try {
      const client = await sb();
      const { error } = await client.from(TABLE).upsert({
        hacienda_id: hid, t_snap: Math.round(tSnap), estado, updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    } catch (e) {
      console.warn('[HacSnap] save:', e && e.message || e);
    }
  }

  return { load, save, TABLE };
})();
if (typeof window !== 'undefined') window.HacSnap = HacSnap;
