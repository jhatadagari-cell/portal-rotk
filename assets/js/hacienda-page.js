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
    // Prestigio colectivo (base + misiones) y progreso hasta el SIGUIENTE nivel
    // (null si ya está en el máximo) → barra superpuesta en el visor iso.
    const ledger = window.HacPuntos ? HacPuntos.totalHacienda(h.id) : 0;
    const prest  = HacCalc.prestigio(h, ledger);
    const prog   = HacCalc.progresoHacia(prest, tInfo);
    const prestBar = `
      <div class="hacp-iso-prestige" aria-hidden="true">
        <span class="hacp-isop-zh">${esc(tInfo.zh)}</span>
        <div class="hacp-isop-body">
          <div class="hacp-isop-top"><b>${prest.toLocaleString('es')}</b> prestigio · <span>Nivel ${tier} · ${esc(tInfo.nombre)}</span></div>
          <div class="hacp-isop-bar"><span style="width:${prog ? prog.pct : 100}%;background:${esc(color)}"></span></div>
          <div class="hacp-isop-lbl">${prog
            ? `Faltan <b>${prog.faltan.toLocaleString('es')}</b> para ${esc(prog.sig.zh)} ${esc(prog.sig.nombre)}`
            : '★ Nivel máximo alcanzado'}</div>
        </div>
      </div>`;

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
            ${prestBar}
            <button type="button" class="hacp-fs-btn" id="hacp-fs-btn" aria-label="Ver en pantalla completa" title="Ver en pantalla completa">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path class="hacp-fs-expand" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>
                <path class="hacp-fs-shrink" d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>
              </svg>
            </button>
            <span class="hacp-iso-hint">arrastra para mover · pellizca o ctrl+rueda para zoom</span>
            <div class="hacp-char-panel" id="hacp-char-panel" hidden></div>
            <button type="button" class="hacp-folk-fab" id="hacp-folk-fab" aria-label="Ver mecenas" title="Ver mecenas" hidden>众 <span id="hacp-folk-fab-n"></span></button>
            <aside class="hacp-folk-panel" id="hacp-folk-panel" hidden>
              <div class="hacp-folk-head">
                <h3 class="hacp-folk-ttl">Mecenas en la finca</h3>
                <button type="button" class="hacp-folk-min" id="hacp-folk-toggle" aria-label="Ocultar la lista" title="Ocultar">✕</button>
              </div>
              <div class="hacp-folk-body">
                <ul class="hacp-folk-list" id="hacp-folk-list"></ul>
              </div>
            </aside>
          </div>
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
    const clampS = (s) => Math.max(fit * 0.6, Math.min(fit * 14, s));
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

  // Botón de pantalla completa sobre el visor (vp). Usa la API nativa donde existe;
  // en iOS Safari (sin Fullscreen API para no-<video>) cae a un pseudo-fullscreen
  // por CSS (visor fijo a 100dvh). Avisa con 'resize' + evento propio para reencuadrar.
  function enableFullscreen(vp, btn) {
    if (!vp || !btn) return;
    const req = vp.requestFullscreen || vp.webkitRequestFullscreen;
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    const nativeOn = () => (document.fullscreenElement || document.webkitFullscreenElement) === vp;
    let pseudo = false;
    const on = () => nativeOn() || pseudo;
    const update = () => {
      const o = on();
      btn.classList.toggle('on', o);
      const label = o ? 'Salir de pantalla completa' : 'Ver en pantalla completa';
      btn.setAttribute('aria-label', label); btn.title = label;
      window.dispatchEvent(new Event('resize'));                       // reencuadra el visor
      document.dispatchEvent(new CustomEvent('hacp-fs', { detail: o }));
    };
    let vpHome = null;
    function setPseudo(v) {
      pseudo = v;
      // iOS: un ancestro con transform/filter convierte position:fixed en relativo a
      // ese ancestro → el visor no cubría la pantalla y todo se veía superpuesto.
      // Lo sacamos a <body> mientras dure la pantalla completa y lo devolvemos al salir.
      if (v) {
        if (!vpHome) vpHome = { parent: vp.parentNode, next: vp.nextSibling };
        document.body.appendChild(vp);
      } else if (vpHome) {
        vpHome.parent.insertBefore(vp, vpHome.next);
        vpHome = null;
      }
      document.documentElement.classList.toggle('hacp-pseudofs', v);
      vp.classList.toggle('hacp-pseudofs-el', v);
      update();
    }
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());   // no iniciar un arrastre del visor
    btn.addEventListener('click', () => {
      if (nativeOn()) { if (exit) exit.call(document); return; }
      if (pseudo) { setPseudo(false); return; }
      if (req) { try { const p = req.call(vp); if (p && p.catch) p.catch(() => setPseudo(true)); } catch (e) { setPseudo(true); } }
      else setPseudo(true);                                            // iOS: sin API → CSS
    });
    document.addEventListener('fullscreenchange', update);
    document.addEventListener('webkitfullscreenchange', update);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pseudo) setPseudo(false); });
    update();
  }

  // Tooltip con el nombre del pabellón al pasar el ratón por su patio. Mapea el
  // cursor a una celda (HacIso.cellAt, respeta pan/zoom) y la busca en pabPorCelda.
  function enablePabHover(vp, cv, pabPorCelda) {
    if (!vp || !cv || !window.HacIso || typeof HacIso.cellAt !== 'function') return;
    let tip = document.getElementById('hacp-pab-tip');
    if (!tip) { tip = document.createElement('div'); tip.id = 'hacp-pab-tip'; tip.className = 'hacp-pab-tip'; document.body.appendChild(tip); }
    const hide = () => { tip.style.display = 'none'; };
    // No mostrar el nombre del pabellón si el ratón está sobre un panel/overlay que
    // tapa el plano (panel del personaje, dársena, tienda, botones…): el patio está
    // DETRÁS y no se está señalando.
    const SOBRE_UI = '.hacp-char-panel, .hacp-folk-panel, .hacp-folk-fab, .hacp-shop, .hacp-cta, .hacp-mobar, .hacp-fs-btn, .hacp-iso-prestige';
    vp.addEventListener('mousemove', (e) => {
      if (e.target && e.target.closest && e.target.closest(SOBRE_UI)) { hide(); return; }
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
    // Tooltip propio de las stats (el title nativo no llega a salir porque las
    // tarjetas se reconstruyen cada segundo). Delegado en charEl (que persiste).
    let statTip = null;
    const placeTip = (x, y) => { statTip.style.left = Math.min(x + 13, window.innerWidth - statTip.offsetWidth - 8) + 'px'; statTip.style.top = Math.max(6, y - 10) + 'px'; };
    function hideStatTip() { if (statTip) statTip.style.display = 'none'; }
    if (charEl) {
      const tipOf = (e) => (e.target.closest && e.target.closest('.hacp-cp-stat'));
      charEl.addEventListener('mouseover', (e) => { const c = tipOf(e); if (!c || !c.dataset.tip) return; if (!statTip) { statTip = document.createElement('div'); statTip.className = 'hacp-stat-tip'; document.body.appendChild(statTip); } statTip.textContent = c.dataset.tip; statTip.style.display = 'block'; placeTip(e.clientX, e.clientY); });
      charEl.addEventListener('mousemove', (e) => { if (statTip && statTip.style.display === 'block' && tipOf(e)) placeTip(e.clientX, e.clientY); });
      charEl.addEventListener('mouseout', (e) => { if (tipOf(e)) hideStatTip(); });
    }
    // La lista de mecenas también vive DENTRO del visor → no debe burbujear al pan/tap.
    ['pointerdown', 'pointerup', 'wheel', 'click'].forEach(ev =>
      panel.addEventListener(ev, (e) => e.stopPropagation(), { passive: false }));
    // Dársena de mecenas: colapsa fuera de pantalla y deja un BOTONCITO flotante
    // (FAB) para reabrirla; dentro, una ✕ pequeña para ocultarla.
    const folkToggle = document.getElementById('hacp-folk-toggle');
    const folkFab = document.getElementById('hacp-folk-fab');
    const syncFab = () => { if (folkFab) folkFab.hidden = panel.hidden || !panel.classList.contains('collapsed'); };
    function folkCollapse(v) { panel.classList.toggle('collapsed', v); syncFab(); }
    if (folkToggle) folkToggle.addEventListener('click', (e) => { e.stopPropagation(); folkCollapse(true); });
    if (folkFab) {
      // El FAB vive en el visor: hay que frenar el pointerdown para que el visor no
      // capture el puntero (setPointerCapture) y se trague el click → si no, en
      // escritorio el botón "Ver mecenas" no reabría la dársena.
      folkFab.addEventListener('pointerdown', (e) => e.stopPropagation());
      folkFab.addEventListener('click', (e) => { e.stopPropagation(); folkCollapse(false); });
    }
    // Por defecto colapsada en pantallas estrechas (en escritorio, abierta).
    folkCollapse(window.innerWidth < 720);
    // En pantalla completa se colapsa por defecto (más mapa); al salir, se reabre.
    // Al ENTRAR en pantalla completa, recoge el cajón para no tapar el visor. Al
    // SALIR no lo forzamos abierto (eso era el bug del iPhone): restauramos el
    // estado por defecto según el ancho (recogido en móvil, desplegado en escritorio).
    const onFsFolk = () => { const fs = (document.fullscreenElement || document.webkitFullscreenElement) || document.documentElement.classList.contains('hacp-pseudofs'); folkCollapse(fs ? true : window.innerWidth < 720); };
    document.addEventListener('fullscreenchange', onFsFolk);
    document.addEventListener('webkitfullscreenchange', onFsFolk);
    document.addEventListener('hacp-fs', onFsFolk);   // pseudo-fullscreen (iOS)
    // Acceso directo a la tienda del mercado (si la finca tiene uno).
    const hasMarketEarly = ((h.mapa && h.mapa.construcciones) || []).some(c => c.tipo === 'mercado');
    if (hasMarketEarly && panel) {
      const mb = document.createElement('button');
      mb.type = 'button'; mb.className = 'hacp-folk-shop'; mb.textContent = '市 Mercado';
      mb.addEventListener('click', (e) => { e.stopPropagation(); openShop(); });
      listEl.parentNode.insertBefore(mb, listEl);   // arriba del listado, dentro del cuerpo
    }
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
    const hasMarket = ((h.mapa && h.mapa.construcciones) || []).some(c => c.tipo === 'mercado');
    // Edificio PRINCIPAL de la finca (sede del tablón de misiones), si existe.
    const mainCons = (window.HacBuild && HacBuild.edificioPrincipal) ? HacBuild.edificioPrincipal(h.mapa) : null;
    const hasMain = !!mainCons;
    const mainBid = mainCons ? (mainCons.pos[0] + ',' + mainCons.pos[1]) : null;
    // ── Barra de acciones MÓVIL (estilo app): secciones grandes en la zona del
    // pulgar (CSS la muestra solo en pantallas estrechas). Vive dentro del visor →
    // también en pantalla completa. Abre los paneles/hojas ya existentes.
    // (Va DESPUÉS de myId/hasMain/hasMarket para no leerlos en zona muerta.)
    const mobar = document.createElement('div');
    mobar.className = 'hacp-mobar';
    const moBtn = (icon, label, fn) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'hacp-mobar-btn';
      b.innerHTML = `<span class="ic">${icon}</span><span class="lb">${esc(label)}</span>`;
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
      return b;
    };
    if (myId) mobar.appendChild(moBtn('士', 'Tu mecenas', () => gotoMember(myId)));
    if (myId && hasMain) mobar.appendChild(moBtn('檄', 'Misiones', goConsultBoard));
    if (myId && hasMarket) mobar.appendChild(moBtn('市', 'Mercado', openShop));
    mobar.appendChild(moBtn('众', 'Mecenas', () => folkCollapse(false)));
    ['pointerdown', 'pointerup', 'wheel', 'click'].forEach(ev => mobar.addEventListener(ev, (e) => e.stopPropagation(), { passive: false }));
    vp.appendChild(mobar);
    // Casa de un mecenas = construcción 'casa' cuyo DUEÑO es su miembro (asignado en
    // el admin). El walker.id es el personajeId; el dueño de la casa es el id de miembro.
    function casaDe(personajeId) {
      const m = (h.miembros || []).find(x => x.personajeId === personajeId);
      if (!m) return null;
      const mid = String(m.id);
      return ((h.mapa && h.mapa.construcciones) || []).find(c => c.tipo === 'casa' && c.dueno != null && String(c.dueno) === mid) || null;
    }
    const PRECIO_CASA = 150;
    // Tope de monedas que caben en los BOLSILLOS (lo que te llevas al abandonar la
    // finca). El resto del dinero vive a salvo en la casa (宅). Sin casa, solo
    // conservas hasta este tope si te marchas.
    const BOLSILLO_MAX = 200;
    // SINERGIA DE PABELLÓN: bonos pasivos de la finca derivados del mapa (pabellones
    // temáticos + edificios de su dominio dentro). 文 → +XP misiones; 政 → +dinero
    // de misiones y −precios de mercado. Se calcula una vez (el mapa es estático aquí).
    const _pabs = (window.HacStore && HacStore.pabellones) ? HacStore.pabellones(h.id) : [];
    const bonos = (window.HacBuild && HacBuild.bonosPabellon)
      ? HacBuild.bonosPabellon(h.mapa, tier, _pabs)
      : { xp: 0, dinero: 0, mercado: 0, xpMil: 0, sinergia: { militar: 0, cultural: 0, administrativo: 0 } };
    // Fracción de XP extra para UNA misión: el bono cultural (政→文… 文) aplica a
    // todas; el militar (军) SOLO se suma en expediciones de dominio militar.
    const xpFracMision = (dom) => (bonos.xp || 0) + (dom === 'militar' ? (bonos.xpMil || 0) : 0);
    const conBono = (base, frac) => Math.round((base || 0) * (1 + (frac || 0)));        // recompensa con bono
    const precioMercado = (item) => Math.max(1, Math.round((item.precio || 0) * (1 - bonos.mercado)));   // precio con descuento 政
    const pct = (f) => Math.round((f || 0) * 100);
    const hayBonos = () => bonos.xp > 0 || bonos.dinero > 0 || bonos.mercado > 0 || bonos.xpMil > 0;
    // Resumen legible de los bonos activos de la finca (solo los no nulos).
    function bonosTexto() {
      const p = [];
      if (bonos.xp > 0) p.push(`<span style="color:#3a8a5a">文 +${pct(bonos.xp)}% XP</span>`);
      if (bonos.xpMil > 0) p.push(`<span style="color:#b23b2e">武 +${pct(bonos.xpMil)}% XP en exp. militares</span>`);
      if (bonos.dinero > 0) p.push(`<span style="color:#3a6ea5">政 +${pct(bonos.dinero)}% 💰</span>`);
      if (bonos.mercado > 0) p.push(`<span style="color:#3a6ea5">−${pct(bonos.mercado)}% 市</span>`);
      return p.join(' · ');
    }
    // Clave de casa con id de finca (evita colisiones "gx,gy" entre haciendas).
    const casaKey = (c) => h.id + '@' + c.pos[0] + ',' + c.pos[1];
    const casasFinca = () => ((h.mapa && h.mapa.construcciones) || []).filter(c => c.tipo === 'casa');
    // Casa de un mecenas: la asignada por el admin (dueño) O la que él COMPRÓ (casa_pos).
    function miCasa(personajeId) {
      if (casaDe(personajeId)) return casaDe(personajeId);
      const pos = (window.HacStats && HacStats.casaPos) ? HacStats.casaPos(personajeId) : null;
      return pos ? (casasFinca().find(c => casaKey(c) === pos) || null) : null;
    }
    // Primera casa LIBRE: ni asignada por el admin ni comprada por ningún mecenas.
    function casaLibre() {
      const reclamadas = (window.HacStats && HacStats.casasReclamadas) ? HacStats.casasReclamadas() : new Set();
      const asignadas = new Set(casasFinca().filter(c => c.dueno != null).map(casaKey));
      return casasFinca().find(c => !asignadas.has(casaKey(c)) && !reclamadas.has(casaKey(c))) || null;
    }
    // Coste de una misión según si el mecenas DOMINA el dominio del edificio (suave).
    function costeMision(dominio) {
      const competente = window.HacCompetencias && dominio && HacCompetencias.has(h.id, myId, myApt, dominio);
      const base = (window.HacEnergia && HacEnergia.COSTE_MISION) || 34;
      return competente ? Math.round(base * 0.5) : base;
    }
    // Energía de una MISIÓN del tablón: escala con la dificultad (las difíciles
    // cansan más); −40 % si tu mecenas domina el dominio.
    function costeExped(m) {
      const base = (window.HacMisiones && HacMisiones.coste) ? HacMisiones.coste(m) : 30;
      const competente = window.HacCompetencias && m.dom && HacCompetencias.has(h.id, myId, myApt, m.dom);
      return competente ? Math.round(base * 0.6) : base;
    }
    // ¿Mi mecenas DOMINA un dominio? (aptitud inicial ∪ competencias otorgadas)
    function dominaDominio(dominio) {
      return !!(window.HacCompetencias && dominio && HacCompetencias.has(h.id, myId, myApt, dominio));
    }
    // ¿Mi mecenas puede hacer la tarea de un tipo de edificio? Los edificios de
    // CLASE (restringido) solo admiten a quien domina su dominio (bloqueo DURO).
    function puedeTipo(tipo) {
      const def = (window.HacBuild && HacBuild.tipo) ? HacBuild.tipo(tipo) : null;
      if (!def || !def.restringido) return true;
      return dominaDominio(def.dominio);
    }
    // Tareas disponibles para mandar: una por TAREA (por tipo de edificio), no por
    // instancia → si hay 4 cuarteles, sale una sola y el sim irá al más cercano.
    // Las tareas de edificios restringidos se OCULTAN si mi mecenas no es apto.
    function availableTasks() {
      const types = HacFolk.buildingTypes ? HacFolk.buildingTypes() : [];
      const out = [];
      types.forEach(ty => {
        if (!puedeTipo(ty.tipo)) return;
        const tasks = (window.HacTareas && HacTareas.byTipo) ? HacTareas.byTipo(ty.tipo) : [];
        tasks.forEach(tk => out.push({ taskId: tk.id, nombre: tk.nombre || tk.verbo || 'Tarea', dominio: ty.dominio, duracionSeg: tk.duracionSeg || 60 }));
      });
      // Las misiones FUERA de la finca ya NO van aquí: se eligen en el TABLÓN de
      // misiones (📜) junto al edificio principal. Esta lista es solo de tareas
      // dentro de la finca (edificios).
      return out;
    }
    const DOM_GLYPH = { militar: '武', cultural: '文', administrativo: '政' };
    // Nivel EFECTIVO en un dominio (nivel por XP + bonos de equipo).
    function nivelEf(dom) { return (window.HacStats && HacStats.nivelTotal && dom) ? HacStats.nivelTotal(myId, dom) : 1; }
    // Riesgo de una MISIÓN del tablón: depende de tu nivel efectivo vs su dificultad.
    function riesgoMision(m) { return (window.HacMisiones) ? HacMisiones.riesgo(nivelEf(m.dom), m.dif) : 0.3; }
    const fmtDur = (s) => (s < 60) ? Math.round(s) + 's' : Math.round(s / 60) + ' min';
    // Cuenta atrás legible: «1m 45s» / «45s».
    const fmtClock = (s) => { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60), r = s % 60; return m ? `${m}m ${r}s` : `${r}s`; };
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
        let dom = null;
        const mis = (o.tipo === 'expedicion') ? (window.HacMisiones && HacMisiones.get(String(o.targetId || '').replace('mis:', ''))) : null;
        if (mis) dom = mis.dom;
        else if (o.tipo !== 'expedicion') { const task = (window.HacTareas && HacTareas.get) ? HacTareas.get(o.targetId) : null; dom = (task && window.HacBuild) ? (HacBuild.tipo(task.tipo) || {}).dominio : null; }
        // Las MISIONES del tablón (fuera) pueden FALLAR: el riesgo depende de tu nivel
        // efectivo vs la dificultad. Al fallar pierdes la mitad del MONEDERO (el ahorro
        // de casa está a salvo) y no traes botín ni prestigio. Las tareas DENTRO no fallan.
        if (mis && Math.random() < riesgoMision(mis)) {
          let lost = 0;
          if (window.HacStats) { const wallet = HacStats.dinero(myId); lost = Math.round(wallet * 0.5); if (lost > 0) HacStats.award(myId, { dinero: -lost }); }
          HacOrdenes.clear(h.id, myId);
          toast(lost > 0 ? `❌ Misión fallida · perdiste ${lost} 💰 del monedero` : '❌ Misión fallida · sin botín');
          _wasOnMission = false; applyOrders();
          return;
        }
        const r = HacPuntos.recompensa(costeMision(dom), o.duracionSeg || 60);
        HacPuntos.award(h.id, myId, r);
        // La misión del tablón da, además del prestigio, dinero + XP PERSONAL (al dominio).
        let extra = '';
        if (mis && window.HacStats) {
          const rec = HacMisiones.recompensa(mis);
          const dinB = conBono(rec.dinero, bonos.dinero), xpB = conBono(rec.xp, xpFracMision(rec.dom));   // bonos de pabellón (政 dinero, 文/武 XP)
          HacStats.award(myId, { dinero: dinB, xp: rec.dom ? { [rec.dom]: xpB } : null });
          extra = ` · +${dinB}💰 · +${xpB} XP ${DOM_GLYPH[rec.dom] || ''}`.trimEnd();
          // BOTÍN: prob. baja (sube con la dificultad) de traer 1 objeto. Si es de
          // energía, se aplica al momento; si es equipable, va a la mochila.
          const lootId = HacMisiones.botin ? HacMisiones.botin(mis) : null;
          const loot = lootId && window.HacTienda ? HacTienda.get(lootId) : null;
          if (loot) {
            if (loot.efecto && loot.efecto.energia) { if (window.HacEnergia) HacEnergia.add(h.id, myId, loot.efecto.energia); extra += ` · 🎁 ${loot.icon} ${loot.nombre}`; }
            else { const r2 = HacStats.darItem(myId, lootId); extra += r2.ok ? ` · 🎁 ${loot.icon} ${loot.nombre}` : ' · 🎁 (mochila llena)'; }
          }
        }
        HacOrdenes.clear(h.id, myId);   // optimista: la quita del caché ya
        toast('+' + r + ' puntos · misión cumplida' + extra);
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
      if (window.HacEnergia) HacEnergia.spend(h.id, myId, costeMision(t.dominio));   // la tarea cuesta energía
      HacOrdenes.set({ haciendaId: h.id, miembroId: myId, tipo: 'mision', targetId: taskId, duracionSeg: t.duracionSeg })
        .then(applyOrders).catch(e => console.warn('[orden] set', e));
    }
    // Enviar a una MISIÓN del tablón (sale de la finca, tipo 'expedicion').
    function dispatchMision(misId) {
      if (!myId || !window.HacOrdenes || !window.HacMisiones) return;
      const m = HacMisiones.get(misId); if (!m) return;
      if (window.HacEnergia) HacEnergia.spend(h.id, myId, costeExped(m));
      HacOrdenes.set({ haciendaId: h.id, miembroId: myId, tipo: 'expedicion', targetId: 'mis:' + misId, duracionSeg: HacMisiones.durSeg(m) })
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
      if (cam && cam.stopFollow) cam.stopFollow();   // deja de seguir, PERO mantiene el zoom/posición actual (sin zoom-out)
      renderList();
    }

    // ── Panel de control del personaje (overlay sobre el visor) ──────────────
    let charId = null, charSig = '', invOpen = false, lastStatsSig = '';
    let mShell = null;   // shell móvil (se rellena en setupMobileShell); null = escritorio
    function charData(id) {
      const it = HacFolk.list().find(w => w.id === id);
      if (!it) return null;
      const pj = window.HacPersonajes ? HacPersonajes.get(id) : null;
      const aptId = pj ? pj.aptitud : '';
      const aptDef = (window.HacPersonajeDefs && aptId) ? HacPersonajeDefs.aptitud(aptId) : null;
      const eExact = window.HacEnergia ? HacEnergia.current(h.id, id) : 100;
      const e = Math.round(eExact);
      const eFull = window.HacEnergia && HacEnergia.tiempoLleno ? HacEnergia.tiempoLleno(h.id, id) : 0;   // seg hasta llenar
      const eRegenMin = window.HacEnergia ? (HacEnergia.REGEN_POR_MIN || 0) : 0;                          // %/min
      // Estado de misión desde el SIM (no la orden): en misión / en tarea / restante
      // de la TAREA contado desde que LLEGA (el countdown empieza al iniciar la tarea).
      const activa = !!it.onMission;
      const enTarea = !!it.misEnTarea;
      const fuera = !!it.fuera;
      let rest = it.misRestante || 0;
      // Expedición: el tiempo restante REAL sale de la ORDEN (hora de servidor), así
      // se ve la cuenta atrás durante TODO el viaje (saliendo / fuera / regresando),
      // no solo cuando está oculto. Fuente de verdad = inicio + duración − ahora.
      let exped = false;
      if (id === myId && window.HacOrdenes) {
        const o = HacOrdenes.mine(h.id, id);
        if (o && o.tipo === 'expedicion') {
          exped = true;
          rest = Math.max(0, Math.ceil((o.inicioMs + (o.duracionSeg || 120) * 1000 - clock()) / 1000));
        }
      }
      const earned = window.HacPuntos ? HacPuntos.deMiembro(h.id, id) : 0;
      const money = (window.HacStats && HacStats.dinero) ? HacStats.dinero(id) : 0;   // monedero (XP/dinero reales)
      const home = !!miCasa(id);                                                       // ¿tiene casa (asignada o comprada)?
      const ahorro = (window.HacStats && HacStats.ahorro) ? HacStats.ahorro(id) : 0;   // dinero a salvo en casa
      // "Poder personal": nivel 武/文/政 derivado del XP de cada dominio.
      const stats = (window.HacStats && HacStats.progresoNivel)
        ? HacStats.DOMS.map(dom => { const p = HacStats.progresoNivel(id, dom); const b = HacStats.bonus ? HacStats.bonus(id, dom) : 0; return { dom, nivel: p.nivel, bonus: b, total: p.nivel + b, pct: p.pct, xp: p.xp, falta: p.falta }; })
        : null;
      const equipN = (window.HacStats && HacStats.equipados) ? HacStats.equipados(id).length : 0;
      const heridas = (window.HacStats && HacStats.heridas) ? HacStats.heridas(id) : 0;
      return { it, aptId, aptDef, e, eFull, eRegenMin, activa, enTarea, fuera, exped, rest, mine: id === myId, puntos: puntosTotales(id), earned, money, home, ahorro, stats, equipN, heridas };
    }
    // Panel de inventario/monedero que se despliega a la derecha del panel del
    // mecenas. Scaffolding: el dinero y los objetos llegarán al jugar misiones
    // (paso 1b/3). «Guardar en casa» queda bloqueado hasta que tenga una casa.
    function invPanelHTML(d) {
      const hasHome = !!d.home;   // tiene una "Casa de Mecenas" asignada
      const cap = (window.HacStats && HacStats.capInventario) ? HacStats.capInventario(d.it.id) : 8;
      const items = (window.HacStats && HacStats.inventario) ? HacStats.inventario(d.it.id) : [];
      // Aplana por cantidad y rellena hasta `cap` con ranuras vacías.
      const flat = [];
      items.forEach(it => { const def = window.HacTienda && HacTienda.get(it.id); for (let k = 0; k < (it.n || 1); k++) flat.push(def); });
      const slots = Array.from({ length: cap }, (_, i) => {
        const def = flat[i];
        return def ? `<div class="hacp-slot full" title="${esc(def.nombre)} ${esc(def.zh || '')}">${def.icon || '∎'}</div>` : '<div class="hacp-slot"></div>';
      }).join('');
      const canStore = hasHome && d.mine && d.money > 0;
      const canTake = hasHome && d.mine && d.ahorro > 0;
      const libre = (!hasHome && d.mine) ? casaLibre() : null;
      const canBuyHome = !!libre && d.money >= PRECIO_CASA;
      let homeBtns;
      if (hasHome) {
        homeBtns = `<button type="button" class="hacp-cp-btn hacp-gohome" data-act="gohome">🏠 Ir a casa</button>
          <div class="hacp-inv-note">En tu casa guardas el dinero a salvo y almacenas objetos.</div>`;
      } else if (libre) {
        homeBtns = `<button type="button" class="hacp-cp-btn hacp-buyhome" data-act="buyhome"${canBuyHome ? '' : ' disabled'}>🏠 Comprar casa · 💰 ${PRECIO_CASA}</button>
          <div class="hacp-inv-note">Compra una Casa de Mecenas libre de la finca para guardar tu dinero a salvo.${canBuyHome ? '' : ' (Aún no te llega el dinero.)'}</div>`;
      } else {
        homeBtns = `<button type="button" class="hacp-cp-btn hacp-store" data-act="store" disabled>🏠 Guardar dinero en casa</button>
          <div class="hacp-inv-note">🏠 Sin casas libres: pide al fundador que construya una <b>Casa de Mecenas</b> (宅) en la finca.</div>`;
      }
      return `<div class="hacp-inv">
        <div class="hacp-inv-h">🎒 Mochila de ${esc(d.it.name)}</div>
        <div class="hacp-wallet">💰 Monedero: <b>${d.money}</b> <span class="hacp-inv-note">monedas</span></div>
        ${hasHome ? `<div class="hacp-wallet hacp-vault">🏠 En casa: <b>${d.ahorro}</b> <span class="hacp-inv-note">a salvo</span></div>` : ''}
        <div class="hacp-inv-cap">Inventario <b>${flat.length}/${cap}</b></div>
        <div class="hacp-inv-grid">${slots}</div>
        ${marketBtnHTML()}
        ${homeBtns}
      </div>`;
    }
    // Botón para abrir la tienda, solo si la finca tiene un mercado construido.
    function marketBtnHTML() {
      return hasMarket ? `<button type="button" class="hacp-cp-btn hacp-cp-shop" data-act="shop">市 Comprar en el mercado</button>` : '';
    }
    // Texto transparente de energía: % + ritmo de regeneración + cuánto falta para
    // llenar (para TU mecenas; para los demás, solo el %).
    function energyLabel(d) {
      const pct = `⚡ <b>${d.e}%</b>`;
      if (!d.mine) return `${pct} energía`;
      const regen = d.eRegenMin ? ` · +${Math.round(d.eRegenMin)}%/min` : '';
      const full = d.e >= 100 ? ' · al máximo' : (d.eFull > 0 ? ` · lleno en ${fmtClock(d.eFull)}` : '');
      return `${pct}${regen}${full}`;
    }
    // Bloque de stats 武/文/政: nivel (derivado del XP) + barra hacia el siguiente.
    const DOM_NOMBRE = { militar: 'Militar', cultural: 'Cultural', administrativo: 'Administrativo' };
    const DOM_ABBR = { militar: 'Militar', cultural: 'Cultural', administrativo: 'Admin.' };
    const DOM_COLOR = { militar: '#b23b2e', cultural: '#3a8a5a', administrativo: '#3a6ea5' };
    function statsHTML(d) {
      if (!d.stats) return '';
      const chips = d.stats.map(s => {
        const tip = `${DOM_GLYPH[s.dom]} ${DOM_NOMBRE[s.dom]} · nivel ${s.nivel}${s.bonus ? ` (+${s.bonus} de equipo)` : ''} · ${s.xp} XP${s.falta ? ` · faltan ${s.falta} para el siguiente nivel` : ''}`;
        return `<div class="hacp-cp-stat" data-tip="${esc(tip)}" title="${esc(tip)}">
          <span class="hacp-cp-stat-h"><span class="hacp-cp-stat-g" style="color:${DOM_COLOR[s.dom]}">${DOM_GLYPH[s.dom]}</span><span class="hacp-cp-stat-nm">${DOM_ABBR[s.dom]}</span></span>
          <span class="hacp-cp-stat-n">${s.total}${s.bonus ? `<i class="hacp-cp-stat-eq">+${s.bonus}</i>` : ''}</span>
          <i class="hacp-cp-stat-bar"><b style="width:${Math.round(s.pct * 100)}%;background:${DOM_COLOR[s.dom]}"></b></i>
        </div>`;
      }).join('');
      return `<div class="hacp-cp-stats" id="hacp-cp-stats"><div class="hacp-cp-statslbl">Poder personal <span>· nivel por dominio</span></div><div class="hacp-cp-statsrow">${chips}</div></div>`;
    }
    // Heridas (0..3): tres ranuras; las llenas son heridas. Sin efecto jugable aún.
    function woundsHTML(d) {
      const n = Math.max(0, Math.min(3, d.heridas || 0));
      const slots = [0, 1, 2].map(i => `<span class="hacp-wound${i < n ? ' on' : ''}">${i < n ? '✚' : '·'}</span>`).join('');
      const txt = n ? `${n}/3 · se curan con el tiempo (aún sin efecto)` : 'ileso';
      return `<div class="hacp-cp-wounds${n ? ' hurt' : ''}" title="Heridas ${n}/3. Se reciben al fracasar escaramuzas. De momento no afectan.">
        <span class="hacp-wound-h">Heridas</span><span class="hacp-wound-slots">${slots}</span><span class="hacp-wound-txt">${txt}</span></div>`;
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
          const flag = d.exped ? `🧭 Expedición · vuelve en <b id="hacp-cp-rest">${fmtClock(d.rest)}</b>`
            : d.enTarea ? `⚒ En la tarea · <b id="hacp-cp-rest">${fmtClock(d.rest)}</b>`
            : `⚒ De camino…`;
          mision = `<div class="hacp-cp-mis hacp-cp-mis-on"><span class="hacp-cp-flag">${flag}</span><button type="button" class="hacp-cp-btn" data-act="release">Liberar</button></div>`;
        } else {
          const tasks = availableTasks();   // tareas DENTRO de la finca (edificios)
          const opts = tasks.map(t => `<option value="${esc(t.taskId)}">${esc(t.nombre)} · ${fmtDur(t.duracionSeg)} · −${costeMision(t.dominio)}⚡</option>`).join('');
          const board = hasMain ? `<button type="button" class="hacp-cp-btn hacp-cp-board" data-act="board">📜 Buscar misiones</button>` : '';
          const sel = tasks.length ? `<div class="hacp-cp-mis"><label class="hacp-cp-lbl">Tarea en la finca</label><div class="hacp-cp-row"><select class="hacp-cp-sel">${opts}</select><button type="button" class="hacp-cp-btn hacp-cp-go" data-act="dispatch">Enviar</button></div></div>` : '';
          mision = board + sel;
        }
      }
      charEl.innerHTML = `
        <button type="button" class="hacp-cp-x" data-act="close" aria-label="Cerrar">✕</button>
        <div class="hacp-cp-top">
          <canvas class="hacp-cp-avatar" width="64" height="92"></canvas>
          <div class="hacp-cp-id">
            <div class="hacp-cp-head">
              <span class="hacp-cp-dot" style="--c:${esc(d.it.color)}"></span>
              <span class="hacp-cp-name">${esc(d.it.name)}${d.mine ? ' <em>(tú)</em>' : ''}</span>
            </div>
            ${d.aptDef ? `<div class="hacp-cp-apt">${d.aptDef.icon || ''} ${esc(d.aptDef.nombre)}${comp ? ' · domina ' + comp : ''}</div>` : (comp ? `<div class="hacp-cp-apt">domina ${comp}</div>` : '')}
            <div class="hacp-cp-pts">Puntos: <b id="hacp-cp-pts">${d.puntos}</b>${d.earned ? ` <span class="hacp-cp-earn">+${d.earned} en misiones</span>` : ''}</div>
          </div>
        </div>
        <div class="hacp-cp-act" id="hacp-cp-act">${d.it.inside ? '⌂ ' : ''}${esc(d.it.activity || 'Paseando por la finca')}</div>
        <div class="hacp-cp-energy" title="Energía ${d.e}%"><i id="hacp-cp-ebar" style="width:${d.e}%"></i></div>
        <div class="hacp-cp-elabel" id="hacp-cp-elabel">${energyLabel(d)}</div>
        ${statsHTML(d)}
        ${woundsHTML(d)}
        ${(d.mine && hayBonos()) ? `<div class="hacp-cp-bonos" title="Bonos pasivos por los pabellones temáticos de la finca y los edificios de su dominio dentro">Bonos de la finca · ${bonosTexto()}</div>` : ''}
        ${d.mine ? `<button type="button" class="hacp-cp-btn hacp-cp-equipbtn" data-act="equip">⚔ Equipo${d.equipN ? ` · ${d.equipN}/3` : ''}</button>` : ''}
        ${mision}
        ${d.mine ? `<button type="button" class="hacp-cp-btn hacp-cp-invbtn${invOpen ? ' on' : ''}" data-act="inv">🎒 ${invOpen ? 'Ocultar' : 'Inventario'} · 💰 ${d.money}</button>` : ''}
        ${(d.mine && invOpen) ? invPanelHTML(d) : ''}
        ${d.mine ? `<button type="button" class="hacp-cp-btn hacp-cp-leave" data-act="leave">Abandonar la hacienda</button>` : ''}`;
      lastStatsSig = JSON.stringify(d.stats || 0);   // recién pintadas: marca su firma
      charEl.querySelector('[data-act="close"]').addEventListener('click', deselect);
      const db = charEl.querySelector('[data-act="dispatch"]');
      if (db) db.addEventListener('click', () => { const s = charEl.querySelector('.hacp-cp-sel'); dispatch(s ? s.value : null); });
      const rb = charEl.querySelector('[data-act="release"]');
      if (rb) rb.addEventListener('click', release);
      const bdb = charEl.querySelector('[data-act="board"]');
      if (bdb) bdb.addEventListener('click', goConsultBoard);
      const ib = charEl.querySelector('[data-act="inv"]');
      if (ib) ib.addEventListener('click', () => { invOpen = !invOpen; buildCharPanel(charId); });
      const shb = charEl.querySelector('[data-act="shop"]');
      if (shb) shb.addEventListener('click', openShop);
      const gh = charEl.querySelector('[data-act="gohome"]');
      if (gh) gh.addEventListener('click', openHome);
      const eqb = charEl.querySelector('[data-act="equip"]');
      if (eqb) eqb.addEventListener('click', openEquip);
      const lvb = charEl.querySelector('[data-act="leave"]');
      if (lvb) lvb.addEventListener('click', openLeave);
      const bh = charEl.querySelector('[data-act="buyhome"]');
      if (bh && !bh.disabled) bh.addEventListener('click', () => {
        if (!myId || !window.HacStats) return;
        const lib = casaLibre();                          // re-evalúa por si otra ya la compró
        if (!lib) { toast('Ya no hay casas libres'); buildCharPanel(charId); return; }
        const res = HacStats.comprarCasa(myId, casaKey(lib), PRECIO_CASA);
        if (res.ok) { toast(`🏠 ¡Compraste una casa por ${PRECIO_CASA} 💰!`); buildCharPanel(charId); }
        else toast(res.motivo || 'No se pudo comprar la casa');
      });
    }
    function sigOf(d) { return charId + '|' + (d.activa ? (d.enTarea ? 't' : 'g') : '-') + '|' + (d.mine ? 'me' : '-'); }
    // Retrato animado: pinta el sprite ACTUAL del mecenas (dir/andar/sentado) cada
    // frame mientras el panel está abierto. Funciona también a pantalla completa.
    let avatarRAF = null;
    function startAvatar() {
      stopAvatar();
      (function loop() {
        if (!charId) { avatarRAF = null; return; }
        const cv = charEl && charEl.querySelector('.hacp-cp-avatar');
        if (cv && HacFolk.drawAvatar) HacFolk.drawAvatar(cv, charId);
        avatarRAF = requestAnimationFrame(loop);
      })();
    }
    function stopAvatar() { if (avatarRAF) { cancelAnimationFrame(avatarRAF); avatarRAF = null; } }
    function openCharPanel(id) {
      if (!charEl) return;
      if (mShell) { mShell.showChar(id); return; }         // móvil: el panel vive en la sección Personaje
      charId = id; charEl.hidden = false;
      if (window.innerWidth <= 600) folkCollapse(true);   // en móvil, no solapar con la dársena
      const d = charData(id); charSig = d ? sigOf(d) : '';
      buildCharPanel(id);
      startAvatar();
    }
    function closeCharPanel() { if (charEl) { charId = null; charEl.hidden = true; } hideStatTip(); stopAvatar(); }
    // Refresco ligero: actualiza actividad/energía/cuenta atrás sin rebuild (para
    // no resetear el <select>); solo reconstruye si cambia el "modo" (misión/tuyo).
    function refreshCharPanel() {
      if (!charId || !charEl) return;
      const d = charData(charId); if (!d) { closeCharPanel(); return; }
      if (sigOf(d) !== charSig) { charSig = sigOf(d); buildCharPanel(charId); return; }
      const pe = charEl.querySelector('#hacp-cp-pts'); if (pe) pe.textContent = d.puntos;
      const act = charEl.querySelector('#hacp-cp-act'); if (act) act.textContent = (d.it.inside ? '⌂ ' : '') + (d.it.activity || 'Paseando por la finca');
      const eb = charEl.querySelector('#hacp-cp-ebar'); if (eb) eb.style.width = d.e + '%';
      const el = charEl.querySelector('#hacp-cp-elabel'); if (el) el.innerHTML = energyLabel(d);
      // Solo reconstruye las stats si CAMBIARON (si no, se reiniciaría el hover/tooltip cada segundo).
      const st = charEl.querySelector('#hacp-cp-stats'); const sig = JSON.stringify(d.stats || 0);
      if (st && sig !== lastStatsSig) { lastStatsSig = sig; st.outerHTML = statsHTML(d); }
      const rt = charEl.querySelector('#hacp-cp-rest'); if (rt && d.activa) rt.textContent = fmtClock(d.rest);
    }

    // ── Tienda del mercado (overlay) ─────────────────────────────────────────
    // Artículos por tier (el mercado "mejora" con el nivel de la finca): los de
    // tier ≤ nivel se pueden comprar; los de tier mayor salen bloqueados. La
    // compra gasta el dinero del mecenas propio y aplica el efecto al momento.
    let shopEl = null;
    function ensureShopEl() {
      if (shopEl) return shopEl;
      shopEl = document.createElement('div');
      shopEl.className = 'hacp-shop'; shopEl.id = 'hacp-shop'; shopEl.hidden = true;
      vp.appendChild(shopEl);
      ['pointerdown', 'pointerup', 'wheel', 'click'].forEach(ev => shopEl.addEventListener(ev, (e) => e.stopPropagation(), { passive: false }));
      shopEl.addEventListener('click', (e) => { if (e.target === shopEl) closeShop(); });   // tocar fuera cierra
      return shopEl;
    }
    function itemCardHTML(item, locked) {
      const money = window.HacStats ? HacStats.dinero(myId) : 0;
      const precio = precioMercado(item), rebaja = bonos.mercado > 0 && precio < item.precio;
      const noMoney = money < precio;
      const disabled = locked || !myId || noMoney;
      const precioHTML = rebaja ? `<s>${item.precio}</s> ${precio}` : `${item.precio}`;
      const btn = locked
        ? `<span class="hacp-item-lock">🔒 Nivel ${item.tier}</span>`
        : `<button type="button" class="hacp-item-buy" data-buy="${esc(item.id)}"${disabled ? ' disabled' : ''}>💰 ${precioHTML}</button>`;
      return `<div class="hacp-item${locked ? ' locked' : ''}${item.tipo ? ' t-' + item.tipo : ''}">
        <div class="hacp-item-ic">${item.icon || '∎'}</div>
        <div class="hacp-item-main">
          <div class="hacp-item-name">${esc(item.nombre)} <span class="zh">${esc(item.zh || '')}</span></div>
          <div class="hacp-item-ef">${esc(HacTienda.efectoTexto(item))}</div>
        </div>${btn}</div>`;
    }
    function buildShop() {
      const el = ensureShopEl();
      const money = window.HacStats ? HacStats.dinero(myId) : 0;
      const disp = HacTienda.disponibles(tier), block = HacTienda.bloqueados(tier);
      const note = !myId ? `<div class="hacp-shop-note">Entra con tu mecenas en esta finca para comprar.</div>` : '';
      el.innerHTML = `
        <div class="hacp-shop-box">
          <button type="button" class="hacp-shop-x" data-act="shop-close" aria-label="Cerrar">✕</button>
          <div class="hacp-shop-h"><span class="hacp-shop-zh">市</span> Mercado <span class="hacp-shop-money">💰 <b id="hacp-shop-money">${money}</b></span></div>
          <div class="hacp-shop-sub">Surtido según el nivel de la finca (nivel ${tier}). Sube de nivel para desbloquear más.</div>
          ${bonos.mercado > 0 ? `<div class="hacp-shop-note">市 Pabellón administrativo (政): −${pct(bonos.mercado)}% en todos los precios.</div>` : ''}
          ${note}
          <div class="hacp-shop-grid">${disp.map(i => itemCardHTML(i, false)).join('')}</div>
          ${block.length ? `<div class="hacp-shop-lockttl">Se desbloquean al subir de nivel</div><div class="hacp-shop-grid">${block.map(i => itemCardHTML(i, true)).join('')}</div>` : ''}
        </div>`;
      el.querySelector('[data-act="shop-close"]').addEventListener('click', closeShop);
      el.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => buyItem(HacTienda.get(b.dataset.buy))));
    }
    function openShop() { if (!hasMarket) return; buildShop(); ensureShopEl().hidden = false; }
    function closeShop() { if (shopEl) shopEl.hidden = true; }
    function buyItem(item) {
      if (!item || !myId || !window.HacStats) return;
      if (item.tier > tier) { toast('🔒 Necesita una finca de nivel ' + item.tier); return; }
      const res = HacStats.comprar(myId, item, precioMercado(item));   // precio con descuento del pabellón 政
      if (!res.ok) { toast(res.motivo || 'No se pudo comprar'); return; }
      if (item.efecto && item.efecto.energia && window.HacEnergia) HacEnergia.add(h.id, myId, item.efecto.energia);
      toast(`${item.icon || ''} ${item.nombre} · ${HacTienda.efectoTexto(item)}`.trim());
      buildShop();                 // refresca dinero y botones
      if (charId) buildCharPanel(charId);   // refresca monedero/inventario/energía
    }

    // ── Abandonar la hacienda (lo decide el jugador) ─────────────────────────
    // Overlay con resumen claro de lo que TE LLEVAS y lo que DEJAS ATRÁS, más
    // doble confirmación (abrir el aviso + pulsar dos veces el botón) para que no
    // ocurra por error. Te marchas con stats + equipo + mochila + monedas que
    // quepan en los bolsillos; dejas la casa (propiedad, bóveda y objetos).
    let leaveEl = null;
    function ensureLeaveEl() {
      if (leaveEl) return leaveEl;
      leaveEl = document.createElement('div');
      leaveEl.className = 'hacp-shop hacp-leave-ov'; leaveEl.id = 'hacp-leave'; leaveEl.hidden = true;
      vp.appendChild(leaveEl);
      ['pointerdown', 'pointerup', 'wheel', 'click'].forEach(ev => leaveEl.addEventListener(ev, (e) => e.stopPropagation(), { passive: false }));
      leaveEl.addEventListener('click', (e) => { if (e.target === leaveEl) closeLeave(); });
      return leaveEl;
    }
    function buildLeave() {
      const el = ensureLeaveEl(), S = window.HacStats;
      const money = S ? S.dinero(myId) : 0;
      const ahorro = (S && S.ahorro) ? S.ahorro(myId) : 0;
      const cap = (S && S.capInventario) ? S.capInventario(myId) : 8;
      const invN = (S && S.ocupadas) ? S.ocupadas(myId) : 0;
      const casaItems = ((S && S.casaInventario) ? S.casaInventario(myId) : []).reduce((s, it) => s + (it.n || 1), 0);
      const hasHome = !!miCasa(myId);   // asignada por el admin O comprada
      const eqN = (S && S.equipados) ? S.equipados(myId).length : 0;
      const llevado = Math.min(money, BOLSILLO_MAX);
      const perdido = Math.max(0, money - BOLSILLO_MAX);
      const nadaPierde = !hasHome && !ahorro && !casaItems && !perdido;
      el.innerHTML = `
        <div class="hacp-shop-box hacp-leave-box">
          <button type="button" class="hacp-shop-x" data-act="leave-close" aria-label="Cerrar">✕</button>
          <div class="hacp-shop-h hacp-leave-h">⚠ Abandonar ${esc(h.nombre || 'la hacienda')}</div>
          <div class="hacp-shop-sub">Tu mecenas se marchará de esta finca. <b>Esto no se puede deshacer.</b></div>
          <div class="hacp-leave-cols">
            <div class="hacp-leave-col keep">
              <div class="hacp-leave-colh">Te llevas</div>
              <ul>
                <li>Tu progreso (niveles 武 文 政)</li>
                <li>Lo que llevas equipado${eqN ? ` · ${eqN}/3` : ''}</li>
                <li>Tu mochila · ${invN}/${cap} objetos</li>
                <li>💰 ${llevado} monedas en los bolsillos${perdido ? ` <span class="hacp-leave-cap">(caben ${BOLSILLO_MAX})</span>` : ''}</li>
              </ul>
            </div>
            <div class="hacp-leave-col lose">
              <div class="hacp-leave-colh">Dejas atrás</div>
              <ul>
                ${hasHome ? `<li>🏠 Tu casa de esta finca</li>` : `<li class="muted">No tienes casa aquí</li>`}
                ${ahorro ? `<li>💰 ${ahorro} a salvo en casa</li>` : ''}
                ${casaItems ? `<li>📦 ${casaItems} objetos guardados en casa</li>` : ''}
                ${perdido ? `<li>💰 ${perdido} monedas que no caben encima</li>` : ''}
                ${nadaPierde ? `<li class="muted">Nada más</li>` : ''}
              </ul>
            </div>
          </div>
          <div class="hacp-leave-actions">
            <button type="button" class="hacp-cp-btn" data-act="leave-cancel">Cancelar</button>
            <button type="button" class="hacp-cp-btn hacp-leave-go" data-act="leave-go">Abandonar la hacienda</button>
          </div>
        </div>`;
      el.querySelector('[data-act="leave-close"]').addEventListener('click', closeLeave);
      el.querySelector('[data-act="leave-cancel"]').addEventListener('click', closeLeave);
      const go = el.querySelector('[data-act="leave-go"]');
      let armed = false, t = null;
      go.addEventListener('click', () => {
        if (!armed) {   // primer toque: ARMA el botón (segunda confirmación)
          armed = true; go.classList.add('armed'); go.textContent = 'Pulsa otra vez para confirmar';
          t = setTimeout(() => { armed = false; go.classList.remove('armed'); go.textContent = 'Abandonar la hacienda'; }, 4000);
          return;
        }
        if (t) clearTimeout(t);
        doLeave();
      });
    }
    function openLeave() { if (!myId || !_isMember) return; buildLeave(); ensureLeaveEl().hidden = false; }
    function closeLeave() { if (leaveEl) leaveEl.hidden = true; }
    async function doLeave() {
      if (!myId || !_isMember || !window.HacStore) return;
      closeLeave();
      const me = (h.miembros || []).find(m => m.personajeId === myId);
      if (!me) { toast('No formas parte de esta hacienda'); return; }
      // Libera la casa ASIGNADA por el admin (dueno = id de miembro) en el mapa.
      if (h.mapa && Array.isArray(h.mapa.construcciones)) {
        h.mapa.construcciones.forEach(c => { if (c.tipo === 'casa' && c.dueno != null && String(c.dueno) === String(me.id)) c.dueno = null; });
      }
      h.miembros = (h.miembros || []).filter(m => m.personajeId !== myId);   // sale de la lista
      if (window.HacStats && HacStats.abandonar) HacStats.abandonar(myId, BOLSILLO_MAX);   // mochila/equipo/xp + bolsillos; libera casa COMPRADA
      try { await HacStore.upsert(h); } catch (e) { console.error('[abandonar]', e); }     // persiste los miembros
      // Limpia la SOLICITUD aprobada: si no, el onboard seguiría creyéndote miembro
      // (la pertenencia fantasma). El onboard también reconcilia por si esto falla.
      if (window.HacSolicitudes) {
        try { const s = await HacSolicitudes.mine(); if (s && s.haciendaId === h.id) await HacSolicitudes.cancelar(s.id); }
        catch (e) { console.warn('[abandonar] limpiar solicitud', e); }
      }
      toast('🚪 Has abandonado la hacienda…');
      setTimeout(() => { location.href = 'haciendas.html'; }, 800);
    }

    // ── Casa (gestiones del hogar): overlay con dinero + objetos ─────────────
    // "Ir a casa" abre este panel; allí guardas/sacas dinero y mueves objetos
    // entre la mochila y el almacén de la casa.
    let homeEl = null;
    function ensureHomeEl() {
      if (homeEl) return homeEl;
      homeEl = document.createElement('div');
      homeEl.className = 'hacp-shop hacp-home-ov'; homeEl.id = 'hacp-home'; homeEl.hidden = true;
      vp.appendChild(homeEl);
      ['pointerdown', 'pointerup', 'wheel', 'click'].forEach(ev => homeEl.addEventListener(ev, (e) => e.stopPropagation(), { passive: false }));
      homeEl.addEventListener('click', (e) => { if (e.target === homeEl) closeHome(); });
      return homeEl;
    }
    function objChip(it, dir) {
      const def = window.HacTienda && HacTienda.get(it.id), ic = def ? def.icon : '∎', nm = def ? def.nombre : it.id;
      const cnt = (it.n || 1) > 1 ? ` ×${it.n}` : '';
      return dir === 'store'
        ? `<button type="button" class="hacp-obj" data-mov="${esc(it.id)}" title="Guardar en casa">${ic} ${esc(nm)}${cnt} →</button>`
        : `<button type="button" class="hacp-obj" data-take="${esc(it.id)}" title="Llevar a la mochila">← ${ic} ${esc(nm)}${cnt}</button>`;
    }
    function buildHome() {
      const el = ensureHomeEl();
      const money = HacStats.dinero(myId), ahorro = HacStats.ahorro(myId);
      const mochila = HacStats.inventario(myId), casa = HacStats.casaInventario(myId);
      const cap = HacStats.capInventario(myId), nMo = mochila.reduce((s, i) => s + (i.n || 1), 0);
      const me = HacFolk.list().find(w => w.id === myId), nm = me ? me.name : 'tu mecenas';
      const moch = mochila.length ? mochila.map(it => objChip(it, 'store')).join('') : '<span class="hacp-inv-note">Mochila vacía</span>';
      const enc = casa.length ? casa.map(it => objChip(it, 'take')).join('') : '<span class="hacp-inv-note">Nada guardado</span>';
      el.innerHTML = `
        <div class="hacp-shop-box">
          <button type="button" class="hacp-shop-x" data-act="home-close" aria-label="Cerrar">✕</button>
          <div class="hacp-shop-h"><span class="hacp-shop-zh">宅</span> Casa de ${esc(nm)}</div>
          <div class="hacp-shop-sub">Aquí tu dinero y tus objetos están a salvo (no se pierden en expediciones).</div>
          <div class="hacp-home-money">
            <span>💰 Monedero: <b>${money}</b></span><span>🏠 En casa: <b class="g">${ahorro}</b></span>
          </div>
          <div class="hacp-home-row2">
            <button type="button" class="hacp-cp-btn" data-act="home-store"${money > 0 ? '' : ' disabled'}>🏠 Guardar todo</button>
            <button type="button" class="hacp-cp-btn" data-act="home-take"${ahorro > 0 ? '' : ' disabled'}>👛 Sacar todo</button>
          </div>
          <div class="hacp-home-objs">
            <div class="hacp-home-col"><div class="hacp-home-colh">🎒 Mochila <span>${nMo}/${cap}</span></div><div class="hacp-home-list">${moch}</div></div>
            <div class="hacp-home-col"><div class="hacp-home-colh">🏠 Almacén de casa</div><div class="hacp-home-list">${enc}</div></div>
          </div>
        </div>`;
      el.querySelector('[data-act="home-close"]').addEventListener('click', closeHome);
      const refrescar = () => { buildHome(); if (charId) buildCharPanel(charId); };
      const ms = el.querySelector('[data-act="home-store"]'); if (ms && !ms.disabled) ms.addEventListener('click', () => { const n = HacStats.guardar(myId); if (n > 0) toast(`🏠 Guardaste ${n} 💰`); refrescar(); });
      const mt = el.querySelector('[data-act="home-take"]'); if (mt && !mt.disabled) mt.addEventListener('click', () => { const n = HacStats.sacar(myId); if (n > 0) toast(`👛 Sacaste ${n} 💰`); refrescar(); });
      el.querySelectorAll('[data-mov]').forEach(b => b.addEventListener('click', () => { const r = HacStats.meterEnCasa(myId, b.dataset.mov); if (!r.ok) toast(r.motivo); refrescar(); }));
      el.querySelectorAll('[data-take]').forEach(b => b.addEventListener('click', () => { const r = HacStats.sacarDeCasa(myId, b.dataset.take); if (!r.ok) toast(r.motivo); refrescar(); }));
    }
    // El mecenas CAMINA hasta su casa y, al llegar, se abre el panel de gestiones.
    let homeTimer = null;
    function openHome() {
      if (!myId || !window.HacStats) return;
      const casa = miCasa(myId); if (!casa) return;
      const bid = casa.pos[0] + ',' + casa.pos[1];
      let opened = false;
      const doOpen = () => { if (opened) return; opened = true; if (homeTimer) { clearTimeout(homeTimer); homeTimer = null; } buildHome(); ensureHomeEl().hidden = false; };
      const r = HacFolk.goHome ? HacFolk.goHome(myId, bid, doOpen) : false;
      if (opened) return;                 // ya estaba en casa / sin ruta → abrió al instante
      if (!r) { doOpen(); return; }       // ocupado (misión) o sin API → abre directamente
      // Echó a andar: sigue al mecenas con la cámara y abre al llegar (fallback 8 s).
      HacFolk.select(myId);
      if (cam && cam.focusFollow) cam.focusFollow(() => HacFolk.position(myId), 3.2);
      toast('🚶 Tu mecenas va a casa…');
      homeTimer = setTimeout(doOpen, 8000);
    }
    function closeHome() { if (homeEl) homeEl.hidden = true; }

    // ── Equipo del mecenas (overlay): hasta 3 objetos equipados que dan +stats ──
    let equipEl = null;
    function ensureEquipEl() {
      if (equipEl) return equipEl;
      equipEl = document.createElement('div');
      equipEl.className = 'hacp-shop hacp-equip-ov'; equipEl.id = 'hacp-equip'; equipEl.hidden = true;
      vp.appendChild(equipEl);
      ['pointerdown', 'pointerup', 'wheel', 'click'].forEach(ev => equipEl.addEventListener(ev, (e) => e.stopPropagation(), { passive: false }));
      equipEl.addEventListener('click', (e) => { if (e.target === equipEl) closeEquip(); });
      return equipEl;
    }
    function buildEquip() {
      const el = ensureEquipEl();
      const eq = HacStats.equipados(myId);
      const max = HacStats.MAX_EQUIP || 3;
      const me = HacFolk.list().find(w => w.id === myId), nm = me ? me.name : 'tu mecenas';
      // Bonos totales por dominio (de lo equipado).
      const tot = HacStats.DOMS.map(dom => ({ dom, b: HacStats.bonus(myId, dom) }));
      const totHTML = tot.map(t => `<span class="hacp-eq-tot" style="color:${DOM_COLOR[t.dom]}">${DOM_GLYPH[t.dom]} <b>${t.b > 0 ? '+' + t.b : '0'}</b></span>`).join('');
      // Ranuras equipadas.
      const slots = [];
      for (let i = 0; i < max; i++) {
        const id = eq[i], def = id && HacTienda.get(id);
        slots.push(def
          ? `<button type="button" class="hacp-eq-slot full" data-uneq="${esc(id)}" title="${esc(def.nombre)} · clic para quitar"><span class="hacp-eq-ic">${def.icon}</span><span class="hacp-eq-nm">${esc(def.nombre)}</span><span class="hacp-eq-bo">${esc(HacTienda.efectoTexto(def).replace(' · equipable', ''))}</span><span class="hacp-eq-x">✕</span></button>`
          : `<div class="hacp-eq-slot empty">Ranura libre</div>`);
      }
      // Objetos equipables en la mochila (no equipados).
      const ownable = HacStats.inventario(myId).filter(it => HacTienda.equipBonus(it.id));
      const list = ownable.length
        ? ownable.map(it => { const def = HacTienda.get(it.id); const full = eq.length >= max; return `<button type="button" class="hacp-eq-own" data-eq="${esc(it.id)}"${full ? ' disabled' : ''}><span class="hacp-eq-ic">${def.icon}</span><span class="hacp-eq-nm">${esc(def.nombre)}${(it.n || 1) > 1 ? ' ×' + it.n : ''}</span><span class="hacp-eq-bo">${esc(HacTienda.efectoTexto(def).replace(' · equipable', ''))}</span></button>`; }).join('')
        : '<span class="hacp-inv-note">No tienes objetos equipables. Cómpralos en el mercado (tratados 兵書/經卷/律令…).</span>';
      el.innerHTML = `
        <div class="hacp-shop-box hacp-eq-box">
          <button type="button" class="hacp-shop-x" data-act="equip-close" aria-label="Cerrar">✕</button>
          <div class="hacp-shop-h"><span class="hacp-shop-zh">⚔</span> Equipo de ${esc(nm)}</div>
          <div class="hacp-shop-sub">Equipa hasta ${max} objetos. Suman a tus dominios mientras los llevas. Bonos: ${totHTML}</div>
          <div class="hacp-eq-slots">${slots.join('')}</div>
          <div class="hacp-eq-h">En la mochila</div>
          <div class="hacp-eq-list">${list}</div>
        </div>`;
      el.querySelector('[data-act="equip-close"]').addEventListener('click', closeEquip);
      const refrescar = () => { buildEquip(); if (charId) buildCharPanel(charId); };
      el.querySelectorAll('[data-eq]').forEach(b => b.addEventListener('click', () => { const r = HacStats.equipar(myId, b.dataset.eq); if (!r.ok) toast(r.motivo); refrescar(); }));
      el.querySelectorAll('[data-uneq]').forEach(b => b.addEventListener('click', () => { const r = HacStats.desequipar(myId, b.dataset.uneq); if (!r.ok) toast(r.motivo); refrescar(); }));
    }
    function openEquip() { if (!myId || !window.HacStats) return; buildEquip(); ensureEquipEl().hidden = false; }
    function closeEquip() { if (equipEl) equipEl.hidden = true; }

    // ── Tablón de misiones (overlay): pool con riesgo según tus stats ──────────
    let boardEl = null;
    function ensureBoardEl() {
      if (boardEl) return boardEl;
      boardEl = document.createElement('div');
      boardEl.className = 'hacp-shop hacp-board-ov'; boardEl.id = 'hacp-board'; boardEl.hidden = true;
      vp.appendChild(boardEl);
      ['pointerdown', 'pointerup', 'wheel', 'click'].forEach(ev => boardEl.addEventListener(ev, (e) => e.stopPropagation(), { passive: false }));
      boardEl.addEventListener('click', (e) => { if (e.target === boardEl) closeBoard(); });
      return boardEl;
    }
    function buildBoard() {
      const el = ensureBoardEl();
      const list = window.HacMisiones ? HacMisiones.disponibles(tier) : [];
      const orden = window.HacOrdenes ? HacOrdenes.mine(h.id, myId) : null;
      const ocupado = !!orden;
      const energia = window.HacEnergia ? HacEnergia.current(h.id, myId) : 100;
      const rows = list.slice().sort((a, b) => (a.dom < b.dom ? -1 : a.dom > b.dom ? 1 : a.dif - b.dif)).map(m => {
        const risk = riesgoMision(m), rc = HacMisiones.nivelColor(risk), rec = HacMisiones.recompensa(m);
        const en = costeExped(m), sinEn = energia < en, loot = Math.round(HacMisiones.lootChance(m.dif) * 100);
        const dinB = conBono(rec.dinero, bonos.dinero), xpB = conBono(rec.xp, xpFracMision(m.dom));   // ya con bonos de pabellón
        return `<div class="hacp-mis t-${m.dom}">
          <span class="hacp-mis-g" style="color:${DOM_COLOR[m.dom]}">${DOM_GLYPH[m.dom]}</span>
          <div class="hacp-mis-main">
            <div class="hacp-mis-name">${esc(m.nombre)} <span class="hacp-mis-dif">dif. ${m.dif}</span></div>
            <div class="hacp-mis-meta">⏱ ${fmtClock(HacMisiones.durSeg(m))} · <span class="${sinEn ? 'hacp-mis-noen' : ''}">−${en}⚡</span> · +${dinB}💰${bonos.dinero ? '<sup class="hacp-bono">↑</sup>' : ''} · +${xpB} XP${xpFracMision(m.dom) > 0 ? '<sup class="hacp-bono">↑</sup>' : ''} ${DOM_GLYPH[m.dom]} · 🎁 ${loot}%</div>
          </div>
          <span class="hacp-mis-risk r-${rc}" title="Riesgo de fracaso (baja con tu nivel ${DOM_GLYPH[m.dom]} y el equipo)">⚠ ${Math.round(risk * 100)}%</span>
          <button type="button" class="hacp-mis-go" data-mis="${esc(m.id)}"${ocupado || sinEn ? ' disabled' : ''} title="${sinEn ? 'Energía insuficiente' : ''}">Enviar</button>
        </div>`;
      }).join('');
      el.innerHTML = `
        <div class="hacp-shop-box">
          <button type="button" class="hacp-shop-x" data-act="board-close" aria-label="Cerrar">✕</button>
          <div class="hacp-shop-h"><span class="hacp-shop-zh">📜</span> Tablón de misiones <span class="hacp-shop-money">⚡ <b>${Math.round(energia)}</b></span></div>
          <div class="hacp-shop-sub">El riesgo baja con tu nivel del dominio (XP) y el equipo. Las difíciles cuestan más energía y tienen más probabilidad de 🎁 botín al volver.${ocupado ? ' <b>Tu mecenas ya está en una misión.</b>' : ''}</div>
          ${hayBonos() ? `<div class="hacp-shop-note">Bonos de los pabellones de la finca: ${bonosTexto()}</div>` : ''}
          <div class="hacp-board-list">${rows || '<div class="hacp-inv-note">No hay misiones disponibles.</div>'}</div>
        </div>`;
      el.querySelector('[data-act="board-close"]').addEventListener('click', closeBoard);
      el.querySelectorAll('[data-mis]').forEach(b => b.addEventListener('click', () => {
        dispatchMision(b.dataset.mis);
        toast('🧭 Tu mecenas parte a la misión'); closeBoard();
      }));
    }
    function openMissionBoard() { if (!myId) return; buildBoard(); ensureBoardEl().hidden = false; }
    function closeBoard() { if (boardEl) boardEl.hidden = true; }
    // "Buscar misiones": el mecenas CAMINA al edificio principal; al llegar se planta
    // con el cartelito 📜 y, al pulsarlo, se abre el tablón. Si ya está allí, abre ya.
    function goConsultBoard() {
      if (!myId || !hasMain || !mainBid) return;
      const r = HacFolk.consultar ? HacFolk.consultar(myId, mainBid) : false;
      if (r === 'now') { openMissionBoard(); return; }
      if (!r) { toast('Tu mecenas está ocupado ahora mismo'); return; }
      HacFolk.select(myId);
      if (cam && cam.focusFollow) cam.focusFollow(() => HacFolk.position(myId), 3.0);
      toast('🚶 Tu mecenas va al tablón de misiones…');
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
      if (!items.length) { panel.hidden = true; syncFab(); return; }
      panel.hidden = false;
      const fn = document.getElementById('hacp-folk-fab-n'); if (fn) fn.textContent = items.length;
      syncFab();
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
    if (window.HacStats) HacStats.ready().then(refresh);
    if (window.HacOrdenes) {
      HacOrdenes.ready().then(applyOrders);
      setInterval(() => {
        if (window.HacEnergia) HacEnergia.reload();
        if (window.HacCompetencias) HacCompetencias.reload();
        if (window.HacPuntos) HacPuntos.reload();
        if (window.HacStats) HacStats.reload();
        HacOrdenes.reload().then(applyOrders);
      }, 5000);
    }
    // Tic de 1 s: refresca SOLO el panel del personaje (cuenta atrás de expedición y
    // energía/regeneración se derivan del reloj de servidor → tienen que verse vivos).
    setInterval(() => { if (charId) refreshCharPanel(); }, 1000);

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

    // Edificio (capa 'edificio') que ocupa una celda (gx,gy), o null. Recorre de
    // atrás hacia delante para coger el de encima si hubiera solape.
    function edificioEnCelda(gx, gy) {
      const cons = (h.mapa && h.mapa.construcciones) || [];
      for (let i = cons.length - 1; i >= 0; i--) {
        const c = cons[i], t = window.HacBuild && HacBuild.tipo(c.tipo);
        if (!t || t.capa !== 'edificio' || !Array.isArray(c.pos)) continue;
        if (HacBuild.celdasOcupadas(c).some(cc => cc[0] === gx && cc[1] === gy)) return c;
      }
      return null;
    }
    // Popup de INFO de un edificio: nombre, dominio, descripción y el BONO que
    // aporta a la finca (con aviso de rendimientos decrecientes si es copia).
    function showBldPop(x, y, c) {
      hidePop();
      const t = window.HacBuild && HacBuild.tipo(c.tipo); if (!t) return;
      const dom = t.dominio, glyph = dom ? DOM_GLYPH[dom] : '', domNm = dom ? DOM_NOMBRE[dom] : '', col = dom ? DOM_COLOR[dom] : '#b9a77a';
      const det = (bonos.detalle || {})[c.pos[0] + ',' + c.pos[1]];
      const efectoDom = { cultural: '+XP en misiones', administrativo: '+dinero de misiones y −precios de mercado', militar: '+XP en expediciones militares' };
      let bono;
      if (!dom) {
        bono = `<div class="hacp-bld-bono none">No aporta sinergia de pabellón.</div>`;
      } else if (!det) {
        bono = `<div class="hacp-bld-bono none">Colócalo dentro de un pabellón <b style="color:${col}">${glyph} ${esc(domNm)}</b> para que sume al bono de la finca.</div>`;
      } else {
        const pctSin = (dom === 'militar') ? HacBuild.pctSinergiaMil : HacBuild.pctSinergia;   // 军 usa su propia curva (más ligera)
        const tot = bonos.sinergia[dom] || 0;
        const marginal = Math.round((pctSin(tot) - pctSin(tot - det.efectiva)) * 100);
        const drPct = Math.round(Math.pow(HacBuild.DR_COPIA, det.copia - 1) * 100);
        const aporta = `Aporta ~<b>${marginal}%</b> a la finca (${esc(efectoDom[dom])})`;
        const dr = det.copia > 1
          ? `<div class="hacp-bld-dr">⚠ Es la ${det.copia}ª de su tipo: rinde solo el <b>${drPct}%</b> de la primera (rendimientos decrecientes). Mejor variar de edificio.</div>`
          : `<div class="hacp-bld-dr ok">✓ Primera de su tipo: aporte completo.</div>`;
        bono = `<div class="hacp-bld-bono"><b style="color:${col}">${glyph} ${esc(domNm)}</b> · ${aporta}</div>${dr}`;
      }
      pop = document.createElement('div');
      pop.className = 'hacp-bld-pop';
      pop.innerHTML = `<div class="hacp-bld-ttl"><span class="zh">${esc(t.zh || '')}</span> ${esc(t.nombre)}</div>
        ${t.desc ? `<div class="hacp-bld-desc">${esc(t.desc)}</div>` : ''}${bono}`;
      document.body.appendChild(pop);
      pop.style.left = Math.min(x + 12, window.innerWidth - pop.offsetWidth - 8) + 'px';
      pop.style.top = Math.min(y + 12, window.innerHeight - pop.offsetHeight - 8) + 'px';
    }

    // TAP en el plano: ¿banner de edificio? → popup; ¿un mecenas? → seleccionar;
    // ¿el cuerpo de un edificio? → info/bono; si no, deseleccionar. Distinguimos
    // tap de arrastre por el desplazamiento.
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
      // Clic en TU mecenas mientras espera en el tablón (📜) → abre las misiones.
      if (bestId && bestId === myId && HacFolk.consultando && HacFolk.consultando(myId)) { openMissionBoard(); return; }
      if (bestId) { gotoMember(bestId); return; }
      // ¿el cuerpo de un edificio? → popup con su info y el bono que aporta.
      const cell = (window.HacIso && HacIso.cellAt) ? HacIso.cellAt(iso, e.clientX, e.clientY) : null;
      const bld = cell ? edificioEnCelda(cell[0], cell[1]) : null;
      if (bld) { showBldPop(e.clientX, e.clientY, bld); return; }
      hidePop(); deselect();
    });
    document.addEventListener('pointerdown', (e) => { if (pop && !pop.contains(e.target) && !vp.contains(e.target)) hidePop(); });

    // ── Aviso CLICABLE "revisar tablón" sobre TU mecenas (DOM, solo local) ──────
    // No es un bocadillo (que verían todos y se solaparía con los diálogos): es un
    // botón llamativo en su propia capa, pegado a la cabeza de tu mecenas cuando
    // espera en el tablón. Al pulsarlo se abren las misiones.
    const cta = document.createElement('button');
    cta.type = 'button'; cta.className = 'hacp-cta'; cta.hidden = true; cta.textContent = '📜 Revisar misiones';
    vp.appendChild(cta);
    ['pointerdown', 'pointerup', 'wheel', 'click'].forEach(ev => cta.addEventListener(ev, (e) => e.stopPropagation(), { passive: false }));
    cta.addEventListener('click', openMissionBoard);
    const FEETdev = (window.HacChar && HacChar.H) ? HacChar.H - 5 : 51;   // px (dispositivo) cabeza→pies
    (function tickCTA() {
      const on = !!(myId && HacFolk.consultando && HacFolk.consultando(myId)) && (!boardEl || boardEl.hidden);
      if (on) {
        const p = HacFolk.position(myId), r = iso.getBoundingClientRect(), vr = vp.getBoundingClientRect();
        if (p && r.width && iso.width) {
          const sx = r.left + p[0] * S / iso.width * r.width;
          const feetY = r.top + p[1] * S / iso.height * r.height;
          const headCss = FEETdev * r.height / iso.height;            // alto del sprite en px CSS
          cta.style.left = Math.round(sx - vr.left) + 'px';
          cta.style.top = Math.round(feetY - vr.top - headCss - 6) + 'px';
          cta.hidden = false;
        }
      } else if (!cta.hidden) cta.hidden = true;
      requestAnimationFrame(tickCTA);
    })();

    // ── SHELL MÓVIL (estilo app): home = tu personaje + navegación inferior ────
    // Solo en pantallas estrechas; el escritorio se queda como está. Reutiliza el
    // panel del personaje (home), el tablón (expediciones) y las tareas internas.
    if (window.matchMedia && window.matchMedia('(max-width:600px)').matches) setupMobileShell();
    function setupMobileShell() {
      document.body.classList.add('hacp-mobile');                 // se reasserta siempre
      if (document.getElementById('hacp-mnav')) return;           // ya montado: no dupliques nav/secciones
      const SEC = [
        { id: 'personaje',   ic: '士', lb: 'Personaje' },
        { id: 'misiones',    ic: '檄', lb: 'Misiones' },
        { id: 'hacienda',    ic: '邑', lb: 'Hacienda' },
        { id: 'mapa',        ic: '圖', lb: 'Mapa' },
        { id: 'escaramuzas', ic: '兵', lb: 'Escaramuzas' },
      ];
      const nav = document.createElement('nav'); nav.id = 'hacp-mnav';
      const navBtns = {};
      SEC.forEach(s => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'hacp-nav-btn'; b.dataset.sec = s.id;
        b.innerHTML = `<span class="ic">${s.ic}</span><span class="lb">${esc(s.lb)}</span>`;
        b.addEventListener('click', () => mgo(s.id));
        nav.appendChild(b); navBtns[s.id] = b;
      });
      document.body.appendChild(nav);

      const sec = document.createElement('div'); sec.id = 'hacp-msec';
      sec.innerHTML = `
        <div class="hacp-msec-pane" data-pane="personaje"></div>
        <div class="hacp-msec-pane" data-pane="misiones">
          <div class="hacp-mtabs"><button type="button" class="hacp-mtab on" data-mt="internas">Tareas internas</button><button type="button" class="hacp-mtab" data-mt="exped">Expediciones</button></div>
          <div class="hacp-mtab-body" data-mtb="internas"></div>
          <div class="hacp-mtab-body" data-mtb="exped" hidden></div>
        </div>
        <div class="hacp-msec-pane" data-pane="mapa"><div class="hacp-msec-soon">🗺<br><b>Mapa</b><br>Pronto: las haciendas de otros jugadores y de NPCs.</div></div>
        <div class="hacp-msec-pane" data-pane="escaramuzas"><div class="hacp-esc" data-esc-body></div></div>`;
      document.body.appendChild(sec);

      // Personaje (home): reubica el panel del personaje como contenido de la sección.
      const persPane = sec.querySelector('[data-pane="personaje"]');
      if (charEl) { persPane.appendChild(charEl); charEl.hidden = false; }

      // Misiones: pestañas internas / expediciones.
      sec.querySelectorAll('.hacp-mtab').forEach(t => t.addEventListener('click', () => {
        sec.querySelectorAll('.hacp-mtab').forEach(x => x.classList.toggle('on', x === t));
        sec.querySelectorAll('.hacp-mtab-body').forEach(b => { b.hidden = (b.dataset.mtb !== t.dataset.mt); });
        if (t.dataset.mt === 'exped') renderExped(); else renderInternas();
      }));
      function renderInternas() {
        const body = sec.querySelector('[data-mtb="internas"]');
        if (!myId) { body.innerHTML = '<div class="hacp-inv-note">Entra con tu mecenas para enviar tareas.</div>'; return; }
        const tasks = availableTasks();
        body.innerHTML = tasks.length
          ? tasks.map(t => `<div class="hacp-mrow"><div class="hacp-mrow-main"><b>${esc(t.nombre)}</b><span>${fmtDur(t.duracionSeg)} · −${costeMision(t.dominio)}⚡</span></div><button class="hacp-cp-btn" data-task="${esc(t.taskId)}">Enviar</button></div>`).join('')
          : '<div class="hacp-inv-note">No hay tareas internas disponibles ahora mismo.</div>';
        body.querySelectorAll('[data-task]').forEach(b => b.addEventListener('click', () => { dispatch(b.dataset.task); mgo('personaje'); }));
      }
      function renderExped() {
        const body = sec.querySelector('[data-mtb="exped"]');
        if (!hasMain) { body.innerHTML = '<div class="hacp-inv-note">Esta finca aún no tiene edificio principal para expediciones.</div>'; return; }
        buildBoard();
        const el = ensureBoardEl();
        body.appendChild(el); el.hidden = false; el.classList.add('hacp-board-inline');
      }

      // ── ESCARAMUZAS (cooperativo): lobby — montar banda / listar / unirse / salir ──
      // (El lanzamiento, la salida animada y el reparto de botín/heridas/cooldown
      //  llegan en la siguiente sub-fase; aquí queda el "vestíbulo" de bandas.)
      const COSTE_BANDA = (plazas) => plazas * 40;     // 2→80, 3→120, 4→160
      const myName = ((h.miembros || []).find(m => m.personajeId === myId) || {}).nombre || 'Tú';
      let escPlazas = 3, escBusy = false, escSig = '';
      const escBody = () => sec.querySelector('[data-esc-body]');
      function renderEscaramuzas() {
        const body = escBody(); if (!body) return;
        if (!myId) { body.innerHTML = '<div class="hacp-msec-soon">兵<br><b>Escaramuzas</b><br>Únete a esta hacienda con tu mecenas para participar.</div>'; return; }
        if (!window.HacEscaramuzas || !HacEscaramuzas.dbOk()) {
          body.innerHTML = '<div class="hacp-msec-soon">兵<br><b>Escaramuzas</b><br>Aún no disponibles en el servidor.</div>'; return;
        }
        const mine = HacEscaramuzas.miBanda(h.id, myId);
        if (mine) { body.innerHTML = bandaPropiaHTML(mine); const sl = body.querySelector('[data-salir]'); if (sl) sl.addEventListener('click', () => salirBanda(mine.id)); return; }
        const dinero = window.HacStats ? HacStats.dinero(myId) : 0;
        const coste = COSTE_BANDA(escPlazas), sinDinero = dinero < coste;
        const abiertas = HacEscaramuzas.abiertas(h.id).filter(b => b.miembros.length < b.plazas);
        const lista = abiertas.map(b => `
          <div class="hacp-mrow"><div class="hacp-mrow-main"><b>Banda de ${esc(b.hostNombre || 'un mecenas')}</b>
            <span>${b.miembros.length}/${b.plazas} · dif. ${b.dificultad}</span></div>
            <button class="hacp-cp-btn" data-unir="${esc(b.id)}">Unirse</button></div>`).join('')
          || '<div class="hacp-inv-note">No hay bandas abiertas. ¡Monta la tuya!</div>';
        body.innerHTML = `
          <div class="hacp-esc-h">兵 Escaramuzas <span class="hacp-esc-sub">expediciones cooperativas</span></div>
          <div class="hacp-esc-card">
            <div class="hacp-esc-ttl">Montar una banda</div>
            <div class="hacp-esc-note">Salís varios mecenas a una expedición militar más dura. Pagas por montarla; si volvéis con éxito recuperas el coste +25% y tu parte del botín.</div>
            <div class="hacp-esc-plazas">${[2, 3, 4].map(p => `<button class="hacp-esc-p${p === escPlazas ? ' on' : ''}" data-plazas="${p}">${p} plazas</button>`).join('')}</div>
            <button class="hacp-cp-btn hacp-esc-crear" data-crear${sinDinero ? ' disabled' : ''}>Montar banda · 💰 ${coste}${sinDinero ? ' (te falta)' : ''}</button>
          </div>
          <div class="hacp-esc-ttl2">Bandas abiertas</div>${lista}`;
        body.querySelectorAll('[data-plazas]').forEach(b => b.addEventListener('click', () => { escPlazas = +b.dataset.plazas; renderEscaramuzas(); }));
        const cr = body.querySelector('[data-crear]'); if (cr && !cr.disabled) cr.addEventListener('click', crearBanda);
        body.querySelectorAll('[data-unir]').forEach(b => b.addEventListener('click', () => unirBanda(b.dataset.unir)));
      }
      function bandaPropiaHTML(b) {
        const esHost = b.hostId === myId;
        const roster = b.miembros.map(m => `<li class="hacp-esc-m${m.id === b.hostId ? ' host' : ''}">${esc(m.nombre || 'mecenas')}${m.id === b.hostId ? ' · capitán' : ''}${m.id === myId ? ' (tú)' : ''}</li>`).join('');
        let accion = '';
        if (b.estado === 'abierta') {
          const puede = b.miembros.length >= 2;
          accion = `<button class="hacp-cp-btn" data-lanzar disabled title="Próximamente">${esHost ? '⚔ Lanzar (próximamente)' : 'Esperando al capitán…'}</button>
            <div class="hacp-esc-note">${puede ? 'Listos para partir cuando el capitán lance.' : 'Hacen falta al menos 2 mecenas para partir.'} El lanzamiento, la salida y el reparto llegan en la próxima actualización.</div>
            <button class="hacp-cp-btn hacp-esc-salir" data-salir>${esHost ? 'Disolver la banda' : 'Salir de la banda'}</button>`;
        } else if (b.estado === 'en_curso') {
          accion = `<div class="hacp-esc-note">La banda está en la expedición.</div>`;
        }
        return `<div class="hacp-esc-h">兵 Tu banda <span class="hacp-esc-sub">${b.miembros.length}/${b.plazas}</span></div>
          <div class="hacp-esc-card"><div class="hacp-esc-ttl">Expedición militar · dif. ${b.dificultad}</div>
            <ul class="hacp-esc-roster">${roster}</ul>${accion}</div>`;
      }
      async function crearBanda() {
        if (escBusy) return;                                  // anti doble-clic
        const coste = COSTE_BANDA(escPlazas);
        if (!window.HacStats || HacStats.dinero(myId) < coste) { toast('No tienes suficiente dinero'); return; }
        escBusy = true; let pagado = false;
        try {
          await HacStats.award(myId, { dinero: -coste }); pagado = true;
          await HacEscaramuzas.crear({ haciendaId: h.id, hostId: myId, hostNombre: myName, plazas: escPlazas, dificultad: 4 + (escPlazas - 2), coste });
          toast('⚔ Banda montada · esperando mecenas');
        } catch (e) {
          if (pagado && window.HacStats) await HacStats.award(myId, { dinero: coste });   // reembolso si falló crear
          toast((e && e.message) || 'No se pudo montar'); await HacEscaramuzas.reload();
        } finally { escBusy = false; renderEscaramuzas(); if (charId) buildCharPanel(charId); }
      }
      async function unirBanda(id) {
        if (escBusy) return; escBusy = true;
        try { await HacEscaramuzas.unir(id, { id: myId, nombre: myName }); toast('Te has unido a la banda'); }
        catch (e) { toast((e && e.message) || 'No se pudo unir'); await HacEscaramuzas.reload(); }
        finally { escBusy = false; renderEscaramuzas(); }
      }
      async function salirBanda(id) {
        if (escBusy) return; escBusy = true;
        const band = HacEscaramuzas.miBanda(h.id, myId);
        const refund = (band && band.hostId === myId && band.estado === 'abierta') ? band.coste : 0;
        try {
          const r = await HacEscaramuzas.salir(id, myId);
          if (refund > 0 && r.disuelta && window.HacStats) { await HacStats.award(myId, { dinero: refund }); toast('Banda disuelta · coste devuelto'); }
          else toast(r.disuelta ? 'Banda disuelta' : 'Has salido de la banda');
        } catch (e) { toast((e && e.message) || 'No se pudo salir'); await HacEscaramuzas.reload(); }
        finally { escBusy = false; renderEscaramuzas(); if (charId) buildCharPanel(charId); }
      }
      if (window.HacEscaramuzas) HacEscaramuzas.ready();
      let mActive = 'personaje';
      // Muestra un mecenas (el tuyo o cualquiera al tocarlo en la finca) en el HOME.
      function showChar(id) {
        [shopEl, equipEl, homeEl, leaveEl].forEach(e => { if (e) e.hidden = true; }); hidePop();
        mActive = 'personaje';
        SEC.forEach(s => navBtns[s.id].classList.toggle('on', s.id === 'personaje'));
        sec.querySelectorAll('.hacp-msec-pane').forEach(p => p.classList.toggle('on', p.dataset.pane === 'personaje'));
        sec.hidden = false;
        if (id) { charId = id; buildCharPanel(id); startAvatar(); }
      }
      mShell = { showChar, go: (s) => mgo(s) };
      // Poll de escaramuzas: solo si la sección está activa, la pestaña es visible, y
      // re-renderiza únicamente si cambió algo (evita churn que rompe la interacción).
      setInterval(() => {
        if ((typeof document !== 'undefined' && document.hidden) || mActive !== 'escaramuzas' || !window.HacEscaramuzas) return;
        HacEscaramuzas.reload().then(() => {
          if (mActive !== 'escaramuzas') return;
          const sig = JSON.stringify((HacEscaramuzas.all(h.id) || []).map(b => [b.id, b.estado, (b.miembros || []).length]));
          if (sig !== escSig) { escSig = sig; renderEscaramuzas(); }
        });
      }, 6000);

      function mgo(id) {
        // Cierra cualquier modal (tienda/equipo/casa/abandonar) y el popup de edificio.
        [shopEl, equipEl, homeEl, leaveEl].forEach(e => { if (e) e.hidden = true; });
        hidePop();
        if (mActive === 'personaje' && id !== 'personaje') stopAvatar();   // no animes el retrato fuera del home
        // El tablón (boardEl) lo embebe renderExped en Misiones; al salir, devuélvelo
        // a su sitio (overlay en el visor) para que la ruta de escritorio siga válida.
        if (id !== 'misiones' && boardEl) { boardEl.classList.remove('hacp-board-inline'); boardEl.hidden = true; if (boardEl.parentNode !== vp) vp.appendChild(boardEl); }
        mActive = id;
        SEC.forEach(s => navBtns[s.id].classList.toggle('on', s.id === id));
        sec.querySelectorAll('.hacp-msec-pane').forEach(p => p.classList.toggle('on', p.dataset.pane === id));
        const isHac = (id === 'hacienda');
        sec.hidden = isHac;
        if (id === 'personaje') {
          if (myId) { charId = myId; buildCharPanel(myId); startAvatar(); }
          else if (!persPane.querySelector('.hacp-msec-soon')) {
            const n = document.createElement('div'); n.className = 'hacp-msec-soon';
            n.innerHTML = '士<br><b>Sin mecenas aquí</b><br>Únete a esta hacienda para ver a tu personaje.';
            persPane.appendChild(n);
          }
        }
        if (id === 'misiones') { renderInternas(); }
        if (id === 'escaramuzas') { if (window.HacEscaramuzas) HacEscaramuzas.reload().then(renderEscaramuzas); else renderEscaramuzas(); }
        if (isHac) {
          // El visor pasó a pantalla completa al añadir .hacp-mobile, DESPUÉS de fitView →
          // recalcula el encuadre al tamaño real y, ya en el frame siguiente, hace zoom
          // al mecenas (focusFollow usa el `fit` recién calculado).
          window.dispatchEvent(new Event('resize'));
          // En móvil el visor es enorme: acércate bien al mecenas (zoom alto).
          if (myId && cam && cam.focusFollow) requestAnimationFrame(() => cam.focusFollow(() => HacFolk.position(myId), 8));
        }
      }
      mgo('personaje');   // landing por defecto
      // El visor ya es pantalla completa (clase .hacp-mobile): reencuadra para que su
      // `fit` corresponda al tamaño real desde el principio.
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    }
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
