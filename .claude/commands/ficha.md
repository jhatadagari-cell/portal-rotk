# Skill: Ficha de Personaje · Portal ROTK

Crea la Ficha de un personaje del Portal ROTK: HTML, CSS y actualización de data.js.

**Personaje solicitado:** $ARGUMENTS

---

## Paso 0 — Sin argumento

Si `$ARGUMENTS` está vacío, lee `assets/js/data.js`, encuentra todos los personajes sin campo `detailHref` y muéstralos en una lista numerada. Pregunta al usuario cuál quiere crear primero y espera su respuesta antes de continuar.

---

## Paso 1 — Localizar y Fact-check el personaje

Busca en `assets/js/data.js` la entrada cuyo campo `en` coincida con `$ARGUMENTS` (búsqueda insensible a mayúsculas si hace falta). Si no hay coincidencia exacta en `en`, busca también en `zi`.

**IMPORTANT — FACT-CHECK OBLIGATORIO:**
- Verifica el `bio` contra el Romance de los Tres Reinos
- Confirma que el `ttl` (título) es preciso y no dramatizado excesivamente
- Valida las `eras` contra los eventos históricos del personaje
- Si el `bio` contiene información dudosa, confusa, o potencialmente incorrecta, ADVIERTE al usuario antes de continuar
- No inventes datos ni confundas personajes similares
- Si hay datos incompletos o incorrectos, sugiere correcciones

Extrae y anota estos campos:
- `zh`, `en`, `zi`, `ttl`, `bio`, `fac`, `fc`, `fcbg`, `tags`, `stats`, `eras`
- Si tiene `facs` (multi-facción), usa el primer `facs[0].color` como color secundario pero `fc` como color principal.

---

## Paso 2 — Calcular el slug

Convierte `en` a slug: minúsculas, espacios → guiones, elimina tildes y caracteres especiales.

| en original | slug |
|---|---|
| Guan Yu | guan-yu |
| Lü Bu | lu-bu |
| Sun Quan | sun-quan |
| Zhang Fei | zhang-fei |
| Diao Chan | diao-chan |
| Sima Yi | sima-yi |
| Yuan Shao | yuan-shao |
| Ma Chao | ma-chao |
| Huang Zhong | huang-zhong |
| Lu Xun | lu-xun |
| Gan Ning | gan-ning |
| Jiang Wei | jiang-wei |
| Deng Ai | deng-ai |
| Sima Zhao | sima-zhao |
| Cao Pi | cao-pi |
| Xu Chu | xu-chu |
| Dian Wei | dian-wei |
| Xu Shu | xu-shu |
| Gongsun Zan | gongsun-zan |
| Han Xiandi | han-xiandi |
| Cheng Pu | cheng-pu |
| Han Dang | han-dang |
| He Jin | he-jin |

Si el personaje fue encontrado por `zi` y el directorio de imagen usa ese nombre (no `en`), usa el nombre de la imagen como slug.

---

## Paso 3 — Verificar si existe imagen

1. Comprueba si existe el archivo `assets/img/[en]/[en].png`.
2. Si no existe en el proyecto, busca en `C:\Users\usuario\Downloads` archivos con el nombre del personaje (cualquier imagen).
3. Si existe imagen: el `<section class="hero">` usará `grid-template-columns:minmax(280px,1.1fr) 1fr` e incluirá el bloque `<div class="hero-media">`.
4. Si no existe imagen en ningún lugar: usa un placeholder `<div class="hero-media-placeholder">` con el icono del personaje.
5. Sin imagen: el `<section class="hero">` usa `grid-template-columns:1fr`.

---

## Paso 4 — Paleta CSS según el campo `fc`

Usa esta tabla. Para `[gold24]`, `[gold12]`, `[gold45]` extrae los 3 bytes hex del color `--gold` y úsalos como `rgba(R,G,B,.24)`, etc.

