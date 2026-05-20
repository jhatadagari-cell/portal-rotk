// ── Shared era state (read by era-fx.js) ──
let activeEra = null;
let showAllChars = false;
let readerPage = 0;
let readerKeyHandler = null;
let filterText = '';
let selectedFactions = new Set();

// ── Multi-faction cursor transition ──
function lerpHex(a, b, t) {
  const p = s => [parseInt(s.slice(1,3),16), parseInt(s.slice(3,5),16), parseInt(s.slice(5,7),16)];
  const [ar,ag,ab] = p(a), [br,bg,bb] = p(b);
  return '#' + [ar+(br-ar)*t, ag+(bg-ag)*t, ab+(bb-ab)*t]
    .map(v => Math.round(v).toString(16).padStart(2,'0')).join('');
}

function applyFactionTransition(el, c) {
  if (!c.facs) return;
  const [f0, f1] = c.facs;
  const isRow = el.classList.contains('ccard-row');

  function paint(color, ico) {
    el.style.setProperty('--fc', color);
    if (isRow) el.style.borderLeftColor = color;
    else el.style.borderTopColor = color;
    const icoEl = el.querySelector('.ccard-ico');
    if (icoEl) { icoEl.style.borderColor = color; icoEl.textContent = ico; }
    const zhEl = el.querySelector('.ccard-zh');
    if (zhEl) zhEl.style.color = color;
  }

  el.addEventListener('mouseenter', () => {
    clearTimeout(el._facTimer);
    el._facBaseTrans = el.style.transition;
    el.style.transition = el.style.transition.replace(/,?\s*border-color[^,]*/gi, '');
    const icoEl = el.querySelector('.ccard-ico');
    const zhEl  = el.querySelector('.ccard-zh');
    if (icoEl) icoEl.style.transition = 'none';
    if (zhEl)  zhEl.style.transition  = 'none';
  });

  el.addEventListener('mousemove', e => {
    const rect = el.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    paint(lerpHex(f0.color, f1.color, t), t >= 0.5 ? f1.ico : f0.ico);
  });

  el.addEventListener('mouseleave', () => {
    el.style.transition = el._facBaseTrans || '';
    const icoEl = el.querySelector('.ccard-ico');
    const zhEl  = el.querySelector('.ccard-zh');
    const tr = 'border-color .35s ease, color .35s ease';
    if (icoEl) icoEl.style.transition = tr;
    if (zhEl)  zhEl.style.transition  = tr;
    paint(c.fc, c.ico);
    el._facTimer = setTimeout(() => {
      if (icoEl) icoEl.style.transition = '';
      if (zhEl)  zhEl.style.transition  = '';
    }, 380);
  });
}

// DOM refs — may be null on pages that don't include these sections
const cgrid          = document.getElementById('char-grid');
const charsMore      = document.getElementById('chars-more');
const charsMoreBtn   = document.getElementById('chars-more-btn');
const fcards         = [...document.querySelectorAll('.fcard[data-fid]')];
const eraState       = document.getElementById('era-state');
const eraReset       = document.getElementById('era-reset');
const heroesTitle    = document.getElementById('heroes-title');
const factionsTitle  = document.getElementById('factions-title');
const eraBookmark    = document.getElementById('era-bookmark');
const eraBookmarkZh  = document.getElementById('era-bookmark-zh');
const eraBookmarkName = document.getElementById('era-bookmark-name');

const _bmClose = document.getElementById('era-bookmark-close');
if (_bmClose) _bmClose.addEventListener('click', () => setActiveEra(null));

// ── Character grid ──
const RANK_LABELS = { 1:'Figuras Clave Del Periodo', 2:'Otros Importantes', 3:'Otros Actores' };

function effectiveRank(c, eraId) {
  return (eraId && c.eraRank && c.eraRank[eraId] != null) ? c.eraRank[eraId] : (c.rank ?? 3);
}

function getCharFactions(c) {
  if (c.facs) return c.facs.map(f => ({ label: f.label, color: f.color }));
  return [{ label: c.fac, color: c.fc }];
}

function charMatchesText(c) {
  if (!filterText) return true;
  const normalize = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const q = normalize(filterText);
  const en = normalize(c.en || '');
  const zh = c.zh || '';
  return en.includes(q) || zh.includes(filterText.toLowerCase());
}

function getFactionId(label) {
  if (typeof FACTIONS === 'undefined') return label;
  const f = FACTIONS.find(f => [].concat(f.fac).includes(label));
  return f ? f.id : label;
}

