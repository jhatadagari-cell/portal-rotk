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
- [ ] **Próxima sesión**: migrar `assets/batallas.html` al chrome (sustituir `#hdr` por mount, cargar main.css o extraer chrome.css).
- [ ] **Próxima sesión**: migrar `assets/mapa.html` al chrome.
- [ ] **Próxima sesión**: migrar las 89 fichas (`assets/Periods/*.html`) al chrome — usar script masivo con regex (todas tienen estructura `<header id="hdr">…</header>` similar).
- [ ] **Próxima sesión**: migrar batallas individuales (`assets/Battles/*.html`).
- [ ] **Decisión pendiente**: ¿extraer los selectores de `#nav`/`<footer>` a un `chrome.css` aislado o cargar main.css en todas las páginas? La opción aislada es más limpia.

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

**Estado al cierre de esta sesión**: C1 hecho, C7 hecho, C2 a medias (solo index migrado).

**Por hacer en orden**:

1. **Decidir sobre los estilos del chrome** en páginas internas:
   - Opción A (rápida): cargar `assets/css/main.css` también en batallas/mapa/fichas (puede chocar con sus CSS específicos).
   - Opción B (limpia): crear `assets/css/chrome.css` con SOLO los selectores `#nav`, `.nav-*`, `<footer>`, `.foot-*`, hamburger, responsive ≤680px. Cargarlo en todas las páginas.
2. **Migrar `assets/batallas.html`** al chrome (sustituir `<header id="hdr">…</header>` por mount, ajustar sec-nav si es necesario).
3. **Migrar `assets/mapa.html`** al chrome (idem). El mapa tiene además su propia barra de controles — verificar que el nav arriba no choca con el header del mapa.
4. **Migrar las 89 fichas + 18 batallas individuales** con un script masivo. Detectar `<header id="hdr">…</header>` y reemplazar por mount + script tag al final del body.
5. Después: **C6** (meta tags + favicon + OG + sitemap.xml + robots.txt). Definir favicon antes de tocar fichas masivamente.
6. Después: **C3** (escribir las 7 fichas vacías + nivelar relaciones) y **C4** (nivelar 8 batallas).
7. Después: **C5** (10 páginas de Era con prosa).
8. **I1**, **I2**, **I3**, **I4** y **C8** al final.

**Recordatorio operativo**: el plan completo está en `~/.claude/plans/tengo-que-ir-pensando-adaptive-shamir.md`. Las decisiones cerradas están al inicio.
