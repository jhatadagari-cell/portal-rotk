// annotations.js — motor de anotaciones automáticas. Lee GLOSSARY y CHARS, anota texto al vuelo.
(function () {
  'use strict';

  // ── Tooltip único flotante ──
  const tip = document.createElement('div');
  tip.id = 'ann-tip';
  tip.setAttribute('aria-hidden', 'true');
  document.body.appendChild(tip);

  let hideTimer = null;

  function showTip(anchor, html, color) {
    clearTimeout(hideTimer);
    tip.innerHTML = html;
    tip.style.setProperty('--ann-c', color || 'var(--gold)');
    tip.style.opacity = '1';
    placeTip(anchor);
  }

  function hideTip() {
    hideTimer = setTimeout(() => { tip.style.opacity = '0'; }, 100);
  }

  function placeTip(anchor) {
    const r  = anchor.getBoundingClientRect();
    const tw = 260;
    const th = tip.offsetHeight || 80;
    let x = r.left;
    let y = r.top - th - 10;
    if (x + tw > window.innerWidth - 12) x = window.innerWidth - tw - 12;
    if (x < 6) x = 6;
    if (y < 8)  y = r.bottom + 8;
    tip.style.left = x + 'px';
    tip.style.top  = y + 'px';
  }

  // ── Construir lista de entradas (GLOSSARY + CHARS) ──
  function buildEntries() {
    const entries = [];

    if (typeof GLOSSARY !== 'undefined') {
      GLOSSARY.forEach((g, i) => {
        g.terms.forEach(t => entries.push({ pattern: t, type: 'gloss', idx: i, color: 'var(--gold)' }));
      });
    }

    if (typeof CHARS !== 'undefined') {
      CHARS.forEach((c, i) => {
        // Solo nombres completos de ≥2 palabras para evitar falsos positivos
        if (c.en && c.en.split(' ').length >= 2) {
          entries.push({ pattern: c.en, type: 'char', idx: i, color: c.fc || 'var(--gold)' });
        }
        if (c.zh && c.zh.length >= 2) {
          entries.push({ pattern: c.zh, type: 'char', idx: i, color: c.fc || 'var(--gold)' });
        }
        if (c.aliases) {
          c.aliases.forEach(a => {
            if (a.split(' ').length >= 2) entries.push({ pattern: a, type: 'char', idx: i, color: c.fc || 'var(--gold)' });
          });
        }
      });
    }

    // Términos más largos primero — evita que "fang" coincida antes que "Huang Gai"
    entries.sort((a, b) => b.pattern.length - a.pattern.length);
    return entries;
  }

  function buildHtml(entry) {
    if (entry.type === 'gloss') {
      const g = GLOSSARY[entry.idx];
      return `<div class="ann-tip-label">${g.terms[0]}</div><div class="ann-tip-def">${g.def}</div>`;
    }
    const c = CHARS[entry.idx];
    return `<div class="ann-tip-char-hd">
        <span class="ann-tip-zh" style="color:${c.fc || 'var(--gold)'}">${c.zh}</span>
        <span class="ann-tip-en">${c.en}</span>
      </div>
      <div class="ann-tip-def">${(c.bio || '').slice(0, 110)}${c.bio && c.bio.length > 110 ? '…' : ''}</div>`;
  }

  // ── API pública ──
  window.applyAnnotations = function (container) {
    const entries = buildEntries();
    if (!entries.length) return;

    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Separar términos latinos (con \b) y CJK (sin frontera de palabra)
    const latin = entries.filter(e => /[a-zA-ZÀ-ÿ]/.test(e.pattern));
    const cjk   = entries.filter(e => /[一-鿿㐀-䶿]/.test(e.pattern));

    const parts = [];
    if (latin.length) parts.push(`(?:\\b(?:${latin.map(e => esc(e.pattern)).join('|')})\\b)`);
    if (cjk.length)   parts.push(`(?:${cjk.map(e => esc(e.pattern)).join('|')})`);
    if (!parts.length) return;

    const regex = new RegExp(parts.join('|'), 'gi');

    // Mapa lookup: texto en minúsculas → entrada
    const map = new Map();
    entries.forEach(e => {
      const key = e.pattern.toLowerCase();
      if (!map.has(key)) map.set(key, e); // el más largo ya está primero
    });

    // Solo anotar texto de eventos, no cabeceras ni paneles de personaje
    const targets = container.querySelectorAll('.reader-ev-body, .reader-ev-d, .erd-ev-d, .cronica-body');

    targets.forEach(target => {
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
        acceptNode: n =>
          n.parentElement.closest('.ann-term')
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT,
      });

      const nodes = [];
      let n;
      while ((n = walker.nextNode())) nodes.push(n);

      nodes.forEach(textNode => {
        const text = textNode.nodeValue;
        const matches = [...text.matchAll(regex)];
        if (!matches.length) return;

        const frag = document.createDocumentFragment();
        let last = 0;

        for (const m of matches) {
          const entry = map.get(m[0].toLowerCase());
          if (!entry) continue;

          if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));

          const span = document.createElement('span');
          span.className = 'ann-term';
          span.style.setProperty('--ann-c', entry.color);
          span.textContent = m[0];
          span.addEventListener('mouseenter', () => showTip(span, buildHtml(entry), entry.color));
          span.addEventListener('mouseleave', hideTip);

          if (entry.type === 'char') {
            const c = CHARS[entry.idx];
            if (c.detailHref || c.bio) {
              span.classList.add('ann-term--link');
              span.addEventListener('click', ev => {
                ev.stopPropagation();
                hideTip();
                if (typeof openChar === 'function') openChar(entry.idx);
              });
            }
          }

          frag.appendChild(span);
          last = m.index + m[0].length;
        }

        if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
        textNode.parentNode.replaceChild(frag, textNode);
      });
    });
  };
})();
