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

  let cache = [];          // lista viva en memoria
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

  return { ready, reload, all, get, upsert, remove, clear, resetToSeed, makeId, TABLE };
})();

if (typeof window !== 'undefined') window.HacStore = HacStore;
