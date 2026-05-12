# Progreso v1.0 — bitácora

> Plan completo: `~/.claude/plans/tengo-que-ir-pensando-adaptive-shamir.md`
> Decisiones cerradas: 50-60 fichas núcleo, 10 eras, i18n a v2.0, mapa solo conectar/verificar.

## Estado por bloque

### C1 — Definir núcleo y esconder lo demás · **HECHO**
- [x] Auditoría: 117 CHARS, 18 BATTLES, 10 PERIODS en `assets/js/data.js`.
- [x] Distribución actual: rank-1 (13) · rank-2 (48) · rank-3 (56).
- [x] Inventario de tamaño de cada ficha hecho (líneas en cada `*.html`).
- [x] **Subset aprobado**: 61 fichas (13 rank-1 + 48 rank-2) + 15 batallas (12 originales + Wan + Jiangling + Dingjunshan).
- [x] **7 rank-2 con archivo vacío** son cola obligatoria de escritura para C3: Wang Yun, Sima Yan, Chen Gong, Li Ru, Xun You, Yang Hu, Sun Hao.
- [x] Script `to-do/v1-mark-nucleo.js` ejecutado: marcó `v1: true` en 61 fichas + 15 batallas. Idempotente.
- [x] Filtrado `assets/js/ui.js` (`renderCharacters` filtra por `c.v1` antes de era/texto/facción).
- [x] Filtrado `assets/batallas.html` (`BATTLES.filter(b => b.v1).forEach(...)`).
- [x] Verificado: `inline-links.js`, fichas individuales y mapa NO filtran por v1 — los archivos siguen accesibles por URL directa, solo el index/listado principal oculta. Comportamiento intencional.
- **Fuera del núcleo (apéndice, no enlazado desde index)**: 56 fichas rank-3 + 3 batallas (bowangpo, jiameng, shui-yan-qi-jun).

