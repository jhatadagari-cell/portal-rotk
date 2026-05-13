(function () {
  'use strict';

  function init() {
    if (typeof CHARS === 'undefined') return;

    // Match current page to a character via detailHref
    const pagePath = location.pathname.split('/').filter(Boolean).pop() || '';
    const char = CHARS.find(c => c.detailHref && c.detailHref.split('/').pop() === pagePath);
    if (!char) return;

    // Period string from stats (e.g. "155–220 d.C.")
    const periodEntry = char.stats && char.stats.find(s => s[0] === 'Período');
    const period = periodEntry ? periodEntry[1] : null;

    // Faction: prefer FACTIONS lookup for centralized color, fall back to c.fc
    let facLabel = char.fac || null;
    let facColor = char.fc || '#c9a84c';
    if (typeof FACTIONS !== 'undefined' && facLabel) {
      const f = FACTIONS.find(fac => [].concat(fac.fac).includes(facLabel));
      if (f) facColor = f.color;
    }

    if (!facLabel && !period) return;

    const banner = document.querySelector('.char-banner');
    if (!banner) return;

    const meta = document.createElement('div');
    meta.className = 'char-banner-meta';

    if (facLabel) {
      const facEl = document.createElement('span');
      facEl.className = 'cbm-fac';
      facEl.style.color = facColor;
      facEl.textContent = facLabel;
      meta.appendChild(facEl);
    }

    if (facLabel && period) {
      const sep = document.createElement('span');
      sep.className = 'cbm-sep';
      sep.setAttribute('aria-hidden', 'true');
      meta.appendChild(sep);
    }

    if (period) {
      const perEl = document.createElement('span');
      perEl.className = 'cbm-period';
      perEl.textContent = period;
      meta.appendChild(perEl);
    }

    // Insert before the last banner rule (bottom ornamental line)
    const rules = banner.querySelectorAll('.char-banner-rule');
    const lastRule = rules[rules.length - 1];
    if (lastRule) banner.insertBefore(meta, lastRule);
    else banner.appendChild(meta);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
