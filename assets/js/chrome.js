/**
 * chrome.js — header (nav) y footer compartidos.
 *
 * Cómo se usa en una página:
 *   <div id="chrome-nav"></div>      <!-- en lugar del <nav id="nav"> hardcoded -->
 *   ...
 *   <div id="chrome-footer"></div>   <!-- en lugar del <footer> hardcoded -->
 *   <script src="{ruta}/assets/js/chrome.js"></script>
 *
 * Detecta automáticamente la profundidad del path y construye enlaces
 * relativos correctos para que funcione desde / (index), /assets/ y
 * /assets/Periods/, /assets/Battles/, /era/, /reino/, etc.
 *
 * Para destacar la sección activa en el nav, opcionalmente se puede declarar
 * en el <html>: <html data-page-section="batallas"> (o personajes / eras /
 * reinos / mapa / acerca / home). Si no, se infiere de la URL.
 */
(function () {
  'use strict';

  // ── Construcción de paths relativos ──────────────────────────────────
  // location.pathname puede ser /Portal-ROTK/ (subdir GH-Pages) o /
  // Calculamos cuántos directorios hay que subir para llegar a la raíz.
  // Heurística: asumimos que el index.html vive en la raíz del sitio.
  // Profundidad = nº de segmentos significativos del path después de la raíz.
  function rootRel() {
    // Inspecciona el src de chrome.js para deducir cómo subir a la raíz del
    // sitio. Tres casos:
    //   /assets/js/chrome.js    → src absoluto → UP = "/"   (404, casos
    //                                                        donde la URL
    //                                                        actual puede
    //                                                        no existir)
    //   ../assets/js/chrome.js  → tantos "../" como tenga el src
    //   assets/js/chrome.js     → relativo al directorio actual → UP = ""
    const scripts = document.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
      const src = scripts[i].getAttribute('src') || '';
      if (src.endsWith('chrome.js')) {
        if (src.startsWith('/')) return '/';
        const upMatch = src.match(/^(\.\.\/)+/);
        return upMatch ? upMatch[0] : '';
      }
    }
    return '';
  }
  const UP = rootRel();
  const href = (target) => {
    if (!target) return '#';
    if (target.startsWith('http')) return target;
    if (target.startsWith('#')) return UP + 'index.html' + target;
    return UP + target;
  };

  // ── Sección activa ───────────────────────────────────────────────────
  function activeSection() {
    const declared = document.documentElement.getAttribute('data-page-section');
    if (declared) return declared;
    const p = location.pathname;
    if (/(?:^|\/)index\.html$/.test(p) || p.endsWith('/')) return 'home';
    if (/periodos\.html$/.test(p)) return 'eras';
    if (/personajes\.html$/.test(p)) return 'personajes';
    if (/reinos\.html$/.test(p)) return 'reinos';
    if (/facciones\.html$/.test(p)) return 'facciones';
    if (/batallas\.html$/.test(p)) return 'batallas';
    if (/mapa\.html$/.test(p)) return 'mapa';
    if (/\/Periods\//.test(p)) return 'personajes';
    if (/\/Battles\//.test(p)) return 'batallas';
    if (/\/era\//.test(p) || /era-/.test(p)) return 'eras';
    if (/\/reino\//.test(p)) return 'reinos';
    if (/acerca\.html$/.test(p)) return 'acerca';
    if (/glosario\.html$/.test(p)) return 'glosario';
    if (/404\.html$/.test(p)) return '404';
    return null;
  }
  const ACTIVE = activeSection();
  const isOn = (s) => ACTIVE === s ? ' class="on"' : '';

  // ── Plantillas ───────────────────────────────────────────────────────
  function navHTML() {
    return `
<nav id="nav">
  <a class="nav-brand" href="${href('index.html')}">
    <span class="nav-zh">三國演義</span>
    <span class="nav-en">Romance de los Tres Reinos</span>
  </a>
  <ul class="nav-links" id="nav-links">
    <li><a href="${href('periodos.html')}"${isOn('eras')}>Eras</a></li>
    <li><a href="${href('personajes.html')}"${isOn('personajes')}>Personajes</a></li>
    <li><a href="${href('reinos.html')}"${isOn('reinos')}>Reinos</a></li>
    <li><a href="${href('assets/facciones.html')}"${isOn('facciones')}>Facciones</a></li>
    <li><a href="${href('assets/batallas.html')}"${isOn('batallas')}>Batallas</a></li>
    <li><a href="${href('assets/mapa.html')}"${isOn('mapa')}>Mapa</a></li>
  </ul>
  <button class="hamburger" aria-label="Menú">
    <span></span><span></span><span></span>
  </button>
</nav>`.trim();
  }

  function footerHTML() {
    const year = new Date().getFullYear();
    return `
<footer>
  <div class="foot-body">
    <div class="foot-brand">
      <span class="foot-zh">三國演義</span>
      <span class="foot-en">Romance de los Tres Reinos · Portal de Fandom</span>
    </div>
    <div class="foot-credit">
      <span class="foot-copy">Portal no oficial de fandom · ${year}</span>
      <a class="foot-link" href="${href('acerca.html')}">Acerca de · Fuentes</a>
      <span class="foot-author">Alejandro Peyró</span>
    </div>
  </div>
</footer>`.trim();
  }

  // ── Meta tags compartidos ───────────────────────────────────────────
  // Inyectamos solo lo que Google y los browsers procesan post-render:
  //   favicon, theme-color, canonical.
  // Los og:* / twitter:* van hardcodeados en cada <head> (los crawlers
  // sociales no ejecutan JS).
  function ensureMeta(selector, build) {
    if (document.head.querySelector(selector)) return;
    const el = build();
    document.head.appendChild(el);
  }
  function injectMeta() {
    ensureMeta('link[rel="icon"]', () => {
      const l = document.createElement('link');
      l.rel = 'icon'; l.type = 'image/svg+xml';
      l.href = href('assets/img/favicon.svg');
      return l;
    });
    ensureMeta('meta[name="theme-color"]', () => {
      const m = document.createElement('meta');
      m.name = 'theme-color'; m.content = '#0b0600';
      return m;
    });
    ensureMeta('link[rel="canonical"]', () => {
      const l = document.createElement('link');
      l.rel = 'canonical';
      // location.href ya es absoluto; le quitamos hash/query para canónica limpia.
      const u = new URL(location.href);
      u.hash = ''; u.search = '';
      l.href = u.toString();
      return l;
    });
  }

  // ── Back to top ──────────────────────────────────────────────────────
  function mountBackToTop() {
    if (!document.getElementById('back-top')) {
      const vign = document.createElement('div');
      vign.id = 'corner-vignette';
      document.body.appendChild(vign);

      const btn = document.createElement('button');
      btn.id = 'back-top';
      btn.setAttribute('aria-label', 'Volver arriba');
      btn.innerHTML = '<span>↑</span>';
      document.body.appendChild(btn);
    }

    const btt = document.getElementById('back-top');
    const pv  = document.getElementById('corner-vignette');

    window.addEventListener('scroll', () => {
      const show = window.scrollY > 400;
      btt.classList.toggle('visible', show);
      if (pv) pv.classList.toggle('visible', show);
    }, { passive: true });

    btt.addEventListener('click', () => {
      const anchor = document.getElementById('periods') ?? document.getElementById('page-hero') ?? document.body;
      anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // ── Inyección ────────────────────────────────────────────────────────
  function mount() {
    injectMeta();
    const navMount = document.getElementById('chrome-nav');
    if (navMount) navMount.outerHTML = navHTML();
    const footMount = document.getElementById('chrome-footer');
    if (footMount) footMount.outerHTML = footerHTML();

    // Enganchar el hamburger (DOM ya reemplazado).
    const hb = document.querySelector('#nav .hamburger');
    const links = document.getElementById('nav-links');
    if (hb && links) {
      hb.addEventListener('click', () => links.classList.toggle('open'));
      links.addEventListener('click', e => {
        if (e.target.tagName === 'A') links.classList.remove('open');
      });
    }

    mountBackToTop();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
