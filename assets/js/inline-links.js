// ═══════════════════════════════════════════════════════════════════════════
// Portal ROTK — Sistema de Inline Links Centralizado
// Detecta keywords (nombres de personajes y facciones) en las fichas y las
// hace clicables. Opens popup cards con bio, stats, link a ficha completa.
// ═══════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────
// FACTION_DATA — Datos centralizados de facciones (editable aquí)
// ─────────────────────────────────────────────────────────────────────────

const FACTION_DATA = [
  {
    keywords: ["Wei 魏", "Wei"],
    zh: "魏",
    ico: "🦅",
    fc: "#1e5abf",
    fcbg: "rgba(30,90,191,.12)",
    fac: "Reino del Norte",
    bio: "El reino septentrional fundado por Cao Cao y oficializado por Cao Pi en 220 d.C. La potencia más grande de los Tres Reinos por extensión, ejército y economía. Capital: Ye.",
    stats: [
      ["Capital", "Ye / Luoyang"],
      ["Color", "Azul imperial"],
      ["Fundador", "Cao Cao / Cao Pi"],
      ["Período", "220–265 d.C."],
    ],
    href: "../../index.html",
  },
  {
    keywords: ["Shu Han 蜀漢", "Shu Han", "Shu"],
    zh: "蜀",
    ico: "🌿",
    fc: "#1e8a2e",
    fcbg: "rgba(30,138,46,.12)",
    fac: "Han Restaurado",
    bio: "El reino del suroeste fundado por Liu Bei en 221 d.C., proclamado heredero legítimo de la Dinastía Han. El más pequeño de los tres reinos pero el más rico en héroes legendarios. Capital: Chengdu.",
    stats: [
      ["Capital", "Chengdu 成都"],
      ["Color", "Verde Han"],
      ["Fundador", "Liu Bei"],
      ["Período", "221–263 d.C."],
    ],
    href: "../../index.html",
  },
  {
    keywords: ["Wu 吳", "Wu Oriental", "Wu"],
    zh: "吳",
    ico: "🟢",
    fc: "#bf2020",
    fcbg: "rgba(191,32,32,.12)",
    fac: "Señores del Sur",
    bio: "El reino del sureste controlado por la dinastía Sun. Dominaba el Yangtzé y las tierras más ricas de Jiangdong. El más longevo de los tres reinos y cultural más sofisticado. Capital: Jianye.",
    stats: [
      ["Capital", "Jianye 建業"],
      ["Color", "Rojo Wu"],
      ["Fundador", "Sun Ce / Sun Quan"],
      ["Período", "229–280 d.C."],
    ],
    href: "../../index.html",
  },
  {
    keywords: ["Turbantes Amarillos", "Turbantes"],
    zh: "黃巾",
    ico: "🟡",
    fc: "#b87e10",
    fcbg: "rgba(184,126,16,.12)",
    fac: "Camino de la Paz",
    bio: "El movimiento rebelde liderado por los tres hermanos Zhang: Zhang Jiao, Zhang Liang y Zhang Bao. Su Rebelión de los Turbantes Amarillos en 184 d.C. fracturó la Dinastía Han y abrió la puerta a la era de los Tres Reinos.",
    stats: [
      ["Lema", "El Cielo Amarillo se alza"],
      ["Líder", "Zhang Jiao"],
      ["Año", "184 d.C."],
      ["Resultado", "Colapso del Han"],
    ],
    href: "../../index.html",
  },
  {
    keywords: ["Jin 晉", "Dinastía Jin", "Jin"],
    zh: "晉",
    ico: "🐺",
    fc: "#8820b0",
    fcbg: "rgba(136,32,176,.12)",
    fac: "Sucesores de Wei",
    bio: "La Dinastía Jin fundada por Sima Yan en 265 d.C., heredera oficial de Wei tras el golpe Sima. Reunificó China brevemente en 280 d.C. al absorber a Wu, poniendo fin a la era de los Tres Reinos.",
    stats: [
      ["Capital", "Luoyang"],
      ["Fundador", "Sima Yan"],
      ["Período", "265–316 d.C."],
      ["Logro", "Reunificación de China"],
    ],
    href: "../../index.html",
  },
];

