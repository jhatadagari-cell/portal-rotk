// ── Shared era state (read by era-fx.js) ──
let activeEra = null;
let showAllChars = false;
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
    d.style.cssText = `--pc:${p.c}`;
    d.innerHTML = `
      <div class="pcard-ico">${p.ico}</div>
      <div class="pcard-en">${p.n}</div>
      <div class="pcard-zh">${p.zh}</div>
      <div class="pcard-over">
        <div class="pcard-over-desc">${p.desc}</div>
        ${p.detailHref ? `<a class="pcard-detail" href="${p.detailHref}" onclick="event.stopPropagation()">Ver cronología →</a>` : ''}
      </div>
    `;

    const yr = document.createElement('div');
    yr.className = 'pcard-yr';
    yr.style.cssText = `--pc:${p.c}`;
    yr.textContent = p.y;

    wrap.appendChild(d);
    wrap.appendChild(yr);
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
function setActiveEra(eraId) {
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
  renderCharacters(eraId);
  renderFactions(eraId);
  renderEraDetail(eraId);
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
}

if (eraReset)    eraReset.addEventListener('click', () => setActiveEra(null));
if (charsMoreBtn) charsMoreBtn.addEventListener('click', () => {
  showAllChars = !showAllChars;
  renderCharacters(activeEra);
});

// ── Era detail expansion panel (periodos.html) ──
function renderEraDetail(eraId) {
  const section = document.getElementById('era-detail');
  const panel   = document.getElementById('era-detail-panel');
  if (!section || !panel) return;

  if (!eraId) { section.classList.remove('visible'); return; }

  const era = PERIODS.find(p => p.id === eraId);
  if (!era) { section.classList.remove('visible'); return; }

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
      ${era.detailHref ? `
        <div class="erd-cta">
          <a href="${era.detailHref}" class="btn-sec">Ver cronología completa →</a>
        </div>` : ''}
    </div>`;

  section.classList.add('visible');
  setTimeout(() => section.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);

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
