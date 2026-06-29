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
    // Acceso directo a la tienda del mercado (si la finca tiene uno).
    const hasMarketEarly = ((h.mapa && h.mapa.construcciones) || []).some(c => c.tipo === 'mercado');
    if (hasMarketEarly && panel) {
      const mb = document.createElement('button');
      mb.type = 'button'; mb.className = 'hacp-folk-shop'; mb.textContent = '🛒 Mercado';
      mb.addEventListener('click', (e) => { e.stopPropagation(); openShop(); });
      const ttl = panel.querySelector('.hacp-folk-ttl');
      if (ttl) ttl.insertAdjacentElement('afterend', mb); else panel.insertBefore(mb, listEl);
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
    // Casa de un mecenas = construcción 'casa' cuyo DUEÑO es su miembro (asignado en
    // el admin). El walker.id es el personajeId; el dueño de la casa es el id de miembro.
    function casaDe(personajeId) {
      const m = (h.miembros || []).find(x => x.personajeId === personajeId);
      if (!m) return null;
      const mid = String(m.id);
      return ((h.mapa && h.mapa.construcciones) || []).find(c => c.tipo === 'casa' && c.dueno != null && String(c.dueno) === mid) || null;
    }
    // Coste de una misión según si el mecenas DOMINA el dominio del edificio (suave).
    function costeMision(dominio) {
      const competente = window.HacCompetencias && dominio && HacCompetencias.has(h.id, myId, myApt, dominio);
      const base = (window.HacEnergia && HacEnergia.COSTE_MISION) || 34;
      return competente ? Math.round(base * 0.5) : base;
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
      // EXPEDICIONES (misiones FUERA de la finca): el mecenas sale por el portón,
      // se ausenta y vuelve. Una por dominio. (XP/dinero llegan en el paso 1b.)
      EXPEDICIONES.forEach(e => out.push({ taskId: 'exped:' + e.dom, nombre: e.nombre, dominio: e.dom, duracionSeg: 120, exped: true }));
      return out;
    }
    const EXPEDICIONES = [
      { dom: 'militar',        nombre: '武 Patrulla fronteriza (fuera)' },
      { dom: 'cultural',       nombre: '文 Embajada · viaje de estudios (fuera)' },
      { dom: 'administrativo', nombre: '政 Recaudar tributos (fuera)' },
    ];
    const DOM_GLYPH = { militar: '武', cultural: '文', administrativo: '政' };
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
        if (o.tipo === 'expedicion') dom = String(o.targetId || '').replace('exped:', '') || null;
        else { const task = (window.HacTareas && HacTareas.get) ? HacTareas.get(o.targetId) : null; dom = (task && window.HacBuild) ? (HacBuild.tipo(task.tipo) || {}).dominio : null; }
        const r = HacPuntos.recompensa(costeMision(dom), o.duracionSeg || 60);
        HacPuntos.award(h.id, myId, r);
        // Expediciones: además del prestigio a la casa, dan dinero + XP PERSONAL al mecenas.
        let extra = '';
        if (o.tipo === 'expedicion' && window.HacStats) {
          const rec = HacStats.recompensaExped(dom, o.duracionSeg || 120);
          HacStats.award(myId, { dinero: rec.dinero, xp: rec.dom ? { [rec.dom]: rec.xp } : null });
          extra = ` · +${rec.dinero}💰 · +${rec.xp} XP ${DOM_GLYPH[rec.dom] || ''}`.trimEnd();
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
      if (window.HacEnergia) HacEnergia.spend(h.id, myId, costeMision(t.dominio));   // la misión cuesta energía
      HacOrdenes.set({ haciendaId: h.id, miembroId: myId, tipo: t.exped ? 'expedicion' : 'mision', targetId: taskId, duracionSeg: t.duracionSeg })
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
    let charId = null, charSig = '', invOpen = false;
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
      const home = !!casaDe(id);                                                       // ¿tiene casa asignada?
      const ahorro = (window.HacStats && HacStats.ahorro) ? HacStats.ahorro(id) : 0;   // dinero a salvo en casa
      // "Poder personal": nivel 武/文/政 derivado del XP de cada dominio.
      const stats = (window.HacStats && HacStats.progresoNivel)
        ? HacStats.DOMS.map(dom => { const p = HacStats.progresoNivel(id, dom); return { dom, nivel: p.nivel, pct: p.pct, xp: p.xp, falta: p.falta }; })
        : null;
      return { it, aptId, aptDef, e, eFull, eRegenMin, activa, enTarea, fuera, exped, rest, mine: id === myId, puntos: puntosTotales(id), earned, money, home, ahorro, stats };
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
      return `<div class="hacp-inv">
        <div class="hacp-inv-h">🎒 Mochila de ${esc(d.it.name)}</div>
        <div class="hacp-wallet">💰 Monedero: <b>${d.money}</b> <span class="hacp-inv-note">monedas</span></div>
        ${hasHome ? `<div class="hacp-wallet hacp-vault">🏠 En casa: <b>${d.ahorro}</b> <span class="hacp-inv-note">a salvo</span></div>` : ''}
        <div class="hacp-inv-cap">Inventario <b>${flat.length}/${cap}</b></div>
        <div class="hacp-inv-grid">${slots}</div>
        ${marketBtnHTML()}
        <button type="button" class="hacp-cp-btn hacp-store" data-act="store"${canStore ? '' : ' disabled'}>🏠 Guardar dinero en casa</button>
        <div class="hacp-inv-note">${hasHome ? 'Lleva todo el monedero a casa y guárdalo a salvo.' : '🏠 Sin hogar: necesita una Casa de Mecenas (que se la asigne el fundador) para almacenar.'}</div>
      </div>`;
    }
    // Botón para abrir la tienda, solo si la finca tiene un mercado construido.
    function marketBtnHTML() {
      return hasMarket ? `<button type="button" class="hacp-cp-btn hacp-cp-shop" data-act="shop">🛒 Comprar en el mercado</button>` : '';
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
    const DOM_COLOR = { militar: '#b23b2e', cultural: '#3a8a5a', administrativo: '#3a6ea5' };
    function statsHTML(d) {
      if (!d.stats) return '';
      const chips = d.stats.map(s => `<div class="hacp-cp-stat" title="${DOM_GLYPH[s.dom]} ${DOM_NOMBRE[s.dom]} · nivel ${s.nivel} · ${s.xp} XP${s.falta ? ` · faltan ${s.falta} para subir` : ''}">
        <span class="hacp-cp-stat-g" style="color:${DOM_COLOR[s.dom]}">${DOM_GLYPH[s.dom]}</span>
        <span class="hacp-cp-stat-n">${s.nivel}</span>
        <i class="hacp-cp-stat-bar"><b style="width:${Math.round(s.pct * 100)}%;background:${DOM_COLOR[s.dom]}"></b></i>
      </div>`).join('');
      return `<div class="hacp-cp-stats" id="hacp-cp-stats">${chips}</div>`;
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
          const tasks = availableTasks();   // por TAREA (deduplicada por tipo), con su duración propia
          const opts = tasks.map(t => `<option value="${esc(t.taskId)}">${esc(t.nombre)} · ${fmtDur(t.duracionSeg)} · −${costeMision(t.dominio)}⚡</option>`).join('');
          if (tasks.length) mision = `<div class="hacp-cp-mis"><label class="hacp-cp-lbl">Enviar a misión</label><div class="hacp-cp-row"><select class="hacp-cp-sel">${opts}</select><button type="button" class="hacp-cp-btn hacp-cp-go" data-act="dispatch">Enviar</button></div></div>`;
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
        ${mision}
        ${d.mine ? `<button type="button" class="hacp-cp-btn hacp-cp-invbtn${invOpen ? ' on' : ''}" data-act="inv">🎒 ${invOpen ? 'Ocultar' : 'Inventario'} · 💰 ${d.money}</button>` : ''}
        ${(d.mine && invOpen) ? invPanelHTML(d) : ''}`;
      charEl.querySelector('[data-act="close"]').addEventListener('click', deselect);
      const db = charEl.querySelector('[data-act="dispatch"]');
      if (db) db.addEventListener('click', () => { const s = charEl.querySelector('.hacp-cp-sel'); dispatch(s ? s.value : null); });
      const rb = charEl.querySelector('[data-act="release"]');
      if (rb) rb.addEventListener('click', release);
      const ib = charEl.querySelector('[data-act="inv"]');
      if (ib) ib.addEventListener('click', () => { invOpen = !invOpen; buildCharPanel(charId); });
      const shb = charEl.querySelector('[data-act="shop"]');
      if (shb) shb.addEventListener('click', openShop);
      const sb = charEl.querySelector('[data-act="store"]');
      if (sb && !sb.disabled) sb.addEventListener('click', () => {
        if (!myId || !window.HacStats) return;
        const n = HacStats.guardar(myId);                 // mueve TODO el monedero al ahorro de casa
        if (n > 0) { toast(`🏠 Guardaste ${n} 💰 a salvo en casa`); buildCharPanel(charId); }
        else toast('No llevas dinero que guardar');
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
      charId = id; charEl.hidden = false;
      const d = charData(id); charSig = d ? sigOf(d) : '';
      buildCharPanel(id);
      startAvatar();
    }
    function closeCharPanel() { if (charEl) { charId = null; charEl.hidden = true; } stopAvatar(); }
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
      const st = charEl.querySelector('#hacp-cp-stats'); if (st) st.outerHTML = statsHTML(d);
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
      return shopEl;
    }
    function itemCardHTML(item, locked) {
      const money = window.HacStats ? HacStats.dinero(myId) : 0;
      const noMoney = money < item.precio;
      const disabled = locked || !myId || noMoney;
      const btn = locked
        ? `<span class="hacp-item-lock">🔒 Nivel ${item.tier}</span>`
        : `<button type="button" class="hacp-item-buy" data-buy="${esc(item.id)}"${disabled ? ' disabled' : ''}>💰 ${item.precio}</button>`;
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
      const res = HacStats.comprar(myId, item);
      if (!res.ok) { toast(res.motivo || 'No se pudo comprar'); return; }
      if (item.efecto && item.efecto.energia && window.HacEnergia) HacEnergia.add(h.id, myId, item.efecto.energia);
      toast(`${item.icon || ''} ${item.nombre} · ${HacTienda.efectoTexto(item)}`.trim());
      buildShop();                 // refresca dinero y botones
      if (charId) buildCharPanel(charId);   // refresca monedero/inventario/energía
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