| fc | --accent | --gold | --muted | body bg | --bg (panel) | gradient color | gradient pos |
|---|---|---|---|---|---|---|---|
| `#1e5abf` (Wei) | `#1e5abf` | `#9bb1d3` | `#99a5b8` | `#05080d` | `#080a13` | `#364475` | top right |
| `#1e8a2e` (Shu) | `#49804a` | `#d9b76a` | `#b9c2a5` | `#07110b` | `#08120d` | `#2a5b35` | top left |
| `#bf2020` (Wu) | `#bf2020` | `#d49e6a` | `#bba38d` | `#0b0906` | `#120b07` | `#53271a` | top left |
| `#9922cc` (Dong Zhuo) | `#9922cc` | `#cfa66f` | `#b7afb9` | `#07050a` | `#0e0810` | `#4d2d5e` | top right |
| `#b87e10` (Turbantes) | `#b87e10` | `#d4a84a` | `#b8a880` | `#080600` | `#100e00` | `#4d3c0a` | top left |
| `#8b6914` (Yuan Shao) | `#a08020` | `#d4b870` | `#b8a870` | `#080600` | `#100e00` | `#3d300a` | top right |
| `#c060a0` (Diao Chan) | `#c060a0` | `#d4a4c0` | `#b8a0b0` | `#080509` | `#0e0810` | `#5a2545` | top right |
| `#607080` (neutro) | `#607080` | `#a0b0c0` | `#9098a8` | `#060809` | `#0a0e12` | `#2a3848` | top left |
| `#c9a84c` (Han dorado) | `#c9a84c` | `#d4b870` | `#b8a870` | `#080600` | `#120a00` | `#4d3c18` | top left |
| `#2e8b57` (verde) | `#2e8b57` | `#a0d4a0` | `#90b890` | `#060b06` | `#0a1208` | `#1a4d28` | top left |

- `[bg]` = body bg (columna "body bg") — usado en `html{background}` y en el gradiente
- `[panel]` = --bg (columna "--bg (panel)") — valor de `--bg` en `:root`, ligeramente más claro
- `darkbg` = body bg pero ~30% más oscuro (ej. `#05080d` → `#04060b`)

Para `[accent08]` y `[accent18]`: extrae los bytes RGB del `--accent` y usa `rgba(R,G,B,.08)` y `rgba(R,G,B,.18)`.

---

## Paso 4.5 — CSS para navegación de pestañas

Añade al final del CSS (antes de los media queries):

```css
.wrap-pager{overflow:hidden}
.wrap-pages{display:flex;transition:transform 0.35s ease;width:400%}
.wrap-page{flex:0 0 calc(100% / 4)}
.section-divider{display:flex;align-items:center;gap:12px;margin:24px 0;opacity:0.5}
.section-divider span{flex:1;height:1px;background:rgba(255,255,255,.08)}
.divider-ornament{font-size:16px;flex:0 0 auto}
.intro-eyebrow{}
.timeline{margin-bottom:42px}
.tl-item{margin-bottom:34px}
.tl-header{margin-bottom:18px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,.08)}
.tl-year{display:block;font-size:14px;color:var(--gold);margin-bottom:6px}
.tl-name{font-family:'Noto Serif SC',serif;font-size:26px;color:var(--text);margin:0;padding:0}
```

---

## Paso 5 — Crear `assets/css/[slug].css`

Crea el archivo con exactamente esta estructura:

