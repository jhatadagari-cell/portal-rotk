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

### C2 — Header/footer compartido + Acerca de · **EN CURSO**
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
- [ ] **Pendiente de limpieza**: las reglas del chrome (#nav, .nav-*, footer, .foot-*, hamburger, @media ≤680px) están duplicadas en `main.css` (líneas 17-47, 796-804, 1149-1151) y en `chrome.css`. Cuando todas las páginas carguen chrome.css, retirar las reglas de main.css. Riesgo bajo si el index también añade `<link>` a chrome.css.

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

**Estado al cierre de esta sesión** (2026-05-10): C1 hecho, C7 hecho, C2 al 60% (chrome.css creado, index/batallas/mapa migrados, faltan 89 fichas + 18 batallas individuales). CNAME `threekingdoms.wiki` borrado (era de otra web ajena).

**Por hacer en orden**:

1. **Migrar las 89 fichas + 18 batallas individuales** con un script masivo (Node o Python). Para cada `assets/Periods/*.html`:
   - Reemplazar `<header id="hdr">…</header>` por `<div id="chrome-nav"></div>`.
   - Antes de `</head>`: añadir `<link rel="stylesheet" href="../css/chrome.css">` (1 nivel de subida desde `Periods/`).
   - Antes de `</body>`: añadir `<div id="chrome-footer"></div>` (si la página lo soporta) + `<script src="../../assets/js/chrome.js"></script>` (2 niveles de subida desde `Periods/`).
   - Añadir `data-page-section="personajes"` al `<html>`.
   - Para `assets/Battles/*.html`: idéntico pero con `data-page-section="batallas"`.
   - Idempotente: si la página ya tiene `<div id="chrome-nav">`, saltarla.
2. Una vez todas migradas, **limpiar duplicación**: retirar reglas del chrome de `main.css` y añadir `<link>` a chrome.css en `index.html`, `acerca.html`, `404.html`.
3. Después: **C6** (meta tags + favicon + OG + sitemap.xml + robots.txt). Definir favicon antes de tocar fichas masivamente — espera, ya se han tocado, definirlo igual aquí.
4. Después: **C3** (escribir las 7 fichas vacías: Wang Yun, Sima Yan, Chen Gong, Li Ru, Xun You, Yang Hu, Sun Hao) y nivelar relaciones (Zhuge Liang prioridad).
5. Después: **C4** (nivelar 8 batallas: wan, changban, tong-pass, jiangling, dingjunshan, mai-cheng, jieting, wuzhang).
6. Después: **C5** (10 páginas de Era con prosa).
7. **I1**, **I2**, **I3**, **I4** y **C8** al final.

**Recordatorio operativo**: el plan completo está en `~/.claude/plans/tengo-que-ir-pensando-adaptive-shamir.md`. Las decisiones cerradas están al inicio.
