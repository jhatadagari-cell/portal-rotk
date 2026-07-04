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
      const totales = {};
      items.forEach(it => { totales[it.tipo] = (totales[it.tipo] || 0) + it.val; });
      return { items, totales };
    }
    // Fracción de XP extra para UNA misión: el bono cultural (政→文… 文) aplica a
    // todas; el militar (军) SOLO se suma en expediciones de dominio militar.
    const xpFracMision = (dom) => (bonos.xp || 0) + (dom === 'militar' ? (bonos.xpMil || 0) : 0)
      + ((miCargo && miCargo.perk.xpDom && miCargo.dom === dom) ? miCargo.perk.xpDom : 0)   // perk del oficio en su dominio
      + ((dom === 'cultural' && tieneT('estudiante')) ? 0.08 : 0);                          // 書生 Estudiante
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
      // misiones (📜) junto al edificio principal. Esta lista es solo de tareas
      // dentro de la finca (edificios).
      // Deduplica tareas idénticas (mismo nombre/dominio/duración) que aparecerían
      // repetidas si hay varios edificios del mismo tipo (p. ej. dos "Descansar").
      const vistos = new Set();
      return out.filter(t => { const k = t.nombre + '|' + t.dominio + '|' + t.duracionSeg; if (vistos.has(k)) return false; vistos.add(k); return true; });
    }
    const DOM_GLYPH = { militar: '武', cultural: '文', administrativo: '政' };
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
    function maybeRewardMyMission() {
      if (!myId || !window.HacOrdenes || !window.HacPuntos) return;
      const o = HacOrdenes.mine(h.id, myId);
      if (!o) { _wasOnMission = false; return; }
      const me = HacFolk.list().find(w => w.id === myId);
      const onM = !!(me && me.onMission);
      const hardDone = clock() > o.inicioMs + (o.duracionSeg || 60) * 1000 + 90000;   // saludo+viaje+tarea, con margen
      const liveDone = _wasOnMission && !onM;                                          // el sim la acaba de completar
      if (hardDone || liveDone) {
        // Las ESCARAMUZAS (cooperativas) NO se premian aquí: al volver, solo se limpia
        // la orden; el reparto de dinero/botín/heridas lo hará la resolución de la banda (4c).
        if (String(o.targetId || '').indexOf('escaramuza:') === 0) {
          HacOrdenes.clear(h.id, myId); _wasOnMission = false; applyOrders(); return;
        }
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
          const emF = finalizeSucesos(o, mis); if (emF.heridas > 0 && HacStats.herir) HacStats.herir(myId, emF.heridas); sucClear(o);
          HacOrdenes.clear(h.id, myId);
          toast(lost > 0 ? `❌ Misión fallida · perdiste ${lost} 💰 del monedero` : '❌ Misión fallida · sin botín');
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
        HacPuntos.award(h.id, myId, r);
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
          // SUCESOS del viaje: resuelve los que falten (opción segura) y aplica sus mods.
          const em = finalizeSucesos(o, mis);
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
            if (loot.efecto && loot.efecto.energia) { if (window.HacEnergia) HacEnergia.add(h.id, myId, loot.efecto.energia); extra += ` · 🎁 ${loot.icon} ${loot.nombre}`; }
            else { const r2 = HacStats.darItem(myId, lootId); extra += r2.ok ? ` · 🎁 ${loot.icon} ${loot.nombre}` : ' · 🎁 (mochila llena)'; }
          }
          // Botín EXTRA de sucesos + heridas sufridas por el camino.
          for (let k = 0; k < (em.loot || 0); k++) {
            const xid = HacTienda.botinAleatorio ? HacTienda.botinAleatorio(tier) : null;
            const xit = xid ? HacTienda.get(xid) : null;
            if (xit) { if (xit.efecto && xit.efecto.energia) { if (window.HacEnergia) HacEnergia.add(h.id, myId, xit.efecto.energia); } else HacStats.darItem(myId, xid); extra += ` · 🎁 ${xit.icon} ${xit.nombre}`; }
          }
          if (em.heridas > 0 && HacStats.herir) { HacStats.herir(myId, em.heridas); extra += ' · ✚ herido'; }
          sucClear(o);
        }
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

    // ════════ SUCESOS (capa A) — decisiones EN VIVO durante una expedición ═══════
    // Solo expediciones EN SOLITARIO (las escaramuzas irán aparte). Deterministas por
    // semilla del id de orden; la elección se guarda en localStorage (a prueba de
    // refresco). Si no respondes a tiempo (o no miras), se auto-elige la opción SEGURA.
    // Los efectos (mods) se aplican al VOLVER, en maybeRewardMyMission.
    const SUCESOS = [
      { id: 'emboscada', txt: '¡Emboscada en el desfiladero!', desc: 'Unos bandidos os cortan el paso entre las rocas.',
        op: [{ t: 'Cargar de frente', dom: 'militar', ok: { loot: 1, xp: 0.3 }, fail: { herida: 1 } },
             { t: 'Buscar un flanco', dom: 'cultural', ok: { din: 0.25 }, fail: { din: -0.15 } },
             { t: 'Retirada ordenada', safe: true, res: {} }] },
      { id: 'aldea', txt: 'Una aldea pide ayuda', desc: 'Los aldeanos sufren el acoso de unos forajidos y ofrecen recompensa.',
        op: [{ t: 'Expulsarlos por la fuerza', dom: 'militar', ok: { din: 0.3, xp: 0.2 }, fail: { herida: 1 } },
             { t: 'Mediar y negociar', dom: 'administrativo', ok: { din: 0.3 }, fail: { din: -0.1 } },
             { t: 'Seguir camino', safe: true, res: {} }] },
      { id: 'reliquia', txt: 'Un santuario en ruinas', desc: 'Entre las columnas caídas asoma una reliquia y unas inscripciones antiguas.',
        op: [{ t: 'Descifrar las inscripciones', dom: 'cultural', ok: { xp: 0.4, loot: 1 }, fail: {} },
             { t: 'Llevarse lo de valor', dom: 'militar', ok: { din: 0.35 }, fail: { herida: 1 } },
             { t: 'Respetar el lugar', safe: true, res: { xp: 0.05 } }] },
      { id: 'mercader', txt: 'Un mercader varado', desc: 'Un carro volcado bloquea el vado; su dueño ofrece trato a quien le ayude.',
        op: [{ t: 'Reparar y escoltar', dom: 'administrativo', ok: { din: 0.3, loot: 1 }, fail: { din: -0.1 } },
             { t: 'Cargar el carro a pulso', dom: 'militar', ok: { din: 0.2 }, fail: { herida: 1 } },
             { t: 'Rodear el vado', safe: true, res: {} }] },
      { id: 'temporal', txt: 'Se desata un temporal', desc: 'La lluvia embarra el camino y amenaza con retrasaros.',
        op: [{ t: 'Forzar la marcha', dom: 'militar', ok: { din: 0.15 }, fail: { herida: 1 } },
             { t: 'Refugiaros y esperar', dom: 'cultural', ok: { xp: 0.2 }, fail: {} },
             { t: 'Buscar un atajo', safe: true, res: {} }] },
    ];
    const sucKey = (o) => myId + '|' + o.inicioMs + '|' + o.targetId;
    // Prob. de éxito de un chequeo de dominio: tu nivel efectivo vs la dificultad.
    function pSuceso(dom, dif) { return Math.max(0.12, Math.min(0.9, 0.42 + 0.13 * (nivelEf(dom) - (dif || 3)))); }
    function safeIdx(s) { const i = s.op.findIndex(o => o.safe || !o.dom); return i >= 0 ? i : s.op.length - 1; }
    function opMods(op, ok) {
      const src = op.dom ? (ok ? op.ok : op.fail) : (op.res || {});
      const m = { din: 0, xp: 0, loot: 0, heridas: 0 }; if (!src) return m;
      if (src.din) m.din += src.din; if (src.xp) m.xp += src.xp; if (src.loot) m.loot += src.loot; if (src.herida) m.heridas += src.herida;
      return m;
    }
    function accumMods(a, b) { a = a || {}; return { din: (a.din || 0) + (b.din || 0), xp: (a.xp || 0) + (b.xp || 0), loot: (a.loot || 0) + (b.loot || 0), heridas: (a.heridas || 0) + (b.heridas || 0) }; }
    // Plan determinista de sucesos para una orden (mismos para todos, estable al refrescar).
    function sucPlan(o, mis) {
      const durMs = (o.duracionSeg || 60) * 1000, startMs = o.inicioMs;
      const R = HacRand.make('suc#' + sucKey(o));
      const n = ((mis.dif || 3) >= 5 || durMs >= 200000) ? 2 : 1;
      const frac = n === 2 ? [0.38, 0.72] : [0.5];
      const pool = SUCESOS.slice(), plan = [];
      for (let i = 0; i < n; i++) { const idx = R.int(pool.length); const s = pool.splice(idx, 1)[0]; plan.push({ i: i, sucesoId: s.id, atMs: startMs + Math.round(durMs * frac[i]) }); }
      return plan;
    }
    const sucDeadline = (o, ev) => Math.min(ev.atMs + SUC_WINDOW, o.inicioMs + (o.duracionSeg || 60) * 1000 - 1500);
    // Estado de sucesos: EN MEMORIA (fuente de verdad de la sesión) + espejo en
    // localStorage (para sobrevivir a refrescos). Si localStorage falla (Safari
    // privado / iOS), el mapa en memoria evita que la carta se reabra en bucle.
    const sucMem = {};
    const sucLsKey = (o) => 'rotk.suc.' + sucKey(o);
    function sucLoad(o) {
      const k = sucLsKey(o);
      if (sucMem[k]) return sucMem[k];
      try { const v = JSON.parse(localStorage.getItem(k)); if (v) { sucMem[k] = v; return v; } } catch (e) {}
      const def = { resolved: {}, mods: {} }; sucMem[k] = def; return def;
    }
    function sucSave(o, st) { const k = sucLsKey(o); sucMem[k] = st; try { localStorage.setItem(k, JSON.stringify(st)); } catch (e) {} }
    function sucClear(o) { const k = sucLsKey(o); delete sucMem[k]; try { localStorage.removeItem(k); } catch (e) {} }
    // Resuelve al VOLVER los sucesos no atendidos (opción segura) y devuelve los mods totales.
    function finalizeSucesos(o, mis) {
      if (!window.HacRand) return { din: 0, xp: 0, loot: 0, heridas: 0 };
      const plan = sucPlan(o, mis), st = sucLoad(o); st.resolved = st.resolved || {}; st.mods = st.mods || {};
      plan.forEach(ev => { if (st.resolved[ev.i] == null) { const s = SUCESOS.find(x => x.id === ev.sucesoId); const idx = safeIdx(s); st.resolved[ev.i] = { c: idx, ok: true, auto: true }; st.mods = accumMods(st.mods, opMods(s.op[idx], true)); } });
      sucSave(o, st);
      return { din: st.mods.din || 0, xp: st.mods.xp || 0, loot: st.mods.loot || 0, heridas: st.mods.heridas || 0 };
    }
    // Aplica una decisión (manual o auto): tira el dado sembrado, acumula mods, registra.
    let sucEl = null, sucTimer = 0, sucOpenIdx = null, sucDl0 = 0, sucSel = null, sucResultOpen = false;
    // Resumen legible del efecto (se aplica al VOLVER de la expedición).
    function sucEffTxt(op, ok) {
      const m = opMods(op, ok), p = [];
      if (m.din) p.push((m.din > 0 ? '+' : '−') + Math.round(Math.abs(m.din) * 100) + '% dinero');
      if (m.xp) p.push('+' + Math.round(m.xp * 100) + '% XP');
      if (m.loot) p.push('+' + m.loot + ' botín');
      if (m.heridas) p.push('herido');
      return p.length ? p.join(' · ') : 'sin novedad';
    }
    function applyResolve(o, mis, ev, choiceIdx, auto) {
      const s = SUCESOS.find(x => x.id === ev.sucesoId); if (!s) return;
      const st = sucLoad(o); st.resolved = st.resolved || {};
      if (st.resolved[ev.i] != null) { closeSuc(); return; }   // ya resuelto (evita doble aplicación)
      const op = s.op[choiceIdx] || s.op[safeIdx(s)];
      let ok = true;
      if (op.dom) { const R = HacRand.make('sucr#' + sucKey(o) + '#' + ev.i); ok = R.next() < pSuceso(op.dom, mis.dif); }
      if (op.cost && window.HacStats) HacStats.award(myId, { dinero: -op.cost });
      st.mods = accumMods(st.mods || {}, opMods(op, ok));
      st.resolved[ev.i] = { c: choiceIdx, ok: ok, auto: !!auto }; sucSave(o, st);
      if (window.HacBitacora) HacBitacora.log(myId, 'expedicion', `⚔ ${s.txt} → ${op.t}${op.dom ? (ok ? ' ✔' : ' ✘') : ''}`, { clave: 'suc:' + sucKey(o) + ':' + ev.i });
      if (charId) buildCharPanel(charId);
      if (auto) { closeSuc(); return; }   // auto/segura: cierra sin pantalla de resultado
      // Manual: enseña el RESULTADO en la carta (no un toast fugaz) hasta que confirmes.
      if (sucTimer) { clearInterval(sucTimer); sucTimer = 0; }
      sucResultOpen = true;
      const el = ensureSucEl(); el.hidden = false;
      el.innerHTML = `<div class="hacp-suc-box">
        <div class="hacp-suc-eyebrow">⚔ Suceso · ${esc(mis.nombre || 'Expedición')}</div>
        <div class="hacp-suc-ttl">${esc(s.txt)}</div>
        <div class="hacp-suc-verdict ${op.dom ? (ok ? 'ok' : 'bad') : 'neutral'}">${op.dom ? (ok ? '✔ Éxito' : '✘ Ha salido mal') : '· Hecho'}</div>
        <div class="hacp-suc-eff"><b>${esc(op.t)}</b> — al volver: ${esc(sucEffTxt(op, ok))}</div>
        <button type="button" class="hacp-cp-btn hacp-suc-done" data-suc-done>Continuar</button></div>`;
      el.querySelector('[data-suc-done]').addEventListener('click', closeSuc);
    }
    function autoResolveSafe(o, mis, ev) { const s = SUCESOS.find(x => x.id === ev.sucesoId); if (s) applyResolve(o, mis, ev, safeIdx(s), true); }
    function ensureSucEl() {
      if (sucEl) return sucEl;
      sucEl = document.createElement('div'); sucEl.className = 'hacp-suc-ov'; sucEl.hidden = true; document.body.appendChild(sucEl);
      ['pointerdown', 'pointerup', 'wheel', 'click'].forEach(ev => sucEl.addEventListener(ev, e => e.stopPropagation(), { passive: false }));
      return sucEl;
    }
    function closeSuc() { if (sucTimer) { clearInterval(sucTimer); sucTimer = 0; } sucOpenIdx = null; sucSel = null; sucResultOpen = false; if (sucEl) sucEl.hidden = true; }
    // Cuerpo de la carta: se elige una opción (queda MARCADA) y luego se confirma con
    // Aceptar/Cancelar — el toque no resuelve por sí solo (evita decisiones por error).
    function sucBoxHTML(s, mis) {
      const opts = s.op.map((op, ix) => {
        const on = (sucSel === ix) ? ' on' : '';
        const meta = op.dom ? `<span class="hacp-suc-chk">〔${DOM_GLYPH[op.dom]} ${nivelEf(op.dom)}〕</span>` : '';
        const tag = op.dom ? `<span class="hacp-suc-pct">${Math.round(pSuceso(op.dom, mis.dif) * 100)}%</span>` : `<span class="hacp-suc-pct">segura</span>`;
        return `<button type="button" class="hacp-suc-op${op.dom ? '' : ' safe'}${on}" data-op="${ix}">${meta}<span class="hacp-suc-opt">${esc(op.t)}</span>${tag}</button>`;
      }).join('');
      const footer = (sucSel != null)
        ? `<div class="hacp-suc-confirm"><button type="button" class="hacp-cp-btn hacp-suc-cancel" data-suc-cancel>Cancelar</button><button type="button" class="hacp-cp-btn hacp-suc-ok" data-suc-ok>Aceptar</button></div>`
        : '';
      return `<div class="hacp-suc-box">
        <div class="hacp-suc-eyebrow">⚔ Suceso · ${esc(mis.nombre || 'Expedición')}</div>
        <div class="hacp-suc-ttl">${esc(s.txt)}</div>
        <div class="hacp-suc-desc">${esc(s.desc || '')}</div>
        <div class="hacp-suc-ops">${opts}</div>
        ${footer}
        <div class="hacp-suc-bar"><i data-suc-bar></i></div>
        <div class="hacp-suc-hint" data-suc-hint></div></div>`;
    }
    function renderSucBody(o, mis, ev) {
      const s = SUCESOS.find(x => x.id === ev.sucesoId); if (!s || !sucEl) return;
      sucEl.innerHTML = sucBoxHTML(s, mis);
      sucEl.querySelectorAll('[data-op]').forEach(b => b.addEventListener('click', () => { sucSel = +b.dataset.op; renderSucBody(o, mis, ev); }));
      const ok = sucEl.querySelector('[data-suc-ok]'); if (ok) ok.addEventListener('click', () => { if (sucSel != null) applyResolve(o, mis, ev, sucSel, false); });
      const cc = sucEl.querySelector('[data-suc-cancel]'); if (cc) cc.addEventListener('click', () => { sucSel = null; renderSucBody(o, mis, ev); });
    }
    function openSucCard(o, mis, ev, dl) {
      const s = SUCESOS.find(x => x.id === ev.sucesoId); if (!s) return;
      sucOpenIdx = ev.i; sucDl0 = dl; sucSel = null;
      ensureSucEl(); renderSucBody(o, mis, ev); sucEl.hidden = false;
      if (sucTimer) clearInterval(sucTimer);
      sucTimer = setInterval(() => tickSucCard(o, mis, ev), 200); tickSucCard(o, mis, ev);
    }
    function tickSucCard(o, mis, ev) {
      if (!sucEl || sucEl.hidden) return;
      const now = clock(), total = Math.max(1, sucDl0 - ev.atMs), rem = Math.max(0, sucDl0 - now);
      const bar = sucEl.querySelector('[data-suc-bar]'); if (bar) bar.style.width = Math.max(0, Math.min(100, rem / total * 100)) + '%';
      const hint = sucEl.querySelector('[data-suc-hint]');
      if (hint) hint.textContent = (sucSel != null) ? `Confirma en ${Math.ceil(rem / 1000)}s` : `Elige en ${Math.ceil(rem / 1000)}s · si no, opción segura`;
      // Al vencer: si tienes una opción marcada, se aplica esa; si no, la segura.
      if (now >= sucDl0) { if (sucSel != null) applyResolve(o, mis, ev, sucSel, false); else autoResolveSafe(o, mis, ev); }
    }
    // Se llama cada segundo: abre la carta cuando toca; auto-resuelve pasada la ventana
    // (aunque no la estés mirando). Solo para MIS expediciones en solitario en curso.
    function sucesoTick() {
      if (sucResultOpen) return;   // mostrando el resultado: no abras otra carta hasta Continuar
      if (!myId || !window.HacOrdenes || !window.HacMisiones || !window.HacRand) return;
      const o = HacOrdenes.mine(h.id, myId);
      if (!o || o.tipo !== 'expedicion' || String(o.targetId || '').indexOf('escaramuza:') === 0) { if (sucOpenIdx != null) closeSuc(); return; }
      const mis = HacMisiones.get(String(o.targetId || '').replace('mis:', '')); if (!mis) return;
      const now = clock(), endMs = o.inicioMs + (o.duracionSeg || 60) * 1000;
      if (now >= endMs) { if (sucOpenIdx != null) closeSuc(); return; }
      const plan = sucPlan(o, mis), rez = (sucLoad(o).resolved) || {};
      const ev = plan.find(p => now >= p.atMs && rez[p.i] == null);
      if (!ev) { if (sucOpenIdx != null) closeSuc(); return; }
      const dl = sucDeadline(o, ev);
      if (now >= dl) { autoResolveSafe(o, mis, ev); return; }
      if (sucOpenIdx !== ev.i) openSucCard(o, mis, ev, dl);
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
    // Duración de una expedición con el ahorro de tiempo del EQUIPO (enseres de marcha)
    // + el CABALLO (montura propia → viaje más rápido).
    const durExped = (m) => Math.max(30, Math.round(HacMisiones.durSeg(m) * (1 - (HacStats.bonusExped ? HacStats.bonusExped(myId) : 0) - (tieneT('estratega') ? 0.10 : 0) - caballoExped())));
    function dispatchMision(misId) {
      if (!myId || !window.HacOrdenes || !window.HacMisiones) return;
      if (window.HacStats && HacStats.malherido && HacStats.malherido(myId)) { toast('Tu mecenas está malherido · cúralo antes de salir'); return; }
      const m = HacMisiones.get(misId); if (!m) return;
      if (window.HacEnergia) HacEnergia.spend(h.id, myId, costeExped(m));
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
        ms.forEach((m, idx) => { map[m.id] = { inicioMs: b.inicioMs, finMs: b.finMs, idx, n: ms.length }; });
      });
      HacFolk.setEscaramuzas(map);
    }
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
        return `<span class="hacp-req${have != null ? (ok ? ' ok' : ' no') : ''}" title="${esc(DOM_NOM[dom])}">${DOM_GLY[dom]}${prog}</span>`;
      }).join('');
    }
    // Nivel de la banda en un dominio = el del mejor miembro (un especialista lidera).
    function bandStat(band, dom) { let best = 0; (band.miembros || []).forEach(m => { const n = (window.HacStats && HacStats.nivelTotal) ? HacStats.nivelTotal(m.id, dom) : 1; if (n > best) best = n; }); return best || 1; }
    // ¿algún miembro de la banda tiene un talento? (efectos de banda: 虎將, 軍師…)
    const bandTiene = (band, id) => (band.miembros || []).some(m => window.HacStats && HacStats.tieneTalento && HacStats.tieneTalento(m.id, id));
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
    const escSucFrac = (n) => (n === 2 ? [0.38, 0.72] : [0.5]);
    let escSucEl = null, escSucTimer = 0, escSucOpen = null, escSucDl = 0, escSucSel = null;
    const escSucSkipped = new Set();
    function ensureEscSucEl() {
      if (escSucEl) return escSucEl;
      escSucEl = document.createElement('div'); escSucEl.className = 'hacp-suc-ov'; escSucEl.hidden = true; document.body.appendChild(escSucEl);
      ['pointerdown', 'pointerup', 'wheel', 'click'].forEach(ev => escSucEl.addEventListener(ev, e => e.stopPropagation(), { passive: false }));
      return escSucEl;
    }
    function closeEscSuc() { if (escSucTimer) { clearInterval(escSucTimer); escSucTimer = 0; } escSucOpen = null; escSucSel = null; if (escSucEl) escSucEl.hidden = true; }
    function escSucBoxHTML(band, ev) {
      const s = SUCESOS_COOP.find(x => x.id === ev.sucesoId); if (!s) return '';
      const opts = DOCTRINAS.map((d, ix) => {
        const on = (escSucSel === ix) ? ' on' : '';
        const p = Math.round(pSuceso(bandStat(band, d.dom), band.dificultad || 4) * 100);
        return `<button type="button" class="hacp-suc-op${on}" data-eop="${ix}"><span class="hacp-suc-chk">〔${d.gly}〕</span><span class="hacp-suc-opt">${esc(d.nom)}</span><span class="hacp-suc-pct">${p}%</span></button>`;
      }).join('');
      const footer = `<div class="hacp-suc-confirm">
        <button type="button" class="hacp-cp-btn hacp-suc-cancel" data-esuc-skip>Mantener doctrina</button>
        <button type="button" class="hacp-cp-btn hacp-suc-ok" data-esuc-ok${escSucSel == null ? ' disabled' : ''}>Aceptar</button></div>`;
      return `<div class="hacp-suc-box">
        <div class="hacp-suc-eyebrow">⚔ Escaramuza · el capitán decide</div>
        <div class="hacp-suc-ttl">${esc(s.txt)}</div>
        <div class="hacp-suc-desc">Elige la maniobra de la banda para este trance. Sin decisión se mantiene la doctrina.</div>
        <div class="hacp-suc-ops">${opts}</div>${footer}
        <div class="hacp-suc-bar"><i data-esuc-bar></i></div>
        <div class="hacp-suc-hint" data-esuc-hint></div></div>`;
    }
    function renderEscSucBody(band, ev) {
      const el = ensureEscSucEl(); el.innerHTML = escSucBoxHTML(band, ev);
      el.querySelectorAll('[data-eop]').forEach(b => b.addEventListener('click', () => { escSucSel = +b.dataset.eop; renderEscSucBody(band, ev); }));
      const ok = el.querySelector('[data-esuc-ok]'); if (ok && !ok.disabled) ok.addEventListener('click', () => { if (escSucSel != null) applyEscOverride(band, ev, escSucSel); });
      const sk = el.querySelector('[data-esuc-skip]'); if (sk) sk.addEventListener('click', () => { escSucSkipped.add(band.id + ':' + ev.i); closeEscSuc(); });
    }
    function openEscSucCard(band, ev, dl) {
      escSucOpen = ev.i; escSucDl = dl; escSucSel = null;
      ensureEscSucEl(); renderEscSucBody(band, ev); escSucEl.hidden = false;
      if (escSucTimer) clearInterval(escSucTimer);
      escSucTimer = setInterval(() => tickEscSucCard(band, ev), 200); tickEscSucCard(band, ev);
    }
    function tickEscSucCard(band, ev) {
      if (!escSucEl || escSucEl.hidden) return;
      const now = clock(), atMs = escSucDl - ESC_SUC_WINDOW, total = Math.max(1, escSucDl - atMs), rem = Math.max(0, escSucDl - now);
      const bar = escSucEl.querySelector('[data-esuc-bar]'); if (bar) bar.style.width = Math.max(0, Math.min(100, rem / total * 100)) + '%';
      const hint = escSucEl.querySelector('[data-esuc-hint]'); if (hint) hint.textContent = (escSucSel != null) ? `Confirma en ${Math.ceil(rem / 1000)}s` : `Decides en ${Math.ceil(rem / 1000)}s · si no, se mantiene la doctrina`;
      if (now >= escSucDl) { if (escSucSel != null) applyEscOverride(band, ev, escSucSel); else { escSucSkipped.add(band.id + ':' + ev.i); closeEscSuc(); } }
    }
    async function applyEscOverride(band, ev, choiceIdx) {
      closeEscSuc(); escSucSkipped.add(band.id + ':' + ev.i);
      try { await HacEscaramuzas.suceso(band.id, myId, ev.i, choiceIdx); const d = DOCTRINAS[choiceIdx]; if (d) toast(`⚔ Maniobra: 〔${d.gly}〕 ${d.nom}`); }
      catch (e) { escSucSkipped.delete(band.id + ':' + ev.i); toast((e && e.message) || 'No se pudo fijar la maniobra'); }
    }
    // Tic (1 s): solo el CAPITÁN y solo mientras mira la escaramuza en curso.
    // ¿Hay AHORA una decisión de maniobra pendiente para el CAPITÁN? Devuelve
    // {band, ev, dl} o null. No depende de que el panel esté abierto: lo usan tanto
    // el tick (que abre la carta) como el parpadeo del botón del nav (que avisa).
    function escSucesoPend() {
      if (!myId || !window.HacEscaramuzas || !window.HacRand) return null;
      const band = HacEscaramuzas.miBanda(h.id, myId);
      if (!band || band.hostId !== myId || band.estado !== 'en_curso') return null;
      const plan = escPlan(band); if (!plan.length) return null;
      const now = clock(), startMs = band.inicioMs, durMs = Math.max(1, band.finMs - band.inicioMs);
      const fr = escSucFrac(plan.length), ov = band.sucesos || {};
      for (let k = 0; k < plan.length; k++) {
        const t = startMs + durMs * fr[k];
        if (now >= t && ov[plan[k].i] == null && !escSucSkipped.has(band.id + ':' + plan[k].i)) {
          const deadline = Math.min(t + ESC_SUC_WINDOW, band.finMs - 2000);
          if (now < deadline) return { band: band, ev: plan[k], dl: deadline };
        }
      }
      return null;
    }
    function escSucesoTick() {
      if (!escVisible) { if (escSucOpen != null) closeEscSuc(); return; }   // la carta solo se abre con el panel a la vista
      const pend = escSucesoPend();
      if (!pend) { if (escSucOpen != null) closeEscSuc(); return; }
      if (escSucOpen !== pend.ev.i) openEscSucCard(pend.band, pend.ev, pend.dl);
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
    function escProbParts(band, doctrina) {
      const b = (doctrina != null) ? Object.assign({}, band, { doctrina: doctrina }) : band;
      const dif = b.dificultad || 4;
      const sc = escSucesos(b), rb = relBonos(b);
      const capBonus = (window.HacStats && HacStats.tieneTalento && b.hostId && HacStats.tieneTalento(b.hostId, 'oficial')) ? 0.05 : 0;
      // Base BAJA y con fuerte castigo por rating: cumplir el requisito NO garantiza
      // la victoria (r1≈56%, r5≈24% con la banda justa). Ganar de sobra exige aptitudes
      // muy por encima del objetivo. Así spammear escaramuzas cuesta heridas y apuesta.
      const base = Math.max(0.20, 0.56 - (dif - 3) * 0.08);
      const nM = (b.miembros || []).length;
      const stat = Math.max(-0.22, Math.min(0.24, (bandFuerza(b) - 1) * 0.26));   // aptitudes de la banda vs objetivo
      const compania = Math.min(0.06, Math.max(0, nM - 2) * 0.03);                 // más mecenas = más manos
      const raw = base + stat + compania + sc.pMod + rb.pMod + capBonus;
      return { pct: Math.max(0.05, Math.min(0.90, raw)), base: base, stat: stat, compania: compania, suc: sc.pMod, rel: rb.pMod, cap: capBonus, nM: nM };
    }
    // `doctrina` opcional simula la postura antes de fijarla (para la vista previa).
    function escProb(band, doctrina) { return escProbParts(band, doctrina).pct; }
    // Desglose legible del % (qué lo sube/baja). Deja claro que reclutar mecenas lo mejora.
    function probDesgloseHTML(band, doctrina) {
      const p = escProbParts(band, doctrina);
      const mod = (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)} pts`;
      const cls = (v) => v < 0 ? 'neg' : (v > 0 ? 'pos' : 'nil');
      const rows = [`<li><span>Base · dificultad</span><b>${Math.round(p.base * 100)}%</b></li>`,
        `<li><span>Aptitudes de la banda</span><b class="${cls(p.stat)}">${mod(p.stat)}</b></li>`];
      if (p.compania) rows.push(`<li><span>Compañía · ${p.nM} mecenas</span><b class="pos">${mod(p.compania)}</b></li>`);
      if (p.suc) rows.push(`<li><span>Doctrina y sucesos</span><b class="${cls(p.suc)}">${mod(p.suc)}</b></li>`);
      if (p.rel) rows.push(`<li><span>Vínculos entre mecenas</span><b class="${cls(p.rel)}">${mod(p.rel)}</b></li>`);
      if (p.cap) rows.push(`<li><span>Talento del capitán</span><b class="pos">${mod(p.cap)}</b></li>`);
      return `<details class="hacp-esc-desglose"><summary>¿Cómo se calcula el éxito?</summary><ul>${rows.join('')}<li class="hacp-esc-desglose-tip">Recluta mecenas con la aptitud pedida para subir «aptitudes de la banda».</li></ul></details>`;
    }
    function resolverEscaramuzaSiToca() {
      if (!myId || !window.HacEscaramuzas) return;
      const band = HacEscaramuzas.miBanda(h.id, myId);
      if (!band || band.estado !== 'en_curso' || clock() < band.finMs) return;
      const dif = band.dificultad || 4;
      // SUCESOS (doctrina) + RELACIONES pliegan prob. de éxito, botín y dinero por miembro.
      const sc = escSucesos(band), rb = relBonos(band);
      const exito = Math.random() < escProb(band);   // misma prob. que se muestra en el panel
      const rtg = bandRating(band);
      const share = Math.max(0, shareRating(rtg) + sc.share);                                  // reparto por mecenas (escala con rating)
      const hostBonus = Math.round((band.coste || 0) * 0.5) + rtg * 15;                          // el host recupera coste +50% + prima por rating
      // +% dinero: EQUIPO (sellos) + efectos de relaciones → mapa {id: fracción}.
      const bonosPct = {};
      (band.miembros || []).forEach(mm => {
        const eq = (window.HacStats && HacStats.bonusDinero) ? HacStats.bonusDinero(mm.id) : 0;
        const p = eq + (rb.per[mm.id] || 0); if (p) bonosPct[mm.id] = p;
      });
      // 虎將: la banda ignora la 1ª herida al fracasar. Solo pasamos p_heridas cuando
      // hay que anularla (=0): así la resolución NORMAL usa la firma antigua y no depende
      // de talentos_c2.sql (que puede no estar ejecutado). null → se omite el parámetro.
      const wounds = bandTiene(band, 'tigre') ? 0 : null;
      HacEscaramuzas.resolver(band.id, clock(), exito, exito ? generarBotin(band, sc.loot + lootRating(rtg) + (bonos.escBotin || 0) + rb.loot) : [], share, hostBonus, ESC_FAST ? 30000 : 0, bonosPct, wounds)
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
      if (mine) {
        body.innerHTML = bandaPropiaHTML(mine);
        const sl = body.querySelector('[data-salir]'); if (sl) sl.addEventListener('click', () => salirBanda(mine.id));
        const ln = body.querySelector('[data-lanzar]'); if (ln && !ln.disabled) ln.addEventListener('click', () => lanzarBanda(mine.id));
        const ab = body.querySelector('[data-abort]'); if (ab) ab.addEventListener('click', abortarEscaramuza);
        body.querySelectorAll('[data-doc]').forEach(b => b.addEventListener('click', () => { escDoctrina = b.dataset.doc; renderEscaramuzas(); }));
        body.querySelectorAll('[data-loot]').forEach(b => b.addEventListener('click', () => reclamarBotin(mine.id, +b.dataset.loot)));
        const march = body.querySelector('[data-esc-march]'); if (march) startMarch(march, mine);
        escTick();
        return;
      }
      const dinero = window.HacStats ? HacStats.dinero(myId) : 0;
      const cd = (window.HacStats && HacStats.escaramuzaCd) ? HacStats.escaramuzaCd(myId) : 0;
      const enCd = !ESC_FAST && cd > clock();
      const malherido = !!(window.HacStats && HacStats.malherido && HacStats.malherido(myId));
      const bloqueado = enCd || malherido;
      const cdAviso = malherido ? `<div class="hacp-esc-note" style="color:#e2a06a">✚ Tu mecenas está malherido (3/3) · cúralo en su panel antes de salir.</div>`
        : enCd ? `<div class="hacp-esc-note" style="color:#e2a06a">⏳ En cooldown · podrás unirte o montar banda en ${fmtClock((cd - clock()) / 1000)}.</div>` : '';
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
        const scn = escenarioDef(b.escenario);
        return `<div class="hacp-mrow"><div class="hacp-mrow-main"><b>${esc(scn ? scn.nombre : 'Expedición militar')}</b>
          <span>${difBadgeHTML(bandRating(b), { noLabel: true })} · ${b.miembros.length}/${b.plazas} · cap. ${esc(b.hostNombre || '—')}</span></div>
          <button class="hacp-cp-btn" data-unir="${esc(b.id)}"${bloqueado ? ' disabled' : ''}>Unirse</button></div>`;
      }).join('') || '<div class="hacp-inv-note">No hay bandas abiertas. ¡Monta una de las de hoy!</div>';
      body.innerHTML = `
        <div class="hacp-esc-h">兵 Escaramuzas <span class="hacp-esc-sub">expediciones cooperativas</span></div>
        ${cdAviso}
        <div class="hacp-esc-ttl">Escaramuzas de hoy <span class="hacp-esc-sub">cambian cada día</span></div>
        <div class="hacp-esc-note">Elige una gesta y monta la banda; recluta mecenas para cumplir su requisito de aptitudes. Si volvéis con éxito recuperáis el coste +50% y vuestra parte; si fracasáis, vuestros mecenas reciben una herida.</div>
        <div class="hacp-esc-plazas">${[2, 3, 4].map(p => `<button class="hacp-esc-p${p === escPlazas ? ' on' : ''}" data-plazas="${p}">${p} plazas</button>`).join('')}</div>
        <div class="hacp-esc-day">${cards}</div>
        <div class="hacp-esc-ttl2">Bandas abiertas</div>${lista}`;
      body.querySelectorAll('[data-plazas]').forEach(b => b.addEventListener('click', () => { escPlazas = +b.dataset.plazas; renderEscaramuzas(); }));
      body.querySelectorAll('[data-crear-scn]').forEach(b => { if (!b.disabled) b.addEventListener('click', () => crearBanda(b.dataset.crearScn)); });
      body.querySelectorAll('[data-unir]').forEach(b => { if (!b.disabled) b.addEventListener('click', () => unirBanda(b.dataset.unir)); });
    }
    function bandaPropiaHTML(b) {
      const esHost = b.hostId === myId;
      const roster = b.miembros.map(m => `<li class="hacp-esc-m${m.id === b.hostId ? ' host' : ''}">${esc(m.nombre || 'mecenas')}${m.id === b.hostId ? ' · capitán' : ''}${m.id === myId ? ' (tú)' : ''}</li>`).join('');
      const scn = escenarioDef(b.escenario);
      const rating = bandRating(b);
      const rq = scn ? reqInfo(b, scn) : { ok: true, partes: [] };
      const probPct = Math.round(escProb(b, b.doctrina || escDoctrina) * 100);
      const probCls = probPct >= 65 ? 'hi' : (probPct >= 45 ? 'mid' : 'lo');
      const scNow = escSucesos(b);
      const sharePrev = Math.max(0, shareRating(rating) + scNow.share);
      const lootBonus = lootRating(rating);
      const probHTML = `<div class="hacp-esc-prob ${probCls}">Éxito estimado <b>${probPct}%</b></div>`;
      const desgloseHTML = probDesgloseHTML(b, b.doctrina || escDoctrina);
      const rewardHTML = `<div class="hacp-esc-reward">Botín si vencéis: <b>~${sharePrev}💰</b>/mecenas · <b>1 objeto</b> c/u${lootBonus ? ` · <b>+${lootBonus}</b> de botín común` : ''}</div>`;
      const reqHTML = (scn && rq.partes.length) ? `<div class="hacp-esc-scn-meta"><span class="hacp-esc-req-lbl">Requisito</span> ${reqChipsHTML(scn, b)}</div>` : '';
      let accion = '';
      if (b.estado === 'abierta') {
        const faltaReq = scn && !rq.ok;
        const puede = b.miembros.length >= 2 && rq.ok;
        if (esHost) {
          const docPick = `<div class="hacp-esc-doc-pick"><div class="hacp-esc-doc-lbl">Doctrina de la banda</div>
            <div class="hacp-esc-doc-row">${DOCTRINAS.map(d => `<button type="button" class="hacp-esc-doc-b${escDoctrina === d.id ? ' on' : ''}" data-doc="${d.id}"><b>〔${d.gly}〕</b> ${esc(d.nom)}</button>`).join('')}</div>
            <div class="hacp-esc-doc-desc">${esc((doctrinaDef(escDoctrina) || {}).desc || '')}</div></div>`;
          accion = reqHTML + probHTML + desgloseHTML + rewardHTML + docPick + `<button class="hacp-cp-btn hacp-esc-lanzar" data-lanzar${puede ? '' : ' disabled'}>⚔ Lanzar expedición</button>
            <div class="hacp-esc-note">${b.miembros.length < 2 ? 'Hacen falta al menos 2 mecenas para partir.' : faltaReq ? 'Recluta mecenas con más aptitud hasta cumplir el requisito.' : 'Al lanzar, la banda parte 30 min con la doctrina elegida. El desenlace y el botín se resuelven al volver.'}</div>`;
        } else {
          accion = reqHTML + probHTML + desgloseHTML + rewardHTML + `<div class="hacp-esc-note">Esperando a que el capitán lance la expedición${b.miembros.length < 2 ? ' (faltan mecenas)' : faltaReq ? ' (faltan aptitudes)' : ''}.</div>`;
        }
        accion += `<button class="hacp-cp-btn hacp-esc-salir" data-salir>${esHost ? 'Disolver la banda' : 'Salir de la banda'}</button>`;
      } else if (b.estado === 'en_curso') {
        const dd = doctrinaDef(b.doctrina);
        // La animación de marcha va SOLA; la info (éxito + recompensas + desglose) va DEBAJO,
        // nunca superpuesta. Visible para TODA la banda.
        accion = `<canvas class="hacp-esc-march" data-esc-march></canvas>
          <div class="hacp-esc-timer" data-esc-timer="${b.finMs}">En la expedición…</div>
          ${probHTML}${desgloseHTML}${rewardHTML}
          ${dd ? `<div class="hacp-esc-doc">Doctrina: 〔${dd.gly}〕 ${esc(dd.nom)}</div>` : ''}
          <div class="hacp-esc-note">La banda avanza unida por el camino. Cuando regrese se repartirán recompensas y botín.</div>
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
          ${escNarrHTML(b)}
          <div class="hacp-esc-note">Tu parte del dinero ya está en tu monedero${esHost ? ' (recuperaste el coste +50%)' : ''}. Botín común: <b>elige 1 objeto</b>${yaCogi ? ' — ya recogiste el tuyo.' : ' (hay al menos uno para cada quien).'}</div>
          <div class="hacp-esc-loot-grid">${grid}</div>
          <button class="hacp-cp-btn hacp-esc-salir" data-salir>Cerrar</button>`;
      } else {   // resuelta (fracaso)
        accion = `<div class="hacp-esc-result bad">✘ La expedición fracasó</div>
          ${escNarrHTML(b)}
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
    async function crearBanda(scnId) {
      if (escBusy) return;
      const scn = escenarioDef(scnId);
      if (!scn) { toast('Esa escaramuza ya no está disponible'); return; }
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
      if (band && scn) { const rq = reqInfo(band, scn); if (!rq.ok) { const f = rq.partes.filter(p => p.have < p.need).map(p => `${DOM_GLY[p.dom]} ${p.have}/${p.need}`).join(' · '); toast('Faltan aptitudes: ' + f); return; } }
      escBusy = true;
      try {
        await HacEscaramuzas.lanzar(id, myId, clock(), ESC_FAST ? 60000 : 0, escDoctrina);
        const dd = doctrinaDef(escDoctrina);
        toast(ESC_FAST ? '⚔ ¡Parten! (modo test · ~1 min)' : '⚔ ¡La banda parte a la expedición!');
        if (window.HacBitacora) HacBitacora.log(myId, 'escaramuza', `⚔ Tu banda partió a la expedición${dd ? ` · doctrina 〔${dd.gly}〕 ${dd.nom}` : ''}`);
        syncEscaramuzaOrder(); syncEscaramuzaFolk();
      } catch (e) { toast((e && e.message) || 'No se pudo lanzar'); await HacEscaramuzas.reload(); }
      finally { escBusy = false; renderEscaramuzas(); }
    }
    // El capitán aborta la escaramuza en curso: todos vuelven a casa en 5 min, sin premio.
    async function abortarEscaramuza() {
      if (!myId || !window.HacEscaramuzas || escBusy) return;
      const band = HacEscaramuzas.miBanda(h.id, myId);
      if (!band || band.hostId !== myId || band.estado !== 'en_curso') return;
      if (!confirm('¿Abortar la escaramuza? La banda entera volverá a casa en 5 minutos y no habrá recompensas ni botín.')) return;
      escBusy = true;
      try {
        await HacEscaramuzas.abortar(band.id, myId, clock(), ESC_FAST ? 20000 : 0);
        toast('↩ Escaramuza abortada · regreso en 5 min');
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
      // Éxito: se registra tanto en 'botin' (botín pendiente) como en 'resuelta' (ya
      // repartido) — antes solo en 'botin', y se perdía si volvías tras cerrarse el reparto.
      const narr = escNarrTexto(band); const suf = narr ? ' · ' + narr : '';
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
    let marchGround = null, marchCanvas = null, marchRAF = 0;
    function stopMarch() { marchCanvas = null; if (marchRAF) { cancelAnimationFrame(marchRAF); marchRAF = 0; } }
    function startMarch(cv, band) {
      stopMarch();
      const ctx = cv && cv.getContext && cv.getContext('2d'); if (!ctx) return;
      if (!marchGround) { marchGround = new Image(); marchGround.src = 'assets/img/iso/anim-ground.png'; }
      const back = cv.hasAttribute('data-back');          // 'abortando' → desanda el camino
      const FR = (window.HacChar && HacChar.FRAMES) || 4;
      const dir = back ? 'NW' : 'SE';                     // ida de cara (SE), vuelta de espaldas (NW)
      const members = (band.miembros || []).map(m => {
        const pj = (window.HacPersonajes && HacPersonajes.get) ? HacPersonajes.get(m.id) : null;
        return { id: m.id, aptitud: pj ? pj.aptitud : '', aspecto: pj ? (pj.aspecto || {}) : { robe: color }, mio: m.id === myId };
      });
      const sprCache = new Map();
      function spr(mem, frame) {
        const key = mem.id + '|' + frame;
        let c = sprCache.get(key);
        if (!c && window.HacChar) { c = document.createElement('canvas'); HacChar.draw(c, { aptitud: mem.aptitud, aspecto: mem.aspecto || {}, dir: dir, frame: frame, scale: 2 }); sprCache.set(key, c); }
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
        // Suelo isométrico desplazándose (ida: NO ; vuelta: SE).
        const g = marchGround;
        if (g && g.complete && g.width) {
          const gs = 0.44, tw = g.width * gs, th = g.height * gs, faceH = tw / 2;
          const stepX = tw / 2, stepY = faceH / 2, px = 2 * stepX, py = 2 * stepY;
          const sp = back ? 1 : -1;                       // dirección del desplazamiento del suelo
          const driftX = sp * 34 * (t / 1000), driftY = sp * 17 * (t / 1000);
          const X0 = wrap(driftX, px) - px, Y0 = wrap(driftY, py) - py;
          const ox = w / 2, oy = hh * 0.60;
          ctx.imageSmoothingEnabled = true;
          const nHalf = Math.ceil((w / 2 + tw) / stepX) + 2, pTop = Math.ceil((oy + th) / stepY) + 2, pBot = Math.ceil((hh - oy + th) / stepY) + 2;
          for (let p = -pTop; p <= pBot; p++) {
            for (let n = -nHalf; n <= nHalf; n++) {
              if ((n + p) & 1) continue;                  // misma paridad → rejilla iso
              const cx = ox + X0 + n * stepX, cy = oy + Y0 + p * stepY;
              if (cx < -tw || cx > w + tw || cy < -th || cy > hh + th) continue;
              ctx.drawImage(g, 0, 0, g.width, g.height, cx - tw / 2, cy - faceH / 2, tw, th);
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
      const sig = JSON.stringify((HacEscaramuzas.all(h.id) || []).map(b => [b.id, b.estado, (b.miembros || []).length, Object.keys(b.elecciones || {}).length]));
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
      const rowsOf = (arr) => arr.map(e => `<div class="hacp-bit-row t-${esc(e.tipo)}"><span class="hacp-bit-when">${fmtHora(e.ts)}</span><span class="hacp-bit-txt">${esc(e.texto)}</span></div>`).join('');
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
    }
    function openBitacora() {
      if (!myId) return;
      const el = ensureBitEl(); el.hidden = false; renderBitacora();
      if (window.HacBitacora) HacBitacora.reload().then(() => { if (!el.hidden) renderBitacora(); });
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
        ? HacStats.DOMS.map(dom => { const p = HacStats.progresoNivel(id, dom); const b = HacStats.bonus ? HacStats.bonus(id, dom) : 0; return { dom, nivel: p.nivel, bonus: b, total: p.nivel + b, pct: p.pct, xp: p.xp, falta: p.falta }; })
        : null;
      const equipN = (window.HacStats && HacStats.equipados) ? HacStats.equipados(id).length : 0;
      const heridas = (window.HacStats && HacStats.heridas) ? HacStats.heridas(id) : 0;
      const cargo = (window.HacCalc && HacCalc.cargoDef) ? HacCalc.cargoDef(((h.miembros || []).find(m => m.personajeId === id) || {}).cargo) : null;
      return { it, aptId, aptDef, cargo, e, eFull, eRegenMin, activa, enTarea, fuera, exped, escaramuza, rest, mine: id === myId, puntos: puntosTotales(id), earned, money, home, ahorro, stats, equipN, heridas };
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
        const man = def.efecto && def.efecto.manual;
        if (man && d.mine) return `<button type="button" class="hacp-slot full manual" data-usar="${esc(def.id)}" title="${esc(def.nombre)} · toca para usar (${HacTienda.efectoTexto(def)})">${def.icon || '∎'}<span class="hacp-slot-xp" style="color:${DOM_COLOR[man.dom] || 'var(--gold)'}">${DOM_GLYPH[man.dom] || ''} +${man.xp} XP</span></button>`;
        return `<div class="hacp-slot full" title="${esc(def.nombre)} ${esc(def.zh || '')}">${def.icon || '∎'}</div>`;
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
    // Usa un MANUAL de la mochila (+XP fija a su dominio, se consume).
    function usarManualUI(id) {
      if (!myId || !window.HacStats || !HacStats.usarManual) return;
      const def = window.HacTienda ? HacTienda.get(id) : null;
      const r = HacStats.usarManual(myId, id);
      if (r && r.ok) {
        toast(`📖 +${r.xp} XP ${DOM_NOMBRE[r.dom] || ''}`.trim());
        if (window.HacBitacora) HacBitacora.log(myId, 'progreso', `📖 Usaste ${def ? def.nombre : 'un manual'} · +${r.xp} XP ${DOM_NOMBRE[r.dom] || ''}`.trim());
        buildCharPanel(charId);
      } else toast((r && r.motivo) || 'No se pudo usar');
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
        return `<div class="hacp-cp-stat" data-tip="${esc(tip)}">
          <span class="hacp-cp-stat-h"><span class="hacp-cp-stat-g" style="color:${DOM_COLOR[s.dom]}">${DOM_GLYPH[s.dom]}</span><span class="hacp-cp-stat-nm">${DOM_ABBR[s.dom]}</span></span>
          <span class="hacp-cp-stat-n">${s.total}${s.bonus ? `<i class="hacp-cp-stat-eq">+${s.bonus}</i>` : ''}</span>
          <i class="hacp-cp-stat-bar"><b style="width:${Math.round(s.pct * 100)}%;background:${DOM_COLOR[s.dom]}"></b></i>
        </div>`;
      }).join('');
      return `<div class="hacp-cp-stats" id="hacp-cp-stats"><div class="hacp-cp-statslbl">Poder personal <span>· nivel por dominio</span></div><div class="hacp-cp-statsrow">${chips}</div></div>`;
    }
    // Heridas (0..3): tres ranuras. PESAN — merman recompensa (−15 %/herida) y suben
    // el riesgo; a 3/3 el mecenas está malherido y no puede salir. Se curan pagando.
    function woundsHTML(d) {
      const n = Math.max(0, Math.min(3, d.heridas || 0));
      const slots = [0, 1, 2].map(i => `<span class="hacp-wound${i < n ? ' on' : ''}">${i < n ? '✚' : '·'}</span>`).join('');
      const pen = Math.round(Math.min(0.45, n * 0.15) * 100);
      const txt = !n ? 'ileso' : (n >= 3 ? 'malherido · no puede salir' : `${n}/3 · −${pen}% recompensa · +riesgo`);
      const cura = (d.mine && n > 0) ? `<button type="button" class="hacp-cp-btn hacp-cp-cura" data-act="cura"${d.money < COSTE_CURA ? ' disabled' : ''}>✚ Curar 1 herida · 💰 ${COSTE_CURA}${d.money < COSTE_CURA ? ' (te falta)' : ''}</button>` : '';
      return `<div class="hacp-cp-wounds${n ? ' hurt' : ''}${n >= 3 ? ' bad' : ''}" data-tip="Heridas ${n}/3. Reducen la recompensa (−15% por herida) y suben el riesgo de las expediciones; a 3/3 tu mecenas queda malherido y no puede salir hasta curarse.">
        <span class="hacp-wound-h">Heridas</span><span class="hacp-wound-slots">${slots}</span><span class="hacp-wound-txt">${txt}</span></div>${cura}`;
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
    function toolbarHTML(d) {
      const pts = (window.HacStats && HacStats.puntosLibres) ? HacStats.puntosLibres(myId) : 0;
      const tool = (act, ic, lb, extra) => `<button type="button" class="hacp-cp-tool${extra || ''}" data-act="${act}"><span class="ic">${ic}</span><span class="lb">${lb}</span></button>`;
      const items = [
        tool('equip', '⚔', 'Equipo' + (d.equipN ? ` ${d.equipN}/3` : '')),
        tool('inv', '🎒', 'Inventario', invOpen ? ' on' : ''),
        tool('sendas', '道', 'Sendas') + (pts > 0 ? '' : ''),
        tool('caballo', '🐎', 'Tu Caballo'),
        tool('log', '錄', 'Bitácora'),
        hasMarket ? tool('shop', '市', 'Mercado') : '',
        tool('esc', '兵', 'Escaramuzas', ' hacp-cp-esc'),
        hasMain ? tool('board', '檄', 'Misiones', ' hacp-cp-board') : '',
      ];
      // Distintivo de puntos de talento sin gastar sobre el icono de Sendas.
      const sendasBadge = pts > 0 ? `<span class="hacp-cp-badge">${pts}</span>` : '';
      let html = items.join('');
      if (sendasBadge) html = html.replace('data-act="sendas"><span class="ic">道</span>', `data-act="sendas">${sendasBadge}<span class="ic">道</span>`);
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
          const flag = abortando ? `↩ Escaramuza abortada · vuelta en <b id="hacp-cp-rest">${fmtClock(d.rest)}</b>`
            : `⚔ En escaramuza · vuelve en <b id="hacp-cp-rest">${fmtClock(d.rest)}</b>`;
          const ctrl = (soyHost && !abortando) ? `<button type="button" class="hacp-cp-btn hacp-cp-abort" data-act="abort">Abortar</button>`
            : `<span class="hacp-cp-lbl" style="opacity:.7;align-self:center">${abortando ? 'regresando…' : 'solo el capitán aborta'}</span>`;
          mision = `<div class="hacp-cp-mis hacp-cp-mis-on"><span class="hacp-cp-flag">${flag}</span>${ctrl}</div>`;
        } else if (d.activa) {
          const flag = d.exped ? `🧭 Expedición · vuelve en <b id="hacp-cp-rest">${fmtClock(d.rest)}</b>`
            : d.enTarea ? `⚒ En la tarea · <b id="hacp-cp-rest">${fmtClock(d.rest)}</b>`
            : `⚒ De camino…`;
          mision = `<div class="hacp-cp-mis hacp-cp-mis-on"><span class="hacp-cp-flag">${flag}</span><button type="button" class="hacp-cp-btn" data-act="release">Liberar</button></div>`;
        } else {
          const tasks = availableTasks();   // tareas DENTRO de la finca (edificios)
          const opts = tasks.map(t => `<option value="${esc(t.taskId)}">${esc(t.nombre)} · ${fmtDur(t.duracionSeg)} · −${costeMision(t.dominio)}⚡</option>`).join('');
          // "Buscar misiones" ahora vive en la barra de iconos (檄 Misiones); aquí solo
          // queda el selector de tarea interna.
          const sel = tasks.length ? `<div class="hacp-cp-mis"><label class="hacp-cp-lbl">Tarea en la finca</label><div class="hacp-cp-row"><select class="hacp-cp-sel">${opts}</select><button type="button" class="hacp-cp-btn hacp-cp-go" data-act="dispatch">Enviar</button></div></div>` : '';
          mision = sel;
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
        ${woundsHTML(d)}
        ${d.mine ? toolbarHTML(d) : ''}
        ${mision}
        ${(d.mine && invOpen) ? invPanelHTML(d) : ''}
        ${d.mine ? `<button type="button" class="hacp-cp-btn hacp-cp-leave" data-act="leave">Abandonar la hacienda</button>` : ''}`;
      lastStatsSig = JSON.stringify(d.stats || 0);   // recién pintadas: marca su firma
      charEl.querySelector('[data-act="close"]').addEventListener('click', deselect);
      const db = charEl.querySelector('[data-act="dispatch"]');
      if (db) db.addEventListener('click', () => { const s = charEl.querySelector('.hacp-cp-sel'); dispatch(s ? s.value : null); });
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
      charEl.querySelectorAll('[data-usar]').forEach(b => b.addEventListener('click', () => usarManualUI(b.dataset.usar)));
      const gh = charEl.querySelector('[data-act="gohome"]');
      if (gh) gh.addEventListener('click', openHome);
      const escb = charEl.querySelector('[data-act="esc"]');
      if (escb) escb.addEventListener('click', openEscOverlay);
      const logb = charEl.querySelector('[data-act="log"]');
      if (logb) logb.addEventListener('click', openBitacora);
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
        d.money, d.ahorro, d.heridas, d.equipN, d.cargo ? d.cargo.id : '-', d.home ? 1 : 0].join('|');
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
        const cards = [];
        inv.forEach(it => { const def = HacTienda.get(it.id); if (def) for (let k = 0; k < (it.n || 1); k++) cards.push(def); });
        body = `<div class="hacp-shop-sub">Regatea con el mercader para sacar más por lo que llevas · tu labia depende de 文·政.</div>
          ${cards.length ? `<div class="hacp-shop-grid">${cards.map(d => ventaCardHTML(d)).join('')}</div>`
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
    }
    function ventaCardHTML(item) {
      return `<div class="hacp-item t-venta">
        <div class="hacp-item-ic">${item.icon || '∎'}</div>
        <div class="hacp-item-main">
          <div class="hacp-item-name">${esc(item.nombre)} <span class="zh">${esc(item.zh || '')}</span></div>
          <div class="hacp-item-ef">Ofrecen desde 💰 ${ventaOferta(item)}</div>
        </div>
        <button type="button" class="hacp-item-buy" data-sell="${esc(item.id)}">💰 Vender</button></div>`;
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
      if (item.efecto && item.efecto.energia && window.HacEnergia) HacEnergia.add(h.id, myId, item.efecto.energia);
      toast(`${item.icon || ''} ${item.nombre} · ${HacTienda.efectoTexto(item)}`.trim());
      buildShop();                 // refresca dinero y botones
      if (charId) buildCharPanel(charId);   // refresca monedero/inventario/energía
    }

    // ── VENTA con REGATEO ────────────────────────────────────────────────────
    // El mercader arranca por DEBAJO del valor; tú aspiras a un TOPE = valor × mult,
    // con mult 1.75 para objetos ≤100 monedas y bajando (≈1.5 a las 1000) para que un
    // objeto caro no se venda desproporcionado. Cada «Regatear» empuja su oferta hacia
    // tu tope, con probabilidad de que CEDA (alta al principio; mejora con 文·政) o se
    // PLANTE. Futuro: objetos que suban esa labia (HacStats.bonusRegateo).
    const valorItem = (item) => Math.max(1, item.precio | 0);
    const ventaMult = (v) => Math.max(1.15, Math.min(1.75, 2.25 - 0.25 * Math.log10(Math.max(1, v))));
    const ventaTope = (item) => Math.round(valorItem(item) * ventaMult(valorItem(item)));
    const ventaOferta = (item) => Math.max(1, Math.round(valorItem(item) * 0.5));
    function regateoLabia() {
      if (!window.HacStats || !HacStats.nivelTotal) return 0;
      return HacStats.nivelTotal(myId, 'cultural') + HacStats.nivelTotal(myId, 'administrativo')
        + (HacStats.bonusRegateo ? HacStats.bonusRegateo(myId) : 0);
    }
    let ventaEl = null;
    function ensureVentaEl() {
      if (ventaEl) return ventaEl;
      ventaEl = document.createElement('div'); ventaEl.className = 'hacp-suc-ov hacp-venta-ov'; ventaEl.hidden = true;
      overlayHost().appendChild(ventaEl);
      ['pointerdown', 'pointerup', 'wheel', 'click'].forEach(ev => ventaEl.addEventListener(ev, (e) => e.stopPropagation(), { passive: false }));
      return ventaEl;
    }
    function cerrarVenta() { if (ventaEl) ventaEl.hidden = true; }
    function abrirRegateo(item) {
      if (!item || !myId) return;
      const st = { item, tope: ventaTope(item), cur: ventaOferta(item), ronda: 0, planted: false };
      renderRegateo(ensureVentaEl(), st);
      ventaEl.hidden = false;
    }
    function regatear(st) {
      const skill = regateoLabia();
      st.ronda++;
      const gap = st.tope - st.cur;
      if (gap <= 0) { st.planted = true; return; }
      const step = Math.max(1, Math.ceil(gap * (0.45 + Math.min(0.25, skill * 0.008))));
      const base = [0.98, 0.72, 0.52, 0.36, 0.24][Math.min(4, st.ronda - 1)];   // cede menos cada ronda
      const p = Math.max(0.05, Math.min(0.97, base + Math.min(0.30, skill * 0.01)));   // …pero 文·政 lo mejora
      if (Math.random() < p) { st.cur = Math.min(st.tope, st.cur + step); if (st.cur >= st.tope) st.planted = true; }
      else st.planted = true;   // «no doy más»
    }
    function renderRegateo(el, st) {
      const it = st.item, skill = regateoLabia();
      el.innerHTML = `<div class="hacp-suc-box hacp-venta-box">
        <div class="hacp-suc-eyebrow">💰 Vender · ${esc(it.nombre)} <span class="zh">${esc(it.zh || '')}</span></div>
        <div class="hacp-venta-ic">${it.icon || '∎'}</div>
        <div class="hacp-venta-deal">
          <div class="hacp-venta-side"><span>El mercader ofrece</span><b class="hacp-venta-cur">💰 ${st.cur}</b></div>
          <div class="hacp-venta-side dim"><span>Aspiras a</span><b>💰 ${st.tope}</b></div>
        </div>
        <div class="hacp-suc-hint">${st.planted ? '🧔 «Es mi última palabra, ni una moneda más.»' : `Tu labia 〔文·政〕: <b>${skill}</b> · regatea para subir la oferta`}</div>
        <div class="hacp-suc-confirm">
          <button type="button" class="hacp-cp-btn hacp-suc-cancel" data-v-cancel>Dejarlo</button>
          ${st.planted ? '' : `<button type="button" class="hacp-cp-btn" data-v-regatear>Regatear</button>`}
          <button type="button" class="hacp-cp-btn hacp-suc-ok" data-v-ok>Vender 💰 ${st.cur}</button>
        </div></div>`;
      el.querySelector('[data-v-cancel]').addEventListener('click', cerrarVenta);
      const rb = el.querySelector('[data-v-regatear]');
      if (rb) rb.addEventListener('click', () => { regatear(st); renderRegateo(el, st); });
      el.querySelector('[data-v-ok]').addEventListener('click', () => {
        const res = HacStats.venderItem(myId, it.id, st.cur);
        if (!res.ok) { toast(res.motivo || 'No se pudo vender'); return; }
        cerrarVenta();
        toast(`💰 Vendiste ${it.nombre} por ${st.cur}`);
        if (window.HacBitacora) HacBitacora.log(myId, 'venta', `💰 Vendiste ${it.nombre} por ${st.cur} monedas`);
        buildShop(); if (charId) buildCharPanel(charId);
      });
    }

    // ── Bautizo del CABALLO (compra única) ───────────────────────────────────
    // Nombres sugeridos EN CASTELLANO (glosas de corceles célebres del período); el
    // jugador puede escribir el suyo. Nada de chino aquí: debe entenderse.
    const CABALLO_NOMBRES = ['Liebre Roja', 'Sombra Fugaz', 'Rayo Bayo', 'Azabache', 'Vela Veloz', 'Tormenta'];
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
        <input type="text" class="hacp-horse-in" maxlength="24" value="${esc(sug)}" placeholder="Nombre del caballo" />
        <div class="hacp-horse-sug">${CABALLO_NOMBRES.map(n => `<button type="button" class="hacp-horse-chip" data-nom="${esc(n)}">${esc(n)}</button>`).join('')}</div>
        <div class="hacp-suc-confirm">
          <button type="button" class="hacp-cp-btn hacp-suc-cancel" data-h-cancel>Cancelar</button>
          <button type="button" class="hacp-cp-btn hacp-suc-ok" data-h-ok>Bautizar 💰 ${precio}</button>
        </div></div>`;
      el.hidden = false;
      const input = el.querySelector('.hacp-horse-in');
      if (input) { try { input.focus(); input.select(); } catch (e) {} }
      el.querySelectorAll('[data-nom]').forEach(b => b.addEventListener('click', () => { if (input) { input.value = b.dataset.nom; input.focus(); } }));
      el.querySelector('[data-h-cancel]').addEventListener('click', cerrarBautizo);
      el.querySelector('[data-h-ok]').addEventListener('click', () => {
        const nombre = (input && input.value || '').trim() || CABALLO_NOMBRES[0];
        const res = HacStats.comprarCaballo(myId, item.id, nombre, precio);
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
      (h.miembros || []).forEach(m => { const pid = m.personajeId || m.id; const c = HacStats.caballo(pid); if (c) map[pid] = { nombre: c.nombre, variante: c.id || 'caballo' }; });
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
      // Bonos totales por dominio (de lo equipado).
      const tot = HacStats.DOMS.map(dom => ({ dom, b: HacStats.bonus(myId, dom) }));
      const totHTML = tot.map(t => `<span class="hacp-eq-tot" style="color:${DOM_COLOR[t.dom]}">${DOM_ABBR[t.dom]} <b>${t.b > 0 ? '+' + t.b : '0'}</b></span>`).join('');
      // Ranuras equipadas.
      const slots = [];
      for (let i = 0; i < max; i++) {
        const id = eq[i], def = id && HacTienda.get(id);
        slots.push(def
          ? `<button type="button" class="hacp-eq-slot full" data-uneq="${esc(id)}" title="${esc(def.nombre)} · clic para quitar"><span class="hacp-eq-ic">${def.icon}</span><span class="hacp-eq-nm">${esc(def.nombre)}</span><span class="hacp-eq-bo">${esc(HacTienda.efectoTexto(def).replace('Equipable · ', ''))}</span><span class="hacp-eq-x">✕</span></button>`
          : `<div class="hacp-eq-slot empty">Ranura libre</div>`);
      }
      // Objetos equipables en la mochila (no equipados).
      const ownable = HacStats.inventario(myId).filter(it => HacTienda.equipBonus(it.id));
      const list = ownable.length
        ? ownable.map(it => { const def = HacTienda.get(it.id); const full = eq.length >= max; return `<button type="button" class="hacp-eq-own" data-eq="${esc(it.id)}"${full ? ' disabled' : ''}><span class="hacp-eq-ic">${def.icon}</span><span class="hacp-eq-nm">${esc(def.nombre)}${(it.n || 1) > 1 ? ' ×' + it.n : ''}</span><span class="hacp-eq-bo">${esc(HacTienda.efectoTexto(def).replace('Equipable · ', ''))}</span></button>`; }).join('')
        : '<span class="hacp-inv-note">No tienes objetos equipables. Cómpralos en el mercado (tratados de armas, clásicos, códigos legales…).</span>';
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
        const rm = retoMultMision(m);                                             // rutina si va muy por debajo de tu nivel
        const dinB = Math.round(conBono(rec.dinero, bonos.dinero) * rm), xpB = Math.round(conBono(rec.xp, xpFracMision(m.dom)) * rm);   // ya con bonos de pabellón
        const rutina = rm < 1 ? ` <span class="hacp-mis-rutina" title="Rutina: muy por debajo de tu nivel, rinde ${Math.round(rm * 100)}%">rutina</span>` : '';
        return `<div class="hacp-mis t-${m.dom}">
          <span class="hacp-mis-g" style="color:${DOM_COLOR[m.dom]}">${DOM_GLYPH[m.dom]}</span>
          <div class="hacp-mis-main">
            <div class="hacp-mis-name">${esc(m.nombre)} <span class="hacp-mis-dif">dif. ${m.dif}</span>${rutina}</div>
            <div class="hacp-mis-meta">⏱ ${fmtClock(durExped(m))}${durExped(m) < HacMisiones.durSeg(m) ? '<sup class="hacp-bono">↓</sup>' : ''} · <span class="${sinEn ? 'hacp-mis-noen' : ''}">−${en}⚡</span> · +${dinB}💰${bonos.dinero ? '<sup class="hacp-bono">↑</sup>' : ''} · +${xpB} XP${xpFracMision(m.dom) > 0 ? '<sup class="hacp-bono">↑</sup>' : ''} ${DOM_GLYPH[m.dom]} · 🎁 ${loot}%</div>
          </div>
          <span class="hacp-mis-risk r-${rc}" title="Riesgo de fracaso (baja con tu nivel ${DOM_GLYPH[m.dom]} y el equipo)">⚠ ${Math.round(risk * 100)}%</span>
          <button type="button" class="hacp-mis-go" data-mis="${esc(m.id)}"${ocupado || sinEn ? ' disabled' : ''} title="${sinEn ? 'Energía insuficiente' : ''}">Enviar</button>
        </div>`;
      }).join('');
      el.innerHTML = `
        <div class="hacp-shop-box">
          <button type="button" class="hacp-shop-x" data-act="board-close" aria-label="Cerrar">✕</button>
          <div class="hacp-shop-h"><span class="hacp-shop-zh">📜</span> Tablón de misiones <span class="hacp-shop-money">⚡ <b>${Math.round(energia)}</b></span></div>
          <div class="hacp-shop-sub">A tu nivel una misión es una apuesta real; superarla baja el riesgo con rendimientos decrecientes (nunca es gratis). Las muy por debajo de tu nivel son <b>rutina</b> y pagan menos: conviene variar de dominio y buscar retos. Las difíciles cuestan más energía y dan más 🎁 botín.${ocupado ? ' <b>Tu mecenas ya está en una misión.</b>' : ''}</div>
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
    // Parpadeo del botón Escaramuzas cuando el capitán tiene una decisión de maniobra
    // pendiente y NO está en esa sección (dentro, la carta ya se abre sola).
    function pulseEscNav() {
      const btn = document.querySelector('#hacp-mnav [data-sec="escaramuzas"]'); if (!btn) return;
      btn.classList.toggle('pulse', !!escSucesoPend() && !btn.classList.contains('on'));
    }
    // Tic de 1 s: refresca SOLO el panel del personaje (cuenta atrás de expedición y
    // energía/regeneración se derivan del reloj de servidor → tienen que verse vivos).
    setInterval(() => { if (charId) refreshCharPanel(); if (escVisible) escTick(); sucesoTick(); escSucesoTick(); pulseHaciendaNav(); pulseEscNav(); }, 1000);

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
      mShell = { showChar, go: (s) => mgo(s) };

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