```
:root{--bg:[panel];--panel:[panel];--text:#f2ede2;--muted:[muted];--gold:[gold];--accent:[accent];--border:rgba(255,255,255,.08)}
*{box-sizing:border-box}
html{font-family:'Noto Sans SC',sans-serif;background:[bg];color:var(--text)}
body{margin:0;min-height:100vh;background:radial-gradient(circle at [pos],[gradient] 0%,[bg] 32%,[darkbg] 100%);background-attachment:fixed}
img{display:block;max-width:100%;height:auto}
body,a{color:inherit}
a{text-decoration:none}
#hdr{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:24px 20px 16px;border-bottom:1px solid rgba(255,255,255,.08)}
#hdr > div{max-width:calc(100% - 220px)}
.hzh{font-family:'Noto Serif SC',serif;font-size:26px;font-weight:700;letter-spacing:.12em;color:var(--text)}
.hen{font-family:'Cinzel Decorative',serif;font-size:16px;text-transform:uppercase;letter-spacing:.3em;color:var(--gold);margin-top:8px;opacity:.92}
.hbtns{display:flex;gap:12px;flex-wrap:wrap}
.hb{font-family:'Cinzel Decorative',serif;font-size:16px;padding:10px 16px;border:1px solid [gold24];border-radius:4px;color:var(--gold);background:rgba(255,255,255,.03);transition:background .22s,border-color .22s}
.hb:hover{background:[gold12];border-color:[gold45]}
.sec-nav{display:flex;gap:12px;padding:12px 20px;background:rgba(255,255,255,.02);border-bottom:1px solid rgba(255,255,255,.08);position:sticky;top:0;z-index:100;flex-wrap:wrap;justify-content:center}
.sec-link{font-family:'Cinzel Decorative',serif;font-size:12px;padding:8px 12px;border-radius:3px;color:var(--gold);text-decoration:none;transition:background .22s,color .22s;border:1px solid transparent}
.sec-link:hover:not(.soon){background:[gold08]}
.sec-link.active{background:[gold15];border-color:[gold30]}
.sec-link.soon{opacity:.45;cursor:not-allowed}
.wrap{max-width:1040px;margin:0 auto;padding:30px 18px 60px}
.hero{display:grid;grid-template-columns:[hero-cols];gap:24px;align-items:start;margin-bottom:36px}
.hero-media{border:1px solid var(--border);border-radius:18px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.35);background:linear-gradient(180deg,rgba(255,255,255,.02),rgba(0,0,0,.18))}
.hero-copy{padding:18px 0 0}
.eyebrow{font-family:'Cinzel Decorative',serif;font-size:16px;letter-spacing:.28em;text-transform:uppercase;color:var(--gold);opacity:.85;margin-bottom:18px}
.title{font-family:'Noto Serif SC',serif;font-size:clamp(38px,4.8vw,56px);line-height:1.02;color:var(--text);margin:0 0 14px}
.subtitle{font-family:'IM Fell English',serif;font-style:italic;font-size:22px;line-height:1.78;color:var(--muted);margin:0 0 24px}
.hero-quote{position:relative;padding:28px 22px 18px 22px;margin:0 0 24px;border-left:4px solid var(--accent);background:rgba(255,255,255,.03);border-radius:10px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.025)}
.quote-mark{display:block;font-size:46px;line-height:.7;color:var(--accent);margin-bottom:-10px}
.lede{font-family:'IM Fell English',serif;font-size:21px;line-height:1.88;color:var(--muted);margin:0}
.intro{margin-bottom:42px;padding:22px 24px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.16)}
.intro p{margin:0;font-size:20px;line-height:1.9;color:var(--muted)}
.sec-title{font-family:'Noto Serif SC',serif;font-size:26px;color:var(--text);margin-bottom:18px}
.era-block{margin-bottom:34px}
.era-block.alt .era-card{background:[accent08];border-color:[accent18]}
.era-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px}
.era-card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:22px;box-shadow:0 18px 50px rgba(0,0,0,.16);backdrop-filter:blur(6px)}
.era-card h3{font-family:'Noto Serif SC',serif;font-size:22px;color:var(--text);margin:0 0 10px}
.era-card p{margin:0;font-size:19px;line-height:1.8;color:var(--muted)}
.epilogue{padding:28px 26px;background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(0,0,0,.08));border:1px solid rgba(255,255,255,.08);border-radius:18px}
.epilogue h2{font-family:'Noto Serif SC',serif;font-size:24px;color:var(--text);margin:0 0 14px}
.epilogue p{margin:0;font-size:20px;line-height:1.9;color:var(--muted)}
.cronica-list{display:flex;flex-direction:column;gap:0}
.cronica-entry{position:relative;padding:32px 0 32px 28px;border-left:2px solid [accent25];transition:border-color .25s}
.cronica-entry:first-child{padding-top:8px}
.cronica-entry::before{content:'';position:absolute;left:-5px;top:36px;width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 3px [accent18];transition:box-shadow .25s}
.cronica-entry:first-child::before{top:12px}
.cronica-entry:hover{border-color:[accent60]}
.cronica-entry:hover::before{box-shadow:0 0 0 5px [accent22]}
.cronica-hd{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-bottom:14px}
.cronica-year{font-family:'Cinzel Decorative',serif;font-size:11px;letter-spacing:.2em;color:var(--gold);opacity:.8;white-space:nowrap}
.cronica-zh{font-family:'Noto Serif SC',serif;font-size:19px;color:[accent85]}
.cronica-n{font-family:'Noto Serif SC',serif;font-size:20px;color:var(--text);margin:0;font-weight:700}
.cronica-tag{font-family:'Cinzel Decorative',serif;font-size:9px;letter-spacing:.16em;text-transform:uppercase;padding:3px 9px;border-radius:2px;border:1px solid rgba(155,177,211,.22);color:var(--muted);opacity:.7;margin-left:auto}
.cronica-body p{font-family:'IM Fell English',serif;font-size:17px;line-height:1.88;color:var(--muted);margin:0 0 1em}
.cronica-body p:last-child{margin-bottom:0}
@media(max-width:900px){#hdr{flex-direction:column;align-items:flex-start} .hero{grid-template-columns:1fr}}
@media(max-width:640px){.wrap{padding:22px 16px 48px} .hbtns{width:100%;justify-content:flex-start} .hb{width:100%;text-align:center}}
```