function charMatchesFactions(c) {
  if (selectedFactions.size === 0) return true;
  return getCharFactions(c).some(f => selectedFactions.has(getFactionId(f.label)));
}

function updateFunnelState() {
  const btn = document.getElementById('char-funnel');
  const clearBtn = document.getElementById('funnel-clear');
  if (btn) btn.classList.toggle('has-filters', selectedFactions.size > 0);
  if (clearBtn) clearBtn.hidden = selectedFactions.size === 0;
}

function renderFactionFilters(basePool) {
  const container = document.getElementById('char-faction-btns');
  if (!container) return;
  const factionMap = new Map();
  const countMap = new Map();
  basePool.forEach(({ c }) => {
    getCharFactions(c).forEach(({ label, color }) => {
      const fid = getFactionId(label);
      if (!factionMap.has(fid)) {
        const faction = typeof FACTIONS !== 'undefined' ? FACTIONS.find(f => f.id === fid) : null;
        factionMap.set(fid, { es: faction ? faction.es : label, color: faction ? faction.color : color });
      }
      countMap.set(fid, (countMap.get(fid) || 0) + 1);
    });
  });
  for (const sel of selectedFactions) {
    if (!factionMap.has(sel)) selectedFactions.delete(sel);
  }
  const sorted = [...factionMap.entries()].sort((a, b) => (countMap.get(b[0]) || 0) - (countMap.get(a[0]) || 0));
  container.innerHTML = '';
  for (const [fid, { es, color }] of sorted) {
    const count = countMap.get(fid) || 0;
    const btn = document.createElement('button');
    btn.className = 'fac-filter-btn' + (selectedFactions.has(fid) ? ' active' : '');
    btn.style.setProperty('--fc', color);
    const dot = document.createElement('span');
    dot.className = 'fac-dot';
    dot.style.background = color;
    const name = document.createElement('span');
    name.textContent = es;
    const cnt = document.createElement('span');
    cnt.className = 'fac-count';
    cnt.textContent = count;
    btn.append(dot, name, cnt);
    btn.addEventListener('click', () => {
      if (selectedFactions.has(fid)) selectedFactions.delete(fid);
      else selectedFactions.add(fid);
      renderCharacters(activeEra);
    });
    container.appendChild(btn);
  }
  updateFunnelState();
}

function renderCharacters(filterEraId = null) {
  if (!cgrid) return;
  cgrid.innerHTML = '';
  const basePool = CHARS
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.tags && c.fc)
    .filter(({ c }) => !filterEraId || (c.eras || []).includes(filterEraId));

  renderFactionFilters(basePool);

  const pool = basePool
    .filter(({ c }) => charMatchesText(c))
    .filter(({ c }) => charMatchesFactions(c));

  const maxRank = filterEraId ? 2 : 1;
  const shown = showAllChars || filterText ? pool : pool.filter(({ c }) => effectiveRank(c, filterEraId) <= maxRank);

  if (!shown.length) {
    cgrid.innerHTML = `<div class="sec-dsc" style="max-width:none;text-align:left">No hay personajes destacados para esta era en la vista actual.</div>`;
  } else {
    const groups = [[], [], []];
    shown.forEach(item => {
      const r = Math.min(effectiveRank(item.c, filterEraId), 3);
      groups[r - 1].push(item);
    });

    [1, 2, 3].forEach(rank => {
      const grp = groups[rank - 1];
      if (!grp.length) return;

      const sep = document.createElement('div');
      sep.className = 'char-rank-sep';
      sep.textContent = RANK_LABELS[rank];
      cgrid.appendChild(sep);

      if (rank === 3) {
        const list = document.createElement('div');
        list.className = 'char-rank-list';
        grp.forEach(({ c, i }) => {
          const row = document.createElement('div');
          row.className = c.facs ? 'ccard-row ccard-row--multifac' : 'ccard-row';
          row.setAttribute('data-bg', c.zh[0]);
          row.setAttribute('data-idx', i);
          row.style.cssText = `--fc:${c.fc}`;
          row.innerHTML = `
            <div class="ccard-row-body">
              <div class="ccard-row-name">
                <span class="ccard-zh" style="color:${c.fc}">${c.zh}</span>
                <span class="ccard-en">${c.en}</span>
              </div>
              <div class="ccard-ttl">${c.ttl}</div>
            </div>
            <div class="ccard-tags">${c.tags.slice(0,2).map(t=>`<span class="ccard-tag">${t}</span>`).join('')}</div>`;
          applyFactionTransition(row, c);
          list.appendChild(row);
        });
        cgrid.appendChild(list);
      } else {
        const grid = document.createElement('div');
        grid.className = rank === 1 ? 'char-rank-grid char-rank-1' : 'char-rank-grid char-rank-2';
        grp.forEach(({ c, i }) => {
          const d = document.createElement('div');
          const baseClass = rank === 1 ? 'ccard' : 'ccard ccard--sm';
          d.className = c.facs ? `${baseClass} ccard--multifac` : baseClass;
          d.setAttribute('data-bg', c.zh[0]);
          d.setAttribute('data-idx', i);
          d.style.cssText = `--fc:${c.fc}`;
          d.innerHTML = rank === 1 ? `
            <div class="ccard-names">
              <span class="ccard-zh" style="color:${c.fc}">${c.zh}</span>
              <span class="ccard-en">${c.en}</span>
            </div>
            <div class="ccard-rule"></div>
            <div class="ccard-ttl">${c.ttl}</div>
            <div class="ccard-bio">${c.bio}</div>
            <div class="ccard-tags">${c.tags.map(t=>`<span class="ccard-tag">${t}</span>`).join('')}</div>` : `
            <div class="ccard-zh" style="color:${c.fc}">${c.zh}</div>
            <div class="ccard-en">${c.en}</div>
            <div class="ccard-ttl">${c.ttl}</div>
            <div class="ccard-tags"><span class="ccard-tag">${c.tags[0]}</span></div>`;
          applyFactionTransition(d, c);
          grid.appendChild(d);
        });
        cgrid.appendChild(grid);
      }
    });
  }

  const hasHidden = pool.length > shown.length;
  if (charsMore) charsMore.hidden = !hasHidden && !showAllChars;
  if (charsMore && !charsMore.hidden && charsMoreBtn) {
    charsMoreBtn.textContent = showAllChars
      ? 'Ver menos'
      : `Ver todos${filterEraId ? ' en esta era' : ' los personajes'} · ${pool.length}`;
  }
}

