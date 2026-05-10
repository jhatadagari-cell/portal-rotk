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

### C3 — Completar fichas núcleo · pendiente
- 7 fichas con archivo vacío (Wang Yun, Sima Yan, Chen Gong, Li Ru, Xun You, Yang Hu, Sun Hao) son la primera prioridad: usar `/ficha`.
- Después: aplicar `/relaciones` a las que no tengan rel-bubbles (Zhuge Liang prioridad).
- Mínimo aceptable: 3 secciones presentes + 5-10 bubbles + lista batallas vinculadas.

### C4 — Nivelar 15 batallas · pendiente
- Ya sólidas (7): chibi, guandu, huang-jin, xiapi, si-shui-hu-lao, yiling, hefei.
- Por nivelar (8): wan, changban, tong-pass, jiangling, dingjunshan, mai-cheng, jieting, wuzhang.

### C5 — 10 páginas de Era · pendiente
- Reusar `assets/js/inline-links.js` (ya existe) para keywords clicables.
- Eras: han-tardio, turbantes, dong-zhuo, guerras-senores, consolidacion-norte, chibi, guerras-ocaso, tres-reinos, ascenso-sima, unificacion-jin.
- 800-1500 palabras de prosa narrativa cada una.

### C6 — Meta/favicon/OG/sitemap · pendiente
- Pensar si chrome.js inyecta los meta tags por `data-page-*` attrs, o si cada página los hardcodea (mejor para SEO).
- Diseñar favicon (sello "三" o carácter chino estilizado).
- og-default por tipo: ficha, batalla, era, reino.

### C7 — Página 404 · **HECHO**
- [x] `404.html` creada con personalidad: tipografía dramática, citas del Romance ("亂" de fondo, "El cielo amarillo reemplazará al cielo azul"), botones a inicio/mapa/acerca.
- [x] `<meta name="robots" content="noindex">` para que Google no la indexe.
- [x] **Paths absolutos** en CSS, JS y botones — necesario porque la 404 puede dispararse desde cualquier URL inexistente. Si fueran relativos, el browser los resolvería contra el path roto.
- [x] `chrome.js` actualizado: si su `<script src>` empieza con `/`, fija `UP="/"` y los enlaces del nav/footer inyectados también son absolutos.
- [x] **Reescrito** para alinear el estilo visual con el `index.html` (jerarquía hero: número 404 grande en Cinzel + 迷路了 en Noto Serif SC + subtítulo italic + descripción + 2 botones). Eliminados elementos que recordaban a threekingdoms.wiki: 亂 gigante de fondo, cita "El cielo amarillo…" con borduras, botón Acerca redundante.
- [x] Variables CSS y body inline dentro del propio 404.html — garantiza el look oscuro aunque `main.css` no cargue (al abrir desde file:// la ruta absoluta `/assets/css/main.css` no resuelve).

### C8 — Auditoría enlaces + responsive · pendiente
### I1 — 3 páginas de Reino · pendiente
### I2 — Bubbles linkeables · pendiente
### I3 — Glosario · pendiente
### I4 — Filtros batallas · pendiente

## Notas y hallazgos

- Existe ya `assets/js/inline-links.js` (566 líneas) — sistema de keywords clicables en prosa con popup. Reusar para eras, glosario, batallas.
- Skills disponibles: `/ficha`, `/batalla`, `/relaciones`. Usar uniformemente sobre el núcleo.
- El mapa ya tiene `Ver Ficha` button — verificar que apunta a archivos del núcleo.
- Permisos de `cd` proyecto y `Bash(grep *)` añadidos a `.claude/settings.local.json`.

## Próximo paso al retomar

**Estado al cierre de esta sesión** (2026-05-10): **C1, C2 y C7 hechos**. CNAME `threekingdoms.wiki` borrado (era de otra web ajena). Chrome compartido ya en index, acerca, 404, batallas.html, mapa.html, las 89 fichas y las 18 batallas individuales. Vars en chrome.css scopeadas a `#nav, footer` para preservar el theming cromático de cada ficha.

**Por hacer en orden**:

1. **C6** (meta tags + favicon + OG + sitemap.xml + robots.txt). Diseñar favicon (sello "三" o carácter chino estilizado). Pensar si chrome.js inyecta los meta tags por `data-page-*` attrs, o si cada página los hardcodea (mejor para SEO).
2. **C3** (escribir las 7 fichas vacías: Wang Yun, Sima Yan, Chen Gong, Li Ru, Xun You, Yang Hu, Sun Hao) y nivelar relaciones (Zhuge Liang prioridad). Usar la skill `/ficha`.
3. **C4** (nivelar 8 batallas: wan, changban, tong-pass, jiangling, dingjunshan, mai-cheng, jieting, wuzhang). Usar la skill `/batalla`.
4. **C5** (10 páginas de Era con prosa narrativa, 800-1500 palabras cada una). Reusar `inline-links.js` para keywords clicables.
5. **C8** (auditoría de enlaces + responsive en todo) e **I1–I4** al final.

**Recordatorio operativo**: el plan completo está en `~/.claude/plans/tengo-que-ir-pensando-adaptive-shamir.md`. Las decisiones cerradas están al inicio.
