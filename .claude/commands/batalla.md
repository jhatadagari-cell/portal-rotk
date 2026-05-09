# Skill: Ficha de Batalla · Portal ROTK

Crea o completa la página HTML de una batalla en `assets/Battles/`, siguiendo el patrón establecido en `huang-jin.html` y actualizando `data.js`.

**Batalla solicitada:** $ARGUMENTS

---

## Paso 0 — Sin argumento

Si `$ARGUMENTS` está vacío, lee el array `BATTLES` en `assets/js/data.js` y lista todas las entradas con `complete: false`. Muéstralas numeradas con año y nombre. Pregunta al usuario cuál quiere completar primero y espera su respuesta.

---

## Paso 1 — Localizar la batalla en data.js

Busca en `BATTLES[]` la entrada cuyo campo `en` o `id` coincida con `$ARGUMENTS`. Extrae y anota:
- `id`, `zh`, `en`, `year`, `yearLabel`, `era`, `result`, `resultLabel`, `desc`, `detailHref`, `participants`

Calcula el **slug** del archivo: es el valor del campo `id` (ya viene en kebab-case).

**FACT-CHECK OBLIGATORIO antes de escribir contenido:**
- Verifica que los `participants` mencionados tienen sentido histórico para esa batalla
- Contrasta los hechos clave contra el Romance de los Tres Reinos (capítulos relevantes)
- Si hay ambigüedad o riesgo de confundir datos históricos con ficción del Romance, anótalo para la nota histórica
- No inventes participantes ni batallas secundarias sin base en la novela

---

## Paso 2 — Verificar imágenes de los participantes

Para cada personaje en `participants`, comprueba si existe `assets/img/[Nombre Legible]/[Nombre Legible].webp`.

La correspondencia entre ID y nombre de carpeta sigue el patrón:
| id | carpeta de imagen |
|---|---|
| cao-cao | Cao Cao |
| liu-bei | Liu Bei |
| guan-yu | Guan Yu |
| zhang-fei | Zhang Fei |
| lu-bu | Lu Bu |
| dong-zhuo | Dong Zhuo |
| sun-jian | Sun Jian |
| yuan-shao | Yuan Shao |

Para IDs no listados: convierte el kebab-case a Title Case (ej. `huangfu-song` → `Huangfu Song`).

Además, verifica con `ls assets/Periods/` qué fichas HTML existen para los participantes (para sus `href`).

Si un personaje no tiene imagen, usa la clase `.figure-bubble-img--placeholder` con su carácter chino.

---

## Paso 3 — Determinar el badge de resultado

| result en data.js | clase CSS | texto del badge |
|---|---|---|
| victoria | `victoria` | Victoria Imperial / Victoria [bando ganador] |
| derrota | `derrota` | Derrota [bando principal] |
| pirrica | `pirrica` | Victoria Pírrica |
| indecisa | `indecisa` | Batalla Indecisa |

El texto del badge debe ser específico (no genérico), usando el bando ganador real.

---

## Paso 4 — Determinar color de las faction-sides

| tipo de bando | clase adicional |
|---|---|
| Rebeldes, invasores, usurpadores | `faction-side--rebel` |
| Imperio, defensores legítimos, coalición | `faction-side--imperial` |
| Dos señores en guerra civil | sin clase adicional (ambos neutrales) |

Si los dos bandos son guerras internas (ej. Cao Cao vs Yuan Shao), usa el bando que gana como `--imperial` y el perdedor como `--rebel` para mantener la jerarquía visual.

---

## Paso 5 — Planificar los actos

Cada batalla tiene entre 1 y 3 actos según su complejidad narrativa:
- **1 acto**: batallas breves o asedios directos
- **2 actos**: campaña en dos fases diferenciadas (como Si Shui → Hu Lao)
- **3 actos**: campañas largas con prólogo, clímax y desenlace

Para cada acto define:
- `id` (ej. `#rebelion`, `#guandu`, `#chibi`)
- `eyebrow`: "Acto I · [caracteres chinos]" (o "Prólogo", "Epílogo" si aplica)
- `title`: nombre del acto en español
- `subtitle`: frase evocadora en cursiva (*IM Fell English*)
- entre **3 y 5 eventos** numerados cronológicamente

