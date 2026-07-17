/* ═══════════════════════════════════════════════════════════════════════
   hac-enviados-vista.js — VENTANA de conversación con el ENVIADO.
   ─────────────────────────────────────────────────────────────────────────
   Sustituye al antiguo botón «Hablar» del panel lateral por una ventana
   emergente: un BUSTO animado del enviado (mueve boca/brazo al hablar, gesto
   'habla' de HacChar) dentro de un medallón, su pendón de facción, y sus
   frases una a una con «Seguir ▸ / Terminar». Modelada sobre el retrato
   parlante del minijuego de debate (pintarRetrato/paintPortraits).

   API:
     HacEnviadoVista.abrir({
       aptitud, aspecto,     // para dibujar el busto con HacChar
       faccion,              // { color, zh, nombre } | null (pendón)
       nombre, cortesia,     // nombre real + 字 (se muestra ya: estás hablando con él)
       lineas,               // [string] guion (HacEnviadoDialogo.lineas)
       onReveal,             // fn() al abrir: marcar conocido + revelar en el mundo
       acciones              // [{ label, tone:'go'|'plain', onClick, closeAfter }]
     })
     HacEnviadoVista.cerrar()
   ═══════════════════════════════════════════════════════════════════════ */
const HacEnviadoVista = (function () {
  'use strict';

  let ov = null, ctxState = null, animTimer = null;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function injectStyles() {
    if (document.getElementById('hac-envoy-vista-css')) return;
    const s = document.createElement('style'); s.id = 'hac-envoy-vista-css';
    s.textContent = `
      .hacp-env-ov{position:fixed;inset:0;z-index:9650;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(12,10,8,.72);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);animation:hacpEnvIn .2s ease}
      .hacp-env-ov[hidden]{display:none}
      @keyframes hacpEnvIn{from{opacity:0}to{opacity:1}}
      .hacp-env-box{position:relative;width:min(440px,94vw);background:linear-gradient(180deg,#241d15,#1b1610);border:1px solid rgba(201,168,76,.5);border-radius:14px;padding:16px 18px 15px;box-shadow:0 18px 50px rgba(0,0,0,.6),inset 0 0 0 1px rgba(201,168,76,.12);color:#ece0c4;font-family:system-ui,sans-serif;animation:hacpEnvPop .22s cubic-bezier(.2,.9,.3,1.2)}
      @keyframes hacpEnvPop{from{transform:scale(.9) translateY(8px);opacity:0}to{transform:none;opacity:1}}
      .hacp-env-x{position:absolute;top:9px;right:9px;width:30px;height:30px;border-radius:8px;border:1px solid rgba(201,168,76,.28);background:rgba(0,0,0,.28);color:#d8c8a4;font-size:15px;cursor:pointer;line-height:1}
      .hacp-env-x:hover{border-color:#d8b45a;color:#f3e6c4}
      .hacp-env-head{display:flex;align-items:center;gap:8px;font:700 12px system-ui;letter-spacing:.03em;color:#b39a72;margin:2px 26px 12px 2px}
      .hacp-env-fdot{width:11px;height:11px;border-radius:50%;flex:0 0 auto;box-shadow:0 0 0 1px rgba(0,0,0,.4),0 0 8px rgba(0,0,0,.3)}
      .hacp-env-fzh{font:700 14px 'Noto Serif SC',serif;color:#e8d7a8}
      .hacp-env-stage{display:flex;align-items:center;gap:14px}
      .hacp-env-face{flex:0 0 auto;width:104px;height:104px;border-radius:50%;overflow:hidden;position:relative;border:3px solid #6a4a24;background:radial-gradient(circle at 50% 30%,#3a2a18,#150d07);box-shadow:inset 0 0 14px rgba(0,0,0,.6)}
      .hacp-env-face canvas{position:absolute;left:50%;top:8px;transform:translateX(-50%);height:176px;width:auto;image-rendering:pixelated}
      .hacp-env-face .seal{position:absolute;inset:0;display:grid;place-items:center;font:700 40px 'Noto Serif SC',serif;color:#8a6a3a}
      .hacp-env-who{flex:1;min-width:0}
      .hacp-env-name{font:800 19px 'Noto Serif SC',serif;color:#f3e6c4;line-height:1.15}
      .hacp-env-zi{font-size:12.5px;color:#9a8360;margin-top:2px}
      .hacp-env-bubble{position:relative;margin-top:12px;background:rgba(232,192,96,.12);border:1px solid rgba(232,192,96,.34);border-radius:11px;padding:11px 13px;font-size:14px;line-height:1.45;color:#f0e2bf;min-height:44px}
      .hacp-env-bubble::before{content:'';position:absolute;top:-7px;left:34px;width:12px;height:12px;background:inherit;border-left:1px solid rgba(232,192,96,.34);border-top:1px solid rgba(232,192,96,.34);transform:rotate(45deg)}
      .hacp-env-foot{display:flex;flex-wrap:wrap;gap:8px;margin-top:13px}
      .hacp-env-btn{flex:1 1 auto;min-width:120px;padding:11px 12px;border-radius:10px;border:1px solid #5a4322;background:#241a10;color:#ece0c4;font:700 13.5px system-ui;cursor:pointer;transition:border-color .12s,background .12s,transform .06s}
      .hacp-env-btn:hover{border-color:#d8b45a;background:#2c1f12}
      .hacp-env-btn:active{transform:translateY(1px)}
      .hacp-env-btn[disabled]{opacity:.5;cursor:default}
      .hacp-env-btn.seguir{flex-basis:100%;background:linear-gradient(180deg,#3a2c17,#241a10);border-color:#7a5a2c;color:#f3e6c4}
      .hacp-env-btn[data-acc]{flex-basis:100%}
      .hacp-env-btn.ask{flex-basis:100%;text-align:left;font-weight:600;background:rgba(0,0,0,.22);border-color:rgba(201,168,76,.28);color:#e6dcc0}
      .hacp-env-btn.ask:hover{border-color:#d8b45a;background:rgba(201,168,76,.1)}
      .hacp-env-btn.go{background:linear-gradient(180deg,#2f4a26,#1e3018);border-color:#4e7a3a;color:#e6f0dc}
      .hacp-env-btn.go:hover{border-color:#7ac05a}
      @media(max-width:640px){
        .hacp-env-box{width:100%;max-height:calc(100dvh - var(--nav-h,58px) - 16px);overflow-y:auto;padding:14px 14px calc(14px + env(safe-area-inset-bottom,0px))}
        .hacp-env-face{width:88px;height:88px}.hacp-env-face canvas{height:150px;top:6px}
        .hacp-env-name{font-size:18px}.hacp-env-bubble{font-size:13.5px}
      }`;
    document.head.appendChild(s);
  }

  // Repinta el busto: gesto 'habla' + frame cíclico mientras «habla»; en reposo, quieto.
  function paintFace() {
    const st = ctxState; if (!st || !ov) return;
    const cv = ov.querySelector('.hacp-env-face canvas'); if (!cv) return;
    const hablando = st.speakUntil > Date.now();
    if (!window.HacChar || !HacChar.draw) return;
    try {
      HacChar.draw(cv, { aptitud: st.aptitud, aspecto: st.aspecto, dir: 'SE', pose: 'stand',
        gesture: hablando ? 'habla' : null, frame: hablando ? st.frame : 0, scale: 4 });
    } catch (e) {}
  }

  // Líneas del tramo actual: el guion (intro/oferta) o la respuesta a una pregunta.
  function curLines() { const st = ctxState; return (st.phase === 'answer' && st.answer) ? st.answer : st.guion; }

  function render() {
    const st = ctxState; if (!st || !ov) return;
    const fac = st.faccion || {};
    const facTxt = fac.nombre ? `Enviado de ${esc(fac.nombre)}` : 'Un enviado';
    const dot = fac.color ? `<span class="hacp-env-fdot" style="background:${esc(fac.color)}"></span>` : '';
    const fzh = fac.zh ? `<span class="hacp-env-fzh">${esc(fac.zh)}</span>` : '';
    const zi = st.cortesia ? `<div class="hacp-env-zi">字 ${esc(st.cortesia)}</div>` : '';
    const hasChar = !!(window.HacChar && HacChar.draw && st.aspecto);
    const preguntas = st.preguntas || [], acciones = st.acciones || [];
    const hasMenu = preguntas.length > 0 || acciones.length > 0;

    let bubble = '', foot = '';
    if (st.phase === 'menu') {
      // Hub: preguntarle (repetible) y, si procede, decidir (aceptar / lo consideraré).
      bubble = st.menuPrompt;
      foot = preguntas.map((p, k) => `<button type="button" class="hacp-env-btn ask" data-preg="${k}">🗨 ${esc(p.label)}</button>`).join('');
      foot += acciones.length
        ? acciones.map((a, k) => `<button type="button" class="hacp-env-btn ${a.tone === 'go' ? 'go' : ''}" data-acc="${k}">${esc(a.label)}</button>`).join('')
        : `<button type="button" class="hacp-env-btn seguir" data-act="cerrar">Terminar</button>`;
    } else {
      const lines = curLines(), last = st.i >= lines.length - 1;
      bubble = lines[st.i] || '';
      if (st.phase === 'answer') {
        foot = last ? `<button type="button" class="hacp-env-btn seguir" data-act="volver">◂ Volver</button>`
                    : `<button type="button" class="hacp-env-btn seguir" data-act="seguir">Seguir ▸</button>`;
      } else {   // 'intro' / oferta
        if (!last) foot = `<button type="button" class="hacp-env-btn seguir" data-act="seguir">Seguir ▸</button>`;
        else if (hasMenu) foot = `<button type="button" class="hacp-env-btn seguir" data-act="menu">Continuar ▸</button>`;
        else foot = `<button type="button" class="hacp-env-btn seguir" data-act="cerrar">Terminar</button>`;
      }
    }
    ov.querySelector('.hacp-env-box').innerHTML = `
      <button type="button" class="hacp-env-x" data-act="cerrar" aria-label="Cerrar">✕</button>
      <div class="hacp-env-head">${dot}${facTxt} · ${fzh}</div>
      <div class="hacp-env-stage">
        <div class="hacp-env-face">${hasChar ? '<canvas></canvas>' : '<span class="seal">使</span>'}</div>
        <div class="hacp-env-who"><div class="hacp-env-name">${esc(st.nombre || 'Visitante')}</div>${zi}</div>
      </div>
      <div class="hacp-env-bubble">${esc(bubble)}</div>
      <div class="hacp-env-foot">${foot}</div>`;
    paintFace();
  }

  function speak() { const st = ctxState; if (st) { st.speakUntil = Date.now() + 2400; st.frame = 0; } }

  function onClick(e) {
    const st = ctxState; if (!st) return;
    const btn = e.target.closest('[data-act],[data-acc],[data-preg]'); if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'cerrar') { cerrar(); return; }
    if (act === 'seguir') { st.i++; speak(); render(); return; }       // solo aparece cuando no es la última línea
    if (act === 'menu' || act === 'volver') { st.phase = 'menu'; speak(); render(); return; }
    if (btn.dataset.preg != null) {
      const p = (st.preguntas || [])[+btn.dataset.preg]; if (!p) return;
      st.answer = (p.lineas || []).slice(); if (!st.answer.length) st.answer = ['…'];
      st.i = 0; st.phase = 'answer'; speak(); render(); return;
    }
    if (btn.dataset.acc != null) {
      const a = (st.acciones || [])[+btn.dataset.acc]; if (!a) return;
      btn.disabled = true;
      Promise.resolve(a.onClick && a.onClick()).then(() => { if (a.closeAfter !== false) cerrar(); })
        .catch(() => { btn.disabled = false; });
    }
  }

  function onKey(e) { if (e.key === 'Escape') cerrar(); }

  function abrir(opts) {
    opts = opts || {};
    injectStyles();
    cerrar();   // una sola ventana a la vez
    ctxState = {
      aptitud: opts.aptitud || '', aspecto: opts.aspecto || null,
      faccion: opts.faccion || null, nombre: opts.nombre || 'Visitante', cortesia: opts.cortesia || '',
      guion: (Array.isArray(opts.lineas) && opts.lineas.length) ? opts.lineas.slice() : ['…'],
      preguntas: Array.isArray(opts.preguntas) ? opts.preguntas.slice() : [],
      acciones: opts.acciones || [],
      menuPrompt: opts.menuPrompt || 'Preguntad lo que gustéis, buen señor.',
      phase: 'intro', answer: null, i: 0, frame: 0, speakUntil: Date.now() + 2400
    };
    ov = document.createElement('div'); ov.className = 'hacp-env-ov';
    ov.innerHTML = '<div class="hacp-env-box"></div>';
    ov.addEventListener('click', (e) => { if (e.target === ov) cerrar(); });   // tap fuera
    ov.querySelector('.hacp-env-box').addEventListener('click', onClick);
    document.body.appendChild(ov);
    document.addEventListener('keydown', onKey);
    if (typeof opts.onReveal === 'function') { try { opts.onReveal(); } catch (e) {} }
    render();
    // Anima la boca/brazo mientras «habla»; al terminar cada frase repinta la pose de
    // reposo una vez y se queda quieto hasta el siguiente «Seguir».
    animTimer = setInterval(() => {
      const st = ctxState; if (!st) return;
      const hablando = st.speakUntil > Date.now();
      if (hablando) { st.frame = (st.frame + 1) % 4; paintFace(); }
      else if (st.wasSpeaking) { paintFace(); }   // último repintado: cae a reposo
      st.wasSpeaking = hablando;
    }, 300);
  }

  function cerrar() {
    if (animTimer) { clearInterval(animTimer); animTimer = null; }
    document.removeEventListener('keydown', onKey);
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    ov = null; ctxState = null;
  }

  function abierta() { return !!ov; }

  return { abrir, cerrar, abierta };
})();

if (typeof window !== 'undefined') window.HacEnviadoVista = HacEnviadoVista;