Para `[accent25]`, `[accent60]`, `[accent22]`, `[accent85]`: extrae los bytes RGB del `--accent` y usa `rgba(R,G,B,.25)`, `rgba(R,G,B,.60)`, `rgba(R,G,B,.22)`, `rgba(R,G,B,.85)` respectivamente.

Para `[gold08]`, `[gold15]`, `[gold30]`: extrae los bytes RGB del `--gold` y usa `rgba(R,G,B,.08)`, `rgba(R,G,B,.15)`, `rgba(R,G,B,.30)`.

Para `[hero-cols]`:
- Con imagen: `minmax(280px,1.1fr) 1fr`
- Sin imagen: `1fr`

---

## Paso 6 — Crear `assets/Periods/[slug].html`

### Mapeo de eras a títulos en español

| id era | título sección |
|---|---|
| han-tardio | Han Tardío |
| turbantes | Turbantes Amarillos |
| dong-zhuo | Era de Dong Zhuo |
| guerras-senores | Guerras de los Señores |
| chibi | Chibi |
| tres-reinos | Los Tres Reinos |
| guerras-ocaso | Guerras del Ocaso |
| sima | Era Sima |
| jin | Dinastía Jin |

### Reglas de contenido

- Escribe **en español literario**, fluido y evocador, al estilo de las fichas de Cao Cao.
- El contenido debe ser **directo y factual**, basado en el Romance de los Tres Reinos, sin excesivas filigranas.
- Sí se puede añadir algo de romance a ciertos momentos si lo requieren (especialmente en blockquote hero-quote).
- Para cada era en el array `eras` del personaje, crea una `<section class="era-block">`. Alterna sin clase / con clase `alt` empezando **con `alt`** (la primera era lleva `alt` y el `id="eras"`).
- Cada sección lleva exactamente **2 `<article class="era-card">`**, cada uno con un `<h3>` y un `<p>` (2-3 frases).
- El contenido se basa en el `bio` del personaje más el conocimiento del Romance de los Tres Reinos. Sé preciso históricamente.
- Si `zi` está vacío, el `<h1 class="title">` muestra solo `[en] · [zh]`.
- Si `zi` no está vacío, muestra `[en] · [zi]`.
- La `hero-quote` debe ser una cita real o característica. Si no hay cita famosa, escribe una frase narrativa breve.

