(function () {
  'use strict';

  function init() {
    if (typeof CHARS === 'undefined') return;

    const pagePath = location.pathname.split('/').filter(Boolean).pop() || '';
    const char = CHARS.find(c => c.detailHref && c.detailHref.split('/').pop() === pagePath);
    if (!char) return;

    const periodEntry = char.stats && char.stats.find(s => s[0] === 'Período');
    const period = periodEntry ? periodEntry[1] : null;

    let facLabel = char.fac || null;
    let facColor = char.fc || '#c9a84c';
    if (typeof FACTIONS !== 'undefined' && facLabel) {
      const f = FACTIONS.find(fac => [].concat(fac.fac).includes(facLabel));
      if (f) facColor = f.color;
    }

    if (!facLabel && !period) return;

    // Inject below the "Ficha" eyebrow in the hero section
    const eyebrow = document.querySelector('.hero-copy .eyebrow');
    if (!eyebrow) return;

    const meta = document.createElement('div');
    meta.className = 'char-meta';

    if (facLabel) {
      const facEl = document.createElement('span');
      facEl.className = 'cm-fac';
      facEl.style.color = facColor;
      facEl.style.borderColor = facColor;
      facEl.textContent = facLabel;
      meta.appendChild(facEl);
    }

    if (facLabel && period) {
      const sep = document.createElement('span');
      sep.className = 'cm-sep';
      sep.setAttribute('aria-hidden', 'true');
      meta.appendChild(sep);
    }

    if (period) {
      const perEl = document.createElement('span');
      perEl.className = 'cm-period';
      perEl.textContent = period;
      meta.appendChild(perEl);
    }

    // Tighten eyebrow gap so meta reads as part of the same block
    eyebrow.style.marginBottom = '8px';
    eyebrow.after(meta);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