if (cgrid) {
  cgrid.addEventListener('click', e => {
    const card = e.target.closest('.ccard, .ccard-row');
    if (!card) return;
    const idx = parseInt(card.dataset.idx);
    if (CHARS[idx] && CHARS[idx].zh === '吕布') {
      luBuEasterEgg(idx);
    } else {
      openChar(idx);
    }
  });
}

// ── Faction cards ──
function renderFactions(filterEraId = null) {
  const era = PERIODS.find(p => p.id === filterEraId);
  const visibleFactions = new Set((era && era.factions) || ['wei', 'shu', 'wu']);
  fcards.forEach(card => {
    card.classList.toggle('is-hidden', filterEraId && !visibleFactions.has(card.dataset.fid));
  });
}

// ── Period carousel ──
const pgrid = document.getElementById('per-grid');
if (pgrid) {
  const pwrap = pgrid.closest('.per-wrap');
  let edgeScrollDir = 0;
  let edgeScrollTimer = null;

  const setEdgeScroll = (dir) => {
    if (edgeScrollDir === dir) return;
    edgeScrollDir = dir;
    if (pwrap) {
      pwrap.classList.toggle('nav-left', dir < 0);
      pwrap.classList.toggle('nav-right', dir > 0);
    }
    if (!dir && edgeScrollTimer) {
      clearInterval(edgeScrollTimer);
      edgeScrollTimer = null;
      return;
    }
    if (dir && !edgeScrollTimer) {
      edgeScrollTimer = setInterval(() => {
        if (!edgeScrollDir) return;
        pgrid.scrollLeft += edgeScrollDir * 14;
      }, 16);
    }
  };

  PERIODS.forEach(p => {
    const wrap = document.createElement('div');
    wrap.className = 'pcard-wrap';

    const d = document.createElement('div');
    d.className = 'pcard';
    d.dataset.pid = p.id;
    d.style.cssText = `--pc:${p.c}${p.bgImg ? `;--pimg:url('${p.bgImg}')` : ''}`;
    d.innerHTML = `
      <div class="pcard-bg" aria-hidden="true"></div>
      <div class="pcard-zh-bg" aria-hidden="true">${p.zh}</div>
      <div class="pcard-foot">
        <div class="pcard-yr">${p.y}</div>
        <div class="pcard-n">${p.n}</div>
        <div class="pcard-zh">${p.zh}</div>
      </div>
      <div class="pcard-over">
        <div class="pcard-over-desc">${p.desc}</div>
      </div>
    `;

    wrap.appendChild(d);
    pgrid.appendChild(wrap);
  });

  pgrid.addEventListener('click', e => {
    const detail = e.target.closest('.pcard-detail');
    if (detail) return;
    const card = e.target.closest('.pcard');
    if (!card) return;
    setActiveEra(card.dataset.pid);
  });

  pgrid.addEventListener('wheel', e => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      pgrid.scrollBy({ left: e.deltaY, behavior: 'smooth' });
      e.preventDefault();
    }
  }, { passive: false });

  if (pwrap) {
    const leftZone  = pwrap.querySelector('.per-nav-zone.left');
    const rightZone = pwrap.querySelector('.per-nav-zone.right');

    if (leftZone) {
      leftZone.addEventListener('mouseenter',  () => setEdgeScroll(-1));
      leftZone.addEventListener('mouseleave',  () => setEdgeScroll(0));
      leftZone.addEventListener('click', e => {
        e.stopPropagation();
        setEdgeScroll(0);
        const step = (pgrid.querySelector('.pcard-wrap')?.offsetWidth ?? 200) + 22;
        pgrid.scrollBy({ left: -step, behavior: 'smooth' });
      });
    }
    if (rightZone) {
      rightZone.addEventListener('mouseenter', () => setEdgeScroll(1));
      rightZone.addEventListener('mouseleave', () => setEdgeScroll(0));
      rightZone.addEventListener('click', e => {
        e.stopPropagation();
        setEdgeScroll(0);
        const step = (pgrid.querySelector('.pcard-wrap')?.offsetWidth ?? 200) + 22;
        pgrid.scrollBy({ left: step, behavior: 'smooth' });
      });
    }

    pwrap.addEventListener('mouseleave', () => setEdgeScroll(0));
  }
}