### Plantilla HTML

Estructura con tres pestañas como Cao Cao (El Personaje, Relaciones Clave placeholder, Batallas placeholder):

```html
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>[en] · Ficha</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;700;900&family=Cinzel+Decorative:wght@400;700&family=IM+Fell+English:ital@0;1&family=Noto+Sans+SC:wght@300;400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/[slug].css">
</head>
<body>
<header id="hdr">
  <div>
    <div class="hzh">[zh] · [en]</div>
    <div class="hen">[fac] · [ttl]</div>
  </div>
  <nav class="hbtns">
    <a class="hb" href="../../index.html#heroes">← Volver a Personajes</a>
    <a class="hb" href="../../index.html">Inicio</a>
  </nav>
</header>

<nav class="sec-nav">
  <a href="#" data-page="el-personaje" class="sec-link active">El Personaje</a>
  <a href="#" data-page="relaciones" class="sec-link">Relaciones Clave</a>
  <a href="#" data-page="batallas" class="sec-link">Batallas</a>
  <a href="#" data-page="cronicas" class="sec-link">Crónicas</a>
</nav>

<main class="wrap wrap-pager">
  <div class="wrap-pages">
    <!-- PÁGINA 1: El Personaje -->
    <div class="wrap-page" data-page="el-personaje">
      <section class="hero" id="el-personaje">
        <!-- Incluir solo si hay imagen -->
        <div class="hero-media">
          <img src="../img/[en]/[en].png" alt="[en]" />
        </div>
        <!-- O si no hay imagen, usar placeholder -->
        <div class="hero-media-placeholder">[ico]</div>
        <!-- /imagen -->
        <div class="hero-copy">
          <div class="eyebrow">Ficha</div>
          <h1 class="title">[en] · [zi o zh]</h1>
          <p class="subtitle">[frase corta y evocadora, 1-2 líneas]</p>
          <blockquote class="hero-quote">
            <span class="quote-mark">"</span>
            <p class="lede">[cita o frase narrativa característica]</p>
          </blockquote>
          <p class="lede">[párrafo introductorio evocador, 2-3 frases]</p>
        </div>
      </section>

      <div class="section-divider">
        <span></span>
        <span class="divider-ornament">◆</span>
        <span></span>
      </div>

      <section class="intro">
        <div class="intro-eyebrow"></div>
        <p>[Párrafo general sobre el arco del personaje en la novela, 2-3 frases que sitúen al lector.]</p>
      </section>

      <!-- Primera era: siempre con "alt" y con id="eras" -->
      <div class="timeline" id="eras">
        <div class="tl-item">
          <div class="tl-header">
            <span class="tl-year">[año aprox]</span>
            <h2 class="tl-name">[nombre era en español]</h2>
          </div>
          <div class="era-grid">
            <article class="era-card">
              <h3>[Título del episodio]</h3>
              <p>[2-3 frases sobre el personaje en esta era]</p>
            </article>
            <article class="era-card">
              <h3>[Título del otro episodio]</h3>
              <p>[2-3 frases sobre el personaje en esta era]</p>
            </article>
          </div>
        </div>
        <!-- Más eras -->
      </div>

      <section class="epilogue" id="legado">
        <h2>Epílogo</h2>
        <p>[Párrafo final sobre el legado o la muerte del personaje. Cierre directo y factual.]</p>
      </section>
    </div>

    <!-- PÁGINA 2: Relaciones Clave (placeholder vacío) -->
    <div class="wrap-page" data-page="relaciones">
      <div style="text-align:center;padding:60px 20px;color:var(--muted)">
        <h2 style="font-family:'Noto Serif SC',serif;font-size:24px;margin-bottom:12px">Relaciones Clave</h2>
        <p>Esta sección será completada próximamente con las relaciones más importantes de [en].</p>
      </div>
    </div>

    <!-- PÁGINA 3: Batallas (placeholder vacío) -->
    <div class="wrap-page" data-page="batallas">
      <div style="text-align:center;padding:60px 20px;color:var(--muted)">
        <h2 style="font-family:'Noto Serif SC',serif;font-size:24px;margin-bottom:12px">Batallas</h2>
        <p>Esta sección será completada próximamente con los enfrentamientos principales de [en].</p>
      </div>
    </div>

    <!-- PÁGINA 4: Crónicas -->
    <div class="wrap-page" data-page="cronicas">
      <div class="cronica-list">
        <!-- Cada crónica es un article con id="cronica-[slug-del-evento]" para deep-linking desde Eras -->
        <!-- Ejemplo de estructura: -->
        <!--
        <article class="cronica-entry" id="cronica-[slug]">
          <div class="cronica-hd">
            <span class="cronica-year">[año] d.C.</span>
            <span class="cronica-zh">[título chino]</span>
            <h3 class="cronica-n">[título español]</h3>
            <span class="cronica-tag">[categoría]</span>
          </div>
          <div class="cronica-body">
            <p>[párrafo narrativo 1]</p>
            <p>[párrafo narrativo 2]</p>
          </div>
        </article>
        -->

        <!-- Escribe entre 3 y 6 crónicas cronológicas del personaje. Criterios de selección:
             - Momentos que revelan el carácter del personaje, no solo victorias
             - Cubrir arco completo: debut, momento cumbre, declive o final
             - Cada crónica: 2 párrafos en IM Fell English, narrativo y evocador
             - El id="cronica-[slug]" permitirá anclar desde el lector de Eras
             - Categorías sugeridas para cronica-tag: Acto fundacional, Rival, Lealtad,
               Derrota, Victoria, Traición, Final, Decisión, Batalla, Alianza -->
      </div>
    </div>
  </div>
</main>

<script>
(function () {
  const links = document.querySelectorAll(".sec-link[data-page]");
  const pages = document.querySelectorAll(".wrap-page");
  const slider = document.querySelector(".wrap-pages");

  function goTo(pageId) {
    const idx = [...pages].findIndex((p) => p.dataset.page === pageId);
    if (idx < 0) return;
    slider.style.transform = `translateX(-${idx * 100}%)`;
    links.forEach((l) =>
      l.classList.toggle("active", l.dataset.page === pageId),
    );
  }

  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      goTo(link.dataset.page);
    });
  });
})();
</script>

  <script src="../js/data.js"></script>
  <script src="../js/inline-links.js"></script>
</body>
</html>
```

---

## Paso 7 — Actualizar `assets/js/data.js`

Localiza el objeto del personaje en data.js. Añade el campo `detailHref:'assets/Periods/[slug].html'` **justo antes** del campo `eras:`.

Edita solo la entrada del personaje. No toques ninguna otra línea.

---

## Paso 8 — Confirmar al usuario

Informa de:
1. Archivos creados: `assets/css/[slug].css` y `assets/Periods/[slug].html`
2. Modificación en `assets/js/data.js`: campo `detailHref` añadido (botón "Ver Ficha" ahora habilitado en modal)
3. Estructura: Ficha con **cuatro pestañas** (El Personaje completado, Relaciones Clave placeholder, Batallas placeholder, Crónicas con entradas narrativas)
4. Si se incluyó imagen o cómo se resolvió (busca en Descargas, o usa placeholder)
5. Crónicas: lista los IDs de anchor generados (`#cronica-[slug]`) — servirán para deep-linking desde el lector de Eras
6. Contenido: Directo y factual, sin excesivas filigranas, pero con romance en momentos clave
7. Si quedan más personajes sin ficha, pregunta si continuar con el siguiente
