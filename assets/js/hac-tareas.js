/* ═══════════════════════════════════════════════════════════════════════
   hac-tareas.js — Catálogo GLOBAL de tareas de edificios (Supabase).
   ─────────────────────────────────────────────────────────────────────────
   Las tareas que un mecenas puede hacer DENTRO de cada TIPO de edificio
   (igual para todas las haciendas). Varias por tipo: al entrar, el mecenas
   elige una al azar y permanece dentro `duracionSeg` segundos.

   La pestaña «Tareas» de admin-haciendas.html ESCRIBE aquí; hac-folk.js LEE.
   Mismo patrón que HacStore: carga una vez en caché, lectores SÍNCRONOS tras
   ready(); escritores optimistas que persisten en Supabase (solo admin, RLS).

   Si la tabla `edificio_tareas` aún no existe o está vacía, se degrada a una
   SEMILLA derivada del catálogo cliente (HacBuild.TAREAS) — solo lectura.

   Modelo en cliente: { id, tipo, nombre, verbo, duracionSeg, orden }
   En la tabla: tipo→tipo_edificio, duracionSeg→duracion_seg.
   ═══════════════════════════════════════════════════════════════════════ */
const HacTareas = (function () {
  'use strict';
  const TABLE = 'edificio_tareas';

  let cache = [];
  let readyPromise = null;
  let fromSeed = false;     // true si la caché es la semilla (BD no disponible/vacía)

  function rowToTarea(r) {
    return {
      id: r.id,
      tipo: r.tipo_edificio || '',
      nombre: r.nombre || '',
      verbo: r.verbo || '',
      duracionSeg: Math.max(1, Number(r.duracion_seg) || 30),
      orden: Number(r.orden) || 0
    };
  }
  function tareaToRow(t) {
    return {
      id: t.id,
      tipo_edificio: t.tipo || '',
      nombre: t.nombre || '',
      verbo: t.verbo || '',
      duracion_seg: Math.max(1, Number(t.duracionSeg) || 30),
      orden: Number(t.orden) || 0
    };
  }

  // Semilla (fallback): una tarea por tipo de edificio, del catálogo cliente.
  function seed() {
    if (typeof HacBuild === 'undefined' || !HacBuild.TAREAS) return [];
    return Object.keys(HacBuild.TAREAS).map((tipo, i) => ({
      id: 'seed-' + tipo, tipo, nombre: HacBuild.TAREAS[tipo].verbo,
      verbo: HacBuild.TAREAS[tipo].verbo, duracionSeg: 30, orden: i
    }));
  }

  async function sb() {
    if (typeof Auth === 'undefined') throw new Error('Auth no está cargado');
    await Auth.ready();
    const client = Auth.client();
    if (!client) throw new Error('Supabase no disponible');
    return client;
  }

  async function load() {
    try {
      const client = await sb();
      const { data, error } = await client.from(TABLE)
        .select('*').order('tipo_edificio', { ascending: true }).order('orden', { ascending: true });
      if (error) throw error;
      if (data && data.length) { cache = data.map(rowToTarea); fromSeed = false; }
      else { cache = seed(); fromSeed = true; }   // tabla vacía → semilla
    } catch (e) {
      console.warn('[HacTareas] tabla no disponible (¿falta edificio-tareas.sql?), uso semilla:', e && e.message || e);
      cache = seed(); fromSeed = true;
    }
    return cache;
  }
  function ready() { return readyPromise || (readyPromise = load()); }
  function reload() { readyPromise = load(); return readyPromise; }

  // ── Lectores SÍNCRONOS (tras ready) ─────────────────────────────────────
  function all() { return cache.slice(); }
  function byTipo(tipo) { return cache.filter(t => t.tipo === tipo); }
  function get(id) { return cache.find(t => t.id === id) || null; }
  function isSeed() { return fromSeed; }
  // Una tarea al azar de las de ese edificio (null si no hay).
  function pick(tipo) { const ls = byTipo(tipo); return ls.length ? ls[Math.floor(Math.random() * ls.length)] : null; }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  // ── Escritores (admin) — optimistas, persisten en Supabase ──────────────
  // Si la caché venía de la semilla, al primer escribir partimos de vacío para
  // no arrastrar ids 'seed-*' que no existen en BD.
  function dropSeed() { if (fromSeed) { cache = []; fromSeed = false; } }

  async function add(t) {
    dropSeed();
    const tarea = { id: uuid(), tipo: t.tipo, nombre: t.nombre || '', verbo: t.verbo || '', duracionSeg: Math.max(1, Number(t.duracionSeg) || 30), orden: Number(t.orden) || 0 };
    cache.push(tarea);
    const client = await sb();
    const { error } = await client.from(TABLE).insert(tareaToRow(tarea));
    if (error) { console.error('[HacTareas] add', error); throw error; }
    return tarea;
  }
  async function update(t) {
    dropSeed();
    const i = cache.findIndex(x => x.id === t.id);
    if (i >= 0) cache[i] = Object.assign({}, cache[i], t); else cache.push(t);
    const client = await sb();
    const { error } = await client.from(TABLE).upsert(tareaToRow(cache[i >= 0 ? i : cache.length - 1]));
    if (error) { console.error('[HacTareas] update', error); throw error; }
    return t;
  }
  async function remove(id) {
    dropSeed();
    cache = cache.filter(t => t.id !== id);
    const client = await sb();
    const { error } = await client.from(TABLE).delete().eq('id', id);
    if (error) { console.error('[HacTareas] remove', error); throw error; }
  }
  // Vuelca el catálogo SEMILLA en la BD (útil si la tabla está vacía y no se
  // quiere ejecutar el SQL a mano). Inserta una fila por tarea con id nuevo.
  async function seedToDb() {
    const rows = seed().map(t => ({ id: uuid(), tipo: t.tipo, nombre: t.nombre, verbo: t.verbo, duracionSeg: t.duracionSeg, orden: t.orden }));
    const client = await sb();
    const { error } = await client.from(TABLE).insert(rows.map(tareaToRow));
    if (error) { console.error('[HacTareas] seedToDb', error); throw error; }
    return reload();
  }

  return { ready, reload, all, byTipo, get, pick, isSeed, add, update, remove, seedToDb, TABLE };
})();

if (typeof window !== 'undefined') window.HacTareas = HacTareas;
if (typeof module !== 'undefined' && module.exports) module.exports = HacTareas;