// ── Era activation ──
function setActiveEra(eraId, opts = {}) {
  activeEra = eraId;
  showAllChars = false;
  selectedFactions.clear();
  filterText = '';
  const searchEl = document.getElementById('char-search');
  if (searchEl) searchEl.value = '';
  const era = PERIODS.find(p => p.id === eraId);
  document.querySelectorAll('.pcard').forEach(card => {
    card.classList.toggle('active', card.dataset.pid === eraId);
  });
  if (eraState) eraState.textContent = era ? `Era activa: ${era.n} · ${era.y}` : 'Era activa: Todas';
  if (eraBookmark) {
    eraBookmark.classList.toggle('visible', !!era);
    eraBookmark.style.setProperty('--bm-c', era ? era.c : '');
  }
  if (eraBookmarkZh)   eraBookmarkZh.textContent   = era ? era.zh : '';
  if (eraBookmarkName) eraBookmarkName.textContent  = era ? era.n  : '';
  if (heroesTitle)   heroesTitle.textContent   = era ? `Personajes clave · ${era.n}` : 'Los Grandes Protagonistas';
  if (factionsTitle) factionsTitle.textContent = era ? `Reinos intervinientes · ${era.zh}` : '三國鼎立';
  // El resaltado de la tarjeta y el marcador ya están aplicados arriba; la
  // reconstrucción pesada (rejillas + reader) y los efectos ambientales se
  // difieren un frame para que el click se sienta instantáneo.
  requestAnimationFrame(() => {
    renderCharacters(eraId);
    renderFactions(eraId);
    renderEraDetail(eraId, opts);
    if (typeof startBlossom  !== 'undefined') { if (eraId === 'turbantes')       startBlossom();    else stopBlossom();  }
    if (typeof startFire     !== 'undefined') { if (eraId === 'chibi')           startFire();       else stopFire();     }
    if (typeof startBlizzard !== 'undefined') { if (eraId === 'sima')            startBlizzard();   else stopBlizzard(); }
    if (typeof startDust     !== 'undefined') { if (eraId === 'han-tardio')      startDust();       else stopDust();     }
    if (typeof startPeace    !== 'undefined') { if (eraId === 'jin')             startPeace();      else stopPeace();    }
    if (typeof startLeaves   !== 'undefined') { if (eraId === 'guerras-senores') startLeaves();     else stopLeaves();   }
    if (typeof startCinder   !== 'undefined') { if (eraId === 'dong-zhuo')       startCinder();     else stopCinder();   }
    if (typeof startDuskRain !== 'undefined') { if (eraId === 'guerras-ocaso')   startDuskRain();   else stopDuskRain(); }
    if (typeof startChaos    !== 'undefined') { if (eraId === 'ocho-principes')  startChaos();      else stopChaos();    }
    if (typeof startWarDust  !== 'undefined') { if (eraId === 'tres-reinos')     startWarDust();    else stopWarDust();  }
  });
}

