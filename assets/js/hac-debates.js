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
  const arr = (v) => { try { return Array.isArray(v) ? v : (v ? JSON.parse(v) : []); } catch (e) { return []; } };
  function rowToObj(r) {
    return {
      id: r.id, haciendaId: r.hacienda_id,
      hostId: r.host_id, hostNombre: r.host_nombre || '',
      invitadoId: r.invitado_id, invitadoNombre: r.invitado_nombre || '',
      tema: r.tema || '', jardinCell: r.jardin_cell || '',
      estado: r.estado || 'propuesto',
      inicioMs: Number(r.inicio_ms) || 0, finMs: Number(r.fin_ms) || 0,
      resultado: obj(r.resultado), jugadas: arr(r.jugadas),
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
  async function jugar(id, turn, stance) {
    const c = await sb();
    const { data, error } = await c.rpc('debate_jugar', { p_id: id, p_turn: turn, p_stance: stance });
    if (error) throw new Error(error.message || 'No se pudo jugar');
    return upsertCache(data);
  }

  // ═══════════ MINI-JUEGO argumental por turnos (piedra-papel-tijera de posturas) ═══════════
  const ROUNDS = 5, TURNS = 10, TURN_MS = 60000, NUDGE = 0.09;   // 5 rondas · 60 s/turno · ±9%/ronda
  // 3 posturas en ciclo: 攻 Ofensiva ▷ 守 Cautelosa ▷ 変 Ingeniosa ▷ 攻 …
  const STANCES = Object.freeze([
    { id: 'ofensiva',  nombre: 'Ofensiva',  zh: '攻', vence: 'cautelosa' },
    { id: 'cautelosa', nombre: 'Cautelosa', zh: '守', vence: 'ingeniosa' },
    { id: 'ingeniosa', nombre: 'Ingeniosa', zh: '変', vence: 'ofensiva' },
  ]);
  const _stBy = {}; STANCES.forEach(s => { _stBy[s.id] = s; });
  const vence = (a, b) => !!_stBy[a] && _stBy[a].vence === b;                  // ¿la postura a gana a b?
  const contra = (b) => (STANCES.find(s => s.vence === b) || STANCES[0]).id;   // la que gana a b
  // Frases temáticas por tema × postura (pregunta / respuesta). El RPS se juega sobre la
  // POSTURA; el texto es sabor. La respuesta "contesta" en el tono de esa postura.
  // POOL de argumentos: varias variantes por tema × rol (ask=pregunta/reto, resp=réplica)
  // × postura, para que el intercambio se sienta como un debate de verdad. `frase()`
  // elige la variante por índice de turno (determinista → igual en todos los clientes).
  const FRASES = Object.freeze({
    guerra: {
      ask: { ofensiva: ['Sin audacia no hay victoria: ¿por qué esperar?', '¿Vas a temblar mientras el enemigo avanza?'], cautelosa: ['¿No es más sabio vencer sin librar batalla?', '¿De qué sirve el arrojo sin un plan?'], ingeniosa: ['¿Y si el engaño valiera más que mil lanzas?', '¿Quién dijo que la guerra se gana de frente?'] },
      resp: { ofensiva: ['¡Mientras dudas, ya he tomado la colina!', 'Tu prudencia no es más que miedo disfrazado.'], cautelosa: ['Tu ímpetu se estrellará contra mi muro.', 'Corre tú al frente; yo aguardaré tu error.'], ingeniosa: ['Ya preví tu treta y la vuelvo contra ti.', 'Tu fuerza es tan predecible como tu caída.'] },
    },
    letras: {
      ask: { ofensiva: ['Los clásicos me dan la razón, ¿osas refutarlos?', '¿Contradices tú lo que escribieron los sabios?'], cautelosa: ['¿No merece cada palabra su medida?', '¿No es la fuente más firme que la elocuencia?'], ingeniosa: ['¿Y si un solo verso deshiciera tu tesis?', '¿No dice más una metáfora que mil citas?'] },
      resp: { ofensiva: ['Recito de memoria lo que tú apenas hojeaste.', 'Tu duda insulta a los maestros.'], cautelosa: ['Tu retórica es humo; mi fuente, sólida.', 'Sin rigor, tu ingenio es solo ruido.'], ingeniosa: ['Con una analogía desmonto tu argumento.', 'Le doy la vuelta a tu cita y te contradice.'] },
    },
    administracion: {
      ask: { ofensiva: ['¡Los números no mienten y te aplastan!', '¿Puedes negar lo que dicta el registro?'], cautelosa: ['¿No conviene anotarlo todo antes de decidir?', '¿No es la prudencia la mejor hacienda?'], ingeniosa: ['¿Y si un pequeño ajuste cambiara el balance?', '¿Quién controla el grano, no controla el reino?'] },
      resp: { ofensiva: ['Mis cuentas son firmes; las tuyas, aire.', 'Tu desorden se ve en cada cifra.'], cautelosa: ['Sin pruebas en el libro, no hay caso.', 'Tu prisa arruinaría el granero.'], ingeniosa: ['Reinterpreto tu dato y ahora me favorece.', 'Un asiento bien puesto vale más que tu grito.'] },
    },
    estrategia: {
      ask: { ofensiva: ['¿Golpeamos por el flanco antes del alba?', '¿A qué esperar, si podemos romper su línea?'], cautelosa: ['¿No es mejor fortificarnos y aguardar su error?', '¿Para qué arriesgar lo que el tiempo nos dará?'], ingeniosa: ['¿Y si fingimos retirada y les tendemos la trampa?', '¿No vale una emboscada más que un asalto?'] },
      resp: { ofensiva: ['Contraataco donde menos lo esperas.', 'Tu defensa cede al primer empujón.'], cautelosa: ['Tu avance se agota; yo resisto.', 'Cada paso tuyo te aleja de tus suministros.'], ingeniosa: ['Tu plan ya lo había anticipado.', 'Caes en la trampa que creías tender.'] },
    },
    gobierno: {
      ask: { ofensiva: ['¿No se impone la ley con mano firme?', '¿Toleraremos el desorden un día más?'], cautelosa: ['¿No es gobernar prever, y no reaccionar?', '¿No trae la calma mejor cosecha que el rigor?'], ingeniosa: ['¿Y si un decreto astuto los desarmara a todos?', '¿No se domina mejor con maña que con fuerza?'] },
      resp: { ofensiva: ['Tu rigor sin pueblo es tiranía vacía.', 'Mando yo donde tú solo amenazas.'], cautelosa: ['Toda prisa en el mando trae desorden.', 'La paciencia sostiene lo que tu ley quiebra.'], ingeniosa: ['Tu edicto tiene una grieta y la aprovecho.', 'Tu astucia se enreda en sus propias leyes.'] },
    },
    diplomacia: {
      ask: { ofensiva: ['¿Respeto, o rompo aquí mismo la alianza?', '¿Crees que cederé un solo palmo?'], cautelosa: ['¿No merece cada palabra su peso en la embajada?', '¿No teje la paciencia mejores pactos?'], ingeniosa: ['¿Y si un halago a tiempo abriera toda puerta?', '¿No se gana más con una sonrisa que con un ejército?'] },
      resp: { ofensiva: ['Tu amenaza me da la razón ante la corte.', 'Alzas la voz porque te falta el argumento.'], cautelosa: ['La paciencia teje lo que tu prisa deshace.', 'Un pacto medido dura más que tu bravata.'], ingeniosa: ['Convierto tu exigencia en mi ventaja.', 'Tu halago lo devuelvo y te comprometo.'] },
    },
  });
  const frase = (tema, rol, stance, idx) => {
    const a = FRASES[tema] && FRASES[tema][rol] && FRASES[tema][rol][stance];
    if (!a) return '…';
    return a[((idx | 0) % a.length + a.length) % a.length];
  };

  const askerIsHost = (round) => round % 2 === 0;   // ronda 1 (r0): pregunta el host
  // Info de un turno i (0..9): ronda, rol (ask/resp) y lado (host/inv) que actúa.
  function turnInfo(i) {
    const round = Math.floor(i / 2), rol = (i % 2 === 0) ? 'ask' : 'resp', aH = askerIsHost(round);
    const side = (rol === 'ask') ? (aH ? 'host' : 'inv') : (aH ? 'inv' : 'host');
    return { round, rol, side };
  }
  const turnActorId = (d, i) => turnInfo(i).side === 'host' ? d.hostId : d.invitadoId;
  const jugCount = (d) => (d.jugadas || []).length;
  const juegoCompleto = (d) => jugCount(d) >= TURNS;
  // Índice del turno EN CURSO (o TURNS si ya terminó).
  const turnoActual = (d) => Math.min(TURNS, jugCount(d));
  // Fecha límite (ms) del turno actual: 60 s desde la última jugada (o desde el inicio).
  function turnoDeadline(d) {
    const j = d.jugadas || [];
    const last = j.length ? Number(j[j.length - 1].ms) || d.inicioMs : d.inicioMs;
    return last + TURN_MS;
  }
  // Postura que elegiría la IA para el turno i (determinista). skill = nivel del que actúa.
  function iaStance(d, i, skill) {
    const rng = (window.HacRand && window.HacRand.make) ? window.HacRand.make('ai#' + d.id + '#' + i) : { next: () => 0.5 };
    const info = turnInfo(i);
    if (info.rol === 'resp') {
      const ask = (d.jugadas || [])[i - 1];
      if (ask && rng.next() < (0.35 + Math.min(0.4, 0.03 * (skill || 0)))) return contra(ask.s);   // responde con la que gana
    }
    return STANCES[(rng.next() * STANCES.length) | 0].id;
  }
  // Tira y afloja: p0 = ventaja inicial del HOST (0..1). Aplica ±NUDGE por ronda resuelta.
  function tug(d, p0) {
    let p = p0; const j = d.jugadas || [], rondas = [];
    for (let r = 0; r < ROUNDS; r++) {
      const ask = j[r * 2], resp = j[r * 2 + 1];
      if (!ask || !resp) break;
      let win = 'tie';
      if (vence(ask.s, resp.s)) win = 'ask'; else if (vence(resp.s, ask.s)) win = 'resp';
      const aH = askerIsHost(r);
      const lado = win === 'tie' ? 'tie' : (win === 'ask' ? (aH ? 'host' : 'inv') : (aH ? 'inv' : 'host'));
      if (lado === 'host') p += NUDGE; else if (lado === 'inv') p -= NUDGE;
      p = Math.max(0.1, Math.min(0.9, p));
      rondas.push({ r, ask: ask.s, resp: resp.s, lado });
    }
    return { p, rondas };
  }

  return { ready, reload, dbOk, DUR_MS, COOLDOWN_MS, TEMAS, temaDe, CALIDADES, bookId,
    all, enCurso, byId, miInvitacionPendiente, miDebate, miInvitacionEnviada,
    enCooldown, cooldownRestanteMs,
    crear, aceptar, rechazar, resolver, jugar,
    ROUNDS, TURNS, TURN_MS, STANCES, vence, contra, frase,
    turnInfo, turnActorId, jugCount, juegoCompleto, turnoActual, turnoDeadline, iaStance, tug };
})();
if (typeof window !== 'undefined') window.HacDebates = HacDebates;
if (typeof module !== 'undefined' && module.exports) module.exports = HacDebates;