// ─────────────────────────────────────────────────────────────────────────
// CSS — Inyectado dinámicamente como <style> tag
// ─────────────────────────────────────────────────────────────────────────

const IL_CSS = `
/* ── Inline link span ── */
.ilink {
  display: inline;
  text-decoration: none;
  border-radius: 1px;
  transition: opacity 0.15s, background 0.15s;
}
.ilink:hover {
  opacity: 0.82;
  background: rgba(255, 255, 255, 0.06);
}

/* ── Overlay ── */
#ilmod {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.88);
  z-index: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.22s;
}
#ilmod.il-open {
  opacity: 1;
  pointer-events: all;
}

/* ── Card box ── */
.ilmod-box {
  background: #06080d;
  border: 1px solid;
  border-radius: 4px;
  max-width: 460px;
  width: 100%;
  padding: 22px;
  position: relative;
  max-height: 90vh;
  overflow-y: auto;
  transform: translateY(16px);
  transition: transform 0.22s;
  box-shadow: 0 0 60px rgba(0, 0, 0, 0.7);
  font-family: 'Noto Sans SC', sans-serif;
}
#ilmod.il-open .ilmod-box {
  transform: translateY(0);
}

/* ── Close button ── */
.ilmod-x {
  position: absolute;
  top: 9px;
  right: 11px;
  background: none;
  border: none;
  color: #c9a84c;
  font-size: 21px;
  cursor: pointer;
  opacity: 0.48;
  transition: opacity 0.18s;
  line-height: 1;
  padding: 0;
}
.ilmod-x:hover { opacity: 1; }

/* ── Header ── */
.ilmod-hd {
  display: flex;
  align-items: center;
  gap: 13px;
  margin-bottom: 11px;
}
.ilmod-ico {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  border: 2px solid;
  flex-shrink: 0;
}
.ilmod-zh {
  font-family: 'Noto Serif SC', serif;
  font-size: 21px;
  font-weight: 700;
}
.ilmod-en {
  font-family: 'Cinzel Decorative', serif;
  font-size: 12px;
  color: #c9a84c;
  opacity: 0.6;
  letter-spacing: 0.12em;
  margin-top: 2px;
}
.ilmod-zi {
  font-family: 'IM Fell English', serif;
  font-style: italic;
  font-size: 17px;
  color: #d4b870;
  opacity: 0.62;
}

/* ── Faction badge ── */
.ilmod-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 2px;
  font-family: 'Noto Sans SC', sans-serif;
  font-size: 12px;
  margin-bottom: 11px;
  border: 1px solid;
}

/* ── Bio ── */
.ilmod-bio {
  font-family: 'IM Fell English', serif;
  font-size: 18px;
  line-height: 1.78;
  color: #d4b870;
  border-top: 1px solid rgba(201, 168, 76, 0.1);
  padding-top: 10px;
  margin-bottom: 0;
}

/* ── Stats grid ── */
.ilmod-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px;
  margin-top: 11px;
}
.ilmod-stat {
  background: rgba(255, 255, 255, 0.024);
  border: 1px solid rgba(201, 168, 76, 0.09);
  padding: 6px 8px;
  border-radius: 2px;
}
.ilmod-sl {
  font-size: 10px;
  color: #c9a84c;
  opacity: 0.5;
  font-family: 'Noto Sans SC', sans-serif;
}
.ilmod-sv {
  font-size: 17px;
  color: #f0ddb0;
  font-family: 'Noto Serif SC', serif;
  margin-top: 1px;
}

/* ── Detail button ── */
.ilmod-detail-btn {
  display: block;
  width: 100%;
  margin-top: 14px;
  padding: 11px 16px;
  font-family: 'Cinzel Decorative', serif;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-align: center;
  color: #c9a84c;
  background: transparent;
  border: 1px solid rgba(201, 168, 76, 0.3);
  border-radius: 2px;
  text-decoration: none;
  transition: background 0.22s, border-color 0.22s;
  box-sizing: border-box;
  cursor: pointer;
}
.ilmod-detail-btn:hover:not([disabled]) {
  background: rgba(201, 168, 76, 0.06);
  border-color: rgba(201, 168, 76, 0.5);
}
.ilmod-detail-btn[disabled] {
  cursor: not-allowed;
  opacity: 0.45;
}

/* ── Mobile ── */
@media (max-width: 520px) {
  .ilmod-box { padding: 16px; }
  .ilmod-stats { grid-template-columns: 1fr; }
  .ilmod-bio { font-size: 16px; }
}
`;

