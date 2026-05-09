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
    // Disable border-color transition on el so cursor tracking is instant
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
    // Restore el transition, add smooth reset to children
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

// DOM refs
const cgrid          = document.getElementById('char-grid');
const charsMore      = document.getElementById('chars-more');
const charsMoreBtn   = document.getElementById('chars-more-btn');
const fcards         = [...document.querySelectorAll('.fcard[data-fid]')];
const eraState       = document.getElementById('era-state');
const eraReset       = document.getElementById('era-reset');
const heroesTitle    = document.getElementById('heroes-title');
const factionsTitle  = document.getElementById('factions-title');
const eraBookmark     = document.getElementById('era-bookmark');
const eraBookmarkZh   = document.getElementById('era-bookmark-zh');
const eraBookmarkName = document.getElementById('era-bookmark-name');
document.getElementById('era-bookmark-close').addEventListener('click', () => setActiveEra(null));

// ── Character grid ──
const RANK_LABELS = { 1:'Figuras Clave Del Periodo', 2:'Otros Importantes', 3:'Otros Actores' };

function effectiveRank(c, eraId) {
  return (eraId && c.eraRank && c.eraRank[eraId] != null) ? c.eraRank[eraId] : (c.rank ?? 3);
}

// ── Character filter helpers ──
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

function charMatchesFactions(c) {
  if (selectedFactions.size === 0) return true;
  return getCharFactions(c).some(f => selectedFactions.has(f.label));
}

function renderFactionFilters(basePool) {
  const container = document.getElementById('char-faction-btns');
  const factionMap = new Map();
  basePool.forEach(({ c }) => {
    getCharFactions(c).forEach(({ label, color }) => {
      if (!factionMap.has(label)) factionMap.set(label, color);
    });
  });
  for (const sel of selectedFactions) {
    if (!factionMap.has(sel)) selectedFactions.delete(sel);
  }
  container.innerHTML = '';
  for (const [label, color] of factionMap) {
    const btn = document.createElement('button');
    btn.className = 'fac-filter-btn' + (selectedFactions.has(label) ? ' active' : '');
    btn.style.setProperty('--fc', color);
    btn.textContent = label;
    btn.addEventListener('click', () => {
      if (selectedFactions.has(label)) selectedFactions.delete(label);
      else selectedFactions.add(label);
      renderCharacters(activeEra);
    });
    container.appendChild(btn);
  }
}

