/* ═══════════════════════════════════════════════════════════════════════
   hac-render.js — Render del PANEL de una hacienda (HTML), compartido por:
     · haciendas.html  (lista de casas, cada una enlaza a su página)
     · hacienda.html   (página individual de una casa)
   Fuente única para no duplicar la lógica de cargos/mecenas/progreso.

   API:  HacRender.panelHTML(h, { href })
           · href (opcional) → si se pasa, el nombre de la casa enlaza ahí.
         HacRender.esc(s)
   Necesita HAC_TIERS / HAC_RANGOS (haciendas-data.js) y HacCalc (hac-calc.js).
   ═══════════════════════════════════════════════════════════════════════ */
const HacRender = (function () {
  'use strict';

  const TIERS  = () => (typeof HAC_TIERS  !== 'undefined') ? HAC_TIERS  : [];
  const RANGOS = () => (typeof HAC_RANGOS !== 'undefined') ? HAC_RANGOS : [];

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));

  function tierPorNivel() {
    const m = {}; TIERS().forEach(t => { m[t.nivel] = t; }); return m;
  }

  function panelHTML(h, opts) {
    opts = opts || {};
    const C = HacCalc;
    // Solo aceptamos un hex válido; cualquier otra cosa cae al dorado global.
    const color = /^#[0-9a-fA-F]{3,6}$/.test(String(h.color || '')) ? h.color : 'var(--gold)';
    const pts   = C.haciendaPuntos(h);
    const tier  = C.nivelEfectivo(h);          // trinquete: no baja por puntos
    const tInfo = C.tierPorNivel(tier);
    const total = (h.miembros || []).length;
    const prog  = C.progresoHacia(pts, tInfo);
    const tpn   = tierPorNivel();
    const rangos = RANGOS();

    // Agrupar miembros por cargo deducido de sus puntos.
    const grupos = {};
    const sinCargo = [];
    (h.miembros || []).forEach(m => {
      const r = C.rangoDePuntos(m.puntos, tier);
      if (!r) { sinCargo.push(m); return; }
      (grupos[r.id] = grupos[r.id] || []).push(m);
    });

    const placaDe = (m) => `
      <li class="placa">
        <span class="placa-nombre">${esc(m.nombre || m.mecenas)}</span>
        <span class="placa-desde">${Number(m.puntos) || 0} pts${m.desde ? ` · desde ${esc(m.desde)}` : ''}</span>
        ${m.nota ? `<p class="placa-nota">${esc(m.nota)}</p>` : ''}
      </li>`;

    let bloques = rangos.slice().reverse()
      .filter(r => grupos[r.id] && grupos[r.id].length)
      .map(r => `
        <div class="hac-rango">
          <div class="hac-rango-band">
            <span class="hac-rango-zh">${esc(r.zh)}</span>
            <span class="hac-rango-nombre">${esc(r.nombre)}</span>
            <span class="hac-rango-sala">${esc(r.sala)}</span>
          </div>
          <ul class="placa-grid">${grupos[r.id].map(placaDe).join('')}</ul>
        </div>`).join('');

    if (sinCargo.length) {
      bloques += `
        <div class="hac-rango hac-rango-sin">
          <div class="hac-rango-band">
            <span class="hac-rango-zh">·</span>
            <span class="hac-rango-nombre">Sin cargo aún</span>
            <span class="hac-rango-sala">a la espera de su sitio</span>
          </div>
          <ul class="placa-grid">${sinCargo.map(placaDe).join('')}</ul>
        </div>`;
    }

    const cuerpo = bloques || `
      <p class="hac-vacia">Esta hacienda aún no tiene mecenas. Su salón
      espera a quien quiera sostenerla.</p>`;

    const bloqueados = rangos.filter(r => r.tier > tier);
    const lockHTML = bloqueados.length ? `
      <p class="hac-locked">
        <span class="hac-locked-lbl">Por desbloquear</span>
        ${bloqueados.map(r => {
          const t = tpn[r.tier];
          return `<span class="hac-locked-item">${esc(r.zh)} ${esc(r.nombre)}
            <i>· ${t ? esc(t.nombre) : 'nivel ' + r.tier}</i></span>`;
        }).join('')}
      </p>` : '';

    const ptsHTML = `<span class="hac-dot">·</span><span>${pts} pts</span>`;

    const progHTML = prog
      ? `<div class="hac-prog">
           <div class="hac-prog-bar"><span style="width:${prog.pct}%"></span></div>
           <p class="hac-prog-lbl">Faltan <b>${prog.faltan} pts</b> para
             <b>${esc(prog.sig.nombre)} ${esc(prog.sig.zh)}</b></p>
         </div>`
      : `<div class="hac-prog">
           <div class="hac-prog-bar hac-prog-max"><span style="width:100%"></span></div>
           <p class="hac-prog-lbl">Nivel máximo alcanzado · <b>${esc(tInfo.nombre)} ${esc(tInfo.zh)}</b></p>
         </div>`;

    // El nombre enlaza a la página de la casa si se pidió (lista pública).
    const nombreHTML = opts.href
      ? `<a class="hac-nombre hac-nombre-link" href="${esc(opts.href)}">${esc(h.nombre)} <span class="hac-go">↗</span></a>`
      : `<h3 class="hac-nombre">${esc(h.nombre)}</h3>`;

    return `
    <article class="hac-panel" data-bg="${esc(h.zh)}" style="--hac:${esc(color)}">
      <header class="hac-head">
        <span class="hac-zh">${esc(h.zh)}</span>
        <div class="hac-titles">
          <div class="hac-name-row">
            ${nombreHTML}
            <span class="hac-tier" title="Nivel ${tier}: ${esc(tInfo.nombre)}">
              <b>${esc(tInfo.zh)}</b> ${esc(tInfo.nombre)}
            </span>
          </div>
          ${h.lema ? `<p class="hac-lema">«${esc(h.lema)}»</p>` : ''}
          <p class="hac-meta">
            <span>Fundada en ${esc(h.fundada)}</span>
            <span class="hac-dot">·</span>
            <span>${total} mecenas</span>
            ${ptsHTML}
          </p>
        </div>
      </header>
      ${progHTML}
      ${h.descripcion ? `<p class="hac-desc">${esc(h.descripcion)}</p>` : ''}
      <div class="hac-body">${cuerpo}</div>
      ${lockHTML}
    </article>`;
  }

  return { panelHTML, esc };
})();

if (typeof window !== 'undefined') window.HacRender = HacRender;
