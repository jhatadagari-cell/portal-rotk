/* ═══════════════════════════════════════════════════════════════════════
   hac-store.js — Capa de datos de las Haciendas (Supabase).
   ─────────────────────────────────────────────────────────────────────────
   El panel de admin (admin-haciendas.html) ESCRIBE aquí y las páginas públicas
   (haciendas.html / hacienda.html) LEEN de aquí. Los datos viven en la tabla
   `haciendas` de Supabase (el mismo proyecto que el login).

   Patrón (como Auth): se cargan TODAS las haciendas una vez en una caché en
   memoria; los lectores all()/get() son SÍNCRONOS tras `ready()`. Los
   escritores upsert()/remove()/… actualizan la caché al instante y persisten
   en Supabase (devuelven Promise). Solo el admin puede escribir (RLS).

   Modelo en cliente:
     { id, nombre, zh, color, lema, fundada, descripcion,
       puntosExtra, miembros: [ { id, nombre, puntos, desde, nota } ] }
   En la tabla, `puntosExtra` → columna `puntos_extra` y `miembros` → jsonb.
   ═══════════════════════════════════════════════════════════════════════ */
const HacStore = (function () {
  'use strict';
  const TABLE = 'haciendas';
  const PAB_TABLE = 'pabellones';   // patios temáticos, 1 hacienda ↔ N pabellones

  let cache = [];          // lista viva en memoria
  let pabCache = [];       // pabellones de todas las haciendas
  let readyPromise = null; // carga inicial (una sola vez)

  const seed = () => (typeof HAC_HACIENDAS !== 'undefined')
    ? JSON.parse(JSON.stringify(HAC_HACIENDAS)) : [];

  // ── Mapeo fila ⇄ objeto de cliente ──────────────────────────────────────
  // Sanea el mapa de construcciones. Dependencia BLANDA de HacBuild: si aún no
  // está cargado, conservamos el objeto tal cual con un shape mínimo.
  function normMapa(m) {
    if (typeof HacBuild !== 'undefined') return HacBuild.normalizaMapa(m);
    return (m && typeof m === 'object' && Array.isArray(m.construcciones))
      ? m : { v: 1, construcciones: [] };
  }

  function rowToHac(r) {
    return {
      id: r.id,
      nombre: r.nombre || '',
      zh: r.zh || '',
      color: r.color || '#c9a84c',
      lema: r.lema || '',
      fundada: r.fundada || '',
      descripcion: r.descripcion || '',
      puntosExtra: Number(r.puntos_extra) || 0,
      miembros: Array.isArray(r.miembros) ? r.miembros : [],
      mapa: normMapa(r.mapa)
    };
  }
  function hacToRow(h) {
    return {
      id: h.id,
      nombre: h.nombre || '',
      zh: h.zh || '',
      color: h.color || '#c9a84c',
      lema: h.lema || '',
      fundada: h.fundada || '',
      descripcion: h.descripcion || '',
      puntos_extra: Number(h.puntosExtra) || 0,
      miembros: h.miembros || [],
      mapa: normMapa(h.mapa)
    };
  }

  // ── Pabellones (tabla aparte, FK hacienda_id) ───────────────────────────
  // DINÁMICO: se guarda la celda-SEMILLA [gx,gy]; la región (celdas) se recalcula
  // en vivo a partir de las murallas (HacBuild.regionPabellon). Así el patio se
  // adapta solo cuando se mueven los muros.
  function rowToPab(r) {
    return { id: r.id, haciendaId: r.hacienda_id, nombre: r.nombre || '', rol: r.rol || '',
      seed: Array.isArray(r.seed) ? [Number(r.seed[0]) || 0, Number(r.seed[1]) || 0] : [0, 0] };
  }
  function pabToRow(p) {
    return { id: p.id, hacienda_id: p.haciendaId, nombre: p.nombre || '', rol: p.rol || '',
      seed: Array.isArray(p.seed) ? [Number(p.seed[0]) || 0, Number(p.seed[1]) || 0] : [0, 0] };
  }

  // Cliente Supabase compartido con Auth (espera a la sesión inicial).
  async function sb() {
    if (typeof Auth === 'undefined') throw new Error('Auth no está cargado');
    await Auth.ready();
    const client = Auth.client();
    if (!client) throw new Error('Supabase no disponible');
    return client;
  }

  // ── Carga inicial ───────────────────────────────────────────────────────
  async function load() {
    try {
      const client = await sb();
      const { data, error } = await client.from(TABLE)
        .select('*').order('updated_at', { ascending: true });
      if (error) throw error;
      cache = (data || []).map(rowToHac);
      // Pabellones: tabla aparte. Si aún no existe, degrada (caché vacía) sin
      // romper la carga de haciendas.
      try {
        const { data: pdata, error: perr } = await client.from(PAB_TABLE).select('*');
        if (perr) throw perr;
        pabCache = (pdata || []).map(rowToPab);
      } catch (pe) {
        console.warn('[HacStore] pabellones no disponibles (¿falta la tabla?):', pe && pe.message || pe);
        pabCache = [];
      }
    } catch (e) {
      console.error('[HacStore] No se pudo cargar de Supabase:', e);
      // Resiliencia: si falla la red, mostramos la semilla estática (solo lectura).
      cache = seed();
    }
    return cache;
  }
  function ready() { return readyPromise || (readyPromise = load()); }
  // Re-sincroniza la caché con Supabase (fuente de verdad). Útil tras un error
  // de escritura: deshace cualquier cambio optimista que no llegó a persistir.
  function reload() { return load(); }

  // ── Lectores SÍNCRONOS (tras ready) ─────────────────────────────────────
  function all() { return cache.slice(); }
  function get(id) { return cache.find(h => h.id === id) || null; }
  // Pabellones de una hacienda (o todos si no se pasa id).
  function pabellones(hacId) {
    return hacId == null ? pabCache.slice() : pabCache.filter(p => p.haciendaId === hacId);
  }

  // ── Escritores de pabellones (admin) ────────────────────────────────────
  async function addPabellon(p) {
    pabCache.push(p);                                   // refleja en UI al instante
    const client = await sb();
    const { error } = await client.from(PAB_TABLE).insert(pabToRow(p));
    if (error) { console.error('[HacStore] addPabellon', error); throw error; }
    return p;
  }
  async function updatePabellon(p) {
    const i = pabCache.findIndex(x => x.id === p.id);
    if (i >= 0) pabCache[i] = p; else pabCache.push(p);
    const client = await sb();
    const { error } = await client.from(PAB_TABLE).upsert(pabToRow(p));
    if (error) { console.error('[HacStore] updatePabellon', error); throw error; }
    return p;
  }
  async function removePabellon(id) {
    pabCache = pabCache.filter(p => p.id !== id);
    const client = await sb();
    const { error } = await client.from(PAB_TABLE).delete().eq('id', id);
    if (error) { console.error('[HacStore] removePabellon', error); throw error; }
  }
  // Solo CACHÉ (sin escribir en BD): para cuando el FUNDADOR crea/borra vía RPC
  // (la escritura la hace la RPC SECURITY DEFINER; aquí solo refrescamos la UI).
  function pabCacheUpsert(p) { const i = pabCache.findIndex(x => x.id === p.id); if (i >= 0) pabCache[i] = p; else pabCache.push(p); return p; }
  function pabCacheRemove(id) { pabCache = pabCache.filter(p => p.id !== id); }

  // ── Escritores (admin) — actualizan caché y persisten ───────────────────
  async function upsert(h) {
    const i = cache.findIndex(x => x.id === h.id);
    if (i >= 0) cache[i] = h; else cache.push(h);     // refleja en UI al instante
    const client = await sb();
    const { error } = await client.from(TABLE).upsert(hacToRow(h));
    if (error) { console.error('[HacStore] upsert', error); throw error; }
    return h;
  }
  async function remove(id) {
    cache = cache.filter(h => h.id !== id);
    pabCache = pabCache.filter(p => p.haciendaId !== id);   // la BD cae en cascada (FK)
    const client = await sb();
    const { error } = await client.from(TABLE).delete().eq('id', id);
    if (error) { console.error('[HacStore] remove', error); throw error; }
  }
  // Vacía la tabla entera.
  async function clear() {
    cache = [];
    const client = await sb();
    const { error } = await client.from(TABLE).delete().neq('id', '');
    if (error) { console.error('[HacStore] clear', error); throw error; }
  }
  // Vuelca la semilla estática (Sima) en la tabla.
  async function resetToSeed() {
    cache = seed();
    const client = await sb();
    const { error } = await client.from(TABLE).upsert(cache.map(hacToRow));
    if (error) { console.error('[HacStore] resetToSeed', error); throw error; }
    return cache;
  }

  // Genera un id de hacienda único a partir del nombre.
  function makeId(nombre) {
    const base = String(nombre || 'hacienda').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'hacienda';
    const taken = new Set(all().map(h => h.id));
    if (!taken.has(base)) return base;
    let n = 2; while (taken.has(base + '-' + n)) n++;
    return base + '-' + n;
  }

  return { ready, reload, all, get, upsert, remove, clear, resetToSeed, makeId, TABLE,
    pabellones, addPabellon, updatePabellon, removePabellon, pabCacheUpsert, pabCacheRemove, PAB_TABLE };
})();

if (typeof window !== 'undefined') window.HacStore = HacStore;
