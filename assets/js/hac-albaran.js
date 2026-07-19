/* ═══════════════════════════════════════════════════════════════════════
   hac-albaran.js — Recepción INTERACTIVA del cargamento de tributo (F3 政).
   ─────────────────────────────────────────────────────────────────────────
   Cuando la investigación «Rutas de tributo» (貢賦) está desbloqueada, una
   caravana llega cada cierto tiempo y espera en el portón. Al recibirla, en vez
   de un mero toast, se ABRE ESTA ESCENA: sales al portón de la finca, ves el
   carruaje del transportista, hablas con él y desenrollas un ROLLO DE BAMBÚ
   (竹簡) que hace de manifiesto con los materiales entregados. Al firmarlo,
   descargas el cargamento (onConfirm → la RPC real).

   Autónomo: solo depende de HacChar (opcional, para dibujar al transportista;
   si falta, cae a una silueta simple). Toda la escena vive en <canvas> + DOM.

     HacAlbaran.recepcion({
       casa:          { nombre, color, zh },
       cargo:         { dinero, grano, hierro, tinta, ... },   // cualquier subconjunto
       puedeRecibir:  bool,          // ¿el que mira pertenece al pabellón 政?
       transportista: 'nombre',      // opcional
       ruta:          '貢賦南路',     // opcional (leyenda del manifiesto)
       onConfirm:     async () => {} // hace la entrega real; puede lanzar
     })
   ═══════════════════════════════════════════════════════════════════════ */