if (eraReset)    eraReset.addEventListener('click', () => setActiveEra(null));
if (charsMoreBtn) charsMoreBtn.addEventListener('click', () => {
  showAllChars = !showAllChars;
  renderCharacters(activeEra);
});

// ── Paginated chronicle reader ──
function renderPagedReader(era, section, panel, opts = {}) {
  const events = era.events || [];
  if (!events.length) return;

  function goTo(idx) {
    if (idx < 0 || idx >= events.length) return;
    document.body.style.overflow = '';
    readerPage = idx;
    const ev    = events[idx];
    const char  = ev.char || null;
    const isFirst = idx === 0;
    const isLast  = idx === events.length - 1;
    const currentEraIdx = PERIODS.findIndex(p => p.id === era.id);
    const nextEra = (isLast && currentEraIdx >= 0 && currentEraIdx < PERIODS.length - 1)
      ? PERIODS[currentEraIdx + 1] : null;

    const charHtml = char
      ? `<div class="reader-char" style="--cfc:${char.fc || era.c}">
           <div class="reader-char-zh">${char.zh}</div>
           <div class="reader-char-en">${char.en}</div>
           <div class="reader-char-rule"></div>
           <div class="reader-char-role">${char.role}</div>
           <div class="reader-char-note">${char.note}</div>
           ${char.href ? `<a class="reader-char-link" href="${char.href}">Ver ficha →</a>` : ''}
         </div>`
      : '<div class="reader-char reader-char-empty"></div>';

    const dotsHtml = events.map((_, i) =>
      `<button class="reader-dot${i === idx ? ' active' : ''}" data-i="${i}" aria-label="Página ${i+1}"></button>`
    ).join('');

    panel.innerHTML = `
      <div class="reader-wrap" style="--ec:${era.c}">
        <div class="reader-bg" aria-hidden="true">${(ev.bgImg || era.bgImg) ? `<img src="${ev.bgImg || era.bgImg}" alt="">` : ''}</div>
        ${(ev.bgImg || era.bgImg) ? `<button class="reader-eye" title="Ver imagen completa" aria-label="Ver imagen completa"><span class="eye-open"><svg width="28" height="19" viewBox="0 0 18 13" fill="none"><path d="M9 .5C4.5.5 1 4.5 1 6.5 1 8.5 4.5 12.5 9 12.5c4.5 0 8-4 8-6S13.5.5 9 .5Z" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/><circle cx="9" cy="6.5" r="2.5" stroke="currentColor" stroke-width="1"/></svg></span><span class="eye-slash"><svg width="30" height="22" viewBox="0 0 20 16" fill="none"><path d="M10 2C5.5 2 2 6 1 8c1 2 4.5 6 9 6s8-4 9-6c-1-2-4.5-6-9-6Z" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/><circle cx="10" cy="8" r="2.5" stroke="currentColor" stroke-width="1"/><line x1="2.5" y1=".5" x2="17.5" y2="15.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></span></button>` : ''}
        <div class="reader-bg-zh" aria-hidden="true">${era.zh}</div>
        <div class="reader-hd">
          <div class="reader-hd-left">
            <span class="reader-hd-zh">${era.zh}</span>
            <span class="reader-hd-sep">·</span>
            <span class="reader-hd-n">${era.n}</span>
          </div>
          <div class="reader-pager">
            <span class="reader-pager-cur">${idx + 1}</span>
            <span class="reader-pager-sep">/</span>
            <span class="reader-pager-tot">${events.length}</span>
          </div>
        </div>
        <div class="reader-content-clip">
        <div class="reader-content">
          <div class="reader-event">
            <div class="reader-ev-eyebrow">
              <span class="reader-ev-y">${ev.y}</span>
              <span class="reader-ev-dot">·</span>
              <span class="reader-ev-type">${ev.type}</span>
            </div>
            <h2 class="reader-ev-n">${ev.n}</h2>
            ${ev.body
              ? `<div class="reader-ev-body">${ev.body}</div>`
              : `<p class="reader-ev-d">${ev.d}</p>`}
          </div>
          <div class="reader-divider"></div>
          ${charHtml}
        </div>
        </div>
        <div class="reader-nav">
          <button class="reader-btn reader-prev" ${isFirst ? 'disabled' : ''} aria-label="Anterior">◀</button>
          <div class="reader-dots">${dotsHtml}</div>
          ${nextEra
            ? `<button class="reader-next-era" style="--nec:${nextEra.c}" aria-label="Ir a ${nextEra.n}">
                <span class="rne-label">Siguiente era →</span>
                <span class="rne-name">${nextEra.n}</span>
                <span class="rne-zh">${nextEra.zh}</span>
               </button>`
            : `<button class="reader-btn reader-next" ${isLast ? 'disabled' : ''} aria-label="Siguiente">▶</button>`
          }
        </div>
      </div>
      ${(() => { const cc = chroniclesForEvent(ev); return cc.length ? `
      <div class="reader-chron-accordion" style="--ec:${era.c}">
        <button class="reader-chron-toggle" aria-expanded="false">
          <span class="reader-chron-toggle-left">
            <span class="reader-chron-toggle-label">Crónicas</span>
            <span class="reader-chron-toggle-year">${ev.y}</span>
          </span>
          <span class="reader-chron-toggle-right">
            <span class="reader-chron-toggle-count">${cc.length}</span>
            <span class="reader-chron-toggle-chevron">›</span>
          </span>
        </button>
        <div class="reader-chron-body">
          <div class="reader-chron-list">
            ${cc.map(c => `
              <a class="reader-chron-item" href="${c.href}#${c.id}" style="--cc:${c.fc}">
                <span class="reader-chron-y">${c.y1} d.C.</span>
                <span class="reader-chron-zh">${c.zh}</span>
                <span class="reader-chron-n">${c.n}</span>
                <span class="reader-chron-char">${c.char}</span>
              </a>`).join('')}
          </div>
        </div>
      </div>` : ''; })()}`;

    panel.querySelector('.reader-prev')?.addEventListener('click', () => goTo(readerPage - 1));
    panel.querySelector('.reader-next')?.addEventListener('click', () => goTo(readerPage + 1));
    panel.querySelector('.reader-next-era')?.addEventListener('click', () => {
      if (!nextEra) return;
      setActiveEra(nextEra.id, { noScroll: true });
      setTimeout(() => document.getElementById('periods')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    });
    panel.querySelectorAll('.reader-dot[data-i]').forEach(d =>
      d.addEventListener('click', () => goTo(+d.dataset.i))
    );
    panel.querySelector('.reader-chron-toggle')?.addEventListener('click', function () {
      const acc = this.closest('.reader-chron-accordion');
      acc.classList.toggle('open');
      this.setAttribute('aria-expanded', acc.classList.contains('open'));
    });

    const _eye = panel.querySelector('.reader-eye');
    if (_eye) {
      function _hideImage() {
        const wrap = _eye.closest('.reader-wrap');
        if (!wrap || !wrap.classList.contains('img-revealed')) return;
        wrap.classList.remove('img-revealed');
        _eye.title = 'Ver imagen completa';
        _eye.setAttribute('aria-label', 'Ver imagen completa');
      }

      _eye.addEventListener('click', () => {
        const wrap = _eye.closest('.reader-wrap');
        if (wrap.classList.contains('img-revealed')) {
          _hideImage();
        } else {
          wrap.classList.add('img-revealed');
          _eye.title = 'Volver al texto';
          _eye.setAttribute('aria-label', 'Volver al texto');
        }
      });

      document.addEventListener('keydown', e => {
        if (e.key === 'Escape') _hideImage();
      });
    }

    if (typeof applyAnnotations === 'function') applyAnnotations(panel);

    // Scroll-fade: indica overflow con gradiente inferior; se apaga al llegar al fondo
    const _content = panel.querySelector('.reader-content');
    const _wrap    = panel.querySelector('.reader-wrap');
    if (_content && _wrap) {
      function _updateScrollFade() {
        const atBottom = _content.scrollHeight - _content.scrollTop <= _content.clientHeight + 6;
        _wrap.classList.toggle('reader-at-bottom', atBottom);
      }
      _content.addEventListener('scroll', _updateScrollFade, { passive: true });
      // Evaluar estado inicial tras render
      requestAnimationFrame(() => requestAnimationFrame(_updateScrollFade));
    }

    // Trigger enter animation on next frame
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        panel.querySelector('.reader-content')?.classList.add('reader-entered')
      )
    );
  }

  // Reset & keyboard
  if (readerKeyHandler) document.removeEventListener('keydown', readerKeyHandler);
  readerKeyHandler = e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goTo(readerPage + 1);
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   goTo(readerPage - 1);
  };
  document.addEventListener('keydown', readerKeyHandler);

  readerPage = 0;
  goTo(0);
  section.classList.add('visible');
  if (!opts.noScroll) setTimeout(() => section.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
}

// ── Era detail expansion panel (periodos.html) ──
function renderEraDetail(eraId, opts = {}) {
  const section = document.getElementById('era-detail');
  const panel   = document.getElementById('era-detail-panel');
  if (!section || !panel) return;

  if (!eraId) { section.classList.remove('visible'); return; }

  const era = PERIODS.find(p => p.id === eraId);
  if (!era) { section.classList.remove('visible'); return; }

  if (era.paged) { renderPagedReader(era, section, panel, opts); return; }

  // Characters for this era sorted by eraRank then overall rank
  const eraChars = (typeof CHARS !== 'undefined' ? CHARS : [])
    .filter(c => c.eras && c.eras.includes(eraId))
    .sort((a, b) => {
      const ra = (a.eraRank && a.eraRank[eraId]) || 9;
      const rb = (b.eraRank && b.eraRank[eraId]) || 9;
      return ra !== rb ? ra - rb : (a.rank || 9) - (b.rank || 9);
    });

  // Build vertical timeline rows (events + character side reveals)
  const events = era.events || [];
  const tlRows = events.map((ev, i) => {
    const side = i % 2 === 0 ? 'right' : 'left';
    const char = eraChars[i] || null;
    const charHtml = char ? `
      <div class="erd-char" style="--cfc:${char.fc || era.c}">
        <div class="erd-char-zh">${char.zh}</div>
        <div class="erd-char-en">${char.en}</div>
        <div class="erd-char-role">${char.ttl || char.fac || ''}</div>
        <div class="erd-char-bio">${(char.bio || '').slice(0, 90)}…</div>
        ${char.detailHref ? `<a class="erd-char-link" href="${char.detailHref}">Ver ficha →</a>` : ''}
      </div>` : '<div></div>';

    return `
      <div class="erd-tl-row" data-side="${side}">
        ${charHtml}
        <div class="erd-tl-node"></div>
        <div class="erd-ev">
          <div class="erd-ev-top">
            <span class="erd-ev-y">${ev.y}</span>
            <span class="erd-ev-type">${ev.type}</span>
          </div>
          <h3 class="erd-ev-n">${ev.n}</h3>
          <p class="erd-ev-d">${ev.d}</p>
        </div>
      </div>`;
  }).join('');

  const legsHtml = era.legs && era.legs.length ? `
    <div class="erd-hero-legs">
      ${era.legs.map(([color, label]) =>
        `<div class="erd-hero-leg">
          <span class="erd-hero-leg-dot" style="background:${color}"></span>
          <span class="erd-hero-leg-lbl">${label}</span>
        </div>`
      ).join('')}
    </div>` : '';

  const proseHtml = (era.prose || [])
    .map(p => `<p class="erd-prose-p">${p}</p>`).join('');

  panel.innerHTML = `
    <div class="erd-wrap" style="--ec:${era.c}">
      <div class="erd-hero">
        <div class="erd-hero-bg" aria-hidden="true">${era.zh}</div>
        <div class="erd-hero-zh">${era.zh}</div>
        <h2 class="erd-hero-n">${era.n}</h2>
        <div class="erd-hero-y">${era.y}</div>
        <div class="erd-hero-rule"></div>
        <p class="erd-hero-lede">${era.lede || era.desc}</p>
        ${legsHtml}
      </div>
      ${events.length ? `
        <div class="erd-tl">
          <div class="erd-tl-spine"></div>
          ${tlRows}
        </div>` : ''}
      ${proseHtml ? `<div class="erd-prose">${proseHtml}</div>` : ''}
    </div>`;

  section.classList.add('visible');
  if (!opts.noScroll) setTimeout(() => section.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);

  // Scroll-reveal for character side panels
  const revObs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); revObs.unobserve(e.target); }
    });
  }, { threshold: 0.2 });
  panel.querySelectorAll('.erd-char').forEach(el => revObs.observe(el));
}

// ── FAQ ──
const flist = document.getElementById('faq-list');
if (flist) {
  FAQS.forEach(f => {
    const item = document.createElement('div');
    item.className = 'faq-item';
    item.innerHTML = `
      <button class="faq-q" onclick="this.parentElement.classList.toggle('open')">
        <span>${f.q}</span><span class="faq-arrow">▾</span>
      </button>
      <div class="faq-a">${f.a}</div>
    `;
    flist.appendChild(item);
  });
}

// ── Lü Bu easter egg ──
function luBuEasterEgg(idx) {
  document.body.classList.add('lubu-shaking');
  setTimeout(() => document.body.classList.remove('lubu-shaking'), 1050);

  const ov = document.getElementById('lubu-overlay');
  if (ov) {
    ov.querySelectorAll('.lubu-zh,.lubu-en,.lubu-run').forEach(el => {
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = '';
    });
    ov.classList.add('lb-active');
    setTimeout(() => {
      ov.style.transition = 'opacity .68s ease';
      ov.style.opacity = '0';
      setTimeout(() => {
        ov.classList.remove('lb-active');
        ov.style.transition = '';
        ov.style.opacity = '';
        openChar(idx);
      }, 690);
    }, 3300);
  } else {
    openChar(idx);
  }
}

// ── Chronicles matching ──
function parseEvYear(yStr) {
  const nums = (yStr || '').match(/\d{3,4}/g);
  if (!nums) return null;
  const years = nums.map(Number);
  return [Math.min(...years), Math.max(...years)];
}

function chroniclesForEvent(ev) {
  if (typeof CHRONICLES === 'undefined') return [];
  const range = parseEvYear(ev.y);
  if (!range) return [];
  const [y1, y2] = range;
  const out = [];
  CHRONICLES.forEach(ch => {
    ch.entries.forEach(e => {
      if (e.y1 >= y1 && e.y1 <= y2) out.push({ ...e, char: ch.char, fc: ch.fc, href: ch.href });
    });
  });
  return out;
}

// ── Character modal ──
function openChar(i) {
  const c = CHARS[i];
  const cmod = document.getElementById('cmod');
  const box  = document.getElementById('cmod-box');
  if (!cmod || !box) return;
  box.style.borderColor = c.fc;
  document.getElementById('cmod-inner').innerHTML = `
    <div class="cmod-hd">
      <div class="cmod-ico" style="border-color:${c.fc}">${c.ico}</div>
      <div>
        <div class="cmod-zh" style="color:${c.fc}">${c.zh}</div>
        <div class="cmod-en">${c.en}</div>
        <div class="cmod-zi">${c.zi}</div>
      </div>
    </div>
    <div class="cmod-badge" style="border-color:${c.fc};background:${c.fcbg};color:${c.fc}">${c.fac}</div>
    <div class="cmod-bio">${c.bio}</div>
    <div class="cmod-stats">${c.stats.map(s=>`<div class="cmod-stat"><div class="cmod-sl">${s[0]}</div><div class="cmod-sv">${s[1]}</div></div>`).join('')}</div>
    ${c.detailHref ? `<a class="cmod-detail-btn" href="${c.detailHref}">Ver Ficha · ${c.en}</a>` : `<button class="cmod-detail-btn" disabled>Ver Ficha · Próximamente</button>`}
  `;
  cmod.classList.add('open');
}
function closeMod() {
  const cmod = document.getElementById('cmod');
  if (cmod) cmod.classList.remove('open');
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMod(); closeFunnelPanel(); } });

// ── Character search filter ──
const charSearchEl = document.getElementById('char-search');
if (charSearchEl) {
  charSearchEl.addEventListener('input', e => {
    filterText = e.target.value.trim();
    renderCharacters(activeEra);
  });
}

// ── Funnel filter panel ──
function closeFunnelPanel() {
  const panel = document.getElementById('char-funnel-panel');
  const btn = document.getElementById('char-funnel');
  if (panel) panel.classList.remove('open');
  if (btn) btn.classList.remove('active');
}

const funnelBtn = document.getElementById('char-funnel');
const funnelPanel = document.getElementById('char-funnel-panel');
if (funnelBtn && funnelPanel) {
  funnelBtn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = funnelPanel.classList.toggle('open');
    funnelBtn.classList.toggle('active', isOpen);
  });
  document.addEventListener('click', e => {
    if (!funnelPanel.contains(e.target) && e.target !== funnelBtn) closeFunnelPanel();
  });
  funnelPanel.addEventListener('click', e => e.stopPropagation());
}

const funnelClearBtn = document.getElementById('funnel-clear');
if (funnelClearBtn) {
  funnelClearBtn.addEventListener('click', () => {
    selectedFactions.clear();
    renderCharacters(activeEra);
  });
}

// ── Init + scroll reveal ──
if (cgrid) renderCharacters();
renderFactions();

const obs = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.style.opacity = '1';
      e.target.style.transform = 'translateY(0)';
      obs.unobserve(e.target);
    }
  });
}, { threshold: 0.08 });
document.querySelectorAll('.ccard,.fcard,.pcard-wrap').forEach((el, i) => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(18px)';
  el.style.transition = `opacity 0.45s ${i*0.04}s ease, transform 0.45s ${i*0.04}s ease, box-shadow 0.18s, border-color 0.18s`;
  obs.observe(el);
});
