/**
 * haciendas.js — Renderiza la página de Haciendas (recompensa de mecenazgo).
 *
 * Lee los datos de haciendas-data.js (HAC_TIERS, HAC_RANGOS, HAC_HACIENDAS)
 * y construye:
 *   · #hac-tiers  → los niveles de hacienda.
 *   · #hac-rangos → la escalera de cargos (con su tier de desbloqueo).
 *   · #hac-list   → cada hacienda con su nivel y sus mecenas por cargo.
 *
 * Es una vista de solo lectura sobre el fichero de datos. Para cambiar el
 * contenido se edita haciendas-data.js.
 */
(function () {
  'use strict';

  const TIERS    = (typeof HAC_TIERS     !== 'undefined') ? HAC_TIERS     : [];
  const RANGOS   = (typeof HAC_RANGOS    !== 'undefined') ? HAC_RANGOS    : [];

  // Índice auxiliar (escalera de cargos → tier de cada nivel).
  const tierPorNivel = {};
  TIERS.forEach(t => { tierPorNivel[t.nivel] = t; });

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));

  // Reglas de puntos/niveles: módulo compartido con el panel de admin.
  const haciendaPuntos = HacCalc.haciendaPuntos;

  // ── Niveles de hacienda ────────────────────────────────────────────────
  function renderTiers() {
    const host = document.getElementById('hac-tiers');
    if (!host) return;
    // De mayor a menor (Hacienda Mayor arriba).
    host.innerHTML = TIERS.slice().reverse().map(t => {
      // Cargo de élite del tier = el rango más alto que se abre en este nivel.
      const elite = RANGOS.filter(r => r.tier === t.nivel).slice(-1)[0];
      return `
      <div class="tier-row" data-nivel="${t.nivel}">
        <span class="tier-zh">${esc(t.zh)}</span>
        <div class="tier-body">
          <div class="tier-head">
            <span class="tier-nombre">${esc(t.nombre)}</span>
            <span class="tier-lvl">Nivel ${t.nivel}</span>
            <span class="tier-umbral">${(Number(t.umbral) || 0) > 0
              ? `Desde <b>${Number(t.umbral)} pts</b>`
              : 'Nivel inicial'}</span>
          </div>
          <p class="tier-desc">${esc(t.desc)}</p>
          ${elite ? `<p class="tier-elite">Estrena el cargo
            <b>${esc(elite.nombre)} ${esc(elite.zh)}</b></p>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  // ── Escalera de cargos ─────────────────────────────────────────────────
  function renderRangos() {
    const host = document.getElementById('hac-rangos');
    if (!host) return;
    const orden = RANGOS.slice().reverse();   // el más alto arriba
    host.innerHTML = orden.map((r, i) => {
      const nivel = orden.length - i;
      const t = tierPorNivel[r.tier];
      return `
      <div class="rango-row" data-nivel="${nivel}">
        <span class="rango-zh">${esc(r.zh)}</span>
        <div class="rango-body">
          <div class="rango-head">
            <span class="rango-nombre">${esc(r.nombre)}</span>
            <span class="rango-sala">${esc(r.sala)}</span>
          </div>
          <p class="rango-desc">${esc(r.desc)}</p>
        </div>
        <span class="rango-tier" title="Se desbloquea con la hacienda en ${t ? esc(t.nombre) : 'nivel ' + r.tier}">
          ${t ? esc(t.zh) : r.tier}
        </span>
      </div>`;
    }).join('');
  }

  // ── Una hacienda ───────────────────────────────────────────────────────
  // El render del panel vive en HacRender (compartido con la página de la
  // casa). Aquí cada tarjeta enlaza a su página individual.
  function renderHacienda(h) {
    return HacRender.panelHTML(h, { href: 'hacienda.html?id=' + encodeURIComponent(h.id) });
  }

  function renderHaciendas() {
    const host = document.getElementById('hac-list');
    if (!host) return;
    const HACIENDAS = HacStore.all();   // datos vivos desde Supabase (tras ready)
    if (!HACIENDAS.length) {
      host.innerHTML = `<p class="hac-vacia">Todavía no se ha fundado
        ninguna hacienda.</p>`;
      return;
    }
    // Orden: puntuación descendente (que ya implica el nivel deducido).
    const orden = HACIENDAS.slice().sort((a, b) =>
      haciendaPuntos(b) - haciendaPuntos(a)
    );
    host.innerHTML = orden.map(renderHacienda).join('');
  }

  function mount() {
    // Las escaleras (niveles/cargos) son estáticas: se pintan ya.
    renderTiers();
    renderRangos();
    // Las casas vienen de Supabase: esperamos a la carga inicial.
    const host = document.getElementById('hac-list');
    if (host) host.innerHTML = `<p class="hac-vacia">Cargando haciendas…</p>`;
    HacStore.ready().then(renderHaciendas);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
