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
  const HACIENDAS = (typeof HAC_HACIENDAS !== 'undefined') ? HAC_HACIENDAS : [];

  const MAX_TIER = TIERS.reduce((m, t) => Math.max(m, t.nivel || 1), 1);

  // Índices auxiliares.
  const rangoPorId  = {};
  RANGOS.forEach((r, i) => { rangoPorId[r.id] = { ...r, orden: i }; });
  const tierPorNivel = {};
  TIERS.forEach(t => { tierPorNivel[t.nivel] = t; });

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
  const clampTier = (n) => Math.min(MAX_TIER, Math.max(1, Number(n) || 1));

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
  function renderHacienda(h) {
    const color = h.color || 'var(--gold)';
    const tier  = clampTier(h.tier);
    const tInfo = tierPorNivel[tier] || { zh: '', nombre: 'Nivel ' + tier };
    const total = (h.miembros || []).length;

    // Agrupar miembros por rango; avisar de cargos no válidos para el tier.
    const grupos = {};
    (h.miembros || []).forEach(m => {
      const r = rangoPorId[m.rango];
      if (!r) {
        console.warn(`[haciendas] rango desconocido "${m.rango}" en ${h.id}`);
        return;
      }
      if (r.tier > tier) {
        console.warn(`[haciendas] el cargo "${m.rango}" exige nivel ${r.tier}, ` +
                     `pero la hacienda ${h.id} está en nivel ${tier}`);
      }
      (grupos[m.rango] = grupos[m.rango] || []).push(m);
    });

    // Bloques por cargo, del más alto al más bajo.
    const bloques = RANGOS.slice().reverse()
      .filter(r => grupos[r.id] && grupos[r.id].length)
      .map(r => {
        const placas = grupos[r.id].map(m => `
          <li class="placa">
            <span class="placa-nombre">${esc(m.mecenas)}</span>
            <span class="placa-desde">desde ${esc(m.desde)}</span>
            ${m.nota ? `<p class="placa-nota">${esc(m.nota)}</p>` : ''}
          </li>`).join('');
        return `
        <div class="hac-rango">
          <div class="hac-rango-band">
            <span class="hac-rango-zh">${esc(r.zh)}</span>
            <span class="hac-rango-nombre">${esc(r.nombre)}</span>
            <span class="hac-rango-sala">${esc(r.sala)}</span>
          </div>
          <ul class="placa-grid">${placas}</ul>
        </div>`;
      }).join('');

    const cuerpo = bloques || `
      <p class="hac-vacia">Esta hacienda aún no tiene mecenas. Su salón
      espera a quien quiera sostenerla.</p>`;

    // Cargos aún por desbloquear (tier superior al actual).
    const bloqueados = RANGOS.filter(r => r.tier > tier);
    const lockHTML = bloqueados.length ? `
      <p class="hac-locked">
        <span class="hac-locked-lbl">Por desbloquear</span>
        ${bloqueados.map(r => {
          const t = tierPorNivel[r.tier];
          return `<span class="hac-locked-item">${esc(r.zh)} ${esc(r.nombre)}
            <i>· ${t ? esc(t.nombre) : 'nivel ' + r.tier}</i></span>`;
        }).join('')}
      </p>` : '';

    const ptsHTML = (Number(h.puntuacion) > 0)
      ? `<span class="hac-dot">·</span><span>${esc(h.puntuacion)} pts</span>`
      : '';

    return `
    <article class="hac-panel" data-bg="${esc(h.zh)}" style="--hac:${esc(color)}">
      <header class="hac-head">
        <span class="hac-zh">${esc(h.zh)}</span>
        <div class="hac-titles">
          <div class="hac-name-row">
            <h3 class="hac-nombre">${esc(h.nombre)}</h3>
            <span class="hac-tier" title="Nivel ${tier}: ${esc(tInfo.nombre)}">
              <b>${esc(tInfo.zh)}</b> ${esc(tInfo.nombre)}
            </span>
          </div>
          ${h.lema ? `<p class="hac-lema">«${esc(h.lema)}»</p>` : ''}
          <p class="hac-meta">
            <span>Fundada en ${esc(h.fundada)}</span>
            <span class="hac-dot">·</span>
            <span>${total} ${total === 1 ? 'mecenas' : 'mecenas'}</span>
            ${ptsHTML}
          </p>
        </div>
      </header>
      ${h.descripcion ? `<p class="hac-desc">${esc(h.descripcion)}</p>` : ''}
      <div class="hac-body">${cuerpo}</div>
      ${lockHTML}
    </article>`;
  }

  function renderHaciendas() {
    const host = document.getElementById('hac-list');
    if (!host) return;
    if (!HACIENDAS.length) {
      host.innerHTML = `<p class="hac-vacia">Todavía no se ha fundado
        ninguna hacienda.</p>`;
      return;
    }
    // Orden: nivel descendente, luego puntuación descendente.
    const orden = HACIENDAS.slice().sort((a, b) =>
      clampTier(b.tier) - clampTier(a.tier) ||
      (Number(b.puntuacion) || 0) - (Number(a.puntuacion) || 0)
    );
    host.innerHTML = orden.map(renderHacienda).join('');
  }

  function mount() {
    renderTiers();
    renderRangos();
    renderHaciendas();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
