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
    // El progreso se mide contra el tier REAL del prestigio (no el nivel confirmado
    // de la finca, que es un trinquete y puede ir por detrás). Si anclásemos al nivel
    // confirmado, al cruzar el umbral siguiente antes de confirmarlo la barra se
    // quedaría clavada al 100% con «faltan 0».
    const prestTier = HacCalc.tierDePuntos(prest);
    const prog   = HacCalc.progresoHacia(prest, prestTier);
    const prestBar = `
      <div class="hacp-iso-prestige" aria-hidden="true">
        <span class="hacp-isop-zh">${esc(prestTier.zh)}</span>
        <div class="hacp-isop-body">
          <div class="hacp-isop-top"><b>${prest.toLocaleString('es')}</b> prestigio · <span>Nivel ${prestTier.nivel} · ${esc(prestTier.nombre)}</span></div>
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
      HacIso.draw(iso, { mapa: h.mapa, tier, color, pabellones, estacion: (h.mapa && h.mapa.estacion) || 'verano', tema: (h.mapa && h.mapa.tema) || '' });
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
    let scale = 1, tx = 0, ty = 0, fit = 1, applyCb = null;
    const clampS = (s) => Math.max(fit * 0.6, Math.min(fit * 14, s));
    const apply = () => { cv.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')'; if (applyCb) applyCb(); };
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
    // Transform actual del lienzo (para la capa de personajes nítida, que proyecta
    // las coords del mundo a pantalla cada frame). tx,ty en px CSS; scale = zoom.
    function getT() { return { tx: tx, ty: ty, scale: scale }; }
    // Callback en cada cambio de transform (pan/zoom/seguimiento): la capa de
    // personajes se repinta al instante para no arrastrarse tras el tablero.
    function setOnApply(fn) { applyCb = fn; }
    return { centerOn, focusFollow, stopFollow, reset, getT, setOnApply };
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
    // Dónde colgar los modales (tienda/equipo/casa/abandonar/bitácora): en MÓVIL van
    // a <body> para escapar del contexto de apilado del visor (#hacp-iso-wrap es
    // position:fixed → su z-index:auto queda por DEBAJO de #hacp-msec z-index:8000, y
    // taparía el modal aunque tenga z-index alto). En escritorio, dentro del visor.
    const isMobile = () => document.body.classList.contains('hacp-mobile');
    const overlayHost = () => (isMobile() ? document.body : vp);
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
      const tipOf = (e) => (e.target.closest && e.target.closest('[data-tip]'));
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
    // TABLÓN DE ANUNCIOS (告示牌): DESBLOQUEA las misiones (igual que el mercado
    // desbloquea la tienda). Es el punto de consulta al que camina el mecenas. Se
    // elige el más AL FRENTE (mayor gx+gy) → coincide con el que usa hac-folk.
    const _tablones = ((h.mapa && h.mapa.construcciones) || []).filter(c => c.tipo === 'tablon');
    const hasTablon = _tablones.length > 0;
    const tablonBid = hasTablon
      ? _tablones.reduce((a, c) => ((c.pos[0] + c.pos[1]) > (a.pos[0] + a.pos[1]) ? c : a)).pos.join(',')
      : null;
    // ── Barra de acciones MÓVIL (estilo app): secciones grandes en la zona del
    // pulgar (CSS la muestra solo en pantallas estrechas). Vive dentro del visor →
    // también en pantalla completa. Abre los paneles/hojas ya existentes.
    // (Va DESPUÉS de myId/hasTablon/hasMarket para no leerlos en zona muerta.)
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
    if (myId && hasTablon) { const bMis = moBtn('檄', 'Misiones', goConsultBoard); bMis.classList.add('hacp-mo-mis'); mobar.appendChild(bMis); }
    if (myId && window.HacProd) { const bP = moBtn('產', 'Producción', () => openProd()); bP.classList.add('hacp-mo-prod'); mobar.appendChild(bP); }
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
    // OFICIOS 官職: bono a TODA la casa (oficios ocupados) fundido con los del pabellón,
    // + el perk PERSONAL del oficio que ostenta mi mecenas (si tiene alguno).
    const cargoHac = (window.HacCalc && HacCalc.cargoHacBonos) ? HacCalc.cargoHacBonos(h.miembros) : { escBotin: 0, xpExped: 0, mercado: 0 };
    bonos.xp += cargoHac.xpExped || 0;
    bonos.mercado += cargoHac.mercado || 0;
    bonos.escBotin = cargoHac.escBotin || 0;
    const miCargo = (window.HacCalc && HacCalc.cargoDef) ? HacCalc.cargoDef(((h.miembros || []).find(m => m.personajeId === myId) || {}).cargo) : null;
    // ¿mi mecenas tiene un talento de senda? (efectos personales, C1)
    const tieneT = (id) => !!(window.HacStats && HacStats.tieneTalento && HacStats.tieneTalento(myId, id));
    // CABALLO: montura propia → −% tiempo de expedición mientras lo tengas.
    const CABALLO_EXPED = 0.12;
    const caballoExped = () => (window.HacStats && HacStats.tieneCaballo && HacStats.tieneCaballo(myId)) ? CABALLO_EXPED : 0;
    // ── BUFOS/DEBUFOS (modificadores %): registro EXTENSIBLE de todo lo que te afecta.
    // tipo → cómo se muestra (etiqueta, signo, si es reductor bueno o un debuf). Añadir
    // fuentes nuevas (eventos, relaciones…) = empujar más entradas en recopilarBufos().
    const BUF_TIPOS = {
      dinero:    { label: 'Dinero de misiones',    signo: '+', color: '#c9a84c', good: true },
      xpMision:  { label: 'XP de misiones',        signo: '+', color: '#3a8a5a', good: true },
      xpMil:     { label: 'XP en exp. militares',  signo: '+', color: '#b23b2e', good: true },
      mercado:   { label: 'Precios de mercado',    signo: '−', color: '#3a6ea5', good: true },
      exped:     { label: 'Tiempo de expedición',  signo: '−', color: '#c98a3a', good: true },
      riesgo:    { label: 'Riesgo de misión',      signo: '−', color: '#7aa26e', good: true },
      prestigio: { label: 'Prestigio en tareas',   signo: '+', color: '#c9a84c', good: true },
      botin:     { label: 'Botín de escaramuza',   signo: '+', color: '#c98a3a', good: true, num: true },
      heridas:   { label: 'Merma por heridas',     signo: '−', color: '#b23b2e', good: false },
    };
    // Talentos de senda con efecto porcentual (para listarlos como bufos).
    const SENDA_FX = [
      { id: 'estudiante',  tipo: 'xpMision',  val: 0.08, label: 'Senda · Estudiante (XP 文)' },
      { id: 'estratega',   tipo: 'exped',     val: 0.10, label: 'Senda · Estratega' },
      { id: 'gobernador',  tipo: 'dinero',    val: 0.10, label: 'Senda · Gobernador' },
      { id: 'funcionario', tipo: 'mercado',   val: 0.06, label: 'Senda · Funcionario' },
      { id: 'soldado',     tipo: 'riesgo',    val: 0.06, label: 'Senda · Soldado' },
      { id: 'canciller',   tipo: 'prestigio', val: 0.30, label: 'Senda · Canciller' },
    ];
    // Reúne TODOS los modificadores activos del mecenas, con su fuente. Extensible.
    function recopilarBufos() {
      const items = [];
      const add = (tipo, label, val) => { if (val) items.push({ tipo, label, val }); };
      add('xpMision', 'Pabellón cultural',       (bonos.xp || 0) - (cargoHac.xpExped || 0));
      add('xpMil',    'Pabellón militar',        bonos.xpMil || 0);
      add('dinero',   'Pabellón administrativo', bonos.dinero || 0);
      add('mercado',  'Pabellón administrativo', (bonos.mercado || 0) - (cargoHac.mercado || 0));
      add('xpMision', 'Cargos de la casa',       cargoHac.xpExped || 0);
      add('mercado',  'Cargos de la casa',       cargoHac.mercado || 0);
      add('botin',    'Cargos de la casa',       cargoHac.escBotin || 0);
      if (miCargo && miCargo.perk) {
        if (miCargo.perk.dinero) add('dinero', 'Tu cargo · ' + miCargo.nombre, miCargo.perk.dinero);
        if (miCargo.perk.xpDom)  add('xpMision', 'Tu cargo · ' + miCargo.nombre + ' (' + (DOM_GLYPH[miCargo.dom] || '') + ')', miCargo.perk.xpDom);
      }
      if (window.HacStats) {
        add('dinero', 'Objetos equipados',  HacStats.bonusDinero ? HacStats.bonusDinero(myId) : 0);
        add('exped',  'Objetos equipados',  HacStats.bonusExped ? HacStats.bonusExped(myId) : 0);
      }
      SENDA_FX.forEach(s => { if (tieneT(s.id)) add(s.tipo, s.label, s.val); });
      if (window.HacStats && HacStats.tieneCaballo && HacStats.tieneCaballo(myId)) {
        const c = HacStats.caballo(myId);
        add('exped', '🐎 ' + ((c && c.nombre) || 'Caballo'), CABALLO_EXPED);
      }
      add('heridas', 'Heridas', (window.HacStats && HacStats.penHerida) ? HacStats.penHerida(myId) : 0);
      // 🏯 Bono de hacienda por un libro de conclusiones DONADO al fundador (7 días).
      const bh = (window.HacBuff && HacBuff.activo) ? HacBuff.activo(h.id, 'xp') : null;
      if (bh) add('xpMision', '🏯 Donación al fundador' + (bh.donanteNombre ? ' · ' + bh.donanteNombre : ''), bh.valor);
      const totales = {};
      items.forEach(it => { totales[it.tipo] = (totales[it.tipo] || 0) + it.val; });
      return { items, totales };
    }
    // Fracción de XP extra para UNA misión: el bono cultural (政→文… 文) aplica a
    // todas; el militar (军) SOLO se suma en expediciones de dominio militar.
    const buffHacXp = () => (window.HacBuff && HacBuff.xpActivo) ? HacBuff.xpActivo(h.id) : 0;   // 🏯 bono por libro donado al fundador
    const xpFracMision = (dom) => (bonos.xp || 0) + (dom === 'militar' ? (bonos.xpMil || 0) : 0)
      + ((miCargo && miCargo.perk.xpDom && miCargo.dom === dom) ? miCargo.perk.xpDom : 0)   // perk del oficio en su dominio
      + ((dom === 'cultural' && tieneT('estudiante')) ? 0.08 : 0)                            // 書生 Estudiante
      + buffHacXp();                                                                         // bono de hacienda (donación)
    const conBono = (base, frac) => Math.round((base || 0) * (1 + (frac || 0)));        // recompensa con bono
    const precioMercado = (item) => Math.max(1, Math.round((item.precio || 0) * (1 - bonos.mercado - (tieneT('funcionario') ? 0.06 : 0))));   // descuento 政 + 吏 Funcionario
    const pct = (f) => Math.round((f || 0) * 100);
    const hayBonos = () => bonos.xp > 0 || bonos.dinero > 0 || bonos.mercado > 0 || bonos.xpMil > 0 || bonos.escBotin > 0;
    // Resumen legible de los bonos activos de la finca (solo los no nulos).
    function bonosTexto() {
      const p = [];
      if (bonos.xp > 0) p.push(`<span style="color:#3a8a5a">+${pct(bonos.xp)}% XP misiones</span>`);
      if (bonos.xpMil > 0) p.push(`<span style="color:#b23b2e">+${pct(bonos.xpMil)}% XP en exp. militares</span>`);
      if (bonos.dinero > 0) p.push(`<span style="color:#3a6ea5">+${pct(bonos.dinero)}% dinero</span>`);
      if (bonos.mercado > 0) p.push(`<span style="color:#3a6ea5">−${pct(bonos.mercado)}% precios</span>`);
      if (bonos.escBotin > 0) p.push(`<span style="color:#c98a3a">+${bonos.escBotin} botín escaramuza</span>`);
      return p.join(' · ');
    }
    // Panel de OFICIOS 官職 de la casa: los 3 cargos, quién los ostenta y su bono.
    function cargosHTML() {
      if (!window.HacCalc || !HacCalc.CARGOS) return '';
      const rows = HacCalc.CARGOS.map(c => {
        const m = (h.miembros || []).find(x => x.cargo === c.id);
        const quien = m ? (esc(m.nombre || 'mecenas') + (m.personajeId === myId ? ' <em>(tú)</em>' : '')) : '<span class="hacp-cargo-vac">vacante</span>';
        return `<div class="hacp-cargo-row${m ? '' : ' vac'}"><span class="hacp-cargo-nm">${c.icon} ${esc(c.zh)} ${esc(c.nombre)}</span><span class="hacp-cargo-quien">${quien}</span><span class="hacp-cargo-bono">${esc(c.hacTxt)}</span></div>`;
      }).join('');
      return `<div class="hacp-cargos"><div class="hacp-cargos-h">官 Cargos de la casa</div>${rows}</div>`;
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
      // anuncios (📜, edificio funcional). Esta lista es solo de tareas
      // dentro de la finca (edificios).
      // Deduplica tareas idénticas (mismo nombre/dominio/duración) que aparecerían
      // repetidas si hay varios edificios del mismo tipo (p. ej. dos "Descansar").
      const vistos = new Set();
      return out.filter(t => { const k = t.nombre + '|' + t.dominio + '|' + t.duracionSeg; if (vistos.has(k)) return false; vistos.add(k); return true; });
    }
    const DOM_GLYPH = { militar: '武', cultural: '文', administrativo: '政' };
    const DOM_COL = { militar: '#c0463a', cultural: '#4fa06a', administrativo: '#5a8fd0' };
    // Nivel EFECTIVO en un dominio (nivel por XP + bonos de equipo).
    function nivelEf(dom) { return (window.HacStats && HacStats.nivelTotal && dom) ? HacStats.nivelTotal(myId, dom) : 1; }
    // Riesgo de una MISIÓN del tablón: depende de tu nivel efectivo vs su dificultad,
    // + un extra si tu mecenas va herido (+8 % por herida).
    function riesgoMision(m) {
      const base = (window.HacMisiones) ? HacMisiones.riesgo(nivelEf(m.dom), m.dif) : 0.3;
      const her = (window.HacStats && HacStats.heridas) ? HacStats.heridas(myId) : 0;
      const soldado = (window.HacStats && HacStats.tieneTalento && HacStats.tieneTalento(myId, 'soldado')) ? 0.06 : 0;   // 武士: aguante
      return Math.max(0.05, Math.min(0.92, base + her * 0.08 - soldado));
    }
    // Multiplicador de recompensa por reto: una misión muy por debajo de tu nivel es
    // "rutina" y rinde menos (dinero y XP). Empuja a variar y a afrontar retos reales.
    function retoMultMision(m) {
      return (window.HacMisiones && HacMisiones.retoMult) ? HacMisiones.retoMult(nivelEf(m.dom), m.dif) : 1;
    }
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
    // Órdenes ya cobradas (por sucKey). El clear de la orden es OPTIMISTA; el poll puede
    // recargarla de la BD antes de que persista el borrado. Sin este guard, al haber vuelto
    // ya a la finca y limpiar el estado de encuentros (sucClear), esa orden recargada se veía
    // como "encuentros sin resolver" y RE-DISPARABA el encuentro. Aquí la ignoramos hasta que
    // el borrado se propague de verdad.
    const _cobradas = new Set();
    function maybeRewardMyMission() {
      if (!myId || !window.HacOrdenes || !window.HacPuntos) return;
      const o = HacOrdenes.mine(h.id, myId);
      if (!o) { _wasOnMission = false; return; }
      const me = HacFolk.list().find(w => w.id === myId);
      const onM = !!(me && me.onMission);
      const hardDone = clock() > o.inicioMs + (o.duracionSeg || 60) * 1000 + 90000;   // tope de seguridad amplio
      const liveDone = _wasOnMission && !onM;                                          // el sim la acaba de completar (observado)
      // Backstop ROBUSTO: aunque NO se observara la transición onMission→false (p.ej.
      // recarga a media misión o pestaña oculta), si el mecenas ya está EN LA FINCA
      // (existe en el sim y no está en misión) y su duración nominal transcurrió, la
      // misión está hecha → premia y limpia. Antes se quedaba "ocupado" colgado.
      const doneByTime = !!me && !onM && clock() > o.inicioMs + (o.duracionSeg || 120) * 1000;
      if (hardDone || liveDone || doneByTime) {
        // Las ESCARAMUZAS (cooperativas) NO se premian aquí: al volver, solo se limpia
        // la orden; el reparto de dinero/botín/heridas lo hará la resolución de la banda (4c).
        if (String(o.targetId || '').indexOf('escaramuza:') === 0) {
          HacOrdenes.clear(h.id, myId); _wasOnMission = false; applyOrders(); return;
        }
        // Ya cobrada y recargada por el poll antes de persistir el clear: reintenta el
        // borrado y NO la reproceses (nada de re-mostrar el encuentro ni re-cobrar).
        if (_cobradas.has(sucKey(o))) { HacOrdenes.clear(h.id, myId); _wasOnMission = false; return; }
        let dom = null;
        const mis = (o.tipo === 'expedicion') ? (window.HacMisiones && HacMisiones.get(String(o.targetId || '').replace('mis:', ''))) : null;
        // EXPEDICIÓN con encuentros SIN resolver: el mecenas ha VUELTO pero NO cobra ni
        // regresa a la finca hasta que los atiendas (bloqueo). El botón «Misiones»
        // parpadea; la orden NO se limpia → sigue "ocupado" y no puede salir de nuevo.
        if (mis && encPend(o, mis)) { _wasOnMission = false; return; }
        if (mis) dom = mis.dom;
        else if (o.tipo !== 'expedicion') { const task = (window.HacTareas && HacTareas.get) ? HacTareas.get(o.targetId) : null; dom = (task && window.HacBuild) ? (HacBuild.tipo(task.tipo) || {}).dominio : null; }
        // Efectos ACUMULADOS de los encuentros ya resueltos (0 si no es expedición).
        const em = mis ? encTotales(o, mis) : { din: 0, xp: 0, loot: 0, heridas: 0, robo: 0, riesgo: 0 };
        const roboDin = mis ? roboMonedas(em.robo, mis.dif) : 0;
        // Las MISIONES del tablón (fuera) pueden FALLAR: el riesgo base sube con los
        // encuentros FALLADOS (em.riesgo). Al fallar pierdes la mitad del monedero + lo
        // robado; las heridas de los encuentros se aplican igual (ya ocurrieron).
        if (mis && Math.random() < Math.min(0.97, riesgoMision(mis) + em.riesgo)) {
          let lost = 0;
          if (window.HacStats) { const wallet = HacStats.dinero(myId); const anti = HacStats.bonusAntirrobo ? HacStats.bonusAntirrobo(myId) : 0; lost = Math.round(Math.min(wallet, Math.round(wallet * 0.5) + roboDin) * (1 - anti)); if (lost > 0) HacStats.award(myId, { dinero: -lost }); }
          if (em.heridas > 0 && HacStats.herir) HacStats.herir(myId, em.heridas); sucClear(o);
          _cobradas.add(sucKey(o)); HacOrdenes.clear(h.id, myId);
          toast(lost > 0 ? `❌ Misión fallida · perdiste ${lost} 💰` : '❌ Misión fallida · sin botín');
          if (window.HacBitacora) HacBitacora.log(myId, 'expedicion', '🧭 ' + (mis.nombre || 'Expedición') + ': ✘ fracaso' + (lost > 0 ? ` · −${lost}💰` : ''));
          _wasOnMission = false; applyOrders();
          return;
        }
        let r = HacPuntos.recompensa(costeMision(dom), o.duracionSeg || 60);
        // Las ACTIVIDADES INTERNAS (en edificios) rinden MÁS prestigio según tu nivel
        // del stat de ese dominio: nivel 1 = ×1, nivel 2 = ×1.2, nivel 3 = ×1.3, …
        if (!mis && dom && HacStats && HacStats.nivelTotal) {
          // ×1 a nivel 1, +0,1 por nivel, CAPADO a ×3 (nivel 20+) para que la curva
          // aplanada no dispare el prestigio de las tareas internas en niveles altos.
          const n = HacStats.nivelTotal(myId, dom);
          r = Math.round(r * (n <= 1 ? 1 : 1 + Math.min(n, 20) * 0.1));
          if (tieneT('canciller')) r = Math.round(r * 1.3);   // 丞相: +30% prestigio en tareas internas
        }
        if (HacStats && HacStats.bonusPrestigio) r = Math.round(r * (1 + HacStats.bonusPrestigio(myId)));   // ropa de torso rara: +% prestigio
        HacPuntos.award(h.id, myId, r);
        retoAdd('prestigio', r);   // reto semanal: prestigio ganado
        // La misión del tablón da, además del prestigio, dinero + XP PERSONAL (al dominio).
        let extra = '';
        if (mis && window.HacStats) {
          const rec = HacMisiones.recompensa(mis);
          const dinPct = bonos.dinero + (HacStats.bonusDinero ? HacStats.bonusDinero(myId) : 0)
            + ((miCargo && miCargo.perk.dinero) ? miCargo.perk.dinero : 0)   // pabellón 政 + sellos + perk 太守
            + (tieneT('gobernador') ? 0.10 : 0);                             // 太守 Gobernador (senda)
          // Las HERIDAS merman lo que traes a casa (dinero + XP): −15 % por herida.
          const hurt = 1 - (HacStats.penHerida ? HacStats.penHerida(myId) : 0);
          const rm = retoMultMision(mis);   // misiones muy por debajo de tu nivel rinden menos (rutina)
          let dinB = Math.round(conBono(rec.dinero, dinPct) * hurt * rm), xpB = Math.round(conBono(rec.xp, xpFracMision(rec.dom)) * hurt * rm);
          // ENCUENTROS del viaje: modifican la recompensa (din/xp %).
          if (em.din) dinB = Math.max(0, Math.round(dinB * (1 + em.din)));
          if (em.xp) xpB = Math.max(0, Math.round(xpB * (1 + em.xp)));
          const nivAntes = (rec.dom && HacStats.nivel) ? HacStats.nivel(myId, rec.dom) : 0;
          HacStats.award(myId, { dinero: dinB, xp: rec.dom ? { [rec.dom]: xpB } : null });
          if (rec.dom && HacStats.nivel && window.HacBitacora) { const nivD = HacStats.nivel(myId, rec.dom); if (nivD > nivAntes) HacBitacora.log(myId, 'progreso', `⬆ ${DOM_NOMBRE[rec.dom]} sube a nivel ${nivD}`); }
          extra = ` · +${dinB}💰 · +${xpB} XP ${DOM_GLYPH[rec.dom] || ''}`.trimEnd();
          if (hurt < 1) extra += ` · herido −${Math.round((1 - hurt) * 100)}%`;
          // BOTÍN: prob. baja (sube con la dificultad) de traer 1 objeto del pool
          // completo, ponderado por tier. Si es comida, se aplica; si no, a la mochila.
          const gotLoot = HacMisiones.lootChance ? (Math.random() < HacMisiones.lootChance(mis.dif)) : false;
          const lootId = gotLoot && HacTienda.botinAleatorio ? HacTienda.botinAleatorio(tier) : null;
          const loot = lootId && window.HacTienda ? HacTienda.get(lootId) : null;
          if (loot) {
            // COMIDA (té, raciones): se come en el camino → energía al momento, NO va a la
            // mochila (se avisa con +⚡, no con 🎁, para no dar a entender que la guardas).
            if (loot.efecto && loot.efecto.energia) { if (window.HacEnergia) HacEnergia.add(h.id, myId, loot.efecto.energia); extra += ` · ${loot.icon} ${loot.nombre} +${loot.efecto.energia}⚡`; }
            else { const r2 = HacStats.darItem(myId, lootId); extra += r2.ok ? ` · 🎁 ${loot.icon} ${loot.nombre}` : ` · 🎁 ${loot.nombre} (mochila llena)`; }
          }
          // Botín EXTRA de los encuentros superados.
          for (let k = 0; k < (em.loot || 0); k++) {
            const xid = HacTienda.botinAleatorio ? HacTienda.botinAleatorio(tier) : null;
            const xit = xid ? HacTienda.get(xid) : null;
            if (xit) {
              if (xit.efecto && xit.efecto.energia) { if (window.HacEnergia) HacEnergia.add(h.id, myId, xit.efecto.energia); extra += ` · ${xit.icon} ${xit.nombre} +${xit.efecto.energia}⚡`; }
              else { const rx = HacStats.darItem(myId, xid); extra += rx && rx.ok ? ` · 🎁 ${xit.icon} ${xit.nombre}` : ` · 🎁 ${xit.nombre} (mochila llena)`; }
            }
          }
          // Robo (encuentros fallados) + heridas. La ropa rara reduce el robo (antirrobo).
          if (roboDin > 0) { const w = HacStats.dinero(myId), anti = HacStats.bonusAntirrobo ? HacStats.bonusAntirrobo(myId) : 0, take = Math.round(Math.min(roboDin, w) * (1 - anti)); if (take > 0) { HacStats.award(myId, { dinero: -take }); extra += ` · −${take}💰 robados`; } }
          if (em.heridas > 0 && HacStats.herir) { HacStats.herir(myId, em.heridas); extra += ' · ✚ herido'; }
          sucClear(o);
          retoAdd('misiones', 1);   // reto semanal: expedición del tablón completada
        }
        _cobradas.add(sucKey(o));
        HacOrdenes.clear(h.id, myId);   // optimista: la quita del caché ya
        toast('+' + r + ' puntos · misión cumplida' + extra);
        if (window.HacBitacora) {
          if (mis) HacBitacora.log(myId, 'expedicion', '🧭 ' + (mis.nombre || 'Expedición') + ': ✔ éxito' + extra);
          else { const tk = (window.HacTareas && HacTareas.get) ? HacTareas.get(o.targetId) : null; HacBitacora.log(myId, 'tarea', '⚒ ' + ((tk && (tk.nombre || tk.verbo)) || 'Tarea en la finca') + ` · +${r} pts`); }
        }
        _wasOnMission = false;
        applyOrders();                  // re-sincroniza el sim sin la orden
        return;
      }
      _wasOnMission = onM;
    }

    // ════════ ENCUENTROS (capa A) — retos por el camino de una EXPEDICIÓN ═════════
    // Cada misión declara en su POOL una lista de APTITUDES (mis.enc), visibles como
    // iconos en el tablón ANTES de aceptarla. Por el camino aparece un encuentro por
    // cada una: una TIRADA ÚNICA contra tu nivel en ese dominio. Si sale bien, extra de
    // recompensa; si sale mal, menos botín, más riesgo del objetivo, robo o (raro) una
    // herida. Deterministas por semilla del id de orden; el resultado se guarda en
    // localStorage (a prueba de refresco). Si NO los atiendes en vivo, quedan PENDIENTES
    // y BLOQUEAN el cobro de la misión hasta que los resuelvas al volver.
    // Efectos: din/xp (% sobre la recompensa), loot (nº objetos extra), heridas (nº),
    // robo (nº → monedas según dificultad), riesgo (suma al % de fracaso del objetivo).
    const ENCUENTROS = {
      militar: [
        { id: 'emboscada', txt: '¡Emboscada en el desfiladero!', desc: 'Unos forajidos os cortan el paso entre las rocas.', ok: { loot: 1, xp: 0.25 }, fail: { heridas: 1, riesgo: 0.08 } },
        { id: 'duelo',     txt: 'Un oficial os reta a duelo',     desc: 'Un guerrero enemigo os desafía en singular combate.', ok: { din: 0.30, xp: 0.20 }, fail: { riesgo: 0.12 } },
        { id: 'fiera',     txt: 'Una fiera cierra el sendero',    desc: 'Un tigre hambriento ronda el camino, inquieto.', ok: { loot: 1, din: 0.10 }, fail: { heridas: 1 } },
        { id: 'patrulla',  txt: 'Una patrulla hostil os detecta', desc: 'Soldados enemigos os cierran el paso, lanza en mano.', ok: { din: 0.25 }, fail: { robo: 1, riesgo: 0.10 } },
      ],
      cultural: [
        { id: 'inscripciones', txt: 'Un santuario en ruinas',      desc: 'Entre las columnas caídas asoman inscripciones antiguas.', ok: { xp: 0.40, loot: 1 }, fail: {} },
        { id: 'poeta',         txt: 'Un poeta errante os desafía',  desc: 'Os reta a un duelo de versos ante testigos.', ok: { xp: 0.30, din: 0.15 }, fail: { din: -0.10 } },
        { id: 'rumor',         txt: 'Corre un rumor aprovechable',  desc: 'En una posada oís algo que podríais usar a vuestro favor.', ok: { din: 0.25 }, fail: { riesgo: 0.08 } },
        { id: 'copista',       txt: 'Un templo pide copiar textos', desc: 'Los monjes ofrecen recompensa por reproducir sus escritos.', ok: { xp: 0.35 }, fail: { din: -0.05 } },
      ],
      administrativo: [
        { id: 'mercader', txt: 'Un mercader varado ofrece trato',     desc: 'Un carro volcado bloquea el vado; su dueño ofrece recompensa.', ok: { din: 0.30, loot: 1 }, fail: { din: -0.10 } },
        { id: 'peaje',    txt: 'Un funcionario corrupto exige peaje', desc: 'Un magistrado local quiere mojar en vuestro paso.', ok: { din: 0.20 }, fail: { robo: 1, riesgo: 0.06 } },
        { id: 'disputa',  txt: 'Dos aldeanos os piden mediar',        desc: 'Un pleito de lindes amenaza con acabar a golpes.', ok: { din: 0.25, xp: 0.15 }, fail: { din: -0.10 } },
        { id: 'contrato', txt: 'Ocasión de un buen contrato',         desc: 'Se puede cerrar un trato ventajoso para la casa.', ok: { din: 0.35 }, fail: { robo: 1 } },
      ],
    };
    const encById = (dom, id) => (ENCUENTROS[dom] || []).find(e => e.id === id) || null;
    const sucKey = (o) => myId + '|' + o.inicioMs + '|' + o.targetId;
    // Prob. de ÉXITO por NIVEL vs dificultad (curva base). +13% por nivel de ventaja.
    function pByNivel(niv, dif) { return Math.max(0.12, Math.min(0.9, 0.42 + 0.13 * ((niv || 1) - (dif || 3)))); }
    // Encuentro individual: recibe el DOMINIO y usa TU nivel efectivo en él.
    function pEncuentro(dom, dif) { return pByNivel(nivelEf(dom), dif); }
    // Escaramuzas coop (encuentros + SUCESOS A2b): reciben el NIVEL/stat ya calculado.
    const pSuceso = pByNivel;
    // Monedas perdidas por un "robo" (escala con la dificultad de la misión).
    const roboMonedas = (n, dif) => Math.round((n || 0) * (8 + (dif || 1) * 4));
    // Plan DETERMINISTA de encuentros: uno por aptitud de mis.enc, repartidos por el
    // viaje (mismos para todos, estable al refrescar).
    function encPlan(o, mis) {
      const enc = (mis && mis.enc) || [];
      if (!enc.length || !window.HacRand) return [];
      const durMs = (o.duracionSeg || 60) * 1000, startMs = o.inicioMs;
      const R = HacRand.make('enc#' + sucKey(o));
      const frac = enc.length >= 2 ? [0.38, 0.72] : [0.5];
      return enc.map((dom, i) => {
        const pool = ENCUENTROS[dom] || [];
        const pick = pool.length ? pool[R.int(pool.length)] : null;
        return { i: i, dom: dom, encId: pick ? pick.id : null, atMs: startMs + Math.round(durMs * (frac[i] || 0.5)) };
      });
    }
    // Estado de encuentros: EN MEMORIA (verdad de sesión) + espejo en localStorage
    // (sobrevive a refrescos). resolved[i] = { ok:bool }.
    const sucMem = {};
    const sucLsKey = (o) => 'rotk.enc.' + sucKey(o);
    function sucLoad(o) {
      const k = sucLsKey(o);
      if (sucMem[k]) return sucMem[k];
      try { const v = JSON.parse(localStorage.getItem(k)); if (v) { sucMem[k] = v; return v; } } catch (e) {}
      const def = { resolved: {} }; sucMem[k] = def; return def;
    }
    function sucSave(o, st) { const k = sucLsKey(o); sucMem[k] = st; try { localStorage.setItem(k, JSON.stringify(st)); } catch (e) {} }
    function sucClear(o) { const k = sucLsKey(o); delete sucMem[k]; try { localStorage.removeItem(k); } catch (e) {} }
    // ¿Quedan encuentros SIN resolver en esta orden? (bloquea el cobro al volver).
    function encPend(o, mis) { const rez = (sucLoad(o).resolved) || {}; return encPlan(o, mis).some(ev => rez[ev.i] == null); }
    // Primer encuentro RESOLUBLE ahora (ya llegó su momento) y sin resolver. null si no hay.
    function encResolvible(o, mis) {
      const now = clock(), rez = (sucLoad(o).resolved) || {};
      return encPlan(o, mis).find(ev => now >= ev.atMs && rez[ev.i] == null) || null;
    }
    // Suma de efectos de los encuentros YA resueltos (se aplican al cobrar).
    function encTotales(o, mis) {
      const rez = (sucLoad(o).resolved) || {}, t = { din: 0, xp: 0, loot: 0, heridas: 0, robo: 0, riesgo: 0 };
      encPlan(o, mis).forEach(ev => {
        const r = rez[ev.i]; if (!r) return;
        const enc = encById(ev.dom, ev.encId); if (!enc) return;
        const s = (r.ok ? enc.ok : enc.fail) || {};
        t.din += s.din || 0; t.xp += s.xp || 0; t.loot += s.loot || 0; t.heridas += s.heridas || 0; t.robo += s.robo || 0; t.riesgo += s.riesgo || 0;
      });
      return t;
    }
    // ── Carta de ENCUENTRO (modal): narrativa + una TIRADA ÚNICA «Afrontar» ─────────
    let sucEl = null, encReportAnim = null;
    function ensureSucEl() {
      if (sucEl) return sucEl;
      sucEl = document.createElement('div'); sucEl.className = 'hacp-suc-ov'; sucEl.hidden = true; document.body.appendChild(sucEl);
      ['pointerdown', 'pointerup', 'wheel', 'click'].forEach(ev => sucEl.addEventListener(ev, e => e.stopPropagation(), { passive: false }));
      return sucEl;
    }
    function closeSuc() { if (encReportAnim) { encReportAnim.stop(); encReportAnim = null; } if (sucEl) sucEl.hidden = true; }
    // Resumen legible del efecto de un encuentro (se aplica al VOLVER, al cobrar).
    function encEffTxt(enc, ok, dif) {
      const s = (ok ? enc.ok : enc.fail) || {}, p = [];
      if (s.din) p.push((s.din > 0 ? '+' : '−') + Math.round(Math.abs(s.din) * 100) + '% recompensa');
      if (s.xp) p.push('+' + Math.round(s.xp * 100) + '% XP');
      if (s.loot) p.push('+' + s.loot + ' botín');
      if (s.riesgo) p.push('+' + Math.round(s.riesgo * 100) + '% riesgo del objetivo');
      if (s.robo) p.push('−' + roboMonedas(s.robo, dif) + '💰 robados');
      if (s.heridas) p.push('herido');
      return p.length ? p.join(' · ') : 'sin consecuencias';
    }
    // Tira el dado (sembrado → estable al refrescar) de un encuentro y guarda el resultado.
    function encAfrontar(o, mis, ev) {
      const enc = encById(ev.dom, ev.encId); if (!enc) return;
      const st = sucLoad(o); st.resolved = st.resolved || {};
      if (st.resolved[ev.i] != null) { encAbrir(o, mis); return; }   // ya resuelto: pasa al siguiente
      const R = HacRand.make('encr#' + sucKey(o) + '#' + ev.i);
      const ok = R.next() < pEncuentro(ev.dom, mis.dif);
      st.resolved[ev.i] = { ok: ok }; sucSave(o, st);
      if (ok) retoAdd('encuentros', 1);   // reto semanal: encuentro superado

      if (window.HacBitacora) HacBitacora.log(myId, 'expedicion', `${DOM_GLYPH[ev.dom] || '⚔'} ${enc.txt} → ${ok ? '✔ superado' : '✘ fallado'}`, { clave: 'enc:' + sucKey(o) + ':' + ev.i });
      if (charId) buildCharPanel(charId);
      // VIÑETA ANIMADA de la resolución (coreografía dedicada por encuentro, con rama
      // éxito/fracaso); al llegar al clímax se revela el verdicto + efecto. El dado ya
      // está tirado arriba (determinista): la animación solo escenifica el resultado.
      const total = encPlan(o, mis).length;
      const el = ensureSucEl(); el.hidden = false;
      el.innerHTML = `<div class="hacp-suc-box hacp-enc-box">
        <div class="hacp-suc-eyebrow">${domIcon(ev.dom)} ${total > 1 ? `Encuentro ${ev.i + 1} de ${total}` : 'Encuentro'} · ${esc(mis.nombre || 'Expedición')}</div>
        <div class="hacp-suc-ttl">${esc(enc.txt)}</div>
        <canvas class="hacp-enc-anim" data-enc-cv></canvas>
        <div class="hacp-enc-result" data-enc-result hidden>
          <div class="hacp-suc-verdict ${ok ? 'ok' : 'bad'}">${ok ? '✔ Superado' : '✘ Ha salido mal'}</div>
          <div class="hacp-suc-eff">Al volver: ${esc(encEffTxt(enc, ok, mis.dif))}</div>
        </div>
        <button type="button" class="hacp-cp-btn hacp-suc-done" data-enc-done>Continuar</button></div>`;
      const cv = el.querySelector('[data-enc-cv]');
      const resEl = el.querySelector('[data-enc-result]');
      const reveal = () => { if (resEl && resEl.hidden) { resEl.hidden = false; resEl.classList.add('show'); } };
      if (encReportAnim) { encReportAnim.stop(); encReportAnim = null; }
      if (window.HacEncAnim && cv) {
        const hero = escAnimActor(myId, true);   // el mecenas vestido con su equipo
        requestAnimationFrame(() => { encReportAnim = HacEncAnim.play(cv, { scene: enc.id, ok: ok, hero: hero, onEnd: reveal }); });
        cv.addEventListener('click', () => { if (encReportAnim) encReportAnim.stop(); reveal(); });   // tap para saltar
      } else { reveal(); }
      el.querySelector('[data-enc-done]').addEventListener('click', () => { if (encReportAnim) { encReportAnim.stop(); encReportAnim = null; } encAbrir(o, mis); });
    }
    // Abre el encuentro pendiente (si lo hay). Si ya no quedan, cierra e intenta cobrar.
    function encAbrir(o, mis) {
      const ev = encResolvible(o, mis);
      if (!ev) { closeSuc(); applyOrders(); return; }   // no quedan resolubles → cobra/limpia si procede
      const enc = encById(ev.dom, ev.encId); if (!enc) { closeSuc(); return; }
      const p = Math.round(pEncuentro(ev.dom, mis.dif) * 100);
      const total = encPlan(o, mis).length;   // «Encuentro X de N»: deja claro cuántos trae la misión
      const el = ensureSucEl(); el.hidden = false;
      el.innerHTML = `<div class="hacp-suc-box">
        <div class="hacp-suc-eyebrow">${domIcon(ev.dom)} ${total > 1 ? `Encuentro ${ev.i + 1} de ${total}` : 'Encuentro'} · ${esc(mis.nombre || 'Expedición')}</div>
        <div class="hacp-suc-ttl">${esc(enc.txt)}</div>
        <div class="hacp-suc-desc">${esc(enc.desc || '')}</div>
        <div class="hacp-enc-apt">Se resuelve con tu <b style="color:${DOM_COLOR[ev.dom]}">${DOM_NOMBRE[ev.dom]}</b> · nivel ${nivelEf(ev.dom)} vs dificultad ${mis.dif}</div>
        <div class="hacp-enc-hint">El % sube cuanto más alto tengas tu <b>${DOM_NOMBRE[ev.dom]}</b> respecto a la dificultad.</div>
        <div class="hacp-suc-ops"><button type="button" class="hacp-suc-op" data-enc-go><span class="hacp-suc-opt">Afrontar el encuentro</span><span class="hacp-suc-pct">${p}%</span></button></div>
        </div>`;
      el.querySelector('[data-enc-go]').addEventListener('click', () => encAfrontar(o, mis, ev));
    }
    // MI expedición en curso / recién vuelta (o null). Reutilizado por los puntos de entrada.
    function miExped() {
      if (!myId || !window.HacOrdenes || !window.HacMisiones) return null;
      const o = HacOrdenes.mine(h.id, myId); if (!o || o.tipo !== 'expedicion') return null;
      if (String(o.targetId || '').indexOf('escaramuza:') === 0) return null;
      const mis = HacMisiones.get(String(o.targetId || '').replace('mis:', '')); if (!mis) return null;
      return { o: o, mis: mis };
    }
    // Punto de entrada desde «Misiones»: abre los encuentros resolubles. true si había algo.
    function abrirEncuentrosPend() {
      const e = miExped(); if (!e || !encResolvible(e.o, e.mis)) return false;
      encAbrir(e.o, e.mis); return true;
    }
    // ¿Hay AHORA un encuentro que atender? (dispara el parpadeo del botón «Misiones»).
    function encAvisoPend() { const e = miExped(); return !!(e && encResolvible(e.o, e.mis)); }
    // Parpadeo del botón «Misiones» (escritorio + barra móvil + nav de secciones).
    function pulseMisNav() {
      const on = encAvisoPend();
      const tool = charEl ? charEl.querySelector('.hacp-cp-board') : null;
      if (tool) tool.classList.toggle('pulse', on);
      const mo = mobar ? mobar.querySelector('.hacp-mo-mis') : null;
      if (mo) mo.classList.toggle('pulse', on);
      const nav = document.querySelector('#hacp-mnav [data-sec="misiones"]');
      if (nav) nav.classList.toggle('pulse', on && !nav.classList.contains('on'));
    }
    // Badge rojo con el nº de misiones disponibles en la barra móvil (el de escritorio
    // lo pinta toolbarHTML). Si no hay badge, es que no queda ninguna hoy.
    function refreshMoMisBadge() {
      if (!mobar) return;
      const btn = mobar.querySelector('.hacp-mo-mis'); if (!btn) return;
      const n = (typeof misDisponiblesCount === 'function') ? misDisponiblesCount() : 0;
      let b = btn.querySelector('.hacp-mo-badge');
      if (n > 0) { if (!b) { b = document.createElement('span'); b.className = 'hacp-mo-badge'; btn.appendChild(b); } b.textContent = n; }
      else if (b) b.remove();
    }
    // Badge de Producción en la barra móvil (encargos entregables).
    function refreshMoProdBadge() {
      if (!mobar) return;
      const btn = mobar.querySelector('.hacp-mo-prod'); if (!btn) return;
      const n = (typeof encargosEntregables === 'function') ? encargosEntregables() : 0;
      let b = btn.querySelector('.hacp-mo-badge');
      if (n > 0) { if (!b) { b = document.createElement('span'); b.className = 'hacp-mo-badge'; btn.appendChild(b); } b.textContent = n; }
      else if (b) b.remove();
    }

    // Repinta la caja de prestigio in situ (el prestigio se carga async tras el
    // primer render y crece al completar misiones: hay que refrescarla, no dejarla
    // clavada con el valor del primer pintado).
    function updatePrestige() {
      const box = document.querySelector('.hacp-iso-prestige'); if (!box) return;
      const led = window.HacPuntos ? HacPuntos.totalHacienda(h.id) : 0;
      const pr = HacCalc.prestigio(h, led);
      const pT = HacCalc.tierDePuntos(pr);
      const pg = HacCalc.progresoHacia(pr, pT);
      const zh = box.querySelector('.hacp-isop-zh');
      const top = box.querySelector('.hacp-isop-top');
      const span = box.querySelector('.hacp-isop-bar span');
      const lbl = box.querySelector('.hacp-isop-lbl');
      if (zh) zh.textContent = pT.zh || '';
      if (top) top.innerHTML = `<b>${pr.toLocaleString('es')}</b> prestigio · <span>Nivel ${pT.nivel} · ${esc(pT.nombre)}</span>`;
      if (span) span.style.width = (pg ? pg.pct : 100) + '%';
      if (lbl) lbl.innerHTML = pg
        ? `Faltan <b>${pg.faltan.toLocaleString('es')}</b> para ${esc(pg.sig.zh)} ${esc(pg.sig.nombre)}`
        : '★ Nivel máximo alcanzado';
    }
    // El panel HacRender (.hacp-detail: cargos por rango + barra de nivel) se pinta
    // una vez y el prestigio se carga async y crece al jugar: hay que repintarlo para
    // que los mecenas suban de cargo y la barra avance.
    function updateDetail() {
      const det = document.querySelector('.hacp-detail');
      if (det && window.HacRender) det.innerHTML = HacRender.panelHTML(h);
    }
    const refresh = () => { renderList(); refreshCharPanel(); syncCaballosFolk(); updatePrestige(); updateDetail(); if (window.HacFolk && HacFolk.refreshCargos) HacFolk.refreshCargos(); };
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
      if (typeof debPulse === 'function') debPulse();   // debates: sim + resolución responsivos
      refresh();
    }
    // ¿El mecenas está OCUPADO/FUERA ahora mismo? Cubre TODO: una misión interna o
    // expedición del tablón (orden activa), una escaramuza lanzada (también orden), o
    // pertenecer a una banda/peregrinaje que aún NO ha vuelto: 'abierta' (montándose,
    // sin orden todavía), 'en_curso' (fuera) o 'abortando' (regresando). NO cuenta
    // 'botin'/'resuelta' (ya ha vuelto, solo queda repartir botín → puede volver a
    // actuar). Si está ocupado, no puede elegir NINGUNA otra actividad.
    const ocupadoAhora = (id) => {
      if (window.HacOrdenes && HacOrdenes.mine(h.id, id)) return true;
      const b = window.HacEscaramuzas && HacEscaramuzas.miBanda(h.id, id);
      return !!(b && (b.estado === 'abierta' || b.estado === 'en_curso' || b.estado === 'abortando'));
    };
    function dispatch(taskId) {
      if (!myId || !taskId || !window.HacOrdenes) return;
      if (ocupadoAhora(myId)) { toast('Tu mecenas ya está ocupado · espera a que vuelva o libéralo'); return; }
      const t = availableTasks().find(x => x.taskId === taskId); if (!t) return;
      if (window.HacEnergia) HacEnergia.spend(h.id, myId, costeMision(t.dominio));   // la tarea cuesta energía
      HacOrdenes.set({ haciendaId: h.id, miembroId: myId, tipo: 'mision', targetId: taskId, duracionSeg: t.duracionSeg })
        .then(applyOrders).catch(e => console.warn('[orden] set', e));
    }
    // Enviar a una MISIÓN del tablón (sale de la finca, tipo 'expedicion').
    // Duración de una expedición con el ahorro de tiempo del EQUIPO (enseres de marcha)
    // + el CABALLO (montura propia → viaje más rápido).
    const durExped = (m) => Math.max(30, Math.round(HacMisiones.durSeg(m) * (1 - (HacStats.bonusExped ? HacStats.bonusExped(myId) : 0) - (tieneT('estratega') ? 0.10 : 0) - caballoExped())));
    function dispatchMision(misId) {
      if (!myId || !window.HacOrdenes || !window.HacMisiones) return;
      if (ocupadoAhora(myId)) { toast('Tu mecenas ya está ocupado · espera a que vuelva'); return; }
      if (window.HacStats && HacStats.malherido && HacStats.malherido(myId)) { toast('Tu mecenas está malherido · cúralo antes de salir'); return; }
      const m = HacMisiones.get(misId); if (!m) return;
      if (window.HacEnergia) HacEnergia.spend(h.id, myId, costeExped(m));
      if (window.HacMisTomadas) HacMisTomadas.tomar(h.id, misId);   // se consume de TU tablón hasta el relleno diario
      HacOrdenes.set({ haciendaId: h.id, miembroId: myId, tipo: 'expedicion', targetId: 'mis:' + misId, duracionSeg: durExped(m) })
        .then(applyOrders).catch(e => console.warn('[orden] set', e));
    }
    // ESCARAMUZA: cuando MI banda está 'en_curso', mi mecenas sale por la puerta
    // (reusa la maquinaria de expedición: camina al portón, 拱手/saludo y se va) hasta
    // el regreso. Cada cliente dispara la salida de SU mecenas; así el grupo coincide
    // en la puerta. La resolución/recompensa es aparte (4c).
    function syncEscaramuzaOrder() {
      if (!myId || !window.HacEscaramuzas || !window.HacOrdenes) return;
      const band = HacEscaramuzas.miBanda(h.id, myId);
      if (!band) return;
      const now = clock();
      if (band.estado === 'en_curso') {
        if (now >= band.finMs) return;
        if (HacOrdenes.mine(h.id, myId)) return;                 // ya ocupado: no pisar otra orden
        HacOrdenes.set({ haciendaId: h.id, miembroId: myId, tipo: 'expedicion', targetId: 'escaramuza:' + band.id, duracionSeg: Math.max(30, Math.round((band.finMs - now) / 1000)) })
          .then(applyOrders).catch(e => console.warn('[escaramuza] orden', e));
      } else if (band.estado === 'abortando') {
        // El capitán abortó → todos vuelven en 5 min: re-temporiza MI orden para
        // terminar en band.finMs si ahora mismo acaba más tarde.
        const o = HacOrdenes.mine(h.id, myId);
        if (o && String(o.targetId || '').indexOf('escaramuza:') === 0 && now < band.finMs) {
          const fin = o.inicioMs + (o.duracionSeg || 0) * 1000;
          if (fin > band.finMs + 4000) {
            HacOrdenes.set({ haciendaId: h.id, miembroId: myId, tipo: 'expedicion', targetId: 'escaramuza:' + band.id, duracionSeg: Math.max(5, Math.round((band.finMs - now) / 1000)) })
              .then(applyOrders).catch(e => console.warn('[escaramuza] re-temporizar', e));
          }
        }
        // Pasado el tiempo, el capitán disuelve la banda abortada.
        if (now >= band.finMs && band.hostId === myId) HacEscaramuzas.salir(band.id, myId).catch(() => {});
      }
    }
    // Pasa al simulador qué walkers están en una banda lanzada (con su inicioMs
    // compartido) para coreografiar la concentración + grito de guerra en la puerta.
    function syncEscaramuzaFolk() {
      if (!window.HacFolk || !HacFolk.setEscaramuzas || !window.HacEscaramuzas) return;
      const map = {};
      (HacEscaramuzas.all(h.id) || []).forEach(b => {
        if (b.estado !== 'en_curso') return;
        const ms = b.miembros || [];
        const pereg = esPereg(b);
        // `pereg`/`hurt`/`hostId` coreografían el peregrinaje: el herido (host) sale
        // cojeando y calla; el escolta anuncia el viaje (ver escCheerFor en hac-folk).
        ms.forEach((m, idx) => { map[m.id] = { inicioMs: b.inicioMs, finMs: b.finMs, idx, n: ms.length, pereg, hostId: b.hostId, hurt: pereg && m.id === b.hostId }; });
      });
      HacFolk.setEscaramuzas(map);
    }

    // ═══════════════════ DEBATES (invitar a debatir · tarea social) ═══════════════════
    const DEB = window.HacDebates || null;
    const walkerIdOf = (m) => m && (m.personajeId || m.id);              // = id del walker en el sim
    const esNpc = (m) => !!m && !m.personajeId;                          // sin personaje/dueño → auto-acepta
    const miMiembro = () => (h.miembros || []).find(m => walkerIdOf(m) === myId) || null;
    const miNombreDeb = () => { const m = miMiembro(); return (m && m.nombre) || (_myPj && _myPj.nombre) || 'Tú'; };
    const debTema = (id) => DEB && DEB.temaDe ? DEB.temaDe(id) : null;
    const debNivel = (pjId, temaId) => { const t = debTema(temaId); if (!t || !window.HacStats || !HacStats.nivelTotal) return 0; return t.doms.reduce((s, d) => s + HacStats.nivelTotal(pjId, d), 0); };
    // Probabilidad de ganar por DIFERENCIA de nivel, con dos pendientes: hasta 20 de
    // diferencia sube POCO (skill apenas inclina la balanza); a partir de 20, cada punto
    // pesa bastante más (una superioridad clara sí decide). Siempre queda hueco a la sorpresa.
    const DEB_GENTLE = 0.005, DEB_STEEP = 0.013, DEB_KNEE = 20;   // /punto; ajustables
    function debProb(nA, nB) {
      const diff = nA - nB, a = Math.abs(diff);
      const adv = a <= DEB_KNEE ? a * DEB_GENTLE : DEB_KNEE * DEB_GENTLE + (a - DEB_KNEE) * DEB_STEEP;
      return Math.max(0.10, Math.min(0.90, 0.5 + (diff < 0 ? -adv : adv)));
    }
    // Jardines de la finca APTOS para debate: tipo jardín + área ≥ 4 (1×4 / 2×2 mín.).
    // cell = celda representativa (pos); cells = todas sus celdas (resaltado + hit-test).
    function gardensFinca() {
      const G = { jardin: 1, 'jardin-flores': 1, bonsai: 1 };
      const B = window.HacBuild;
      return ((h.mapa && h.mapa.construcciones) || []).filter(c => G[c.tipo]).map(c => {
        const def = B && B.tipo(c.tipo);
        const cells = (B && B.celdasOcupadas) ? B.celdasOcupadas(c) : [[c.pos[0], c.pos[1]]];
        return { cell: c.pos[0] + ',' + c.pos[1], cells, area: cells.length, nombre: (def && def.nombre) || 'Jardín', zh: (def && def.zh) || '园' };
      }).filter(g => g.area >= 4);
    }
    // Un jardín está OCUPADO si ya aloja un debate propuesto/en_curso (uno por jardín).
    function jardinOcupado(cell) { return !!DEB && DEB.all(h.id).some(d => (d.estado === 'propuesto' || d.estado === 'en_curso') && d.jardinCell === cell); }
    function gardensDisponibles() { return gardensFinca().filter(g => !jardinOcupado(g.cell)); }
    // Resultado DETERMINISTA (mismo id → igual en todos los clientes y en la repetición).
    function debOutcome(d) {
      const t = debTema(d.tema), doms = t ? t.doms : ['cultural'];
      const nH = debNivel(d.hostId, d.tema), nI = debNivel(d.invitadoId, d.tema);
      const p0 = debProb(nH, nI);   // ventaja inicial por nivel
      // El mini-juego argumental mueve el tira y afloja; las jugadas que falten (turnos no
      // jugados a los 5 min) se completan con IA determinista → mismo resultado en todos.
      const jug = (d.jugadas || []).slice();
      if (DEB && DEB.TURNS) {
        for (let i = jug.length; i < DEB.TURNS; i++) {
          const dd = { id: d.id, hostId: d.hostId, invitadoId: d.invitadoId, jugadas: jug };
          const actor = DEB.turnActorId(dd, i);
          jug.push({ t: i, s: DEB.iaStance(dd, i, debNivel(actor, d.tema)), ms: 0 });
        }
      }
      const pHost = DEB ? DEB.tug({ id: d.id, hostId: d.hostId, invitadoId: d.invitadoId, jugadas: jug }, p0).p : p0;
      const rw = (window.HacRand && window.HacRand.make) ? window.HacRand.make('win#' + d.id) : { next: () => 0.5 };
      const ganador = (rw.next() < pHost) ? d.hostId : d.invitadoId;
      // El LIBRO favorece con fuerza al GANADOR: él saca conclusiones a menudo (y pueden
      // ser reveladoras); el perdedor rara vez y NUNCA reveladoras (como mucho, muy buenas).
      const libroDe = (pjId) => {
        const gana = pjId === ganador;
        const r = (window.HacRand && HacRand.make) ? HacRand.make('book#' + d.id + '#' + pjId) : { next: () => 1 };
        if (r.next() > (gana ? 0.75 : 0.30)) return null;
        const q = r.next();
        if (gana) return q > 0.80 ? 'reveladoras' : q > 0.45 ? 'muy-buenas' : 'buenas';
        return q > 0.85 ? 'muy-buenas' : 'buenas';                        // perdedor: nunca reveladoras
      };
      return { ganador, pHost, nH, nI, doms, libros: { [d.hostId]: libroDe(d.hostId), [d.invitadoId]: libroDe(d.invitadoId) } };
    }

    // Inyecta al sim los debates EN CURSO (coreografía en el jardín).
    let lastDebSig = '';
    function syncDebateFolk() {
      if (!window.HacFolk || !HacFolk.setDebate || !DEB) return;
      const map = {};
      (DEB.enCurso(h.id) || []).forEach(d => {
        map[d.hostId] = { inicioMs: d.inicioMs, finMs: d.finMs, jardinCell: d.jardinCell, partnerId: d.invitadoId, side: 0, seed: d.id };
        map[d.invitadoId] = { inicioMs: d.inicioMs, finMs: d.finMs, jardinCell: d.jardinCell, partnerId: d.hostId, side: 1, seed: d.id };
      });
      const sig = JSON.stringify(map);
      if (sig !== lastDebSig) { lastDebSig = sig; HacFolk.setDebate(map); }
    }
    // Fuerza el rebuild del panel (charSig='') además de refrescar: garantiza que una
    // invitación aceptada/rechazada desaparezca ya, sin depender de que sigOf lo detecte.
    function afterDebChange() { syncDebateFolk(); charSig = ''; refreshCharPanel(); renderDebAlert(); if (mShell && mShell.refreshDeb) mShell.refreshDeb(); }
    // Auto-acepta las invitaciones a NPC (sin dueño) que YO envié, tras ~5 s.
    const _npcTried = {};
    function debNpcAutoAccept() {
      if (!DEB || !myId) return;
      const inv = DEB.miInvitacionEnviada(h.id, myId);
      if (!inv || _npcTried[inv.id]) return;
      const m = (h.miembros || []).find(x => walkerIdOf(x) === inv.invitadoId);
      if (!m || !esNpc(m)) return;
      if (clock() - (inv.createdMs || 0) < 5000) return;
      _npcTried[inv.id] = true;
      DEB.aceptar(inv.id, inv.invitadoId, clock()).then(() => DEB.reload().then(afterDebChange)).catch(() => {});
    }
    // Nombres de dominio en castellano para la bitácora (nada de chino en texto informativo).
    const DOM_NOMBRE_XP = { militar: 'Militar', cultural: 'Cultural', administrativo: 'Administración' };
    // Reclama MIS recompensas de un debate terminado (XP, libro, prestigio) y lo registra.
    // Cada participante reclama lo SUYO por separado: antes solo cobraba quien sellaba el
    // resultado primero y el otro (¡aunque ganara!) se quedaba sin libro, sin XP y sin
    // entrada en la bitácora. Idempotente y PERSISTENTE: si ya tengo una entrada de bitácora
    // de este debate, no vuelvo a cobrar (ni siquiera tras recargar).
    function claimDebate(d) {
      if (window.HacBitacora && HacBitacora.listar && HacBitacora.listar(myId, 300).some(e => e.clave === 'debate:' + d.id)) { _debDone[d.id] = true; return; }
      _debDone[d.id] = true;
      const cierroEnVivo = d.estado === 'en_curso';   // lo cierro yo ahora → muestro el reveal
      const t = debTema(d.tema), doms = t ? t.doms : [];
      const oc = (d.resultado && d.resultado.ganador)
        ? { ganador: d.resultado.ganador, pHost: d.resultado.pHost, libros: d.resultado.libros || {}, doms, nH: debNivel(d.hostId, d.tema), nI: debNivel(d.invitadoId, d.tema) }
        : debOutcome(d);
      const soyGanador = oc.ganador === myId;
      const xpCada = 22 + (soyGanador ? 12 : 0);
      const xp = {}; oc.doms.forEach(dom => xp[dom] = xpCada);
      if (window.HacStats && HacStats.award) HacStats.award(myId, { xp });
      let extra = '', libroOk = false;
      const cal = (oc.libros || {})[myId];
      if (cal && window.HacStats && HacStats.darItem && DEB.bookId) {
        const rr = HacStats.darItem(myId, DEB.bookId(d.tema, cal));
        libroOk = !!(rr && rr.ok !== false);
        extra = libroOk ? ` · 📔 Conclusiones ${(DEB.CALIDADES[cal] || {}).nombre || cal}` : ' · 📔 (mochila llena)';
      }
      if (soyGanador && window.HacPuntos && HacPuntos.award) { let pr = HacPuntos.recompensa ? HacPuntos.recompensa(20, 300) : 8; if (HacStats && HacStats.bonusPrestigio) pr = Math.round(pr * (1 + HacStats.bonusPrestigio(myId))); HacPuntos.award(h.id, myId, pr); }
      const otro = (myId === d.hostId) ? d.invitadoNombre : d.hostNombre;
      const xpTxt = oc.doms.length ? ` · +${xpCada} XP (${oc.doms.map(dm => DOM_NOMBRE_XP[dm] || dm).join(', ')})` : '';
      if (window.HacBitacora) HacBitacora.log(myId, 'debate', `🗣 Debate de ${t ? t.nombre : d.tema} con ${otro || 'otro mecenas'}: ${soyGanador ? '✔ ganaste' : '✘ perdiste'}${xpTxt}${extra}`, { clave: 'debate:' + d.id });
      if (cierroEnVivo) DEB.resolver(d.id, { ganador: oc.ganador, pHost: oc.pHost, libros: oc.libros }).then(() => DEB.reload().then(afterDebChange)).catch(() => {});
      else afterDebChange();
      if (cierroEnVivo) mostrarRevelacionDebate(d, oc, { won: soyGanador, xp: xpCada, doms: oc.doms, libro: (cal && libroOk) ? cal : null });
      refresh();
    }
    // Barre TODOS mis debates ya terminados (resueltos o en curso pasado finMs) y reclama
    // lo pendiente. Sin el ledger de bitácora cargado no cobro, para no arriesgar doble cobro.
    const _debDone = {};
    function maybeResolveDebate() {
      if (!DEB || !myId) return;
      if (window.HacBitacora && HacBitacora.dbOk && !HacBitacora.dbOk()) return;
      DEB.all(h.id).forEach(d => {
        if (d.hostId !== myId && d.invitadoId !== myId) return;
        const terminado = d.estado === 'resuelto' || (d.estado === 'en_curso' && clock() >= d.finMs);
        if (terminado && !_debDone[d.id]) claimDebate(d);
      });
    }
    // Notificación de invitación pendiente (para el invitado).
    let _invNotified = '';
    function debNotify() {
      if (!DEB || !myId) return;
      const inv = DEB.miInvitacionPendiente(h.id, myId, clock());
      if (inv && _invNotified !== inv.id) { _invNotified = inv.id; const t = debTema(inv.tema); toast(`🗣 ${inv.hostNombre || 'Alguien'} te reta a un debate de ${t ? t.nombre : inv.tema}`); }
      if (!inv) _invNotified = '';
    }
    // Aviso "es tu turno" en el mini-juego (una vez por turno).
    let _turnNotified = '';
    function debTurnNotify() {
      if (!DEB || !myId) return;
      const d = DEB.miDebate(h.id, myId);
      if (!d || DEB.juegoCompleto(d)) return;
      const i = DEB.turnoActual(d);
      if (DEB.turnActorId(d, i) === myId) { const key = d.id + '#' + i; if (_turnNotified !== key) { _turnNotified = key; toast('🗣 Tu turno en el debate · argumenta'); } }
    }
    // Pulso de debates (poll): sim, auto-accept NPC, resolución, notificaciones, avisos.
    // Si el turno activo agotó sus 60 s, la IA juega por él AUNQUE nadie tenga la ventana
    // abierta → el debate avanza y no se queda un "tu turno" colgado un buen rato.
    function debAutoAdvance() {
      if (!DEB || !myId) return;
      const d = DEB.miDebate(h.id, myId);
      if (!d || DEB.juegoCompleto(d) || clock() <= DEB.turnoDeadline(d)) return;
      const i = DEB.turnoActual(d), actor = DEB.turnActorId(d, i);
      DEB.jugar(d.id, i, DEB.iaStance(d, i, debNivel(actor, d.tema))).then(() => DEB.reload().then(() => { syncDebateFolk(); renderDebAlert(); })).catch(() => {});
    }
    function debPulse() { if (!DEB) return; syncDebateFolk(); debNpcAutoAccept(); maybeResolveDebate(); debAutoAdvance(); debNotify(); debTurnNotify(); renderDebAlert(); }
    // Firma del estado de MI debate (invitación recibida / enviada / en curso / mi turno):
    // alimenta `sigOf` para que el panel se RECONSTRUYA solo cuando algo cambia (sin refrescar
    // el navegador) y `renderDebAlert` para el aviso flotante.
    function debStateSig() {
      if (!DEB || !myId) return '-';
      const inv = DEB.miInvitacionPendiente(h.id, myId, clock());
      const dd = DEB.miDebate(h.id, myId);
      const sent = DEB.miInvitacionEnviada(h.id, myId);
      const myTurn = dd && !DEB.juegoCompleto(dd) && DEB.turnActorId(dd, DEB.turnoActual(dd)) === myId;
      return [inv && inv.id, dd && dd.id, dd && dd.estado, dd ? DEB.jugCount(dd) : '', sent && sent.id, myTurn ? 1 : 0].join(',');
    }
    // Aviso FLOTANTE que parpadea: te retan a debatir (aceptar/rechazar) o es tu turno
    // (argumentar). Siempre visible sobre el mapa aunque el panel del personaje esté cerrado.
    let debAlertEl = null, _debAlertSig = '';
    function ensureDebAlertEl() {
      if (debAlertEl) return debAlertEl;
      debAlertEl = document.createElement('div');
      debAlertEl.className = 'hacp-deb-alert'; debAlertEl.hidden = true;
      vp.appendChild(debAlertEl);
      // Sin esto el mapa (que arrastra/zooma con punteros sobre vp) se come los taps de los botones.
      ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click'].forEach(ev => debAlertEl.addEventListener(ev, (e) => e.stopPropagation(), { passive: false }));
      return debAlertEl;
    }
    function renderDebAlert() {
      const inv = (DEB && myId) ? DEB.miInvitacionPendiente(h.id, myId, clock()) : null;
      const dd = (DEB && myId) ? DEB.miDebate(h.id, myId) : null;
      const myTurn = dd && !DEB.juegoCompleto(dd) && DEB.turnActorId(dd, DEB.turnoActual(dd)) === myId;
      const juegoAbierto = debjEl && !debjEl.hidden;
      let mode = '', id = '', tema = '', who = '';
      if (inv) { mode = 'inv'; id = inv.id; tema = inv.tema; who = inv.hostNombre || 'Alguien'; }
      else if (dd && myTurn && !juegoAbierto) { mode = 'turn'; id = dd.id; tema = dd.tema; }
      // Solo reconstruye si cambia el contenido: reconstruir cada segundo destruía los
      // botones justo cuando se tocaban (parecía que "no hacían nada").
      const sig = [mode, id, tema, who].join('|');
      if (sig === _debAlertSig) return;
      _debAlertSig = sig;
      if (!mode) { if (debAlertEl) debAlertEl.hidden = true; return; }
      const el = ensureDebAlertEl(), t = debTema(tema);
      if (mode === 'inv') {
        el.innerHTML = `<span class="ic">🗣</span><span class="tx"><b>${esc(who)}</b> te reta a debatir<br><span class="sb">${esc(t ? t.nombre : tema)}</span></span><div class="bt"><button type="button" data-da="yes" data-id="${esc(id)}">Aceptar</button><button type="button" class="sec" data-da="no" data-id="${esc(id)}">Rechazar</button></div>`;
      } else {
        el.innerHTML = `<span class="ic">🗣</span><span class="tx"><b>Tu turno</b> en el debate<br><span class="sb">${esc(t ? t.nombre : tema)}</span></span><div class="bt"><button type="button" data-da="play">Argumentar →</button></div>`;
      }
      el.hidden = false;
      const y = el.querySelector('[data-da="yes"]'); if (y) y.onclick = () => { debAlertEl.hidden = true; _debAlertSig = ''; aceptarDebate(y.dataset.id); };
      const n = el.querySelector('[data-da="no"]'); if (n) n.onclick = () => { debAlertEl.hidden = true; _debAlertSig = ''; rechazarDebate(n.dataset.id); };
      const p = el.querySelector('[data-da="play"]'); if (p) p.onclick = () => { debAlertEl.hidden = true; _debAlertSig = ''; abrirDebateJuego(); };
    }

    // ── UI: overlay para INVITAR (elige invitado + tema con % + jardín) ──
    let debEl = null;
    function ensureDebEl() {
      if (debEl) return debEl;
      debEl = document.createElement('div');
      debEl.className = 'hacp-shop hacp-deb-ov'; debEl.hidden = true;
      overlayHost().appendChild(debEl);   // en móvil → body (si no, queda tras la sección activa e invisible)
      ['pointerdown', 'pointerup', 'wheel', 'click'].forEach(ev => debEl.addEventListener(ev, (e) => e.stopPropagation(), { passive: false }));
      debEl.addEventListener('click', (e) => { if (e.target === debEl) debEl.hidden = true; });
      return debEl;
    }
    let _debPick = { invitado: null, tema: null };
    let _pickJardin = null;   // {invM, tema, gardens[]} mientras eliges jardín en el mapa
    function abrirInvitarDebate() {
      if (!DEB) { toast('Los debates aún no están disponibles'); return; }
      if (!gardensFinca().length) { toast('Necesitas un Jardín de al menos 4 de área (1×4 / 2×2) para debatir'); return; }
      if (!gardensDisponibles().length) { toast('Todos los jardines tienen ya un debate en marcha'); return; }
      const cd = DEB.cooldownRestanteMs(h.id, myId, clock());
      if (cd > 0) { toast('Tu mecenas necesita reposar tras el último debate (' + fmtClock(Math.ceil(cd / 1000)) + ')'); return; }
      const otros = (h.miembros || []).filter(m => walkerIdOf(m) !== myId);
      if (!otros.length) { toast('No hay a quién invitar en esta hacienda'); return; }
      _debPick = { invitado: walkerIdOf(otros[0]), tema: DEB.TEMAS[0].id };
      renderInvitarDebate(otros);
      ensureDebEl().hidden = false;
    }
    function renderInvitarDebate(otros) {
      const el = ensureDebEl();
      const invM = otros.find(m => walkerIdOf(m) === _debPick.invitado) || otros[0];
      const invId = walkerIdOf(invM);
      const tSel = debTema(_debPick.tema) || DEB.TEMAS[0];
      const domSel = tSel.doms.map(d => DOM_GLYPH[d]).join('');
      const dcol = DOM_COL[tSel.doms[0]] || '#e6c877';
      const nMe = debNivel(myId, _debPick.tema), nOt = debNivel(invId, _debPick.tema), pMe = Math.round(debProb(nMe, nOt) * 100);
      const invChips = otros.length > 1
        ? `<div class="hacp-deb-field"><span class="hacp-deb-lbl">Rival</span><div class="hacp-deb-chips">${otros.map(m => `<button type="button" class="hacp-deb-chip${walkerIdOf(m) === _debPick.invitado ? ' on' : ''}" data-inv="${esc(walkerIdOf(m))}">${esc(m.nombre)}${esNpc(m) ? ' <i>NPC</i>' : ''}</button>`).join('')}</div></div>` : '';
      const temaTiles = DEB.TEMAS.map(t => {
        const p = Math.round(debProb(debNivel(myId, t.id), debNivel(invId, t.id)) * 100);
        return `<button type="button" class="hacp-deb-tema${t.id === _debPick.tema ? ' on' : ''}" data-tema="${esc(t.id)}" title="${esc(t.nombre)}"><span class="g">${t.doms.map(d => DOM_GLYPH[d]).join('')}</span><span class="n">${esc(t.nombre)}</span><span class="o">${p}%</span></button>`;
      }).join('');
      el.innerHTML = `<div class="hacp-shop-box hacp-deb-box">
        <button type="button" class="hacp-shop-x" data-act="x" aria-label="Cerrar">✕</button>
        <div class="hacp-deb-head"><span class="hacp-deb-seal">論</span><div><div class="hacp-deb-title">Convocar un debate</div><div class="hacp-deb-subt">5 min en un jardín · experiencia para ambos · prestigio al vencedor</div></div></div>
        <div class="hacp-deb-duel">
          <div class="hacp-deb-side"><div class="hacp-deb-glyph" style="--dc:${dcol}">${domSel}</div><div class="hacp-deb-nm">Tú</div><div class="hacp-deb-lv">nivel ${nMe}</div></div>
          <div class="hacp-deb-mid">對</div>
          <div class="hacp-deb-side"><div class="hacp-deb-glyph" style="--dc:${dcol}">${domSel}</div><div class="hacp-deb-nm">${esc(invM.nombre)}</div><div class="hacp-deb-lv">nivel ${nOt}</div></div>
        </div>
        ${invChips}
        <div class="hacp-deb-field"><span class="hacp-deb-lbl">Materia del debate</span><div class="hacp-deb-temas">${temaTiles}</div></div>
        <div class="hacp-deb-beam"><i class="me" style="width:${pMe}%"></i><i class="foe" style="width:${100 - pMe}%"></i></div>
        <div class="hacp-deb-beamlbl"><span>Tú ${pMe}%</span><span class="mut">${domSel} · ${nMe} vs ${nOt}</span><span>${esc(invM.nombre)} ${100 - pMe}%</span></div>
        <button type="button" class="hacp-deb-cta" data-act="pickjardin">Elegir jardín en el mapa →</button>
      </div>`;
      el.querySelector('[data-act="x"]').addEventListener('click', () => { el.hidden = true; });
      el.querySelectorAll('[data-inv]').forEach(b => b.addEventListener('click', () => { _debPick.invitado = b.dataset.inv; renderInvitarDebate(otros); }));
      el.querySelectorAll('[data-tema]').forEach(b => b.addEventListener('click', () => { _debPick.tema = b.dataset.tema; renderInvitarDebate(otros); }));
      el.querySelector('[data-act="pickjardin"]').addEventListener('click', () => iniciarPickJardin(invM));
    }
    // Modo ELEGIR JARDÍN en el mapa: resalta en amarillo los jardines libres; toca uno.
    function iniciarPickJardin(invM) {
      const disp = gardensDisponibles();
      if (!disp.length) { toast('Todos los jardines tienen ya un debate en marcha'); return; }
      if (debEl) debEl.hidden = true;
      _pickJardin = { invM, tema: _debPick.tema, gardens: disp };
      const cells = disp.reduce((a, g) => a.concat(g.cells), []);
      if (window.HacFolk && HacFolk.setHighlight) HacFolk.setHighlight(cells);
      // En MÓVIL, muestra el MAPA (si no, el resaltado queda oculto tras la sección abierta).
      if (mShell && mShell.go) mShell.go('hacienda'); else { deselect(); folkCollapse(true); }
      if (window.HacFolk && HacFolk.repaintOverlay) HacFolk.repaintOverlay();
      mostrarHintJardin(disp.length);
    }
    function cancelarPickJardin() {
      _pickJardin = null;
      if (window.HacFolk && HacFolk.setHighlight) HacFolk.setHighlight([]);
      const b = document.getElementById('hacp-deb-hint'); if (b) b.remove();
    }
    function mostrarHintJardin(n) {
      let b = document.getElementById('hacp-deb-hint');
      if (!b) { b = document.createElement('div'); b.id = 'hacp-deb-hint'; b.className = 'hacp-deb-hint'; vp.appendChild(b); }
      b.innerHTML = `🟡 Toca uno de los <b>${n}</b> jardines iluminados para el debate <button type="button" data-act="cancel-pick">Cancelar</button>`;
      b.querySelector('[data-act="cancel-pick"]').addEventListener('click', (e) => { e.stopPropagation(); cancelarPickJardin(); });
    }
    // Resuelve un tap del mapa en modo pick: ¿cae en un jardín iluminado? → crea el debate.
    function pickJardinTap(gx, gy) {
      if (!_pickJardin) return false;
      const key = gx + ',' + gy;
      const g = _pickJardin.gardens.find(gg => (gg.cells || []).some(c => c[0] === gx && c[1] === gy));
      const invM = _pickJardin.invM, tema = _pickJardin.tema;
      cancelarPickJardin();
      if (!g) { toast('Ese sitio no vale · elige un jardín iluminado'); return true; }
      DEB.crear({ haciendaId: h.id, hostId: myId, hostNombre: miNombreDeb(), invitadoId: walkerIdOf(invM), invitadoNombre: invM.nombre || '', tema, jardinCell: g.cell })
        .then(() => { toast(esNpc(invM) ? '🗣 Debate en ' + g.nombre + ' · ' + (invM.nombre || 'el NPC') + ' aceptará enseguida' : '🗣 Invitación enviada · espera a que ' + (invM.nombre || '') + ' acepte'); return DEB.reload().then(afterDebChange); })
        .catch(e => { toast((e && e.message) || 'No se pudo montar el debate'); });
      return true;
    }
    // Aceptar / rechazar una invitación que me han hecho.
    function aceptarDebate(id) { if (!DEB) return; DEB.aceptar(id, myId, clock()).then(() => { toast('🗣 ¡Al jardín a debatir!'); return DEB.reload().then(afterDebChange); }).catch(e => toast((e && e.message) || 'No se pudo aceptar')); }
    function rechazarDebate(id) { if (!DEB) return; const mia = DEB.byId(id); const soyHost = mia && mia.hostId === myId; DEB.rechazar(id, myId).then(() => { toast(soyHost ? '🗣 Invitación cancelada' : 'Invitación rechazada'); return DEB.reload().then(afterDebChange); }).catch(() => {}); }

    // ── Widget de SUSPENSE: barra que rebota izq↔der y se para en el ganador ──
    function mostrarRevelacionDebate(d, oc, mine) {
      const t = debTema(d.tema);
      const hostGana = oc.ganador === d.hostId;
      const el = document.createElement('div');
      el.className = 'hacp-shop hacp-deb-rev';
      overlayHost().appendChild(el);   // en móvil → body (visible sobre cualquier sección)
      const pH = Math.round(oc.pHost * 100), pI = 100 - pH;
      const domTxt = (t ? t.doms : []).map(dm => DOM_GLYPH[dm]).join('');
      el.innerHTML = `<div class="hacp-shop-box hacp-deb-revbox">
        <button type="button" class="hacp-shop-x" data-act="x" aria-label="Cerrar">✕</button>
        <div class="hacp-deb-revhead"><span class="hacp-deb-seal">論</span>Debate de ${esc(t ? t.nombre : d.tema)}</div>
        <div class="hacp-deb-arena" id="deb-arena">
          <div class="hacp-deb-banners">
            <div class="hacp-deb-banner a" id="deb-ban-a"><div class="g">${domTxt}</div><div class="nm">${esc(d.hostNombre || 'Anfitrión')}</div><div class="pc">nivel ${oc.nH} · ${pH}%</div></div>
            <div class="hacp-deb-banner b" id="deb-ban-b"><div class="g">${domTxt}</div><div class="nm">${esc(d.invitadoNombre || 'Invitado')}</div><div class="pc">nivel ${oc.nI} · ${pI}%</div></div>
          </div>
          <canvas class="hacp-deb-cord" width="380" height="38"></canvas>
        </div>
        <div class="hacp-deb-verdict" id="deb-verdict">Sopesando los argumentos…</div>
        <div class="hacp-deb-reward" id="deb-reward"></div>
        <button type="button" class="hacp-deb-cta" data-act="cerrar" style="display:none">Continuar</button>
      </div>`;
      // Cerrar el resultado cierra TAMBIÉN el mini-juego que quedaba detrás (si no, «Continuar»
      // parecía no hacer nada: el diálogo del debate seguía abierto por debajo).
      const closeReveal = () => { if (el.parentNode) el.remove(); if (typeof cerrarDebateJuego === 'function') cerrarDebateJuego(); };
      el.querySelector('[data-act="x"]').addEventListener('click', closeReveal);   // cerrable siempre, incluso durante la animación
      const arena = el.querySelector('#deb-arena'); arena.classList.add('shake');
      const cv = el.querySelector('.hacp-deb-cord'), g = cv.getContext('2d'), W = cv.width, H = cv.height, cy = H / 2;
      const zoneH = W * oc.pHost;                                  // zona del anfitrión (izq) ∝ odds
      const dest = hostGana ? zoneH * 0.5 : zoneH + (W - zoneH) * 0.5;
      const T = 3400; let start = null;
      const verdictEl = el.querySelector('#deb-verdict'), rewEl = el.querySelector('#deb-reward'), btn = el.querySelector('[data-act="cerrar"]');
      const reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
      function draw(px) {
        g.clearRect(0, 0, W, H);
        const bh = 8;
        g.fillStyle = 'rgba(232,192,96,0.32)'; g.fillRect(0, cy - bh / 2, zoneH, bh);            // viga lado A (oro)
        g.fillStyle = 'rgba(182,84,58,0.38)'; g.fillRect(zoneH, cy - bh / 2, W - zoneH, bh);     // viga lado B (rojo)
        g.fillStyle = 'rgba(236,224,196,0.7)'; g.fillRect(zoneH - 1, cy - 9, 2, 18);             // fiel ∝ odds
        g.save(); g.shadowColor = 'rgba(255,232,150,0.9)'; g.shadowBlur = 13;                    // token brillante
        const grd = g.createRadialGradient(px - 2, cy - 2, 1, px, cy, 8); grd.addColorStop(0, '#fff7db'); grd.addColorStop(0.5, '#f0cd72'); grd.addColorStop(1, '#b8862f');
        g.fillStyle = grd; g.beginPath(); g.arc(px, cy, 8, 0, 6.2832); g.fill(); g.restore();
        g.strokeStyle = 'rgba(58,40,16,0.6)'; g.lineWidth = 1; g.beginPath(); g.arc(px, cy, 8, 0, 6.2832); g.stroke();
      }
      function finish() {
        draw(dest); arena.classList.remove('shake');
        el.querySelector('#deb-ban-' + (hostGana ? 'a' : 'b')).classList.add('win');
        el.querySelector('#deb-ban-' + (hostGana ? 'b' : 'a')).classList.add('lose');
        const gan = hostGana ? d.hostNombre : d.invitadoNombre;
        verdictEl.innerHTML = `🏆 <b>${esc(gan || 'Vencedor')}</b> se lleva el debate`;
        verdictEl.classList.add('on');
        if (mine) {
          const dg = (mine.doms || []).map(dm => DOM_GLYPH[dm]).join('');
          const parts = [`+${mine.xp} XP ${dg}`];
          if (mine.won) parts.push('+prestigio');
          if (mine.libro) parts.push('📔 Conclusiones ' + ((DEB.CALIDADES[mine.libro] || {}).nombre || mine.libro));
          rewEl.innerHTML = (mine.won ? 'Ganas · ' : 'Te llevas · ') + parts.map(p => `<b>${esc(p)}</b>`).join(' · ');
        }
        btn.style.display = ''; btn.addEventListener('click', closeReveal);
        setTimeout(closeReveal, 11000);
      }
      if (reduced) { finish(); return; }
      function tick(ts) {
        if (start == null) start = ts;
        const e = Math.min(1, (ts - start) / T);
        const amp = (1 - e) * (W * 0.5), osc = Math.sin(e * 24) * amp * (1 - e);   // rebote amortiguado
        const px = dest * e + (W / 2) * (1 - e) + osc;
        draw(Math.max(9, Math.min(W - 9, px)));
        if (e < 1) requestAnimationFrame(tick); else finish();
      }
      requestAnimationFrame(tick);
    }

    // ── MINI-JUEGO argumental por turnos (piedra-papel-tijera de posturas) ──
    // Ventana en vivo: dos mecenas a izq/der, 5 rondas alternando quién pregunta. En tu
    // turno eliges 1 de 3 posturas (argumentos temáticos); si el turno activo no responde
    // en 60 s, la IA elige (determinista). Cada ronda mueve el tira y afloja (abajo).
    let debjEl = null, debjId = null, debjIv = null, debjAnimTimer = null, debjFrame = 0;
    let debjShownRound = -1, debjShownP = null, debjAnimating = false;   // para la animación de clash
    let _debjRenderSig = null;   // firma estructural: solo se reconstruye la ventana si cambia (si no, solo tic-tac)
    const skillDe = (pjId, tema) => debNivel(pjId, tema);
    const stanceOf = (id) => (DEB.STANCES || []).find(s => s.id === id) || { zh: '?', nombre: '?' };
    // Aptitud + aspecto del personaje (para dibujarlo con HacChar). NPC → color de la casa.
    function debateAspecto(pjId) {
      const m = (h.miembros || []).find(x => walkerIdOf(x) === pjId);
      const pj = (m && m.personajeId && window.HacPersonajes && HacPersonajes.get) ? HacPersonajes.get(m.personajeId) : null;
      const base = pj ? (pj.aspecto || {}) : { robe: (m && m.color) || color };
      return { aptitud: pj ? pj.aptitud : '', aspecto: (window.HacStats && HacStats.vestir) ? HacStats.vestir(pjId, base) : base };
    }
    function pintarRetrato(cv, pjId, dir, gesture, frame, scale) {
      if (!window.HacChar || !HacChar.draw) return;
      const a = debateAspecto(pjId);
      try { HacChar.draw(cv, { aptitud: a.aptitud, aspecto: a.aspecto, dir, pose: 'stand', gesture: gesture || null, frame: frame || 0, scale: scale || 3 }); } catch (e) {}
    }
    // Leyenda del piedra-papel-tijera: 攻 ▶ 守 ▶ 変 ▶ (攻). Cada postura vence a la siguiente.
    function rpsLegendHTML() {
      const S = DEB.STANCES;
      const chip = (s) => `<span class="rps-chip t-${s.id}"><b>${esc(s.zh)}</b> ${esc(s.nombre)}</span>`;
      // ordena en el ciclo de vencer: ofensiva→cautelosa→ingeniosa→(ofensiva)
      const order = ['ofensiva', 'cautelosa', 'ingeniosa'].map(id => S.find(s => s.id === id)).filter(Boolean);
      const first = order[0];
      return `<div class="hacp-rps"><span class="rps-t">¿Cómo se gana?</span>${order.map(chip).join('<span class="rps-arrow">▶</span>')}<span class="rps-arrow">▶</span><span class="rps-loop">${esc(first.zh)}</span></div>`;
    }
    // Reparte el gesto de cada retrato: el que tiene el turno ARGUMENTA (boca/brazo
    // en movimiento), el otro escucha. Repintado por un timer ligero (~3 fps).
    function paintPortraits() {
      if (!debjEl || debjEl.hidden || debjAnimating) return;
      const d = DEB && DEB.byId(debjId); if (!d) return;
      const completo = DEB.juegoCompleto(d);
      const actor = completo ? null : DEB.turnActorId(d, DEB.turnoActual(d));
      debjEl.querySelectorAll('.hacp-debj-portrait').forEach(cv => {
        const host = cv.dataset.pj === 'host', pjId = host ? d.hostId : d.invitadoId;
        const habla = !completo && pjId === actor;
        pintarRetrato(cv, pjId, host ? 'SE' : 'SW', habla ? 'habla' : null, habla ? debjFrame : 0);
      });
    }
    function ensureDebjEl() {
      if (debjEl) return debjEl;
      debjEl = document.createElement('div');
      debjEl.className = 'hacp-shop hacp-debj'; debjEl.hidden = true;
      overlayHost().appendChild(debjEl);   // en móvil → body (visible sobre cualquier sección)
      ['pointerdown', 'pointerup', 'wheel', 'click'].forEach(ev => debjEl.addEventListener(ev, (e) => e.stopPropagation(), { passive: false }));
      return debjEl;
    }
    function abrirDebateJuego() {
      const d = DEB && DEB.miDebate(h.id, myId);
      if (!d) { toast('No tienes un debate en curso'); return; }
      debjId = d.id; debjAnimating = false; _debjRenderSig = null;   // fuerza el primer render completo
      // No re-animar rondas ya resueltas al abrir: arranca "al día".
      const t0 = DEB.tug(d, debProb(debNivel(d.hostId, d.tema), debNivel(d.invitadoId, d.tema)));
      debjShownRound = t0.rondas.length; debjShownP = t0.p;
      ensureDebjEl().hidden = false;
      renderDebateJuego();
      if (debjIv) clearInterval(debjIv);
      debjIv = setInterval(tickDebateJuego, 1000);
      if (debjAnimTimer) clearInterval(debjAnimTimer);
      debjAnimTimer = setInterval(() => { debjFrame++; paintPortraits(); }, 340);   // boca/brazo del que argumenta
      if (DEB.reload) DEB.reload().then(() => { syncDebateFolk(); renderDebateJuego(); });
    }
    function cerrarDebateJuego() { if (debjEl) debjEl.hidden = true; if (debjIv) { clearInterval(debjIv); debjIv = null; } if (debjAnimTimer) { clearInterval(debjAnimTimer); debjAnimTimer = null; } debjId = null; }
    let _debjReloadCd = 0;
    function tickDebateJuego() {
      if (!debjId || !DEB || debjAnimating) return;   // en pausa mientras corre el clash
      _debjReloadCd -= 1;
      if (_debjReloadCd <= 0) { _debjReloadCd = 2; DEB.reload().then(() => { syncDebateFolk(); renderDebateJuego(); }); }   // liveness (~2 s)
      const d = DEB.byId(debjId);
      if (!d || d.estado !== 'en_curso') { cerrarDebateJuego(); return; }
      if (DEB.juegoCompleto(d)) { renderDebateJuego(); return; }
      // Auto-elección de IA si el turno activo agotó sus 60 s (lo dispara cualquier cliente presente).
      const i = DEB.turnoActual(d);
      if (clock() > DEB.turnoDeadline(d)) {
        const actor = DEB.turnActorId(d, i);
        DEB.jugar(d.id, i, DEB.iaStance(d, i, skillDe(actor, d.tema))).then(() => DEB.reload().then(() => { syncDebateFolk(); renderDebateJuego(); })).catch(() => {});
      } else renderDebateJuego();
    }
    function elegirArgumento(stance) {
      const d = DEB && DEB.byId(debjId); if (!d || d.estado !== 'en_curso') return;
      const i = DEB.turnoActual(d);
      if (DEB.turnActorId(d, i) !== myId) return;   // no es mi turno
      DEB.jugar(d.id, i, stance).then(() => DEB.reload().then(() => { syncDebateFolk(); renderDebateJuego(); })).catch(e => toast((e && e.message) || 'No se pudo argumentar'));
    }
    function renderDebateJuego() {
      const el = ensureDebjEl(); if (el.hidden || debjAnimating) return;
      const d = DEB && DEB.byId(debjId); if (!d) return;
      const t = debTema(d.tema), doms = (t ? t.doms : []).map(dm => DOM_GLYPH[dm]).join('');
      const p0 = debProb(debNivel(d.hostId, d.tema), debNivel(d.invitadoId, d.tema));
      const { p, rondas } = DEB.tug(d, p0);
      // Si acaba de cerrarse una ronda nueva, la balanza arranca en su valor ANTERIOR y el
      // clash la desliza al nuevo (para que se vea moverse). Si no, se muestra directa.
      const newlyDone = rondas.length > debjShownRound;
      const pH = Math.round(((newlyDone && debjShownP != null) ? debjShownP : p) * 100);
      const i = DEB.turnoActual(d), completo = DEB.juegoCompleto(d);
      const info = completo ? null : DEB.turnInfo(i);
      const miTurno = !completo && DEB.turnActorId(d, i) === myId;
      const round = completo ? DEB.ROUNDS : (info.round + 1);
      // Si NADA estructural cambió (mismo turno/jugadas), NO reconstruyas: solo actualiza la
      // cuenta atrás. Reconstruir cada segundo destruía los botones de postura al pulsarlos.
      const structSig = [DEB.jugCount(d), completo ? 1 : 0, miTurno ? 1 : 0, i, rondas.length, d.estado].join('|');
      if (!newlyDone && structSig === _debjRenderSig) {
        const cdEl = el.querySelector('.hacp-deb-countdown');
        if (cdEl && !completo) cdEl.textContent = Math.max(0, Math.ceil((DEB.turnoDeadline(d) - clock()) / 1000)) + 's';
        return;
      }
      _debjRenderSig = structSig;
      // Bocadillos: SOLO la última ronda YA CERRADA (ambas jugadas), que se revela en el
      // choque. La ronda en curso queda OCULTA: ambos eligen A CIEGAS (leer la frase del
      // rival = conocer su postura, y el piedra-papel-tijera perdería todo el sentido).
      const j = d.jugadas || [], shownR = Math.floor(j.length / 2) - 1;
      let hostTxt = '', invTxt = '';
      if (shownR >= 0) {
        const aH0 = (shownR % 2 === 0);                       // ¿abrió la ronda el host?
        const hI = aH0 ? shownR * 2 : shownR * 2 + 1, iI = aH0 ? shownR * 2 + 1 : shownR * 2;
        hostTxt = DEB.frase(d.tema, aH0 ? 'ask' : 'resp', j[hI].s, hI, d.id);
        invTxt = DEB.frase(d.tema, aH0 ? 'resp' : 'ask', j[iI].s, iI, d.id);
      }
      // prompt del turno
      let prompt, choices = '';
      if (completo) { prompt = 'Argumentos agotados · el veredicto llegará al terminar el debate'; }
      else {
        const actorId = DEB.turnActorId(d, i);
        const rem = Math.max(0, Math.ceil((DEB.turnoDeadline(d) - clock()) / 1000));
        if (miTurno) {
          prompt = `Tu turno · elige tu argumento <span style="opacity:.55">· a ciegas</span> <span class="hacp-deb-countdown">${rem}s</span>`;
          choices = '<div class="hacp-debj-choices">' + DEB.STANCES.map(s => `<button type="button" class="hacp-debj-arg t-${s.id}" data-st="${s.id}"><span class="zh">${s.zh}</span><span class="nb">${esc(s.nombre)}</span><span class="beat">vence a <b>${esc(stanceOf(s.vence).zh)}</b></span><span class="ph">${esc(DEB.frase(d.tema, info.rol, s.id, i, d.id))}</span></button>`).join('') + '</div>';
        } else {
          const nm = actorId === d.hostId ? d.hostNombre : d.invitadoNombre;
          prompt = `Argumento planteado en secreto · espera a <b>${esc(nm || 'tu rival')}</b> <span class="hacp-deb-countdown">${rem}s</span>`;
        }
      }
      // resultado de la ronda recién cerrada (flash)
      const lastDone = rondas.length ? rondas[rondas.length - 1] : null;
      const flash = (lastDone && lastDone.lado !== 'tie') ? `<div class="hacp-debj-flash">Ronda ${lastDone.r + 1}: ventaja para <b>${esc(lastDone.lado === 'host' ? d.hostNombre : d.invitadoNombre)}</b></div>` : (lastDone ? `<div class="hacp-debj-flash">Ronda ${lastDone.r + 1}: empate</div>` : '');
      el.innerHTML = `<div class="hacp-shop-box hacp-debj-box">
        <button type="button" class="hacp-shop-x" data-act="x" aria-label="Cerrar">✕</button>
        <div class="hacp-debj-head"><span class="hacp-deb-seal">論</span>Debate de ${esc(t ? t.nombre : d.tema)}<span class="hacp-debj-round">Ronda ${round}/${DEB.ROUNDS}</span></div>
        <div class="hacp-debj-arena" data-focus="${completo ? 'both' : (DEB.turnActorId(d, i) === d.hostId ? 'host' : 'inv')}">
          <div class="hacp-debj-fighter a${!completo && DEB.turnActorId(d, i) === d.hostId ? ' on' : ''}"><canvas class="hacp-debj-portrait" data-pj="host"></canvas><div class="nm">${esc(d.hostNombre || 'Anfitrión')}</div></div>
          <div class="hacp-debj-center">
            ${shownR >= 0
              ? `<div class="hacp-debj-bubble a">${esc(hostTxt)}</div><div class="hacp-debj-bubble b">${esc(invTxt)}</div>`
              : `<div class="hacp-debj-bubble a ghost">El debate comienza… cada uno arguye a ciegas.</div>`}
          </div>
          <div class="hacp-debj-fighter b${!completo && DEB.turnActorId(d, i) === d.invitadoId ? ' on' : ''}"><canvas class="hacp-debj-portrait" data-pj="inv"></canvas><div class="nm">${esc(d.invitadoNombre || 'Invitado')}</div></div>
        </div>
        ${flash}
        <div class="hacp-debj-turn">${prompt}</div>
        ${!completo ? rpsLegendHTML() : ''}
        ${choices}
        <div class="hacp-deb-beam"><i class="me" style="width:${pH}%"></i><i class="foe" style="width:${100 - pH}%"></i></div>
        <div class="hacp-deb-beamlbl"><span>${esc(d.hostNombre || 'Anfitrión')} ${pH}%</span><span class="mut">tira y afloja</span><span>${esc(d.invitadoNombre || 'Invitado')} ${100 - pH}%</span></div>
      </div>`;
      el.querySelector('[data-act="x"]').addEventListener('click', cerrarDebateJuego);
      el.querySelectorAll('[data-st]').forEach(b => b.addEventListener('click', () => elegirArgumento(b.dataset.st)));
      // Los personajes REALES (mecenas) mirándose de frente; el del turno argumenta.
      paintPortraits();
      // Se cerró una ronda nueva → CLASH animado + la balanza se desliza al nuevo valor.
      if (newlyDone) {
        const round = rondas[rondas.length - 1], oldP = (debjShownP != null) ? debjShownP : p;
        debjShownRound = rondas.length; debjShownP = p;
        playClashDebate(d, round, oldP, p);
      }
    }
    // CHOQUE DE IDEAS de una ronda: las CARAS entran en primer plano con su postura, chocan
    // (sacudida + destello), y se revela quién vence a quién (RPS) y cómo se mueve la balanza.
    // Fases lentas y con énfasis: entrada → impacto → veredicto → respiro.
    function playClashDebate(d, round, oldP, newP) {
      const box = debjEl && debjEl.querySelector('.hacp-debj-box'); if (!box) return;
      debjAnimating = true;
      const aH = round.r % 2 === 0;                       // ¿abrió la ronda el host?
      const hostStance = aH ? round.ask : round.resp, invStance = aH ? round.resp : round.ask;
      const hs = stanceOf(hostStance), is = stanceOf(invStance), tie = round.lado === 'tie';
      const winName = round.lado === 'host' ? (d.hostNombre || 'Anfitrión') : (d.invitadoNombre || 'Invitado');
      const winStance = round.lado === 'host' ? hs : is, loseStance = round.lado === 'host' ? is : hs;
      const verdict = tie
        ? `<span class="tie">Tablas · <b>${esc(hs.zh)}</b> y <b>${esc(is.zh)}</b> se anulan · la balanza no se mueve</span>`
        : `<b class="w">${esc(winStance.zh)} ${esc(winStance.nombre)}</b> <span class="beats">vence a</span> <span class="l">${esc(loseStance.zh)} ${esc(loseStance.nombre)}</span><br><span class="adv">ventaja para <b>${esc(winName)}</b></span>`;
      const cl = document.createElement('div'); cl.className = 'hacp-debj-clash';
      cl.innerHTML = `
        <div class="cl-round">Ronda ${round.r + 1} de ${DEB.ROUNDS}</div>
        <div class="cl-stage" id="cl-stage">
          <div class="cl-med a t-${hostStance}" id="cl-a"><div class="cl-face"><canvas data-clpj="host"></canvas></div><div class="cl-badge">${esc(hs.zh)}</div><div class="cl-nm">${esc(d.hostNombre || 'Anfitrión')}</div><div class="cl-st">${esc(hs.nombre)}</div></div>
          <div class="cl-vs"><span class="cl-spark">⚔</span></div>
          <div class="cl-med b t-${invStance}" id="cl-b"><div class="cl-face"><canvas data-clpj="inv"></canvas></div><div class="cl-badge">${esc(is.zh)}</div><div class="cl-nm">${esc(d.invitadoNombre || 'Invitado')}</div><div class="cl-st">${esc(is.nombre)}</div></div>
        </div>
        <div class="cl-verdict">${verdict}</div>`;
      box.appendChild(cl);
      // Caras en primer plano (zoom) adoptando su postura elegida.
      const fa = cl.querySelector('[data-clpj="host"]'), fb = cl.querySelector('[data-clpj="inv"]');
      if (fa) pintarRetrato(fa, d.hostId, 'SE', hostStance, 0, 5);
      if (fb) pintarRetrato(fb, d.invitadoId, 'SW', invStance, 0, 5);
      const A = cl.querySelector('#cl-a'), B = cl.querySelector('#cl-b'), stage = cl.querySelector('#cl-stage');
      const T_IMPACT = 950, T_REVEAL = 1550, T_END = 3900;
      setTimeout(() => { stage.classList.add('clash'); }, T_IMPACT);   // impacto: sacudida + destello + chispa
      setTimeout(() => {                                                // veredicto: gana uno, el otro se frustra
        if (round.lado === 'host') { A.classList.add('win'); B.classList.add('lose'); if (fb) pintarRetrato(fb, d.invitadoId, 'SW', 'frustrado', 0, 5); }
        else if (round.lado === 'inv') { B.classList.add('win'); A.classList.add('lose'); if (fa) pintarRetrato(fa, d.hostId, 'SE', 'frustrado', 0, 5); }
        cl.classList.add('resolved');
        const me = debjEl.querySelector('.hacp-deb-beam .me'), foe = debjEl.querySelector('.hacp-deb-beam .foe');
        const np = Math.round(newP * 100);
        if (me) me.style.width = np + '%'; if (foe) foe.style.width = (100 - np) + '%';
        const lbl = debjEl.querySelectorAll('.hacp-deb-beamlbl span');
        if (lbl[0]) lbl[0].textContent = (d.hostNombre || 'Anfitrión') + ' ' + np + '%';
        if (lbl[2]) lbl[2].textContent = (d.invitadoNombre || 'Invitado') + ' ' + (100 - np) + '%';
      }, T_REVEAL);
      setTimeout(() => { if (cl.parentNode) cl.remove(); debjAnimating = false; renderDebateJuego(); }, T_END);
    }

    function debStyleOnce() {
      if (document.getElementById('hacp-deb-style')) return;
      const s = document.createElement('style'); s.id = 'hacp-deb-style';
      s.textContent = `
        .hacp-deb-box,.hacp-deb-revbox{max-width:460px;background:linear-gradient(165deg,#2c1f13,#18100a);border:1px solid #6a4a24;box-shadow:0 18px 50px rgba(0,0,0,.55),inset 0 0 0 1px rgba(216,180,90,.16);border-radius:14px;padding:18px 20px;color:#ece0c4;font-family:system-ui,sans-serif}
        .hacp-deb-head{display:flex;align-items:center;gap:12px;margin-bottom:10px}
        .hacp-deb-seal{flex:0 0 auto;width:40px;height:40px;border-radius:9px;display:grid;place-items:center;font:700 22px 'Noto Serif SC',serif;color:#fbeecf;background:radial-gradient(circle at 35% 30%,#b83a26,#7a2417);box-shadow:inset 0 0 0 1px rgba(255,220,150,.35),0 2px 6px rgba(0,0,0,.4)}
        .hacp-deb-title{font:800 19px/1.1 'Noto Serif SC',serif;color:#f3e6c4}
        .hacp-deb-subt{font-size:12px;color:#b39a72;margin-top:3px}
        .hacp-deb-duel{display:flex;align-items:stretch;gap:8px;margin:4px 0 8px}
        .hacp-deb-side{flex:1;text-align:center;background:rgba(0,0,0,.22);border:1px solid rgba(216,180,90,.16);border-radius:11px;padding:9px 6px}
        .hacp-deb-glyph{font:700 30px 'Noto Serif SC',serif;color:var(--dc,#e6c877);line-height:1}
        .hacp-deb-nm{font-weight:700;margin-top:5px;font-size:14px;color:#efe2c2}
        .hacp-deb-lv{font-size:12px;color:#b39a72}
        .hacp-deb-mid{align-self:center;font:700 19px 'Noto Serif SC',serif;color:#8a6a3a}
        .hacp-deb-field{margin:11px 0}
        .hacp-deb-lbl{display:block;font:700 11px/1 system-ui;letter-spacing:.08em;text-transform:uppercase;color:#a8863c;margin-bottom:6px}
        .hacp-deb-chips{display:flex;flex-wrap:wrap;gap:6px}
        .hacp-deb-chip{background:#241a12;color:#d8c8a4;border:1px solid #5a4020;border-radius:999px;padding:5px 12px;font:inherit;font-size:13px;cursor:pointer}
        .hacp-deb-chip.on{background:linear-gradient(#8a5420,#6e3f16);border-color:#d8b45a;color:#fff}
        .hacp-deb-chip i{opacity:.5;font-style:normal;font-size:11px}
        .hacp-deb-temas{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
        .hacp-deb-tema{background:#211710;border:1px solid #4e3819;border-radius:10px;padding:9px 4px 7px;font:inherit;cursor:pointer;text-align:center;color:#d8c8a4;display:flex;flex-direction:column;align-items:center;gap:2px;transition:border-color .12s,background .12s}
        .hacp-deb-tema:hover{border-color:#8a6a3a}
        .hacp-deb-tema.on{background:linear-gradient(165deg,#3a2913,#241708);border-color:#d8b45a;box-shadow:inset 0 0 0 1px rgba(216,180,90,.3)}
        .hacp-deb-tema .g{font:700 20px 'Noto Serif SC',serif;color:#e6c877;line-height:1}
        .hacp-deb-tema .n{font-size:12.5px;font-weight:700;color:#efe2c2}
        .hacp-deb-tema .o{font-size:11px;color:#9cc47a}
        .hacp-deb-beam{display:flex;height:10px;border-radius:6px;overflow:hidden;margin:12px 0 5px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.45)}
        .hacp-deb-beam i.me{background:linear-gradient(#e8c064,#c9973a)}
        .hacp-deb-beam i.foe{background:linear-gradient(#b6543a,#8a3420)}
        .hacp-deb-beamlbl{display:flex;justify-content:space-between;font-size:12px;color:#d8c8a4}
        .hacp-deb-beamlbl .mut{color:#9a8360}
        .hacp-deb-cta{width:100%;margin-top:14px;padding:12px;border:0;border-radius:10px;cursor:pointer;font:800 15px 'Noto Serif SC',serif;color:#2a1a08;background:linear-gradient(#f0cd72,#d8a83f);box-shadow:0 3px 0 #9c7320,inset 0 1px 0 rgba(255,255,255,.4)}
        .hacp-deb-cta:active{transform:translateY(2px);box-shadow:0 1px 0 #9c7320}
        .hacp-deb-rev{display:flex;align-items:center;justify-content:center}
        .hacp-deb-revbox{text-align:center}
        .hacp-deb-revhead{font:800 18px 'Noto Serif SC',serif;color:#f3e6c4;margin-bottom:12px}
        .hacp-deb-revhead .hacp-deb-seal{display:inline-grid;width:30px;height:30px;font-size:16px;vertical-align:middle;margin-right:6px}
        .hacp-deb-arena{margin:2px 0 8px}
        .hacp-deb-banners{display:flex;justify-content:space-between;gap:12px;margin-bottom:9px}
        .hacp-deb-banner{flex:1;position:relative;background:rgba(0,0,0,.24);border:1px solid rgba(216,180,90,.18);border-radius:11px;padding:10px 6px;transition:box-shadow .35s,transform .35s,opacity .35s}
        .hacp-deb-banner .g{font:700 26px 'Noto Serif SC',serif;line-height:1}
        .hacp-deb-banner.a .g{color:#e8c064}.hacp-deb-banner.b .g{color:#d98a6e}
        .hacp-deb-banner .nm{font-weight:700;font-size:14px;margin-top:3px;color:#efe2c2}
        .hacp-deb-banner .pc{font-size:12px;color:#b39a72}
        .hacp-deb-banner.win{box-shadow:0 0 0 1px #d8b45a,0 0 24px rgba(232,192,96,.55);transform:translateY(-2px)}
        .hacp-deb-banner.lose{opacity:.45}
        .hacp-deb-banner.win::after{content:'勝';position:absolute;top:-12px;right:-8px;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font:700 15px 'Noto Serif SC',serif;color:#fbeecf;background:radial-gradient(circle at 35% 30%,#c0392a,#7a1f13);box-shadow:inset 0 0 0 1px rgba(255,220,150,.5),0 2px 6px rgba(0,0,0,.5);transform:rotate(-11deg) scale(0);animation:hacp-seal .45s .05s cubic-bezier(.2,1.6,.4,1) forwards}
        @keyframes hacp-seal{to{transform:rotate(-11deg) scale(1)}}
        .hacp-deb-cord{width:100%;height:38px;display:block}
        .hacp-deb-arena.shake{animation:hacp-shk .45s linear infinite}
        @keyframes hacp-shk{0%,100%{transform:translateX(0)}25%{transform:translateX(-2px)}75%{transform:translateX(2px)}}
        .hacp-deb-verdict{min-height:24px;font:800 17px 'Noto Serif SC',serif;color:#f3e6c4;opacity:.35;transition:opacity .35s}
        .hacp-deb-verdict.on{opacity:1}
        .hacp-deb-reward{margin-top:7px;font-size:13px;color:#cbb488;min-height:16px}
        .hacp-deb-reward b{color:#e8c877}
        .hacp-deb-invite{background:linear-gradient(#2c1f13,#20160c);border:1px solid #7a4a1c;border-radius:10px;padding:10px 12px;margin-top:6px;box-shadow:inset 0 0 0 1px rgba(216,180,90,.12)}
        /* La sección de debate SIEMPRE se apila (nunca fila): el botón no se sale del panel. */
        .hacp-cp-mis.hacp-deb-invite{display:block}
        .hacp-cp-mis-on.hacp-deb-invite .hacp-cp-btn{margin-left:0}
        .hacp-deb-invite .hacp-cp-flag{display:block;margin:2px 0}
        .hacp-deb-invite .r{display:flex;gap:6px;margin-top:8px}
        .hacp-deb-invite .r .hacp-cp-btn{flex:1;white-space:nowrap}
        .hacp-deb-hint{position:absolute;left:50%;top:12px;transform:translateX(-50%);z-index:6;background:linear-gradient(#2c1f13,#1a1109);color:#f3e6c4;border:1px solid #d8b45a;border-radius:11px;padding:10px 14px;font:600 14px/1.3 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.5),inset 0 0 0 1px rgba(216,180,90,.2);display:flex;align-items:center;gap:12px;max-width:92%}
        .hacp-deb-hint b{color:#e8c877}
        .hacp-deb-alert{position:absolute;left:50%;top:10px;transform:translateX(-50%);z-index:20;display:flex;align-items:center;gap:10px;max-width:94%;background:linear-gradient(#2c1f13,#1a1109);color:#f3e6c4;border:1px solid #d8b45a;border-radius:12px;padding:9px 12px;box-shadow:0 10px 30px rgba(0,0,0,.55),inset 0 0 0 1px rgba(216,180,90,.2);font:600 13px/1.25 system-ui,sans-serif;animation:hacp-alert-pulse 1.25s ease-in-out infinite}
        .hacp-deb-alert .ic{font-size:20px;flex:0 0 auto}
        .hacp-deb-alert .tx{flex:1 1 auto}
        .hacp-deb-alert .tx b{color:#e8c877}
        .hacp-deb-alert .sb{opacity:.7;font-size:12px}
        .hacp-deb-alert .bt{display:flex;gap:6px;flex:0 0 auto}
        .hacp-deb-alert .bt button{background:linear-gradient(#f0cd72,#d8a83f);color:#2a1a08;border:0;border-radius:8px;padding:7px 11px;font:800 13px system-ui,sans-serif;cursor:pointer;white-space:nowrap;box-shadow:0 2px 0 #9c7320}
        .hacp-deb-alert .bt button:active{transform:translateY(1px);box-shadow:0 1px 0 #9c7320}
        .hacp-deb-alert .bt button.sec{background:#3a2a18;color:#e8d8b4;box-shadow:none;border:1px solid #6a4a24}
        @keyframes hacp-alert-pulse{0%,100%{box-shadow:0 10px 30px rgba(0,0,0,.55),inset 0 0 0 1px rgba(216,180,90,.2),0 0 0 0 rgba(232,192,96,0)}50%{box-shadow:0 10px 30px rgba(0,0,0,.55),inset 0 0 0 1px rgba(216,180,90,.5),0 0 22px 3px rgba(232,192,96,.35)}}
        .hacp-deb-alert[hidden]{display:none}
        @media(prefers-reduced-motion:reduce){.hacp-deb-alert{animation:none}}
        @media(max-width:640px){.hacp-deb-alert{flex-wrap:wrap;justify-content:center;text-align:center;max-width:92%}.hacp-deb-alert .bt{flex:0 0 100%;justify-content:center;margin-top:4px}}
        .hacp-deb-hint button{background:linear-gradient(#8a5420,#6e3f16);color:#fbeecf;border:1px solid #d8b45a;border-radius:8px;padding:6px 11px;font:inherit;cursor:pointer}
        .hacp-deb-countdown{font-variant-numeric:tabular-nums;color:#e8c877;font-weight:700}
        .hacp-debj{display:flex;align-items:center;justify-content:center}
        .hacp-debj-box{max-width:520px;background:linear-gradient(165deg,#2c1f13,#18100a);border:1px solid #6a4a24;box-shadow:0 18px 50px rgba(0,0,0,.55),inset 0 0 0 1px rgba(216,180,90,.16);border-radius:14px;padding:16px 18px;color:#ece0c4}
        .hacp-debj-head{font:800 17px 'Noto Serif SC',serif;color:#f3e6c4;display:flex;align-items:center;gap:8px;margin-bottom:10px}
        .hacp-debj-head .hacp-deb-seal{width:30px;height:30px;font-size:16px}
        .hacp-debj-round{margin-left:auto;font:700 12px system-ui;color:#a8863c;letter-spacing:.04em}
        .hacp-debj-arena{display:flex;align-items:center;gap:8px}
        .hacp-debj-fighter{flex:0 0 84px;text-align:center;background:rgba(0,0,0,.24);border:1px solid rgba(216,180,90,.16);border-radius:11px;padding:9px 4px;transition:box-shadow .2s,transform .2s}
        .hacp-debj-fighter.on{box-shadow:0 0 0 1px #d8b45a,0 0 16px rgba(232,192,96,.4);transform:translateY(-2px)}
        .hacp-debj-fighter .g{font:700 26px 'Noto Serif SC',serif;color:#e8c064;line-height:1}
        .hacp-debj-fighter.b .g{color:#d98a6e}
        .hacp-debj-fighter .nm{font-weight:700;font-size:13px;margin-top:3px;color:#efe2c2}
        .hacp-debj-portrait{display:block;height:66px;width:auto;margin:0 auto;image-rendering:pixelated}
        .hacp-debj-center{flex:1;display:flex;flex-direction:column;gap:6px;min-height:78px;justify-content:center}
        .hacp-debj-bubble{position:relative;border-radius:10px;padding:7px 11px;font-size:13px;line-height:1.3;max-width:90%}
        .hacp-debj-bubble.a{align-self:flex-start;background:rgba(232,192,96,.14);border:1px solid rgba(232,192,96,.4);color:#f0e2bf}
        .hacp-debj-bubble.b{align-self:flex-end;background:rgba(182,84,58,.16);border:1px solid rgba(200,110,80,.45);color:#f0d9cf}
        .hacp-debj-bubble.ghost{opacity:.35;font-style:italic}
        .hacp-debj-flash{text-align:center;font:700 13px system-ui;color:#e8c877;margin:8px 0 2px}
        .hacp-debj-turn{text-align:center;font-size:14px;color:#e6dcc0;margin:8px 0}
        .hacp-debj-turn b{color:#f0e2bf}
        .hacp-debj-choices{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:6px 0 4px}
        .hacp-debj-arg{background:#211710;border:1px solid #4e3819;border-radius:11px;padding:10px 8px;cursor:pointer;color:#e6dcc0;text-align:center;display:flex;flex-direction:column;align-items:center;gap:4px;transition:border-color .12s,transform .08s,background .12s}
        .hacp-debj-arg:hover{border-color:#d8b45a;background:#2c1f10}
        .hacp-debj-arg:active{transform:translateY(1px)}
        .hacp-debj-arg .zh{font:700 22px 'Noto Serif SC',serif;line-height:1}
        .hacp-debj-arg.t-ofensiva .zh{color:#e0715a}.hacp-debj-arg.t-cautelosa .zh{color:#8ac06a}.hacp-debj-arg.t-ingeniosa .zh{color:#5aa6e6}
        .hacp-debj-arg .nb{font:700 12px system-ui;color:#efe2c2}
        .hacp-debj-arg .beat{font-size:10px;color:#9a8360}.hacp-debj-arg .beat b{font:700 12px 'Noto Serif SC',serif;color:#d8c8a4}
        .hacp-debj-arg .ph{font-size:11px;line-height:1.25;color:#b39a72}
        .hacp-debj-beamlbl{display:flex;justify-content:space-between;font-size:12px;color:#d8c8a4;margin-top:4px}
        .hacp-debj-beamlbl .mut{color:#9a8360}
        .hacp-deb-beam i{transition:width .9s cubic-bezier(.25,1,.4,1)}
        /* Leyenda del piedra-papel-tijera (siempre visible durante el debate). */
        .hacp-rps{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:5px;margin:2px 0 8px;font-size:11px;color:#b39a72}
        .hacp-rps .rps-t{color:#8a6a3a;margin-right:3px}
        .hacp-rps .rps-chip{display:inline-flex;align-items:center;gap:4px;background:rgba(0,0,0,.28);border:1px solid rgba(216,180,90,.18);border-radius:999px;padding:2px 9px;color:#d8c8a4}
        .hacp-rps .rps-chip b{font:700 14px 'Noto Serif SC',serif}
        .hacp-rps .rps-chip.t-ofensiva b{color:#e0715a}.hacp-rps .rps-chip.t-cautelosa b{color:#8ac06a}.hacp-rps .rps-chip.t-ingeniosa b{color:#5aa6e6}
        .hacp-rps .rps-arrow{color:#8a6a3a;font-size:9px}
        .hacp-rps .rps-loop{font:700 14px 'Noto Serif SC',serif;color:#e0715a;opacity:.55}
        /* ── CHOQUE DE IDEAS: caras en primer plano, impacto y veredicto (cinemático) ── */
        .hacp-debj-clash{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;border-radius:14px;z-index:5;overflow:hidden;background:radial-gradient(circle at 50% 42%,rgba(30,20,11,.94),rgba(12,8,4,.985))}
        .cl-round{font:700 12px system-ui;letter-spacing:.12em;text-transform:uppercase;color:#a8863c}
        .cl-stage{display:flex;align-items:center;justify-content:center;gap:14px;position:relative}
        .cl-stage.clash{animation:cl-shk .45s}
        @keyframes cl-shk{0%,100%{transform:translateX(0)}18%{transform:translateX(-7px)}38%{transform:translateX(7px)}58%{transform:translateX(-4px)}78%{transform:translateX(3px)}}
        .cl-stage.clash::after{content:'';position:absolute;inset:-40px;background:radial-gradient(circle,rgba(255,240,200,.55),transparent 62%);animation:cl-flash .5s ease-out;pointer-events:none}
        @keyframes cl-flash{0%{opacity:0}28%{opacity:1}100%{opacity:0}}
        .cl-med{display:flex;flex-direction:column;align-items:center;gap:3px;transition:transform .45s cubic-bezier(.2,1.3,.4,1),opacity .4s,filter .4s}
        .cl-med.a{animation:cl-in-l .55s cubic-bezier(.2,1.35,.4,1) both}
        .cl-med.b{animation:cl-in-r .55s cubic-bezier(.2,1.35,.4,1) both}
        @keyframes cl-in-l{from{opacity:0;transform:translateX(-80px) scale(.55)}to{opacity:1;transform:translateX(0) scale(1)}}
        @keyframes cl-in-r{from{opacity:0;transform:translateX(80px) scale(.55)}to{opacity:1;transform:translateX(0) scale(1)}}
        .cl-face{width:100px;height:100px;border-radius:50%;overflow:hidden;position:relative;margin:0 auto;border:3px solid #6a4a24;background:radial-gradient(circle at 50% 32%,#3a2a18,#150d07);box-shadow:inset 0 0 14px rgba(0,0,0,.65)}
        .cl-face canvas{position:absolute;left:50%;top:-10px;transform:translateX(-50%);height:168px;width:auto;image-rendering:pixelated}
        .cl-badge{font:700 22px 'Noto Serif SC',serif;line-height:1;margin-top:2px}
        .cl-med.t-ofensiva .cl-badge{color:#e0715a}.cl-med.t-cautelosa .cl-badge{color:#8ac06a}.cl-med.t-ingeniosa .cl-badge{color:#5aa6e6}
        .cl-nm{font-weight:700;font-size:13px;color:#efe2c2}
        .cl-st{font-size:11px;color:#b39a72}
        .cl-med.win{transform:scale(1.18);filter:drop-shadow(0 0 18px rgba(232,192,96,.85));z-index:2}
        .cl-med.win .cl-face{border-color:#e8c064}
        .cl-med.lose{transform:scale(.8);opacity:.42;animation:cl-shake .45s}
        @keyframes cl-shake{0%,100%{transform:scale(.8) translateX(0)}25%{transform:scale(.8) translateX(-6px)}75%{transform:scale(.8) translateX(6px)}}
        .cl-vs{position:relative;width:34px;text-align:center;flex:0 0 auto}
        .cl-spark{font-size:32px;display:inline-block;color:#8a6a3a}
        .cl-stage.clash .cl-spark{animation:cl-spark .55s ease-out forwards}
        @keyframes cl-spark{0%{transform:scale(.4) rotate(-30deg);color:#8a6a3a}45%{transform:scale(1.8) rotate(0);color:#ffca6b;filter:drop-shadow(0 0 12px #ffca6b)}100%{transform:scale(1);color:#e8c877}}
        .cl-verdict{opacity:0;font:700 15px/1.4 'Noto Serif SC',serif;color:#f3e6c4;text-align:center;padding:0 14px;transition:opacity .45s;min-height:40px}
        .hacp-debj-clash.resolved .cl-verdict{opacity:1}
        .cl-verdict .w{color:#e8c877}.cl-verdict .l{color:#b08a6a;text-decoration:line-through;opacity:.75}
        .cl-verdict .beats{color:#b39a72;font-weight:400;font-size:13px}.cl-verdict .adv{font-size:13px;color:#d8c8a4}.cl-verdict .tie{color:#c8b488}
        /* ── Confirmación al usar unas Conclusiones (varios usos → evitar gastarlas por error) ── */
        .hacp-conc-box{max-width:400px;background:linear-gradient(165deg,#2c1f13,#18100a);border:1px solid #6a4a24;box-shadow:0 18px 50px rgba(0,0,0,.55),inset 0 0 0 1px rgba(216,180,90,.16);border-radius:14px;padding:18px 20px;color:#ece0c4;font-family:system-ui,sans-serif;position:relative}
        .hacp-conc-h{display:flex;align-items:center;gap:12px;margin-bottom:8px}
        .hacp-conc-ic{flex:0 0 auto;width:42px;height:42px;border-radius:10px;display:grid;place-items:center;font-size:24px;background:radial-gradient(circle at 35% 30%,#3a2a18,#1a1109);box-shadow:inset 0 0 0 1px rgba(216,180,90,.22)}
        .hacp-conc-nm{font:800 17px 'Noto Serif SC',serif;color:#f3e6c4}
        .hacp-conc-zh{font-size:12px;color:#9a8360;margin-top:2px}
        .hacp-conc-desc{font-size:13px;line-height:1.5;color:#cbb488;margin:6px 0 12px}
        .hacp-conc-uses{background:rgba(0,0,0,.24);border:1px solid rgba(216,180,90,.16);border-radius:11px;padding:10px 12px;display:flex;flex-direction:column;gap:9px}
        .hacp-conc-use{display:flex;gap:10px;align-items:flex-start;font-size:13px;color:#e6dcc0;line-height:1.35}
        .hacp-conc-use .i{flex:0 0 auto;font-size:17px}
        .hacp-conc-use b{color:#f0e2bf}
        .hacp-conc-use .mut{color:#9a8360;font-size:12px}
        .hacp-conc-use.hi{background:rgba(216,180,90,.09);border:1px solid rgba(216,180,90,.22);border-radius:8px;padding:6px 8px}
        .hacp-conc-use.hi b{color:#e8c877}.hacp-conc-use.hi .mut{color:#c9a84c}
        .hacp-conc-warn{text-align:center;font-size:12.5px;color:#e2a06a;margin:11px 0 8px}
        .hacp-conc-btns{display:flex;gap:8px}
        .hacp-conc-btns .hacp-cp-btn{flex:1;padding:10px;font-size:13px}
        @media(max-width:640px){
          /* ── Debate: adaptación MÓVIL (caben en pantalla, se puede desplazar, textos legibles) ── */
          .hacp-deb-box,.hacp-deb-revbox,.hacp-debj-box{max-width:none;width:100%;max-height:calc(100dvh - var(--nav-h,58px) - 16px);overflow-y:auto;padding:14px 14px calc(14px + env(safe-area-inset-bottom,0px))}
          .hacp-deb-title{font-size:17px}
          .hacp-deb-duel{gap:6px}.hacp-deb-side{padding:8px 4px}.hacp-deb-glyph{font-size:26px}
          .hacp-deb-temas{gap:6px}.hacp-deb-tema{padding:8px 3px}.hacp-deb-tema .g{font-size:19px}.hacp-deb-tema .n{font-size:12px}.hacp-deb-tema .o{font-size:12px}
          .hacp-deb-cta{padding:13px;font-size:15px}
          .hacp-deb-chip{padding:7px 12px}
          .hacp-deb-banners{gap:8px}.hacp-deb-banner .g{font-size:24px}
          .hacp-debj-head{font-size:16px}
          .hacp-debj-arena{gap:6px}
          .hacp-debj-fighter{flex-basis:64px;padding:8px 3px}.hacp-debj-fighter .g{font-size:22px}
          /* ── ENFOQUE móvil: solo se ve el personaje del turno; ambos en el clash ── */
          .hacp-debj-arena{flex-wrap:wrap;justify-content:center;gap:4px}
          .hacp-debj-center{order:3;flex:0 0 100%}
          .hacp-debj-arena[data-focus="host"] .hacp-debj-fighter.b,
          .hacp-debj-arena[data-focus="inv"] .hacp-debj-fighter.a{display:none}
          .hacp-debj-arena[data-focus="host"] .hacp-debj-fighter.a,
          .hacp-debj-arena[data-focus="inv"] .hacp-debj-fighter.b{flex:0 0 auto;background:none;border:0;padding:2px}
          .hacp-debj-arena[data-focus="host"] .hacp-debj-portrait,
          .hacp-debj-arena[data-focus="inv"] .hacp-debj-portrait{height:132px}
          .hacp-debj-arena[data-focus="host"] .hacp-debj-fighter .nm,
          .hacp-debj-arena[data-focus="inv"] .hacp-debj-fighter .nm{font-size:15px}
          .hacp-debj-arena[data-focus="both"] .hacp-debj-portrait{height:72px}
          .hacp-debj-center{min-height:70px}.hacp-debj-bubble{font-size:12.5px;padding:6px 9px}
          .hacp-debj-choices{gap:6px}.hacp-debj-arg{padding:9px 4px}.hacp-debj-arg .zh{font-size:20px}.hacp-debj-arg .nb{font-size:12px}.hacp-debj-arg .ph{font-size:12px}
          .hacp-debj-clash{gap:8px}.cl-stage{gap:10px}.cl-face{width:88px;height:88px}.cl-face canvas{height:150px}.cl-verdict{font-size:14px}.cl-vs{width:28px}.cl-spark{font-size:28px}
          .hacp-rps{font-size:10.5px;gap:4px}.hacp-rps .rps-chip{padding:2px 7px}
          .hacp-deb-hint{top:8px;font-size:13px;padding:9px 12px;gap:8px}
        }`;
      document.head.appendChild(s);
    }
    debStyleOnce();
    // Botín común: ≥1 objeto por participante (de la tienda del tier, preferiendo
    // equipables/guardables). El reparto/elección será la sub-fase 4d.
    function generarBotin(band, extra) {
      const n = ((band.miembros || []).length || 1) + (extra || 0);
      const out = [];
      for (let i = 0; i < Math.max(0, n); i++) { const id = (window.HacTienda && HacTienda.botinAleatorio) ? HacTienda.botinAleatorio(tier) : null; if (id) out.push(id); }
      return out;
    }

    // ── A2b: DOCTRINA de banda + SUCESOS cooperativos (deterministas por id de banda) ──
    const DOCTRINAS = [
      { id: 'agresiva',    dom: 'militar',        gly: '武', nom: 'Agresiva',    desc: 'Buscáis el choque: más botín, pero más riesgo.' },
      { id: 'cauta',       dom: 'cultural',       gly: '文', nom: 'Cauta',       desc: 'Marcha prudente: más seguro, recompensa discreta.' },
      { id: 'diplomatica', dom: 'administrativo', gly: '政', nom: 'Diplomática', desc: 'Negociáis: más dinero, algo menos de botín.' },
    ];
    const DOCTRINA_BIAS = { agresiva: { pMod: -0.04, loot: 1 }, cauta: { pMod: 0.08 }, diplomatica: { share: 15, loot: -1 } };
    const SUCESOS_COOP = [
      { id: 'emboscada', txt: 'Emboscada en el desfiladero', ok: { pMod: 0.06, loot: 1 }, fail: { pMod: -0.12 } },
      { id: 'rio',       txt: 'Un río crecido',              ok: { pMod: 0.05 },           fail: { pMod: -0.10, share: -8 } },
      { id: 'aldea',     txt: 'Una aldea aliada',            ok: { share: 12, loot: 1 },   fail: {} },
      { id: 'fortin',    txt: 'Un fortín abandonado',        ok: { loot: 1, pMod: 0.04 },  fail: { pMod: -0.08 } },
      { id: 'desertor',  txt: 'Un desertor enemigo',         ok: { pMod: 0.08, share: 8 }, fail: { pMod: -0.10 } },
      { id: 'tormenta',  txt: 'Se desata un temporal',       ok: { pMod: 0.04 },           fail: { pMod: -0.10 } },
      { id: 'puente',    txt: 'Un puente en ruinas',         ok: { pMod: 0.06, loot: 1 },  fail: { pMod: -0.10 } },
      { id: 'hambre',    txt: 'Las provisiones escasean',    ok: { share: 10 },            fail: { pMod: -0.08, share: -8 } },
      { id: 'refuerzos', txt: 'Refuerzos enemigos',          ok: { pMod: 0.06 },           fail: { pMod: -0.14, loot: -1 } },
      { id: 'cabecilla', txt: 'El cabecilla enemigo',        ok: { loot: 1, share: 10 },   fail: { pMod: -0.12 } },
      { id: 'niebla',    txt: 'Una niebla espesa',           ok: { pMod: 0.05 },           fail: { pMod: -0.10 } },
      { id: 'tributo',   txt: 'Un tributo en disputa',       ok: { share: 14 },            fail: { share: -8 } },
      { id: 'espia',     txt: 'Un espía en las filas',       ok: { pMod: 0.08 },           fail: { pMod: -0.10, loot: -1 } },
    ];
    const doctrinaDef = (id) => DOCTRINAS.find(d => d.id === id) || null;

    // ── POOL de 12 ESCARAMUZAS (con sus eventos + requisitos de stats) ──────────
    // Cada día se ofrecen 3 (rotación determinista por fecha, igual para todos, con
    // un abanico bajo/medio/alto). `rating` 1..5 = espadas mostradas; la dificultad
    // MECÁNICA (band.dificultad) = rating + 2. `req` = suma de niveles de dominio
    // que la banda debe alcanzar ENTRE sus integrantes para poder LANZAR (武 militar,
    // 文 cultural, 政 administrativo). `eventos` = ids de SUCESOS_COOP de esta gesta.
    const ESCARAMUZAS_POOL = [
      { id: 'turbantes',  nombre: 'Turbantes Amarillos',        zh: '黃巾', rating: 1, enemigo: 'Rebeldes campesinos',      eventos: ['aldea'],                    req: {} },
      { id: 'frontera',   nombre: 'Patrulla en la frontera',    zh: '邊患', rating: 1, enemigo: 'Jinetes Wuhuan',           eventos: ['rio'],                      req: {} },
      { id: 'taihang',    nombre: 'Bandidos de Taihang',        zh: '太行', rating: 2, enemigo: 'Forajidos de la montaña',  eventos: ['fortin'],                   req: {} },
      { id: 'nanyang',    nombre: 'Pacificar Nanyang',          zh: '南陽', rating: 2, enemigo: 'Restos de Zhang Xiu',      eventos: ['desertor'],                 req: {} },
      { id: 'escolta',    nombre: 'Escolta de grano a Guandu',  zh: '官渡', rating: 3, enemigo: 'Incursores de Cao',        eventos: ['hambre', 'emboscada'],      req: { administrativo: 5 } },
      { id: 'nanman',     nombre: 'Tratar con los Nanman',      zh: '南蠻', rating: 3, enemigo: 'Guerreros Nanman',         eventos: ['tributo'],                  req: { administrativo: 6 } },
      { id: 'hulao',      nombre: 'Emboscada en Hu Lao',        zh: '虎牢', rating: 4, enemigo: 'Caballería de Dong Zhuo',   eventos: ['emboscada', 'cabecilla'],   req: { militar: 5 } },
      { id: 'changban',   nombre: 'Persecución en Changban',    zh: '長坂', rating: 4, enemigo: 'Élite de tigres de Cao',   eventos: ['puente', 'refuerzos'],      req: { militar: 6 } },
      { id: 'chibi',      nombre: 'La niebla de Chibi',         zh: '赤壁', rating: 4, enemigo: 'Flota de Cao Cao',         eventos: ['niebla', 'espia'],          req: { cultural: 12 } },
      { id: 'vado',       nombre: 'Asalto al Vado Amarillo',    zh: '黃河', rating: 5, enemigo: 'Vanguardia de Yuan Shao',  eventos: ['rio', 'refuerzos'],         req: { militar: 8 } },
      { id: 'jieting',    nombre: 'Tomar el fortín de Jieting', zh: '街亭', rating: 5, enemigo: 'Ejército de Zhang He',     eventos: ['fortin', 'cabecilla', 'refuerzos'], req: { militar: 10 } },
      { id: 'wuchao',     nombre: 'Incursión en Wuchao',        zh: '烏巢', rating: 5, enemigo: 'Depósitos de Yuan Shao',   eventos: ['espia', 'fortin'],          req: { cultural: 8, militar: 6 } },
    ];
    const escenarioDef = (id) => ESCARAMUZAS_POOL.find(s => s.id === id) || null;
    // ── PEREGRINAJE «En busca del legendario curandero» (华佗 Hua Tuo) ──────────
    // Método alternativo de curación: se monta como una escaramuza pero con este
    // escenario reservado (reutiliza portón/animación/cheer). Solo disponible con
    // 3/3 heridas; cura 1-3 al azar; al fracasar deja una SECUELA permanente.
    const PEREG_ID = 'peregrinaje-huatuo';
    const esPereg = (b) => !!(b && b.escenario === PEREG_ID);
    // Secuelas permanentes (cosméticas, de por vida). El sprite las dibuja (manco →
    // sin un brazo; tuerto → parche). El cliente elige una al azar entre las que
    // el herido aún NO tenga cuando el peregrinaje fracasa.
    const SECUELAS = [
      { id: 'manco',  nom: 'Manco',  desc: 'perdió un brazo en el camino' },
      { id: 'tuerto', nom: 'Tuerto', desc: 'perdió un ojo y lleva un parche' },
    ];
    const secuelaDef = (id) => SECUELAS.find(s => s.id === id) || null;
    // Calidad de un escolta = suma de sus niveles de dominio (武+文+政).
    const escortQuality = (id) => ['militar', 'cultural', 'administrativo'].reduce((s, d) => s + ((window.HacStats && HacStats.nivelTotal) ? HacStats.nivelTotal(id, d) : 1), 0);
    // Riesgo del peregrinaje: base 25 %, que baja según la CALIDAD de los escoltas
    // (mecenas más fuertes protegen mejor). Tope de reducción 20 pts → riesgo mín. 5 %.
    function peregRiskParts(band) {
      const base = 0.25;
      let red = 0;
      (band.miembros || []).forEach(m => { if (m.id === band.hostId) return; red += escortQuality(m.id) * 0.012; });
      red = Math.min(0.20, red);
      return { base, red, pct: Math.max(0.05, base - red) };
    }
    const peregRisk = (band) => peregRiskParts(band).pct;
    const DOM_GLY = { militar: '武', cultural: '文', administrativo: '政' };
    const DOM_NOM = { militar: 'militar', cultural: 'cultura', administrativo: 'administración' };
    // rating 1..5 → espadas + etiqueta + color (verde→rojo).
    const DIF_META = [
      { lbl: 'Escaramuza',    col: '#6fae5f' },
      { lbl: 'Refriega',      col: '#a7bd4e' },
      { lbl: 'Refriega dura', col: '#e2a04a' },
      { lbl: 'Batalla',       col: '#e07b3e' },
      { lbl: 'Carnicería',    col: '#d0463b' },
    ];
    function difMeta(rating) { const r = Math.max(1, Math.min(5, rating || 1)); const m = DIF_META[r - 1]; return { rating: r, lbl: m.lbl, col: m.col }; }
    // rating del escenario de una banda (por id; fallback: dificultad-2 en bandas viejas).
    function bandRating(band) { const s = escenarioDef(band.escenario); return s ? s.rating : Math.max(1, Math.min(5, (band.dificultad || 4) - 2)); }
    // Badge de dificultad: N espadas llenas / 5, color por nivel + etiqueta.
    function difBadgeHTML(rating, opts) {
      const m = difMeta(rating), o = opts || {};
      let sw = ''; for (let i = 0; i < 5; i++) sw += `<span class="hacp-dif-sw${i < m.rating ? ' on' : ''}">⚔</span>`;
      return `<span class="hacp-dif" style="--dc:${m.col}"><span class="hacp-dif-sws">${sw}</span>${o.noLabel ? '' : `<span class="hacp-dif-lbl">${m.lbl}</span>`}</span>`;
    }
    // Las 3 escaramuzas de HOY (determinista por día compartido; abanico bajo/medio/alto).
    function escaramuzasDelDia() {
      const bajas = ESCARAMUZAS_POOL.filter(s => s.rating <= 2);
      const medias = ESCARAMUZAS_POOL.filter(s => s.rating === 3);
      const altas = ESCARAMUZAS_POOL.filter(s => s.rating >= 4);
      const ms = (window.HacClock && HacClock.now) ? HacClock.now() : Date.now();
      const dia = Math.floor(ms / 86400000);
      const R = window.HacRand ? HacRand.make('escdia#' + dia) : null;
      const pick = (arr) => arr.length ? arr[R ? R.int(arr.length) : 0] : null;
      return [pick(bajas), pick(medias), pick(altas)].filter(Boolean);
    }
    // Suma de niveles de un dominio ENTRE los integrantes (para los requisitos).
    function bandStatSum(band, dom) { let s = 0; (band.miembros || []).forEach(m => { s += (window.HacStats && HacStats.nivelTotal) ? HacStats.nivelTotal(m.id, dom) : 1; }); return s; }
    // Estado del requisito de un escenario para una banda: { ok, partes:[{dom, need, have}] }.
    function reqInfo(band, scn) {
      const req = (scn && scn.req) || {}; const partes = [];
      Object.keys(req).forEach(dom => partes.push({ dom, need: req[dom], have: bandStatSum(band, dom) }));
      return { ok: partes.every(p => p.have >= p.need), partes };
    }
    // Chips de requisito (武 5 · 文 12), coloreados según se cumplan (con banda o sin ella).
    function reqChipsHTML(scn, band) {
      const req = (scn && scn.req) || {}; const keys = Object.keys(req);
      if (!keys.length) return '<span class="hacp-req none">Sin requisito</span>';
      return keys.map(dom => {
        const have = band ? bandStatSum(band, dom) : null, need = req[dom];
        const ok = have != null && have >= need;
        const prog = have != null ? ` <b>${have}/${need}</b>` : ` ${need}`;
        return `<span class="hacp-req${have != null ? (ok ? ' ok' : ' no') : ''}" title="${esc(DOM_NOMBRE[dom])}">${domIcon(dom)} ${DOM_ABBR[dom]}${prog}</span>`;
      }).join('');
    }
    // Nivel de la banda en un dominio = el del mejor miembro (un especialista lidera).
    function bandStat(band, dom) { let best = 0; (band.miembros || []).forEach(m => { const n = (window.HacStats && HacStats.nivelTotal) ? HacStats.nivelTotal(m.id, dom) : 1; if (n > best) best = n; }); return best || 1; }
    // ¿algún miembro de la banda tiene un talento? (efectos de banda: 虎將, 軍師…)
    const bandTiene = (band, id) => (band.miembros || []).some(m => window.HacStats && HacStats.tieneTalento && HacStats.tieneTalento(m.id, id));
    // ════════ ENCUENTROS por participante (rework coop) ══════════════════════════
    // N encuentros = N plazas. Cada uno es de una APTITUD (generada DETERMINISTA por id
    // de banda → todos ven la misma mezcla) y lo RESUELVE el mecenas que lo reservó, con
    // opciones (live o al volver). Efectos: pMod/share/loot pliegan el desenlace de la
    // banda; xp/cura son personales (los auto-aplica quien resuelve, a su mecenas).
    const ESC_APT = ['militar', 'cultural', 'administrativo'];
    // Cada encuentro trae una ESCENA (viñeta animada del informe) y cada opción una
    // frase de desenlace (sayOk/sayFail) con {m} = nombre del mecenas que lo resolvió.
    const ENC_COOP = {
      militar: [
        { txt: 'Choque en el desfiladero', desc: 'El enemigo os cierra el paso entre las rocas.', scene: 'bridge', obstacle: 'chasm',
          ops: [{ t: 'Cargar de frente', bonus: -0.06, ok: { pMod: 0.08, loot: 1, xp: 30 }, fail: { pMod: -0.12 },
                  sayOk: '{m} os impulsó uno a uno por el barranco y cruzó de un salto.', sayFail: '{m} calculó mal el impulso y estuvo a punto de despeñaros.' },
                { t: 'Flanquear con cautela', bonus: 0.06, ok: { pMod: 0.05, xp: 18 }, fail: { pMod: -0.06 },
                  sayOk: '{m} halló un paso y os hizo cruzar sin que os vieran.', sayFail: '{m} tanteó el vado, pero el terreno cedió a mitad de camino.' }] },
        { txt: 'Un oficial os reta a duelo', desc: 'Un guerrero enemigo os desafía ante ambas huestes.', scene: 'duel',
          ops: [{ t: 'Aceptar el duelo', bonus: -0.04, ok: { share: 12, xp: 28 }, fail: { pMod: -0.10 },
                  sayOk: '{m} aceptó el reto y derribó al oficial ante ambas huestes.', sayFail: '{m} se batió con brío, pero el oficial pudo con él.' },
                { t: 'Rehuir y hostigar', bonus: 0.05, ok: { pMod: 0.04, xp: 16 }, fail: { share: -6 },
                  sayOk: '{m} rehusó el duelo y lo hostigó hasta hacerlo ceder.', sayFail: '{m} intentó hostigarlo, pero cayó en su provocación.' }] },
        { txt: 'Una posición fortificada', desc: 'El objetivo se atrinchera tras empalizadas.', scene: 'bridge', obstacle: 'wall',
          ops: [{ t: 'Asaltar de inmediato', bonus: -0.05, ok: { loot: 1, pMod: 0.06, xp: 26 }, fail: { pMod: -0.10 },
                  sayOk: '{m} os aupó sobre la empalizada y saltó el último.', sayFail: '{m} os empujó al muro, pero la empalizada aguantó.' },
                { t: 'Asediar con paciencia', bonus: 0.06, ok: { pMod: 0.05, xp: 16 }, fail: { pMod: -0.05 },
                  sayOk: '{m} os coló por encima sin prisa y sin bajas.', sayFail: '{m} tardó demasiado y os detectaron desde la torre.' }] },
      ],
      cultural: [
        { txt: 'Un enviado enemigo', desc: 'Traen una propuesta de tregua envenenada.', scene: 'parley',
          ops: [{ t: 'Debatir con firmeza', bonus: -0.03, ok: { share: 12, xp: 28 }, fail: { share: -6 },
                  sayOk: '{m} desmontó la tregua envenenada y arrancó concesiones.', sayFail: '{m} se cerró en banda y el enviado se marchó ofendido.' },
                { t: 'Escuchar y ceder algo', bonus: 0.06, ok: { share: 6, xp: 16 }, fail: {},
                  sayOk: '{m} escuchó, cedió lo justo y os ganó tiempo.', sayFail: '{m} concedió de más y el trato quedó en nada.' }] },
        { txt: 'Señales y estandartes', desc: 'Interpretar los movimientos del enemigo a tiempo.', scene: 'parley',
          ops: [{ t: 'Descifrar sus señales', bonus: 0.04, ok: { pMod: 0.06, xp: 26 }, fail: { pMod: -0.05 },
                  sayOk: '{m} leyó los estandartes y adivinó su próximo paso.', sayFail: '{m} malinterpretó las señales y os llevó al lugar errado.' },
                { t: 'Arengar a la tropa', bonus: -0.02, ok: { pMod: 0.08, xp: 22 }, fail: { pMod: -0.08 },
                  sayOk: '{m} arengó a los vuestros y les levantó el ánimo.', sayFail: '{m} alzó la voz, pero nadie pareció escucharle.' }] },
        { txt: 'Rumores en la aldea', desc: 'La población local sabe más de lo que dice.', scene: 'parley',
          ops: [{ t: 'Sembrar propaganda', bonus: -0.03, ok: { pMod: 0.06, loot: 1, xp: 24 }, fail: { pMod: -0.08 },
                  sayOk: '{m} sembró el rumor justo y volvió la aldea a vuestro favor.', sayFail: '{m} se pasó de listo y la aldea se le puso en contra.' },
                { t: 'Recabar información', bonus: 0.06, ok: { pMod: 0.04, xp: 16 }, fail: {},
                  sayOk: '{m} tiró de la lengua a los vecinos y sacó buena pista.', sayFail: '{m} preguntó mucho y no sacó nada en claro.' }] },
      ],
      administrativo: [
        { txt: 'Suministros y rutas', desc: 'Sin abasto la banda flaquea; hay que resolverlo.', scene: 'supply',
          ops: [{ t: 'Requisar por la fuerza', bonus: -0.05, ok: { share: 14, xp: 24 }, fail: { pMod: -0.06, share: -6 },
                  sayOk: '{m} requisó el abasto y llenó los carros hasta arriba.', sayFail: '{m} requisó a la brava y se le echaron encima.' },
                { t: 'Negociar el abasto', bonus: 0.05, ok: { share: 10, xp: 18 }, fail: { share: -4 },
                  sayOk: '{m} negoció el suministro y os aseguró la ruta.', sayFail: '{m} regateó de más y el trato se torció.' }] },
        { txt: 'Un contrato ventajoso', desc: 'Un mercader ofrece un trato para la casa.', scene: 'supply',
          ops: [{ t: 'Cerrar trato agresivo', bonus: -0.04, ok: { share: 16, xp: 26 }, fail: { share: -8 },
                  sayOk: '{m} cerró un trato redondo y volvió con las arcas llenas.', sayFail: '{m} apretó demasiado y el mercader se retiró.' },
                { t: 'Trato prudente', bonus: 0.06, ok: { share: 8, xp: 16 }, fail: {},
                  sayOk: '{m} firmó un trato prudente y sin sorpresas.', sayFail: '{m} dudó y el mercader cerró con otro.' }] },
        { txt: 'Mediar un pleito local', desc: 'Dos clanes al borde de las manos por unas lindes.', scene: 'supply',
          ops: [{ t: 'Imponer un fallo', bonus: -0.03, ok: { share: 10, xp: 22 }, fail: { pMod: -0.05 },
                  sayOk: '{m} dictó sentencia y ambos clanes acataron.', sayFail: '{m} impuso su fallo y encendió aún más el pleito.' },
                { t: 'Conciliar a las partes', bonus: 0.05, ok: { share: 8, loot: 1, xp: 18 }, fail: {},
                  sayOk: '{m} concilió a los clanes y os ganó su gratitud.', sayFail: '{m} medió sin fortuna; el pleito siguió igual.' }] },
      ],
    };
    const encByDomIdx = (dom, idx) => (ENC_COOP[dom] || [])[idx] || null;
    // Mezcla de encuentros de una banda: [{dom, encIdx}] de longitud = plazas, estable
    // (semilla = id de banda). Todos los clientes la computan igual.
    function escEncuentros(band) {
      const n = band.plazas || (band.miembros || []).length || 2;
      const R = window.HacRand ? HacRand.make('escenc#' + band.id) : null;
      const out = [];
      for (let i = 0; i < n; i++) {
        const dom = R ? ESC_APT[R.int(ESC_APT.length)] : ESC_APT[i % 3];
        const pool = ENC_COOP[dom] || [];
        out.push({ dom: dom, encIdx: pool.length ? (R ? R.int(pool.length) : 0) : 0 });
      }
      return out;
    }
    // Reservas: reservaciones = { pjId: slot }.
    const escSlotOwner = (band, slot) => { const r = band.reservaciones || {}; return Object.keys(r).find(pj => Number(r[pj]) === slot) || null; };
    const escMiSlot = (band) => { const v = (band.reservaciones || {})[myId]; return v == null ? null : Number(v); };
    const escNReservados = (band) => Object.keys(band.reservaciones || {}).length;
    const escTodosReservados = (band) => escNReservados(band) >= (band.plazas || (band.miembros || []).length);
    const escNResueltos = (band) => Object.keys(band.resultados || {}).length;
    // Suma de efectos de banda (pMod/share/loot) de los encuentros YA resueltos.
    function escEncTot(band) {
      const plan = escEncuentros(band), rez = band.resultados || {}, t = { pMod: 0, share: 0, loot: 0 };
      plan.forEach((e, slot) => {
        const r = rez[slot]; if (!r) return;
        const enc = encByDomIdx(e.dom, e.encIdx); if (!enc) return;
        const op = enc.ops[r.opt] || enc.ops[0]; const s = (r.ok ? op.ok : op.fail) || {};
        t.pMod += s.pMod || 0; t.share += s.share || 0; t.loot += s.loot || 0;
      });
      return t;
    }
    // Informe: una línea por encuentro (aptitud + mecenas + ✔/✘/sin resolver).
    // Los encuentros RESUELTOS son clicables → reviven su viñeta animada.
    function escEncReportHTML(band) {
      const plan = escEncuentros(band), rez = band.resultados || {};
      const li = plan.map((e, slot) => {
        const owner = escSlotOwner(band, slot);
        const nm = owner ? ((band.miembros.find(m => m.id === owner) || {}).nombre || 'mecenas') : '—';
        const r = rez[slot];
        const enc = encByDomIdx(e.dom, e.encIdx); const ttl = enc ? enc.txt : 'Encuentro';
        if (!r) return `<li class="hacp-esc-suc skip">${domIcon(e.dom, 'hacp-enc-li')} · ${esc(nm)} <i>(sin resolver)</i></li>`;
        const st = r.ok ? 'ok' : 'bad', mk = r.ok ? '✔' : '✘';
        return `<li class="hacp-esc-suc ${st}"><button type="button" class="hacp-esc-sucbtn" data-enc-anim="${slot}">
          ${domIcon(e.dom, 'hacp-enc-li')}<span class="hacp-esc-sucmk">${mk}</span>
          <span class="hacp-esc-suctxt"><b>${esc(nm)}</b> · ${esc(ttl)}</span>
          <span class="hacp-esc-sucplay" aria-hidden="true">▶</span></button></li>`;
      }).join('');
      const hint = Object.keys(rez).length ? '<div class="hacp-esc-sucs-lbl">Encuentros de la banda · toca uno para revivirlo</div>' : '';
      return `${hint}<ul class="hacp-esc-sucs">${li}</ul>`;
    }
    // Actor para las viñetas (aptitud/aspecto del personaje; color de casa si falta).
    function escAnimActor(memberId, mio) {
      const pj = (window.HacPersonajes && HacPersonajes.get) ? HacPersonajes.get(memberId) : null;
      const base = pj ? (pj.aspecto || {}) : { robe: color };
      return { aptitud: pj ? pj.aptitud : '', aspecto: (window.HacStats && HacStats.vestir) ? HacStats.vestir(memberId, base) : base, mio: !!mio };
    }
    // Abre el overlay y REVIVE el encuentro `slot` de una banda resuelta: reproduce la
    // viñeta y, al llegar al clímax, revela «¡Éxito!»/«Fracasó» + lo conseguido.
    function escEncPlayReport(band, slot) {
      const plan = escEncuentros(band), e = plan[slot]; if (!e) return;
      const enc = encByDomIdx(e.dom, e.encIdx); if (!enc) return;
      const r = (band.resultados || {})[slot]; if (!r) return;
      const op = enc.ops[r.opt] || enc.ops[0], ok = !!r.ok;
      const owner = escSlotOwner(band, slot);
      const heroName = (owner ? (band.miembros.find(m => m.id === owner) || {}).nombre : '') || 'El mecenas';
      const hero = escAnimActor(owner, owner === myId);
      const allies = (band.miembros || []).filter(m => m.id !== owner).map(m => escAnimActor(m.id, m.id === myId));
      const say = esc(((ok ? op.sayOk : op.sayFail) || '').replace('{m}', heroName) || (ok ? 'Salió bien.' : 'Salió mal.'));
      // Recompensa: efectos de banda (pMod/share/loot) + personales del que resolvió (xp/cura).
      const s = (ok ? op.ok : op.fail) || {}, bandFx = [], pers = [];
      if (s.pMod) bandFx.push((s.pMod > 0 ? '+' : '−') + Math.round(Math.abs(s.pMod) * 100) + '% éxito de la banda');
      if (s.share) bandFx.push((s.share > 0 ? '+' : '−') + Math.abs(s.share) + '💰/mecenas');
      if (s.loot) bandFx.push((s.loot > 0 ? '+' : '') + s.loot + ' botín común');
      if (s.xp) pers.push('+' + s.xp + ' XP de ' + (DOM_NOMBRE[e.dom] || '').toLowerCase());
      if (s.cura) pers.push('herida curada');
      const rewHTML = (bandFx.length ? `<div>${esc(bandFx.join(' · '))}</div>` : '')
        + (pers.length ? `<div class="hacp-enc-pers">${esc(heroName)}: ${esc(pers.join(' · '))}</div>` : '')
        + (!bandFx.length && !pers.length ? '<div>sin consecuencias</div>' : '');
      const el = ensureEscSucEl(); el.hidden = false;
      el.innerHTML = `<div class="hacp-suc-box hacp-enc-box">
        <div class="hacp-suc-eyebrow">${domIcon(e.dom)} Encuentro · ${esc((escenarioDef(band.escenario) || {}).nombre || 'Escaramuza')}</div>
        <div class="hacp-suc-ttl">${esc(enc.txt)}</div>
        <div class="hacp-enc-say">${say}</div>
        <canvas class="hacp-enc-anim" data-enc-cv></canvas>
        <div class="hacp-enc-result" data-enc-result hidden>
          <div class="hacp-suc-verdict ${ok ? 'ok' : 'bad'}">${ok ? '¡Éxito!' : 'Fracasó'}</div>
          <div class="hacp-suc-eff">${rewHTML}</div>
        </div>
        <button type="button" class="hacp-cp-btn hacp-suc-done" data-eenc-done>Continuar</button></div>`;
      const cv = el.querySelector('[data-enc-cv]');
      const resEl = el.querySelector('[data-enc-result]');
      const reveal = () => { if (resEl && resEl.hidden) { resEl.hidden = false; resEl.classList.add('show'); } };
      if (escReportAnim) { escReportAnim.stop(); escReportAnim = null; }
      if (window.HacEncAnim && cv) {
        // rAF necesita el ancho ya medido: espera al layout.
        requestAnimationFrame(() => { escReportAnim = HacEncAnim.play(cv, { scene: enc.scene, obstacle: enc.obstacle, ok: ok, hero: hero, heroName: heroName, members: allies, onEnd: reveal }); });
      } else { reveal(); }
      el.querySelector('[data-eenc-done]').addEventListener('click', closeEscSuc);
    }
    // MI banda en curso con un encuentro mío SIN resolver (dispara el aviso/parpadeo).
    function escEncPendMio() {
      if (!myId || !window.HacEscaramuzas) return null;
      const band = HacEscaramuzas.miBanda(h.id, myId);
      if (!band || band.estado !== 'en_curso' || esPereg(band)) return null;
      const slot = escMiSlot(band); if (slot == null) return null;
      if ((band.resultados || {})[slot]) return null;
      return band;
    }
    async function reservarEncuentro(id, slot) {
      if (escBusy) return; escBusy = true;
      try { await HacEscaramuzas.reservar(id, myId, slot); }
      catch (e) { toast((e && e.message) || 'No se pudo reservar'); await HacEscaramuzas.reload(); }
      finally { escBusy = false; renderEscaramuzas(); }
    }
    // Plan determinista de sucesos de una escaramuza (mismo para todos los clientes).
    function escPlan(band) {
      // Escenario del pool → sus eventos AUTORADOS (mismos para todos).
      const scn = escenarioDef(band.escenario);
      if (scn && scn.eventos && scn.eventos.length) {
        return scn.eventos.map((sid, i) => ({ i: i, sucesoId: sid }));
      }
      // Fallback (bandas viejas / sin escenario): muestreo determinista por id.
      if (!window.HacRand) return [];
      const R = HacRand.make('escsuc#' + band.id);
      const n = (band.dificultad || 4) >= 5 ? 2 : 1;
      const pool = SUCESOS_COOP.slice(), plan = [];
      for (let i = 0; i < n && pool.length; i++) plan.push({ i: i, sucesoId: pool.splice(R.int(pool.length), 1)[0].id });
      return plan;
    }
    // Resuelve los sucesos (determinista) según la doctrina (+ overrides del capitán, A2b-2).
    // Devuelve la narración (por suceso) y los mods que se pliegan en la resolución.
    function escSucesos(band) {
      const docDef = doctrinaDef(band.doctrina); const plan = escPlan(band);
      const items = []; let pMod = 0, loot = 0, share = 0;
      plan.forEach(ev => {
        const s = SUCESOS_COOP.find(x => x.id === ev.sucesoId); if (!s) return;
        const ov = (band.sucesos || {})[ev.i];                        // override del capitán (A2b-2)
        const dom = (ov != null && DOCTRINAS[ov]) ? DOCTRINAS[ov].dom : (docDef ? docDef.dom : 'militar');
        // 軍師 Gran estratega: la banda usa su MEJOR stat en los chequeos.
        const stat = bandTiene(band, 'granestratega')
          ? Math.max(bandStat(band, 'militar'), bandStat(band, 'cultural'), bandStat(band, 'administrativo'))
          : bandStat(band, dom);
        const R = window.HacRand ? HacRand.make('escr#' + band.id + '#' + ev.i) : null;
        const ok = R ? (R.next() < pSuceso(stat, band.dificultad || 4)) : true;
        const m = ok ? (s.ok || {}) : (s.fail || {});
        pMod += m.pMod || 0; loot += m.loot || 0; share += m.share || 0;
        items.push({ txt: s.txt, ok: ok });
      });
      if (docDef) { const b = DOCTRINA_BIAS[band.doctrina] || {}; pMod += b.pMod || 0; loot += b.loot || 0; share += b.share || 0; }
      return { docDef: docDef, items: items, pMod: pMod, loot: loot, share: share };
    }
    // Narración para el panel (doctrina + ✔/✘ por suceso).
    function escNarrHTML(band) {
      const sc = escSucesos(band); if (!sc.docDef && !sc.items.length) return '';
      const doc = sc.docDef ? `<div class="hacp-esc-doc">Doctrina: 〔${sc.docDef.gly}〕 ${esc(sc.docDef.nom)}</div>` : '';
      const li = sc.items.map(it => `<li class="hacp-esc-suc ${it.ok ? 'ok' : 'bad'}">${it.ok ? '✔' : '✘'} ${esc(it.txt)}</li>`).join('');
      return doc + (li ? `<ul class="hacp-esc-sucs">${li}</ul>` : '');
    }
    function escNarrTexto(band) {
      const sc = escSucesos(band); const d = sc.docDef ? `〔${sc.docDef.gly}〕${sc.docDef.nom}` : '';
      const ev = sc.items.map(it => `${it.txt} ${it.ok ? '✔' : '✘'}`).join(' · ');
      return [d, ev].filter(Boolean).join(' · ');
    }

    // ── A2b-2: OVERRIDE EN VIVO del capitán durante la marcha ───────────────────
    // Mientras el capitán mira la escaramuza en curso, al llegar el momento de un
    // suceso puede CAMBIAR la maniobra (dominio) de ese trance. Se guarda en la BD
    // (escaramuza_suceso). Si no decide (o no mira), se mantiene la doctrina.
    const ESC_SUC_WINDOW = (/[?&]escfast=1/.test(location.search || '')) ? 12000 : 25000;
    let escSucEl = null, escReportAnim = null;
    function ensureEscSucEl() {
      if (escSucEl) return escSucEl;
      escSucEl = document.createElement('div'); escSucEl.className = 'hacp-suc-ov'; escSucEl.hidden = true; document.body.appendChild(escSucEl);
      ['pointerdown', 'pointerup', 'wheel', 'click'].forEach(ev => escSucEl.addEventListener(ev, e => e.stopPropagation(), { passive: false }));
      return escSucEl;
    }
    function closeEscSuc() { if (escReportAnim) { escReportAnim.stop(); escReportAnim = null; } if (escSucEl) escSucEl.hidden = true; }
    // Abre la carta del encuentro que RESERVÉ (con opciones). true si había uno pendiente.
    function escEncAbrir(band) {
      band = band || (window.HacEscaramuzas && HacEscaramuzas.miBanda(h.id, myId)); if (!band) return false;
      if (band.estado !== 'en_curso' || esPereg(band)) return false;
      const slot = escMiSlot(band); if (slot == null || (band.resultados || {})[slot]) return false;
      const e = escEncuentros(band)[slot]; if (!e) return false;
      const enc = encByDomIdx(e.dom, e.encIdx); if (!enc) return false;
      const dif = band.dificultad || 4;
      const ops = enc.ops.map((op, ix) => {
        const bo = op.bonus || 0;
        const p = Math.round(Math.max(0.05, Math.min(0.95, pSuceso(nivelEf(e.dom), dif) + bo)) * 100);
        const tag = bo > 0.01 ? '<span class="hacp-opt-tag seg">seguro</span>' : bo < -0.01 ? '<span class="hacp-opt-tag rie">arriesgado</span>' : '';
        return `<button type="button" class="hacp-suc-op" data-eop="${ix}"><span class="hacp-suc-opt">${esc(op.t)}</span>${tag}<span class="hacp-suc-pct">${p}%</span></button>`;
      }).join('');
      const el = ensureEscSucEl(); el.hidden = false;
      el.innerHTML = `<div class="hacp-suc-box">
        <div class="hacp-suc-eyebrow">${domIcon(e.dom)} Tu encuentro · ${esc((escenarioDef(band.escenario) || {}).nombre || 'Escaramuza')}</div>
        <div class="hacp-suc-ttl">${esc(enc.txt)}</div>
        <div class="hacp-suc-desc">${esc(enc.desc || '')}</div>
        <div class="hacp-enc-apt">Se resuelve con tu <b style="color:${DOM_COLOR[e.dom]}">${DOM_NOMBRE[e.dom]}</b> · nivel ${nivelEf(e.dom)} vs dificultad ${dif}</div>
        <div class="hacp-enc-hint">El % sube cuanto más alto tengas tu <b>${DOM_NOMBRE[e.dom]}</b> respecto a la dificultad.</div>
        <div class="hacp-suc-ops">${ops}</div></div>`;
      el.querySelectorAll('[data-eop]').forEach(b => b.addEventListener('click', () => escEncTirar(band, slot, e.dom, e.encIdx, +b.dataset.eop)));
      return true;
    }
    async function escEncTirar(band, slot, dom, encIdx, opt) {
      if (escBusy) return;
      const enc = encByDomIdx(dom, encIdx); if (!enc) return;
      const op = enc.ops[opt] || enc.ops[0], dif = band.dificultad || 4;
      const R = window.HacRand ? HacRand.make('escencr#' + band.id + '#' + slot) : null;
      const ok = R ? (R.next() < Math.max(0.05, Math.min(0.95, pSuceso(nivelEf(dom), dif) + (op.bonus || 0)))) : true;
      escBusy = true;
      try {
        await HacEscaramuzas.resolverEncuentro(band.id, myId, slot, ok, opt);
        // Recompensa PERSONAL (XP/curación), una sola vez por cliente (guarda en localStorage).
        const gk = 'rotk.escenc.' + band.id + '.' + slot; let ya = false;
        try { ya = !!localStorage.getItem(gk); } catch (e) {}
        if (!ya) {
          const s = (ok ? op.ok : op.fail) || {};
          if (s.xp && window.HacStats) HacStats.award(myId, { xp: { [dom]: s.xp } });
          if (s.cura && window.HacStats && HacStats.curar) HacStats.curar(myId, s.cura);
          try { localStorage.setItem(gk, '1'); } catch (e) {}
        }
        if (window.HacBitacora) HacBitacora.log(myId, 'escaramuza', `${DOM_GLY[dom] || '⚔'} ${enc.txt} → ${ok ? '✔' : '✘'}`, { clave: 'escenc:' + band.id + ':' + slot });
        escEncResultCard(enc, ok, op, dom);
      } catch (e) { toast((e && e.message) || 'No se pudo resolver'); await HacEscaramuzas.reload(); }
      finally { escBusy = false; if (charId) buildCharPanel(charId); if (escVisible) renderEscaramuzas(); }
    }
    function escEncResultCard(enc, ok, op, dom) {
      const s = (ok ? op.ok : op.fail) || {}, p = [];
      if (s.xp) p.push('+' + s.xp + ' XP de ' + (DOM_NOMBRE[dom] || '').toLowerCase());
      if (s.pMod) p.push((s.pMod > 0 ? '+' : '−') + Math.round(Math.abs(s.pMod) * 100) + '% éxito de la banda');
      if (s.share) p.push((s.share > 0 ? '+' : '−') + Math.abs(s.share) + '💰/mecenas');
      if (s.loot) p.push((s.loot > 0 ? '+' : '') + s.loot + ' botín común');
      if (s.cura) p.push('herida curada');
      const el = ensureEscSucEl(); el.hidden = false;
      el.innerHTML = `<div class="hacp-suc-box">
        <div class="hacp-suc-eyebrow">${domIcon(dom)} Tu encuentro</div>
        <div class="hacp-suc-ttl">${esc(enc.txt)}</div>
        <div class="hacp-suc-verdict ${ok ? 'ok' : 'bad'}">${ok ? '✔ Superado' : '✘ Ha salido mal'}</div>
        <div class="hacp-suc-eff">${p.length ? esc(p.join(' · ')) : 'sin consecuencias'}</div>
        <button type="button" class="hacp-cp-btn hacp-suc-done" data-eenc-done>Continuar</button></div>`;
      el.querySelector('[data-eenc-done]').addEventListener('click', closeEscSuc);
    }
    // RESOLUCIÓN al volver (≥ fin): cualquier miembro la dispara; la RPC es idempotente
    // (solo la primera surte efecto). Dado de éxito en cliente, como en las expediciones.
    // R1b — EFECTOS de las relaciones en la escaramuza. pMod (prob. éxito), loot (botín),
    // per (% dinero a AMBOS del par), perOrigen (% solo a quien SIENTE el vínculo unilateral).
    const REL_FX = {
      hermandad: { jurada: { pMod: 0.08, per: 0.10 }, prometida: { loot: 1 } },
      rivalidad: { competitiva: { loot: 1, pMod: -0.03 }, envidiosa: { per: 0.12, pMod: -0.06 } },
      odio: { unilateral: { pMod: -0.04, perOrigen: -0.15 }, reciproco: { pMod: -0.10 } },
      amor: { unilateral: { pMod: 0.03, perOrigen: 0.15 }, reciproco: { pMod: 0.08, per: 0.10 } },
    };
    // Suma los efectos de los vínculos entre los pares CO-PRESENTES de una banda.
    function relBonos(band) {
      const out = { pMod: 0, loot: 0, per: {} };
      if (!window.HacRelaciones) return out;
      const ids = (band.miembros || []).map(m => m.id).filter(Boolean);
      const addPer = (id, v) => { out.per[id] = (out.per[id] || 0) + v; };
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        const rel = HacRelaciones.get(h.id, ids[i], ids[j]); if (!rel || !rel.tipo) continue;
        const fx = (REL_FX[rel.tipo] || {})[rel.subtipo]; if (!fx) continue;
        out.pMod += fx.pMod || 0; out.loot += fx.loot || 0;
        if (fx.per) { addPer(ids[i], fx.per); addPer(ids[j], fx.per); }
        if (fx.perOrigen && rel.origen) addPer(rel.origen, fx.perOrigen);
      }
      return out;
    }
    // Fuerza agregada de la banda frente al REQUISITO del escenario (1.0 = justo el
    // umbral). Suma los niveles de TODOS los miembros en los dominios exigidos, así que
    // reclutar más mecenas (o más fuertes) eleva la fuerza y, con ella, el éxito.
    function bandFuerza(band) {
      const scn = escenarioDef(band.escenario);
      const req = (scn && scn.req) || {};
      const keys = Object.keys(req);
      if (keys.length) {
        let acc = 0; keys.forEach(dom => { acc += bandStatSum(band, dom) / Math.max(1, req[dom]); });
        return acc / keys.length;
      }
      // Sin requisito conocido (bandas viejas): suma total de niveles vs umbral por dificultad.
      let tot = 0; (band.miembros || []).forEach(m => { ['militar', 'cultural', 'administrativo'].forEach(d => { tot += (window.HacStats && HacStats.nivelTotal) ? HacStats.nivelTotal(m.id, d) : 1; }); });
      return tot / Math.max(1, (band.dificultad || 4) * 3);
    }
    // Probabilidad de ÉXITO estimada (DETERMINISTA) con su DESGLOSE (para explicarla):
    // base(dificultad) + fuerza de la banda (aptitudes vs objetivo) + compañía (nº de
    // mecenas) + sucesos(doctrina) + vínculos + talento del capitán. Es EXACTA: la
    // resolución solo tira el dado final contra este número.
    function escProbParts(band) {
      const b = band;
      const dif = b.dificultad || 4;
      const rb = relBonos(b);
      const capBonus = (window.HacStats && HacStats.tieneTalento && b.hostId && HacStats.tieneTalento(b.hostId, 'oficial')) ? 0.05 : 0;
      // Base BAJA y con fuerte castigo por rating: cumplir el requisito NO garantiza
      // la victoria (r1≈56%, r5≈24% con la banda justa). Ganar de sobra exige aptitudes
      // muy por encima del objetivo. Así spammear escaramuzas cuesta heridas y apuesta.
      // Los ENCUENTROS resueltos ajustan este número al liquidar (no antes de partir).
      const base = Math.max(0.20, 0.56 - (dif - 3) * 0.08);
      const nM = (b.miembros || []).length;
      // El TOPE del bono de aptitudes escala con la dificultad: contra objetivos FÁCILES
      // superarlos de sobra te acerca al techo (≈90%); contra los DIFÍCILES sigue topado
      // bajo, así que aunque los superes en aptitud la escaramuza sigue siendo una apuesta.
      const difC = Math.max(1, Math.min(6, dif));
      const statCapPos = 0.18 + (6 - difC) * 0.06;                                 // dif1 → +48 pts · dif4 → +30 · dif6 → +18
      const statRaw = (bandFuerza(b) - 1) * 0.26;                                  // aptitudes de la banda vs objetivo
      const stat = Math.max(-0.22, Math.min(statCapPos, statRaw));                 // suelo −22 fijo; tope según dificultad
      const compania = Math.min(0.06, Math.max(0, nM - 2) * 0.03);                 // más mecenas = más manos (desde el 3.º)
      const raw = base + stat + compania + rb.pMod + capBonus;
      return { pct: Math.max(0.05, Math.min(0.90, raw)), base: base, stat: stat, statTope: statRaw > statCapPos, statPiso: statRaw < -0.22, compania: compania, companiaTope: compania >= 0.06, suc: 0, rel: rb.pMod, cap: capBonus, nM: nM };
    }
    function escProb(band) { return escProbParts(band).pct; }
    // Desglose legible del % (qué lo sube/baja). Deja claro que reclutar mecenas lo mejora.
    function probDesgloseHTML(band, doctrina) {
      const p = escProbParts(band, doctrina);
      const mod = (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)} pts`;
      const cls = (v) => v < 0 ? 'neg' : (v > 0 ? 'pos' : 'nil');
      const tope = (on) => on ? ' <i class="hacp-esc-tope">tope</i>' : '';
      const rows = [`<li><span>Base · dificultad</span><b>${Math.round(p.base * 100)}%</b></li>`,
        `<li><span>Aptitudes de la banda</span><b class="${cls(p.stat)}">${mod(p.stat)}${tope(p.statTope || p.statPiso)}</b></li>`];
      // Compañía: SIEMPRE visible (aunque sea +0) para que se vea que arranca en el 3.er mecenas.
      rows.push(`<li class="${p.compania ? '' : 'nil'}"><span>Compañía · ${p.nM} mecenas${p.nM < 3 ? ' <em>(desde el 3.º)</em>' : ''}</span><b class="${cls(p.compania)}">${mod(p.compania)}${tope(p.companiaTope)}</b></li>`);
      if (p.suc) rows.push(`<li><span>Doctrina y sucesos</span><b class="${cls(p.suc)}">${mod(p.suc)}</b></li>`);
      if (p.rel) rows.push(`<li><span>Vínculos entre mecenas</span><b class="${cls(p.rel)}">${mod(p.rel)}</b></li>`);
      if (p.cap) rows.push(`<li><span>Talento del capitán</span><b class="pos">${mod(p.cap)}</b></li>`);
      // El consejo se adapta: si ya estás al tope de aptitudes, reclutar más NO sube esa línea.
      const tip = p.statTope
        ? 'Tus aptitudes ya superan de sobra el requisito (al tope). Suma un 3.er mecenas para el bono de compañía.'
        : 'Recluta mecenas con la aptitud pedida para subir «aptitudes de la banda».';
      return `<details class="hacp-esc-desglose"><summary>¿Cómo se calcula el éxito?</summary><ul>${rows.join('')}<li class="hacp-esc-desglose-tip">${tip}</li></ul></details>`;
    }
    // Resuelve MI peregrinaje al volver. El cliente tira el dado (mismo patrón que las
    // escaramuzas); la RPC es idempotente → solo el primero surte efecto. ÉXITO: cura
    // 1-3 al azar. FRACASO: cura 1 pero deja secuela permanente + escoltas quizá heridos.
    function resolverPeregrinajeSiToca(band) {
      const exito = Math.random() >= peregRisk(band);
      let curadas = 0, perm = '', heridos = [];
      if (exito) {
        curadas = 1 + Math.floor(Math.random() * 3);                              // 1..3
      } else {
        curadas = 1;                                                              // cura 1 aunque falle
        const yaTiene = (window.HacStats && HacStats.secuelas) ? HacStats.secuelas(band.hostId) : [];
        const libres = SECUELAS.map(s => s.id).filter(id => yaTiene.indexOf(id) < 0);
        perm = libres.length ? libres[Math.floor(Math.random() * libres.length)] : '';   // '' si ya las tiene todas
        (band.miembros || []).forEach(m => { if (m.id !== band.hostId && Math.random() < 0.5) heridos.push(m.id); });
      }
      HacEscaramuzas.resolverPeregrinaje(band.id, clock(), exito, curadas, perm, heridos)
        .then(() => { if (window.HacStats) HacStats.reload().then(() => { if (charId) buildCharPanel(charId); }); })
        .catch(e => console.warn('[peregrinaje] resolver', e));
    }
    function resolverEscaramuzaSiToca() {
      if (!myId || !window.HacEscaramuzas) return;
      const band = HacEscaramuzas.miBanda(h.id, myId);
      if (!band || band.estado !== 'en_curso' || clock() < band.finMs) return;
      if (esPereg(band)) { resolverPeregrinajeSiToca(band); return; }             // peregrinaje: cura, no botín
      // ANTI-SECUESTRO: al llegar el tiempo, cierra el cooldown de todos YA (idempotente).
      if (!band.cdHecho) { HacEscaramuzas.cerrarCd(band.id, clock()).catch(() => {}); }
      // LIQUIDACIÓN: espera a que TODOS resuelvan su encuentro, salvo a las 12 h (ignora
      // los no resueltos). Evita que un ausente secuestre el reparto de la banda.
      const nTot = band.plazas || (band.miembros || []).length;
      const doce = clock() >= band.finMs + 43200000;
      if (escNResueltos(band) < nTot && !doce) return;
      // Los ENCUENTROS resueltos ajustan prob. de éxito, botín y reparto de la banda.
      const rb = relBonos(band), et = escEncTot(band);
      const R = window.HacRand ? HacRand.make('escres#' + band.id) : null;   // determinista → todos coinciden
      const pFinal = Math.max(0.05, Math.min(0.95, escProb(band) + et.pMod));
      const exito = R ? (R.next() < pFinal) : (Math.random() < pFinal);
      const rtg = bandRating(band);
      const share = Math.max(0, shareRating(rtg) + et.share);
      const hostBonus = Math.round((band.coste || 0) * 0.5) + rtg * 15;
      // +% dinero: EQUIPO (sellos) + efectos de relaciones → mapa {id: fracción}.
      const bonosPct = {};
      (band.miembros || []).forEach(mm => {
        const eq = (window.HacStats && HacStats.bonusDinero) ? HacStats.bonusDinero(mm.id) : 0;
        const p = eq + (rb.per[mm.id] || 0); if (p) bonosPct[mm.id] = p;
      });
      const wounds = bandTiene(band, 'tigre') ? 0 : null;   // 虎將: ignora la 1ª herida al fracasar
      HacEscaramuzas.resolver(band.id, clock(), exito, exito ? generarBotin(band, et.loot + lootRating(rtg) + (bonos.escBotin || 0) + rb.loot) : [], share, hostBonus, ESC_FAST ? 30000 : 0, bonosPct, wounds)
        .then(() => { if (window.HacStats) HacStats.reload().then(() => { if (charId) buildCharPanel(charId); }); })
        .catch(e => console.warn('[escaramuza] resolver', e));
    }

    // ── ESCARAMUZAS — UI compartida (móvil: sección; escritorio: overlay) ───────
    // Renderiza en `escHost` (lo fija quien la muestra). `escVisible` gobierna el
    // refresco por poll. Toda la lógica vive aquí para servir a ambas plataformas.
    // Coste de montar = base por plazas + prima por dificultad (rating). El coste es
    // sobre todo una APUESTA del capitán: al vencer recupera coste +50% (+ prima de
    // rating); al fracasar lo pierde. Reparto/botín escalan fuerte con el rating.
    const COSTE_BANDA = (plazas) => plazas * 20;           // 2→40, 3→60, 4→80 (base)
    const costeRating = (plazas, rating) => COSTE_BANDA(plazas) + (rating || 1) * 30;   // r1..r5: +30..+150
    // Reparto de dinero por mecenas al vencer (antes de mods de sucesos).
    const shareRating = (rating) => 20 + (rating || 1) * 24;      // r1=44 … r5=140
    // Objetos de botín EXTRA (además de 1 garantizado por mecenas) según rating.
    const lootRating = (rating) => (rating >= 4 ? rating - 3 : 0); // r4:+1, r5:+2
    const COSTE_CURA = 45 + (tier || 1) * 10;        // curar 1 herida (enfermería), escala con el tier
    const SUC_WINDOW = (/[?&]escfast=1/.test(location.search || '')) ? 12000 : 22000;   // ventana para decidir un suceso
    const myName = ((h.miembros || []).find(m => m.personajeId === myId) || {}).nombre || 'Tú';
    const ESC_FAST = /[?&]escfast=1/.test(location.search || '');   // modo test: ~1 min, sin cooldown
    let escHost = null, escVisible = false, escPlazas = 3, escBusy = false, escSig = '', escDoctrina = 'cauta';
    function renderEscaramuzas() {
      const body = escHost; if (!body) return;
      if (!myId) { body.innerHTML = '<div class="hacp-msec-soon">兵<br><b>Escaramuzas</b><br>Únete a esta hacienda con tu mecenas para participar.</div>'; return; }
      if (!window.HacEscaramuzas || !HacEscaramuzas.dbOk()) {
        body.innerHTML = '<div class="hacp-msec-soon">兵<br><b>Escaramuzas</b><br>Aún no disponibles en el servidor.</div>'; return;
      }
      const mine = HacEscaramuzas.miBanda(h.id, myId);
      stopMarch();
      if (mine && esPereg(mine)) {
        // PEREGRINAJE: panel propio (curación, no botín). Reutiliza salir/abortar/marcha.
        body.innerHTML = bandaPeregrinajeHTML(mine);
        const sl = body.querySelector('[data-salir]'); if (sl) sl.addEventListener('click', () => salirBanda(mine.id));
        const lp = body.querySelector('[data-lanzar-pereg]'); if (lp && !lp.disabled) lp.addEventListener('click', () => lanzarPeregrinaje(mine.id));
        const ph = body.querySelector('[data-pereg-help]'); if (ph) ph.addEventListener('click', openPeregInfo);
        const ab = body.querySelector('[data-abort]'); if (ab) ab.addEventListener('click', abortarEscaramuza);
        const march = body.querySelector('[data-esc-march]'); if (march) startMarch(march, mine);
        escTick();
        return;
      }
      if (mine) {
        body.innerHTML = bandaPropiaHTML(mine);
        const sl = body.querySelector('[data-salir]'); if (sl) sl.addEventListener('click', () => salirBanda(mine.id));
        const ln = body.querySelector('[data-lanzar]'); if (ln && !ln.disabled) ln.addEventListener('click', () => lanzarBanda(mine.id));
        const ab = body.querySelector('[data-abort]'); if (ab) ab.addEventListener('click', abortarEscaramuza);
        body.querySelectorAll('[data-resv]').forEach(b => b.addEventListener('click', () => reservarEncuentro(mine.id, +b.dataset.resv)));
        const rv = body.querySelector('[data-esc-resolver]'); if (rv) rv.addEventListener('click', () => escEncAbrir());
        body.querySelectorAll('[data-enc-anim]').forEach(b => b.addEventListener('click', () => escEncPlayReport(mine, +b.dataset.encAnim)));
        body.querySelectorAll('[data-loot]').forEach(b => b.addEventListener('click', () => reclamarBotin(mine.id, +b.dataset.loot)));
        const march = body.querySelector('[data-esc-march]'); if (march) startMarch(march, mine);
        escTick();
        return;
      }
      const dinero = window.HacStats ? HacStats.dinero(myId) : 0;
      const cd = (window.HacStats && HacStats.escaramuzaCd) ? HacStats.escaramuzaCd(myId) : 0;
      const enCd = !ESC_FAST && cd > clock();
      const malherido = !!(window.HacStats && HacStats.malherido && HacStats.malherido(myId));
      const ocupado = ocupadoAhora(myId);   // ya en misión/tarea/expedición (aquí no hay banda: la captura el bloque `mine`)
      const bloqueado = enCd || malherido || ocupado;
      const cdAviso = malherido ? `<div class="hacp-esc-note" style="color:#e2a06a">✚ Malherido (3/3) · no puedes montar escaramuzas normales. Organiza el <b>peregrinaje</b> de abajo o cúrate en tu panel.</div>`
        : ocupado ? `<div class="hacp-esc-note" style="color:#e2a06a">Tu mecenas ya está ocupado en otra actividad · no puede montar ni unirse a una escaramuza hasta que vuelva.</div>`
        : enCd ? `<div class="hacp-esc-note" style="color:#e2a06a">⏳ En cooldown · podrás unirte o montar banda en ${fmtClock((cd - clock()) / 1000)}.</div>` : '';
      // CTA del peregrinaje: alternativa de curación cuando estás malherido (3/3).
      const peregCTA = malherido ? `
        <div class="hacp-esc-scn hacp-pereg-cta" style="--dc:#6b9bd1">
          <div class="hacp-esc-scn-top">
            <div class="hacp-esc-scn-id"><span class="hacp-esc-scn-zh">華佗</span> <b>En busca del legendario curandero</b></div>
            <button type="button" class="hacp-pereg-help" data-pereg-help aria-label="¿Qué es el peregrinaje?" title="¿Qué es el peregrinaje?">?</button>
          </div>
          <div class="hacp-esc-scn-en">Peregrina a la montaña de Hua Tuo · si llegáis, curará 1-3 heridas al azar</div>
          <div class="hacp-esc-scn-meta"><span class="hacp-esc-req-lbl">Riesgo</span> <span class="hacp-req">25% · baja con escoltas</span></div>
          <button class="hacp-cp-btn hacp-esc-crear" data-montar-pereg${(enCd || ocupado) ? ' disabled' : ''}>⛰ Organizar peregrinaje${enCd ? ' (en cooldown)' : ocupado ? ' (ocupado)' : ''}</button>
        </div>` : '';
      // Coste de montar una escaramuza: plazas + su dificultad (rating).
      const costeEsc = (scn) => costeRating(escPlazas, scn.rating);
      const dia = escaramuzasDelDia();
      const cards = dia.map(scn => {
        const cst = costeEsc(scn), falta = dinero < cst;
        return `<div class="hacp-esc-scn" style="--dc:${difMeta(scn.rating).col}">
          <div class="hacp-esc-scn-top">
            <div class="hacp-esc-scn-id"><span class="hacp-esc-scn-zh">${esc(scn.zh)}</span> <b>${esc(scn.nombre)}</b></div>
            ${difBadgeHTML(scn.rating)}
          </div>
          <div class="hacp-esc-scn-en">contra ${esc(scn.enemigo)}</div>
          <div class="hacp-esc-scn-meta"><span class="hacp-esc-req-lbl">Requiere</span> ${reqChipsHTML(scn, null)}</div>
          <button class="hacp-cp-btn hacp-esc-crear" data-crear-scn="${esc(scn.id)}"${(falta || bloqueado) ? ' disabled' : ''}>Montar · 💰 ${cst}${falta ? ' (te falta)' : ''}</button>
        </div>`;
      }).join('');
      const abiertas = HacEscaramuzas.abiertas(h.id).filter(b => b.miembros.length < b.plazas);
      const lista = abiertas.map(b => {
        if (esPereg(b)) {
          // Peregrinaje abierto: cualquiera (no malherido / sin cooldown) puede ESCOLTAR.
          return `<div class="hacp-mrow"><div class="hacp-mrow-main"><b>⛰ En busca del legendario curandero</b>
            <span>peregrinaje · ${b.miembros.length}/${b.plazas} · con ${esc(b.hostNombre || '—')}</span></div>
            <button class="hacp-cp-btn" data-unir="${esc(b.id)}"${bloqueado ? ' disabled' : ''}>Escoltar</button></div>`;
        }
        const scn = escenarioDef(b.escenario);
        // Mezcla de encuentros: icono por aptitud; libres muestran TU % (según tu nivel),
        // reservados van atenuados. Así ves de un vistazo si hay un hueco que te encaja.
        const mix = escEncuentros(b).map((e, slot) => {
          const taken = escSlotOwner(b, slot), pct = Math.round(pSuceso(nivelEf(e.dom), b.dificultad || 4) * 100);
          const tip = `${DOM_NOMBRE[e.dom]} · ${difMeta(bandRating(b)).lbl}${taken ? ' · ya reservado' : ` · tu éxito ${pct}%`}`;
          return `<span class="hacp-encmix-i${taken ? ' taken' : ''}" title="${esc(tip)}">${domIcon(e.dom, 'hacp-encmix-ic')}<i>${taken ? '✓' : pct + '%'}</i></span>`;
        }).join('');
        return `<div class="hacp-mrow"><div class="hacp-mrow-main"><b>${esc(scn ? scn.nombre : 'Expedición militar')}</b>
          <span>${difBadgeHTML(bandRating(b), { noLabel: true })} · ${b.miembros.length}/${b.plazas} · cap. ${esc(b.hostNombre || '—')}</span>
          <div class="hacp-esc-encmix">${mix}</div></div>
          <button class="hacp-cp-btn" data-unir="${esc(b.id)}"${bloqueado ? ' disabled' : ''}>Unirse</button></div>`;
      }).join('') || '<div class="hacp-inv-note">No hay bandas abiertas. ¡Monta una de las de hoy!</div>';
      body.innerHTML = `
        <div class="hacp-esc-h">兵 Escaramuzas <span class="hacp-esc-sub">expediciones cooperativas</span></div>
        ${cdAviso}
        ${peregCTA}
        <div class="hacp-esc-ttl">Escaramuzas de hoy <span class="hacp-esc-sub">cambian cada día</span></div>
        <div class="hacp-esc-note">Elige una gesta y monta la banda; recluta mecenas para cumplir su requisito de aptitudes. Si volvéis con éxito recuperáis el coste +50% y vuestra parte; si fracasáis, vuestros mecenas reciben una herida.</div>
        <div class="hacp-esc-plazas">${[2, 3, 4].map(p => `<button class="hacp-esc-p${p === escPlazas ? ' on' : ''}" data-plazas="${p}">${p} plazas</button>`).join('')}</div>
        <div class="hacp-esc-day">${cards}</div>
        <div class="hacp-esc-ttl2">Bandas abiertas</div>${lista}`;
      body.querySelectorAll('[data-plazas]').forEach(b => b.addEventListener('click', () => { escPlazas = +b.dataset.plazas; renderEscaramuzas(); }));
      const mpb = body.querySelector('[data-montar-pereg]'); if (mpb && !mpb.disabled) mpb.addEventListener('click', montarPeregrinaje);
      const phb = body.querySelector('[data-pereg-help]'); if (phb) phb.addEventListener('click', openPeregInfo);
      body.querySelectorAll('[data-crear-scn]').forEach(b => { if (!b.disabled) b.addEventListener('click', () => crearBanda(b.dataset.crearScn)); });
      body.querySelectorAll('[data-unir]').forEach(b => { if (!b.disabled) b.addEventListener('click', () => unirBanda(b.dataset.unir)); });
    }
    function bandaPropiaHTML(b) {
      const esHost = b.hostId === myId;
      const roster = b.miembros.map(m => `<li class="hacp-esc-m${m.id === b.hostId ? ' host' : ''}">${esc(m.nombre || 'mecenas')}${m.id === b.hostId ? ' · capitán' : ''}${m.id === myId ? ' (tú)' : ''}</li>`).join('');
      const scn = escenarioDef(b.escenario);
      const rating = bandRating(b);
      const rq = scn ? reqInfo(b, scn) : { ok: true, partes: [] };
      const probPct = Math.round(escProb(b) * 100);
      const probCls = probPct >= 65 ? 'hi' : (probPct >= 45 ? 'mid' : 'lo');
      const sharePrev = Math.max(0, shareRating(rating));
      const lootBonus = lootRating(rating);
      const riskPct = Math.max(0, 100 - probPct);
      const probHTML = `<div class="hacp-esc-prob ${probCls}"><span>Éxito estimado</span><span class="hacp-esc-prob-v"><b>${probPct}%</b><i class="hacp-esc-prob-risk">riesgo ${riskPct}%</i></span></div>`;
      const desgloseHTML = probDesgloseHTML(b);
      const rewardHTML = `<div class="hacp-esc-reward">Botín si vencéis: <b>~${sharePrev}💰</b>/mecenas · <b>1 objeto</b> c/u${lootBonus ? ` · <b>+${lootBonus}</b> de botín común` : ''}</div>`;
      const reqHTML = (scn && rq.partes.length) ? `<div class="hacp-esc-scn-meta"><span class="hacp-esc-req-lbl">Requisito</span> ${reqChipsHTML(scn, b)}</div>` : '';
      let accion = '';
      if (b.estado === 'abierta') {
        const faltaReq = scn && !rq.ok;
        const plan = escEncuentros(b), todos = escTodosReservados(b), miSlot = escMiSlot(b);
        const slotsHTML = plan.map((e, slot) => {
          const owner = escSlotOwner(b, slot);
          const nm = owner ? ((b.miembros.find(m => m.id === owner) || {}).nombre || 'mecenas') : null;
          const mio = owner === myId, pct = Math.round(pSuceso(nivelEf(e.dom), b.dificultad || 4) * 100);
          const right = owner
            ? `<span class="hacp-enc-owner${mio ? ' mio' : ''}">${esc(nm)}${mio ? ' (tú)' : ''}</span>`
            : `<button type="button" class="hacp-cp-btn hacp-enc-resv" data-resv="${slot}">Reservar · ${pct}%</button>`;
          return `<div class="hacp-enc-slot${owner ? ' taken' : ''}${mio ? ' mine' : ''}">${domIcon(e.dom, 'hacp-enc-si')}<span class="hacp-enc-slot-nm">${DOM_NOMBRE[e.dom]} <i class="hacp-enc-lvl">tu nivel ${nivelEf(e.dom)}</i></span>${right}</div>`;
        }).join('');
        const slotsBox = `<div class="hacp-enc-slots-lbl">Encuentros · elige el tuyo</div><div class="hacp-enc-slots">${slotsHTML}</div>`;
        accion = reqHTML + probHTML + desgloseHTML + rewardHTML + slotsBox;
        if (esHost) {
          const puede = todos && rq.ok && b.miembros.length >= 2;
          accion += `<button class="hacp-cp-btn hacp-esc-lanzar" data-lanzar${puede ? '' : ' disabled'}>⚔ Lanzar expedición</button>
            <div class="hacp-esc-note">${!todos ? 'Cada mecenas debe reservar su encuentro antes de partir.' : b.miembros.length < 2 ? 'Hacen falta al menos 2 mecenas para partir.' : faltaReq ? 'Recluta mecenas con más aptitud hasta cumplir el requisito.' : 'Al lanzar, la banda parte y cada quien resuelve su encuentro por el camino (o al volver).'}</div>`;
        } else {
          accion += `<div class="hacp-esc-note">${miSlot == null ? '<b>Reserva tu encuentro.</b> ' : ''}Esperando a que el capitán lance${!todos ? ' (faltan reservas)' : faltaReq ? ' (faltan aptitudes)' : ''}.</div>`;
        }
        accion += `<button class="hacp-cp-btn hacp-esc-salir" data-salir>${esHost ? 'Disolver la banda' : 'Salir de la banda'}</button>`;
      } else if (b.estado === 'en_curso') {
        const nTot = b.plazas || (b.miembros || []).length, nRes = escNResueltos(b);
        const miSlot = escMiSlot(b), miPend = miSlot != null && !(b.resultados || {})[miSlot];
        // La marcha va SOLA; debajo: progreso de encuentros + éxito + recompensas. Para TODA la banda.
        accion = `<canvas class="hacp-esc-march" data-esc-march></canvas>
          <div class="hacp-esc-timer" data-esc-timer="${b.finMs}">En la expedición…</div>
          <div class="hacp-enc-progress">Encuentros resueltos · <b>${nRes}/${nTot}</b></div>
          ${probHTML}${desgloseHTML}${rewardHTML}
          ${miPend ? `<button type="button" class="hacp-cp-btn hacp-esc-resolver" data-esc-resolver>⚔ Resolver mi encuentro</button>`
                   : (miSlot != null ? `<div class="hacp-esc-note">Ya resolviste tu encuentro. Esperando al resto.</div>` : '')}
          <div class="hacp-esc-note">Cada mecenas resuelve su encuentro (ahora o al volver). Al terminar todos —o pasadas 12 h— se reparten recompensas y botín.</div>
          ${esHost ? `<button type="button" class="hacp-cp-btn hacp-esc-abort" data-abort>Abortar expedición</button>` : ''}`;
      } else if (b.estado === 'abortando') {
        accion = `<canvas class="hacp-esc-march" data-esc-march data-back></canvas>
          <div class="hacp-esc-timer" data-esc-timer="${b.finMs}">Abortada · regresando…</div>
          <div class="hacp-esc-note">El capitán abortó la escaramuza. La banda desanda el camino a casa; sin recompensas ni botín.</div>`;
      } else if (b.estado === 'botin') {
        const elec = b.elecciones || {};
        const yaCogi = Object.prototype.hasOwnProperty.call(elec, myId);
        const grid = (b.botin || []).map((itemId, i) => {
          const it = window.HacTienda && HacTienda.get(itemId);
          const tomadoPor = Object.keys(elec).find(pj => Number(elec[pj]) === i);
          const mio = tomadoPor === myId, taken = tomadoPor != null;
          const dueno = taken ? ((b.miembros.find(m => m.id === tomadoPor) || {}).nombre || 'otro') : '';
          const accionItem = mio ? '<span class="hacp-esc-loot-tag mio">tuyo</span>'
            : taken ? `<span class="hacp-esc-loot-tag">${esc(dueno)}</span>`
            : (yaCogi ? '' : `<button class="hacp-cp-btn" data-loot="${i}">Coger</button>`);
          return `<div class="hacp-esc-loot${taken ? ' taken' : ''}${mio ? ' mine' : ''}">
            <div class="hacp-esc-loot-ic">${it ? (it.icon || '∎') : '∎'}</div>
            <div class="hacp-esc-loot-nm">${it ? esc(it.nombre) : 'objeto'}</div>${accionItem}</div>`;
        }).join('');
        accion = `<div class="hacp-esc-result ok">✔ ¡Volvisteis con éxito!</div>
          ${escEncReportHTML(b)}
          <div class="hacp-esc-note">Tu parte del dinero ya está en tu monedero${esHost ? ' (recuperaste el coste +50%)' : ''}. Botín común: <b>elige 1 objeto</b>${yaCogi ? ' — ya recogiste el tuyo.' : ' (hay al menos uno para cada quien).'}</div>
          <div class="hacp-esc-loot-grid">${grid}</div>
          <button class="hacp-cp-btn hacp-esc-salir" data-salir>Cerrar</button>`;
      } else {   // resuelta (fracaso)
        accion = `<div class="hacp-esc-result bad">✘ La expedición fracasó</div>
          ${escEncReportHTML(b)}
          <div class="hacp-esc-note">Tu mecenas vuelve con una herida. Podrás volver a intentarlo tras el cooldown.</div>
          <button class="hacp-cp-btn hacp-esc-salir" data-salir>Cerrar</button>`;
      }
      return `<div class="hacp-esc-h">兵 Tu banda <span class="hacp-esc-sub">${b.miembros.length}/${b.plazas}</span></div>
        <div class="hacp-esc-card" style="--dc:${difMeta(rating).col}">
          <div class="hacp-esc-scn-top">
            <div class="hacp-esc-scn-id">${scn ? `<span class="hacp-esc-scn-zh">${esc(scn.zh)}</span> ` : ''}<b>${scn ? esc(scn.nombre) : 'Expedición militar'}</b></div>
            ${difBadgeHTML(rating)}
          </div>
          ${scn ? `<div class="hacp-esc-scn-en">contra ${esc(scn.enemigo)}</div>` : ''}
          <ul class="hacp-esc-roster">${roster}</ul>${accion}</div>`;
    }
    // ── PEREGRINAJE «En busca del legendario curandero» — panel + acciones ──────
    function bandaPeregrinajeHTML(b) {
      const esHost = b.hostId === myId;
      const hostNombre = b.hostNombre || 'el herido';
      const roster = b.miembros.map(m => `<li class="hacp-esc-m${m.id === b.hostId ? ' host' : ''}">${esc(m.nombre || 'mecenas')}${m.id === b.hostId ? ' · el herido' : ' · escolta'}${m.id === myId ? ' (tú)' : ''}</li>`).join('');
      const rp = peregRiskParts(b);
      const riskPct = Math.round(rp.pct * 100);
      const riskCls = riskPct <= 10 ? 'hi' : (riskPct <= 18 ? 'mid' : 'lo');   // menos riesgo = mejor (verde)
      const riskHTML = `<div class="hacp-esc-prob ${riskCls}">Riesgo del camino <b>${riskPct}%</b></div>`;
      const redHTML = rp.red > 0
        ? `<div class="hacp-esc-reward">Los escoltas reducen el riesgo <b>−${Math.round(rp.red * 100)} pts</b> (mecenas más fuertes protegen mejor).</div>`
        : `<div class="hacp-esc-reward">Sin escolta partes a riesgo pleno. Espera a que alguien se una para bajarlo.</div>`;
      let accion = '';
      if (b.estado === 'abierta') {
        if (esHost) {
          accion = riskHTML + redHTML + `<button class="hacp-cp-btn hacp-esc-lanzar" data-lanzar-pereg>⛰ Partir en peregrinaje</button>
            <div class="hacp-esc-note">Puedes partir solo o esperar escoltas: cuantos más y mejores te acompañen, menor será el riesgo. El viaje dura 1 h.</div>
            <button class="hacp-cp-btn hacp-esc-salir" data-salir>Cancelar el peregrinaje</button>`;
        } else {
          accion = riskHTML + redHTML + `<div class="hacp-esc-note">Aguardáis a que ${esc(hostNombre)} decida partir. Tu presencia reduce el riesgo del camino… pero si sale mal, podrías volver herido.</div>
            <button class="hacp-cp-btn hacp-esc-salir" data-salir>Dejar de escoltar</button>`;
        }
      } else if (b.estado === 'en_curso') {
        accion = `<canvas class="hacp-esc-march" data-esc-march></canvas>
          <div class="hacp-esc-timer" data-esc-timer="${b.finMs}">Camino a la montaña…</div>
          ${riskHTML}
          <div class="hacp-esc-note">El grupo avanza despacio: el herido cojea, los escoltas vigilan. Al llegar sabréis si el sabio os recibe.</div>
          ${esHost ? `<button type="button" class="hacp-cp-btn hacp-esc-abort" data-abort>Abandonar el peregrinaje</button>` : ''}`;
      } else if (b.estado === 'abortando') {
        accion = `<canvas class="hacp-esc-march" data-esc-march data-back></canvas>
          <div class="hacp-esc-timer" data-esc-timer="${b.finMs}">Regresando…</div>
          <div class="hacp-esc-note">Se abandona el peregrinaje. El grupo desanda el camino a casa, sin cura.</div>`;
      } else if (b.exito === true) {   // resuelta con éxito
        accion = `<div class="hacp-esc-result ok">✚ ¡Hallasteis al gran sabio!</div>
          <div class="hacp-esc-note">Hua Tuo atendió a ${esc(hostNombre)}: sus heridas han menguado. Compruébalo en su panel.</div>
          <button class="hacp-cp-btn hacp-esc-salir" data-salir>Cerrar</button>`;
      } else {   // resuelta con fracaso
        const secs = (esHost && window.HacStats && HacStats.secuelas) ? HacStats.secuelas(myId) : [];
        const ultima = secs.length ? secuelaDef(secs[secs.length - 1]) : null;
        accion = `<div class="hacp-esc-result bad">✘ El camino se torció</div>
          <div class="hacp-esc-note">No hallasteis al sabio a tiempo. ${esc(hostNombre)} vuelve con una herida menos, pero ${ultima ? `con una secuela de por vida: <b>${esc(ultima.nom)}</b> (${esc(ultima.desc)})` : 'malparado'}. Algún escolta pudo volver herido.</div>
          <button class="hacp-cp-btn hacp-esc-salir" data-salir>Cerrar</button>`;
      }
      return `<div class="hacp-esc-h">⛰ Peregrinaje <span class="hacp-esc-sub">${b.miembros.length} en marcha</span></div>
        <div class="hacp-esc-card" style="--dc:#6b9bd1">
          <div class="hacp-esc-scn-top">
            <div class="hacp-esc-scn-id"><span class="hacp-esc-scn-zh">華佗</span> <b>En busca del legendario curandero</b></div>
            <button type="button" class="hacp-pereg-help" data-pereg-help aria-label="¿Qué es el peregrinaje?" title="¿Qué es el peregrinaje?">?</button>
          </div>
          <div class="hacp-esc-scn-en">hacia la montaña de Hua Tuo</div>
          <ul class="hacp-esc-roster">${roster}</ul>${accion}</div>`;
    }
    // Monta el peregrinaje (solo con 3/3 heridas). Gratis, sin requisitos de aptitud.
    async function montarPeregrinaje() {
      if (escBusy) return;
      if (ocupadoAhora(myId)) { toast('Tu mecenas ya está ocupado · espera a que vuelva'); return; }
      if (!(window.HacStats && HacStats.heridas(myId) >= 3)) { toast('El peregrinaje solo se organiza con 3/3 heridas'); return; }
      if (!ESC_FAST && window.HacStats && HacStats.escaramuzaCd && HacStats.escaramuzaCd(myId) > clock()) { toast('En cooldown · aún no puedes salir'); return; }
      escBusy = true;
      try {
        await HacEscaramuzas.crear({ haciendaId: h.id, hostId: myId, hostNombre: myName, plazas: 4, dificultad: 0, coste: 0, escenario: PEREG_ID });
        toast('⛰ Peregrinaje organizado · esperando escoltas');
        if (window.HacBitacora) HacBitacora.log(myId, 'escaramuza', '⛰ Organizaste el peregrinaje «En busca del legendario curandero»');
      } catch (e) { toast((e && e.message) || 'No se pudo organizar'); await HacEscaramuzas.reload(); }
      finally { escBusy = false; renderEscaramuzas(); if (charId) buildCharPanel(charId); }
    }
    // Parte (admite ir solo). Dura 1 h (o ~1 min en modo test).
    async function lanzarPeregrinaje(id) {
      if (escBusy) return; escBusy = true;
      try {
        await HacEscaramuzas.lanzarPeregrinaje(id, myId, clock(), ESC_FAST ? 60000 : 3600000);
        toast(ESC_FAST ? '⛰ ¡En marcha! (modo test · ~1 min)' : '⛰ ¡El grupo parte hacia la montaña!');
        if (window.HacBitacora) HacBitacora.log(myId, 'escaramuza', '⛰ Partisteis en busca del legendario curandero');
        syncEscaramuzaOrder(); syncEscaramuzaFolk();
      } catch (e) { toast((e && e.message) || 'No se pudo partir'); await HacEscaramuzas.reload(); }
      finally { escBusy = false; renderEscaramuzas(); }
    }
    // Explicación del peregrinaje (overlay), abierta desde el «?» de la tarjeta/panel.
    let peregInfoEl = null;
    function ensurePeregInfoEl() {
      if (peregInfoEl) return peregInfoEl;
      peregInfoEl = document.createElement('div'); peregInfoEl.className = 'hacp-shop hacp-pereg-info-ov'; peregInfoEl.hidden = true; overlayHost().appendChild(peregInfoEl);
      ['pointerdown', 'pointerup', 'wheel', 'click'].forEach(ev => peregInfoEl.addEventListener(ev, (e) => e.stopPropagation(), { passive: false }));
      peregInfoEl.addEventListener('click', (e) => { if (e.target === peregInfoEl) peregInfoEl.hidden = true; });
      return peregInfoEl;
    }
    function openPeregInfo() {
      const el = ensurePeregInfoEl();
      el.innerHTML = `<div class="hacp-shop-box hacp-pereg-info">
        <button type="button" class="hacp-shop-x" data-pi-x aria-label="Cerrar">✕</button>
        <div class="hacp-esc-h">華佗 En busca del legendario curandero</div>
        <p class="hacp-pereg-info-p">Cuando tu mecenas cae <b>malherido</b> (3/3) y no puedes —o no quieres— pagar la enfermería, aún queda una salida: <b>peregrinar</b> a la montaña del gran sabio <b>Hua Tuo</b>.</p>
        <ul class="hacp-pereg-info-list">
          <li>⛰ <b>Viaje exterior cooperativo</b>: lo organizas gratis y otros mecenas de la hacienda pueden unirse para <b>escoltarte</b>.</li>
          <li>⏳ Dura <b>1 hora</b>. Al volver, 1 h de descanso antes de poder salir de nuevo.</li>
          <li>🎲 <b>Riesgo del camino: 25%</b>, que baja según la <b>calidad de tus escoltas</b> (mecenas más fuertes protegen mejor; mínimo 5%). Puedes ir solo, a riesgo pleno.</li>
          <li>✚ <b>Si llegáis</b>: el sabio cura <b>1-3 heridas</b> al azar.</li>
          <li>✘ <b>Si el camino se tuerce</b>: curas solo 1 herida y vuelves con una <b>secuela permanente</b> (manco, tuerto…) —de por vida, no se cura— y algún escolta puede volver herido.</li>
        </ul>
        <button type="button" class="hacp-cp-btn" data-pi-x>Entendido</button>
      </div>`;
      el.querySelectorAll('[data-pi-x]').forEach(b => b.addEventListener('click', () => { el.hidden = true; }));
      el.hidden = false;
    }
    async function crearBanda(scnId) {
      if (escBusy) return;
      const scn = escenarioDef(scnId);
      if (!scn) { toast('Esa escaramuza ya no está disponible'); return; }
      if (ocupadoAhora(myId)) { toast('Tu mecenas ya está ocupado · espera a que vuelva'); return; }
      if (window.HacStats && HacStats.malherido && HacStats.malherido(myId)) { toast('Tu mecenas está malherido · cúralo antes de salir'); return; }
      if (!ESC_FAST && window.HacStats && HacStats.escaramuzaCd && HacStats.escaramuzaCd(myId) > clock()) { toast('Escaramuza en cooldown'); return; }
      const coste = costeRating(escPlazas, scn.rating);
      if (!window.HacStats || HacStats.dinero(myId) < coste) { toast('No tienes suficiente dinero'); return; }
      escBusy = true; let pagado = false;
      try {
        await HacStats.award(myId, { dinero: -coste }); pagado = true;
        await HacEscaramuzas.crear({ haciendaId: h.id, hostId: myId, hostNombre: myName, plazas: escPlazas, dificultad: (scn.rating || 1) + 2, coste, escenario: scn.id });
        toast('⚔ Banda montada · esperando mecenas');
        if (window.HacBitacora) HacBitacora.log(myId, 'escaramuza', `⚔ Montaste «${scn.nombre}» (${escPlazas} plazas · −${coste}💰)`);
      } catch (e) {
        if (pagado && window.HacStats) await HacStats.award(myId, { dinero: coste });
        toast((e && e.message) || 'No se pudo montar'); await HacEscaramuzas.reload();
      } finally { escBusy = false; renderEscaramuzas(); if (charId) buildCharPanel(charId); }
    }
    async function unirBanda(id) {
      if (escBusy) return;
      if (ocupadoAhora(myId)) { toast('Tu mecenas ya está ocupado · espera a que vuelva'); return; }
      if (window.HacStats && HacStats.malherido && HacStats.malherido(myId)) { toast('Tu mecenas está malherido · cúralo antes de salir'); return; }
      if (!ESC_FAST && window.HacStats && HacStats.escaramuzaCd && HacStats.escaramuzaCd(myId) > clock()) { toast('Escaramuza en cooldown'); return; }
      escBusy = true;
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
    async function lanzarBanda(id) {
      if (escBusy) return;
      // Requisito de aptitudes: la suma de la banda debe alcanzar el umbral del escenario.
      const band = HacEscaramuzas.miBanda(h.id, myId), scn = band && escenarioDef(band.escenario);
      if (band && scn) { const rq = reqInfo(band, scn); if (!rq.ok) { const f = rq.partes.filter(p => p.have < p.need).map(p => `${DOM_ABBR[p.dom]} ${p.have}/${p.need}`).join(' · '); toast('Faltan aptitudes: ' + f); return; } }
      if (band && !escTodosReservados(band)) { toast('Cada mecenas debe reservar su encuentro antes de lanzar'); return; }
      escBusy = true;
      try {
        await HacEscaramuzas.lanzar(id, myId, clock(), ESC_FAST ? 60000 : 0, '');
        toast(ESC_FAST ? '⚔ ¡Parten! (modo test · ~1 min)' : '⚔ ¡La banda parte a la expedición!');
        if (window.HacBitacora) HacBitacora.log(myId, 'escaramuza', `⚔ Tu banda partió a la expedición`);
        syncEscaramuzaOrder(); syncEscaramuzaFolk();
      } catch (e) { toast((e && e.message) || 'No se pudo lanzar'); await HacEscaramuzas.reload(); }
      finally { escBusy = false; renderEscaramuzas(); }
    }
    // El capitán aborta la escaramuza en curso: todos vuelven a casa en 5 min, sin premio.
    async function abortarEscaramuza() {
      if (!myId || !window.HacEscaramuzas || escBusy) return;
      const band = HacEscaramuzas.miBanda(h.id, myId);
      if (!band || band.hostId !== myId || band.estado !== 'en_curso') return;
      const msgAbort = esPereg(band)
        ? '¿Abandonar el peregrinaje? El grupo entero volverá a casa en 5 minutos y no habrá cura.'
        : '¿Abortar la escaramuza? La banda entera volverá a casa en 5 minutos y no habrá recompensas ni botín.';
      if (!confirm(msgAbort)) return;
      escBusy = true;
      try {
        await HacEscaramuzas.abortar(band.id, myId, clock(), ESC_FAST ? 20000 : 0);
        toast(esPereg(band) ? '↩ Peregrinaje abandonado · regreso en 5 min' : '↩ Escaramuza abortada · regreso en 5 min');
        syncEscaramuzaOrder();
      } catch (e) { toast((e && e.message) || 'No se pudo abortar'); await HacEscaramuzas.reload(); }
      finally { escBusy = false; if (charId) buildCharPanel(charId); renderEscaramuzas(); }
    }
    async function reclamarBotin(id, slot) {
      if (escBusy) return; escBusy = true;
      try {
        const band = HacEscaramuzas.miBanda(h.id, myId);
        const itemId = band && band.botin ? band.botin[slot] : null;
        if (window.HacStats && HacStats.ocupadas && HacStats.capInventario && HacStats.ocupadas(myId) >= HacStats.capInventario(myId)) {
          toast('Mochila llena · vacía un hueco antes de recoger'); return;
        }
        await HacEscaramuzas.reclamar(id, myId, slot);
        if (itemId && window.HacStats && HacStats.darItem) HacStats.darItem(myId, itemId);
        const it = window.HacTienda && HacTienda.get(itemId);
        toast('🎁 Recogiste ' + (it ? it.nombre : 'tu botín'));
        if (window.HacBitacora) HacBitacora.log(myId, 'escaramuza', '🎁 Botín de escaramuza: ' + (it ? it.nombre : 'un objeto'));
      } catch (e) { toast((e && e.message) || 'No se pudo recoger'); await HacEscaramuzas.reload(); }
      finally { escBusy = false; renderEscaramuzas(); if (charId) buildCharPanel(charId); }
    }
    // Deadline del botín (loot_hasta): si no elegiste a tiempo, tu cliente coge por ti
    // una ranura libre al azar (garantiza ≥1 y evita que la banda quede colgada).
    async function autoClaimBotinSiToca() {
      if (escBusy || !myId || !window.HacEscaramuzas) return;
      const band = HacEscaramuzas.miBanda(h.id, myId);
      if (!band || band.estado !== 'botin' || !band.lootHasta || clock() < band.lootHasta) return;
      const elec = band.elecciones || {};
      if (Object.prototype.hasOwnProperty.call(elec, myId)) return;      // ya recogí
      const taken = new Set(Object.values(elec).map(Number));
      const libres = (band.botin || []).map((_, i) => i).filter(i => !taken.has(i));
      if (!libres.length) return;
      const slot = libres[Math.floor(Math.random() * libres.length)], itemId = band.botin[slot];
      escBusy = true;
      try {
        await HacEscaramuzas.reclamar(band.id, myId, slot);              // reclama sí o sí (venció el plazo)
        if (itemId && window.HacStats && HacStats.darItem) HacStats.darItem(myId, itemId);
        const it = window.HacTienda && HacTienda.get(itemId);
        toast('🎁 Reparto automático: ' + (it ? it.nombre : 'un objeto'));
        if (window.HacBitacora) HacBitacora.log(myId, 'escaramuza', '🎁 Botín repartido: ' + (it ? it.nombre : 'un objeto'));
      } catch (e) { await HacEscaramuzas.reload(); }
      finally { escBusy = false; if (charId) buildCharPanel(charId); if (escVisible) renderEscaramuzas(); }
    }
    // Registra en la bitácora el resultado de MI escaramuza (una sola vez, por banda).
    function logEscaramuzaResultado() {
      if (!myId || !window.HacBitacora || !window.HacEscaramuzas) return;
      const band = HacEscaramuzas.miBanda(h.id, myId);
      if (!band) return;
      if (esPereg(band)) {
        if (band.exito === true && band.estado === 'resuelta')
          HacBitacora.log(myId, 'escaramuza', '⛰ Peregrinaje: ✔ hallasteis al gran sabio · heridas curadas', { clave: 'per-res:' + band.id });
        else if (band.exito === false && band.estado === 'resuelta')
          HacBitacora.log(myId, 'escaramuza', '⛰ Peregrinaje: ✘ el camino se torció · secuela permanente', { clave: 'per-res:' + band.id });
        else if (band.estado === 'abortando')
          HacBitacora.log(myId, 'escaramuza', '↩ Peregrinaje abandonado · el grupo regresa', { clave: 'per-abort:' + band.id });
        return;
      }
      // Reto semanal: cuenta la escaramuza al RESOLVERSE (éxito o fracaso, no al abortar),
      // una sola vez por banda (la clave de bitácora hace de señal «ya registrada»).
      const yaRegEsc = HacBitacora.listar && HacBitacora.listar(myId, 300).some(e => e.clave === 'esc-res:' + band.id);
      if (!yaRegEsc && ((band.exito === true && (band.estado === 'botin' || band.estado === 'resuelta')) || (band.exito === false && band.estado === 'resuelta'))) retoAdd('escaramuzas', 1);
      // Éxito: se registra tanto en 'botin' (botín pendiente) como en 'resuelta' (ya
      // repartido) — antes solo en 'botin', y se perdía si volvías tras cerrarse el reparto.
      const suf = '';
      if (band.exito === true && (band.estado === 'botin' || band.estado === 'resuelta'))
        HacBitacora.log(myId, 'escaramuza', '⚔ Escaramuza: ✔ éxito · volvisteis con botín' + suf, { clave: 'esc-res:' + band.id });
      else if (band.exito === false && band.estado === 'resuelta')
        HacBitacora.log(myId, 'escaramuza', '⚔ Escaramuza: ✘ fracaso · tu mecenas vuelve herido' + suf, { clave: 'esc-res:' + band.id });
      else if (band.estado === 'abortando')
        HacBitacora.log(myId, 'escaramuza', '↩ Escaramuza abortada · la banda regresa', { clave: 'esc-abort:' + band.id });
    }

    // ── RELACIONES entre mecenas (afinidad + vínculos que brotan al azar) ──────
    const nombreDe = (id) => { const m = (h.miembros || []).find(x => x.personajeId === id); return (m && m.nombre) || 'un mecenas'; };
    const relKey = (r) => r.a + '|' + r.b;
    let _relBusy = false;
    // Al resolver MI escaramuza: sube la afinidad de cada par y tira (prob. baja,
    // AL AZAR) por si brota un vínculo nombrado. Determinista (HacRand por band.id+par)
    // → todos los clientes computan igual; la RPC es idempotente (flag en la banda).
    function procesarRelacionesSiToca() {
      if (_relBusy || !myId || !window.HacEscaramuzas || !window.HacRelaciones || !window.HacRand) return;
      const band = HacEscaramuzas.miBanda(h.id, myId);
      if (!band || band.relacionesHechas) return;
      if (band.estado !== 'botin' && band.estado !== 'resuelta') return;
      const ids = (band.miembros || []).map(m => m.id).filter(Boolean);
      if (ids.length < 2) return;
      const exito = band.exito === true;
      const TIPOS = ['hermandad', 'rivalidad', 'odio', 'amor'];
      const SUBS = { hermandad: ['jurada', 'prometida'], rivalidad: ['competitiva', 'envidiosa'], odio: ['unilateral', 'reciproco'], amor: ['unilateral', 'reciproco'] };
      const prob = ESC_FAST ? 0.85 : 0.02;   // "muy muy baja" en real; alta en modo test
      const afin = [], forjas = [];
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        const p = HacRelaciones.par(ids[i], ids[j]), a = p[0], b = p[1];
        afin.push({ a: a, b: b, d: exito ? 2 : 1 });
        const rel = HacRelaciones.get(h.id, a, b);
        if (rel && rel.tipo) continue;                       // ya tienen vínculo
        const R = HacRand.make('rel#' + band.id + '#' + a + '#' + b);
        if (R.next() >= prob) continue;
        const tipo = TIPOS[R.int(4)], subtipo = SUBS[tipo][R.int(2)];
        const origen = ((tipo === 'odio' || tipo === 'amor') && subtipo === 'unilateral') ? [a, b][R.int(2)] : '';
        forjas.push({ a: a, b: b, tipo: tipo, subtipo: subtipo, origen: origen });
      }
      _relBusy = true;
      HacRelaciones.procesar(band.id, h.id, clock(), afin, forjas)
        .then(() => HacRelaciones.reload()).then(() => notifyRelacionesNuevas())
        .catch(e => console.warn('[relaciones] procesar', e && e.message || e))
        .finally(() => { _relBusy = false; });
    }
    // Detecta vínculos NUEVOS que me implican y los anuncia (carta + bitácora). En la
    // primera pasada solo marca los existentes (no re-anuncia lo de sesiones previas).
    const _relSeen = new Set(); let _relSeenInit = false;
    function notifyRelacionesNuevas() {
      if (!myId || !window.HacRelaciones) return;
      const mine = HacRelaciones.deMiembro(h.id, myId);
      if (!_relSeenInit) { mine.forEach(x => _relSeen.add(relKey(x.rel))); _relSeenInit = true; return; }
      mine.forEach(x => {
        const k = relKey(x.rel); if (_relSeen.has(k)) return; _relSeen.add(k);
        mostrarRelacionForjada(x.rel, x.otro);
        if (window.HacBitacora) HacBitacora.log(myId, 'progreso', `縁 ${HacRelaciones.etiqueta(x.rel)} con ${nombreDe(x.otro)}`, { clave: 'rel:' + k });
      });
    }
    let relEl = null;
    function ensureRelEl() {
      if (relEl) return relEl;
      relEl = document.createElement('div'); relEl.className = 'hacp-suc-ov hacp-rel-ov'; relEl.hidden = true; document.body.appendChild(relEl);
      ['pointerdown', 'pointerup', 'wheel', 'click'].forEach(ev => relEl.addEventListener(ev, e => e.stopPropagation(), { passive: false }));
      return relEl;
    }
    function mostrarRelacionForjada(rel, otro) {
      const d = HacRelaciones.defTipo(rel.tipo); if (!d) return;
      const sub = d.subs[rel.subtipo] || {};
      const dirTxt = (d.dir && rel.subtipo === 'unilateral')
        ? (rel.origen === myId ? ' · lo sientes tú' : ` · lo siente ${esc(nombreDe(otro))}`) : '';
      const el = ensureRelEl(); el.hidden = false;
      el.innerHTML = `<div class="hacp-suc-box hacp-rel-box rel-${d.cls}">
        <div class="hacp-suc-eyebrow">縁 Se ha forjado un vínculo</div>
        <div class="hacp-rel-glyph">${d.zh}</div>
        <div class="hacp-suc-ttl">${esc(d.nombre)}${sub.nombre ? ' ' + esc(sub.nombre) : ''}</div>
        <div class="hacp-suc-eff">Entre <b>${esc(nombreDe(myId))}</b> y <b>${esc(nombreDe(otro))}</b>${dirTxt}</div>
        <button type="button" class="hacp-cp-btn hacp-suc-done" data-rel-done>Continuar</button></div>`;
      el.querySelector('[data-rel-done]').addEventListener('click', () => { el.hidden = true; });
    }
    // Sección "Relaciones" del panel del personaje (vínculos nombrados de mi mecenas).
    function relacionesHTML() {
      if (!window.HacRelaciones || !myId) return '';
      const mine = HacRelaciones.deMiembro(h.id, myId);
      if (!mine.length) return '';
      const rows = mine.map(x => {
        const d = HacRelaciones.defTipo(x.rel.tipo) || {}; const sub = (d.subs && d.subs[x.rel.subtipo]) || {};
        const dir = (d.dir && x.rel.subtipo === 'unilateral') ? (x.rel.origen === myId ? '→' : '←') : '';
        return `<div class="hacp-rel-row rel-${d.cls || ''}"><span class="hacp-rel-zh">${esc(d.zh || '')}</span><span class="hacp-rel-nm">${esc(nombreDe(x.otro))}</span><span class="hacp-rel-sub">${esc(d.nombre || '')} ${esc(sub.nombre || '')} ${dir}</span></div>`;
      }).join('');
      return `<div class="hacp-cargos hacp-rels"><div class="hacp-cargos-h">縁 Relaciones</div>${rows}</div>`;
    }
    function escTick() {
      const el = escHost && escHost.querySelector('[data-esc-timer]'); if (!el) return;
      const fin = +el.dataset.escTimer || 0, rem = Math.max(0, fin - clock());
      el.textContent = rem > 0 ? ('🧭 Regreso en ' + fmtClock(rem / 1000)) : '✔ Han regresado · reparto pendiente';
    }
    // ── Escena animada: la banda MARCHA junta por un camino empedrado ──────────
    // Se muestra en el panel mientras la escaramuza está 'en_curso' o 'abortando'.
    // Suelo isométrico (loseta anim-ground.png) que se desplaza + N mecenas
    // andando con su ciclo de HacChar. RAF vivo solo mientras el lienzo existe.
    let marchGrass = null, marchSoil = null, marchCanvas = null, marchRAF = 0;
    function stopMarch() { marchCanvas = null; if (marchRAF) { cancelAnimationFrame(marchRAF); marchRAF = 0; } }
    function startMarch(cv, band) {
      stopMarch();
      const ctx = cv && cv.getContext && cv.getContext('2d'); if (!ctx) return;
      // Suelo: pradera de hierba con un CAMINO de tierra batida por el centro (los mecenas
      // marchan por el camino). Tiles iso 144×72 de la finca (grass/soil).
      if (!marchGrass) { marchGrass = new Image(); marchGrass.src = 'assets/img/iso/floor/grass.png'; }
      if (!marchSoil) { marchSoil = new Image(); marchSoil.src = 'assets/img/iso/floor/soil.png'; }
      const back = cv.hasAttribute('data-back');          // 'abortando' → desanda el camino
      const FR = (window.HacChar && HacChar.FRAMES) || 4;
      const dir = back ? 'NW' : 'SE';                     // ida de cara (SE), vuelta de espaldas (NW)
      const pereg = esPereg(band);
      const members = (band.miembros || []).map(m => {
        const pj = (window.HacPersonajes && HacPersonajes.get) ? HacPersonajes.get(m.id) : null;
        const sec = (window.HacStats && HacStats.secuelas) ? HacStats.secuelas(m.id) : [];
        const base = pj ? (pj.aspecto || {}) : { robe: color };
        return { id: m.id, aptitud: pj ? pj.aptitud : '', aspecto: (window.HacStats && HacStats.vestir) ? HacStats.vestir(m.id, base) : base, mio: m.id === myId, hurt: pereg && m.id === band.hostId, secuelas: sec };
      });
      const sprCache = new Map();
      function spr(mem, frame) {
        const key = mem.id + '|' + frame;
        let c = sprCache.get(key);
        if (!c && window.HacChar) { c = document.createElement('canvas'); HacChar.draw(c, { aptitud: mem.aptitud, aspecto: mem.aspecto || {}, dir: dir, frame: frame, scale: 2, pose: mem.hurt ? 'limp' : undefined, secuelas: mem.secuelas }); sprCache.set(key, c); }
        return c;
      }
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const CH = 132;
      function fit() { const w = cv.clientWidth || 300; cv.width = Math.round(w * dpr); cv.height = Math.round(CH * dpr); }
      fit();
      let t0 = 0;
      marchCanvas = cv;
      const wrap = (v, m) => v - Math.floor(v / m) * m;
      function frameLoop(ts) {
        if (marchCanvas !== cv) return;                   // lienzo reemplazado → corta
        if (!t0) t0 = ts; const t = ts - t0;
        const w = cv.clientWidth || 300, hh = CH;
        if (Math.round(w * dpr) !== cv.width) fit();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // Fondo: cielo crepuscular hacia tierra.
        const sky = ctx.createLinearGradient(0, 0, 0, hh);
        sky.addColorStop(0, back ? '#20242c' : '#33342a'); sky.addColorStop(0.55, '#26251d'); sky.addColorStop(1, '#171410');
        ctx.fillStyle = sky; ctx.fillRect(0, 0, w, hh);
        // Suelo isométrico desplazándose (ida: NO ; vuelta: SE). Hierba en toda la pradera
        // y CAMINO de tierra batida en una franja central (donde marcha la tropa).
        const gr = marchGrass, so = marchSoil;
        if (gr && gr.complete && gr.width) {
          const gs = 0.72, tw = gr.width * gs, th = gr.height * gs, faceH = tw / 2;
          const stepX = tw / 2, stepY = faceH / 2, px = 2 * stepX, py = 2 * stepY;
          const sp = back ? 1 : -1;                       // dirección del desplazamiento del suelo
          const driftX = sp * 34 * (t / 1000), driftY = sp * 17 * (t / 1000);
          const X0 = wrap(driftX, px) - px, Y0 = wrap(driftY, py) - py;
          const ox = w / 2, oy = hh * 0.60;
          // El camino es una DIAGONAL RECTA alineada con el eje de marcha (el mismo por el que
          // se desplaza el suelo): las tiles con |n−p|≤ROAD forman una banda de tierra centrada
          // en pantalla (el centro siempre cae en n−p=0), con bordes limpios de rombo.
          const ROAD = 2, roadOK = so && so.complete && so.width;
          ctx.imageSmoothingEnabled = true;
          const nHalf = Math.ceil((w / 2 + tw) / stepX) + 2, pTop = Math.ceil((oy + th) / stepY) + 2, pBot = Math.ceil((hh - oy + th) / stepY) + 2;
          for (let p = -pTop; p <= pBot; p++) {
            for (let n = -nHalf; n <= nHalf; n++) {
              if ((n + p) & 1) continue;                  // misma paridad → rejilla iso
              const cx = ox + X0 + n * stepX, cy = oy + Y0 + p * stepY;
              if (cx < -tw || cx > w + tw || cy < -th || cy > hh + th) continue;
              const img = (roadOK && Math.abs(n - p) <= ROAD) ? so : gr;
              ctx.drawImage(img, 0, 0, img.width, img.height, cx - tw / 2, cy - faceH / 2, tw, th);
            }
          }
          // Bruma en los bordes para fundir el suelo con el fondo.
          const fade = ctx.createLinearGradient(0, hh * 0.42, 0, hh * 0.70);
          fade.addColorStop(0, 'rgba(38,37,29,0.85)'); fade.addColorStop(1, 'rgba(38,37,29,0)');
          ctx.fillStyle = fade; ctx.fillRect(0, 0, w, hh);
        }
        // Mecenas caminando juntos: fila suelta, con desfase de zancada y balanceo.
        ctx.imageSmoothingEnabled = false;
        const n = members.length, spread = Math.min(40, (w - 40) / Math.max(1, n));
        const baseX = w / 2 - (n - 1) * spread / 2, baseY = hh * 0.58, drawH = 60;
        const items = members.map((mem, i) => {
          const ph = t / 1000 + i * 0.53;
          return { mem, i, x: baseX + i * spread + Math.sin(t / 900 + i) * 1.5, y: baseY + (i % 2 ? 6 : 0) + Math.sin(t / 380 + i * 1.7) * 1.2, fr: Math.floor((t / 145 + i * 1.9)) % FR, ph };
        }).sort((a, b) => a.y - b.y);
        items.forEach(({ mem, x, y, fr }) => {
          const s = spr(mem, fr); if (!s) return;
          const sh = drawH, sw = s.width * (sh / s.height);
          ctx.save(); ctx.globalAlpha = 0.26; ctx.fillStyle = '#000';
          ctx.beginPath(); ctx.ellipse(x, y + 1, sw * 0.30, 4.5, 0, 0, 6.283); ctx.fill(); ctx.restore();
          if (mem.mio) { ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = '#e7c66a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(x, y + 1, sw * 0.32, 5.2, 0, 0, 6.283); ctx.stroke(); ctx.restore(); }
          ctx.drawImage(s, x - sw / 2, y - sh, sw, sh);
        });
        marchRAF = requestAnimationFrame(frameLoop);
      }
      marchRAF = requestAnimationFrame(frameLoop);
    }

    // Refresco por poll: re-renderiza solo si cambió algo (la recarga la hace el poll
    // principal justo antes). Evita el churn que rompe la interacción.
    function escRefresh() {
      if (!escVisible || !window.HacEscaramuzas) return;
      const sig = JSON.stringify((HacEscaramuzas.all(h.id) || []).map(b => [b.id, b.estado, (b.miembros || []).length, Object.keys(b.elecciones || {}).length, b.reservaciones || {}, Object.keys(b.resultados || {}).length]));
      if (sig !== escSig) { escSig = sig; renderEscaramuzas(); }
    }
    // ESCRITORIO: overlay (botón ⚔ Escaramuzas del panel del personaje).
    let escEl = null;
    function ensureEscEl() {
      if (escEl) return escEl;
      escEl = document.createElement('div'); escEl.className = 'hacp-shop hacp-esc-ov'; escEl.hidden = true;
      vp.appendChild(escEl);
      ['pointerdown', 'pointerup', 'wheel', 'click'].forEach(ev => escEl.addEventListener(ev, (e) => e.stopPropagation(), { passive: false }));
      escEl.addEventListener('click', (e) => { if (e.target === escEl) closeEsc(); });
      return escEl;
    }
    function openEscOverlay() {
      if (!myId) return;
      const el = ensureEscEl();
      el.innerHTML = `<div class="hacp-shop-box"><button type="button" class="hacp-shop-x" data-esc-x aria-label="Cerrar">✕</button><div class="hacp-esc" data-esc-body></div></div>`;
      el.querySelector('[data-esc-x]').addEventListener('click', closeEsc);
      escHost = el.querySelector('[data-esc-body]'); escVisible = true; escSig = ''; el.hidden = false;
      if (window.HacEscaramuzas) HacEscaramuzas.reload().then(renderEscaramuzas); else renderEscaramuzas();
    }
    function closeEsc() { escVisible = false; stopMarch(); if (escEl) escEl.hidden = true; }

    // ── BITÁCORA (diario del mecenas): overlay con el feed de actividad ────────
    function fmtHora(ts) { try { return new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
    const diaKey = (ts) => { const d = new Date(ts); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); };
    let bitEl = null;
    function ensureBitEl() {
      if (bitEl) return bitEl;
      bitEl = document.createElement('div'); bitEl.className = 'hacp-shop hacp-bit-ov'; bitEl.hidden = true;
      overlayHost().appendChild(bitEl);
      ['pointerdown', 'pointerup', 'wheel', 'click'].forEach(ev => bitEl.addEventListener(ev, (e) => e.stopPropagation(), { passive: false }));
      bitEl.addEventListener('click', (e) => { if (e.target === bitEl) bitEl.hidden = true; });
      return bitEl;
    }
    function renderBitacora() {
      const el = ensureBitEl();
      const dbOk = !!(window.HacBitacora && HacBitacora.dbOk && HacBitacora.dbOk());
      const all = (window.HacBitacora && myId) ? HacBitacora.listar(myId, 200) : [];
      const hoy = diaKey(clock()), ayer = diaKey(clock() - 86400000);
      const g = { hoy: [], ayer: [], prev: [] };
      all.forEach(e => { const k = diaKey(e.ts); if (k === hoy) g.hoy.push(e); else if (k === ayer) g.ayer.push(e); else g.prev.push(e); });
      // La CONVOCATORIA de esta semana (sin reclamar) lleva un botón de acción: caminar
      // al salón («Ir a hablar») o, ya en el salón, «Ver audiencia».
      const semConv = window.HacRetos ? ('reto-conv:' + HacRetos.semanaStr()) : '';
      const convActiva = window.HacRetos && HacRetos.progreso(h.id).estado === 'convocado';
      const rowsOf = (arr) => arr.map(e => {
        let act = '';
        if (e.tipo === 'convocatoria' && e.clave === semConv && convActiva) {
          act = _audienciaLista
            ? `<button type="button" class="hacp-cp-btn hacp-bit-act" data-aud-go>Ver audiencia</button>`
            : `<button type="button" class="hacp-cp-btn hacp-bit-act" data-hablar>Ir a hablar con ${esc(fundadorNombre())}</button>`;
        }
        return `<div class="hacp-bit-row t-${esc(e.tipo)}"><span class="hacp-bit-when">${fmtHora(e.ts)}</span><span class="hacp-bit-txt">${esc(e.texto)}${act}</span></div>`;
      }).join('');
      let body = '';
      if (g.hoy.length) body += `<div class="hacp-bit-day">Hoy</div>` + rowsOf(g.hoy);
      if (g.ayer.length) body += `<div class="hacp-bit-day">Ayer</div>` + rowsOf(g.ayer);
      // Si no hay nada reciente pero SÍ hay historial, muéstralo (evita ver "nada"
      // teniendo registro; tu actividad puede ser de hace más de un día).
      if (!g.hoy.length && !g.ayer.length && g.prev.length) body += `<div class="hacp-bit-day">Anteriores</div>` + rowsOf(g.prev.slice(0, 40));
      if (!body) body = dbOk
        ? '<div class="hacp-inv-note">Aún no hay actividad registrada. Manda a tu mecenas a una misión o escaramuza y su parte quedará aquí.</div>'
        : '<div class="hacp-inv-note">La bitácora no está disponible ahora mismo (reintenta en un momento).</div>';
      el.innerHTML = `<div class="hacp-shop-box">
        <button type="button" class="hacp-shop-x" data-bit-x aria-label="Cerrar">✕</button>
        <div class="hacp-shop-h"><span class="hacp-shop-zh">錄</span> Bitácora</div>
        <div class="hacp-shop-sub">Lo que ha hecho tu mecenas · hoy y ayer.</div>
        <div class="hacp-bit-list">${body}</div></div>`;
      el.querySelector('[data-bit-x]').addEventListener('click', () => { el.hidden = true; });
      const hb = el.querySelector('[data-hablar]'); if (hb) hb.addEventListener('click', irAHablar);
      const ab = el.querySelector('[data-aud-go]'); if (ab) ab.addEventListener('click', playAudiencia);
    }
    function openBitacora() {
      if (!myId) return;
      const el = ensureBitEl(); el.hidden = false; renderBitacora();
      if (window.HacBitacora) HacBitacora.reload().then(() => { if (!el.hidden) renderBitacora(); });
    }

    // ══════════════ RETOS SEMANALES + audiencia con el señor ═══════════════════
    // Al cumplir las 4 metas de la semana, el señor de la casa te convoca (bitácora
    // parpadea + evento resaltado); vas a hablar con él → tu mecenas camina al Salón
    // Principal → cinemática de audiencia → «Recompensa semanal» a tu mochila.
    let _audienciaLista = false;   // el mecenas ya llegó al salón → toca la audiencia
    // Localiza el Salón Principal (正殿 o su mejora) para caminar hasta él.
    function salonBid() {
      const cons = (h.mapa && h.mapa.construcciones) || [];
      let best = null, bestR = -1;
      cons.forEach(c => {
        const t = (window.HacBuild && HacBuild.tipo) ? HacBuild.tipo(c.tipo) : null;
        if (!t || !t.principal || !c.pos) return;
        const rango = (c.tipo === 'salon') ? 100 : (t.rango || 1);   // prefiere el 正殿 (edificio principal por defecto)
        if (rango > bestR) { bestR = rango; best = c; }
      });
      return best ? (best.pos[0] + ',' + best.pos[1]) : null;
    }
    function pulseBitacora(on) {
      const log = charEl ? charEl.querySelector('[data-act="log"]') : null; if (log) log.classList.toggle('pulse', !!on);
      const mlog = mobar ? mobar.querySelector('.hacp-mo-log') : null; if (mlog) mlog.classList.toggle('pulse', !!on);
    }
    function pulseRetos(on) {
      const t = charEl ? charEl.querySelector('.hacp-cp-retos') : null; if (t) t.classList.toggle('pulse', !!on);
      const m = mobar ? mobar.querySelector('.hacp-mo-retos') : null; if (m) m.classList.toggle('pulse', !!on);
    }
    // Reaplica el parpadeo (bitácora + retos) tras re-renderizar el panel; no registra nada.
    function refreshRetoPulses() {
      if (!window.HacRetos || !myId) return;
      const p = HacRetos.progreso(h.id), avisa = HacRetos.completos(h.id) && p.estado !== 'reclamado';
      pulseRetos(avisa); pulseBitacora(avisa);
    }
    // Suma a un reto semanal y comprueba si el señor debe convocarte (idempotente).
    function retoAdd(campo, n) {
      if (!window.HacRetos || !myId) return;
      HacRetos.add(h.id, campo, n).then(() => { checkConvocatoria(); if (boardEl && !boardEl.hidden) buildBoard(); });
    }
    // ¿Cumplidos los 4? → convoca: evento resaltado en bitácora + parpadeo. Dedup por semana.
    function checkConvocatoria() {
      if (!window.HacRetos || !myId) { return; }
      const comp = HacRetos.completos(h.id);
      pulseRetos(comp && HacRetos.progreso(h.id).estado !== 'reclamado');
      if (!comp) { pulseBitacora(false); return; }
      const p = HacRetos.progreso(h.id);
      if (p.estado === 'reclamado') { pulseBitacora(false); return; }
      if (p.estado === 'curso') HacRetos.marcar(h.id, 'convocado');
      if (window.HacBitacora) HacBitacora.log(myId, 'convocatoria', `🏯 ${fundadorNombre()} quiere hablar contigo · has cumplido tus retos de la semana`, { clave: 'reto-conv:' + HacRetos.semanaStr() });
      pulseBitacora(true);
      if (bitEl && !bitEl.hidden) renderBitacora();
    }
    // «Ir a hablar»: el mecenas CAMINA al salón; al llegar, la bitácora parpadea y se
    // ofrece «Ver audiencia». Sin salón construido: audiencia directa (fallback).
    function irAHablar() {
      const bid = salonBid(), fund = fundadorNombre();
      if (!bid || !window.HacFolk || !HacFolk.goHome) { playAudiencia(); return; }
      const arrive = () => { _audienciaLista = true; pulseBitacora(true); if (bitEl && !bitEl.hidden) renderBitacora(); toast(`🏯 Estás ante ${fund} · abre la bitácora para la audiencia`); };
      const r = HacFolk.goHome(myId, bid, arrive);
      if (r === false) { toast('Tu mecenas está ocupado ahora mismo'); return; }
      if (r === 'now') { playAudiencia(); return; }     // ya estaba en el salón (arrive ya corrió)
      if (bitEl) bitEl.hidden = true;
      if (HacFolk.select) HacFolk.select(myId);
      if (cam && cam.focusFollow) cam.focusFollow(() => HacFolk.position(myId), 3.0);
      toast(`🚶 Vas a ver a ${fund}…`);
    }
    // Cinemática de audiencia (reutiliza el overlay de encuentro y el motor HacEncAnim).
    function playAudiencia() {
      const fund = fundadorNombre(), fundId = h.mapa && h.mapa.fundador;
      const lord = (fundId && typeof escAnimActor === 'function') ? escAnimActor(fundId, false) : null;
      const el = ensureSucEl(); el.hidden = false;
      el.innerHTML = `<div class="hacp-suc-box hacp-enc-box">
        <div class="hacp-suc-eyebrow">🏯 Audiencia · ${esc(fund)}</div>
        <div class="hacp-suc-ttl">Ante tu señor</div>
        <canvas class="hacp-enc-anim" data-aud-cv></canvas>
        <div class="hacp-enc-result" data-aud-result hidden>
          <div class="hacp-suc-verdict ok">🎁 Recompensa semanal</div>
          <div class="hacp-suc-eff">${esc(fund)} te entrega un presente. Está en tu mochila: <b>ábrelo</b> para +10% de XP en tus tres aptitudes, o guárdalo.</div>
        </div>
        <button type="button" class="hacp-cp-btn hacp-suc-done" data-aud-done>Continuar</button></div>`;
      const cv = el.querySelector('[data-aud-cv]'), resEl = el.querySelector('[data-aud-result]');
      let entregado = false;
      const entregar = () => {
        if (entregado) return;
        const rr = window.HacStats ? HacStats.darItem(myId, 'recompensa-semanal') : { ok: true };
        if (rr && rr.ok === false) { toast('🎒 Mochila llena · haz hueco y vuelve a hablar con tu señor'); return; }   // no marca: permite reintento
        entregado = true;
        if (resEl && resEl.hidden) { resEl.hidden = false; resEl.classList.add('show'); }
        HacRetos.marcar(h.id, 'reclamado');
        if (window.HacBitacora) HacBitacora.log(myId, 'convocatoria', `🎁 ${fund} te entregó la recompensa semanal`, { clave: 'reto-rew:' + HacRetos.semanaStr() });
        pulseBitacora(false); pulseRetos(false); _audienciaLista = false;
        if (charId) buildCharPanel(charId);
      };
      if (encReportAnim) { encReportAnim.stop(); encReportAnim = null; }
      if (window.HacEncAnim && cv) {
        const hero = escAnimActor(myId, true);
        requestAnimationFrame(() => { encReportAnim = HacEncAnim.play(cv, { scene: 'audiencia', ok: true, hero: hero, lord: lord, onEnd: entregar }); });
        cv.addEventListener('click', () => { if (encReportAnim) encReportAnim.stop(); entregar(); });
      } else { entregar(); }
      el.querySelector('[data-aud-done]').addEventListener('click', () => { if (encReportAnim) { encReportAnim.stop(); encReportAnim = null; } entregar(); el.hidden = true; if (bitEl && !bitEl.hidden) renderBitacora(); });
    }
    // ── Franja de RETOS SEMANALES (a la vista, dentro del Tablón de misiones) ───
    // Se pinta en la cabecera del tablón. Preparada para alojar también, más
    // adelante, las «misiones diarias» (otra franja análoga encima o debajo).
    const RETO_DEFS = [
      { k: 'prestigio', ic: '★', nom: 'Ganar prestigio', c: '#e7c66a' },
      { k: 'misiones', ic: '🧭', nom: 'Completar misiones del tablón', c: '#e0b85a' },
      { k: 'escaramuzas', ic: '⚔', nom: 'Completar escaramuzas', c: '#e0907a' },
      { k: 'encuentros', ic: '⚑', nom: 'Superar encuentros', c: '#7fc99a' },
    ];
    function retosStripHTML() {
      if (!window.HacRetos) return '';
      const p = HacRetos.progreso(h.id), M = HacRetos.METAS, comp = HacRetos.completos(h.id), fund = fundadorNombre();
      const chips = RETO_DEFS.map(m => {
        const cur = Math.min(M[m.k], p[m.k] || 0), pct = Math.round(cur / M[m.k] * 100), done = cur >= M[m.k];
        return `<div class="hacp-retochip${done ? ' done' : ''}" title="${esc(m.nom)}: ${cur}/${M[m.k]}">
          <span class="hacp-retochip-h"><span class="hacp-retochip-ic">${m.ic}</span><b>${cur}<span>/${M[m.k]}</span></b>${done ? '<em>✔</em>' : ''}</span>
          <i class="hacp-retochip-bar"><b style="width:${pct}%;background:${m.c}"></b></i>
        </div>`;
      }).join('');
      const estado = comp
        ? (p.estado === 'reclamado'
          ? `<div class="hacp-board-retos-st ok">✔ Recompensa recibida · vuelve el lunes.</div>`
          : `<div class="hacp-board-retos-st hot">🏯 ¡Cumplidos! <b>${esc(fund)}</b> te espera — abre la <b>bitácora</b>.</div>`)
        : '';
      return `<div class="hacp-board-retos${comp && p.estado !== 'reclamado' ? ' hot' : ''}">
        <div class="hacp-board-retos-h">週 Retos de la semana <span>· los cuatro → +10% XP en tus tres aptitudes</span></div>
        <div class="hacp-board-retos-row">${chips}</div>
        ${estado}
      </div>`;
    }
    // Abre la «Recompensa semanal» de la mochila → +10% XP en las tres aptitudes.
    function abrirRecompensaUI(id) {
      if (!myId || !window.HacStats || !HacStats.abrirRecompensaSemanal) return;
      const res = HacStats.abrirRecompensaSemanal(myId);
      if (!res.ok) { toast(res.motivo || 'No se pudo abrir'); return; }
      const g = res.ganado || {}, parts = Object.keys(g).filter(d => g[d] > 0).map(d => `+${g[d]} ${DOM_GLYPH[d] || ''}`.trim());
      toast(`🎁 Recompensa abierta · ${parts.join(' · ')} XP`);
      if (window.HacBitacora) HacBitacora.log(myId, 'progreso', `🎁 Abriste la recompensa semanal de tu señor · ${parts.join(' · ')} XP`);
      if (charId) buildCharPanel(charId);
    }

    // ── SENDAS (talentos): overlay con el árbol de la aptitud militar (C1) ─────
    let sendasEl = null;
    function ensureSendasEl() {
      if (sendasEl) return sendasEl;
      sendasEl = document.createElement('div'); sendasEl.className = 'hacp-shop hacp-sendas-ov'; sendasEl.hidden = true; overlayHost().appendChild(sendasEl);
      ['pointerdown', 'pointerup', 'wheel', 'click'].forEach(ev => sendasEl.addEventListener(ev, (e) => e.stopPropagation(), { passive: false }));
      sendasEl.addEventListener('click', (e) => { if (e.target === sendasEl) sendasEl.hidden = true; });
      return sendasEl;
    }
    const SENDA_CLS = { militar: 'mil', cultural: 'cul', administrativo: 'adm' };
    function renderSendas() {
      if (!myId || !window.HacSendas || !window.HacStats) return;
      const el = ensureSendasEl();
      const libres = HacStats.puntosLibres(myId), total = HacStats.puntosTalento(myId), tot = HacStats.nivelPersonaje(myId);
      const cols = HacSendas.arboles().map(arb => {
        const lvl = HacStats.nivel(myId, arb.dom);
        const nodes = arb.rungs.map(t => {
          const owned = HacStats.tieneTalento(myId, t.id), elig = HacSendas.elegible(myId, t.id);
          let cls = 'locked', estado;
          if (owned) { cls = 'owned'; estado = '✓ aprendido'; }
          else if (elig) { cls = 'elig'; estado = 'Aprender · 1 pt'; }
          else if (!t.activo) { cls = 'soon'; estado = 'próximamente'; }
          else {
            const f = [];
            if (lvl < t.req) f.push(`${arb.zh} ${lvl}/${t.req}`);
            if (t.reqTotal && tot < t.reqTotal) f.push(`nivel ${tot}/${t.reqTotal}`);
            if (t.prev && !HacStats.tieneTalento(myId, t.prev)) f.push('requiere el anterior');
            if (!f.length && libres < 1) f.push('sin puntos');
            estado = f.join(' · ');
          }
          return `<div class="hacp-senda-node n-${cls}"${elig ? ` data-aprender="${esc(t.id)}"` : ''}>
            <div class="hacp-senda-orb">${t.zh}</div>
            <div class="hacp-senda-info"><div class="hacp-senda-nm">${esc(t.nombre)}</div>
              <div class="hacp-senda-ef">${esc(t.efecto)}</div>
              <div class="hacp-senda-state">${esc(estado)}</div></div></div>`;
        }).join('');
        return `<div class="hacp-senda-col dom-${SENDA_CLS[arb.dom]}">
          <div class="hacp-senda-colh"><span class="hacp-senda-colzh">${arb.zh}</span>
            <span class="hacp-senda-colnm">${esc(arb.nombre)}</span><span class="hacp-senda-collv">nivel ${lvl}</span></div>
          <div class="hacp-senda-nodes">${nodes}</div></div>`;
      }).join('');
      el.innerHTML = `<div class="hacp-shop-box hacp-sendas-box"><button type="button" class="hacp-shop-x" data-sendas-x aria-label="Cerrar">✕</button>
        <div class="hacp-shop-h"><span class="hacp-shop-zh">道</span> Sendas de aptitud</div>
        <div class="hacp-shop-sub">Talentos: <b>${libres}</b> puntos libres de ${total} · 1 punto por cada 8 niveles subidos</div>
        <div class="hacp-sendas-cols">${cols}</div></div>`;
      el.querySelector('[data-sendas-x]').addEventListener('click', () => { el.hidden = true; });
      el.querySelectorAll('[data-aprender]').forEach(b => b.addEventListener('click', () => aprenderTalento(b.dataset.aprender)));
    }
    function aprenderTalento(id) {
      const t = window.HacSendas && HacSendas.talento(id);
      if (!t || !HacSendas.elegible(myId, id)) return;
      if (!confirm(`¿Aprender ${t.zh} ${t.nombre}? Gastarás 1 punto de talento.`)) return;
      HacStats.aprenderTalento(myId, t.dom, id);
      toast(`道 Talento aprendido: ${t.zh} ${t.nombre}`);
      if (window.HacBitacora) HacBitacora.log(myId, 'progreso', `道 Aprendiste ${t.zh} ${t.nombre}`, { clave: 'talento:' + myId + ':' + id });
      renderSendas(); if (charId) buildCharPanel(charId);
    }
    function openSendas() { if (!myId) return; const el = ensureSendasEl(); el.hidden = false; renderSendas(); }
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
      let exped = false, escaramuza = false;
      if (id === myId && window.HacOrdenes) {
        const o = HacOrdenes.mine(h.id, id);
        if (o && o.tipo === 'expedicion') {
          exped = true;
          escaramuza = String(o.targetId || '').indexOf('escaramuza:') === 0;   // expedición cooperativa
          rest = Math.max(0, Math.ceil((o.inicioMs + (o.duracionSeg || 120) * 1000 - clock()) / 1000));
        }
      }
      const earned = window.HacPuntos ? HacPuntos.deMiembro(h.id, id) : 0;
      const money = (window.HacStats && HacStats.dinero) ? HacStats.dinero(id) : 0;   // monedero (XP/dinero reales)
      const home = !!miCasa(id);                                                       // ¿tiene casa (asignada o comprada)?
      const ahorro = (window.HacStats && HacStats.ahorro) ? HacStats.ahorro(id) : 0;   // dinero a salvo en casa
      // "Poder personal": nivel 武/文/政 derivado del XP de cada dominio.
      const stats = (window.HacStats && HacStats.progresoNivel)
        ? HacStats.DOMS.map(dom => { const p = HacStats.progresoNivel(id, dom); const b = (HacStats.bonus ? HacStats.bonus(id, dom) : 0) + (HacStats.bonusPctNiveles ? HacStats.bonusPctNiveles(id, dom) : 0); return { dom, nivel: p.nivel, bonus: b, total: p.nivel + b, pct: p.pct, xp: p.xp, falta: p.falta }; })
        : null;
      const equipN = (window.HacStats && HacStats.equipados) ? HacStats.equipados(id).length : 0;
      const heridas = (window.HacStats && HacStats.heridas) ? HacStats.heridas(id) : 0;
      const secuelas = (window.HacStats && HacStats.secuelas) ? HacStats.secuelas(id) : [];
      const cargo = (window.HacCalc && HacCalc.cargoDef) ? HacCalc.cargoDef(((h.miembros || []).find(m => m.personajeId === id) || {}).cargo) : null;
      return { it, aptId, aptDef, cargo, e, eFull, eRegenMin, activa, enTarea, fuera, exped, escaramuza, rest, mine: id === myId, puntos: puntosTotales(id), earned, money, home, ahorro, stats, equipN, heridas, secuelas };
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
        if (!def) return '<div class="hacp-slot"></div>';
        if (!d.mine) return `<div class="hacp-slot full${def.raro ? ' rare' : ''}" title="${esc(def.nombre)} ${esc(def.zh || '')}${def.raro ? ' · RARO' : ''}">${def.icon || '∎'}</div>`;
        // MÍO: cada ranura abre la FICHA del objeto (qué es, qué hace y qué puedes
        // hacer con él). En móvil no hay hover, así que el `title` no bastaba.
        const e = def.efecto || {};
        let tag = '', cls = '';
        if (e.energia) { tag = `<span class="hacp-slot-xp" style="color:#7fc9a0">+${e.energia}⚡</span>`; cls = ' comida'; }
        else if (e.manual) {
          // XP de un dominio (manuales clásicos) o de VARIOS (libros de conclusiones → xp es un mapa).
          // La etiqueta va SIN chino (el glifo confundía): "+N XP" y el dominio en la ficha.
          const map = e.manual.xp && typeof e.manual.xp === 'object', dks = map ? Object.keys(e.manual.xp) : [e.manual.dom];
          const val = map ? e.manual.xp[dks[0]] : e.manual.xp, col = map ? 'var(--gold)' : (DOM_COLOR[e.manual.dom] || 'var(--gold)');
          tag = `<span class="hacp-slot-xp" style="color:${col}">+${val} XP</span>`; cls = ' manual';
        } else if (def.tipo === 'recompensa') { tag = '<span class="hacp-slot-xp" style="color:#e7c66a">abrir</span>'; cls = ' recompensa'; }
        else if (e.capInv) tag = `<span class="hacp-slot-xp" style="color:#c9a84c">+${e.capInv} 🎒</span>`;
        else if (e.equip) tag = '<span class="hacp-slot-xp hacp-slot-eq">equipar</span>';
        return `<button type="button" class="hacp-slot full act${cls}${def.raro ? ' rare' : ''}" data-item="${esc(def.id)}" title="${esc(def.nombre)} · toca para ver qué hace">${def.icon || '∎'}${tag}</button>`;
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
        ${homeBtns}
      </div>`;
    }
    // Botón para abrir la tienda, solo si la finca tiene un mercado construido.
    function marketBtnHTML() {
      return hasMarket ? `<button type="button" class="hacp-cp-btn hacp-cp-shop" data-act="shop">市 Comprar en el mercado</button>` : '';
    }
    // ── FICHA DE OBJETO (tocas una ranura de la mochila) ──────────────────────
    //   En móvil no hay hover: el `title` de la ranura era invisible y los objetos
    //   parecían inertes. Al tocar uno se abre esta ficha: qué es, qué hace y TODO
    //   lo que puedes hacer con él (comer, estudiar, equipar, guardar en casa).
    let objEl = null;
    const TIPO_NOMBRE = { comida: 'Vitualla', equipo: 'Equipable', arma: 'Arma', manual: 'Consumible', inventario: 'Alforja', mascota: 'Compañía', recompensa: 'Presente', caballo: 'Montura' };
    function ensureObjEl() {
      if (objEl) return objEl;
      objEl = document.createElement('div');
      objEl.className = 'hacp-shop hacp-obj-ov'; objEl.id = 'hacp-obj'; objEl.hidden = true;
      overlayHost().appendChild(objEl);
      ['pointerdown', 'pointerup', 'wheel', 'click'].forEach(ev => objEl.addEventListener(ev, (e) => e.stopPropagation(), { passive: false }));
      objEl.addEventListener('click', (e) => { if (e.target === objEl) cerrarObjeto(); });
      return objEl;
    }
    function cerrarObjeto() { if (objEl) objEl.hidden = true; }
    function abrirObjeto(id) {
      const def = window.HacTienda ? HacTienda.get(id) : null;
      if (!def || !myId || !window.HacStats) return;
      const el = ensureObjEl();
      const e = def.efecto || {};
      const E = window.HacEnergia;
      const eNow = E ? Math.round(E.current(h.id, myId)) : 100, eMax = E ? E.MAX : 100;
      const lleno = eNow >= eMax;
      const equipable = !!HacTienda.equipBonus(id);
      const reqNo = equipable ? reqNoCumplido(def) : null;
      const it = HacStats.inventario(myId).find(x => x.id === id);
      const n = it ? (it.n || 1) : 1;
      const tieneCasa = !!miCasa(myId);
      const acts = [];
      if (e.energia) {
        acts.push(`<button type="button" class="hacp-cp-btn hacp-cp-go" data-oact="comer"${lleno ? ' disabled' : ''}>🍚 Comer · +${e.energia} ⚡</button>`);
      }
      if (e.manual) acts.push(`<button type="button" class="hacp-cp-btn hacp-cp-go" data-oact="usar">📖 ${def.calidad ? 'Usar el libro' : 'Estudiar'}</button>`);
      if (def.tipo === 'recompensa') acts.push('<button type="button" class="hacp-cp-btn hacp-cp-go" data-oact="abrir">🎁 Abrir el presente</button>');
      if (e.capInv) acts.push(`<button type="button" class="hacp-cp-btn hacp-cp-go" data-oact="alforja">🎒 Usar · +${e.capInv} ranuras</button>`);
      if (equipable) acts.push(`<button type="button" class="hacp-cp-btn hacp-cp-go" data-oact="equipar"${reqNo ? ' disabled' : ''}>⚔ Equipar</button>`);
      if (tieneCasa) acts.push('<button type="button" class="hacp-cp-btn" data-oact="casa">🏠 Guardar en casa</button>');
      // Avisos honestos de por qué un botón está apagado / qué NO hace el objeto.
      const notas = [];
      if (e.energia && lleno) notas.push('Tu energía ya está al máximo: guárdalo para cuando la necesites.');
      if (reqNo) notas.push(`Para empuñarla necesitas ${DOM_GLYPH[reqNo] || reqNo} ${DOM_NOMBRE[reqNo] || reqNo} ${def.req[reqNo]}.`);
      if (!acts.length) notas.push('Es una pieza de colección: ocupa una ranura y no se usa. Puedes venderla en el mercado.');
      else notas.push('También puedes venderlo en el 市 Mercado (pestaña «Vender»).');
      const tipo = TIPO_NOMBRE[def.tipo] || 'Objeto';
      el.innerHTML = `
        <div class="hacp-shop-box hacp-obj-box">
          <button type="button" class="hacp-shop-x" data-oact="cerrar" aria-label="Cerrar">✕</button>
          <div class="hacp-obj-head">
            <span class="hacp-obj-ic${def.raro ? ' rare' : ''}">${def.icon || '∎'}</span>
            <div>
              <div class="hacp-obj-nm">${esc(def.nombre)}${n > 1 ? ` <span class="hacp-obj-n">×${n}</span>` : ''}</div>
              <div class="hacp-obj-sub">${esc(def.zh || '')} · ${tipo}${def.raro ? ' · <b class="rare">RARO</b>' : ''}</div>
            </div>
          </div>
          <div class="hacp-obj-ef">${esc(HacTienda.efectoTexto(def) || 'Sin efecto')}</div>
          <p class="hacp-obj-desc">${esc(def.desc || '')}</p>
          ${e.energia ? `<div class="hacp-obj-ener">⚡ Energía ahora: <b>${eNow}%</b> de ${eMax}%</div>` : ''}
          <div class="hacp-obj-acts">${acts.join('')}</div>
          ${notas.map(t => `<div class="hacp-inv-note">${t}</div>`).join('')}
        </div>`;
      el.hidden = false;
      el.querySelectorAll('[data-oact]').forEach(b => b.addEventListener('click', () => {
        const a = b.dataset.oact;
        if (a === 'cerrar') { cerrarObjeto(); return; }
        if (a === 'comer') { comerUI(id); return; }
        if (a === 'usar') { cerrarObjeto(); usarManualUI(id); return; }
        if (a === 'abrir') { cerrarObjeto(); abrirRecompensaUI(id); return; }
        if (a === 'alforja') { const r = HacStats.usarAmpliacion(myId, id); toast(r.ok ? `🎒 Mochila ampliada · ${r.cap} ranuras` : (r.motivo || 'No se pudo usar')); cerrarObjeto(); if (charId) buildCharPanel(charId); return; }
        if (a === 'equipar') { const r = HacStats.equipar(myId, id); toast(r.ok ? `⚔ ${def.nombre} equipado` : (r.motivo || 'No se pudo equipar')); if (r.ok) cerrarObjeto(); if (charId) buildCharPanel(charId); return; }
        if (a === 'casa') { const r = HacStats.meterEnCasa(myId, id); toast(r.ok ? `🏠 ${def.nombre} guardado en casa` : (r.motivo || 'No se pudo guardar')); cerrarObjeto(); if (charId) buildCharPanel(charId); }
      }));
    }
    // COMER una vitualla de la mochila: la consume y suma su energía (topada al máx).
    function comerUI(id) {
      const def = window.HacTienda ? HacTienda.get(id) : null;
      const en = def && def.efecto && def.efecto.energia;
      if (!en || !myId || !window.HacStats || !HacStats.comerItem) return;
      const E = window.HacEnergia;
      const antes = E ? Math.round(E.current(h.id, myId)) : 0;
      if (E && antes >= E.MAX) { toast('⚡ Ya estás a plena energía · guárdalo para luego'); return; }
      const r = HacStats.comerItem(myId, id);
      if (!r.ok) { toast(r.motivo || 'No se pudo comer'); return; }
      const gan = E ? Math.min(en, E.MAX - antes) : en;
      cerrarObjeto();
      toast(`${def.icon || '🍚'} ${def.nombre} · +${gan} ⚡`);
      if (window.HacBitacora) HacBitacora.log(myId, 'progreso', `🍚 Comiste ${def.nombre} · +${gan} de energía`);
      Promise.resolve(E ? E.add(h.id, myId, en) : null).then(() => { if (charId) buildCharPanel(charId); });
    }
    // Usa un MANUAL de la mochila (+XP fija a su dominio, se consume).
    function usarManualUI(id) {
      if (!myId || !window.HacStats || !HacStats.usarManual) return;
      const def = window.HacTienda ? HacTienda.get(id) : null;
      // Los libros de CONCLUSIONES tienen varios usos (estudiar / presentar al fundador /
      // vender): pide confirmación para no consumirlos sin querer al tocarlos.
      if (def && def.calidad && def.tema) { confirmarConclusiones(def); return; }
      estudiarManual(id);
    }
    function estudiarManual(id) {
      const def = window.HacTienda ? HacTienda.get(id) : null;
      const r = HacStats.usarManual(myId, id);
      if (r && r.ok) {
        // XP puede ser de un dominio (manuales clásicos) o de varios (libros de debate).
        const txt = (r.ganado && Object.keys(r.ganado).length)
          ? Object.keys(r.ganado).map(d => `+${r.ganado[d]} XP ${DOM_NOMBRE[d] || ''}`.trim()).join(' · ')
          : `+${r.xp} XP ${DOM_NOMBRE[r.dom] || ''}`.trim();
        toast('📖 ' + txt);
        if (window.HacBitacora) HacBitacora.log(myId, 'progreso', `📖 Estudiaste ${def ? def.nombre : 'un tomo'} · ${txt}`);
        if (charId) buildCharPanel(charId);
      } else toast((r && r.motivo) || 'No se pudo usar');
    }
    // Confirmación al usar unas CONCLUSIONES: explica sus usos y evita gastarlas por error.
    let concEl = null;
    // Nombre del señor de la casa (fundador designado por el admin), o genérico.
    function fundadorNombre() {
      const fid = h.mapa && h.mapa.fundador;
      const m = fid && (h.miembros || []).find(x => (x.personajeId || x.id) === fid);
      return (m && m.nombre) || 'el señor de la casa';
    }
    function confirmarConclusiones(def) {
      if (concEl) concEl.remove();
      concEl = document.createElement('div');
      concEl.className = 'hacp-shop hacp-conc-ov';
      const ef = window.HacTienda ? HacTienda.efectoTexto(def) : '';
      const donable = def.donable;
      const D = window.HacDebates, cal = def.calidad;
      const buffPct = (donable && D && D.CALIDADES && D.CALIDADES[cal]) ? Math.round((D.CALIDADES[cal].buff || 0) * 100) : 0;
      const fund = fundadorNombre();
      const act = (window.HacBuff && HacBuff.activo) ? HacBuff.activo(h.id, 'xp') : null;
      concEl.innerHTML = `<div class="hacp-shop-box hacp-conc-box">
        <button type="button" class="hacp-shop-x" data-x aria-label="Cerrar">✕</button>
        <div class="hacp-conc-h"><span class="hacp-conc-ic">${def.icon || '📖'}</span><div><div class="hacp-conc-nm">${esc(def.nombre)}</div><div class="hacp-conc-zh">論議錄 · saber de un debate</div></div></div>
        <p class="hacp-conc-desc">${esc(def.desc || '')}</p>
        <div class="hacp-conc-uses">
          <div class="hacp-conc-use"><span class="i">📖</span><div><b>Estudiarlas</b> tú<br><span class="mut">${esc(ef).replace('Consumible · ', '')}</span></div></div>
          <div class="hacp-conc-use${donable ? ' hi' : ''}"><span class="i">🏯</span><div><b>Presentarlas a ${esc(fund)}</b>${donable ? '' : ' <span class="mut">(solo muy buenas o reveladoras)</span>'}<br><span class="mut">${donable ? '+' + buffPct + '% XP a TODA la hacienda · 7 días' : 'estas no dan bono a la casa'}</span></div></div>
          <div class="hacp-conc-use"><span class="i">💰</span><div><b>Venderlas</b> en el mercado<br><span class="mut">por ${def.precio || 0} monedas</span></div></div>
        </div>
        ${act ? `<div class="hacp-conc-warn" style="color:#c9a84c">Ya hay un bono de <b>+${Math.round(act.valor * 100)}%</b> activo en la casa.</div>` : ''}
        <div class="hacp-conc-warn">Cualquiera de las dos acciones <b>consume</b> el libro.</div>
        <div class="hacp-conc-btns">
          <button type="button" class="hacp-cp-btn" data-keep>Conservar</button>
          <button type="button" class="hacp-cp-btn" data-study>📖 Estudiar</button>
          ${donable ? '<button type="button" class="hacp-cp-btn hacp-cp-go" data-donate>🏯 Presentar</button>' : ''}
        </div>
      </div>`;
      overlayHost().appendChild(concEl);
      ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click'].forEach(ev => concEl.addEventListener(ev, (e) => e.stopPropagation(), { passive: false }));
      const close = () => { if (concEl) { concEl.remove(); concEl = null; } };
      concEl.addEventListener('click', (e) => { if (e.target === concEl) close(); });
      concEl.querySelector('[data-x]').addEventListener('click', close);
      concEl.querySelector('[data-keep]').addEventListener('click', close);
      concEl.querySelector('[data-study]').addEventListener('click', () => { const id = def.id; close(); estudiarManual(id); });
      const dn = concEl.querySelector('[data-donate]');
      if (dn) dn.addEventListener('click', () => { close(); donarConclusiones(def); });
    }
    // Presentar (DONAR) un libro al fundador → bono de +XP a toda la hacienda 7 días (F2).
    function donarConclusiones(def) {
      if (!myId || !window.HacBuff || !HacBuff.presentar) { toast('Las donaciones no están disponibles ahora mismo'); return; }
      const D = window.HacDebates, cal = def.calidad;
      const valor = (D && D.CALIDADES && D.CALIDADES[cal]) ? (D.CALIDADES[cal].buff || 0) : 0;
      if (!valor) { toast('Estas conclusiones no dan bono a la casa'); return; }
      const act = HacBuff.activo && HacBuff.activo(h.id, 'xp');
      if (act && act.valor >= valor) { toast(`La casa ya tiene un bono de +${Math.round(act.valor * 100)}% (igual o mejor). Espera a que caduque o dona uno superior.`); return; }
      const rr = HacStats.quitarItem ? HacStats.quitarItem(myId, def.id) : { ok: false };   // consume el libro
      if (!rr || !rr.ok) { toast((rr && rr.motivo) || 'No llevas ese libro'); return; }
      const pctv = Math.round(valor * 100), fund = fundadorNombre();
      HacBuff.presentar({ haciendaId: h.id, tipo: 'xp', valor, calidad: cal, donanteId: myId, donanteNombre: miNombreDeb() })
        .then(() => {
          toast(`🏯 Presentaste el libro a ${fund} · +${pctv}% XP a la hacienda (7 días)`);
          if (window.HacBitacora) HacBitacora.log(myId, 'progreso', `🏯 Presentaste «${def.nombre}» a ${fund} · +${pctv}% XP a toda la hacienda durante 7 días`);
          if (window.HacPuntos && HacPuntos.award) { const pr = HacPuntos.recompensa ? HacPuntos.recompensa(30, 300) : 12; HacPuntos.award(h.id, myId, pr); retoAdd('prestigio', pr); }   // prestigio de casa al donante (+ reto semanal)
          // Ideas REVELADORAS → el fundador puede recompensarte con una RELIQUIA RARA (baja prob.).
          if (cal === 'reveladoras' && window.HacTienda && HacTienda.raroAleatorio && Math.random() < 0.25) {
            const rid = HacTienda.raroAleatorio(), rdef = rid && HacTienda.get(rid);
            if (rdef && HacStats.darItem) {
              const gg = HacStats.darItem(myId, rid);
              if (gg && gg.ok) {
                toast(`🎁 ${fund} te obsequia ${rdef.icon || ''} ${rdef.nombre} · ¡objeto RARO!`);
                if (window.HacBitacora) HacBitacora.log(myId, 'progreso', `🎁 ${fund} te obsequió ${rdef.icon || ''} «${rdef.nombre}» (objeto RARO) por presentarle unas ideas tan reveladoras`);
              }
            }
          }
          return HacBuff.reload();
        })
        .then(() => { refresh(); if (charId) buildCharPanel(charId); })
        .catch(e => {                                       // falló → DEVUELVE el libro (no perderlo)
          if (HacStats.darItem) HacStats.darItem(myId, def.id);
          if (charId) buildCharPanel(charId);
          toast((e && e.message) || 'No se pudo presentar el libro');
        });
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
    // ICONO unificado de aptitud (pictograma SVG): militar=espada, cultural=pincel,
    // administrativo=moneda china (agujero cuadrado). Es el icono ACCIONABLE (tablón,
    // encuentros, reservas); el glifo 武/文/政 se reserva para adorno en texto.
    const DOM_ICON = {
      militar: '<path d="M12 2.4 L13.5 6 L13.5 14 L10.5 14 L10.5 6 Z"/><path d="M8 14 h8 v1.9 h-8 Z"/><rect x="11.1" y="15.7" width="1.8" height="3.7"/><circle cx="12" cy="20.6" r="1.5"/>',
      cultural: '<rect x="10.9" y="2.6" width="2.2" height="8.4" rx="1"/><rect x="9.9" y="10.4" width="4.2" height="1.9" rx=".6"/><path d="M10.2 12.4 Q9.6 17 12 21 Q14.4 17 13.8 12.4 Z"/>',
      administrativo: '<path fill-rule="evenodd" d="M12 3 A9 9 0 1 0 12 21 A9 9 0 1 0 12 3 Z M8.7 8.7 H15.3 V15.3 H8.7 Z"/>',
    };
    function domIcon(dom, cls) {
      if (!DOM_ICON[dom]) return '';
      return `<svg class="dom-ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="${DOM_COLOR[dom]}" role="img" aria-label="${DOM_NOMBRE[dom] || dom}">${DOM_ICON[dom]}</svg>`;
    }
    function statsHTML(d) {
      if (!d.stats) return '';
      const chips = d.stats.map(s => {
        const tip = `${DOM_GLYPH[s.dom]} ${DOM_NOMBRE[s.dom]} · nivel ${s.nivel}${s.bonus ? ` (+${s.bonus} de equipo)` : ''} · ${s.xp} XP${s.falta ? ` · faltan ${s.falta} para el siguiente nivel` : ''}`;
        return `<div class="hacp-cp-stat" data-tip="${esc(tip)}">
          <span class="hacp-cp-stat-h"><span class="hacp-cp-stat-g" style="color:${DOM_COLOR[s.dom]}">${DOM_GLYPH[s.dom]}</span><span class="hacp-cp-stat-nm">${DOM_ABBR[s.dom]}</span></span>
          <span class="hacp-cp-stat-n">${s.total}${s.bonus ? `<i class="hacp-cp-stat-eq">+${s.bonus}</i>` : ''}</span>
          <i class="hacp-cp-stat-bar"><b style="width:${Math.round(s.pct * 100)}%;background:${DOM_COLOR[s.dom]}"></b></i>
        </div>`;
      }).join('');
      return `<div class="hacp-cp-stats" id="hacp-cp-stats"><div class="hacp-cp-statslbl">Poder personal <span>· nivel por dominio</span></div><div class="hacp-cp-statsrow">${chips}</div></div>`;
    }
    // Equipo EN LECTURA de OTRO mecenas (el tuyo ya tiene el botón Equipo editable):
    // muestra los objetos que lleva (ropa de torso + hasta 3) con su efecto en el tip.
    function equipoHTML(d) {
      if (d.mine || !window.HacStats || !HacStats.equipados || !window.HacTienda) return '';
      const ids = HacStats.equipados(d.it.id);
      const esTorso = (id) => HacStats.slotDe && HacStats.slotDe(id) === 'torso';
      const orden = ids.slice().sort((a, b) => (esTorso(b) ? 1 : 0) - (esTorso(a) ? 1 : 0));   // la ropa de torso primero
      const chips = orden.map(id => {
        const def = HacTienda.get(id); if (!def) return '';
        const ef = HacTienda.efectoTexto(def).replace('Equipable · ', '');
        return `<span class="hacp-cp-eqitem${def.raro ? ' rare' : ''}${esTorso(id) ? ' torso' : ''}" data-tip="${esc(def.nombre + (def.zh ? ' ' + def.zh : '') + (ef ? ' · ' + ef : ''))}"><span class="ic">${def.icon || '∎'}</span></span>`;
      }).join('');
      return `<div class="hacp-cp-equip"><div class="hacp-cp-equiplbl">Equipo</div>${chips ? `<div class="hacp-cp-equiprow">${chips}</div>` : '<div class="hacp-cp-equip-none">Sin objetos equipados</div>'}</div>`;
    }
    // Heridas (0..3): tres ranuras. PESAN — merman recompensa (−15 %/herida) y suben
    // el riesgo; a 3/3 el mecenas está malherido y no puede salir. Se curan pagando.
    function woundsHTML(d) {
      const n = Math.max(0, Math.min(3, d.heridas || 0));
      const slots = [0, 1, 2].map(i => `<span class="hacp-wound${i < n ? ' on' : ''}">${i < n ? '✚' : '·'}</span>`).join('');
      const pen = Math.round(Math.min(0.45, n * 0.15) * 100);
      const txt = !n ? 'ileso' : (n >= 3 ? 'malherido · no puede salir' : `${n}/3 · −${pen}% recompensa · +riesgo`);
      const cura = (d.mine && n > 0) ? `<button type="button" class="hacp-cp-btn hacp-cp-cura" data-act="cura"${d.money < COSTE_CURA ? ' disabled' : ''}>✚ Curar 1 herida · 💰 ${COSTE_CURA}${d.money < COSTE_CURA ? ' (te falta)' : ''}</button>` : '';
      // A 3/3: el aviso del peregrinaje va en el botón «Escaramuzas» (parpadeo rojo), no aquí.
      const pistaPereg = (d.mine && n >= 3) ? `<div class="hacp-cp-secuelas">⛰ ¿Sin salida? Busca al <b>legendario curandero</b> en 兵 Escaramuzas.</div>` : '';
      // Secuelas permanentes (cosméticas, de por vida) ganadas en peregrinajes fallidos.
      const secs = (d.secuelas && d.secuelas.length) ? `<div class="hacp-cp-secuelas" data-tip="Secuelas permanentes de peregrinajes fallidos. Son cicatrices de por vida: no se curan.">Secuelas: ${d.secuelas.map(id => { const s = secuelaDef(id); return s ? esc(s.nom) : esc(id); }).join(' · ')}</div>` : '';
      return `<div class="hacp-cp-wounds${n ? ' hurt' : ''}${n >= 3 ? ' bad' : ''}" data-tip="Heridas ${n}/3. Reducen la recompensa (−15% por herida) y suben el riesgo de las expediciones; a 3/3 tu mecenas queda malherido y no puede salir hasta curarse.">
        <span class="hacp-wound-h">Heridas</span><span class="hacp-wound-slots">${slots}</span><span class="hacp-wound-txt">${txt}</span></div>${secs}${cura}${pistaPereg}`;
    }
    // Cura 1 herida pagando en la enfermería (decisión: gastar dinero vs. seguir herido).
    function curarHerida() {
      if (!myId || !window.HacStats) return;
      const n = HacStats.heridas(myId); if (n <= 0) return;
      if (HacStats.dinero(myId) < COSTE_CURA) { toast('No tienes suficiente dinero para curarte'); return; }
      HacStats.award(myId, { dinero: -COSTE_CURA });
      HacStats.curar(myId, 1);
      toast(`✚ Herida curada · −${COSTE_CURA}💰`);
      if (window.HacBitacora) HacBitacora.log(myId, 'progreso', `✚ Curaste una herida (−${COSTE_CURA}💰)`);
      if (charId) buildCharPanel(charId);
    }
    // Barra de acciones (rejilla de iconos) — sustituye la pila de botones ancha.
    // Nº de misiones DISPONIBLES en tu tablón AHORA (pool del tier menos las que ya cogiste hoy).
    function misDisponiblesCount() {
      if (!hasTablon || !window.HacMisiones) return 0;
      const tomadas = window.HacMisTomadas ? HacMisTomadas.tomadasHoy(h.id) : new Set();
      return HacMisiones.disponibles(tier).filter(m => !tomadas.has(m.id)).length;
    }
    function toolbarHTML(d) {
      const pts = (window.HacStats && HacStats.puntosLibres) ? HacStats.puntosLibres(myId) : 0;
      const misDisp = misDisponiblesCount();
      const prodEnc = (typeof encargosEntregables === 'function') ? encargosEntregables() : 0;
      const tool = (act, ic, lb, extra) => `<button type="button" class="hacp-cp-tool${extra || ''}" data-act="${act}"><span class="ic">${ic}</span><span class="lb">${lb}</span></button>`;
      const items = [
        tool('equip', '⚔', 'Equipo' + (d.equipN ? ` ${d.equipN}/3` : '')),
        tool('inv', '🎒', 'Inventario', invOpen ? ' on' : ''),
        tool('sendas', '道', 'Sendas') + (pts > 0 ? '' : ''),
        tool('caballo', '🐎', 'Tu Caballo'),
        tool('log', '錄', 'Bitácora'),
        prodOk() ? tool('prod', '產', 'Producción', ' hacp-cp-prod') : '',
        hasMarket ? tool('shop', '市', 'Mercado') : '',
        tool('esc', '兵', 'Escaramuzas', ' hacp-cp-esc'),
        hasTablon ? tool('board', '檄', 'Misiones', ' hacp-cp-board') : '',
      ];
      // Distintivos rojos: puntos de talento sin gastar (Sendas), encargos entregables
      // (Producción) y misiones disponibles (Misiones). Sin badge = nada pendiente.
      const sendasBadge = pts > 0 ? `<span class="hacp-cp-badge">${pts}</span>` : '';
      const prodBadge = prodEnc > 0 ? `<span class="hacp-cp-badge">${prodEnc}</span>` : '';
      const boardBadge = misDisp > 0 ? `<span class="hacp-cp-badge">${misDisp}</span>` : '';
      let html = items.join('');
      if (sendasBadge) html = html.replace('data-act="sendas"><span class="ic">道</span>', `data-act="sendas">${sendasBadge}<span class="ic">道</span>`);
      if (prodBadge) html = html.replace('data-act="prod"><span class="ic">產</span>', `data-act="prod">${prodBadge}<span class="ic">產</span>`);
      if (boardBadge) html = html.replace('data-act="board"><span class="ic">檄</span>', `data-act="board">${boardBadge}<span class="ic">檄</span>`);
      return `<div class="hacp-cp-tools">${html}</div>`;
    }
    // Overlay reutilizable para "Tu Caballo" y "Bufos".
    let casaEl = null;
    function ensureCasaEl() {
      if (casaEl) return casaEl;
      casaEl = document.createElement('div'); casaEl.className = 'hacp-shop hacp-casa-ov'; casaEl.hidden = true; overlayHost().appendChild(casaEl);
      ['pointerdown', 'pointerup', 'wheel', 'click'].forEach(ev => casaEl.addEventListener(ev, (e) => e.stopPropagation(), { passive: false }));
      casaEl.addEventListener('click', (e) => { if (e.target === casaEl) casaEl.hidden = true; });
      return casaEl;
    }
    // TU CABALLO (antes "La casa"): estado del corcel y qué te aporta.
    function caballoInfoHTML() {
      const c = (window.HacStats && HacStats.caballo) ? HacStats.caballo(myId) : null;
      if (!c) return `<div class="hacp-inv-note">Aún no tienes caballo. Cómpralo en el <b>市 Mercado</b> (requiere 武 5): lo bautizas, rondará libre por los campos de la finca y saldrás <b>montado</b> en tus expediciones y escaramuzas.</div>`;
      return `<div class="hacp-caballo-card">
          <div class="hacp-caballo-ic">🐎</div>
          <div class="hacp-caballo-nm">${esc(c.nombre)}</div>
          <div class="hacp-caballo-sub">Caballo de raza · 寶馬</div>
        </div>
        <div class="hacp-caballo-fx">
          <div>道 Ronda libre por los campos, fuera de la finca.</div>
          <div>⚔ Sales <b>montado</b> en expediciones y escaramuzas.</div>
          <div>⏱ <b>−${Math.round(CABALLO_EXPED * 100)}%</b> de tiempo de expedición.</div>
        </div>`;
    }
    function openCaballo() {
      if (!myId) return;
      const el = ensureCasaEl();
      el.innerHTML = `<div class="hacp-shop-box"><button type="button" class="hacp-shop-x" data-casa-x aria-label="Cerrar">✕</button>
        <div class="hacp-shop-h"><span class="hacp-shop-zh">🐎</span> Tu Caballo</div>
        ${caballoInfoHTML()}</div>`;
      el.querySelector('[data-casa-x]').addEventListener('click', () => { el.hidden = true; });
      el.hidden = false;
    }
    // BUFOS/DEBUFOS: total por tipo arriba + desglose por fuente. Incluye, de paso, el
    // panel de cargos de la casa y las relaciones (fuentes de futuros bufos).
    function bufosHTML() {
      const { items, totales } = recopilarBufos();
      const fmt = (t, v) => (BUF_TIPOS[t] && BUF_TIPOS[t].num) ? ('' + v) : (Math.round(v * 100) + '%');
      const tot = Object.keys(totales).filter(t => Math.abs(totales[t]) > 0.0001).map(t => {
        const d = BUF_TIPOS[t] || { label: t, signo: '+', color: '#c9a84c', good: true };
        return `<div class="hacp-buf-tot ${d.good ? 'good' : 'bad'}"><span>${esc(d.label)}</span><b style="color:${d.color}">${d.signo}${fmt(t, totales[t])}</b></div>`;
      }).join('');
      const rows = items.map(it => {
        const d = BUF_TIPOS[it.tipo] || {};
        return `<div class="hacp-buf-row"><span class="hacp-buf-src">${esc(it.label)}</span><span class="hacp-buf-ef" style="color:${d.color || 'var(--gold)'}">${d.signo || '+'}${fmt(it.tipo, it.val)} ${esc(d.label || it.tipo)}</span></div>`;
      }).join('');
      return `<div class="hacp-buf-tots">${tot || '<div class="hacp-inv-note">Sin modificadores activos ahora mismo.</div>'}</div>
        ${rows ? `<div class="hacp-buf-list">${rows}</div>` : ''}
        ${cargosHTML()}${relacionesHTML()}`;
    }
    function openBufos() {
      if (!myId) return;
      const el = ensureCasaEl();
      el.innerHTML = `<div class="hacp-shop-box"><button type="button" class="hacp-shop-x" data-casa-x aria-label="Cerrar">✕</button>
        <div class="hacp-shop-h"><span class="hacp-shop-zh">✦</span> Bufos y debufos</div>
        ${bufosHTML()}</div>`;
      el.querySelector('[data-casa-x]').addEventListener('click', () => { el.hidden = true; });
      el.hidden = false;
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
        if (d.activa && d.escaramuza) {
          // Escaramuza: NO se puede liberar en solitario. Solo el capitán aborta (vuelta 5 min).
          const band = window.HacEscaramuzas ? HacEscaramuzas.miBanda(h.id, myId) : null;
          const soyHost = !!(band && band.hostId === myId), abortando = !!(band && band.estado === 'abortando');
          const pereg = esPereg(band);
          const flag = abortando ? `↩ ${pereg ? 'Peregrinaje abandonado' : 'Escaramuza abortada'} · vuelta en <b id="hacp-cp-rest">${fmtClock(d.rest)}</b>`
            : pereg ? `⛰ En peregrinaje · vuelve en <b id="hacp-cp-rest">${fmtClock(d.rest)}</b>`
            : `⚔ En escaramuza · vuelve en <b id="hacp-cp-rest">${fmtClock(d.rest)}</b>`;
          const ctrl = (soyHost && !abortando) ? `<button type="button" class="hacp-cp-btn hacp-cp-abort" data-act="abort">Abortar</button>`
            : `<span class="hacp-cp-lbl" style="opacity:.7;align-self:center">${abortando ? 'regresando…' : 'solo el capitán aborta'}</span>`;
          mision = `<div class="hacp-cp-mis hacp-cp-mis-on"><span class="hacp-cp-flag">${flag}</span>${ctrl}</div>`;
        } else if (d.activa) {
          const flag = d.exped ? `🧭 Expedición · vuelve en <b id="hacp-cp-rest">${fmtClock(d.rest)}</b>`
            : d.enTarea ? `⚒ En la tarea · <b id="hacp-cp-rest">${fmtClock(d.rest)}</b>`
            : `⚒ De camino…`;
          mision = `<div class="hacp-cp-mis hacp-cp-mis-on"><span class="hacp-cp-flag">${flag}</span><button type="button" class="hacp-cp-btn" data-act="release">Liberar</button></div>`;
        } else if (ocupadoAhora(myId)) {
          // Comprometido en algo sin orden aún (p.ej. banda de escaramuza/peregrinaje
          // 'abierta', esperando a partir): tampoco puede coger una tarea interna.
          mision = `<div class="hacp-cp-mis"><span class="hacp-cp-flag" style="opacity:.8">Ocupado en otra actividad</span></div>`;
        } else {
          // Las tareas internas de prestigio se han sustituido por INVITAR A DEBATIR.
          const invPend = DEB && DEB.miInvitacionPendiente(h.id, myId, clock());
          const enDeb = DEB && DEB.miDebate(h.id, myId);
          const invSent = DEB && DEB.miInvitacionEnviada(h.id, myId);
          const debLbl = '<label class="hacp-cp-lbl">🗣 Debate</label>';   // cabecera para cohesionar la sección
          if (invPend) {
            const tt = debTema(invPend.tema);
            mision = `<div class="hacp-cp-mis hacp-deb-invite">${debLbl}<span class="hacp-cp-flag"><b>${esc(invPend.hostNombre || 'Alguien')}</b> te reta a un debate de <b>${esc(tt ? tt.nombre : invPend.tema)}</b></span><div class="r"><button type="button" class="hacp-cp-btn hacp-cp-go" data-act="deb-yes" data-id="${esc(invPend.id)}">Aceptar</button><button type="button" class="hacp-cp-btn" data-act="deb-no" data-id="${esc(invPend.id)}">Rechazar</button></div></div>`;
          } else if (enDeb) {
            const tt = debTema(enDeb.tema);
            const remD = Math.max(0, Math.ceil((enDeb.finMs - clock()) / 1000));
            const miTurno = DEB && !DEB.juegoCompleto(enDeb) && DEB.turnActorId(enDeb, DEB.turnoActual(enDeb)) === myId;
            const argLbl = DEB && DEB.juegoCompleto(enDeb) ? 'Ver debate' : (miTurno ? '¡Tu turno! Argumentar →' : 'Argumentar →');
            mision = `<div class="hacp-cp-mis hacp-cp-mis-on hacp-deb-invite">${debLbl}<span class="hacp-cp-flag">Debatiendo de <b>${esc(tt ? tt.nombre : enDeb.tema)}</b> · queda <b class="hacp-deb-countdown" id="hacp-cp-debrest">${fmtClock(remD)}</b></span><div class="r"><button type="button" class="hacp-cp-btn hacp-cp-go${miTurno ? ' hacp-mo-mis' : ''}" data-act="debj">${argLbl}</button></div></div>`;
          } else if (invSent) {
            const tt = debTema(invSent.tema);
            mision = `<div class="hacp-cp-mis hacp-deb-invite">${debLbl}<span class="hacp-cp-flag">Reto enviado a <b>${esc(invSent.invitadoNombre || '…')}</b> <span style="opacity:.7">(${esc(tt ? tt.nombre : invSent.tema)})</span> · esperando respuesta…</span><div class="r"><button type="button" class="hacp-cp-btn" data-act="deb-cancel" data-id="${esc(invSent.id)}">Cancelar invitación</button></div></div>`;
          } else {
            const cd = DEB ? DEB.cooldownRestanteMs(h.id, myId, clock()) : 0;
            const hayJard = gardensFinca().length > 0;
            const dis = (cd > 0 || !hayJard || !DEB) ? ' disabled' : '';
            const sub = cd > 0 ? `Reposa tras el último debate · ${fmtClock(Math.ceil(cd / 1000))}` : (!hayJard ? 'Necesitas un Jardín (≥4 de área)' : 'Reta a otro mecenas a un debate de 5 min');
            mision = `<div class="hacp-cp-mis hacp-deb-invite">${debLbl}<button type="button" class="hacp-cp-btn hacp-cp-go" style="width:100%" data-act="debate"${dis}>Invitar a debatir</button><span class="hacp-cp-lbl" style="opacity:.6;margin-top:6px;text-transform:none;letter-spacing:0">${sub}</span></div>`;
          }
        }
      }
      charEl.innerHTML = `
        <button type="button" class="hacp-cp-x" data-act="close" aria-label="Cerrar">✕</button>
        <div class="hacp-cp-top">
          <canvas class="hacp-cp-avatar" width="128" height="184"></canvas>
          <div class="hacp-cp-id">
            <div class="hacp-cp-head">
              <span class="hacp-cp-dot" style="--c:${esc(d.it.color)}"></span>
              <span class="hacp-cp-name">${esc(d.it.name)}${d.mine ? ' <em>(tú)</em>' : ''}</span>
            </div>
            ${d.aptDef ? `<div class="hacp-cp-apt">${d.aptDef.icon || ''} ${esc(d.aptDef.nombre)}${comp ? ' · domina ' + comp : ''}</div>` : (comp ? `<div class="hacp-cp-apt">domina ${comp}</div>` : '')}
            ${d.cargo ? `<div class="hacp-cp-cargo">${d.cargo.icon} ${esc(d.cargo.zh)} ${esc(d.cargo.nombre)}</div>` : ''}
            <div class="hacp-cp-pts"><span data-tip="Prestigio: la reputación de tu mecenas en la casa (aportación base + lo ganado en misiones y tareas). Cuanto más, mayor tu rango dentro de la hacienda.">Prestigio: <b id="hacp-cp-pts">${d.puntos}</b>${d.earned ? ` <span class="hacp-cp-earn">+${d.earned}</span>` : ''}</span>${d.mine ? ` · <span data-tip="Dinero de tu monedero. Lo gastas en el mercado y en curar heridas; lo ganas en misiones y escaramuzas.">💰 <b>${d.money}</b></span> <button type="button" class="hacp-cp-bufbtn" data-act="bufos" data-tip="Bufos y debufos: todas las mejoras y penalizaciones porcentuales que te afectan (cargos, objetos, sendas, caballo, heridas…), con el total.">✦ Bufos</button>` : ''}</div>
          </div>
        </div>
        <div class="hacp-cp-act" id="hacp-cp-act">${d.it.inside ? '⌂ ' : ''}${esc(d.it.activity || 'Paseando por la finca')}</div>
        <div class="hacp-cp-energy" data-tip="Energía: ${d.e}%. Se gasta al enviar tareas y expediciones, y se regenera con el tiempo. Sin energía no puedes salir." title="Energía ${d.e}%"><i id="hacp-cp-ebar" style="width:${d.e}%"></i></div>
        <div class="hacp-cp-elabel" id="hacp-cp-elabel">${energyLabel(d)}</div>
        ${statsHTML(d)}
        ${equipoHTML(d)}
        ${woundsHTML(d)}
        ${d.mine ? toolbarHTML(d) : ''}
        ${mision}
        ${(d.mine && invOpen) ? invPanelHTML(d) : ''}
        ${d.mine ? `<button type="button" class="hacp-cp-btn hacp-cp-leave" data-act="leave">Abandonar la hacienda</button>` : ''}`;
      lastStatsSig = JSON.stringify(d.stats || 0);   // recién pintadas: marca su firma
      charEl.querySelector('[data-act="close"]').addEventListener('click', deselect);
      const db = charEl.querySelector('[data-act="dispatch"]');
      if (db) db.addEventListener('click', () => { const s = charEl.querySelector('.hacp-cp-sel'); dispatch(s ? s.value : null); });
      const dbb = charEl.querySelector('[data-act="debate"]');
      if (dbb) dbb.addEventListener('click', abrirInvitarDebate);
      const dbj = charEl.querySelector('[data-act="debj"]');
      if (dbj) dbj.addEventListener('click', abrirDebateJuego);
      const dby = charEl.querySelector('[data-act="deb-yes"]');
      if (dby) dby.addEventListener('click', () => aceptarDebate(dby.dataset.id));
      const dbn = charEl.querySelector('[data-act="deb-no"]');
      if (dbn) dbn.addEventListener('click', () => rechazarDebate(dbn.dataset.id));
      const dbc = charEl.querySelector('[data-act="deb-cancel"]');
      if (dbc) dbc.addEventListener('click', () => rechazarDebate(dbc.dataset.id));
      const rb = charEl.querySelector('[data-act="release"]');
      if (rb) rb.addEventListener('click', release);
      const ab = charEl.querySelector('[data-act="abort"]');
      if (ab) ab.addEventListener('click', abortarEscaramuza);
      const bdb = charEl.querySelector('[data-act="board"]');
      if (bdb) bdb.addEventListener('click', goConsultBoard);
      const ib = charEl.querySelector('[data-act="inv"]');
      if (ib) ib.addEventListener('click', () => { invOpen = !invOpen; buildCharPanel(charId); });
      const shb = charEl.querySelector('[data-act="shop"]');
      if (shb) shb.addEventListener('click', openShop);
      const pdb = charEl.querySelector('[data-act="prod"]');
      if (pdb) pdb.addEventListener('click', openProd);
      charEl.querySelectorAll('[data-item]').forEach(b => b.addEventListener('click', () => abrirObjeto(b.dataset.item)));
      const gh = charEl.querySelector('[data-act="gohome"]');
      if (gh) gh.addEventListener('click', openHome);
      const escb = charEl.querySelector('[data-act="esc"]');
      if (escb) escb.addEventListener('click', openEscOverlay);
      const logb = charEl.querySelector('[data-act="log"]');
      if (logb) logb.addEventListener('click', openBitacora);
      refreshRetoPulses();   // reaplica el aviso de «tu señor te espera» tras re-render
      const sdb = charEl.querySelector('[data-act="sendas"]');
      if (sdb) sdb.addEventListener('click', openSendas);
      const csb = charEl.querySelector('[data-act="caballo"]');
      if (csb) csb.addEventListener('click', openCaballo);
      const bfb = charEl.querySelector('[data-act="bufos"]');
      if (bfb) bfb.addEventListener('click', openBufos);
      const eqb = charEl.querySelector('[data-act="equip"]');
      if (eqb) eqb.addEventListener('click', openEquip);
      const lvb = charEl.querySelector('[data-act="leave"]');
      if (lvb) lvb.addEventListener('click', openLeave);
      const cub = charEl.querySelector('[data-act="cura"]');
      if (cub && !cub.disabled) cub.addEventListener('click', curarHerida);
      const bh = charEl.querySelector('[data-act="buyhome"]');
      if (bh && !bh.disabled) bh.addEventListener('click', () => {
        if (!myId || !window.HacStats) return;
        const lib = casaLibre();                          // re-evalúa por si otra ya la compró
        if (!lib) { toast('Ya no hay casas libres'); buildCharPanel(charId); return; }
        const res = HacStats.comprarCasa(myId, casaKey(lib), PRECIO_CASA);
        if (res.ok) { toast(`🏠 ¡Compraste una casa por ${PRECIO_CASA} 💰!`); if (window.HacBitacora) HacBitacora.log(myId, 'progreso', `🏠 Compraste una casa (−${PRECIO_CASA}💰)`); buildCharPanel(charId); }
        else toast(res.motivo || 'No se pudo comprar la casa');
      });
    }
    // Firma para decidir cuándo RECONSTRUIR el panel entero (vs. refresco parcial de
    // contadores). Incluye los datos que llegan async (HacStats) y NO se actualizan en
    // el refresco parcial —oro, ahorro, heridas, equipo, cargo, casa—, para que al
    // cargar/cambiar se re-pinte solo (antes el oro se quedaba a 0 hasta cambiar de pestaña).
    function sigOf(d) {
      return [charId, d.activa ? (d.enTarea ? 't' : 'g') : '-', d.mine ? 'me' : '-',
        d.money, d.ahorro, d.heridas, (d.secuelas ? d.secuelas.length : 0), d.equipN, d.cargo ? d.cargo.id : '-', d.home ? 1 : 0,
        d.mine ? debStateSig() : '-'].join('|');   // estado del debate → el panel se re-pinta solo
    }
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
      // Cuenta atrás del debate en curso (si no, se quedaba congelada hasta el siguiente rebuild).
      const dr = charEl.querySelector('#hacp-cp-debrest');
      if (dr && DEB && myId) { const dd = DEB.miDebate(h.id, myId); if (dd) dr.textContent = fmtClock(Math.max(0, Math.ceil((dd.finMs - clock()) / 1000))); }
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
      overlayHost().appendChild(shopEl);
      ['pointerdown', 'pointerup', 'wheel', 'click'].forEach(ev => shopEl.addEventListener(ev, (e) => e.stopPropagation(), { passive: false }));
      shopEl.addEventListener('click', (e) => { if (e.target === shopEl) closeShop(); });   // tocar fuera cierra
      return shopEl;
    }
    // Requisito de STATS de un artículo (item.req = { militar:5, … }): devuelve el
    // primer dominio cuyo nivel (con equipo) no llega, o null si se cumple todo.
    function reqNoCumplido(item) {
      if (!item || !item.req || !myId || !window.HacStats || !HacStats.nivelTotal) return null;
      for (const d in item.req) { if (HacStats.nivelTotal(myId, d) < item.req[d]) return d; }
      return null;
    }
    function itemCardHTML(item, locked) {
      const money = window.HacStats ? HacStats.dinero(myId) : 0;
      const precio = precioMercado(item), rebaja = bonos.mercado > 0 && precio < item.precio;
      const noMoney = money < precio;
      const owned = item.tipo === 'caballo' && window.HacStats && HacStats.tieneCaballo && HacStats.tieneCaballo(myId);
      const reqFail = reqNoCumplido(item);   // dominio cuyo nivel no llega (o null)
      const disabled = locked || !myId || noMoney || owned || !!reqFail;
      const precioHTML = rebaja ? `<s>${item.precio}</s> ${precio}` : `${item.precio}`;
      const btn = locked
        ? `<span class="hacp-item-lock">🔒 Nivel ${item.tier}</span>`
        : owned
          ? `<span class="hacp-item-owned">✔ ${esc((HacStats.caballo(myId) || {}).nombre || 'Tuyo')}</span>`
          : reqFail
            ? `<span class="hacp-item-lock" title="Requiere ${DOM_GLYPH[reqFail]} ${item.req[reqFail]}">🔒 ${DOM_GLYPH[reqFail]} ${item.req[reqFail]}</span>`
            : `<button type="button" class="hacp-item-buy" data-buy="${esc(item.id)}"${disabled ? ' disabled' : ''}>💰 ${precioHTML}</button>`;
      return `<div class="hacp-item${locked ? ' locked' : ''}${item.tipo ? ' t-' + item.tipo : ''}">
        <div class="hacp-item-ic">${item.icon || '∎'}</div>
        <div class="hacp-item-main">
          <div class="hacp-item-name">${esc(item.nombre)} <span class="zh">${esc(item.zh || '')}</span></div>
          <div class="hacp-item-ef">${esc(HacTienda.efectoTexto(item))}</div>
        </div>${btn}</div>`;
    }
    let shopMode = 'comprar';   // 'comprar' | 'vender'
    function buildShop() {
      const el = ensureShopEl();
      const money = window.HacStats ? HacStats.dinero(myId) : 0;
      if (!myId) shopMode = 'comprar';
      const tabs = myId ? `<div class="hacp-shop-tabs">
          <button type="button" class="hacp-shop-tab${shopMode === 'comprar' ? ' on' : ''}" data-mode="comprar">市 Comprar</button>
          <button type="button" class="hacp-shop-tab${shopMode === 'vender' ? ' on' : ''}" data-mode="vender">💰 Vender</button>
        </div>` : '';
      let body;
      if (shopMode === 'vender') {
        const inv = (window.HacStats && HacStats.inventario) ? HacStats.inventario(myId) : [];
        const cards = inv.map(it => { const def = HacTienda.get(it.id); return def ? ventaCardHTML(def, it.n || 1) : ''; }).filter(Boolean);
        body = `<div class="hacp-shop-sub">Véndelo rápido a precio fijo, o <b>regatea</b> con el mercader para sacar más… con riesgo. Tu labia depende de 文·政.</div>
          ${cards.length ? `<div class="hacp-shop-grid">${cards.join('')}</div>`
            : `<div class="hacp-shop-note">No llevas nada que vender en la mochila.</div>`}`;
      } else {
        const disp = HacTienda.stockDelDia ? HacTienda.stockDelDia(tier, h.id) : HacTienda.disponibles(tier);
        const note = !myId ? `<div class="hacp-shop-note">Entra con tu mecenas en esta finca para comprar.</div>` : '';
        body = `<div class="hacp-shop-sub">El mercader renueva su género cada día · ${disp.length} artículos hoy (nivel ${tier}).</div>
          ${bonos.mercado > 0 ? `<div class="hacp-shop-note">Pabellón administrativo: −${pct(bonos.mercado)}% en todos los precios.</div>` : ''}
          ${note}
          <div class="hacp-shop-grid">${disp.map(i => itemCardHTML(i, false)).join('')}</div>`;
      }
      el.innerHTML = `
        <div class="hacp-shop-box">
          <button type="button" class="hacp-shop-x" data-act="shop-close" aria-label="Cerrar">✕</button>
          <div class="hacp-shop-h"><span class="hacp-shop-zh">市</span> Mercado <span class="hacp-shop-money">💰 <b id="hacp-shop-money">${money}</b></span></div>
          ${tabs}
          ${body}
        </div>`;
      el.querySelector('[data-act="shop-close"]').addEventListener('click', closeShop);
      el.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { shopMode = b.dataset.mode; buildShop(); }));
      el.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => buyItem(HacTienda.get(b.dataset.buy))));
      el.querySelectorAll('[data-sell]').forEach(b => b.addEventListener('click', () => abrirRegateo(HacTienda.get(b.dataset.sell))));
      el.querySelectorAll('[data-sellfast]').forEach(b => b.addEventListener('click', () => venderRapido(HacTienda.get(b.dataset.sellfast))));
    }
    function ventaCardHTML(item, n) {
      const enfriado = (window.HacStats && HacStats.ventaEnfriada) ? HacStats.ventaEnfriada(myId, item.id) : false;
      const qty = (n || 1) > 1 ? ` <span class="hacp-item-qty">×${n}</span>` : '';
      if (enfriado) {
        const h = Math.max(1, Math.ceil((HacStats.ventaCdRestanteMs(myId, item.id) || 0) / 3600000));
        return `<div class="hacp-item t-venta enfriado">
          <div class="hacp-item-ic">${item.icon || '∎'}</div>
          <div class="hacp-item-main">
            <div class="hacp-item-name">${esc(item.nombre)}${qty} <span class="zh">${esc(item.zh || '')}</span></div>
            <div class="hacp-item-ef">🧊 El mercader no lo quiere · ~${h} h</div>
          </div></div>`;
      }
      return `<div class="hacp-item t-venta">
        <div class="hacp-item-ic">${item.icon || '∎'}</div>
        <div class="hacp-item-main">
          <div class="hacp-item-name">${esc(item.nombre)}${qty} <span class="zh">${esc(item.zh || '')}</span></div>
          <div class="hacp-item-ef">Rápido 💰 ${ventaRapida(item)} · o regatea (hasta 💰 ${ventaTope(item)})</div>
        </div>
        <div class="hacp-venta-acts">
          <button type="button" class="hacp-item-buy ghost" data-sellfast="${esc(item.id)}">💰 ${ventaRapida(item)}</button>
          <button type="button" class="hacp-item-buy" data-sell="${esc(item.id)}">Regatear</button>
        </div></div>`;
    }
    function openShop() { if (!hasMarket) return; buildShop(); ensureShopEl().hidden = false; }
    function closeShop() { if (shopEl) shopEl.hidden = true; }
    function buyItem(item) {
      if (!item || !myId || !window.HacStats) return;
      if (item.tier > tier) { toast('🔒 Necesita una finca de nivel ' + item.tier); return; }
      const rf = reqNoCumplido(item);
      if (rf) { toast(`Necesitas ${DOM_GLYPH[rf]} ${item.req[rf]} para comprarlo`); return; }
      // CABALLO: compra única con nombre → abre el bautizo (no va a la mochila).
      if (item.tipo === 'caballo') {
        if (HacStats.tieneCaballo(myId)) { toast('Ya tienes un caballo'); return; }
        if (HacStats.dinero(myId) < precioMercado(item)) { toast('No tienes suficiente dinero'); return; }
        abrirBautizoCaballo(item); return;
      }
      const res = HacStats.comprar(myId, item, precioMercado(item));   // precio con descuento del pabellón 政
      if (!res.ok) { toast(res.motivo || 'No se pudo comprar'); return; }
      // La comida ya NO se consume al comprarla: va a la mochila y se come desde su ficha.
      toast(item.efecto && item.efecto.energia
        ? `🎒 ${item.icon || ''} ${item.nombre} · a la mochila (tócalo para comerlo)`.trim()
        : `${item.icon || ''} ${item.nombre} · ${HacTienda.efectoTexto(item)}`.trim());
      buildShop();                 // refresca dinero y botones
      if (charId) buildCharPanel(charId);   // refresca monedero/inventario/energía
    }

    // ── VENTA: rápida (precio fijo) o REGATEO por rondas ─────────────────────────
    //   Regatear es un DUELO de tira y afloja (piedra-papel-tijera de tácticas), como
    //   el debate: cada ronda tu oferta SUBE o BAJA. Puede acabar en un gran trato… o
    //   en que el mercader se harte y se marche (y entonces ese objeto no se puede
    //   vender en 24 h). La labia 文·政 da ventaja, no certeza.
    // ANTI-EXPLOIT: el precio de VENTA es SIEMPRE una fracción (<1) del precio de COMPRA
    // ACTUAL del objeto (precioMercado, ya con descuentos). Así comprar y revender SIEMPRE
    // pierde dinero — no hay bucle de dinero infinito — pase lo que pase con los descuentos.
    // El botín sigue siendo ingreso legítimo (no pagaste por él). Antes el tope llegaba a
    // 2× el precio, lo que permitía comprar barato y regatear caro.
    const ventaBase = (item) => Math.max(1, (typeof precioMercado === 'function') ? precioMercado(item) : (item.precio | 0));
    const ventaTope = (item) => Math.max(1, Math.round(ventaBase(item) * 0.75));    // MEJOR regateo (75% de la compra → siempre pierdes al revender)
    const ventaSuelo = (item) => Math.max(1, Math.round(ventaBase(item) * 0.30));   // peor resultado (si baja aquí, el mercader se marcha)
    const ventaRapida = (item) => Math.max(1, Math.round(ventaBase(item) * 0.50));  // venta rápida sin riesgo
    function regateoLabia() {
      if (!window.HacStats || !HacStats.nivelTotal) return 0;
      return HacStats.nivelTotal(myId, 'cultural') + HacStats.nivelTotal(myId, 'administrativo')
        + (HacStats.bonusRegateo ? HacStats.bonusRegateo(myId) : 0);
    }
    const ventaJusta = (item, labia) => {   // oferta INICIAL (entre suelo y tope), algo mejor con labia
      const b = ventaBase(item);
      return Math.max(ventaSuelo(item) + 1, Math.min(ventaTope(item) - 1, Math.round(b * (0.42 + Math.min(0.16, labia * 0.005)))));
    };
    // Tácticas de regateo (piedra-papel-tijera cíclico). `gesto` = pose de HacChar.
    const REG_TAC = [
      { id: 'presionar', nombre: 'Presionar', zh: '压', vence: 'halagar',   gesto: 'ofensiva',  yo: '«Vale el doble y lo sabes.»',            mer: '«Es lo que hay, o lo dejas.»' },
      { id: 'halagar',   nombre: 'Halagar',   zh: '誉', vence: 'farol',     gesto: 'ingeniosa', yo: '«Una pieza así merece tu mejor precio.»', mer: '«Para un cliente como tú… en fin.»' },
      { id: 'farol',     nombre: 'Farol',     zh: '佯', vence: 'presionar', gesto: 'cautelosa', yo: '«Me lo llevo a otro mercado, entonces.»', mer: '«Anda, vete… ya volverás.»' },
    ];
    const regTacBy = {}; REG_TAC.forEach(t => { regTacBy[t.id] = t; });
    const regVence = (a, b) => !!regTacBy[a] && regTacBy[a].vence === b;
    const REG_PACIENCIA = 4;
    // Aspecto del mercader (coherente con el de la finca) y del jugador (vestido).
    const REG_MERC = { robe: '#3f6e9c', accent: '#d4a83a', piel: 1, pelo: 1 };
    function regYoAspecto() {
      const m = (h.miembros || []).find(x => (x.personajeId || x.id) === myId);
      const pj = (m && m.personajeId && window.HacPersonajes && HacPersonajes.get) ? HacPersonajes.get(m.personajeId) : null;
      const base = pj ? (pj.aspecto || {}) : { robe: color };
      return { aptitud: pj ? pj.aptitud : '', aspecto: (window.HacStats && HacStats.vestir) ? HacStats.vestir(myId, base) : base };
    }
    let ventaEl = null, regAnimT = null;
    function ensureVentaEl() {
      if (ventaEl) return ventaEl;
      ventaEl = document.createElement('div'); ventaEl.className = 'hacp-suc-ov hacp-reg-ov'; ventaEl.hidden = true;
      overlayHost().appendChild(ventaEl);
      ['pointerdown', 'pointerup', 'wheel', 'click'].forEach(ev => ventaEl.addEventListener(ev, (e) => e.stopPropagation(), { passive: false }));
      return ventaEl;
    }
    function cerrarVenta() { if (regAnimT) { clearTimeout(regAnimT); regAnimT = null; } if (ventaEl) ventaEl.hidden = true; }
    // Venta rápida: precio fijo, sin riesgo (para deshacerte de botín sin jugar).
    function venderRapido(item) {
      if (!item || !myId || !window.HacStats) return;
      const p = ventaRapida(item);
      const res = HacStats.venderItem(myId, item.id, p);
      if (!res.ok) { toast(res.motivo || 'No se pudo vender'); return; }
      toast(`💰 Vendiste ${item.nombre} por ${p}`);
      if (window.HacBitacora) HacBitacora.log(myId, 'venta', `💰 Vendiste ${item.nombre} por ${p} monedas`);
      buildShop(); if (charId) buildCharPanel(charId);
    }
    function abrirRegateo(item) {
      if (!item || !myId) return;
      if (window.HacStats && HacStats.ventaEnfriada && HacStats.ventaEnfriada(myId, item.id)) { toast('🧊 El mercader no quiere comprarte eso todavía'); return; }
      const labia = regateoLabia();
      const st = { item, labia, suelo: ventaSuelo(item), tope: ventaTope(item), precio: ventaJusta(item, labia), yo: regYoAspecto(), ronda: 0, paciencia: REG_PACIENCIA, fin: null, last: null, anim: false };
      renderRegateo(ensureVentaEl(), st);
      ensureVentaEl().hidden = false;
    }
    // Resuelve una ronda: elige la táctica del mercader a ciegas, aplica el RPS y
    // mueve la oferta ± según el rango. La labia agranda las subidas y suaviza las bajadas.
    function regRonda(st, mine) {
      st.ronda++;
      const foe = REG_TAC[(Math.random() * REG_TAC.length) | 0].id;
      let win = 'tie';
      if (regVence(mine, foe)) win = 'me'; else if (regVence(foe, mine)) win = 'foe';
      const rango = st.tope - st.suelo, lf = Math.min(0.4, st.labia * 0.012);
      const up = Math.max(1, Math.round(rango * (0.20 + lf * 0.30)));
      const down = Math.max(1, Math.round(rango * (0.20 - lf * 0.12)));
      const antes = st.precio;
      if (win === 'me') st.precio = Math.min(st.tope, st.precio + up);
      else if (win === 'foe') st.precio = Math.max(st.suelo, st.precio - down);
      st.paciencia--;
      st.last = { mine, foe, win, delta: st.precio - antes };
      if (st.precio <= st.suelo) st.fin = 'marcha';          // hundido → el mercader se harta
      else if (st.paciencia <= 0) st.fin = 'trato';          // sin paciencia → cierra a la oferta actual
    }
    function regPct(st) { return Math.max(0, Math.min(100, Math.round(100 * (st.precio - st.suelo) / Math.max(1, st.tope - st.suelo)))); }
    // Dibuja los dos retratos con el gesto adecuado a la fase.
    function regRetratos(el, st) {
      if (!window.HacChar || !HacChar.draw) return;
      const mer = el.querySelector('canvas[data-reg="mer"]'), yo = el.querySelector('canvas[data-reg="yo"]');
      let gMer = null, gYo = null;
      if (st.anim && st.last) {
        gYo = regTacBy[st.last.mine].gesto; gMer = regTacBy[st.last.foe].gesto;
        if (st.last.win === 'me') gMer = 'frustrado';
        if (st.last.win === 'foe') gYo = 'frustrado';
      } else if (st.fin === 'marcha') { gMer = 'frustrado'; }
      try {
        if (mer) HacChar.draw(mer, { aptitud: '', aspecto: REG_MERC, dir: 'SE', pose: 'stand', gesture: gMer, frame: 0, scale: 3 });
        if (yo) HacChar.draw(yo, { aptitud: st.yo.aptitud, aspecto: st.yo.aspecto, dir: 'SW', pose: 'stand', gesture: gYo, frame: 0, scale: 3 });
      } catch (e) {}
    }
    function renderRegateo(el, st) {
      const it = st.item, pct = regPct(st), acabado = !!st.fin;
      const dots = Array.from({ length: REG_PACIENCIA }, (_, i) => `<i class="${i < st.paciencia ? 'on' : ''}"></i>`).join('');
      const clash = st.anim && st.last;
      const burbYo = clash ? `<div class="hacp-reg-bub yo">${esc(regTacBy[st.last.mine].yo)}</div>` : '';
      const burbMer = clash ? `<div class="hacp-reg-bub mer">${esc(regTacBy[st.last.foe].mer)}</div>` : '';
      const flash = clash ? `<div class="hacp-reg-clash ${st.last.win === 'me' ? 'r' : st.last.win === 'foe' ? 'l' : 'c'}">${st.last.win === 'me' ? '＋' : st.last.win === 'foe' ? '－' : '⚔'}</div>` : '';
      const deltaTxt = clash && st.last.delta ? `<div class="hacp-reg-delta ${st.last.delta > 0 ? 'up' : 'down'}">${st.last.delta > 0 ? '+' : ''}${st.last.delta}</div>` : '';
      let estado;
      if (st.fin === 'marcha') estado = `<div class="hacp-reg-hint bad">🧔 «¡Se acabó, no te compro nada!» · no aceptará este objeto en 24 h</div>`;
      else if (st.fin === 'trato') estado = `<div class="hacp-reg-hint">🧔 «Última palabra. ${st.precio} y cerramos.»</div>`;
      else if (clash) estado = `<div class="hacp-reg-hint">Ronda ${st.ronda}: <b>${st.last.win === 'me' ? 'ganas terreno' : st.last.win === 'foe' ? 'cede tu oferta' : 'tablas'}</b></div>`;
      else estado = `<div class="hacp-reg-hint">Tu labia 〔文·政〕 <b>${st.labia}</b> · paciencia del mercader <span class="hacp-reg-pac">${dots}</span></div>`;
      el.innerHTML = `<div class="hacp-suc-box hacp-reg-box${clash ? ' clashing' : ''}">
        <div class="hacp-suc-eyebrow">💰 Regateo · ${esc(it.nombre)} <span class="zh">${esc(it.zh || '')}</span></div>
        <div class="hacp-reg-arena">
          <div class="hacp-reg-fig mer${clash && st.last.win === 'foe' ? ' win' : clash && st.last.win === 'me' ? ' lose' : ''}"><canvas data-reg="mer"></canvas><span class="nm">Mercader</span>${burbMer}</div>
          <div class="hacp-reg-mid">
            <div class="hacp-reg-price"><span>oferta</span><b class="hacp-reg-cur">💰 ${st.precio}</b></div>
            <div class="hacp-reg-beam"><i class="fill" style="width:${pct}%"></i></div>
            <div class="hacp-reg-beamlbl"><span>suelo ${st.suelo}</span><span>trato ${st.tope}</span></div>
            ${deltaTxt}
          </div>
          <div class="hacp-reg-fig yo${clash && st.last.win === 'me' ? ' win' : clash && st.last.win === 'foe' ? ' lose' : ''}"><canvas data-reg="yo"></canvas><span class="nm">Tú</span>${burbYo}</div>
          ${flash}
        </div>
        ${estado}
        <div class="hacp-reg-acts">${
          acabado
            ? (st.fin === 'marcha'
                ? `<button type="button" class="hacp-cp-btn hacp-suc-cancel" data-v-close>Cerrar</button>`
                : `<button type="button" class="hacp-cp-btn hacp-suc-cancel" data-v-close>Dejarlo</button><button type="button" class="hacp-cp-btn hacp-suc-ok" data-v-ok>Aceptar 💰 ${st.precio}</button>`)
            : clash
              ? `<div class="hacp-reg-wait">…</div>`
              : `<div class="hacp-reg-tacs">${REG_TAC.map(t => `<button type="button" class="hacp-reg-tac t-${t.id}" data-tac="${t.id}"><span class="zh">${t.zh}</span><span class="nb">${esc(t.nombre)}</span><span class="beat">vence a ${esc(regTacBy[t.vence].zh)}</span></button>`).join('')}</div>
                 <div class="hacp-reg-close"><button type="button" class="hacp-cp-btn hacp-suc-cancel" data-v-cancel>Dejarlo</button><button type="button" class="hacp-cp-btn hacp-suc-ok" data-v-ok>Aceptar 💰 ${st.precio}</button></div>`
        }</div></div>`;
      regRetratos(el, st);
      const close = el.querySelector('[data-v-close]'); if (close) close.addEventListener('click', cerrarVenta);
      const cancel = el.querySelector('[data-v-cancel]'); if (cancel) cancel.addEventListener('click', cerrarVenta);
      const ok = el.querySelector('[data-v-ok]');
      if (ok) ok.addEventListener('click', () => {
        const res = HacStats.venderItem(myId, it.id, st.precio);
        if (!res.ok) { toast(res.motivo || 'No se pudo vender'); return; }
        cerrarVenta();
        toast(`💰 Vendiste ${it.nombre} por ${st.precio}`);
        if (window.HacBitacora) HacBitacora.log(myId, 'venta', `💰 Regateaste ${it.nombre} y lo vendiste por ${st.precio} monedas`);
        buildShop(); if (charId) buildCharPanel(charId);
      });
      el.querySelectorAll('[data-tac]').forEach(b => b.addEventListener('click', () => {
        if (st.anim || st.fin) return;
        regRonda(st, b.dataset.tac);
        st.anim = true; renderRegateo(el, st);   // fase de choque (gestos + destello + barra)
        regAnimT = setTimeout(() => {
          st.anim = false;
          if (st.fin === 'marcha' && window.HacStats && HacStats.enfriarVenta) {
            HacStats.enfriarVenta(myId, it.id);
            if (window.HacBitacora) HacBitacora.log(myId, 'venta', `🧊 El mercader se hartó de regatear por ${it.nombre}`);
          }
          renderRegateo(el, st);
        }, 1500);
      }));
    }

    // ── Bautizo del CABALLO (compra única) ───────────────────────────────────
    // Nombres sugeridos EN CASTELLANO (glosas de corceles célebres del período); el
    // jugador puede escribir el suyo. Nada de chino aquí: debe entenderse.
    const CABALLO_NOMBRES = ['Liebre Roja', 'Sombra Fugaz', 'Rayo Bayo', 'Azabache', 'Vela Veloz', 'Tormenta'];
    // Pelajes elegibles al bautizar (el `tono` es el color base; la paleta la deriva el
    // simulador). El primero es el que queda seleccionado por defecto.
    const CABALLO_PELAJES = [
      { nombre: 'Bayo',    tono: '#a86b34' },
      { nombre: 'Castaño', tono: '#6b4423' },
      { nombre: 'Blanco',  tono: '#e7e3d9' },
      { nombre: 'Negro',   tono: '#33302b' },
      { nombre: 'Gris',    tono: '#8d8b86' },
    ];
    let caballoEl = null;
    function ensureCaballoEl() {
      if (caballoEl) return caballoEl;
      caballoEl = document.createElement('div'); caballoEl.className = 'hacp-suc-ov hacp-horse-ov'; caballoEl.hidden = true;
      overlayHost().appendChild(caballoEl);
      ['pointerdown', 'pointerup', 'wheel', 'click'].forEach(ev => caballoEl.addEventListener(ev, (e) => e.stopPropagation(), { passive: false }));
      return caballoEl;
    }
    function cerrarBautizo() { if (caballoEl) caballoEl.hidden = true; }
    function abrirBautizoCaballo(item) {
      const el = ensureCaballoEl();
      const sug = CABALLO_NOMBRES[Math.floor(Math.random() * CABALLO_NOMBRES.length)];
      const precio = precioMercado(item);
      el.innerHTML = `<div class="hacp-suc-box hacp-horse-box">
        <div class="hacp-suc-eyebrow">🐎 ${esc(item.zh || '')} · Caballo de raza</div>
        <div class="hacp-suc-ttl">Bautiza a tu corcel</div>
        <div class="hacp-suc-desc">Vivirá suelto por los campos de la finca. Solo tendrás uno · cuesta 💰 ${precio}.</div>
        <div class="hacp-horse-coats">${CABALLO_PELAJES.map((p, i) => `<button type="button" class="hacp-horse-coat${i === 0 ? ' sel' : ''}" data-coat="${p.tono}" title="${esc(p.nombre)}" aria-label="Pelaje ${esc(p.nombre)}"><span class="hacp-horse-coat-sw" style="background:${p.tono}"></span><span class="hacp-horse-coat-nm">${esc(p.nombre)}</span></button>`).join('')}</div>
        <input type="text" class="hacp-horse-in" maxlength="24" value="${esc(sug)}" placeholder="Nombre del caballo" />
        <div class="hacp-horse-sug">${CABALLO_NOMBRES.map(n => `<button type="button" class="hacp-horse-chip" data-nom="${esc(n)}">${esc(n)}</button>`).join('')}</div>
        <div class="hacp-suc-confirm">
          <button type="button" class="hacp-cp-btn hacp-suc-cancel" data-h-cancel>Cancelar</button>
          <button type="button" class="hacp-cp-btn hacp-suc-ok" data-h-ok>Bautizar 💰 ${precio}</button>
        </div></div>`;
      el.hidden = false;
      let coatSel = CABALLO_PELAJES[0].tono;   // pelaje elegido (arranca en el primero, ya marcado)
      const input = el.querySelector('.hacp-horse-in');
      if (input) { try { input.focus(); input.select(); } catch (e) {} }
      el.querySelectorAll('[data-nom]').forEach(b => b.addEventListener('click', () => { if (input) { input.value = b.dataset.nom; input.focus(); } }));
      el.querySelectorAll('[data-coat]').forEach(b => b.addEventListener('click', () => {
        coatSel = b.dataset.coat;
        el.querySelectorAll('[data-coat]').forEach(x => x.classList.toggle('sel', x === b));
      }));
      el.querySelector('[data-h-cancel]').addEventListener('click', cerrarBautizo);
      el.querySelector('[data-h-ok]').addEventListener('click', () => {
        const nombre = (input && input.value || '').trim() || CABALLO_NOMBRES[0];
        const res = HacStats.comprarCaballo(myId, item.id, nombre, precio, coatSel);
        if (!res.ok) { toast(res.motivo || 'No se pudo comprar'); return; }
        cerrarBautizo();
        toast(`🐎 ${esc(res.caballo.nombre)} · ¡tu corcel ronda ya por los campos!`);
        if (window.HacBitacora) HacBitacora.log(myId, 'compra', `🐎 Compraste un caballo y lo llamaste ${res.caballo.nombre}`);
        syncCaballosFolk();          // que aparezca al instante
        buildShop();                 // refresca dinero y marca «ya lo tienes»
        if (charId) buildCharPanel(charId);
      });
    }
    // Pasa al simulador qué mecenas tienen caballo (nombre) → rondan por el exterior.
    function syncCaballosFolk() {
      if (!window.HacFolk || !HacFolk.setCaballos || !window.HacStats || !HacStats.caballo) return;
      const map = {};
      // OJO: HacStats y los walkers se indexan por personajeId (= myId), NO por el id
      // de la fila de miembro. Usar m.id aquí hacía que el caballo comprado no apareciera.
      (h.miembros || []).forEach(m => { const pid = m.personajeId || m.id; const c = HacStats.caballo(pid); if (c) map[pid] = { nombre: c.nombre, variante: c.id || 'caballo', tono: c.tono || null }; });
      HacFolk.setCaballos(map);
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
      overlayHost().appendChild(leaveEl);
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
                <li>Tu progreso (niveles Militar/Cultural/Admin.)</li>
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
      overlayHost().appendChild(homeEl);
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
      overlayHost().appendChild(equipEl);
      ['pointerdown', 'pointerup', 'wheel', 'click'].forEach(ev => equipEl.addEventListener(ev, (e) => e.stopPropagation(), { passive: false }));
      equipEl.addEventListener('click', (e) => { if (e.target === equipEl) closeEquip(); });
      return equipEl;
    }
    function buildEquip() {
      const el = ensureEquipEl();
      const eq = HacStats.equipados(myId);
      const max = HacStats.MAX_EQUIP || 3;
      const me = HacFolk.list().find(w => w.id === myId), nm = me ? me.name : 'tu mecenas';
      // Bonos totales por dominio (plano + niveles del bono % de la ropa de torso).
      const tot = HacStats.DOMS.map(dom => ({ dom, b: HacStats.bonus(myId, dom) + (HacStats.bonusPctNiveles ? HacStats.bonusPctNiveles(myId, dom) : 0) }));
      const totHTML = tot.map(t => `<span class="hacp-eq-tot" style="color:${DOM_COLOR[t.dom]}">${DOM_ABBR[t.dom]} <b>${t.b > 0 ? '+' + t.b : '0'}</b></span>`).join('');
      // TORSO y ARMA tienen su PROPIA ranura dedicada; el resto comparte los `max` huecos.
      const torsoId = eq.find(id => HacStats.slotDe(id) === 'torso') || null;
      const armaId = eq.find(id => HacStats.slotDe(id) === 'arma') || null;
      const genIds = eq.filter(id => HacStats.slotDe(id) === 'gen');
      const torsoFull = !!torsoId, armaFull = !!armaId, genFull = genIds.length >= max;
      // Celda-ranura del PAPER-DOLL. kind: 'torso' | 'arma' | 'acc'.
      const cellHTML = (id, kind) => {
        const def = id && HacTienda.get(id);
        if (def) {
          const ef = HacTienda.efectoTexto(def).replace('Equipable · ', '');
          return `<button type="button" class="hacp-eq-cell full ${kind}${def.raro ? ' rare' : ''}" data-uneq="${esc(id)}" title="${esc(def.nombre + ' · ' + ef)} · clic para quitar"><span class="hacp-eq-cell-ic">${def.icon}</span><span class="hacp-eq-cell-nm">${esc(def.nombre)}</span><span class="hacp-eq-cell-bo">${esc(ef)}</span><span class="hacp-eq-x">✕</span></button>`;
        }
        const ghost = kind === 'torso' ? '👘' : kind === 'arma' ? '⚔️' : '✦';
        const lbl = kind === 'torso' ? 'Torso' : kind === 'arma' ? 'Arma' : 'Vacío';
        return `<div class="hacp-eq-cell empty ${kind}"><span class="hacp-eq-cell-ic ghost">${ghost}</span><span class="hacp-eq-cell-nm">${lbl}</span></div>`;
      };
      const accSlots = []; for (let i = 0; i < max; i++) accSlots.push(cellHTML(genIds[i], 'acc'));
      // Objetos equipables en la mochila (no equipados). Se deshabilitan si su ranura está
      // llena o (armas) si no cumples el requisito de dominio.
      const ownable = HacStats.inventario(myId).filter(it => HacTienda.equipBonus(it.id));
      const list = ownable.length
        ? ownable.map(it => {
            const def = HacTienda.get(it.id), esT = def.slot === 'torso', esA = def.slot === 'arma';
            const reqNo = esA ? reqNoCumplido(def) : null;
            const full = (esT ? torsoFull : esA ? armaFull : genFull) || !!reqNo;
            const tip = reqNo ? ` title="Necesitas ${DOM_GLYPH[reqNo] || reqNo} ${def.req[reqNo]}"` : '';
            return `<button type="button" class="hacp-eq-own${def.raro ? ' rare' : ''}${esT ? ' torso' : ''}${esA ? ' arma' : ''}" data-eq="${esc(it.id)}"${full ? ' disabled' : ''}${tip}><span class="hacp-eq-ic">${def.icon}</span><span class="hacp-eq-nm">${esc(def.nombre)}${(it.n || 1) > 1 ? ' ×' + it.n : ''}${reqNo ? ' 🔒' : ''}</span><span class="hacp-eq-bo">${esc(HacTienda.efectoTexto(def).replace('Equipable · ', ''))}</span></button>`;
          }).join('')
        : '<span class="hacp-inv-note">No tienes objetos equipables. Cómpralos en el mercado (tratados, sellos, armas…) o consíguelos como botín (ropas de torso, armas).</span>';
      el.innerHTML = `
        <div class="hacp-shop-box hacp-eq-box">
          <button type="button" class="hacp-shop-x" data-act="equip-close" aria-label="Cerrar">✕</button>
          <div class="hacp-shop-h"><span class="hacp-shop-zh">⚔</span> Equipo de ${esc(nm)}</div>
          <div class="hacp-shop-sub">Viste a tu mecenas: una prenda de torso, un arma y hasta ${max} accesorios. Bonos: ${totHTML}</div>
          <div class="hacp-eq-doll">
            <div class="hacp-eq-dollcol">
              <div class="hacp-eq-dolllbl">Torso 袍</div>
              ${cellHTML(torsoId, 'torso')}
            </div>
            <div class="hacp-eq-figure"><canvas class="hacp-eq-fig-cv" width="120" height="168"></canvas></div>
            <div class="hacp-eq-dollcol">
              <div class="hacp-eq-dolllbl">Arma 兵</div>
              ${cellHTML(armaId, 'arma')}
            </div>
          </div>
          <div class="hacp-eq-slotlbl">Accesorios 具 <span class="hacp-eq-cap">${genIds.length}/${max}</span></div>
          <div class="hacp-eq-accrow">${accSlots.join('')}</div>
          <div class="hacp-eq-h">En la mochila</div>
          <div class="hacp-eq-list">${list}</div>
        </div>`;
      // Dibuja al mecenas en el centro (vestido con lo que lleva: la túnica se ve en vivo).
      const cv = el.querySelector('.hacp-eq-fig-cv');
      if (cv && window.HacChar && HacChar.draw) { const a = regYoAspecto(); try { HacChar.draw(cv, { aptitud: a.aptitud, aspecto: a.aspecto, dir: 'S', pose: 'stand', frame: 0, scale: 3 }); } catch (e) {} }
      el.querySelector('[data-act="equip-close"]').addEventListener('click', closeEquip);
      const refrescar = () => { buildEquip(); if (charId) buildCharPanel(charId); };
      el.querySelectorAll('[data-eq]').forEach(b => b.addEventListener('click', () => { const r = HacStats.equipar(myId, b.dataset.eq); if (!r.ok) toast(r.motivo); refrescar(); }));
      el.querySelectorAll('[data-uneq]').forEach(b => b.addEventListener('click', () => { const r = HacStats.desequipar(myId, b.dataset.uneq); if (!r.ok) toast(r.motivo); refrescar(); }));
    }
    function openEquip() { if (!myId || !window.HacStats) return; buildEquip(); ensureEquipEl().hidden = false; }
    function closeEquip() { if (equipEl) equipEl.hidden = true; }

    // ══ HACIENDA PRODUCTIVA (Fase 1, personal) ═══════════════════════════════
    let prodEl = null, jornEl = null;
    const prodDia = () => (window.HacProd ? HacProd.diaStr() : '');
    const prodOk = () => !!(myId && window.HacProd && window.HacStats && HacStats.recursos);
    const refrescarProd = () => { if (prodEl && !prodEl.hidden) buildProd(); if (charId) buildCharPanel(charId); };
    // ATADO A EDIFICIOS: nº de edificios de un dominio en ESTA finca (los de CLASE
    // —校場/太學/官署— cuentan doble, como en la sinergia). Fija el TECHO del oficio.
    function edificiosDominio(dom) {
      const cons = (h.mapa && Array.isArray(h.mapa.construcciones)) ? h.mapa.construcciones : [];
      let n = 0; cons.forEach(c => { const t = window.HacBuild && HacBuild.tipo && HacBuild.tipo(c.tipo); if (t && t.dominio === dom) n += t.restringido ? 2 : 1; });
      return n;
    }
    // Techo de nivel del oficio según los edificios de su dominio: sin edificios → 1
    // (trabajas básico, no mejoras); cada edificio del dominio sube el techo (máx 5).
    function oficioTecho(of) { const O = HacProd.OFICIOS[of]; return Math.max(1, Math.min(HacProd.NIVEL_MAX, 1 + edificiosDominio(O.dom))); }
    // Nº de encargos ENTREGABLES ahora (para el badge rojo del botón Producción).
    function encargosEntregables() {
      if (!prodOk()) return 0;
      const dia = prodDia(), hechos = HacStats.encargosHechos(myId, dia);
      return HacProd.encargosDelDia(h.id, tier).filter(e => hechos.indexOf(e.id) < 0 && HacStats.recursoDesdeCal(myId, e.recurso, e.calMin) >= e.cantidad).length;
    }
    function ensureProdEl() {
      if (prodEl) return prodEl;
      prodEl = document.createElement('div'); prodEl.className = 'hacp-shop hacp-prod-ov'; prodEl.hidden = true; overlayHost().appendChild(prodEl);
      ['pointerdown', 'pointerup', 'wheel', 'click'].forEach(ev => prodEl.addEventListener(ev, (e) => e.stopPropagation(), { passive: false }));
      prodEl.addEventListener('click', (e) => { if (e.target === prodEl) closeProd(); });
      return prodEl;
    }
    function closeProd() { if (prodEl) prodEl.hidden = true; }
    function openProd() {
      if (!prodOk()) return;
      // Recoge la RENTA pasiva al abrir (momento de feedback).
      const recs = {}; let rec = 0;
      HacProd.OFICIO_IDS.forEach(of => { const o = HacProd.OFICIOS[of], niv = HacStats.oficioNivel(myId, of); const g = HacStats.recolectarRenta(myId, of, HacProd.rentaPorHora(niv), HacProd.rentaCap(niv), o.recurso); if (g > 0) { rec += g; recs[o.recurso] = (recs[o.recurso] || 0) + g; } });
      if (rec > 0) toast('🧺 Renta del feudo: ' + Object.keys(recs).map(r => `+${recs[r]} ${HacProd.RECURSOS[r].icon}`).join(' · '));
      buildProd(); ensureProdEl().hidden = false;
    }
    function buildProd() {
      const el = ensureProdEl(), dia = prodDia();
      const almacen = HacProd.RECURSO_IDS.map(rec => {
        const R = HacProd.RECURSOS[rec], tot = HacStats.recursoTotal(myId, rec), m = HacStats.recursos(myId)[rec] || {};
        const cals = [1, 2, 3, 4, 5].filter(q => m[q] > 0).map(q => `<span class="hacp-prod-cal c${q}">${q}·${m[q]}</span>`).join('');
        const bajo = (Number(m[1]) || 0) + (Number(m[2]) || 0);
        return `<div class="hacp-prod-res"><span class="ic">${R.icon}</span><span class="nm">${esc(R.nombre)}</span><b>${tot}</b><span class="cals">${cals || '—'}</span>${bajo > 0 ? `<button type="button" class="hacp-prod-mini" data-vender="${rec}" title="Vende el excedente de calidad 1 y 2 (guarda la calidad alta para encargos)">Vender cal ≤2</button>` : ''}</div>`;
      }).join('');
      const oficios = HacProd.OFICIO_IDS.map(of => {
        const O = HacProd.OFICIOS[of], niv = HacStats.oficioNivel(myId, of), R = HacProd.RECURSOS[O.recurso];
        const rph = HacProd.rentaPorHora(niv), cap = HacProd.rentaCap(niv), c = HacProd.costeMejora(niv);
        const techo = oficioTecho(of), edif = edificiosDominio(O.dom);
        const enTope = niv >= HacProd.NIVEL_MAX, enTecho = niv >= techo;   // enTecho = limitado por los edificios de la finca
        const puede = !enTope && !enTecho && HacStats.recursoDesdeCal(myId, O.recurso, c.calMin) >= c.uds && HacStats.dinero(myId) >= c.dinero;
        const mLbl = enTope ? 'Nivel máx' : enTecho ? `Faltan edificios ${DOM_GLYPH[O.dom]}` : `Mejorar · ${c.uds}${R.icon}≥${c.calMin} +${c.dinero}💰`;
        const edifTxt = edif > 0 ? `${edif} edif. ${DOM_GLYPH[O.dom]} → techo niv ${techo}` : `sin edificios ${DOM_GLYPH[O.dom]} → techo niv 1 (constrúyelos para mejorar)`;
        return `<div class="hacp-prod-of">
          <div class="hacp-prod-of-h"><span class="ic">${O.icon}</span><span class="nm">${esc(O.nombre)} <i>${O.zh}</i></span><span class="niv" style="color:${DOM_COLOR[O.dom]}">${DOM_GLYPH[O.dom]} niv ${niv}</span></div>
          <div class="hacp-prod-of-sub">Produce ${R.icon} ${esc(R.nombre)} · renta ${rph}/h (tope ${cap}) · <span class="hacp-prod-edif">${edifTxt}</span></div>
          <div class="hacp-prod-of-acts"><button type="button" class="hacp-cp-btn hacp-suc-ok" data-trabajar="${of}">${esc(O.verbo)} 勞作</button><button type="button" class="hacp-cp-btn${enTecho && !enTope ? ' hacp-prod-locked' : ''}" data-mejorar="${of}"${enTope || !puede ? ' disabled' : ''}>${mLbl}</button></div>
        </div>`;
      }).join('');
      const hechos = HacStats.encargosHechos(myId, dia);
      const encargos = HacProd.encargosDelDia(h.id, tier).map(e => {
        const R = HacProd.RECURSOS[e.recurso], hecho = hechos.indexOf(e.id) >= 0, tengo = HacStats.recursoDesdeCal(myId, e.recurso, e.calMin), listo = !hecho && tengo >= e.cantidad;
        return `<div class="hacp-prod-enc${hecho ? ' done' : listo ? ' listo' : ''}"><span class="ic">${R.icon}</span>
          <span class="txt"><b>${e.cantidad}</b> ${esc(R.nombre)} cal≥${e.calMin} · <span class="rew">${e.dinero}💰 +${e.prestigio}★</span><br><span class="prog">tienes ${Math.min(tengo, e.cantidad)}/${e.cantidad}</span></span>
          ${hecho ? '<span class="hacp-prod-encok">✔ hecho</span>' : `<button type="button" class="hacp-cp-btn hacp-suc-ok" data-entregar="${esc(e.id)}"${listo ? '' : ' disabled'}>Entregar</button>`}</div>`;
      }).join('');
      el.innerHTML = `<div class="hacp-shop-box hacp-prod-box">
        <button type="button" class="hacp-shop-x" data-act="prod-close" aria-label="Cerrar">✕</button>
        <div class="hacp-shop-h"><span class="hacp-shop-zh">產</span> Hacienda productiva</div>
        <div class="hacp-shop-sub">Trabaja los oficios para producir recursos con calidad, cumple encargos del día y mejora tu feudo. Trabajar cuesta energía y sube tu dominio (XP).</div>
        <div class="hacp-prod-seclbl">Almacén 倉</div>
        <div class="hacp-prod-tip">Cada unidad tiene <b>calidad 1–5</b> · trabajar y <b>subir el oficio</b> dan más calidad · los encargos piden una calidad mínima.</div>
        <div class="hacp-prod-alm">${almacen}</div>
        <div class="hacp-prod-seclbl">Oficios 工</div><div class="hacp-prod-ofs">${oficios}</div>
        <div class="hacp-prod-seclbl">Encargos del día 委託</div><div class="hacp-prod-encs">${encargos}</div>
      </div>`;
      el.querySelector('[data-act="prod-close"]').addEventListener('click', closeProd);
      el.querySelectorAll('[data-trabajar]').forEach(b => b.addEventListener('click', () => abrirJornada(b.dataset.trabajar)));
      el.querySelectorAll('[data-mejorar]').forEach(b => b.addEventListener('click', () => mejorarOficio(b.dataset.mejorar)));
      el.querySelectorAll('[data-entregar]').forEach(b => b.addEventListener('click', () => entregarEncargo(b.dataset.entregar)));
      el.querySelectorAll('[data-vender]').forEach(b => b.addEventListener('click', () => venderRecurso(b.dataset.vender)));
    }
    function mejorarOficio(of) {
      const O = HacProd.OFICIOS[of]; if (!O) return; const niv = HacStats.oficioNivel(myId, of); if (niv >= HacProd.NIVEL_MAX) return;
      if (niv >= oficioTecho(of)) { toast(`Necesitas más edificios ${DOM_GLYPH[O.dom]} en la finca para subir este oficio`); return; }
      const c = HacProd.costeMejora(niv), R = HacProd.RECURSOS[O.recurso];
      if (HacStats.recursoDesdeCal(myId, O.recurso, c.calMin) < c.uds) { toast(`Necesitas ${c.uds} ${R.icon} de calidad ≥${c.calMin}`); return; }
      if (HacStats.dinero(myId) < c.dinero) { toast('No tienes suficiente dinero'); return; }
      HacStats.quitaRecurso(myId, O.recurso, c.calMin, c.uds); HacStats.award(myId, { dinero: -c.dinero });
      const nn = HacStats.subirOficio(myId, of);
      toast(`${O.icon} ${O.nombre} sube a nivel ${nn}`);
      if (window.HacBitacora) HacBitacora.log(myId, 'progreso', `工 ${O.nombre} mejora a nivel ${nn}`);
      refrescarProd();
    }
    function entregarEncargo(id) {
      const dia = prodDia(), e = HacProd.encargosDelDia(h.id, tier).find(x => x.id === id); if (!e) return;
      if (HacStats.encargosHechos(myId, dia).indexOf(id) >= 0) return;
      if (!HacStats.quitaRecurso(myId, e.recurso, e.calMin, e.cantidad)) { toast('Te falta material para el encargo'); return; }
      HacStats.award(myId, { dinero: e.dinero });
      if (window.HacPuntos && HacPuntos.award) HacPuntos.award(h.id, myId, e.prestigio);
      retoAdd('prestigio', e.prestigio);
      HacStats.marcarEncargo(myId, dia, id);
      toast(`✔ Encargo cumplido · +${e.dinero}💰 · +${e.prestigio}★`);
      if (window.HacBitacora) HacBitacora.log(myId, 'progreso', `委 Cumpliste un encargo de ${HacProd.RECURSOS[e.recurso].nombre} · +${e.dinero}💰`);
      refrescarProd();
    }
    function venderRecurso(rec) {
      const m = HacStats.recursos(myId)[rec] || {}, n1 = Number(m[1]) || 0, n2 = Number(m[2]) || 0;
      if (n1 + n2 <= 0) { toast('No hay excedente (calidad ≤2) que vender'); return; }
      const total = n1 * HacProd.precioVenta(rec, 1) + n2 * HacProd.precioVenta(rec, 2);
      HacStats.quitaCal(myId, rec, 1, n1); HacStats.quitaCal(myId, rec, 2, n2);
      HacStats.award(myId, { dinero: total });
      toast(`💰 Vendiste ${n1 + n2} ${HacProd.RECURSOS[rec].icon} (excedente) · +${total}💰`);
      if (window.HacBitacora) HacBitacora.log(myId, 'venta', `商 Vendiste excedente de ${HacProd.RECURSOS[rec].nombre} · +${total}💰`);
      refrescarProd();
    }
    // ── La JORNADA (empujar la suerte) ──────────────────────────────────────
    function ensureJornEl() {
      if (jornEl) return jornEl;
      jornEl = document.createElement('div'); jornEl.className = 'hacp-suc-ov hacp-jorn-ov'; jornEl.hidden = true; overlayHost().appendChild(jornEl);
      ['pointerdown', 'pointerup', 'wheel', 'click'].forEach(ev => jornEl.addEventListener(ev, (e) => e.stopPropagation(), { passive: false }));
      return jornEl;
    }
    function cerrarJornEl() { stopJornFig(); if (jornEl) jornEl.hidden = true; }
    // Figura del mecenas TRABAJANDO el oficio, animada (rAF) mientras dura la jornada.
    let jornRAF = 0;
    function stopJornFig() { if (jornRAF) { cancelAnimationFrame(jornRAF); jornRAF = 0; } }
    function pintaJornFig(cv, st) {
      stopJornFig();
      if (!cv || !window.HacChar || !HacChar.draw) return;
      const a = regYoAspecto();
      const frame = (opts) => { try { HacChar.draw(cv, Object.assign({ aptitud: a.aptitud, aspecto: a.aspecto, dir: 'SE', scale: 3, frame: 0 }, opts)); } catch (e) {} };
      if (st.fin) { frame({ pose: 'stand', gesture: st.fin === 'chapuza' ? 'frustrado' : null }); return; }   // terminada: reacción de pie
      if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) { frame({ pose: 'work', oficio: st.of, workPhase: 0.72 }); return; }
      const DUR = 1100; if (!st.animT0) st.animT0 = performance.now();
      const loop = () => {
        if (!cv.isConnected || (jornEl && jornEl.hidden)) { stopJornFig(); return; }
        frame({ pose: 'work', oficio: st.of, workPhase: ((performance.now() - st.animT0) % DUR) / DUR });
        jornRAF = requestAnimationFrame(loop);
      };
      jornRAF = requestAnimationFrame(loop);
    }
    function abrirJornada(of) {
      const O = HacProd.OFICIOS[of]; if (!O || !myId) return;
      const st = { of, O, recurso: O.recurso, dom: O.dom, nivel: HacStats.oficioNivel(myId, of), lote: {}, total: 0, sumCal: 0, fatiga: 0, esf: 0, fin: null, last: null };
      renderJornada(ensureJornEl(), st); ensureJornEl().hidden = false;
    }
    function jornQuitaLote(st, n) { let f = n; for (let q = 1; q <= 5 && f > 0; q++) { const d = st.lote[q] || 0, u = Math.min(d, f); if (u > 0) { st.lote[q] = d - u; f -= u; st.total -= u; st.sumCal -= q * u; } } }
    function jornEsforzar(st) {
      const nivDom = HacStats.nivelTotal(myId, st.dom);
      if (!window.HacEnergia || HacEnergia.current(h.id, myId) < HacProd.E_ESF) { st.fin = 'sinenergia'; st.last = { sinen: true }; return; }
      HacEnergia.spend(h.id, myId, HacProd.E_ESF);
      const e = HacProd.esfuerzo(nivDom, st.nivel, st.fatiga, st.esf, Math.random(), Math.random());
      st.esf++; st.fatiga = e.fatiga;
      if (e.chapuza) { const perd = Math.round(st.total * HacProd.CHAPUZA_PERDIDA); jornQuitaLote(st, perd); st.last = { chapuza: true, perd }; st.fin = 'chapuza'; return; }
      st.lote[e.cal] = (st.lote[e.cal] || 0) + e.rinde; st.total += e.rinde; st.sumCal += e.cal * e.rinde; st.last = { rinde: e.rinde, cal: e.cal };
    }
    function jornBanco(st) { if (st.total > 0) { HacStats.addLote(myId, st.recurso, st.lote); HacStats.award(myId, { xp: { [st.dom]: st.total * HacProd.XP_UD } }); } }
    function renderJornada(el, st) {
      const O = st.O, R = HacProd.RECURSOS[st.recurso], nivDom = HacStats.nivelTotal(myId, st.dom);
      const media = st.total ? (st.sumCal / st.total) : 0, ener = window.HacEnergia ? Math.round(HacEnergia.current(h.id, myId)) : 0;
      const fat = Math.min(1, st.fatiga), pNext = HacProd.esfuerzo(nivDom, st.nivel, st.fatiga, st.esf, 1, 0.5).pChapuza, acabado = !!st.fin;
      const flash = st.last && st.last.chapuza ? `<div class="hacp-jorn-flash bad">¡Chapuza! −${st.last.perd}</div>` : (st.last && st.last.rinde ? `<div class="hacp-jorn-flash">+${st.last.rinde} · cal ${st.last.cal}</div>` : '');
      let estado;
      if (st.fin === 'chapuza') estado = `<div class="hacp-jorn-hint bad">Se te estropeó parte del lote. Fin de la jornada.</div>`;
      else if (st.fin === 'sinenergia') estado = `<div class="hacp-jorn-hint">Sin energía para seguir · recoge lo trabajado.</div>`;
      else estado = `<div class="hacp-jorn-hint">Energía ${ener}⚡ · riesgo de chapuza <b class="${pNext > 0.20 ? 'r' : ''}">${Math.round(pNext * 100)}%</b></div>`;
      const cals = [1, 2, 3, 4, 5].filter(q => st.lote[q]).map(q => `${R.icon}${q}·${st.lote[q]}`).join('  ') || '—';
      const frases = O.frases || [];
      const say = st.fin === 'chapuza' ? '¡Se te fue de las manos!' : (st.esf === 0 ? `Te dispones a ${esc(O.verbo.toLowerCase())}…` : (frases.length ? esc(frases[(st.esf - 1) % frases.length]) + '…' : ''));
      el.innerHTML = `<div class="hacp-suc-box hacp-jorn-box">
        <div class="hacp-suc-eyebrow">${O.icon} ${esc(O.verbo)} · ${esc(R.nombre)} <span class="zh">${R.zh}</span></div>
        ${say ? `<div class="hacp-jorn-say">「${say}」</div>` : ''}
        <div class="hacp-jorn-arena">
          <div class="hacp-jorn-fig"><canvas class="hacp-jorn-cv" width="120" height="168"></canvas></div>
          <div class="hacp-jorn-mid">
            <div class="hacp-jorn-lote"><span>lote</span><b>${st.total}</b> <i>${R.icon}</i></div>
            <div class="hacp-jorn-media">calidad media ${media ? media.toFixed(1) : '—'}</div>
            <div class="hacp-jorn-fat"><i style="width:${Math.round(fat * 100)}%"></i></div>
            <div class="hacp-jorn-cals">${cals}</div>
            ${flash}
          </div>
        </div>
        ${estado}
        <div class="hacp-jorn-acts">${acabado
          ? `<button type="button" class="hacp-cp-btn hacp-suc-ok" data-jorn-cerrar>Recoger${st.total ? ` ${st.total} ${R.icon}` : ''}</button>`
          : `<button type="button" class="hacp-cp-btn hacp-suc-cancel" data-jorn-cerrar>Cerrar el lote${st.total ? ` (${st.total}${R.icon})` : ''}</button><button type="button" class="hacp-cp-btn hacp-suc-ok" data-jorn-seguir${ener < HacProd.E_ESF ? ' disabled' : ''}>Seguir (−${HacProd.E_ESF}⚡)</button>`}</div>
      </div>`;
      pintaJornFig(el.querySelector('.hacp-jorn-cv'), st);
      const seg = el.querySelector('[data-jorn-seguir]'); if (seg) seg.addEventListener('click', () => { jornEsforzar(st); renderJornada(el, st); });
      const cer = el.querySelector('[data-jorn-cerrar]'); if (cer) cer.addEventListener('click', () => { jornBanco(st); cerrarJornEl(); if (st.total > 0) toast(`${O.icon} Lote: ${st.total} ${R.icon} · cal media ${(st.sumCal / st.total).toFixed(1)} · +${st.total * HacProd.XP_UD} XP ${HacProd.GLIFOS[st.dom]}`); refrescarProd(); });
    }

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
      const tomadas = window.HacMisTomadas ? HacMisTomadas.tomadasHoy(h.id) : new Set();   // las que YA cogiste hoy → fuera del tablón
      const list = (window.HacMisiones ? HacMisiones.disponibles(tier) : []).filter(m => !tomadas.has(m.id));
      const ocupado = ocupadoAhora(myId);   // orden activa O banda/peregrinaje (incl. 'abierta')
      const energia = window.HacEnergia ? HacEnergia.current(h.id, myId) : 100;
      const rows = list.slice().sort((a, b) => (a.dom < b.dom ? -1 : a.dom > b.dom ? 1 : a.dif - b.dif)).map(m => {
        const risk = riesgoMision(m), rc = HacMisiones.nivelColor(risk), rec = HacMisiones.recompensa(m);
        const en = costeExped(m), sinEn = energia < en, loot = Math.round(HacMisiones.lootChance(m.dif) * 100);
        const rm = retoMultMision(m);                                             // rutina si va muy por debajo de tu nivel
        const dinB = Math.round(conBono(rec.dinero, bonos.dinero) * rm), xpB = Math.round(conBono(rec.xp, xpFracMision(m.dom)) * rm);   // ya con bonos de pabellón
        const rutina = rm < 1 ? ` <span class="hacp-mis-rutina" title="Rutina: muy por debajo de tu nivel, rinde ${Math.round(rm * 100)}%">rutina</span>` : '';
        const rapido = durExped(m) < HacMisiones.durSeg(m) ? '<sup class="hacp-bono">↓</sup>' : '';
        // ENCUENTROS: bloque claro con RECUENTO + una ficha por aptitud (nombre + tu %).
        const encBlock = (m.enc && m.enc.length)
          ? `<div class="hacp-mis-encs" title="Retos a mitad del viaje: resuélvelos con la aptitud indicada. Sale bien según tu %, y suma recompensa (o resta si fallas).">
               <span class="hacp-mis-encs-h">⚑ ${m.enc.length} ${m.enc.length > 1 ? 'encuentros' : 'encuentro'} en el camino</span>
               ${m.enc.map(d => {
                 const ep = Math.round(pEncuentro(d, m.dif) * 100);
                 return `<span class="hacp-enc-chip" style="--dc:${DOM_COLOR[d] || 'var(--gold)'}">${domIcon(d, 'hacp-enc-chip-i')} ${DOM_NOMBRE[d]} <b>${ep}%</b></span>`;
               }).join('')}
             </div>`
          : '';
        return `<div class="hacp-mis t-${m.dom}">
          <span class="hacp-mis-g" style="--dc:${DOM_COLOR[m.dom] || 'var(--gold)'}">${domIcon(m.dom, 'hacp-mis-gi')}</span>
          <div class="hacp-mis-main">
            <div class="hacp-mis-name">${esc(m.nombre)} <span class="hacp-mis-dif">dif. ${m.dif}</span>${rutina}</div>
            <div class="hacp-mis-rewards">
              <span class="hacp-rw rw-din" title="Dinero que traes al volver">💰 <b>+${dinB}</b>${bonos.dinero ? '<sup class="hacp-bono">↑</sup>' : ''}</span>
              <span class="hacp-rw rw-xp" title="Experiencia de ${DOM_NOMBRE[m.dom]}">⭐ <b>+${xpB}</b> XP${xpFracMision(m.dom) > 0 ? '<sup class="hacp-bono">↑</sup>' : ''}</span>
              <span class="hacp-rw rw-loot" title="Probabilidad de traer un objeto de botín">🎁 <b>${loot}%</b></span>
              <span class="hacp-rw rw-time" title="Duración del viaje">⏱ ${fmtClock(durExped(m))}${rapido}</span>
              <span class="hacp-rw rw-en${sinEn ? ' noen' : ''}" title="Energía que cuesta salir">⚡ <b>−${en}</b></span>
            </div>
            ${encBlock}
          </div>
          <div class="hacp-mis-side">
            <span class="hacp-mis-risk r-${rc}" title="Riesgo de fracaso (baja con tu nivel de ${DOM_NOMBRE[m.dom]} y el equipo)"><i>Riesgo</i><b>⚠ ${Math.round(risk * 100)}%</b></span>
            <button type="button" class="hacp-mis-go" data-mis="${esc(m.id)}"${ocupado || sinEn ? ' disabled' : ''} title="${sinEn ? 'Energía insuficiente' : ''}">Enviar</button>
          </div>
        </div>`;
      }).join('');
      // Banner de ENCUENTROS pendientes: mientras queden, la misión no cobra y no puedes
      // enviar otra (el mecenas sigue ocupado). Si ya son resolubles, botón «Atender».
      const e = miExped();
      const hayEnc = !!(e && encPend(e.o, e.mis));
      const encHot = hayEnc && !!encResolvible(e.o, e.mis);
      const nEnc = (e && e.mis && e.mis.enc) ? e.mis.enc.length : 0;
      const encBanner = hayEnc
        ? `<div class="hacp-board-encb${encHot ? ' hot' : ''}">
            <span>${encHot
              ? `⚑ Tu expedición <b>«${esc(e.mis.nombre)}»</b> tiene un <b>encuentro</b> que atender antes de cobrar.`
              : `Tu expedición <b>«${esc(e.mis.nombre)}»</b> traerá <b>${nEnc}</b> ${nEnc > 1 ? 'encuentros' : 'encuentro'} por el camino.`}</span>
            ${encHot ? '<button type="button" class="hacp-cp-btn" data-act="enc-go">Atender</button>' : ''}
          </div>`
        : '';
      const vacio = tomadas.size
        ? '✔ Has agotado las misiones de hoy · el tablón se renueva mañana.'
        : 'No hay misiones disponibles.';
      el.innerHTML = `
        <div class="hacp-shop-box">
          <button type="button" class="hacp-shop-x" data-act="board-close" aria-label="Cerrar">✕</button>
          <div class="hacp-shop-h"><span class="hacp-shop-zh">📜</span> Tablón de misiones <span class="hacp-shop-money">⚡ <b>${Math.round(energia)}</b></span></div>
          ${retosStripHTML()}
          <div class="hacp-board-seclbl">檄 Misiones disponibles</div>
          <div class="hacp-shop-sub">Cada misión que <b>coges</b> desaparece de tu tablón hasta mañana. A tu nivel es una apuesta real; superarla baja el riesgo (nunca es gratis). Las muy por debajo de tu nivel son <b>rutina</b> y pagan menos. Las difíciles cuestan más ⚡ y dan más 🎁 botín.${ocupado ? ' <b>Tu mecenas ya está ocupado en otra actividad.</b>' : ''}</div>
          <div class="hacp-board-legend">⚑ El icono de bandera marca <b>encuentros</b>: mini-retos que aparecen a mitad del viaje y resuelves con la aptitud indicada (con una animación). Si sale bien suman recompensa; si fallas, restan. El % es tu probabilidad de superarlos.</div>
          ${hayBonos() ? `<div class="hacp-shop-note">Bonos de los pabellones de la finca: ${bonosTexto()}</div>` : ''}
          ${encBanner}
          <div class="hacp-board-list">${rows || `<div class="hacp-inv-note">${vacio}</div>`}</div>
        </div>`;
      el.querySelector('[data-act="board-close"]').addEventListener('click', closeBoard);
      const encGo = el.querySelector('[data-act="enc-go"]');
      if (encGo) encGo.addEventListener('click', abrirEncuentrosPend);
      el.querySelectorAll('[data-mis]').forEach(b => b.addEventListener('click', () => {
        dispatchMision(b.dataset.mis);
        toast('🧭 Tu mecenas parte a la misión'); closeBoard();
      }));
    }
    function openMissionBoard() { if (!myId) return; buildBoard(); ensureBoardEl().hidden = false; }
    function closeBoard() { if (boardEl) boardEl.hidden = true; }
    // "Buscar misiones": el mecenas CAMINA al TABLÓN de anuncios; al llegar se planta
    // delante con el cartelito 📜 y, al pulsarlo, se abre el tablón. Si ya está allí, abre ya.
    function goConsultBoard() {
      if (!myId || !hasTablon || !tablonBid) return;
      if (abrirEncuentrosPend()) return;   // hay un encuentro que atender: se resuelve antes que el tablón
      openMissionBoard();                  // abre el listado DIRECTAMENTE (sin caminar al tablón)
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

    HacFolk.start(iso, { mapa: h.mapa, tier, color, miembros: h.miembros, onState: applyOrders, seedKey: h.id, haciendaId: h.id, ordenes: {}, getTransform: (cam && cam.getT) || null });
    if (cam && cam.setOnApply) cam.setOnApply(() => { if (window.HacFolk && HacFolk.repaintOverlay) HacFolk.repaintOverlay(); });
    renderList();
    // Carga órdenes + energía + competencias (compartidas); refresca por poll (≤5 s).
    if (window.HacEnergia) HacEnergia.ready().then(refresh);
    if (window.HacCompetencias) HacCompetencias.ready().then(refresh);
    if (window.HacPuntos) HacPuntos.ready().then(refresh);
    if (window.HacStats) HacStats.ready().then(refresh);
    const escPulse = () => { syncEscaramuzaOrder(); resolverEscaramuzaSiToca(); autoClaimBotinSiToca(); logEscaramuzaResultado(); procesarRelacionesSiToca(); notifyRelacionesNuevas(); syncEscaramuzaFolk(); escRefresh(); };
    if (window.HacBitacora) HacBitacora.ready();
    if (window.HacRelaciones) HacRelaciones.ready();
    if (window.HacEscaramuzas) HacEscaramuzas.ready().then(escPulse);
    if (DEB) DEB.ready().then(debPulse);
    if (window.HacBuff) HacBuff.ready().then(() => { if (charId) refreshCharPanel(); });   // bono de hacienda (F2)
    if (window.HacMisTomadas) HacMisTomadas.ready();   // misiones ya cogidas hoy (para esconderlas del tablón)
    if (window.HacRetos) HacRetos.ready().then(checkConvocatoria);   // retos semanales: avisa si ya están cumplidos
    if (window.HacOrdenes) {
      HacOrdenes.ready().then(applyOrders);
      setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return;   // no machaques en segundo plano
        if (window.HacEnergia) HacEnergia.reload();
        if (window.HacCompetencias) HacCompetencias.reload();
        if (window.HacPuntos) HacPuntos.reload();
        if (window.HacStats) HacStats.reload();
        if (window.HacRelaciones) HacRelaciones.reload();
        if (window.HacEscaramuzas) HacEscaramuzas.reload().then(escPulse);   // saca al mecenas y resuelve si toca
        if (DEB) DEB.reload().then(debPulse);                                // debates: sim, auto-accept NPC, resolución
        if (window.HacBuff) HacBuff.reload();                                // bono de hacienda: refresca vigencia

        HacOrdenes.reload().then(applyOrders);
      }, 5000);
    }
    // MÓVIL: mientras tu banda se concentra en la puerta (recién lanzada), parpadea
    // el botón "Hacienda" de la barra para invitarte a mirar la animación conjunta.
    function pulseHaciendaNav() {
      const btn = document.querySelector('#hacp-mnav [data-sec="hacienda"]'); if (!btn) return;   // solo móvil
      const band = (myId && window.HacEscaramuzas) ? HacEscaramuzas.miBanda(h.id, myId) : null;
      const enMuster = !!(band && band.estado === 'en_curso' && clock() < (band.inicioMs + 26000));
      btn.classList.toggle('pulse', enMuster && !btn.classList.contains('on'));   // deja de parpadear si ya estás en Hacienda
    }
    // ¿Puede tu mecenas EMPRENDER el peregrinaje AHORA? (malherido 3/3, sin banda ya
    // montada y sin cooldown). Es lo que dispara el parpadeo ROJO de «Escaramuzas».
    function peregDisponible() {
      if (!myId || !window.HacStats || !window.HacEscaramuzas) return false;
      if (!(HacStats.malherido && HacStats.malherido(myId))) return false;
      if (HacEscaramuzas.miBanda(h.id, myId)) return false;                  // ya tiene banda/peregrinaje en marcha
      if (!ESC_FAST && HacStats.escaramuzaCd && HacStats.escaramuzaCd(myId) > clock()) return false;   // en cooldown: aún no puede
      return true;
    }
    // Parpadeo del botón Escaramuzas: ROJO si el peregrinaje está disponible (última
    // salida al estar malherido); DORADO si el capitán tiene una decisión de maniobra
    // pendiente. En ambos casos, solo si NO estás ya dentro de la sección.
    function pulseEscNav() {
      const pereg = peregDisponible();
      const suceso = !pereg && !!escEncPendMio();
      const nav = document.querySelector('#hacp-mnav [data-sec="escaramuzas"]');
      if (nav) { const dentro = nav.classList.contains('on'); nav.classList.toggle('pulse-red', pereg && !dentro); nav.classList.toggle('pulse', suceso && !dentro); }
      // Escritorio: el mismo aviso en el botón «Escaramuzas» de la barra del panel.
      const tool = charEl ? charEl.querySelector('.hacp-cp-esc') : null;
      if (tool) { tool.classList.toggle('pulse-red', pereg); tool.classList.toggle('pulse', suceso); }
    }
    // Tic de 1 s: refresca SOLO el panel del personaje (cuenta atrás de expedición y
    // energía/regeneración se derivan del reloj de servidor → tienen que verse vivos).
    setInterval(() => { if (charId) refreshCharPanel(); if (escVisible) escTick(); pulseMisNav(); refreshMoMisBadge(); refreshMoProdBadge(); pulseHaciendaNav(); pulseEscNav(); renderDebAlert(); if (mShell && mShell.refreshDeb) mShell.refreshDeb(); }, 1000);

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
      // Modo ELEGIR JARDÍN (debate): el tap escoge un jardín iluminado.
      if (_pickJardin) {
        const cc = (window.HacIso && HacIso.cellAt) ? HacIso.cellAt(iso, e.clientX, e.clientY) : null;
        if (cc) pickJardinTap(cc[0], cc[1]); else toast('Toca un jardín iluminado (amarillo)');
        return;
      }
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
      if (bestId) {
        // MÓVIL: tocar un mecenas solo CENTRA la cámara en él (sin panel ni salto a
        // Personaje; su ficha vive en la pestaña Personaje). ESCRITORIO: panel flotante.
        if (mShell) { HacFolk.select(bestId); if (cam && cam.focusFollow) cam.focusFollow(() => HacFolk.position(bestId), 3.4); renderList(); }
        else gotoMember(bestId);
        return;
      }
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
          <div class="hacp-mtabs"><button type="button" class="hacp-mtab on" data-mt="internas">Debate</button><button type="button" class="hacp-mtab" data-mt="exped">Expediciones</button></div>
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
      let _internasSig = null;
      function renderInternas() {
        const body = sec.querySelector('[data-mtb="internas"]'); if (!body) return;
        let inner;
        if (!myId) inner = '<div class="hacp-inv-note">Entra con tu mecenas para debatir.</div>';
        else if (!DEB) inner = '<div class="hacp-inv-note">Los debates aún no están disponibles.</div>';
        else {
          const invPend = DEB.miInvitacionPendiente(h.id, myId, clock());
          const enDeb = DEB.miDebate(h.id, myId);
          const invSent = DEB.miInvitacionEnviada(h.id, myId);
          const cd = DEB.cooldownRestanteMs(h.id, myId, clock());
          const hayJard = gardensFinca().length > 0;
          if (invPend) { const tt = debTema(invPend.tema); inner = `<div class="hacp-mrow"><div class="hacp-mrow-main"><b>🗣 ${esc(invPend.hostNombre || 'Alguien')} te reta</b><span>Debate de ${esc(tt ? tt.nombre : invPend.tema)}</span></div><div style="display:flex;gap:6px"><button class="hacp-cp-btn hacp-cp-go" data-deb-yes="${esc(invPend.id)}">Aceptar</button><button class="hacp-cp-btn" data-deb-no="${esc(invPend.id)}">Rechazar</button></div></div>`; }
          else if (enDeb) {
            const tt = debTema(enDeb.tema), remM = Math.max(1, Math.ceil((enDeb.finMs - clock()) / 60000)), done = DEB.juegoCompleto(enDeb);
            const sub = done ? `argumentos hechos · veredicto en ~${remM} min` : `en el jardín · queda ~${remM} min`;
            inner = `<div class="hacp-mrow"><div class="hacp-mrow-main"><b>🗣 Debate de ${esc(tt ? tt.nombre : enDeb.tema)}</b><span>${sub}</span></div><button class="hacp-cp-btn hacp-cp-go" data-deb-play="1">${done ? 'Ver debate' : 'Argumentar'}</button></div>`;
          }
          else if (invSent) inner = `<div class="hacp-mrow"><div class="hacp-mrow-main"><b>🗣 Reto enviado a ${esc(invSent.invitadoNombre || '…')}</b><span>esperando respuesta…</span></div><button class="hacp-cp-btn" data-deb-cancel="${esc(invSent.id)}">Cancelar</button></div>`;
          else if (cd > 0) inner = `<div class="hacp-inv-note">Tu mecenas reposa tras el último debate · disponible en ${fmtClock(Math.ceil(cd / 1000))}.</div>`;
          else if (!hayJard) inner = '<div class="hacp-inv-note">Construye un <b>Jardín</b> en la finca para poder debatir.</div>';
          else inner = `<div class="hacp-mrow"><div class="hacp-mrow-main"><b>🗣 Invitar a debatir</b><span>Reta a otro mecenas a un debate de 5 min en el jardín · XP + posible libro · prestigio al ganador.</span></div><button class="hacp-cp-btn hacp-cp-go" data-deb-open="1">Invitar</button></div>`;
        }
        if (inner === _internasSig) return;   // sin cambios → no reconstruir (no parpadea ni se comen los taps)
        _internasSig = inner; body.innerHTML = inner;
        const op = body.querySelector('[data-deb-open]'); if (op) op.addEventListener('click', () => { abrirInvitarDebate(); });
        const pl = body.querySelector('[data-deb-play]'); if (pl) pl.addEventListener('click', () => { abrirDebateJuego(); });
        const cn = body.querySelector('[data-deb-cancel]'); if (cn) cn.addEventListener('click', () => { rechazarDebate(cn.dataset.debCancel); renderInternas(); });
        const yy = body.querySelector('[data-deb-yes]'); if (yy) yy.addEventListener('click', () => { aceptarDebate(yy.dataset.debYes); renderInternas(); });
        const nn = body.querySelector('[data-deb-no]'); if (nn) nn.addEventListener('click', () => { rechazarDebate(nn.dataset.debNo); renderInternas(); });
      }
      // Refresca la fila de debate de Misiones si es la vista activa (la llama el latido de 1 s).
      function refreshMobileDeb() {
        if (mActive !== 'misiones') return;
        const at = sec.querySelector('.hacp-mtab.on');
        if (at && at.dataset.mt === 'exped') return;   // la pestaña de expediciones se gestiona sola
        renderInternas();
      }
      function renderExped() {
        const body = sec.querySelector('[data-mtb="exped"]');
        if (!hasTablon) { body.innerHTML = '<div class="hacp-inv-note">Esta finca aún no tiene tablón de anuncios: sin él no hay misiones ni expediciones.</div>'; return; }
        buildBoard();
        const el = ensureBoardEl();
        body.appendChild(el); el.hidden = false; el.classList.add('hacp-board-inline');
      }

      if (window.HacEscaramuzas) HacEscaramuzas.ready();
      let mActive = 'personaje';
      // Muestra un mecenas (el tuyo o cualquiera al tocarlo en la finca) en el HOME.
      function showChar(id) {
        [shopEl, equipEl, homeEl, leaveEl, bitEl].forEach(e => { if (e) e.hidden = true; }); hidePop();
        mActive = 'personaje';
        SEC.forEach(s => navBtns[s.id].classList.toggle('on', s.id === 'personaje'));
        sec.querySelectorAll('.hacp-msec-pane').forEach(p => p.classList.toggle('on', p.dataset.pane === 'personaje'));
        sec.hidden = false;
        if (id) { charId = id; buildCharPanel(id); startAvatar(); }
      }
      mShell = { showChar, go: (s) => mgo(s), refreshDeb: refreshMobileDeb };

      function mgo(id) {
        // Cierra cualquier modal (tienda/equipo/casa/abandonar) y el popup de edificio.
        [shopEl, equipEl, homeEl, leaveEl, bitEl].forEach(e => { if (e) e.hidden = true; });
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
        if (id === 'misiones') abrirEncuentrosPend();   // encuentro pendiente → carta antes que el tablón
        if (id === 'personaje') {
          if (myId) { charId = myId; buildCharPanel(myId); startAvatar(); }
          else if (!persPane.querySelector('.hacp-msec-soon')) {
            const n = document.createElement('div'); n.className = 'hacp-msec-soon';
            n.innerHTML = '士<br><b>Sin mecenas aquí</b><br>Únete a esta hacienda para ver a tu personaje.';
            persPane.appendChild(n);
          }
        }
        if (id === 'misiones') {
          // Re-renderiza la sub-pestaña ACTIVA (no siempre internas): al salir de Misiones
          // el tablón (boardEl) se saca de la pestaña «Expediciones» y la deja vacía, así
          // que al volver hay que rellenarla de nuevo según cuál estuviera abierta.
          const at = sec.querySelector('.hacp-mtab.on');
          if (at && at.dataset.mt === 'exped') renderExped(); else renderInternas();
        }
        // Escaramuzas: la UI vive en setupFolk; aquí solo fijamos su contenedor (pane).
        escVisible = (id === 'escaramuzas');
        if (!escVisible) stopMarch();
        if (id === 'escaramuzas') {
          escHost = sec.querySelector('[data-esc-body]'); escSig = '';
          if (window.HacEscaramuzas) HacEscaramuzas.reload().then(renderEscaramuzas); else renderEscaramuzas();
        }
        if (isHac) {
          // El visor pasó a pantalla completa al añadir .hacp-mobile, DESPUÉS de fitView →
          // recalcula el encuadre al tamaño real y, ya en el frame siguiente, hace zoom
          // al mecenas (focusFollow usa el `fit` recién calculado).
          window.dispatchEvent(new Event('resize'));
          // Centra en tu mecenas con un zoom cómodo (no demasiado cerca: a 8 la escena
          // se veía mal; ~4 deja ver al mecenas y su entorno).
          if (myId && cam && cam.focusFollow) requestAnimationFrame(() => cam.focusFollow(() => HacFolk.position(myId), 4));
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