Cada evento lleva:
- `event-year`: pill con el año exacto (ej. "200 d.C.") o rango si es difuso
- `event-label`: nombre del momento — si tiene nombre canónico en chino, inclúyelo antes del guión (ej. "官渡之战 — La batalla decisiva")
- `event-desc`: párrafo de 3-5 frases en tono literario, factual pero evocador. Primera persona narrativa omnisciente, no académica. Sin bullet points.

---

## Paso 6 — Planificar las figuras clave

Agrupa en 2-4 grupos temáticos según los bandos. Máximo 8 figuras por grupo.

Cada figura:
- `figure-bubble-name`: nombre en español/pinyin
- `figure-bubble-role`: frase ultracorta (≤10 palabras) que describe su papel específico en ESTA batalla, no su rol general

Prioriza personajes con imagen y ficha existentes. Para personajes secundarios sin imagen, usa placeholder.

---

## Paso 7 — Redactar la sección Contexto

Escribe tres bloques:

### battle-intro-panel
Párrafo de 4-6 frases que sitúa la batalla: el momento histórico, los bandos, qué estaba en juego. Tono literario, no enciclopédico. Menciona los protagonistas principales y las motivaciones reales (no solo los ejércitos).

### battle-nota
Diferencias entre el Romance (Luo Guanzhong) y el Sanguo Zhi (Chen Shou) o fuentes históricas. Si no hay diferencias relevantes, menciona el contexto historiográfico de la batalla. Obligatorio para anclar la narrativa en la realidad.

### battle-stats (barra de datos)
4 datos clave. Elige los más informativos para esa batalla específica:
- Año / Duración / Teatro (localización) / Fuerzas totales aproximadas
- O bien: Año / Resultado / Bajas estimadas / Consecuencia estratégica

---

## Paso 8 — Generar el HTML

Usa esta plantilla exacta. Sustituye todos los `[campos]`:

