/* ═══════════════════════════════════════════════════════════════════════
   hac-cronica.js — Crónica de la Casa 史 (registro COMPARTIDO de la hacienda).
   ─────────────────────────────────────────────────────────────────────────
   El cronista de la casa redacta en prosa los hechos que importan a TODOS
   (escaramuzas de la banda, debates, vínculos, ascensos, obras, facción,
   altas…) en la tabla `cronica` (Supabase). A diferencia de `bitacora`
   (diario privado), aquí todos los mecenas leen lo mismo.

   Un evento compartido lo presencian varios clientes a la vez → todos llaman
   a log() con la MISMA `clave` y el índice único (hacienda_id, clave) deja
   pasar solo al primero (upsert con ignoreDuplicates). La prosa se elige con
   una semilla derivada de la clave → todos redactan idéntico.

   API:  HacCronica.ready(hacId)/reload(hacId)
         HacCronica.log(hacId, tipo, datos, { clave, pj, ts }) → redacta + inserta (dedup)
         HacCronica.listar(n) / ultima() / dbOk()
         HacCronica.subscribe(hacId, cb) / unsubscribe()   cb(entrada, esAjena)
         HacCronica.unread(hacId, quien) / marcarLeido(hacId, quien)
         HacCronica.redacta(tipo, datos, clave)             (expuesta para probar)
   ═══════════════════════════════════════════════════════════════════════ */
