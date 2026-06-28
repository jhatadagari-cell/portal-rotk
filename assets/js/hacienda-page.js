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
            <div class="hacp-char-panel" id="hacp-char-panel" hidden></div>
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
      e.preventDefault(); stopFollow(); const r = vp.getBoundingClientRect();
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
    vp.addEventListener('pointerdown', (e) => { stopFollow(); pts.set(e.pointerId, e); vp.setPointerCapture(e.pointerId); });
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

    // ── Enfoque y SEGUIMIENTO de un personaje ──────────────────────────────
    // focusFollow: zoom+centro animados sobre el objetivo y luego lo SIGUE cada
    // frame (a escala fija) mientras camina. Se rompe al interactuar (pan/zoom).
    const S = (window.HacIso && HacIso.SCALE) || 2;
    let following = null, followRAF = null;
    function stopFollow() { following = null; if (followRAF) { cancelAnimationFrame(followRAF); followRAF = null; } }
    function lookAt(p) { tx = vp.clientWidth / 2 - p[0] * S * scale; ty = vp.clientHeight / 2 - p[1] * S * scale; apply(); }
    function followLoop() {
      if (!following) return;
      const p = following(); if (p) lookAt(p);
      followRAF = requestAnimationFrame(followLoop);
    }
    function focusFollow(getPos, zoom) {
      const p0 = getPos(); if (!p0) return;
      following = getPos;
      const s0 = scale, s1 = clampS(fit * (zoom || 3)), t0 = performance.now(), dur = 480;
      (function anim(t) {
        if (following !== getPos) return;                 // cancelado por interacción
        const k = Math.min(1, (t - t0) / dur), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        scale = s0 + (s1 - s0) * e; targetScale = scale;
        lookAt(getPos() || p0);                            // sigue al objetivo durante el zoom
        if (k < 1) followRAF = requestAnimationFrame(anim);
        else followLoop();                                 // pasa a seguimiento continuo
      })(t0);
    }
    // Vuelve a encuadrar toda la finca (al cerrar el panel de personaje).
    function reset() {
      stopFollow();
      const vw = vp.clientWidth, vh = vp.clientHeight, s0 = scale, s1 = fit;
      const x0 = tx, y0 = ty, x1 = (vw - cv.width * s1) / 2, y1 = (vh - cv.height * s1) / 2;
      const t0 = performance.now(), dur = 420;
      (function anim(t) {
        const k = Math.min(1, (t - t0) / dur), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        scale = s0 + (s1 - s0) * e; targetScale = scale; tx = x0 + (x1 - x0) * e; ty = y0 + (y1 - y0) * e; apply();
        if (k < 1) requestAnimationFrame(anim);
      })(t0);
    }
    // centerOn (compat): enfoca un punto fijo sin seguimiento.
    function centerOn(lx, ly) { stopFollow(); focusFollow(() => [lx, ly], 3); stopFollow(); lookAt([lx, ly]); }
    return { centerOn, focusFollow, stopFollow, reset };
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
    const charEl = document.getElementById('hacp-char-panel');
    if (!panel || !listEl) return;
    // El panel vive DENTRO del visor: evita que sus clics/rueda burbujeen a los
    // manejadores de la cámara (que romperían el seguimiento) y al tap (que
    // deseleccionaría). Así puedes usar el selector y los botones sin perder el zoom.
    if (charEl) ['pointerdown', 'pointerup', 'wheel', 'click'].forEach(ev =>
      charEl.addEventListener(ev, (e) => e.stopPropagation(), { passive: false }));
    let pop = null;
    const hidePop = () => { if (pop) { pop.remove(); pop = null; } };
    const clock = () => (window.HacClock && HacClock.now) ? HacClock.now() : Date.now();
    function toast(msg) {
      const t = document.createElement('div'); t.className = 'hacp-toast'; t.textContent = msg;
      document.body.appendChild(t);
      requestAnimationFrame(() => t.classList.add('on'));
      setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.remove(), 450); }, 2200);
    }

    // ¿Cuál es el mecenas del USUARIO en ESTA hacienda? Solo a él puede darle
    // órdenes. walker.id = personajeId (el id de miembro es otro uuid).
    const _user = (window.Auth && Auth.current) ? Auth.current() : null;
    const _myPj = (_user && window.HacPersonajes && HacPersonajes.mine) ? HacPersonajes.mine(_user.id) : null;
    const _isMember = _myPj && (h.miembros || []).some(m => m.personajeId === _myPj.id);
    const myId = _isMember ? _myPj.id : null;
    const myApt = _myPj ? _myPj.aptitud : '';
    // Coste de una misión según si el mecenas DOMINA el dominio del edificio (suave).
    function costeMision(dominio) {
      const competente = window.HacCompetencias && dominio && HacCompetencias.has(h.id, myId, myApt, dominio);
      const base = (window.HacEnergia && HacEnergia.COSTE_MISION) || 34;
      return competente ? Math.round(base * 0.5) : base;
    }
    // Tareas disponibles para mandar: una por TAREA (por tipo de edificio), no por
    // instancia → si hay 4 cuarteles, sale una sola y el sim irá al más cercano.
    function availableTasks() {
      const types = HacFolk.buildingTypes ? HacFolk.buildingTypes() : [];
      const out = [];
      types.forEach(ty => {
        const tasks = (window.HacTareas && HacTareas.byTipo) ? HacTareas.byTipo(ty.tipo) : [];
        tasks.forEach(tk => out.push({ taskId: tk.id, nombre: tk.nombre || tk.verbo || 'Tarea', dominio: ty.dominio, duracionSeg: tk.duracionSeg || 60 }));
      });
      return out;
    }
    const fmtDur = (s) => (s < 60) ? Math.round(s) + 's' : Math.round(s / 60) + ' min';
    // Puntos de un mecenas: base (admin) + ganados en misiones (ledger propio).
    function basePuntos(id) { const m = (h.miembros || []).find(x => x.personajeId === id); return m ? (Number(m.puntos) || 0) : 0; }
    function puntosTotales(id) { return basePuntos(id) + (window.HacPuntos ? HacPuntos.deMiembro(h.id, id) : 0); }
    // Recompensa al COMPLETAR la tarea (no a tiempo fijo desde el envío): se detecta
    // cuando el sim termina la misión de mi mecenas (onMission true→false) o, si no
    // estaba mirando, por un tope de seguridad. Premia + limpia la orden (dedup).
    let _wasOnMission = false;
    function maybeRewardMyMission() {
      if (!myId || !window.HacOrdenes || !window.HacPuntos) return;
      const o = HacOrdenes.mine(h.id, myId);
      if (!o) { _wasOnMission = false; return; }
      const me = HacFolk.list().find(w => w.id === myId);
      const onM = !!(me && me.onMission);
      const hardDone = clock() > o.inicioMs + (o.duracionSeg || 60) * 1000 + 90000;   // saludo+viaje+tarea, con margen
      const liveDone = _wasOnMission && !onM;                                          // el sim la acaba de completar
      if (hardDone || liveDone) {
        const task = (window.HacTareas && HacTareas.get) ? HacTareas.get(o.targetId) : null;
        const dom = (task && window.HacBuild) ? (HacBuild.tipo(task.tipo) || {}).dominio : null;
        const r = HacPuntos.recompensa(costeMision(dom), o.duracionSeg || 60);
        HacPuntos.award(h.id, myId, r);
        HacOrdenes.clear(h.id, myId);   // optimista: la quita del caché ya
        toast('+' + r + ' puntos · misión cumplida');
        _wasOnMission = false;
        applyOrders();                  // re-sincroniza el sim sin la orden
        return;
      }
      _wasOnMission = onM;
    }
    const refresh = () => { renderList(); refreshCharPanel(); };
    let lastOrdersSig = '';

    function applyOrders() {
      if (!window.HacOrdenes) return;
      maybeRewardMyMission();   // premia/limpia mi misión si acaba de completarse
      const map = {};
      HacOrdenes.byHacienda(h.id).forEach(o => {
        map[o.miembroId] = { startMs: o.inicioMs, durMs: (o.duracionSeg || 60) * 1000, taskId: o.targetId, tipo: o.tipo };
      });
      const sig = JSON.stringify(map);
      if (sig !== lastOrdersSig) { lastOrdersSig = sig; if (HacFolk.setOrders) HacFolk.setOrders(map); }
      refresh();
    }
    function dispatch(taskId) {
      if (!myId || !taskId || !window.HacOrdenes) return;
      const t = availableTasks().find(x => x.taskId === taskId); if (!t) return;
      if (window.HacEnergia) HacEnergia.spend(h.id, myId, costeMision(t.dominio));   // la misión cuesta energía
      HacOrdenes.set({ haciendaId: h.id, miembroId: myId, tipo: 'mision', targetId: taskId, duracionSeg: t.duracionSeg })
        .then(applyOrders).catch(e => console.warn('[orden] set', e));
    }
    function release() {
      if (!myId || !window.HacOrdenes) return;
      HacOrdenes.clear(h.id, myId).then(applyOrders).catch(e => console.warn('[orden] clear', e));
    }

    // ── Selección / cámara ──────────────────────────────────────────────────
    // Clic en un mecenas: centra, hace zoom y lo SIGUE; abre su panel de control.
    function gotoMember(id) {
      hidePop();
      HacFolk.select(id);
      if (cam && cam.focusFollow) cam.focusFollow(() => HacFolk.position(id), 3.2);
      openCharPanel(id);
      renderList();
    }
    function deselect() {
      HacFolk.select(null);
      closeCharPanel();
      if (cam && cam.reset) cam.reset();
      renderList();
    }

    // ── Panel de control del personaje (overlay sobre el visor) ──────────────
    let charId = null, charSig = '';
    function charData(id) {
      const it = HacFolk.list().find(w => w.id === id);
      if (!it) return null;
      const pj = window.HacPersonajes ? HacPersonajes.get(id) : null;
      const aptId = pj ? pj.aptitud : '';
      const aptDef = (window.HacPersonajeDefs && aptId) ? HacPersonajeDefs.aptitud(aptId) : null;
      const e = Math.round(window.HacEnergia ? HacEnergia.current(h.id, id) : 100);
      // Estado de misión desde el SIM (no la orden): en misión / en tarea / restante
      // de la TAREA contado desde que LLEGA (el countdown empieza al iniciar la tarea).
      const activa = !!it.onMission;
      const enTarea = !!it.misEnTarea;
      const rest = it.misRestante || 0;
      const earned = window.HacPuntos ? HacPuntos.deMiembro(h.id, id) : 0;
      return { it, aptId, aptDef, e, activa, enTarea, rest, mine: id === myId, puntos: puntosTotales(id), earned };
    }
    function buildCharPanel(id) {
      const d = charData(id); if (!d) { closeCharPanel(); return; }
      let comp = '';
      if (window.HacCompetencias) {
        const eff = HacCompetencias.effective(h.id, id, d.aptId);
        comp = HacCompetencias.DOMINIOS.filter(x => eff.has(x)).map(x => { const def = HacCompetencias.def(x) || {}; return `<span title="${esc(def.nombre || x)}">${def.icon || ''}</span>`; }).join(' ');
      }
      let mision = '';
      if (d.mine) {
        if (d.activa) {
          const flag = d.enTarea ? `⚒ En la tarea · <b id="hacp-cp-rest">${d.rest}s</b>` : `⚒ De camino a la tarea…`;
          mision = `<div class="hacp-cp-mis hacp-cp-mis-on"><span class="hacp-cp-flag">${flag}</span><button type="button" class="hacp-cp-btn" data-act="release">Liberar</button></div>`;
        } else {
          const tasks = availableTasks();   // por TAREA (deduplicada por tipo), con su duración propia
          const opts = tasks.map(t => `<option value="${esc(t.taskId)}">${esc(t.nombre)} · ${fmtDur(t.duracionSeg)} · −${costeMision(t.dominio)}⚡</option>`).join('');
          if (tasks.length) mision = `<div class="hacp-cp-mis"><label class="hacp-cp-lbl">Enviar a misión</label><div class="hacp-cp-row"><select class="hacp-cp-sel">${opts}</select><button type="button" class="hacp-cp-btn hacp-cp-go" data-act="dispatch">Enviar</button></div></div>`;
        }
      }
      charEl.innerHTML = `
        <button type="button" class="hacp-cp-x" data-act="close" aria-label="Cerrar">✕</button>
        <div class="hacp-cp-head">
          <span class="hacp-cp-dot" style="--c:${esc(d.it.color)}"></span>
          <span class="hacp-cp-name">${esc(d.it.name)}${d.mine ? ' <em>(tú)</em>' : ''}</span>
        </div>
        ${d.aptDef ? `<div class="hacp-cp-apt">${d.aptDef.icon || ''} ${esc(d.aptDef.nombre)}${comp ? ' · domina ' + comp : ''}</div>` : (comp ? `<div class="hacp-cp-apt">domina ${comp}</div>` : '')}
        <div class="hacp-cp-pts">Puntos: <b id="hacp-cp-pts">${d.puntos}</b>${d.earned ? ` <span class="hacp-cp-earn">+${d.earned} en misiones</span>` : ''}</div>
        <div class="hacp-cp-act" id="hacp-cp-act">${d.it.inside ? '⌂ ' : ''}${esc(d.it.activity || 'Paseando por la finca')}</div>
        <div class="hacp-cp-energy" title="Energía ${d.e}%"><i id="hacp-cp-ebar" style="width:${d.e}%"></i></div>
        ${mision}`;
      charEl.querySelector('[data-act="close"]').addEventListener('click', deselect);
      const db = charEl.querySelector('[data-act="dispatch"]');
      if (db) db.addEventListener('click', () => { const s = charEl.querySelector('.hacp-cp-sel'); dispatch(s ? s.value : null); });
      const rb = charEl.querySelector('[data-act="release"]');
      if (rb) rb.addEventListener('click', release);
    }
    function sigOf(d) { return charId + '|' + (d.activa ? (d.enTarea ? 't' : 'g') : '-') + '|' + (d.mine ? 'me' : '-'); }
    function openCharPanel(id) {
      if (!charEl) return;
      charId = id; charEl.hidden = false;
      const d = charData(id); charSig = d ? sigOf(d) : '';
      buildCharPanel(id);
    }
    function closeCharPanel() { if (charEl) { charId = null; charEl.hidden = true; } }
    // Refresco ligero: actualiza actividad/energía/cuenta atrás sin rebuild (para
    // no resetear el <select>); solo reconstruye si cambia el "modo" (misión/tuyo).
    function refreshCharPanel() {
      if (!charId || !charEl) return;
      const d = charData(charId); if (!d) { closeCharPanel(); return; }
      if (sigOf(d) !== charSig) { charSig = sigOf(d); buildCharPanel(charId); return; }
      const pe = charEl.querySelector('#hacp-cp-pts'); if (pe) pe.textContent = d.puntos;
      const act = charEl.querySelector('#hacp-cp-act'); if (act) act.textContent = (d.it.inside ? '⌂ ' : '') + (d.it.activity || 'Paseando por la finca');
      const eb = charEl.querySelector('#hacp-cp-ebar'); if (eb) eb.style.width = d.e + '%';
      const rt = charEl.querySelector('#hacp-cp-rest'); if (rt && d.activa) rt.textContent = d.rest + 's';
    }

    function itemHTML(m, sel) {
      const mine = m.id === myId;
      const e = Math.round(window.HacEnergia ? HacEnergia.current(h.id, m.id) : 100);
      // Icono de "trabajando" (en misión): lo derivamos del estado COMPARTIDO, así
      // que todos los que miran la finca lo ven en ese mecenas.
      const work = m.onMission ? ' <span class="hacp-folk-work" title="En misión">⚒</span>' : '';
      return `<li><button class="hacp-folk-item${m.id === sel ? ' on' : ''}${mine ? ' mine' : ''}" data-id="${esc(m.id)}">
        <span class="hacp-folk-dot" style="--c:${esc(m.color)}"></span>
        <span class="hacp-folk-info">
          <span class="hacp-folk-name">${esc(m.name)}${work}${mine ? ' <em style="color:#7fc9a0;font-style:normal">(tú)</em>' : ''}</span>
          <span class="hacp-folk-state${m.inside ? ' inside' : ''}">${m.inside ? '⌂ ' : ''}${esc(m.activity || 'Paseando por la finca')}</span>
          <span class="hacp-folk-energy" title="Energía ${e}%" style="display:block;height:4px;margin-top:3px;border-radius:2px;background:rgba(255,255,255,.14);overflow:hidden"><i style="display:block;height:100%;width:${e}%;background:linear-gradient(90deg,#e0b85a,#7fc9a0)"></i></span>
        </span></button></li>`;
    }
    function renderList() {
      const items = HacFolk.list();
      if (!items.length) { panel.hidden = true; return; }
      panel.hidden = false;
      const sel = HacFolk.selected();
      // Tu mecenas, arriba del todo y separado del resto para encontrarlo fácil.
      const mineItem = myId ? items.find(m => m.id === myId) : null;
      const others = items.filter(m => m.id !== myId);
      let html = '';
      if (mineItem) html += `<li class="hacp-folk-sec">Tu mecenas</li>` + itemHTML(mineItem, sel) + `<li class="hacp-folk-div"></li>`;
      html += others.map(m => itemHTML(m, sel)).join('');
      listEl.innerHTML = html;
      listEl.querySelectorAll('.hacp-folk-item').forEach(b => b.addEventListener('click', () => gotoMember(b.dataset.id)));
    }

    HacFolk.start(iso, { mapa: h.mapa, tier, color, miembros: h.miembros, onState: applyOrders, seedKey: h.id, haciendaId: h.id, ordenes: {} });
    renderList();
    // Carga órdenes + energía + competencias (compartidas); refresca por poll (≤5 s).
    if (window.HacEnergia) HacEnergia.ready().then(refresh);
    if (window.HacCompetencias) HacCompetencias.ready().then(refresh);
    if (window.HacPuntos) HacPuntos.ready().then(refresh);
    if (window.HacOrdenes) {
      HacOrdenes.ready().then(applyOrders);
      setInterval(() => {
        if (window.HacEnergia) HacEnergia.reload();
        if (window.HacCompetencias) HacCompetencias.reload();
        if (window.HacPuntos) HacPuntos.reload();
        HacOrdenes.reload().then(applyOrders);
      }, 5000);
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

    // TAP en el plano: ¿banner de edificio? → popup; ¿un mecenas? → seleccionar;
    // si no, deseleccionar. Distinguimos tap de arrastre por el desplazamiento.
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
      const sign = (iso._hacSigns || []).find(s => lx >= s.lx && lx <= s.lx + s.w && ly >= s.ly && ly <= s.ly + s.h);
      if (sign) { showPop(e.clientX, e.clientY, sign); return; }
      // ¿clic sobre un mecenas? (caja ~ sprite, sobre sus pies en (px,py))
      let bestId = null, bestD = 1e9;
      HacFolk.list().forEach(w => {
        const p = HacFolk.position(w.id); if (!p) return;
        if (lx >= p[0] - 9 && lx <= p[0] + 9 && ly >= p[1] - 28 && ly <= p[1] + 5) {
          const d = Math.abs(ly - p[1]) + Math.abs(lx - p[0]); if (d < bestD) { bestD = d; bestId = w.id; }
        }
      });
      if (bestId) { gotoMember(bestId); return; }
      hidePop(); deselect();
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
