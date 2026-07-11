/* ═══════════════════════════════════════════════════════════════════════
   hac-debates.js — DEBATES entre dos miembros de una hacienda (tarea social).
   ─────────────────────────────────────────────────────────────────────────
   Un jugador INVITA a otro miembro (tema + jardín). El invitado ACEPTA (o, si es
   un NPC sin dueño jugador, el cliente lo auto-acepta). Al aceptar arranca el
   debate (5 min): ambos mecenas caminan al jardín y debaten. Al terminar, el
   cliente computa el resultado DETERMINISTA (semilla 'debate#'+id) y lo sella con
   resolver. Caché + poll, igual que HacEscaramuzas. Si falta la tabla, degrada
   (caché vacía) sin romper la página. Tabla: supabase/debates.sql.

   Modelo: { id, haciendaId, hostId, hostNombre, invitadoId, invitadoNombre,
             tema, jardinCell, estado, inicioMs, finMs, resultado }
     estado ∈ propuesto | en_curso | rechazado | resuelto | caducado
   ═══════════════════════════════════════════════════════════════════════ */
const HacDebates = (function () {
  'use strict';
  const TABLE = 'debates';
  const DUR_MS = 5 * 60 * 1000;        // 5 min de debate
  const INVITE_TTL_MS = 24 * 60 * 60 * 1000;   // una invitación sin aceptar caduca en 24 h
  const COOLDOWN_MS = 30 * 60 * 1000;  // cooldown por mecenas tras debatir

  // ── Temas del debate (6): puro = 1 dominio, combo = 2. Las ODDS y la XP salen
  //    del/los dominio(s) del tema (武 militar / 文 cultural / 政 administrativo). ──
  const TEMAS = Object.freeze([
    { id: 'guerra',         nombre: 'Guerra',         zh: '兵',   doms: ['militar'] },
    { id: 'letras',         nombre: 'Letras',         zh: '文',   doms: ['cultural'] },
    { id: 'administracion', nombre: 'Administración', zh: '政',   doms: ['administrativo'] },
    { id: 'estrategia',     nombre: 'Estrategia',     zh: '兵略', doms: ['militar', 'cultural'] },
    { id: 'gobierno',       nombre: 'Gobierno',       zh: '治軍', doms: ['militar', 'administrativo'] },
    { id: 'diplomacia',     nombre: 'Diplomacia',     zh: '邦交', doms: ['cultural', 'administrativo'] },
  ]);
  const _temaBy = {}; TEMAS.forEach(t => { _temaBy[t.id] = t; });
  const temaDe = (id) => _temaBy[id] || null;

  // ── Calidad del "libro de conclusiones" que puede salir del debate. rank ordena
  //    la comparación del bono de hacienda (F2); buff = +XP/7d al donar al fundador. ──
  const CALIDADES = Object.freeze({
    'buenas':      { rank: 1, nombre: 'buenas',      xp: 40,  precio: 18, donable: false, buff: 0,    icon: '📓' },
    'muy-buenas':  { rank: 2, nombre: 'muy buenas',  xp: 80,  precio: 40, donable: true,  buff: 0.15, icon: '📔' },
    'reveladoras': { rank: 3, nombre: 'reveladoras', xp: 150, precio: 90, donable: true,  buff: 0.25, icon: '📖' },
  });
  const bookId = (tema, calidad) => 'conclusiones-' + tema + '-' + calidad;

  let cache = [], ok = false, readyPromise = null;

  async function sb() {
    if (typeof Auth === 'undefined') throw new Error('Auth no está cargado');
    await Auth.ready();
    const c = Auth.client();
    if (!c) throw new Error('Supabase no disponible');
    return c;
  }
  const obj = (v) => { try { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : (v ? JSON.parse(v) : {}); } catch (e) { return {}; } };
  function rowToObj(r) {
    return {
      id: r.id, haciendaId: r.hacienda_id,
      hostId: r.host_id, hostNombre: r.host_nombre || '',
      invitadoId: r.invitado_id, invitadoNombre: r.invitado_nombre || '',
      tema: r.tema || '', jardinCell: r.jardin_cell || '',
      estado: r.estado || 'propuesto',
      inicioMs: Number(r.inicio_ms) || 0, finMs: Number(r.fin_ms) || 0,
      resultado: obj(r.resultado),
      createdMs: r.created_at ? Date.parse(r.created_at) : 0,
    };
  }
  async function load() {
    try {
      const c = await sb();
      const { data, error } = await c.from(TABLE).select('*');
      if (error) throw error;
      cache = (data || []).map(rowToObj); ok = true;
    } catch (e) {
      console.warn('[HacDebates] tabla no disponible (¿falta debates.sql?):', e && e.message || e);
      cache = []; ok = false;
    }
    return cache;
  }
  function ready() { return readyPromise || (readyPromise = load()); }
  function reload() { readyPromise = load(); return readyPromise; }
  function dbOk() { return ok; }

  const all = (hacId) => cache.filter(d => d.haciendaId === hacId);
  // Una invitación sigue viva si es 'propuesto' y no ha caducado (>24 h sin aceptar).
  const invitacionViva = (d, nowMs) => d.estado === 'propuesto'
    && !(d.createdMs && nowMs && (nowMs - d.createdMs) > INVITE_TTL_MS);

  // Invitación PENDIENTE que debe atender un jugador (es el invitado y sigue viva).
  function miInvitacionPendiente(hacId, pjId, nowMs) {
    return all(hacId).find(d => invitacionViva(d, nowMs) && d.invitadoId === pjId) || null;
  }
  // Debate EN CURSO en el que participa el jugador (para la coreografía en el sim).
  function miDebate(hacId, pjId) {
    return all(hacId).find(d => d.estado === 'en_curso' && (d.hostId === pjId || d.invitadoId === pjId)) || null;
  }
  // Invitación pendiente creada POR el jugador (para saber si espera respuesta).
  function miInvitacionEnviada(hacId, pjId) {
    return all(hacId).find(d => d.estado === 'propuesto' && d.hostId === pjId) || null;
  }
  const enCurso = (hacId) => all(hacId).filter(d => d.estado === 'en_curso');
  const byId = (id) => cache.find(d => d.id === id) || null;
  const participa = (d, pjId) => d.hostId === pjId || d.invitadoId === pjId;
  // Cooldown por mecenas tras debatir: derivado de sus debates resueltos (sin tocar
  // mecenas_stats). Devuelve ms restantes (0 = puede debatir).
  function cooldownRestanteMs(hacId, pjId, nowMs) {
    let best = 0;
    all(hacId).forEach(d => {
      if (d.estado === 'resuelto' && participa(d, pjId) && d.finMs) {
        const rem = COOLDOWN_MS - (nowMs - d.finMs); if (rem > best) best = rem;
      }
    });
    return Math.max(0, best);
  }
  const enCooldown = (hacId, pjId, nowMs) => cooldownRestanteMs(hacId, pjId, nowMs) > 0;

  function upsertCache(rowData) {
    if (!rowData) return null;
    const o = rowToObj(rowData);
    const i = cache.findIndex(x => x.id === o.id);
    if (i >= 0) cache[i] = o; else cache.push(o);
    return o;
  }
  async function crear({ haciendaId, hostId, hostNombre, invitadoId, invitadoNombre, tema, jardinCell }) {
    const c = await sb();
    const { data, error } = await c.rpc('debate_crear', {
      p_hac: haciendaId, p_host: hostId, p_host_nombre: hostNombre || '',
      p_invitado: invitadoId, p_invitado_nombre: invitadoNombre || '',
      p_tema: tema, p_jardin: jardinCell || '',
    });
    if (error) throw new Error(error.message || 'No se pudo crear el debate');
    return upsertCache(data);
  }
  async function aceptar(id, pjId, nowMs) {
    if (!nowMs) throw new Error('Reloj no disponible');
    const c = await sb();
    const { data, error } = await c.rpc('debate_aceptar', { p_id: id, p_pj: pjId, p_now: nowMs });
    if (error) throw new Error(error.message || 'No se pudo aceptar');
    return upsertCache(data);
  }
  async function rechazar(id, pjId) {
    const c = await sb();
    const { data, error } = await c.rpc('debate_rechazar', { p_id: id, p_pj: pjId });
    if (error) throw new Error(error.message || 'No se pudo rechazar');
    return upsertCache(data);
  }
  async function resolver(id, resultado) {
    const c = await sb();
    const { data, error } = await c.rpc('debate_resolver', { p_id: id, p_resultado: resultado || {} });
    if (error) throw new Error(error.message || 'No se pudo resolver');
    return upsertCache(data);
  }

  return { ready, reload, dbOk, DUR_MS, COOLDOWN_MS, TEMAS, temaDe, CALIDADES, bookId,
    all, enCurso, byId, miInvitacionPendiente, miDebate, miInvitacionEnviada,
    enCooldown, cooldownRestanteMs,
    crear, aceptar, rechazar, resolver };
})();
if (typeof window !== 'undefined') window.HacDebates = HacDebates;
if (typeof module !== 'undefined' && module.exports) module.exports = HacDebates;