```html
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>[en] · Batalla</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;700;900&family=Cinzel+Decorative:wght@400;700&family=IM+Fell+English:ital@0;1&family=Noto+Sans+SC:wght@300;400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/battle.css">
</head>
<body>

<header id="hdr">
  <div>
    <div class="hzh">[zh]</div>
    <div class="hen">[yearLabel] · [era] · [resultLabel]</div>
  </div>
  <nav class="hbtns">
    <a class="hb" href="../../index.html#heroes">← Volver a Personajes</a>
    <a class="hb" href="../../index.html">Inicio</a>
  </nav>
</header>

<nav class="sec-nav">
  <a href="#contexto" class="sec-link active">Contexto</a>
  <!-- Un enlace por acto: -->
  <a href="#[acto-id]" class="sec-link">[Título del Acto]</a>
  <a href="#figuras" class="sec-link">Figuras Clave</a>
</nav>

<main class="wrap">

  <!-- ── Contexto ── -->
  <section id="contexto">
    <div class="battle-eyebrow">
      [Tipo: Batalla / Rebelión / Campaña / Asedio]
      <span class="result-badge [result]">[Texto del badge]</span>
    </div>

    <div class="battle-vs">
      <div class="faction-side [faction-side--rebel o --imperial o vacío]">
        <div class="faction-side-label">[Etiqueta: Atacantes / Defensores / Rebeldes / Imperio]</div>
        <div class="faction-side-name">[Nombre del bando]</div>
        <div class="faction-side-leader">[Comandante(s) principal(es)]</div>
      </div>
      <div class="vs-label">对</div>
      <div class="faction-side [faction-side--rebel o --imperial o vacío]">
        <div class="faction-side-label">[Etiqueta]</div>
        <div class="faction-side-name">[Nombre del bando]</div>
        <div class="faction-side-leader">[Comandante(s) principal(es)]</div>
      </div>
    </div>

    <div class="battle-stats">
      <div class="battle-stat">
        <span class="battle-stat-val">[valor]</span>
        <span class="battle-stat-lbl">[etiqueta]</span>
      </div>
      <!-- Repetir para 4 stats -->
    </div>

    <div class="battle-intro-panel">
      <p>[Párrafo de contexto — 4-6 frases]</p>
    </div>

    <div class="battle-nota">
      <div class="battle-nota-label">Nota histórica</div>
      <p>[Diferencias Romance vs Sanguo Zhi o contexto historiográfico]</p>
    </div>
  </section>

  <div class="section-divider"><span></span><span class="divider-ornament">◆</span><span></span></div>

  <!-- ── Acto I ── -->
  <section class="battle-act" id="[acto-id]">
    <div class="act-eyebrow">Acto I · [caracteres chinos]</div>
    <h2 class="act-title">[Título del acto]</h2>
    <p class="act-subtitle">[Frase evocadora]</p>

    <div class="battle-events">
      <div class="battle-event">
        <span class="event-year">[año] d.C.</span>
        <div class="event-label">[Nombre canónico chino si existe — ] [Nombre descriptivo]</div>
        <p class="event-desc">[3-5 frases narrativas]</p>
      </div>
      <!-- Repetir 3-5 eventos -->
    </div>
  </section>

  <div class="section-divider"><span></span><span class="divider-ornament">◆</span><span></span></div>

  <!-- ── Acto II (si aplica) ── -->
  <!-- Misma estructura que Acto I -->

  <div class="section-divider"><span></span><span class="divider-ornament">◆</span><span></span></div>

  <!-- ── Figuras Clave ── -->
  <section class="figures-section" id="figuras">
    <h2 class="sec-title">Figuras Clave</h2>

    <div class="figures-group">
      <div class="figures-group-label">[Nombre del grupo]</div>
      <div class="figure-bubbles">

        <!-- Con imagen: -->
        <a class="figure-bubble" href="../Periods/[slug].html">
          <div class="figure-bubble-img">
            <img src="../img/[Nombre%20Legible]/[Nombre%20Legible].webp" alt="[Nombre]" />
          </div>
          <span class="figure-bubble-name">[Nombre]</span>
          <span class="figure-bubble-role">[Rol específico en esta batalla]</span>
        </a>

        <!-- Sin imagen (placeholder): -->
        <a class="figure-bubble" href="../Periods/[slug].html">
          <div class="figure-bubble-img figure-bubble-img--placeholder">
            <span>[carácter chino]</span>
          </div>
          <span class="figure-bubble-name">[Nombre]</span>
          <span class="figure-bubble-role">[Rol específico en esta batalla]</span>
        </a>

      </div>
    </div>
    <!-- Repetir grupos -->
  </section>

  <div class="battle-footer">
    <a href="../batallas.html">← Volver a Batallas</a>
  </div>

</main>

<script>
(function () {
  const links = document.querySelectorAll('.sec-link');
  const sections = document.querySelectorAll('section[id], div[id]');

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        links.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + id));
      }
    });
  }, { rootMargin: '-30% 0px -60% 0px' });

  sections.forEach(s => observer.observe(s));

  links.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const target = document.querySelector(link.getAttribute('href'));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
})();
</script>

<script src="../js/data.js"></script>
<script src="../js/inline-links.js"></script>
</body>
</html>
```

**Reglas de escritura del contenido:**
- Tono literario omnisciente, no enciclopédico. Nunca "según las fuentes" — narra como si ocurriera.
- Los nombres chinos en el texto van en *cursiva* la primera vez que aparecen.
- Usa los nombres en español/pinyin que ya aparecen en el resto del portal (ej. "Lü Bu", no "Lü Bù").
- Los `event-label` con nombre canónico chino van: `温酒斩华雄 — Descripción en español`.
- Cada `event-desc` empieza con contexto inmediato, no con "En el año X..." genérico.

---

## Paso 9 — Actualizar data.js

Localiza el objeto con `id: "[slug]"` en el array `BATTLES`. Cambia:
```js
complete: false  →  complete: true
```

Si `detailHref` era `null`, actualízalo también:
```js
detailHref: null  →  detailHref: "assets/Battles/[slug].html"
```

Edita solo esas líneas. No modifiques nada más.

---

## Paso 10 — Confirmar

Informa de:
1. Archivo creado: `assets/Battles/[slug].html`
2. Cambio en `data.js`: `complete: true` (y `detailHref` si se actualizó)
3. Actos implementados y número de eventos por acto
4. Figuras: cuántas con imagen vs. placeholder
5. Si quedan batallas con `complete: false`, pregunta si continuar con la siguiente
