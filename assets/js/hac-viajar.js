/* ═══════════════════════════════════════════════════════════════════════
   hac-viajar.js — MAPA de viaje (pergamino) + TRANSICIÓN de camino a otra hacienda.
   ─────────────────────────────────────────────────────────────────────────
   Dos piezas, autónomas (solo dependen de HacChar para dibujar al viajero):
     · HacViajar.abrir(opts)  → overlay con un mapa de los Tres Reinos en pergamino
       y marcadores de las haciendas visitables. Al elegir una → transición → onLlegar.
     · La transición: escena lateral en <canvas> — tu mecenas CAMINA (o CABALGA si
       tiene montura) hacia el portón; al terminar, se llama onLlegar(destinoId).

   HacViajar.abrir({
     origen:   { nombre },                       // tu hacienda (para el «vuelvo a…»)
     jinete:   { aptitud, aspecto, montura },    // montura: { coat } | null (a pie)
     destinos: [{ id, nombre, zh, region, faccion:{ nombre, zh, color } }],
     onLlegar: (destinoId) => {}                 // al terminar la transición
   })
   HacViajar.transicion({ jinete, destinoNombre, onLlegar })   // solo la escena
   ═══════════════════════════════════════════════════════════════════════ */
const HacViajar = (function () {
  'use strict';
  const reduce = () => { try { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const okHex = (c) => /^#?[0-9a-fA-F]{3,6}$/.test(String(c || ''));

  // Zonas del mapa por región (en % del lienzo del mapa). El centro = 中原.
  const REGIONES = {
    wei: { x: 62, y: 24, zh: '魏', nombre: 'Wei · el Norte' },
    shu: { x: 20, y: 56, zh: '蜀', nombre: 'Shu · el Oeste' },
    wu:  { x: 60, y: 76, zh: '吳', nombre: 'Wu · el Sur' },
    han: { x: 46, y: 46, zh: '漢', nombre: 'Llanuras Centrales' }
  };
  const regionDe = (r) => REGIONES[String(r || 'han').toLowerCase()] || REGIONES.han;

  // ── Caballo lateral horneado (vista de perfil, mirando a la derecha) ──────────
  let horseCache = {};
  function horseBaked(coat) {
    const key = coat || '#8a5630';
    if (horseCache[key]) return horseCache[key];
    const W = 60, H = 44, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    const body = okHex(coat) ? (coat[0] === '#' ? coat : '#' + coat) : '#8a5630';
    const dk = '#2d1c10', mane = '#2a1a0e', hoof = '#1c130a';
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    R(10, 16, 34, 14, body);                         // tronco
    R(10, 16, 34, 3, 'rgba(255,255,255,.18)');       // lomo iluminado
    R(40, 10, 12, 10, body);                         // cuello
    R(46, 4, 9, 9, body);                            // cabeza
    R(53, 8, 4, 4, body);                            // morro
    R(41, 6, 4, 8, mane);                            // crin
    R(10, 28, 4, 12, body); R(10, 40, 4, 2, hoof);   // patas
    R(18, 28, 4, 12, body); R(18, 40, 4, 2, hoof);
    R(34, 28, 4, 12, body); R(34, 40, 4, 2, hoof);
    R(40, 28, 4, 12, body); R(40, 40, 4, 2, hoof);
    R(6, 20, 5, 10, mane);                            // cola
    horseCache[key] = cv; return cv;
  }

  // Dibuja al viajero (a pie o montado) mirando a la derecha, en el frame dado.
  function drawViajero(ctx, x, y, jinete, frame, scale) {
    const c = document.createElement('canvas');
    const montado = jinete && jinete.montura;
    if (window.HacChar && HacChar.draw) {
      try { HacChar.draw(c, { aptitud: jinete.aptitud || 'guerrero', aspecto: jinete.aspecto || {}, dir: 'E', frame: montado ? 0 : (frame % (HacChar.FRAMES || 4)), scale: scale, pose: montado ? 'sit' : 'stand' }); }
      catch (e) { c.width = 0; }
    }
    if (montado) {
      const hb = horseBaked(jinete.montura.coat), hs = scale * 0.9;
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = 'rgba(0,0,0,.26)'; ctx.beginPath(); ctx.ellipse(x, y + 2, 40 * hs / 3, 7, 0, 0, 6.2832); ctx.fill();
      ctx.drawImage(hb, x - (60 * hs) / 2, y - 44 * hs + 6, 60 * hs, 44 * hs);
      if (c.width) ctx.drawImage(c, x - c.width / 2, y - 44 * hs - c.height + 30 * hs);
    } else {
      ctx.fillStyle = 'rgba(0,0,0,.26)'; ctx.beginPath(); ctx.ellipse(x, y + 2, 16, 5, 0, 0, 6.2832); ctx.fill();
      if (c.width) { ctx.imageSmoothingEnabled = false; ctx.drawImage(c, x - c.width / 2, y - c.height + 4); }
    }
  }

  // ── Transición (escena lateral hacia el portón) ──────────────────────────────
  function transicion(opts) {
    opts = opts || {};
    const jinete = opts.jinete || {};
    const montado = !!(jinete && jinete.montura);
    let done = false, raf = null, t0 = null;
    const ov = document.createElement('div'); ov.className = 'hacp-viaje-trans';
    ov.innerHTML = `<canvas class="hacp-viaje-cv" width="960" height="420"></canvas>
      <div class="hacp-viaje-cap"><b>${montado ? '🐎 Cabalgando' : '🚶 De camino'} hacia ${esc(opts.destinoNombre || 'la hacienda')}</b></div>
      <button type="button" class="hacp-viaje-skip">Llegar ya ▸</button>`;
    document.body.appendChild(ov);
    const cv = ov.querySelector('.hacp-viaje-cv'), ctx = cv.getContext('2d');
    const still = reduce();
    const DUR = still ? 60 : 3200;
    function finish() {
      if (done) return; done = true;
      if (raf) cancelAnimationFrame(raf);
      ov.classList.add('arrive');
      setTimeout(() => { ov.remove(); if (opts.onLlegar) opts.onLlegar(); }, still ? 40 : 460);
    }
    ov.querySelector('.hacp-viaje-skip').addEventListener('click', finish);
    function paint(t) {
      if (t0 == null) t0 = t;
      const p = Math.min(1, (t - t0) / DUR);              // 0..1 progreso del viaje
      const W = cv.width, H = cv.height, gy = H * 0.80;
      // Cielo.
      const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#2a3a52'); sky.addColorStop(.55, '#8a6a54'); sky.addColorStop(1, '#c89a6a');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,244,214,.85)'; ctx.beginPath(); ctx.arc(W * 0.16, H * 0.2, 20, 0, 6.2832); ctx.fill();
      // Colinas (parallax lento).
      const off = p * W * 0.5;
      for (let layer = 0; layer < 2; layer++) {
        ctx.fillStyle = layer ? '#5a4632' : '#6f5844';
        const base = H * (0.6 + layer * 0.06), amp = 26 - layer * 8, sp = 150 - layer * 40, ph = off * (0.3 + layer * 0.4);
        ctx.beginPath(); ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += 12) ctx.lineTo(x, base - Math.abs(Math.sin((x + ph) / sp)) * amp);
        ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      }
      // Camino.
      ctx.fillStyle = '#6b5334'; ctx.fillRect(0, gy, W, H - gy);
      ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.fillRect(0, gy, W, 3);
      ctx.strokeStyle = 'rgba(230,210,160,.35)'; ctx.lineWidth = 2; ctx.setLineDash([18, 22]); ctx.lineDashOffset = -off * 1.4;
      ctx.beginPath(); ctx.moveTo(0, gy + (H - gy) * 0.5); ctx.lineTo(W, gy + (H - gy) * 0.5); ctx.stroke(); ctx.setLineDash([]);
      // Portón de destino a la derecha, crece según te acercas.
      const gate = 0.55 + p * 0.9, gw = 120 * gate, gh = 150 * gate, gx = W - gw + (1 - p) * 140;
      ctx.fillStyle = '#3d2f22'; ctx.fillRect(gx, gy - gh, gw, gh);
      ctx.fillStyle = '#241a12'; ctx.fillRect(gx + gw * 0.3, gy - gh * 0.7, gw * 0.4, gh * 0.7);
      ctx.fillStyle = '#241108'; ctx.beginPath(); ctx.moveTo(gx - 12, gy - gh); ctx.lineTo(gx + gw + 10, gy - gh - 14); ctx.lineTo(gx + gw + 10, gy - gh + 4); ctx.lineTo(gx - 8, gy - gh + 18); ctx.closePath(); ctx.fill();
      // Viajero avanzando hacia el portón.
      const vx = W * 0.16 + p * (gx - W * 0.16 - 30), frame = Math.floor((t - t0) / 130);
      drawViajero(ctx, vx, gy, jinete, frame, montado ? 3.2 : 3.4);
      if (p >= 1) finish();
    }
    function loop(t) { if (done) return; paint(t || 0); if (!still) raf = requestAnimationFrame(loop); else finish(); }
    requestAnimationFrame(() => ov.classList.add('on'));
    if (still) { paint(performance ? 0 : 0); }
    raf = requestAnimationFrame(loop);
    return { finish };
  }

  // ── Mapa de pergamino ────────────────────────────────────────────────────────
  function abrir(opts) {
    opts = opts || {};
    const destinos = (opts.destinos || []).slice();
    let sel = null, closed = false;
    const ov = document.createElement('div'); ov.className = 'hacp-viaje-ov';
    // Marcadores posicionados por región (+ dispersión por índice para no solapar).
    const porReg = {};
    const marks = destinos.map((d, i) => {
      const reg = regionDe(d.region); const n = (porReg[d.region] = (porReg[d.region] || 0) + 1);
      const dx = ((n - 1) % 3) * 7 - 6, dy = Math.floor((n - 1) / 3) * 8;
      const x = Math.max(6, Math.min(92, reg.x + dx)), y = Math.max(12, Math.min(88, reg.y + dy));
      const col = (d.faccion && d.faccion.color) || '#b23b2e';
      return `<button type="button" class="hacp-viaje-mark" data-i="${i}" style="left:${x}%;top:${y}%;--mc:${esc(col)}" title="${esc(d.nombre)}">
        <span class="dot"></span><span class="lbl">${esc(d.nombre)}${d.zh ? ` <b>${esc(d.zh)}</b>` : ''}</span></button>`;
    }).join('');
    const regLabels = Object.keys(REGIONES).map(k => { const r = REGIONES[k]; return `<span class="hacp-viaje-reg" style="left:${r.x}%;top:${r.y - 9}%">${r.zh} <i>${esc(r.nombre)}</i></span>`; }).join('');
    ov.innerHTML = `
      <div class="hacp-viaje-box" role="dialog" aria-label="Mapa de viaje">
        <button type="button" class="hacp-viaje-x" aria-label="Cerrar">✕</button>
        <div class="hacp-viaje-head"><span class="zh">輿圖</span><div><div class="t">Mapa de los Reinos</div><div class="s">Elige una hacienda que visitar · saldrás de ${esc((opts.origen && opts.origen.nombre) || 'tu casa')}</div></div></div>
        <div class="hacp-viaje-cols">
          <div class="hacp-viaje-map">${regLabels}${marks || '<div class="hacp-viaje-empty">Aún no hay haciendas que visitar.</div>'}</div>
          <aside class="hacp-viaje-info"><div class="hacp-viaje-info-empty">Toca un marcador del mapa para ver la hacienda.</div></aside>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const info = ov.querySelector('.hacp-viaje-info');
    function close() { if (closed) return; closed = true; ov.classList.remove('on'); setTimeout(() => ov.remove(), 240); }
    ov.querySelector('.hacp-viaje-x').addEventListener('click', close);
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    document.addEventListener('keydown', function onKey(e) { if (closed) { document.removeEventListener('keydown', onKey); return; } if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } });
    ov.querySelectorAll('.hacp-viaje-mark').forEach(b => b.addEventListener('click', () => {
      sel = destinos[Number(b.dataset.i)];
      ov.querySelectorAll('.hacp-viaje-mark').forEach(x => x.classList.toggle('sel', x === b));
      const fac = sel.faccion || {}, montado = !!(opts.jinete && opts.jinete.montura);
      info.innerHTML = `<div class="hacp-viaje-info-card">
        <div class="hacp-viaje-fac" style="--mc:${esc(fac.color || '#b23b2e')}">${fac.zh ? `<b>${esc(fac.zh)}</b> ` : ''}${esc(fac.nombre || 'Sin facción')}</div>
        <div class="hacp-viaje-nom">${esc(sel.nombre)}${sel.zh ? ` <span>${esc(sel.zh)}</span>` : ''}</div>
        <div class="hacp-viaje-modo">${montado ? '🐎 Irás a caballo' : '🚶 Irás a pie'}</div>
        <button type="button" class="hacp-viaje-go">Viajar a ${esc(sel.nombre)} ▸</button>
      </div>`;
      const go = info.querySelector('.hacp-viaje-go'); if (go) go.addEventListener('click', () => {
        const dest = sel; close();
        transicion({ jinete: opts.jinete, destinoNombre: dest.nombre, onLlegar: () => { if (opts.onLlegar) opts.onLlegar(dest.id); } });
      });
    }));
    requestAnimationFrame(() => ov.classList.add('on'));
    return { close };
  }

  return { abrir, transicion };
})();
if (typeof window !== 'undefined') window.HacViajar = HacViajar;