const HacCronica = (function () {
  'use strict';
  const TABLE = 'cronica';
  const MAX = 150;
  let cache = [], ok = false, readyPromise = null, boundHac = null;

  async function sb() {
    if (typeof Auth === 'undefined') throw new Error('Auth no está cargado');
    await Auth.ready();
    const c = Auth.client();
    if (!c) throw new Error('Supabase no disponible');
    return c;
  }
  const clock = () => (window.HacClock && HacClock.now) ? HacClock.now() : Date.now();
  function rowToObj(r) {
    return { id: r.id, haciendaId: r.hacienda_id, userId: r.user_id || '', personajeId: r.personaje_id || '',
             ts: Number(r.ts) || 0, tipo: r.tipo || '', texto: r.texto || '', datos: r.datos || {}, clave: r.clave || '' };
  }

  // ── Pluma del cronista ─────────────────────────────────────────────────
  // Semilla estable por clave → todos los clientes eligen la MISMA variante.
  function hseed(s) { let x = 2166136261; s = String(s || ''); for (let i = 0; i < s.length; i++) x = ((x ^ s.charCodeAt(i)) * 16777619) >>> 0; return x; }
  function pick(arr, clave) { return arr[hseed('cro#' + clave) % arr.length]; }
  // "A, B y C" (tope 3 + «y N compañeros más»).
  function lista(noms) {
    const a = (noms || []).filter(Boolean);
    if (!a.length) return 'la banda';
    if (a.length === 1) return a[0];
    if (a.length <= 3) return a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1];
    return a[0] + ', ' + a[1] + ' y ' + (a.length - 2) + ' compañeros más';
  }
  const DOM_TXT = { militar: 'el dominio de las armas', cultural: 'el dominio de las letras', administrativo: 'el dominio del gobierno' };

  // Cada tipo: variantes de prosa (castellano SIEMPRE; el chino solo adorna la UI).
  const PLUMAS = {
    'alta': (d) => [
      `${d.nombre} cruzó el portón y fue recibido como mecenas de la casa.`,
      `La casa abre sus puertas: ${d.nombre} sirve desde hoy bajo estos muros.`,
      `Quede escrito que ${d.nombre} juró servicio a la casa este día.`,
    ],
    'escaramuza-salida': (d) => {
      const uno = (d.nombres || []).filter(Boolean).length === 1;
      return [
        `${lista(d.nombres)} ${uno ? 'partió' : 'partieron en banda'} hacia «${d.escenario}».`,
        `Al alba, ${lista(d.nombres)} ${uno ? 'salió' : 'salieron'} por el portón rumbo a «${d.escenario}».`,
      ];
    },
    'escaramuza': (d) => {
      const uno = (d.nombres || []).filter(Boolean).length === 1;
      return d.exito ? [
        `${lista(d.nombres)} ${uno ? 'regresó victorioso' : 'regresaron victoriosos'} de la escaramuza; hubo botín y celebración.`,
        `La banda de ${lista(d.nombres)} volvió con las cabezas altas y las alforjas llenas.`,
        `Victoria en el camino: ${lista(d.nombres)} ${uno ? 'regresó' : 'regresaron'} con botín para la casa.`,
      ] : [
        `${lista(d.nombres)} ${uno ? 'regresó derrotado' : 'regresaron derrotados'}; en la casa se curan las heridas en silencio.`,
        `La fortuna dio la espalda a ${lista(d.nombres)}: la banda volvió maltrecha y sin botín.`,
      ];
    },
    'peregrinaje': (d) => {
      const uno = (d.nombres || []).filter(Boolean).length === 1;
      return d.exito ? [
        `${lista(d.nombres)} ${uno ? 'halló' : 'hallaron'} al legendario curandero: las heridas de la casa sanaron.`,
        `El peregrinaje dio fruto: ${lista(d.nombres)} ${uno ? 'volvió sanado' : 'volvieron sanados'} por el gran sabio.`,
      ] : [
        `El peregrinaje de ${lista(d.nombres)} se torció por el camino; alguien cargará secuela de por vida.`,
        `${lista(d.nombres)} no ${uno ? 'halló' : 'hallaron'} al curandero; el camino cobró su precio.`,
      ];
    },
    'debate': (d) => [
      `En el jardín, ${d.ganador} y ${d.perdedor} midieron argumentos sobre «${d.tema}»; prevaleció ${d.ganador}.`,
      `Hubo debate de «${d.tema}» entre ${d.ganador} y ${d.perdedor}; la razón quedó del lado de ${d.ganador}.`,
    ],
    'vinculo': (d) => [
      `Tras la última salida, entre ${d.a} y ${d.b} se forjó un vínculo: ${d.etiqueta}.`,
      `Los caminos unen destinos: entre ${d.a} y ${d.b} nació un vínculo (${d.etiqueta}).`,
    ],
    'ascenso': (d) => [
      `¡La casa asciende! Desde hoy es ${d.zh ? d.zh + ' ' : ''}${d.tier} (nivel ${d.nivel}); los estandartes lucieron toda la jornada.`,
      `Día grande: la casa alcanza la dignidad de ${d.zh ? d.zh + ' ' : ''}${d.tier} (nivel ${d.nivel}).`,
    ],
    'faccion': (d) => [
      `La casa juró estandartes: desde hoy sirve a ${d.nombre}${d.zh ? ' ' + d.zh : ''}.`,
      `Quede sellado: la casa se adhiere a la causa de ${d.nombre}${d.zh ? ' ' + d.zh : ''}.`,
    ],
    'obras': (d) => [
      `Por orden del fundador se levantó ${d.edificio} en la finca.`,
      `Los canteros terminaron su labor: la finca cuenta ya con ${d.edificio}.`,
    ],
    'terreno': (d) => [
      `El fundador amplió el terreno exterior de la finca (nivel ${d.nivel}).`,
      `La finca gana campo: el terreno exterior se amplió (nivel ${d.nivel}).`,
    ],
    'casa': (d) => [
      `${d.nombre} compró casa propia dentro de los muros.`,
      `${d.nombre} tiene ya hogar en la finca: compró su propia casa.`,
    ],
    'nivel': (d) => [
      `${d.nombre} alcanzó el nivel ${d.nivel} en ${DOM_TXT[d.dom] || 'su dominio'}.`,
      `Los años de estudio pesan: ${d.nombre} llegó al nivel ${d.nivel} en ${DOM_TXT[d.dom] || 'su dominio'}.`,
    ],
    'caballo': (d) => [
      `${d.nombre} adoptó un caballo y lo bautizó «${d.caballo}»; ronda ya por los campos.`,
      `Hay montura nueva en los campos: ${d.nombre} llamó «${d.caballo}» a su caballo.`,
    ],
    'pabellon': (d) => [
      `${d.nombre} se hizo cargo de «${d.pabellon}».`,
      `«${d.pabellon}» tiene nuevo responsable: ${d.nombre}.`,
    ],
  };
  function redacta(tipo, datos, clave) {
    const f = PLUMAS[tipo];
    if (!f) return '';
    try { return pick(f(datos || {}), clave); } catch (e) { return ''; }
  }

  // ── Fecha de crónica: lunas en vez de meses (mismo día real = misma luna) ──
  const LUNAS = ['primera', 'segunda', 'tercera', 'cuarta', 'quinta', 'sexta', 'séptima', 'octava', 'novena', 'décima', 'undécima', 'duodécima'];
  function luna(ts) {
    const d = new Date(ts || clock());
    return { txt: `${LUNAS[d.getMonth()].charAt(0).toUpperCase() + LUNAS[d.getMonth()].slice(1)} luna · día ${d.getDate()}`, dia: d.toDateString() };
  }

  // ── Carga / caché ──────────────────────────────────────────────────────
  async function load(hacId) {
    boundHac = hacId || boundHac;
    try {
      const c = await sb();
      const { data, error } = await c.from(TABLE).select('*').eq('hacienda_id', boundHac).order('ts', { ascending: false }).limit(MAX);
      if (error) throw error;
      cache = (data || []).map(rowToObj); ok = true;
    } catch (e) {
      console.warn('[HacCronica] tabla no disponible (¿falta cronica.sql?):', e && e.message || e);
      cache = []; ok = false;
    }
    return cache;
  }
  function ready(hacId) { return readyPromise || (readyPromise = load(hacId)); }
  function reload(hacId) { readyPromise = load(hacId); return readyPromise; }
  const listar = (n) => cache.slice(0, n || MAX);
  const ultima = () => cache[0] || null;
  const dbOk = () => ok;

  // Inserta un hecho (dedup compartido por clave). Optimista en caché.
  const tried = new Set();   // claves ya intentadas esta sesión (los pulsos de 5 s re-llaman)
  async function log(hacId, tipo, datos, opts) {
    opts = opts || {};
    const clave = opts.clave;
    if (!hacId || !tipo || !clave) return;
    if (tried.has(clave)) return;
    tried.add(clave);
    if (cache.some(e => e.clave === clave)) return;                  // ya escrito (aquí o por otro)
    const texto = redacta(tipo, datos, clave);
    if (!texto) return;
    const ts = opts.ts || clock();
    const local = { id: 'tmp-' + clave, haciendaId: hacId, userId: '', personajeId: opts.pj || '',
                    ts, tipo, texto, datos: datos || {}, clave };
    cache.unshift(local);                                            // refleja al instante
    try {
      const c = await sb();
      const user = Auth.current();
      const row = { hacienda_id: hacId, user_id: user && user.id, personaje_id: opts.pj || null,
                    ts, tipo, texto, datos: datos || {}, clave };
      // ignoreDuplicates: si otro cliente llegó antes con la misma clave, no pasa nada.
      const { data, error } = await c.from(TABLE).upsert(row, { onConflict: 'hacienda_id,clave', ignoreDuplicates: true }).select();
      if (error) throw error;
      if (data && data[0]) { const i = cache.indexOf(local); if (i >= 0) cache[i] = rowToObj(data[0]); }
    } catch (e) { console.warn('[HacCronica] log', e && e.message || e); }
  }

  // ── Realtime: la crónica llega en vivo a toda la casa ──────────────────
  let rtChannel = null;
  function subscribe(hacId, cb) {
    try {
      unsubscribe();
      if (typeof Auth === 'undefined' || !Auth.client) return null;
      const client = Auth.client();
      if (!client || !client.channel) return null;
      rtChannel = client.channel('cro-rt-' + hacId)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: TABLE, filter: 'hacienda_id=eq.' + hacId },
            (p) => {
              if (!p || !p.new) return;
              const e = rowToObj(p.new);
              const i = cache.findIndex(x => x.clave === e.clave);
              const nueva = i < 0;
              if (nueva) { cache.unshift(e); cache.sort((a, b) => b.ts - a.ts); } else cache[i] = e;
              const me = (Auth.current && Auth.current()) || null;
              if (cb) cb(e, !me || e.userId !== me.id, nueva);
            })
        .subscribe();
      return rtChannel;
    } catch (e) { console.warn('[HacCronica] realtime error', e); return null; }
  }
  function unsubscribe() {
    try { if (rtChannel && typeof Auth !== 'undefined' && Auth.client) { const c = Auth.client(); if (c && c.removeChannel) c.removeChannel(rtChannel); } } catch (e) {}
    rtChannel = null;
  }

  // ── No-leídos (marca local por hacienda+lector) ─────────────────────────
  const seenKey = (hacId, quien) => 'rotk.cronica.seen.' + hacId + '.' + (quien || '_');
  // No cuenta lo protagonizado/escrito por el propio lector (ya lo vivió).
  function unread(hacId, quien) {
    let last = 0; try { last = Number(localStorage.getItem(seenKey(hacId, quien))) || 0; } catch (e) {}
    return cache.filter(e => e.ts > last && (!quien || e.personajeId !== quien)).length;
  }
  function marcarLeido(hacId, quien) {
    try { localStorage.setItem(seenKey(hacId, quien), String(clock())); } catch (e) {}
  }

  return { ready, reload, listar, ultima, log, dbOk, subscribe, unsubscribe, unread, marcarLeido, redacta, luna, TABLE };
})();
if (typeof window !== 'undefined') window.HacCronica = HacCronica;
