/* ═══════════════════════════════════════════════════════════════════════
   hac-store.js — Capa de datos de las Haciendas (PROTOTIPO en localStorage).
   ─────────────────────────────────────────────────────────────────────────
   El panel de admin (admin-haciendas.html) ESCRIBE aquí y la página pública
   (haciendas.html) LEE de aquí. Mientras nadie haya tocado el panel, se usa
   la semilla del fichero estático `haciendas-data.js` (HAC_HACIENDAS).

   ⚠️  Los datos viven solo en ESTE navegador. Es una maqueta para diseñar el
   flujo; migrable a una base de datos real (Supabase) sin tocar la interfaz.

   Modelo de una hacienda:
     { id, nombre, zh, color, lema, fundada, descripcion,
       puntosExtra,                      // puntos de misiones (futuro)
       miembros: [ { id, nombre, puntos, desde, nota } ] }
   El NIVEL de la casa y el CARGO de cada miembro se DEDUCEN de los puntos
   (lógica en haciendas.js). Aquí solo se guardan los datos crudos.
   ═══════════════════════════════════════════════════════════════════════ */
const HacStore = (function () {
  'use strict';
  const KEY = 'rotk_haciendas';

  const seed = () => (typeof HAC_HACIENDAS !== 'undefined')
    ? JSON.parse(JSON.stringify(HAC_HACIENDAS)) : [];

  // null = nunca se ha guardado nada desde el panel.
  function read() {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  // Lista viva: lo guardado, o la semilla si el panel no se ha usado aún.
  function all() {
    const stored = read();
    return stored !== null ? stored : seed();
  }

  function save(arr) { localStorage.setItem(KEY, JSON.stringify(arr || [])); }
  function get(id)   { return all().find(h => h.id === id) || null; }

  function upsert(h) {
    const arr = all().slice();
    const i = arr.findIndex(x => x.id === h.id);
    if (i >= 0) arr[i] = h; else arr.push(h);
    save(arr);
    return h;
  }
  function remove(id) { save(all().filter(h => h.id !== id)); }

  // Vuelca la semilla del fichero estático en el almacén (para "crear por defecto").
  function resetToSeed() { save(seed()); return all(); }

  // Olvida todo lo guardado y vuelve a depender de la semilla.
  function clear() { localStorage.removeItem(KEY); }

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

  return { all, save, get, upsert, remove, resetToSeed, clear, makeId, KEY };
})();

if (typeof window !== 'undefined') window.HacStore = HacStore;