const HacAlbaran = (function () {
  'use strict';

  // ── Catálogo de mercancías: icono + 漢字 + nombre legible ────────────────
  const BIEN = {
    dinero: { emoji: '🪙', zh: '錢', label: 'Monedas',  unidad: '' },
    grano:  { emoji: '🌾', zh: '穀', label: 'Grano',    unidad: ' fanegas' },
    hierro: { emoji: '⚒️', zh: '鐵', label: 'Hierro',   unidad: ' lingotes' },
    tinta:  { emoji: '🖌️', zh: '墨', label: 'Tinta',    unidad: ' barras' },
    madera: { emoji: '🪵', zh: '木', label: 'Madera',   unidad: ' haces' },
    seda:   { emoji: '🧵', zh: '絹', label: 'Seda',     unidad: ' rollos' },
    sal:    { emoji: '🧂', zh: '鹽', label: 'Sal',      unidad: ' medidas' },
    arroz:  { emoji: '🍚', zh: '米', label: 'Arroz',    unidad: ' sacos' },
  };
  const bienDe = (k) => BIEN[k] || { emoji: '📦', zh: '貨', label: k, unidad: '' };

  const reduce = () => { try { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const okHex = (c) => /^#?[0-9a-fA-F]{3,6}$/.test(String(c || ''));

  // ── Dibujo del carruaje (buey + carro cargado), estilo pixel de la finca ──
  // Lienzo lógico 120×74, pies del buey/carro en y = FEET. Se escala ×DRAW.
  const CW = 120, CH = 74, FEET = 60, DRAW = 3;
  let cartCv = null;
  function cartBaked(accent) {
    if (cartCv) return cartCv;
    const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    const wood = '#6b4a2a', woodHi = '#8a6636', woodDk = '#40290f', iron = '#33373d';
    const ox = '#7c6b57', oxHi = '#93816a', oxDk = '#4f4335', horn = '#e6dcc2';
    const crate = '#a9812f', crateHi = '#caa043', crateDk = '#7a5a1f';
    const cloth = okHex(accent) ? accent : '#b23b2e', clothHi = '#ffffff';
    const jar = '#3f6b5c', jarHi = '#5c8c7a', sack = '#cbb892', sackHi = '#e0d3ad';
    const gy = FEET;

    // ── Buey de tiro (a la izquierda, tirando hacia +x) ──
    const oxX = 20;
    R(oxX - 12, gy - 20, 26, 13, ox);                       // cuerpo
    R(oxX - 12, gy - 20, 26, 2, oxHi);                      // lomo iluminado
    R(oxX - 12, gy - 9, 26, 2, oxDk);                       // vientre en sombra
    R(oxX - 12, gy - 7, 4, 7, oxDk); R(oxX - 5, gy - 7, 4, 7, ox);   // patas traseras
    R(oxX + 6, gy - 7, 4, 7, oxDk); R(oxX + 11, gy - 7, 4, 7, ox);   // patas delanteras
    R(oxX + 13, gy - 24, 9, 10, ox); R(oxX + 13, gy - 24, 9, 2, oxHi);   // cabeza
    R(oxX + 20, gy - 20, 3, 4, oxDk);                       // morro
    R(oxX + 13, gy - 27, 2, 4, horn); R(oxX + 20, gy - 27, 2, 4, horn); // cuernos
    R(oxX + 12, gy - 22, 1, 2, '#241a10');                  // ojo
    R(oxX + 12, gy - 18, 12, 2, woodDk);                    // yugo/tiro hacia el carro

    // ── Plataforma del carro (a la derecha) ──
    const px0 = oxX + 24;
    function wheel(cx) {
      g.fillStyle = woodDk; g.beginPath(); g.arc(cx, gy, 8, 0, 6.2832); g.fill();
      g.fillStyle = wood; g.beginPath(); g.arc(cx, gy, 6, 0, 6.2832); g.fill();
      g.strokeStyle = woodDk; g.lineWidth = 1;
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 6; g.beginPath(); g.moveTo(cx, gy); g.lineTo(cx + Math.cos(a) * 6, gy + Math.sin(a) * 6); g.stroke(); }
      g.fillStyle = iron; g.beginPath(); g.arc(cx, gy, 2, 0, 6.2832); g.fill();
    }
    R(px0, gy - 8, 66, 5, wood); R(px0, gy - 8, 66, 1, woodHi); R(px0, gy - 4, 66, 1, woodDk);   // tabla
    R(px0 - 6, gy - 6, 8, 2, woodDk);                        // lanza que engancha al yugo
    wheel(px0 + 14); wheel(px0 + 50);

    // ── Carga: cajas, tinajas, sacos, tela con el color de la casa ──
    R(px0 + 6, gy - 26, 16, 18, crate); R(px0 + 6, gy - 26, 16, 2, crateHi); R(px0 + 20, gy - 26, 2, 18, crateDk);
    R(px0 + 6, gy - 20, 16, 1, crateDk); R(px0 + 6, gy - 14, 16, 1, crateDk);   // vetas de la caja
    R(px0 + 24, gy - 21, 14, 13, crate); R(px0 + 24, gy - 21, 14, 2, crateHi); R(px0 + 36, gy - 21, 2, 13, crateDk);
    g.fillStyle = jar; g.beginPath(); g.ellipse(px0 + 48, gy - 15, 6, 8, 0, 0, 6.2832); g.fill();   // tinaja
    R(px0 + 45, gy - 22, 6, 3, jar); R(px0 + 45, gy - 22, 6, 1, jarHi);
    g.fillStyle = sack; g.beginPath(); g.ellipse(px0 + 58, gy - 12, 6, 5, 0, 0, 6.2832); g.fill();   // saco
    g.fillStyle = sackHi; g.beginPath(); g.ellipse(px0 + 56, gy - 14, 2, 1.5, 0, 0, 6.2832); g.fill();
    R(px0 + 4, gy - 12, 22, 5, cloth); R(px0 + 4, gy - 12, 22, 1, clothHi);   // tela de la casa sobre la carga

    // ── Asta con banderín 貢 ──
    R(px0 + 60, gy - 44, 2, 36, woodDk);
    R(px0 + 62, gy - 44, 13, 9, cloth); R(px0 + 62, gy - 44, 13, 2, clothHi);
    g.fillStyle = '#fff9e8'; g.font = '8px "Noto Serif SC",serif'; g.textBaseline = 'top';
    try { g.fillText('貢', px0 + 64, gy - 43); } catch (e) {}

    cartCv = cv; return cv;
  }

  // ── Transportista: HacChar horneado si está; si no, una silueta simple ────
  let driverCv = null;
  function driverBaked() {
    if (driverCv) return driverCv;
    const c = document.createElement('canvas');
    if (window.HacChar && HacChar.draw) {
      try { HacChar.draw(c, { aptitud: 'administrador', aspecto: { robe: '#8a6a3a', accent: '#e6c15a', piel: 1, pelo: 2 }, dir: 'SE', frame: 0, scale: 3 }); }
      catch (e) { c.width = 0; }
    }
    if (!c.width) {
      c.width = 40 * 3; c.height = 56 * 3; const g = c.getContext('2d');
      g.fillStyle = '#8a6a3a'; g.fillRect(40, 60, 40, 90); g.fillStyle = '#d8b98a'; g.beginPath(); g.arc(60, 46, 16, 0, 6.2832); g.fill();
    }
    driverCv = c; return c;
  }

  // ═══ Escena ══════════════════════════════════════════════════════════════
  function recepcion(opts) {
    opts = opts || {};
    const casa = opts.casa || {}, cargo = opts.cargo || {};
    const accent = okHex(casa.color) ? casa.color : '#c9a84c';
    const puede = opts.puedeRecibir !== false;
    const drover = opts.transportista || 'El transportista';
    const ruta = opts.ruta || '貢賦南路';
    const items = Object.keys(cargo).filter(k => Number(cargo[k]) > 0);
    let closed = false, raf = null, beat = 1;

    cartCv = driverCv = null;   // rehornear con el acento de la casa

    // ── Overlay + estructura ──
    const ov = document.createElement('div');
    ov.className = 'hacp-alb-ov'; ov.style.setProperty('--acc', accent);
    ov.innerHTML = `
      <div class="hacp-alb-box" role="dialog" aria-label="Recepción del cargamento de tributo">
        <button type="button" class="hacp-alb-x" aria-label="Cerrar">✕</button>
        <div class="hacp-alb-head">
          <span class="hacp-alb-zh">莊門</span>
          <div>
            <div class="hacp-alb-t">La puerta de la finca</div>
            <div class="hacp-alb-s">Sales al portón · un carruaje de tributo aguarda</div>
          </div>
        </div>

        <div class="hacp-alb-stage">
          <canvas class="hacp-alb-cv" width="900" height="440"></canvas>
          <div class="hacp-alb-bubble" hidden></div>
        </div>
        <div class="hacp-alb-scrollwrap" hidden>
          <div class="hacp-alb-scroll">
            <div class="hacp-alb-roller top"></div>
            <div class="hacp-alb-sheet">
              <div class="hacp-alb-manifest"></div>
            </div>
            <div class="hacp-alb-roller bot"></div>
          </div>
        </div>

        <div class="hacp-alb-foot"></div>
      </div>`;
    (document.body).appendChild(ov);

    const box     = ov.querySelector('.hacp-alb-box');
    const stage   = ov.querySelector('.hacp-alb-stage');
    const cv      = ov.querySelector('.hacp-alb-cv');
    const bubble  = ov.querySelector('.hacp-alb-bubble');
    const swrap   = ov.querySelector('.hacp-alb-scrollwrap');
    const sheet   = ov.querySelector('.hacp-alb-manifest');
    const foot    = ov.querySelector('.hacp-alb-foot');
    const ctx     = cv.getContext('2d');

    function close() {
      if (closed) return; closed = true;
      if (raf) cancelAnimationFrame(raf);
      ov.classList.remove('on');
      setTimeout(() => ov.remove(), 260);
    }
    ov.querySelector('.hacp-alb-x').addEventListener('click', close);
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    document.addEventListener('keydown', function onKey(e) { if (closed) { document.removeEventListener('keydown', onKey); return; } if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } });

    // ── Animación de la escena (carruaje + transportista + faroles) ──
    const still = reduce();
    const cartX = cv.width * 0.40, cartY = cv.height * 0.74;
    const drvX  = cv.width * 0.62, drvY = cv.height * 0.80;
    function paint(t) {
      const W = cv.width, H = cv.height;
      // Cielo del atardecer.
      const sky = ctx.createLinearGradient(0, 0, 0, H * 0.82);
      sky.addColorStop(0, '#241a2e'); sky.addColorStop(0.55, '#5a3b46'); sky.addColorStop(1, '#a86a4e');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      // Luna.
      ctx.fillStyle = 'rgba(255,244,214,.85)'; ctx.beginPath(); ctx.arc(W * 0.82, H * 0.2, 22, 0, 6.2832); ctx.fill();
      // Suelo del camino.
      const ground = ctx.createLinearGradient(0, H * 0.78, 0, H);
      ground.addColorStop(0, '#6b5334'); ground.addColorStop(1, '#3a2c1a');
      ctx.fillStyle = ground; ctx.fillRect(0, H * 0.80, W, H * 0.20);
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, H * 0.80, W, 3);

      // Muralla + portón de la finca (a la derecha).
      const wallX = W * 0.80;
      ctx.fillStyle = '#3d2f22'; ctx.fillRect(wallX, H * 0.30, W - wallX, H * 0.50);
      ctx.fillStyle = '#4a3a2a'; ctx.fillRect(wallX, H * 0.30, W - wallX, 6);
      ctx.fillStyle = '#231a12'; ctx.fillRect(wallX + 6, H * 0.44, 46, H * 0.36);   // vano del portón
      ctx.fillStyle = accent; ctx.globalAlpha = 0.5; ctx.fillRect(wallX, H * 0.30, W - wallX, 3); ctx.globalAlpha = 1;
      // Tejadillo del portón.
      ctx.fillStyle = '#241108'; ctx.beginPath(); ctx.moveTo(wallX - 10, H * 0.32); ctx.lineTo(W, H * 0.24); ctx.lineTo(W, H * 0.34); ctx.lineTo(wallX - 6, H * 0.40); ctx.closePath(); ctx.fill();

      // Faroles con parpadeo suave.
      const flick = still ? 1 : 0.82 + 0.18 * Math.sin(t / 260);
      [[wallX + 2, H * 0.42], [W * 0.30, H * 0.34]].forEach(([lx, ly]) => {
        ctx.save(); ctx.globalAlpha = flick;
        const gl = ctx.createRadialGradient(lx, ly, 2, lx, ly, 40);
        gl.addColorStop(0, 'rgba(255,190,90,.9)'); gl.addColorStop(1, 'rgba(255,150,60,0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(lx, ly, 40, 0, 6.2832); ctx.fill();
        ctx.fillStyle = '#c0392b'; ctx.fillRect(lx - 5, ly - 7, 10, 14);
        ctx.fillStyle = '#ffd27a'; ctx.fillRect(lx - 3, ly - 5, 6, 10);
        ctx.restore();
      });
      if (W * 0.30) { /* poste del farol izquierdo */ ctx.fillStyle = '#2a2016'; ctx.fillRect(W * 0.30 - 1.5, H * 0.34, 3, H * 0.46); }

      // Carruaje (con leve bob).
      const bob = still ? 0 : Math.sin(t / 520) * 2.5;
      const cart = cartBaked(accent);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(cartX + 24, cartY + 2, 130, 12, 0, 0, 6.2832); ctx.fill();
      ctx.drawImage(cart, cartX - 20 * DRAW, cartY - FEET * DRAW + bob, CW * DRAW, CH * DRAW);

      // Transportista.
      const drv = driverBaked();
      if (drv && drv.width) {
        ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(drvX, drvY + 2, 34, 8, 0, 0, 6.2832); ctx.fill();
        ctx.drawImage(drv, drvX - drv.width / 2, drvY - drv.height + 6);
      }

      // Polvo/estrellas sutiles.
      if (!still) { ctx.fillStyle = 'rgba(255,240,200,.5)'; for (let i = 0; i < 5; i++) { const sx = (i * 173 + t * 0.02) % W; ctx.fillRect(sx, 30 + (i * 47 % 60), 2, 2); } }
    }
    function loop(t) { if (closed) return; paint(t || 0); if (!still) raf = requestAnimationFrame(loop); }

    // ── Beat 1: hablar con el transportista ──
    function setBeat1() {
      beat = 1;
      box.querySelector('.hacp-alb-t').textContent = 'La puerta de la finca';
      box.querySelector('.hacp-alb-s').textContent = 'Sales al portón · un carruaje de tributo aguarda';
      stage.hidden = false;
      swrap.hidden = true; swrap.classList.remove('open');
      bubble.hidden = false;
      bubble.innerHTML = `<b>${esc(drover)}</b> baja del pescante y te saluda con una reverencia.<br>
        «Traigo el cargamento de <b>tributo</b> para la Casa <b>${esc(casa.nombre || '')}</b>. Aquí tenéis el manifiesto, mi señor.»`;
      foot.innerHTML = `
        <button type="button" class="hacp-alb-btn ghost" data-alb="later">Ahora no</button>
        <button type="button" class="hacp-alb-btn primary" data-alb="scroll">Ver el manifiesto&nbsp;<b>竹簡</b> →</button>`;
      foot.querySelector('[data-alb="later"]').addEventListener('click', close);
      foot.querySelector('[data-alb="scroll"]').addEventListener('click', setBeat2);
    }

    // ── Beat 2: desenrollar el rollo de bambú (manifiesto) ──
    function setBeat2() {
      beat = 2;
      box.querySelector('.hacp-alb-t').textContent = 'Manifiesto de cargamento';
      box.querySelector('.hacp-alb-s').textContent = '竹簡 · rollo de bambú sellado por el intendente de la ruta';
      bubble.hidden = true; stage.hidden = true;
      const hoy = new Date();
      const total = items.reduce((a, k) => a + Number(cargo[k] || 0), 0);
      const filas = items.map((k, i) => {
        const b = bienDe(k), n = Number(cargo[k]) || 0;
        return `<div class="hacp-alb-row" style="--d:${i}">
            <span class="hacp-alb-em">${b.emoji}</span>
            <span class="hacp-alb-zhb">${b.zh}</span>
            <span class="hacp-alb-nm">${esc(b.label)}</span>
            <span class="hacp-alb-qty">${n}${esc(b.unidad)}</span>
          </div>`;
      }).join('') || '<div class="hacp-alb-empty">— sin partidas —</div>';
      sheet.innerHTML = `
        <div class="hacp-alb-mh">
          <div class="hacp-alb-mh-zh">貨　單</div>
          <div class="hacp-alb-mh-sub">Manifiesto de entrega · ${esc(ruta)}</div>
          <div class="hacp-alb-mh-casa">Destinataria: <b>Casa ${esc(casa.nombre || '')}</b>${casa.zh ? ` <span class="hacp-alb-mh-seal-zh">${esc(casa.zh)}</span>` : ''}</div>
        </div>
        <div class="hacp-alb-rows">${filas}</div>
        <div class="hacp-alb-mf">
          <span>Partidas: <b>${items.length}</b> · Unidades: <b>${total}</b></span>
          <span class="hacp-alb-date">${hoy.getFullYear()}·${(hoy.getMonth() + 1)}·${hoy.getDate()}</span>
        </div>
        <div class="hacp-alb-seal">印</div>`;
      swrap.hidden = false;
      requestAnimationFrame(() => swrap.classList.add('open'));   // dispara el desenrollado

      foot.innerHTML = puede
        ? `<button type="button" class="hacp-alb-btn ghost" data-alb="back">‹ Volver</button>
           <button type="button" class="hacp-alb-btn primary" data-alb="ok">Descargar el cargamento&nbsp;<b>卸貨</b></button>`
        : `<button type="button" class="hacp-alb-btn ghost" data-alb="back">‹ Volver</button>
           <div class="hacp-alb-note">Lo firma un mecenas del pabellón <b>政 administrativo</b>. Únete a él para descargar el tributo.</div>`;
      const bk = foot.querySelector('[data-alb="back"]'); if (bk) bk.addEventListener('click', setBeat1);
      const ok = foot.querySelector('[data-alb="ok"]'); if (ok) ok.addEventListener('click', () => confirmar(ok));
    }

    // ── Beat 3: firmar y descargar ──
    async function confirmar(btn) {
      if (!opts.onConfirm) { close(); return; }
      btn.disabled = true; const old = btn.innerHTML; btn.innerHTML = 'Descargando…';
      try { await opts.onConfirm(); }
      catch (e) { btn.disabled = false; btn.innerHTML = old; flashNote(String((e && e.message) || e || 'No se pudo recibir')); return; }
      // Éxito: el sello brilla y se cierra.
      const seal = sheet.querySelector('.hacp-alb-seal'); if (seal) seal.classList.add('stamped');
      box.querySelector('.hacp-alb-t').textContent = '¡Cargamento recibido!';
      box.querySelector('.hacp-alb-s').textContent = 'El transportista descarga y parte hacia la próxima casa';
      foot.innerHTML = `<div class="hacp-alb-done">貢 Tributo firmado y descargado a los almacenes de la casa.</div>`;
      setTimeout(close, 1600);
    }
    function flashNote(msg) {
      let n = foot.querySelector('.hacp-alb-err');
      if (!n) { n = document.createElement('div'); n.className = 'hacp-alb-err'; foot.appendChild(n); }
      n.textContent = '⚠ ' + msg;
    }

    // Arranque.
    requestAnimationFrame(() => ov.classList.add('on'));
    loop(0);
    setBeat1();
    return { close };
  }

  return { recepcion, BIEN };
})();
if (typeof window !== 'undefined') window.HacAlbaran = HacAlbaran;