function renderCharacters(filterEraId = null) {
  cgrid.innerHTML = '';
  const basePool = CHARS
    .map((c, i) => ({ c, i }))
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
            <div class="ccard-ico" style="border-color:${c.fc}">${c.ico}</div>
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
          d.style.cssText = `--fc:${c.fc};border-top-color:${c.fc}`;
          d.innerHTML = rank === 1 ? `
            <div class="ccard-hd">
              <div class="ccard-ico" style="border-color:${c.fc}">${c.ico}</div>
              <div>
                <div class="ccard-zh" style="color:${c.fc}">${c.zh}</div>
                <div class="ccard-en">${c.en}</div>
              </div>
            </div>
            <div class="ccard-ttl">${c.ttl}</div>
            <div class="ccard-bio">${c.bio}</div>
            <div class="ccard-tags">${c.tags.map(t=>`<span class="ccard-tag">${t}</span>`).join('')}</div>` : `
            <div class="ccard-ico" style="border-color:${c.fc}">${c.ico}</div>
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
  charsMore.hidden = !hasHidden && !showAllChars;
  if (!charsMore.hidden) {
    charsMoreBtn.textContent = showAllChars
      ? 'Ver menos'
      : `Ver todos${filterEraId ? ' en esta era' : ' los personajes'} · ${pool.length}`;
  }
}

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
const pwrap = pgrid.closest('.per-wrap');
let edgeScrollDir = 0;
let edgeScrollTimer = null;

function setEdgeScroll(dir) {
  if (edgeScrollDir === dir) return;
  edgeScrollDir = dir;
  pwrap.classList.toggle('nav-left', dir < 0);
  pwrap.classList.toggle('nav-right', dir > 0);
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
}

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

function setActiveEra(eraId) {
  activeEra = eraId;
  showAllChars = false;
  selectedFactions.clear();
  filterText = '';
  document.getElementById('char-search').value = '';
  const era = PERIODS.find(p => p.id === eraId);
  document.querySelectorAll('.pcard').forEach(card => {
    card.classList.toggle('active', card.dataset.pid === eraId);
  });
  eraState.textContent = era ? `Era activa: ${era.n} · ${era.y}` : 'Era activa: Todas';
  eraBookmark.classList.toggle('visible', !!era);
  eraBookmark.style.setProperty('--bm-c', era ? era.c : '');
  eraBookmarkZh.textContent = era ? era.zh : '';
  eraBookmarkName.textContent = era ? era.n : '';
  heroesTitle.textContent = era ? `Personajes clave · ${era.n}` : 'Los Grandes Protagonistas';
  factionsTitle.textContent = era ? `Reinos intervinientes · ${era.zh}` : '三國鼎立';
  renderCharacters(eraId);
  renderFactions(eraId);
  if (eraId === 'turbantes')      startBlossom();    else stopBlossom();
  if (eraId === 'chibi')          startFire();       else stopFire();
  if (eraId === 'sima')           startBlizzard();   else stopBlizzard();
  if (eraId === 'han-tardio')     startDust();       else stopDust();
  if (eraId === 'jin')            startPeace();      else stopPeace();
  if (eraId === 'guerras-senores') startLeaves();    else stopLeaves();
  if (eraId === 'dong-zhuo')      startCinder();     else stopCinder();
  if (eraId === 'guerras-ocaso')  startDuskRain();   else stopDuskRain();
  if (eraId === 'ocho-principes') startChaos();      else stopChaos();
  if (eraId === 'tres-reinos')    startWarDust();    else stopWarDust();
}

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

const leftZone  = pwrap.querySelector('.per-nav-zone.left');
const rightZone = pwrap.querySelector('.per-nav-zone.right');

leftZone.addEventListener('mouseenter',  () => setEdgeScroll(-1));
leftZone.addEventListener('mouseleave',  () => setEdgeScroll(0));
rightZone.addEventListener('mouseenter', () => setEdgeScroll(1));
rightZone.addEventListener('mouseleave', () => setEdgeScroll(0));

leftZone.addEventListener('click', e => {
  e.stopPropagation();
  setEdgeScroll(0);
  const step = (pgrid.querySelector('.pcard-wrap')?.offsetWidth ?? 200) + 22;
  pgrid.scrollBy({ left: -step, behavior: 'smooth' });
});
rightZone.addEventListener('click', e => {
  e.stopPropagation();
  setEdgeScroll(0);
  const step = (pgrid.querySelector('.pcard-wrap')?.offsetWidth ?? 200) + 22;
  pgrid.scrollBy({ left: step, behavior: 'smooth' });
});

pwrap.addEventListener('mouseleave', () => setEdgeScroll(0));

eraReset.addEventListener('click', () => setActiveEra(null));
charsMoreBtn.addEventListener('click', () => {
  showAllChars = !showAllChars;
  renderCharacters(activeEra);
});

// ── FAQ ──
const flist = document.getElementById('faq-list');
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

// ── Lü Bu easter egg ──
function luBuEasterEgg(idx) {
  document.body.classList.add('lubu-shaking');
  setTimeout(() => document.body.classList.remove('lubu-shaking'), 1050);

  const ov = document.getElementById('lubu-overlay');
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
}

// ── Character modal ──
function openChar(i) {
  const c = CHARS[i];
  const box = document.getElementById('cmod-box');
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
  document.getElementById('cmod').classList.add('open');
}
function closeMod() {
  document.getElementById('cmod').classList.remove('open');
}
document.addEventListener('keydown', e => { if(e.key==='Escape') closeMod(); });

// ── Character search filter ──
document.getElementById('char-search').addEventListener('input', e => {
  filterText = e.target.value.trim();
  renderCharacters(activeEra);
});

// ── Init + scroll reveal ──
renderCharacters();
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
document.querySelectorAll('.ccard,.fcard,.pcard-wrap').forEach((el,i) => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(18px)';
  el.style.transition = `opacity 0.45s ${i*0.04}s ease, transform 0.45s ${i*0.04}s ease, box-shadow 0.18s, border-color 0.18s`;
  obs.observe(el);
});

// ── Back to top ──
const _btt = document.getElementById('back-top');
const _pv  = document.getElementById('corner-vignette');
window.addEventListener('scroll', () => {
  const show = scrollY > 400;
  _btt.classList.toggle('visible', show);
  _pv.classList.toggle('visible', show);
}, { passive: true });
_btt.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
