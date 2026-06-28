/* ═══════════════════════════════════════════════════════════════════════
   hacienda-page.js — Página individual de una hacienda (hacienda.html?id=…).
   Dibuja el HERO de pixel art (según el nivel) y el panel de la casa.
   Lee de HacStore (datos en Supabase, cargados vía HacStore.ready()).
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const esc = HacRender.esc;

  function notFound(host) {
    host.innerHTML = `
      <div class="hacp-404">
        <div class="hacp-404-zh">空</div>
        <h1>Esta hacienda no existe</h1>
        <p>No encontramos ninguna casa con ese nombre.
           <a href="haciendas.html">Vuelve a las haciendas</a>.</p>
      </div>`;
  }

  function render() {
    const host = document.getElementById('hacp-content');
    if (!host) return;

    const id = new URLSearchParams(location.search).get('id');
    const h = id ? HacStore.get(id) : null;
    if (!h) { notFound(host); return; }

    const pts   = HacCalc.haciendaPuntos(h);
    const tier  = HacCalc.nivelEfectivo(h);          // trinquete: no baja por puntos
    const tInfo = HacCalc.tierPorNivel(tier);
    const color = h.color || '#c9a84c';

    document.title = `${h.nombre} · Haciendas · Portal ROTK`;

    // Glifo grande del hero: el sello 漢字 si lo tiene; si no, el del nivel.
    const glifo = (h.zh && h.zh.trim()) ? h.zh : tInfo.zh;
    // Dimensiones de la rejilla (rectangular) de este nivel.
    const dims = window.HacBuild ? HacBuild.gridDims(tier) : [2 + tier, 2 + tier];

    // Botón de configuración: solo para el admin (gestiona ESTA hacienda).
    const esAdmin = !!(window.Auth && Auth.isAdmin && Auth.isAdmin());
    const adminBar = esAdmin
      ? `<div class="hacp-admin">
           <a class="hacp-cfg" href="admin-haciendas.html?id=${encodeURIComponent(h.id)}">⚙ Configurar esta hacienda</a>
         </div>`
      : '';

    host.innerHTML = `
      ${adminBar}
      <section class="hacp-hero" style="--hac:${esc(color)}">
        <canvas class="hacp-art" id="hacp-art"
          role="img" aria-label="Finca de ${esc(h.nombre)}, nivel ${esc(tInfo.nombre)}"></canvas>
        <div class="hacp-fade"></div>
        <div class="hacp-cap">
          <div class="hacp-cap-main">
            <p class="hacp-eyebrow">Mecenazgo · <b>${esc(tInfo.zh)}</b> ${esc(tInfo.nombre)} · Nivel ${tier}</p>
            <h1 class="hacp-name">${esc(h.nombre)}</h1>
            ${h.lema ? `<p class="hacp-lema">«${esc(h.lema)}»</p>` : ''}
          </div>
          <span class="hacp-zh-big">${esc(glifo)}</span>
        </div>
      </section>
      <section class="hacp-finca">
        <h2 class="hacp-finca-ttl">${esc(tInfo.zh)} · ${esc(tInfo.nombre)}</h2>
        <p class="hacp-finca-sub">El solar de la casa · vista en planta · rejilla ${dims[0]}×${dims[1]}</p>
        <div class="hacp-iso-area">
          <div class="hacp-iso-wrap" id="hacp-iso-wrap">
            <canvas class="hacp-iso" id="hacp-iso"
              role="img" aria-label="Plano isométrico de la finca de ${esc(h.nombre)}"></canvas>
            <button type="button" class="hacp-fs-btn" id="hacp-fs-btn" aria-label="Ver en pantalla completa" title="Ver en pantalla completa">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path class="hacp-fs-expand" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>
                <path class="hacp-fs-shrink" d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>
              </svg>
            </button>
            <span class="hacp-iso-hint">arrastra para mover · pellizca o ctrl+rueda para zoom</span>
          </div>
          <aside class="hacp-folk-panel" id="hacp-folk-panel" hidden>
            <h3 class="hacp-folk-ttl">Mecenas en la finca</h3>
            <ul class="hacp-folk-list" id="hacp-folk-list"></ul>
          </aside>
        </div>
      </section>
      <div class="hacp-detail">${HacRender.panelHTML(h)}</div>`;

    // Dibuja la escena de pixel art frontal (hero) con el nivel y color.
    const canvas = document.getElementById('hacp-art');
    if (canvas && window.HacPixel) HacPixel.draw(canvas, { color, tier });
    // Dibuja el plano isométrico. Encaja al ancho del contenedor (sin scroll);
    // cap a ×3 del tamaño lógico para que las fincas pequeñas no se pixelen
    // en exceso. Las grandes llenan el ancho ampliado de la sección.
    const iso = document.getElementById('hacp-iso');
    if (iso && window.HacIso) {
      const pabellones = (window.HacStore && HacStore.pabellones) ? HacStore.pabellones(h.id) : [];
      HacIso.draw(iso, { mapa: h.mapa, tier, color, pabellones, estacion: (h.mapa && h.mapa.estacion) || 'verano' });
      const vp = document.getElementById('hacp-iso-wrap');
      // Visor navegable: arrastrar (pan) + pellizco/ctrl-rueda (zoom). Las fincas
      // grandes ya no caben en pantalla, así que se exploran moviéndose dentro.
      const cam = enablePanZoom(vp, iso);
      // Botón de pantalla completa sobre el visor.
      enableFullscreen(vp, document.getElementById('hacp-fs-btn'));
      // Mecenas paseando + listado lateral con cámara y banners de edificio.
      if (window.HacFolk) setupFolk(iso, vp, cam, h, tier, color);
      // Nombre del pabellón al pasar el ratón (mapa celda→pabellón en vivo).
      const pabPorCelda = {};
      if (window.HacBuild) pabellones.forEach(p => {
        if (!Array.isArray(p.seed)) return;
        HacBuild.regionPabellon(h.mapa, tier, p.seed[0], p.seed[1]).forEach(([gx, gy]) => { pabPorCelda[gx + ',' + gy] = p; });
      });
      enablePabHover(vp, iso, pabPorCelda);
    }
  }

  // Pan + zoom sobre un lienzo dentro de un visor con overflow:hidden.
  // Trackpad Mac: dos dedos = desplazar (wheel); pellizco = ctrl+wheel (zoom).
  // Ratón/táctil: arrastrar = desplazar; pellizco con dos toques = zoom.
  function enablePanZoom(vp, cv) {
    if (!vp || !cv) return;
    let scale = 1, tx = 0, ty = 0, fit = 1;
    const clampS = (s) => Math.max(fit * 0.6, Math.min(fit * 8, s));
    const apply = () => { cv.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')'; };
    function fitView() {
      const vw = vp.clientWidth, vh = vp.clientHeight;
      if (!vw || !cv.width) return;
      fit = Math.min(vw / cv.width, vh / cv.height);
      scale = fit; targetScale = fit; tx = (vw - cv.width * scale) / 2; ty = (vh - cv.height * scale) / 2; apply();
    }
    const zoomAt = (ox, oy, factor) => { const ns = clampS(scale * factor); tx = ox - (ox - tx) * (ns / scale); ty = oy - (oy - ty) * (ns / scale); scale = ns; targetScale = ns; apply(); };
    // Zoom de rueda animado: la escala persigue suavemente un objetivo en vez de
    // saltar de golpe, manteniendo fijo el punto bajo el cursor (zfx,zfy).
    let targetScale = scale, zfx = 0, zfy = 0, zAnim = null;
    function smoothZoom() {
      const diff = targetScale - scale;
      if (Math.abs(diff) < 0.001) { scale = targetScale; apply(); zAnim = null; return; }
      const ns = scale + diff * 0.22;
      tx = zfx - (zfx - tx) * (ns / scale); ty = zfy - (zfy - ty) * (ns / scale);
      scale = ns; apply(); zAnim = requestAnimationFrame(smoothZoom);
    }
    vp.addEventListener('wheel', (e) => {
      e.preventDefault(); const r = vp.getBoundingClientRect();
      if (e.ctrlKey) {                                                                       // pellizco trackpad / ctrl+rueda
        zfx = e.clientX - r.left; zfy = e.clientY - r.top;
        let dy = e.deltaY;                                                                   // normaliza líneas/páginas a px
        if (e.deltaMode === 1) dy *= 16; else if (e.deltaMode === 2) dy *= vp.clientHeight;
        dy = Math.max(-60, Math.min(60, dy));                                                // acota saltos bruscos de rueda
        targetScale = clampS(targetScale * Math.exp(-dy * 0.0022));
        if (!zAnim) zAnim = requestAnimationFrame(smoothZoom);
      } else { tx -= e.deltaX; ty -= e.deltaY; apply(); }                                    // desplazar
    }, { passive: false });
    // Arrastrar con puntero (ratón o un dedo).
    const pts = new Map(); let pinch = null;
    vp.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, e); vp.setPointerCapture(e.pointerId); });
    vp.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return; const prev = pts.get(e.pointerId); pts.set(e.pointerId, e);
      if (pts.size === 2) {                                  // pellizco de dos toques
        const [a, b] = [...pts.values()]; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const r = vp.getBoundingClientRect(), mx = (a.clientX + b.clientX) / 2 - r.left, my = (a.clientY + b.clientY) / 2 - r.top;
        if (pinch) zoomAt(mx, my, d / pinch); pinch = d;
      } else { tx += e.clientX - prev.clientX; ty += e.clientY - prev.clientY; apply(); }   // pan
    });
    const end = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
    vp.addEventListener('pointerup', end); vp.addEventListener('pointercancel', end);
    fitView();
    window.addEventListener('resize', fitView);
    // Al entrar/salir de pantalla completa el visor cambia de tamaño: reencaja.
    document.addEventListener('fullscreenchange', () => requestAnimationFrame(fitView));
    document.addEventListener('webkitfullscreenchange', () => requestAnimationFrame(fitView));

    // Lleva la cámara a un punto LÓGICO (lx,ly) del plano, centrándolo en el
    // visor con una transición suave. Lo usa el listado de mecenas.
    const S = (window.HacIso && HacIso.SCALE) || 2;
    function centerOn(lx, ly) {
      const vw = vp.clientWidth, vh = vp.clientHeight;
      const tgX = vw / 2 - lx * S * scale, tgY = vh / 2 - ly * S * scale;
      const x0 = tx, y0 = ty, t0 = performance.now(), dur = 420;
      (function anim(t) {
        const k = Math.min(1, (t - t0) / dur), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        tx = x0 + (tgX - x0) * e; ty = y0 + (tgY - y0) * e; apply();
        if (k < 1) requestAnimationFrame(anim);
      })(t0);
    }
    return { centerOn };
  }

  // Botón de pantalla completa: alterna fullscreen sobre el visor (vp). Si el
  // navegador no lo soporta, oculta el botón.
  function enableFullscreen(vp, btn) {
    if (!vp || !btn) return;
    const req = vp.requestFullscreen || vp.webkitRequestFullscreen;
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (!req) { btn.hidden = true; return; }
    const isFs = () => (document.fullscreenElement || document.webkitFullscreenElement) === vp;
    const update = () => {
      const on = isFs();
      btn.classList.toggle('on', on);
      const label = on ? 'Salir de pantalla completa' : 'Ver en pantalla completa';
      btn.setAttribute('aria-label', label); btn.title = label;
    };
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());   // no iniciar un arrastre del visor
    btn.addEventListener('click', () => { if (isFs()) exit.call(document); else req.call(vp); });
    document.addEventListener('fullscreenchange', update);
    document.addEventListener('webkitfullscreenchange', update);
    update();
  }

  // Tooltip con el nombre del pabellón al pasar el ratón por su patio. Mapea el
  // cursor a una celda (HacIso.cellAt, respeta pan/zoom) y la busca en pabPorCelda.
  function enablePabHover(vp, cv, pabPorCelda) {
    if (!vp || !cv || !window.HacIso || typeof HacIso.cellAt !== 'function') return;
    let tip = document.getElementById('hacp-pab-tip');
    if (!tip) { tip = document.createElement('div'); tip.id = 'hacp-pab-tip'; tip.className = 'hacp-pab-tip'; document.body.appendChild(tip); }
    const hide = () => { tip.style.display = 'none'; };
    vp.addEventListener('mousemove', (e) => {
      const cell = HacIso.cellAt(cv, e.clientX, e.clientY);
      const p = cell ? pabPorCelda[cell[0] + ',' + cell[1]] : null;
      if (!p) { hide(); return; }
      const r = (window.HacBuild && HacBuild.rolPabellon) ? HacBuild.rolPabellon(p.rol) : null;
      tip.innerHTML = (r ? '<b style="color:' + esc(r.color) + '">' + esc(r.zh) + '</b> ' : '') +
        esc(p.nombre) + (r ? ' <span class="hacp-pab-rol">· ' + esc(r.nombre) + '</span>' : '');
      tip.style.display = 'block';
      tip.style.left = (e.clientX + 14) + 'px';
      tip.style.top = (e.clientY + 16) + 'px';
    });
    vp.addEventListener('mouseleave', hide);
  }

  // Mecenas paseando + panel lateral. Arranca HacFolk, pinta el listado (al
  // hacer clic en un nombre la cámara va a él y lo resalta) y gestiona el clic
  // en los banners 匾額 de los edificios (popup con quién hay dentro).
  function setupFolk(iso, vp, cam, h, tier, color) {
    const panel = document.getElementById('hacp-folk-panel');
    const listEl = document.getElementById('hacp-folk-list');
    if (!panel || !listEl) return;
    let pop = null;
    const hidePop = () => { if (pop) { pop.remove(); pop = null; } };

    // ¿Cuál es el mecenas del USUARIO en ESTA hacienda? Solo a él puede darle
    // órdenes (su personaje debe ser miembro de la hacienda).
    const _user = (window.Auth && Auth.current) ? Auth.current() : null;
    const _myPj = (_user && window.HacPersonajes && HacPersonajes.mine) ? HacPersonajes.mine(_user.id) : null;
    const myId = (_myPj && (h.miembros || []).some(m => m.id === _myPj.id)) ? _myPj.id : null;
    let lastOrdersSig = '';

    function gotoMember(id) {
      hidePop();
      HacFolk.select(id);
      const p = HacFolk.position(id);
      if (p && cam && cam.centerOn) cam.centerOn(p[0], p[1]);
      renderList();
    }

    // Convierte las órdenes (HacOrdenes) al mapa que entiende HacFolk. Solo
    // re-deriva el sim (setOrders) si CAMBIARON, para no rebobinar en cada poll.
    function applyOrders() {
      if (!window.HacOrdenes) return;
      const map = {};
      HacOrdenes.byHacienda(h.id).forEach(o => {
        map[o.miembroId] = { startMs: o.inicioMs, endMs: o.inicioMs + (o.duracionSeg || 120) * 1000, targetBid: o.targetId, tipo: o.tipo };
      });
      const sig = JSON.stringify(map);
      if (sig !== lastOrdersSig) { lastOrdersSig = sig; if (HacFolk.setOrders) HacFolk.setOrders(map); }
      renderList();
    }
    function dispatch(targetId) {
      if (!myId || !targetId || !window.HacOrdenes) return;
      HacOrdenes.set({ haciendaId: h.id, miembroId: myId, tipo: 'mision', targetId, duracionSeg: 120 })
        .then(applyOrders).catch(e => console.warn('[orden] set', e));
    }
    function release() {
      if (!myId || !window.HacOrdenes) return;
      HacOrdenes.clear(h.id, myId).then(applyOrders).catch(e => console.warn('[orden] clear', e));
    }
    // Panel de órdenes para MI mecenas (selector de edificio + enviar/liberar).
    function ordenPanel() {
      if (!myId) return '';
      const blds = HacFolk.buildings ? HacFolk.buildings() : [];
      const o = window.HacOrdenes ? HacOrdenes.mine(h.id, myId) : null;
      const now = (window.HacClock && HacClock.now) ? HacClock.now() : Date.now();
      const activa = o && now < (o.inicioMs + (o.duracionSeg || 120) * 1000);
      if (activa) {
        const rest = Math.max(0, Math.round((o.inicioMs + (o.duracionSeg || 120) * 1000 - now) / 1000));
        return `<div class="hacp-orden" style="display:flex;gap:6px;align-items:center;padding:2px 8px 8px 26px;font-size:12px">
          <span style="color:#e0b85a">⚑ En misión · ${rest}s</span>
          <button type="button" data-act="release" style="margin-left:auto">Liberar</button></div>`;
      }
      if (!blds.length) return '';
      const optionsH = blds.map(b => `<option value="${esc(b.id)}">${esc(b.nombre)}</option>`).join('');
      return `<div class="hacp-orden" style="display:flex;gap:6px;align-items:center;padding:2px 8px 8px 26px;font-size:12px">
        <select class="hacp-orden-sel" style="flex:1;min-width:0">${optionsH}</select>
        <button type="button" data-act="dispatch">Enviar (2 min)</button></div>`;
    }

    function renderList() {
      const items = HacFolk.list();
      if (!items.length) { panel.hidden = true; return; }
      panel.hidden = false;
      const sel = HacFolk.selected();
      listEl.innerHTML = items.map(m => {
        const mine = m.id === myId;
        const e = Math.max(0, Math.min(100, m.energia == null ? 100 : m.energia));
        return `<li>
          <button class="hacp-folk-item${m.id === sel ? ' on' : ''}" data-id="${esc(m.id)}">
            <span class="hacp-folk-dot" style="--c:${esc(m.color)}"></span>
            <span class="hacp-folk-info">
              <span class="hacp-folk-name">${esc(m.name)}${mine ? ' <em style="color:#7fc9a0;font-style:normal">(tú)</em>' : ''}</span>
              <span class="hacp-folk-state${m.inside ? ' inside' : ''}">${m.inside ? '⌂ ' : ''}${esc(m.activity || 'Paseando por la finca')}</span>
              <span class="hacp-folk-energy" title="Energía ${e}%" style="display:block;height:4px;margin-top:3px;border-radius:2px;background:rgba(255,255,255,.14);overflow:hidden"><i style="display:block;height:100%;width:${e}%;background:linear-gradient(90deg,#e0b85a,#7fc9a0)"></i></span>
            </span>
          </button>
          ${mine ? ordenPanel() : ''}
        </li>`;
      }).join('');
      listEl.querySelectorAll('.hacp-folk-item').forEach(b => b.addEventListener('click', () => gotoMember(b.dataset.id)));
      const db = listEl.querySelector('[data-act="dispatch"]');
      if (db) db.addEventListener('click', () => { const s = listEl.querySelector('.hacp-orden-sel'); dispatch(s ? s.value : null); });
      const rb = listEl.querySelector('[data-act="release"]');
      if (rb) rb.addEventListener('click', release);
    }

    HacFolk.start(iso, { mapa: h.mapa, tier, color, miembros: h.miembros, onState: renderList, seedKey: h.id, ordenes: {} });
    renderList();
    // Carga las órdenes (compartidas) y las re-aplica; refresca por poll (≤5 s, sin realtime).
    if (window.HacOrdenes) {
      HacOrdenes.ready().then(applyOrders);
      setInterval(() => { HacOrdenes.reload().then(applyOrders); }, 5000);
    }

    // Popup con la gente que hay dentro de un edificio (al pulsar su banner).
    function showPop(x, y, sign) {
      hidePop();
      pop = document.createElement('div');
      pop.className = 'hacp-folk-pop';
      pop.innerHTML = `<div class="hacp-folk-pop-ttl">${esc(sign.label)} · ${sign.ids.length}</div>` +
        sign.ids.map((id, i) => `<button class="hacp-folk-pop-name" data-id="${esc(id)}">${esc(sign.names[i])}</button>`).join('');
      document.body.appendChild(pop);
      pop.style.left = Math.min(x + 12, window.innerWidth - pop.offsetWidth - 8) + 'px';
      pop.style.top = (y + 12) + 'px';
      pop.querySelectorAll('.hacp-folk-pop-name').forEach(b => b.addEventListener('click', () => gotoMember(b.dataset.id)));
    }

    // Distinguimos TAP (clic) de arrastre (pan) por el desplazamiento del puntero.
    const S = (window.HacIso && HacIso.SCALE) || 2;
    let downAt = null, moved = false;
    vp.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; moved = false; });
    vp.addEventListener('pointermove', (e) => { if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) moved = true; });
    vp.addEventListener('pointerup', (e) => {
      const was = downAt; downAt = null;
      if (!was || moved) return;
      const r = iso.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const lx = (e.clientX - r.left) / r.width * iso.width / S;
      const ly = (e.clientY - r.top) / r.height * iso.height / S;
      const hit = (iso._hacSigns || []).find(s => lx >= s.lx && lx <= s.lx + s.w && ly >= s.ly && ly <= s.ly + s.h);
      if (hit) showPop(e.clientX, e.clientY, hit);
      else { hidePop(); HacFolk.select(null); renderList(); }
    });
    document.addEventListener('pointerdown', (e) => { if (pop && !pop.contains(e.target) && !vp.contains(e.target)) hidePop(); });
  }

  // Espera a la carga de Supabase (HacStore.ready) y al DOM antes de pintar.
  function init() {
    const host = document.getElementById('hacp-content');
    if (host) host.innerHTML = `<p class="hacp-loading">Cargando hacienda…</p>`;
    // Precarga el catálogo de tareas (en paralelo) para que las actividades de
    // los mecenas usen el verbo/duración configurados desde el primer momento.
    if (window.HacTareas) HacTareas.ready();
    // Registro de personajes: los modelos de los mecenas que pasean por la finca
    // sacan su aptitud/aspecto de aquí. Degrada a vacío si falta la tabla.
    if (window.HacPersonajes) HacPersonajes.ready();
    HacStore.ready().then(render);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
