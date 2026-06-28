/* ═══════════════════════════════════════════════════════════════════════
   hac-clock.js — Reloj compartido (hora de servidor).
   ─────────────────────────────────────────────────────────────────────────
   La simulación de la finca debe ser IGUAL para todos. Si cada cliente usa su
   propio reloj (a veces desajustado varios segundos), las fincas se desfasan.
   Aquí pedimos la hora al servidor de Supabase UNA vez y calculamos el desfase
   con el reloj local; a partir de ahí `now()` devuelve una hora sincronizada sin
   más peticiones. Estrategia, de más a menos precisa:
     1. RPC `server_now()` → epoch en ms (limpia con CORS; ver supabase/server_now.sql).
     2. Cabecera `Date` de una respuesta HTTP (resolución ~1 s; puede estar oculta
        por CORS, en cuyo caso se ignora).
     3. Reloj local del navegador (offset 0): los clientes NTP-sincronizados
        coinciden al sub-segundo igualmente.
   En todos los casos estimamos el instante del servidor en mitad del round-trip.

   API:
     await HacClock.ready()   → sincroniza (idempotente); resuelve aunque falle
     HacClock.now()           → ms sincronizados (Date.now()+desfase)
     HacClock.isSynced()      → ¿se logró sincronizar con el servidor?
   ═══════════════════════════════════════════════════════════════════════ */
const HacClock = (function () {
  'use strict';

  let offset = 0;          // serverMs - localMs
  let synced = false;
  let readyP = null;

  function setFromServer(serverMs, t0, t1) {
    if (!isFinite(serverMs)) return false;
    offset = serverMs - (t0 + (t1 - t0) / 2);   // instante del servidor ≈ centro del round-trip
    synced = true;
    return true;
  }

  // 1) RPC server_now(): epoch en ms. Es la fuente preferida (precisa y sin
  //    problemas de CORS, pues viaja en el cuerpo de la respuesta).
  async function viaRpc() {
    try {
      if (typeof Auth === 'undefined' || !Auth.client) return false;
      if (Auth.ready) await Auth.ready();
      const client = Auth.client();
      if (!client || !client.rpc) return false;
      const t0 = Date.now();
      const { data, error } = await client.rpc('server_now');
      const t1 = Date.now();
      if (error || data == null) return false;
      return setFromServer(Number(data), t0, t1);
    } catch (e) { return false; }
  }

  // 2) Cabecera Date de una respuesta HTTP (si CORS la expone).
  async function viaDateHeader() {
    try {
      const url = (window.Auth && Auth.url && Auth.url()) || null;
      if (!url || typeof fetch === 'undefined') return false;
      const t0 = Date.now();
      const res = await fetch(url.replace(/\/+$/, '') + '/auth/v1/health', { method: 'GET', cache: 'no-store' });
      const t1 = Date.now();
      const dateHdr = res.headers.get('date');
      if (!dateHdr) return false;
      return setFromServer(new Date(dateHdr).getTime(), t0, t1);
    } catch (e) { return false; }
  }

  async function sync() {
    if (await viaRpc()) return;
    if (await viaDateHeader()) return;
    /* Reloj local (offset 0): los clientes sincronizados coinciden igualmente. */
  }

  function ready() { if (!readyP) readyP = sync(); return readyP; }
  function now() { return Date.now() + offset; }

  return { ready, now, isSynced: () => synced, offsetMs: () => offset };
})();
if (typeof window !== 'undefined') window.HacClock = HacClock;