### C2 — Header/footer compartido + Acerca de · **HECHO**
- [x] Creado `assets/js/chrome.js` (inyecta `<nav id="nav">` y `<footer>` consistentes; detecta profundidad del path automáticamente; resalta sección activa con `.on`).
- [x] Index migrado: `<nav>` y `<footer>` hardcoded → `<div id="chrome-nav">` y `<div id="chrome-footer">` + `<script src="assets/js/chrome.js">`.
- [x] Añadido a `main.css`: `.nav-links a.on` (sección activa) y `.foot-link` (Acerca de · Fuentes en footer).
- [x] Creado `acerca.html` con: alcance, fuentes (Luo Guanzhong; Chen Shou *Sanguozhi*; Pei Songzhi; *Historical Atlas of China*), política fan-content educativo no comercial, autoría Alejandro Peyró 2025, convenciones (pinyin, zì, fechas), agradecimientos, cita de cierre.
- [x] El nav perdió "FAQ" y ganó "Acerca de" (FAQ sigue accesible por scroll en index).
- [x] Smoke test: index, acerca, 404, chrome.js, batallas, mapa → todos HTTP 200.
- [x] **Decisión cerrada**: opción B — `chrome.css` aislado (60 líneas) cargado por cada página interna. main.css sigue conteniendo las reglas (duplicación pendiente de limpiar).
- [x] Creado `assets/css/chrome.css` — self-contained: declara su propio `:root` con vars (--ink, --parch, --gold, --nav-h:58px), reglas del #nav, footer, hamburger y media query ≤680px.
- [x] Migrado `assets/batallas.html` al chrome: añadido `<link>` a chrome.css, sustituido `<header id="hdr">` por `<div id="chrome-nav">`, añadido footer + `<script src="../assets/js/chrome.js">` al final. `data-page-section="batallas"`.
- [x] Migrado `assets/mapa.html` al chrome (apilado): chrome encima, `#hdr` del mapa debajo conservando los toggles (州 城 将 ⛶ Full) pero quitando el botón `← Inicio` (redundante). Ajustes en `mapa.css`: `#hdr top:var(--nav-h)`, `#mwrap top:calc(var(--nav-h) + var(--hdr-h))`, `#backbtn top:calc(var(--nav-h) + 78px)`. Sin `chrome-footer` (el mapa es fullscreen-locked, body overflow:hidden).
- [x] **Migración masiva**: script `to-do/v1-migrate-chrome.py` migró las 89 fichas + 18 batallas individuales al chrome. Idempotente, dry-run por defecto (`python to-do/v1-migrate-chrome.py` simula, `--apply` escribe). Cada archivo: `<header id="hdr">…</header>` → `<div id="chrome-nav"></div>`, link a `../css/chrome.css`, script a `../../assets/js/chrome.js` antes de `</body>`, `data-page-section` en `<html>` (`personajes` o `batallas`).
- [x] **Conflicto de variables resuelto**: cada CSS de ficha (cao-cao.css, diao-chan.css...) tiene su propio `:root` con tema cromático del personaje (cao-cao azul, diao-chan rosa, etc.) que define `--gold` y `--border`. chrome.css se carga DESPUÉS, así que su `:root` los pisaba. Solución: chrome.css ahora declara `--gold` y `--border` SCOPEADOS a `#nav, footer` (no a `:root`), preservando el theming de la ficha en su propio contenido.
- [x] **Limpieza de duplicación hecha**: añadido `<link>` a chrome.css en `index.html`, `acerca.html` y `404.html`; retiradas las reglas del chrome de `main.css` (#nav, .nav-*, .hamburger lines 17-36, footer block lines 770-779, @media nav lines 1149-1151). main.css: 1151 → 1113 líneas. `.sec-nav` y `.sec-link` quedan en main.css (no son chrome).

### C3 — Completar fichas núcleo · **HECHO**
- [x] Wang Yun: Relaciones (Diao Chan lg, Dong Zhuo/Li Ru/Lü Bu/Emp.Xian/Jia Xu md) + 4 batallas.
- [x] Chen Gong: Relaciones (Cao Cao era-specific, Lü Bu lg; Zhang Liao/Gao Shun md) + 3 batallas.
- [x] Li Ru: Relaciones (Dong Zhuo lg; Wang Yun/Diao Chan/Lü Bu/Emp.Shao md) + 3 batallas.
- [x] Xun You: Relaciones (Cao Cao lg; Xun Yu/Guo Jia/Yuan Shao md) + 3 batallas.
- [x] Sima Yan: Relaciones (Sima Yi/Shi/Zhao lg; Cao Huan/Yang Hu/Du Yu/Wang Jun/Sun Hao md) + 2 batallas.
- [x] Yang Hu: Relaciones (Sima Yan lg; Lu Kang lg; Du Yu/Wang Jun md) + 3 batallas.
- [x] Sun Hao: Relaciones (Sun Quan lg; Lu Kang/Ding Feng/Yang Hu/Sima Yan/Wang Jun md) + 3 batallas.
- Pendiente: aplicar `/relaciones` a fichas que no tengan rel-bubbles (Zhuge Liang prioridad).

### C4 — Nivelar 15 batallas · **HECHO**
- Las 18 batallas con `complete: true` tienen HTML completo. Los 15 marcados v1 estaban ya completos antes de esta sesión. El archivo de progreso estaba desactualizado.

### C5 — 9 páginas de Era · **HECHO**
- Creado `assets/css/era.css` compartido (variable `--ec` por página).
- 8 nuevas páginas en `assets/Periods/era-{id}.html`: han-tardio, dong-zhuo, guerras-senores, chibi, tres-reinos, guerras-ocaso, sima, jin.
- turbantes-amarillos ya existía (se mantiene con su CSS propio).
- Todos los 9 PERIODS de data.js actualizados con `detailHref`.
- Las tarjetas de era del index ya tenían el botón "Ver cronología →" que usa `detailHref`.

### C6 — Meta/favicon/OG/sitemap · **HECHO**
- [x] **Decisión cerrada**: dominio canónico = `https://jhatadagari-cell.github.io/portal-rotk/` (GH-Pages por defecto). Si después se compra dominio propio, hay que reescribir `SITE` en `to-do/v1-inject-og.py` y `v1-build-sitemap.py` y re-ejecutar.
- [x] **Decisión cerrada**: SEO híbrido. Crawlers sociales (Twitter/Facebook/Slack/Discord) NO ejecutan JS, así que `og:*` y `twitter:*` van **hardcodeados** en cada `<head>`. Lo que sí inyecta chrome.js: `<link rel="icon">`, `<meta theme-color>`, `<link rel="canonical">` (Google los lee post-render).
- [x] Creado `assets/img/favicon.svg` — sello rojo (#8b1a1a) con borde gold y 三 dibujado como tres trazos rectangulares en parch (#f0ddb0). Geometría pura, escala perfecta a cualquier tamaño, no depende de fonts.
- [x] Creado `assets/img/og-default.svg` y `og-default.png` (1200×630) — composición tipográfica con 三國演義 gold gigante, "Romance de los Tres Reinos" en parch, marca de agua 魏蜀吳 sutil al fondo, borde sello, tag "PORTAL DE FANDOM" arriba y "Ocaso del Han · Guerra de los señores · Trípode de tres reinos" abajo. PNG generado con `System.Drawing` + Microsoft YaHei.
- [x] Extendido `chrome.js` con `injectMeta()` que añade favicon SVG, theme-color (#0b0600) y canonical (location.href sin hash/query). Idempotente: solo inyecta si el tag no existe ya.
- [x] Creado `to-do/v1-inject-og.py` — recorre 5 páginas top + 89 fichas + 18 batallas (112 archivos), inserta bloque `<!-- v1-og:start -->...<!-- v1-og:end -->` con og:site_name, og:type (website/article), og:title, og:description, og:url (absoluta), og:image, og:image:width/height, twitter:card=summary_large_image, twitter:title/description/image. Aplicado: 112/112 actualizados. Idempotente (regex sustituye el bloque sentinela). Si una página ya tiene `<meta name="description">` (acerca, 404), respeta la existente y no la duplica.
- [x] Creado `to-do/v1-build-sitemap.py` — tokeniza `assets/js/data.js` respetando strings, extrae los objetos `{...}` raíz de CHARS y BATTLES con `v1: true` y `detailHref`, emite `sitemap.xml` con 73 URLs absolutas (4 top + 54 fichas + 15 batallas). Las 7 fichas pendientes de C3 no entran porque ni tienen archivo ni `detailHref` en data.js — al rellenarlas en C3, basta re-correr el script.
- [x] Creado `robots.txt` (raíz) con `Allow: /` y `Sitemap:` apuntando a la URL absoluta. La 404 lleva ya `<meta name="robots" content="noindex">` desde C7.
- [x] Smoke test: 11/11 endpoints HTTP 200 (index, acerca, 404, batallas, mapa, ficha cao-cao, batalla chibi, sitemap.xml, robots.txt, favicon.svg, og-default.png). Verificado que los `og:*` aparecen en el HTML inicial de cao-cao (no inyectados por JS, los crawlers sí los verán).
- **Nota técnica pendiente**: `404.html` usa paths absolutos `/assets/...` pensados para custom domain. En GH-Pages project pages la URL real es `/portal-rotk/assets/...`. Cuando se publique en GH-Pages habrá que decidir: (a) reescribir 404 a `/portal-rotk/`, (b) configurar redirect en `index.html` que detecte path roto, o (c) comprar dominio (resolvería el problema de raíz). No bloquea v1, pero la 404 actual no funcionará bien en GH-Pages hasta resolverlo.

### C7 — Página 404 · **HECHO**
- [x] `404.html` creada con personalidad: tipografía dramática, citas del Romance ("亂" de fondo, "El cielo amarillo reemplazará al cielo azul"), botones a inicio/mapa/acerca.
- [x] `<meta name="robots" content="noindex">` para que Google no la indexe.
- [x] **Paths absolutos** en CSS, JS y botones — necesario porque la 404 puede dispararse desde cualquier URL inexistente. Si fueran relativos, el browser los resolvería contra el path roto.
- [x] `chrome.js` actualizado: si su `<script src>` empieza con `/`, fija `UP="/"` y los enlaces del nav/footer inyectados también son absolutos.
- [x] **Reescrito** para alinear el estilo visual con el `index.html` (jerarquía hero: número 404 grande en Cinzel + 迷路了 en Noto Serif SC + subtítulo italic + descripción + 2 botones). Eliminados elementos que recordaban a threekingdoms.wiki: 亂 gigante de fondo, cita "El cielo amarillo…" con borduras, botón Acerca redundante.
- [x] Variables CSS y body inline dentro del propio 404.html — garantiza el look oscuro aunque `main.css` no cargue (al abrir desde file:// la ruta absoluta `/assets/css/main.css` no resuelve).

### C8 — Auditoría enlaces + responsive · **HECHO**
- **Sin enlaces rotos**: auditados 144 detailHref de CHARS, 18 de BATTLES, 9 de PERIODS — todos los HTML existen.
- **chrome.js**: todos los href apuntan a archivos existentes (index, acerca, batallas, facciones, mapa).
- **Era pages**: CSS `../css/era.css` + `../css/chrome.css` y scripts `../js/data.js`, `../js/inline-links.js`, `../../assets/js/chrome.js` — rutas verificadas.
- **facciones.html**: paths de CSS y JS correctos.
- **Responsive**: breakpoints verificados en era.css (720px), facciones.css (900px / 640px), chrome.css (680px hamburger). Sin overflow detectado.
- **OG/sitemap actualizados**: `v1-inject-og.py --apply` ejecutado (149 archivos). `v1-build-sitemap.py` actualizado para incluir facciones.html + 9 páginas de era → **112 URLs** en sitemap.xml.
- **Facciones** añadido al sistema central: `assets/js/factions.js` (43 facciones), `assets/facciones.html`, `assets/css/facciones.css`, enlace en chrome.js navbar.

### I1 — 3 páginas de Reino · pendiente
### I2 — Bubbles linkeables · pendiente
### I3 — Glosario · pendiente
### I4 — Filtros batallas · pendiente

## Notas y hallazgos

- Existe ya `assets/js/inline-links.js` (566 líneas) — sistema de keywords clicables en prosa con popup. Reusar para eras, glosario, batallas.
- Skills disponibles: `/ficha`, `/batalla`, `/relaciones`. Usar uniformemente sobre el núcleo.
- El mapa ya tiene `Ver Ficha` button — verificar que apunta a archivos del núcleo.
- Permisos de `cd` proyecto y `Bash(grep *)` añadidos a `.claude/settings.local.json`.

## Estado al cierre de v1 (2026-05-12)

**V1 COMPLETO**: C1, C2, C3, C4, C5, C6, C7, C8 — todos hechos.

**Resumen ejecutivo**:
- 83 fichas de personaje con v1:true (61 del núcleo + fichas añadidas después)
- 18 batallas con HTML completo
- 9 páginas de Era (8 nuevas + turbantes)
- Sistema de facciones central (43 facciones, página con timeline slider)
- Chrome compartido (nav + footer) en todo el sitio
- SEO: favicon, OG/Twitter en 149 páginas, sitemap.xml con 112 URLs, robots.txt
- 404 personalizado

**Pendiente técnico (no bloquea v1)**:
- `404.html` usa paths absolutos `/assets/...` que no funcionan en GH-Pages project pages (`/portal-rotk/...`). Resolver al publicar: comprar dominio custom O reescribir paths a `/portal-rotk/`.

**Próximo: I1–I4** (deseable, no bloqueante):
- I1: 3 páginas de Reino (Wei / Shu Han / Wu) con historia, capital, gobernantes
- I2: Bubbles linkeables en fichas de personaje
- I3: Glosario de términos chinos
- I4: Filtros en página de batallas (por era, por resultado, por facción)

**Recordatorio operativo**: plan original en `~/.claude/plans/tengo-que-ir-pensando-adaptive-shamir.md`.
