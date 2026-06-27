/* ═══════════════════════════════════════════════════════════════════════
   hac-onboard.js — Onboarding del jugador en la página Haciendas.
   ─────────────────────────────────────────────────────────────────────────
   Detecta el estado de la cuenta y muestra la puerta de entrada al juego:

     · SIN sesión        → invitación a acceder (Google).
     · CON sesión y SIN
       personaje          → INTRO romantizada (patio vivo: HacIso + HacFolk) y
                            formulario de creación de personaje, con preview en
                            vivo del modelo (HacChar). Al crear, persiste en
                            Supabase con owner = uid (RLS lo permite).
     · CON personaje      → resumen del personaje (la elección de hacienda llega
                            en la Fase 3).

   Pinta dentro de #hac-onboard. Reacciona a login/logout (Auth.onChange).
   Requiere el motor: HacChar, HacIso, HacFolk, HacPersonajes, HacPersonajeDefs.
   ═══════════════════════════════════════════════════════════════════════ */
const HacOnboard = (function () {
  'use strict';

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let host = null;
  let folkOn = false;       // HacFolk corriendo en la escena de intro
  let preview = null;       // { stop } del bucle de preview del personaje
  let booted = false;

  // Escena de intro: un patio pequeño y vivo (sin interacción de cámara).
  const SCENE = {
    tier: 1,
    color: '#b8842c',
    mapa: {
      v: 1, estacion: 'verano', construcciones: [
        { pos: [2, 2], tipo: 'pabellon', rot: 0, dueno: null, nivel: 1 },
        { pos: [5, 3], tipo: 'galeria', rot: 1, dueno: null, nivel: 1 },
        { pos: [3, 8], tipo: 'pabellon-te', rot: 0, dueno: null, nivel: 1 },
        { pos: [5, 8], tipo: 'farol', rot: 0, dueno: null, nivel: 1 },
        { pos: [1, 5], tipo: 'jardin-flores', rot: 0, dueno: null, nivel: 1 },
        { pos: [1, 6], tipo: 'jardin-flores', rot: 0, dueno: null, nivel: 1 },
        { pos: [3, 4], tipo: 'camino', rot: 0 }, { pos: [3, 5], tipo: 'camino', rot: 0 },
        { pos: [3, 6], tipo: 'camino', rot: 0 }, { pos: [3, 7], tipo: 'camino', rot: 0 },
        { pos: [2, 6], tipo: 'camino', rot: 0 }, { pos: [4, 6], tipo: 'camino', rot: 0 }
      ]
    },
    miembros: [
      { id: 'onb-a', nombre: 'Zhao Yun', puntos: 1500, desde: '2026', nota: '' },
      { id: 'onb-b', nombre: 'Zhuge Liang', puntos: 600, desde: '2026', nota: '' }
    ]
  };

  // ── Estilos (una sola vez; prefijo .onb-) ─────────────────────────────────
  function injectStyles() {
    if (document.getElementById('onb-styles')) return;
    const css = `
    #hac-onboard{margin:0 auto 8px;max-width:1040px;padding:0 16px}
    .onb-card{background:linear-gradient(180deg,#fbf4e3,#f3e7cb);border:1px solid #cdbd97;
      border-radius:14px;box-shadow:0 10px 30px rgba(60,40,18,.16);overflow:hidden}
    .onb-hero{display:grid;grid-template-columns:1.05fr .95fr;gap:0}
    @media(max-width:760px){.onb-hero{grid-template-columns:1fr}}
    .onb-scene{position:relative;background:radial-gradient(120% 120% at 50% 20%,#9ab87f,#6f9560);min-height:240px;
      display:flex;align-items:center;justify-content:center;overflow:hidden}
    .onb-scene canvas{width:100%;height:auto;display:block;image-rendering:pixelated;image-rendering:crisp-edges}
    .onb-scene-tag{position:absolute;left:12px;bottom:10px;font:600 11px/1 "Noto Sans SC",sans-serif;
      color:#f3ead2;text-shadow:0 1px 3px rgba(0,0,0,.6);letter-spacing:.04em}
    .onb-copy{padding:26px 28px;display:flex;flex-direction:column;justify-content:center}
    .onb-zh{font:700 30px "Noto Serif SC",serif;color:#9c2b1e;margin:0 0 2px}
    .onb-ttl{font:800 23px/1.15 "Noto Serif SC",serif;color:#3a2a16;margin:0 0 10px}
    .onb-lead{font:400 15px/1.6 "Noto Sans SC",sans-serif;color:#5a4a32;margin:0 0 16px}
    .onb-lead b{color:#7a2418}
    .onb-cta{align-self:flex-start;border:0;cursor:pointer;background:linear-gradient(180deg,#b8331f,#8f1d11);
      color:#fbeecf;font:700 15px "Noto Serif SC",serif;padding:11px 22px;border-radius:9px;
      box-shadow:0 4px 0 #5e120a,0 8px 18px rgba(120,30,18,.35);transition:transform .08s}
    .onb-cta:hover{transform:translateY(-1px)}.onb-cta:active{transform:translateY(2px);box-shadow:0 2px 0 #5e120a}
    .onb-cta.gold{background:linear-gradient(180deg,#caa42c,#a07f1c);color:#3a2408;box-shadow:0 4px 0 #6e4f12,0 8px 18px rgba(140,110,20,.35)}
    .onb-sub{font:400 13px/1.5 "Noto Sans SC",sans-serif;color:#7a6a4a;margin:10px 0 0}
    /* Formulario de creación */
    .onb-form{padding:24px 28px}
    .onb-form-grid{display:grid;grid-template-columns:200px 1fr;gap:26px}
    @media(max-width:680px){.onb-form-grid{grid-template-columns:1fr}}
    .onb-prev{position:sticky;top:12px;align-self:start;text-align:center;background:radial-gradient(120% 120% at 50% 25%,#9ab87f,#6f9560);
      border-radius:12px;padding:14px 10px;border:1px solid #5d7a4e}
    .onb-prev canvas{image-rendering:pixelated;width:96px;height:auto;display:block;margin:0 auto}
    .onb-prev-name{font:700 14px "Noto Serif SC",serif;color:#f3ead2;text-shadow:0 1px 2px rgba(0,0,0,.5);margin-top:8px;min-height:18px}
    .onb-prev-rol{font:600 11px "Noto Sans SC",sans-serif;color:#e7dcbf;text-shadow:0 1px 2px rgba(0,0,0,.5);opacity:.92}
    .onb-field{margin-bottom:18px}
    .onb-label{display:block;font:700 12px "Noto Sans SC",sans-serif;letter-spacing:.05em;text-transform:uppercase;color:#8a5a2a;margin-bottom:7px}
    .onb-input{width:100%;box-sizing:border-box;border:1px solid #cdbd97;background:#fffdf7;border-radius:8px;
      padding:10px 12px;font:600 15px "Noto Serif SC",serif;color:#3a2a16}
    .onb-input:focus{outline:none;border-color:#b8331f;box-shadow:0 0 0 3px rgba(184,51,31,.15)}
    .onb-opts{display:flex;flex-wrap:wrap;gap:8px}
    .onb-opt{cursor:pointer;border:1px solid #cdbd97;background:#fffdf7;border-radius:9px;padding:8px 11px;
      display:flex;align-items:center;gap:7px;transition:all .1s;min-width:0}
    .onb-opt:hover{border-color:#b8895a}
    .onb-opt.on{border-color:#b8331f;background:#fbeede;box-shadow:0 0 0 2px rgba(184,51,31,.18)}
    .onb-opt input{position:absolute;opacity:0;pointer-events:none}
    .onb-opt-zh{font:700 17px "Noto Serif SC",serif;color:#9c2b1e}
    .onb-opt-tx{display:flex;flex-direction:column;line-height:1.15}
    .onb-opt-nm{font:700 13px "Noto Sans SC",sans-serif;color:#3a2a16}
    .onb-opt-ds{font:400 11px "Noto Sans SC",sans-serif;color:#8a7a5a;max-width:190px}
    .onb-sw{display:flex;gap:7px}
    .onb-sw button{width:26px;height:26px;border-radius:50%;border:2px solid #cdbd97;cursor:pointer;padding:0}
    .onb-sw button.on{border-color:#3a2a16;box-shadow:0 0 0 2px #fff,0 0 0 4px #b8331f}
    .onb-actions{display:flex;gap:12px;align-items:center;margin-top:6px}
    .onb-err{color:#9c2b1e;font:600 13px "Noto Sans SC",sans-serif;margin:0}
    .onb-loading{padding:30px;text-align:center;color:#8a7a5a;font:600 14px "Noto Sans SC",sans-serif}
    /* Listado de haciendas para solicitar entrada */
    .onb-pickhd{display:flex;gap:16px;align-items:center;margin-bottom:16px}
    .onb-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(232px,1fr));gap:12px}
    .onb-h{border:1px solid #cdbd97;border-radius:11px;background:#fffdf7;padding:14px;display:flex;flex-direction:column;gap:7px}
    .onb-h-top{display:flex;align-items:baseline;gap:8px}
    .onb-h-zh{font:700 21px "Noto Serif SC",serif;color:#9c2b1e;line-height:1}
    .onb-h-nm{font:800 16px "Noto Serif SC",serif;color:#3a2a16}
    .onb-h-meta{font:600 12px "Noto Sans SC",sans-serif;color:#8a7a5a}
    .onb-h-lema{font:italic 400 13px/1.45 "Noto Sans SC",sans-serif;color:#6a5a3e;flex:1;min-height:18px}
    .onb-h .onb-cta{align-self:stretch;text-align:center;font-size:14px;padding:9px 0}
    .onb-h .onb-cta:disabled{opacity:.55;cursor:default;box-shadow:none;transform:none}
    /* Estado (pendiente / miembro) */
    .onb-status{display:flex;gap:18px;align-items:center;padding:6px 0}
    .onb-badge{display:inline-block;padding:3px 11px;border-radius:999px;font:700 12px "Noto Sans SC",sans-serif}
    .onb-badge.wait{background:#f3e0b0;color:#7a5512}
    .onb-badge.ok{background:#cdeccd;color:#1f6b2f}
    `;
    const st = document.createElement('style'); st.id = 'onb-styles'; st.textContent = css;
    document.head.appendChild(st);
  }

  // ── Escena de intro (HacIso + HacFolk) ────────────────────────────────────
  function startScene(canvas) {
    if (!window.HacIso || !canvas) return;
    try {
      HacIso.draw(canvas, { mapa: SCENE.mapa, tier: SCENE.tier, color: SCENE.color, pabellones: [], estacion: 'verano' });
      if (window.HacFolk) {
        HacFolk.start(canvas, { mapa: SCENE.mapa, tier: SCENE.tier, color: SCENE.color, miembros: SCENE.miembros });
        folkOn = true;
      }
    } catch (e) { console.warn('[onboard] escena', e); }
  }
  function stopScene() { if (folkOn && window.HacFolk) { try { HacFolk.stop(); } catch (e) { } folkOn = false; } }

  // ── Preview en vivo del personaje (HacChar) ───────────────────────────────
  function startPreview(canvas, getState) {
    stopPreview();
    if (!window.HacChar || !canvas) return;
    const DIRS = ['S', 'SE', 'E', 'SE', 'S', 'SW', 'W', 'SW'];
    let raf = null, t0 = 0, di = 0, frame = 0, acc = 0, dirAcc = 0;
    function tick(ts) {
      const dt = Math.min(0.05, (ts - t0) / 1000 || 0); t0 = ts;
      acc += dt; dirAcc += dt;
      if (acc > 0.16) { acc = 0; frame = (frame + 1) % HacChar.FRAMES; }
      if (dirAcc > 1.1) { dirAcc = 0; di = (di + 1) % DIRS.length; }
      const s = getState();
      HacChar.draw(canvas, { aptitud: s.aptitud, aspecto: s.aspecto, dir: DIRS[di], frame, scale: 3 });
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    preview = { stop: () => { if (raf) cancelAnimationFrame(raf); } };
  }
  function stopPreview() { if (preview) { try { preview.stop(); } catch (e) { } preview = null; } }

  function teardown() { stopScene(); stopPreview(); }

  // ── Vistas ────────────────────────────────────────────────────────────────
  function renderAnon() {
    teardown();
    host.innerHTML = `
      <div class="onb-card"><div class="onb-hero">
        <div class="onb-scene"><canvas id="onb-scene-cv"></canvas><span class="onb-scene-tag">莊園 · una casa que cobra vida</span></div>
        <div class="onb-copy">
          <p class="onb-zh">立家</p>
          <h2 class="onb-ttl">Funda tu linaje en una Hacienda</h2>
          <p class="onb-lead">En la China de los Tres Reinos, las grandes casas sostenían a quienes vivían bajo su nombre. Aquí cada mecenas <b>encarna un personaje</b> que pasea por la finca, conversa y asciende en el escalafón de la casa.</p>
          <button class="onb-cta" data-login>Acceder con Google</button>
          <p class="onb-sub">Accede para crear tu personaje y unirte a una hacienda.</p>
        </div>
      </div></div>`;
    startScene(document.getElementById('onb-scene-cv'));
    host.querySelector('[data-login]').addEventListener('click', (e) => {
      e.target.disabled = true; Auth.loginWithGoogle().catch(err => { e.target.disabled = false; alert(err.message || err); });
    });
  }

  function renderIntro(user) {
    teardown();
    host.innerHTML = `
      <div class="onb-card"><div class="onb-hero">
        <div class="onb-scene"><canvas id="onb-scene-cv"></canvas><span class="onb-scene-tag">莊園 · el patio de una casa</span></div>
        <div class="onb-copy">
          <p class="onb-zh">立家</p>
          <h2 class="onb-ttl">Bienvenido, ${esc((user.nombre || '').split(' ')[0] || 'viajero')}</h2>
          <p class="onb-lead">Las Haciendas son casas nobiliarias vivas: sus mecenas <b>pasean por la finca</b>, conversan y reciben cargos según su peso. Para entrar, primero <b>crea tu personaje</b> — tu rostro en este mundo.</p>
          <button class="onb-cta gold" data-create>Crear mi personaje</button>
          <p class="onb-sub">Después podrás solicitar entrada en la hacienda que elijas.</p>
        </div>
      </div></div>`;
    startScene(document.getElementById('onb-scene-cv'));
    host.querySelector('[data-create]').addEventListener('click', () => renderForm(user));
  }

  function renderForm(user) {
    teardown();
    const PERS = (window.HacPersonajeDefs && HacPersonajeDefs.PERSONALIDADES) || [];
    const APTS = (window.HacPersonajeDefs && HacPersonajeDefs.APTITUDES) || [];
    const SKINS = (window.HacChar && HacChar.SKINS) || ['#eac9a0', '#dcb487', '#c89a6e', '#ad7d54'];
    const HAIRS = (window.HacChar && HacChar.HAIRS) || ['#1b1712', '#2c2318', '#46301a', '#0f0d0b'];
    const sel = { nombre: '', personalidad: '', aptitud: '', piel: 0, pelo: 0 };

    const optList = (name, arr) => arr.map(o => `
      <label class="onb-opt" data-grp="${name}" data-val="${esc(o.id)}">
        <input type="radio" name="${name}" value="${esc(o.id)}">
        <span class="onb-opt-zh">${esc(o.zh || '')}</span>
        <span class="onb-opt-tx"><span class="onb-opt-nm">${esc(o.nombre)}</span><span class="onb-opt-ds">${esc(o.desc || '')}</span></span>
      </label>`).join('');
    const swList = (name, cols) => cols.map((c, i) => `<button type="button" data-sw="${name}" data-i="${i}" style="background:${c}"></button>`).join('');

    host.innerHTML = `
      <div class="onb-card"><div class="onb-form">
        <h2 class="onb-ttl" style="margin-bottom:4px">Crea tu personaje</h2>
        <p class="onb-sub" style="margin:0 0 18px">Tu nombre, tu carácter y tu vocación. Así te verán pasear por la finca.</p>
        <div class="onb-form-grid">
          <div class="onb-prev">
            <canvas id="onb-prev-cv"></canvas>
            <div class="onb-prev-name" id="onb-prev-name">—</div>
            <div class="onb-prev-rol" id="onb-prev-rol"></div>
          </div>
          <div>
            <div class="onb-field">
              <label class="onb-label" for="onb-nombre">Nombre</label>
              <input class="onb-input" id="onb-nombre" maxlength="24" placeholder="p. ej. Zhao Yun" autocomplete="off">
            </div>
            <div class="onb-field">
              <label class="onb-label">Carácter (personalidad)</label>
              <div class="onb-opts" id="onb-pers">${optList('personalidad', PERS)}</div>
            </div>
            <div class="onb-field">
              <label class="onb-label">Vocación (aptitud)</label>
              <div class="onb-opts" id="onb-apt">${optList('aptitud', APTS)}</div>
            </div>
            <div class="onb-field">
              <label class="onb-label">Piel</label><div class="onb-sw" id="onb-piel">${swList('piel', SKINS)}</div>
            </div>
            <div class="onb-field">
              <label class="onb-label">Cabello</label><div class="onb-sw" id="onb-pelo">${swList('pelo', HAIRS)}</div>
            </div>
            <div class="onb-actions">
              <button class="onb-cta gold" id="onb-submit">Fundar personaje</button>
              <button class="onb-cta" id="onb-back" style="background:#7a6a4a;box-shadow:0 4px 0 #4a3d28">Volver</button>
              <p class="onb-err" id="onb-err" hidden></p>
            </div>
          </div>
        </div>
      </div></div>`;

    const state = () => ({ aptitud: sel.aptitud, aspecto: { piel: sel.piel, pelo: sel.pelo } });
    startPreview(document.getElementById('onb-prev-cv'), state);

    const nameEl = host.querySelector('#onb-nombre');
    const rolEl = host.querySelector('#onb-prev-rol');
    const nmEl = host.querySelector('#onb-prev-name');
    const refreshMeta = () => {
      nmEl.textContent = sel.nombre || '—';
      const a = APTS.find(x => x.id === sel.aptitud);
      rolEl.textContent = a ? (a.icon ? a.icon + ' ' : '') + a.nombre : '';
    };
    nameEl.addEventListener('input', () => { sel.nombre = nameEl.value.trim(); refreshMeta(); });

    host.querySelectorAll('.onb-opt').forEach(lab => lab.addEventListener('click', (e) => {
      e.preventDefault();
      const grp = lab.dataset.grp, val = lab.dataset.val;
      sel[grp] = val;
      host.querySelectorAll(`.onb-opt[data-grp="${grp}"]`).forEach(l => l.classList.toggle('on', l === lab));
      refreshMeta();
    }));
    const initSw = (name) => {
      const wrap = host.querySelector('#onb-' + name);
      wrap.querySelectorAll('button').forEach((b, i) => {
        if (i === sel[name]) b.classList.add('on');
        b.addEventListener('click', () => { sel[name] = i; wrap.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); });
      });
    };
    initSw('piel'); initSw('pelo');

    const errEl = host.querySelector('#onb-err');
    const showErr = (m) => { errEl.textContent = m; errEl.hidden = !m; };
    host.querySelector('#onb-back').addEventListener('click', () => renderIntro(user));
    host.querySelector('#onb-submit').addEventListener('click', async (e) => {
      showErr('');
      if (!sel.nombre) return showErr('Ponle un nombre a tu personaje.');
      if (!sel.personalidad) return showErr('Elige un carácter.');
      if (!sel.aptitud) return showErr('Elige una vocación.');
      const btn = e.target; btn.disabled = true; btn.textContent = 'Fundando…';
      try {
        const pj = await HacPersonajes.add({
          nombre: sel.nombre, personalidad: sel.personalidad, aptitud: sel.aptitud,
          aspecto: { piel: sel.piel, pelo: sel.pelo }, owner: user.id
        });
        renderPlayer(user, pj);
      } catch (err) {
        btn.disabled = false; btn.textContent = 'Fundar personaje';
        const m = (err && err.message) || '';
        if (/duplicate|unique|owner/i.test(m)) showErr('Ya tienes un personaje en esta cuenta.');
        else showErr('No se pudo crear: ' + (m || 'error'));
      }
    });
  }

  const prevState = (pj) => () => ({ aptitud: pj.aptitud, aspecto: pj.aspecto || {} });
  const aptDe = (pj) => ((window.HacPersonajeDefs && HacPersonajeDefs.APTITUDES) || []).find(x => x.id === pj.aptitud);

  // Estado del jugador CON personaje: según su solicitud (ninguna / pendiente /
  // aprobada) muestra el picker de haciendas, la espera, o su pertenencia.
  async function renderPlayer(user, pj) {
    teardown();
    host.innerHTML = `<div class="onb-card"><div class="onb-loading">Cargando tu hacienda…</div></div>`;
    try {
      if (window.HacStore && HacStore.ready) await withTimeout(HacStore.ready(), 5000, null);
      const sol = window.HacSolicitudes ? await withTimeout(HacSolicitudes.mine(), 5000, null) : null;
      if (sol && sol.estado === 'aprobada') return renderMember(user, pj, sol);
      if (sol && sol.estado === 'pendiente') return renderPending(user, pj, sol);
      renderPicker(user, pj);
    } catch (e) {
      console.error('[onboard] renderPlayer falló:', e);
      try { renderPicker(user, pj); } catch (e2) { host.innerHTML = `<div class="onb-card"><div class="onb-loading">No se pudo cargar tu hacienda. Recarga la página.</div></div>`; }
    }
  }

  function renderPicker(user, pj) {
    teardown();
    const a = aptDe(pj);
    const casas = (window.HacStore ? HacStore.all() : []).slice()
      .sort((x, y) => HacCalc.haciendaPuntos(y) - HacCalc.haciendaPuntos(x));
    const cards = casas.length ? casas.map(h => {
      const tier = HacCalc.nivelEfectivo(h), tInfo = HacCalc.tierPorNivel(tier);
      const n = (h.miembros || []).length;
      return `<div class="onb-h">
        <div class="onb-h-top"><span class="onb-h-zh">${esc(h.zh || tInfo.zh)}</span>
          <span><span class="onb-h-nm">${esc(h.nombre)}</span><br>
          <span class="onb-h-meta">${esc(tInfo.nombre)} · ${n} mecenas</span></span></div>
        <p class="onb-h-lema">${h.lema ? '«' + esc(h.lema) + '»' : esc((h.descripcion || '').slice(0, 90))}</p>
        <button class="onb-cta gold" data-join="${esc(h.id)}">Solicitar entrada</button>
      </div>`;
    }).join('') : `<p class="onb-sub">Todavía no se ha fundado ninguna hacienda. Vuelve pronto.</p>`;

    host.innerHTML = `
      <div class="onb-card"><div class="onb-form">
        <div class="onb-pickhd">
          <div class="onb-prev" style="padding:8px 6px;min-width:84px"><canvas id="onb-prev-cv" style="width:64px"></canvas></div>
          <div>
            <h2 class="onb-ttl" style="margin:0 0 4px">Elige tu hacienda, ${esc((pj.nombre || '').split(' ')[0] || '')}</h2>
            <p class="onb-sub" style="margin:0">Solicita entrada en una casa${a ? ` como <b>${esc(a.nombre)}</b>` : ''}. Cuando su señor te acepte, tu mecenas saldrá a pasear por su finca.</p>
            <p class="onb-err" id="onb-err" hidden style="margin-top:8px"></p>
          </div>
        </div>
        <div class="onb-list">${cards}</div>
      </div></div>`;
    startPreview(document.getElementById('onb-prev-cv'), prevState(pj));

    const errEl = host.querySelector('#onb-err');
    host.querySelectorAll('[data-join]').forEach(btn => btn.addEventListener('click', async () => {
      if (errEl) errEl.hidden = true;
      host.querySelectorAll('[data-join]').forEach(b => b.disabled = true);
      btn.textContent = 'Enviando…';
      try {
        await HacSolicitudes.crear({ personajeId: pj.id, haciendaId: btn.dataset.join });
        renderPlayer(user, pj);
      } catch (err) {
        host.querySelectorAll('[data-join]').forEach(b => b.disabled = false);
        btn.textContent = 'Solicitar entrada';
        const m = (err && err.message) || '';
        if (errEl) { errEl.textContent = /duplicate|unique/i.test(m) ? 'Ya tienes una solicitud activa.' : 'No se pudo enviar: ' + (m || 'error'); errEl.hidden = false; }
      }
    }));
  }

  function renderPending(user, pj, sol) {
    teardown();
    const h = window.HacStore ? HacStore.get(sol.haciendaId) : null;
    const nombre = h ? h.nombre : 'la hacienda';
    host.innerHTML = `
      <div class="onb-card"><div class="onb-form"><div class="onb-status">
        <div class="onb-prev" style="padding:10px"><canvas id="onb-prev-cv" style="width:78px"></canvas></div>
        <div>
          <span class="onb-badge wait">Solicitud pendiente</span>
          <h2 class="onb-ttl" style="margin:8px 0 4px">${esc(nombre)} está estudiando tu ingreso</h2>
          <p class="onb-sub" style="margin:0">Cuando el señor de la casa te acepte, tu mecenas <b>${esc(pj.nombre)}</b> aparecerá paseando por su finca.</p>
          <button class="onb-cta" id="onb-cancel" style="margin-top:14px;background:#7a6a4a;box-shadow:0 4px 0 #4a3d28">Cancelar solicitud</button>
        </div>
      </div></div></div>`;
    startPreview(document.getElementById('onb-prev-cv'), prevState(pj));
    host.querySelector('#onb-cancel').addEventListener('click', async (e) => {
      e.target.disabled = true; e.target.textContent = 'Cancelando…';
      try { await HacSolicitudes.cancelar(sol.id); renderPlayer(user, pj); }
      catch (err) { e.target.disabled = false; e.target.textContent = 'Cancelar solicitud'; alert((err && err.message) || 'No se pudo cancelar'); }
    });
  }

  function renderMember(user, pj, sol) {
    teardown();
    const h = window.HacStore ? HacStore.get(sol.haciendaId) : null;
    const nombre = h ? h.nombre : 'tu hacienda';
    const a = aptDe(pj);
    host.innerHTML = `
      <div class="onb-card"><div class="onb-hero">
        <div class="onb-scene"><canvas id="onb-prev-cv" style="width:118px"></canvas><span class="onb-scene-tag">${esc(pj.nombre)}</span></div>
        <div class="onb-copy">
          <span class="onb-badge ok">Miembro de la casa</span>
          <h2 class="onb-ttl" style="margin:8px 0 6px">Perteneces a ${esc(nombre)}</h2>
          <p class="onb-lead">Tu mecenas <b>${esc(pj.nombre)}</b>${a ? `, ${esc(a.nombre)},` : ''} ya pasea por la finca de la casa.</p>
          ${h ? `<a class="onb-cta gold" href="hacienda.html?id=${encodeURIComponent(h.id)}">Ver mi hacienda</a>` : ''}
        </div>
      </div></div>`;
    startPreview(document.getElementById('onb-prev-cv'), prevState(pj));
  }

  // ── Arranque + reacción a sesión ──────────────────────────────────────────
  // Espera con tope de tiempo: si una llamada a Supabase tarda o falla, seguimos
  // y renderizamos igualmente (nunca nos quedamos clavados en "Cargando…").
  function withTimeout(p, ms, fb) {
    return Promise.race([
      Promise.resolve(p).catch(() => fb),
      new Promise(r => setTimeout(() => r(fb), ms))
    ]);
  }

  async function refresh() {
    if (!host) return;
    host.innerHTML = `<div class="onb-card"><div class="onb-loading">Cargando…</div></div>`;
    try {
      await withTimeout(window.Auth && Auth.ready ? Auth.ready() : null, 5000, null);
      const user = (window.Auth && Auth.current) ? Auth.current() : null;
      if (!user) { renderAnon(); return; }
      // Recarga FRESCA de personajes (no la caché memoizada): así detectamos el
      // personaje recién creado/aprobado. Si la carga no acaba a tiempo, NO
      // asumimos "sin personaje": mostramos la intro provisional y, cuando termine,
      // saltamos a su panel si aparece (sin molestar si ya empezó a crear).
      let loaded = false;
      if (window.HacPersonajes && HacPersonajes.reload) {
        loaded = await withTimeout(HacPersonajes.reload().then(() => true), 8000, false);
      }
      const mine = window.HacPersonajes ? HacPersonajes.mine(user.id) : null;
      try {
        console.log('[onboard] uid=', user.id, '· personajes=', window.HacPersonajes ? HacPersonajes.all().length : 'n/a',
          '· dbOk=', !!(window.HacPersonajes && HacPersonajes.dbOk && HacPersonajes.dbOk()),
          '· míoId=', mine ? mine.id : null, '· cargaOK=', loaded);
      } catch (_) { }
      if (mine) { renderPlayer(user, mine); return; }
      if (!loaded && window.HacPersonajes && HacPersonajes.ready) {
        HacPersonajes.ready().then(() => {
          if (!host.querySelector('[data-create]')) return;   // ya navegó (form/picker) → no le molestamos
          const again = HacPersonajes.mine(user.id);
          if (again) renderPlayer(user, again);
        });
      }
      renderIntro(user);
    } catch (e) {
      console.error('[onboard] refresh falló:', e);
      // Último recurso: que SIEMPRE se vea algo, nunca un "cargando" eterno.
      const u = (window.Auth && Auth.current) ? Auth.current() : null;
      try { u ? renderIntro(u) : renderAnon(); }
      catch (e2) { host.innerHTML = `<div class="onb-card"><div class="onb-loading">No se pudo cargar. Recarga la página.</div></div>`; }
    }
  }

  function mount() {
    host = document.getElementById('hac-onboard');
    if (!host || booted) return;
    booted = true;
    injectStyles();
    refresh();
    if (window.Auth && Auth.onChange) {
      let last = (Auth.current() && Auth.current().id) || null;
      Auth.onChange((u) => { const id = (u && u.id) || null; if (id !== last) { last = id; refresh(); } });
    }
  }

  return { mount, refresh };
})();

if (typeof window !== 'undefined') {
  window.HacOnboard = HacOnboard;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', HacOnboard.mount);
  else HacOnboard.mount();
}