// ─────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────

function resolveHref(detailHref) {
  if (!detailHref) return null;
  return "../../" + detailHref;
}

function injectModal() {
  const div = document.createElement("div");
  div.id = "ilmod";
  div.innerHTML = `
    <div class="ilmod-box" id="ilmod-box">
      <button class="ilmod-x" id="ilmod-x">✕</button>
      <div id="ilmod-inner"></div>
    </div>`;
  document.body.appendChild(div);

  document.getElementById("ilmod").addEventListener("click", (e) => {
    if (e.target.id === "ilmod") closeIlmod();
  });
  document.getElementById("ilmod-x").addEventListener("click", closeIlmod);
}

function injectCSS() {
  const style = document.createElement("style");
  style.textContent = IL_CSS;
  document.head.appendChild(style);
}

function closeIlmod() {
  document.getElementById("ilmod").classList.remove("il-open");
}

function openIlmod(data) {
  const box = document.getElementById("ilmod-box");
  box.style.borderColor = data.fc;
  document.getElementById("ilmod-inner").innerHTML = buildModalHTML(data);
  document.getElementById("ilmod").classList.add("il-open");
}

function getSelfName() {
  const h1 = document.querySelector("h1.title");
  if (!h1) return null;
  const raw = h1.textContent.trim();
  return raw.split("·")[0].trim();
}

function buildKeywordMap(selfName) {
  const kmap = new Map();

  // Añadir todos los personajes menos el de la página actual
  CHARS.forEach((c, i) => {
    if (c.en !== selfName) {
      kmap.set(c.en, { type: "char", idx: i, fc: c.fc });
    }
  });

  // Añadir todas las facciones
  FACTION_DATA.forEach((f) => {
    f.keywords.forEach((kw) => {
      if (kw === selfName) return;
      kmap.set(kw, { type: "faction", data: f, fc: f.fc });
    });
  });

  return kmap;
}

function buildSortedKeywords(kmap) {
  return [...kmap.keys()].sort((a, b) => b.length - a.length);
}

function buildCharData(c) {
  const href = resolveHref(c.detailHref);
  return {
    fc: c.fc,
    fcbg: c.fcbg,
    ico: c.ico,
    zh: c.zh,
    en: c.en,
    zi: c.zi,
    fac: c.fac,
    bio: c.bio,
    stats: c.stats,
    href,
    btnLabel: `Ver ficha completa · ${c.en}`,
  };
}

function buildFactionData(f) {
  return {
    fc: f.fc,
    fcbg: f.fcbg,
    ico: f.ico,
    zh: f.zh,
    en: f.fac,
    zi: "",
    fac: f.fac,
    bio: f.bio,
    stats: f.stats,
    href: f.href,
    btnLabel: `Ver más`,
  };
}

function buildModalHTML(d) {
  return `
    <div class="ilmod-hd">
      <div class="ilmod-ico" style="border-color:${d.fc};background:${d.fcbg}">${d.ico}</div>
      <div>
        <div class="ilmod-zh" style="color:${d.fc}">${d.zh}</div>
        <div class="ilmod-en">${d.en}</div>
        ${d.zi ? `<div class="ilmod-zi">${d.zi}</div>` : ""}
      </div>
    </div>
    <div class="ilmod-badge" style="border-color:${d.fc};background:${d.fcbg};color:${d.fc}">${d.fac}</div>
    <div class="ilmod-bio">${d.bio}</div>
    <div class="ilmod-stats">
      ${d.stats
        .map(
          (s) => `
        <div class="ilmod-stat">
          <div class="ilmod-sl">${s[0]}</div>
          <div class="ilmod-sv">${s[1]}</div>
        </div>`,
        )
        .join("")}
    </div>
    ${
      d.href
        ? `<a class="ilmod-detail-btn" href="${d.href}">${d.btnLabel}</a>`
        : `<button class="ilmod-detail-btn" disabled>Ver ficha · Próximamente</button>`
    }`;
}

// ─────────────────────────────────────────────────────────────────────────
// TreeWalker — Procesa nodos de texto para insertar spans .ilink
// ─────────────────────────────────────────────────────────────────────────

const TARGET_SELECTORS = [
  ".lede",
  ".intro p",
  ".era-card p",
  ".epilogue p",
  ".rel-name",
  ".rel-desc",
  ".t-desc",
  ".char-txt",
];

function processTextNodes(kmap, sortedKeywords) {
  const containers = TARGET_SELECTORS.flatMap((sel) => [
    ...document.querySelectorAll(sel),
  ]);

  const escaped = sortedKeywords.map((kw) =>
    kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  const pattern = new RegExp(
    `(?<![\\w\\u00C0-\\u024F])(?:${escaped.join("|")})(?![\\w\\u00C0-\\u024F])`,
    "gu",
  );

  containers.forEach((container) => {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.classList.contains("ilink")) return NodeFilter.FILTER_REJECT;
        // Excluir h1 y blockquote.hero-quote
        if (parent.tagName === "H1") return NodeFilter.FILTER_REJECT;
        if (parent.closest("h1")) return NodeFilter.FILTER_REJECT;
        if (parent.closest("blockquote.hero-quote")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) textNodes.push(node);

    textNodes.forEach((textNode) => {
      const text = textNode.nodeValue;
      pattern.lastIndex = 0;

      const frag = document.createDocumentFragment();
      let lastIdx = 0;
      let match;

      while ((match = pattern.exec(text)) !== null) {
        const keyword = match[0];
        const startIdx = match.index;

        if (startIdx > lastIdx) {
          frag.appendChild(
            document.createTextNode(text.slice(lastIdx, startIdx)),
          );
        }

        const entry = kmap.get(keyword);
        if (!entry) return;  // Saltar si no está en el mapa

        const span = document.createElement("span");
        span.className = "ilink";
        span.textContent = keyword;
        span.style.cssText = `color:${entry.fc};cursor:pointer`;

        if (entry.type === "char") {
          span.dataset.type = "char";
          span.dataset.idx = entry.idx;
        } else {
          span.dataset.type = "faction";
          span.dataset.fkey = entry.data.keywords[0];
        }

        frag.appendChild(span);
        lastIdx = startIdx + keyword.length;
      }

      if (lastIdx < text.length) {
        frag.appendChild(document.createTextNode(text.slice(lastIdx)));
      }

      textNode.parentNode.replaceChild(frag, textNode);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Event Delegation
// ─────────────────────────────────────────────────────────────────────────

function wireClickHandler(kmap) {
  const factionByKey = new Map();
  FACTION_DATA.forEach((f) => factionByKey.set(f.keywords[0], f));

  document.addEventListener("click", (e) => {
    const span = e.target.closest(".ilink");
    if (!span) return;
    e.stopPropagation();

    if (span.dataset.type === "char") {
      const c = CHARS[parseInt(span.dataset.idx)];
      openIlmod(buildCharData(c));
    } else if (span.dataset.type === "faction") {
      const f = factionByKey.get(span.dataset.fkey);
      openIlmod(buildFactionData(f));
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeIlmod();
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Entry Point
// ─────────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  if (typeof CHARS === "undefined") return;

  injectModal();
  injectCSS();

  const selfName = getSelfName();
  const kmap = buildKeywordMap(selfName);
  const sortedKeywords = buildSortedKeywords(kmap);

  if (sortedKeywords.length === 0) return;

  processTextNodes(kmap, sortedKeywords);
  wireClickHandler(kmap);
});
