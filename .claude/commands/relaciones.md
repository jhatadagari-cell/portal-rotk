# Skill: Relaciones Clave · Portal ROTK

Añade o construye la página de Relaciones Clave de un personaje. Puede usarse para:
- **Crear desde cero** la página de relaciones de un personaje que ya tiene ficha básica.
- **Añadir personajes** a una página de relaciones ya existente.
- **Modificar secciones** o comportamiento del slider de eras.

**Personaje / instrucción:** $ARGUMENTS

---

## Arquitectura del sistema

La página de relaciones de Cao Cao (el modelo a seguir) funciona con un sistema de **tres pestañas** dentro del mismo HTML, navegadas por un slider CSS (`translateX`): `el-personaje`, `relaciones` y `batallas`. Este documento describe cómo construir la segunda pestaña (relaciones).

---

## Paso 0 — Decidir el alcance

Si `$ARGUMENTS` no especifica qué hacer:
- Si el personaje ya tiene un HTML en `assets/Periods/`, lee el archivo y determina si ya tiene la segunda página (`data-page="relaciones"`).
- Si no tiene segunda página, construirla desde cero.
- Si ya la tiene, preguntar al usuario qué quiere modificar.

---

## Paso 1 — Planificación de personajes y eras

Antes de tocar código, planifica en un listado:

### Eras disponibles (ids del slider)

| id | nombre visible | rango |
|----|---------------|-------|
| `han-tardio` | Han Tardío | 155 – 189 d.C. |
| `dong-zhuo` | Era Dong Zhuo | 189 – 192 d.C. |
| `guerras-senores` | Guerras de los Señores | 192 – 200 d.C. |
| `chibi` | Chibi | 200 – 210 d.C. |
| `tres-reinos` | Los Tres Reinos | 213 – 220 d.C. |
| `guerras-ocaso` | Guerras del Ocaso | ~230 – 263 d.C. |
| `sima` | Era Sima | 249 – 265 d.C. |
| `jin` | Dinastía Jin | 265+ d.C. |

Usa solo las eras relevantes para el personaje (las mismas que en su `eras` array de data.js, más las que necesites para mostrar el arco relacional).

### Secciones de relaciones (tipos)

Usa solo las que apliquen al personaje. Las que ha tenido Cao Cao como referencia:

| Sección | Para qué |
|---------|---------|
| **Primer Círculo** | Los más íntimos — familia de sangre, amigos de toda la vida, el inner circle real. Usa `--lg` (burbujas grandes). |
| **Generales de Confianza** | Militares que ejecutan sus órdenes directas con plena confianza. Usa `--md`. |
| **Consejeros y Estrategas** | Asesores, estrategas civiles o militares. Usa `--md`. |
| **Rivales y Antagonistas** | Enemigos directos, rivales. Usa `--md`. |
| **Señores y Aliados** | Señores de los que dependió o con los que se alió temporalmente. Usa `--md`. |
| **El Sello Imperial** | Figura de autoridad formal que el personaje usa o bajo la que sirve. Usa `--md`. |
| **Familia** | Cónyuge, hijos, padres con peso en la narrativa. Usa `--md`. |

Adapta los nombres de sección al personaje. Para un personaje de Shu podría ser "Hermanos de Juramento", "La Voluntad de Zhuge Liang", etc.

### Personajes con doble instancia (patrón para cambio de sección entre eras)

Si un personaje cambia de sección entre eras (ej. Yuan Shao: aliado → rival), crea **dos instancias HTML** del mismo personaje en secciones distintas, con `data-eras` no solapadas:

```html
<!-- En "Señores y Aliados" -->
<div class="rel-bubble" data-eras="han-tardio dong-zhuo" ...>

<!-- En "Rivales y Antagonistas" -->
<div class="rel-bubble" data-eras="guerras-senores" ...>
```

---

## Paso 2 — Convertir la ficha a sistema de tres pestañas

Si el HTML actual tiene estructura de una página (`.wrap` simple), hay que convertirlo a pager.

### Cambios en el HTML

**Antes:**
```html
<main class="wrap">
  <!-- contenido -->
</main>
```

**Después:**
```html
<main class="wrap wrap-pager">
  <div class="wrap-pages">
    <div class="wrap-page" data-page="el-personaje">
      <!-- contenido original (hero, intro, timeline/eras, epilogue) -->
    </div>
    <div class="wrap-page" data-page="relaciones">
      <!-- slider de eras + hub + panel + secciones de burbujas -->
    </div>
    <div class="wrap-page" data-page="batallas">
      <!-- placeholder hasta que se implemente la sección -->
      <div style="text-align:center;padding:60px 20px;color:var(--muted)">
        <h2 style="font-family:'Noto Serif SC',serif;font-size:24px;margin-bottom:12px">Batallas</h2>
        <p>Esta sección será completada próximamente con los enfrentamientos principales de [Nombre].</p>
      </div>
    </div>
  </div>
</main>
```

**Nav superior** — tres pestañas con `data-page`:
```html
<nav class="sec-nav">
  <a href="#" data-page="el-personaje" class="sec-link active">El Personaje</a>
  <a href="#" data-page="relaciones" class="sec-link">Relaciones Clave</a>
  <a href="#" data-page="batallas" class="sec-link">Batallas</a>
</nav>
```

### CSS necesario (añadir al CSS del personaje)

```css
.wrap-pager { overflow: hidden; padding: 0; }
.wrap-pages {
  display: flex;
  transition: transform 0.42s cubic-bezier(0.4, 0, 0.2, 1);
  will-change: transform;
  width: 100%;
}
.wrap-page {
  flex: 0 0 100%;
  width: 100%;
  box-sizing: border-box;
  padding: 30px 18px 60px;
}
```

---

## Paso 3 — Estructura HTML de la página de relaciones

La segunda pestaña (`data-page="relaciones"`) tiene esta estructura fija:

```html
<div class="wrap-page" data-page="relaciones">

  <!-- 1. Slider temporal -->
  <div class="era-slider-wrap">
    <div class="era-slider-header">
      <span class="era-slider-name">Han Tardío</span>
      <span class="era-slider-years">155 – 189 d.C.</span>
    </div>
    <input type="range" id="era-range" class="era-range"
           min="0" max="4" step="1" value="0" list="era-ticks" />
    <datalist id="era-ticks">
      <option value="0">Han Tardío</option>
      <option value="1">Era Dong Zhuo</option>
      <option value="2">Guerras de los Señores</option>
      <option value="3">Chibi</option>
      <option value="4">Los Tres Reinos</option>
    </datalist>
    <div class="era-tick-labels">
      <span>Han Tardío</span>
      <span>Dong Zhuo</span>
      <span>Guerras</span>
      <span>Chibi</span>
      <span>Tres Reinos</span>
    </div>
  </div>

  <!-- 2. Hub central (el propio personaje) -->
  <div class="rel-hub">
    <div class="rel-hub-bubble">
      <img src="../img/[Nombre]/[Nombre].png" alt="[Nombre]" />
    </div>
    <span class="rel-hub-label">[zh] · [en]</span>
  </div>

  <!-- 3. Panel de información (oculto hasta clic) -->
  <div class="rel-panel" id="rel-panel" hidden>
    <button class="rel-panel-close" aria-label="Cerrar">✕</button>
    <div class="rel-panel-badge"></div>
    <div class="rel-panel-name"></div>
    <p class="rel-panel-desc"></p>
  </div>

  <!-- 4. Secciones de burbujas (una por tipo de relación) -->
  <!-- Ver Paso 4 para la estructura de cada sección -->

</div>
```

El `max` del slider y las `<option>` del datalist deben ajustarse al número de eras del personaje (0-based).

---

## Paso 4 — Estructura de cada burbuja

### Burbuja con imagen

```html
<div class="rel-bubble"
     data-eras="han-tardio dong-zhuo"
     data-badge="Amigo de Juventud"
     data-badge-color="#d9b76a"
     data-name="Yuan Shao · 袁绍"
     data-desc="Descripción que aparece en el panel al hacer clic. 2-3 frases. Aquí va el texto completo de la relación.">
  <div class="rel-bubble-img">
    <img src="../img/Yuan%20Shao/Yuan%20Shao.png" alt="Yuan Shao" />
  </div>
  <span class="rel-bubble-name">Yuan Shao</span>
</div>
```

### Burbuja sin imagen (placeholder con carácter chino)

```html
<div class="rel-bubble"
     data-eras="tres-reinos"
     data-badge="El Poeta Preterido"
     data-badge-color="#9bb1d3"
     data-name="Cao Zhi · 曹植"
     data-desc="Descripción completa...">
  <div class="rel-bubble-img rel-bubble-img--placeholder">
    <span>植</span>
  </div>
  <span class="rel-bubble-name">Cao Zhi</span>
</div>
```

### Data-atributos por era (para personajes que cambian de rol/descripción entre eras)

Si el badge o la descripción debe cambiar según la era activa, añade atributos con sufijo de era en camelCase:

```html
<div class="rel-bubble"
     data-eras="han-tardio dong-zhuo"
     data-badge="Aliado en la Coalición"
     data-badge-color="#d9b76a"
     data-badge-han-tardio="Amigo de Juventud"
     data-badge-color-han-tardio="#d9b76a"
     data-desc="Texto para era dong-zhuo (por defecto)"
     data-desc-han-tardio="Texto alternativo para era han-tardio"
     ...>
```

La conversión de id a camelCase:
- `han-tardio` → `HanTardio`
- `dong-zhuo` → `DongZhuo`
- `guerras-senores` → `GuerrasSenores`
- `chibi` → `Chibi`
- `tres-reinos` → `TresReinos`

Así: `data-badge-han-tardio` → `dataset.badgeHanTardio`.

### Estructura de una sección

```html
<div class="rel-orbit-section">
  <h3 class="rel-orbit-label">Nombre de la Sección</h3>
  <div class="rel-bubbles rel-bubbles--md">
    <!-- burbujas aquí -->
  </div>
</div>
```

Usar `rel-bubbles--lg` para el Primer Círculo (burbujas 155px) y `rel-bubbles--md` para el resto (115px).

---

## Paso 5 — CSS completo para la página de relaciones

Añadir al final del CSS del personaje. El `[gold]`, `[accent]`, `[muted]` corresponden a los valores de paleta del personaje (ver skill `/ficha` para la tabla de paletas).

```css
/* ── Hub central ── */
.rel-hub {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-bottom: 36px;
  padding-top: 8px;
}
.rel-hub-bubble {
  width: 170px;
  height: 170px;
  border-radius: 50%;
  overflow: hidden;
  border: 3px solid var(--gold);
  box-shadow: 0 0 0 8px rgba([gold-rgb], .12), 0 0 40px rgba([gold-rgb], .32);
  flex-shrink: 0;
}
.rel-hub-bubble img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
  display: block;
  transform: scale(1.35);
  transform-origin: top center;
}
.rel-hub-label {
  font-family: "Cinzel Decorative", serif;
  font-size: 11px;
  letter-spacing: .22em;
  text-transform: uppercase;
  color: var(--gold);
  opacity: .75;
}

/* ── Panel de información ── */
.rel-panel {
  margin: 0 0 36px;
  padding: 20px 22px;
  background: rgba([accent-rgb], .06);
  border: 1px solid rgba([gold-rgb], .2);
  border-radius: 14px;
  position: relative;
  animation: panelIn .28s ease;
}
@keyframes panelIn {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.rel-panel-close {
  position: absolute;
  top: 10px;
  right: 12px;
  background: none;
  border: none;
  color: var(--muted);
  font-size: 15px;
  cursor: pointer;
  opacity: .55;
  transition: opacity .15s;
  padding: 4px 6px;
  line-height: 1;
}
.rel-panel-close:hover { opacity: 1; }
.rel-panel-badge {
  display: inline-flex;
  font-family: "Cinzel Decorative", serif;
  font-size: 10px;
  letter-spacing: .18em;
  text-transform: uppercase;
  padding: 3px 9px;
  border-radius: 2px;
  border: 1px solid;
  margin-bottom: 8px;
}
.rel-panel-name {
  font-family: "Noto Serif SC", serif;
  font-size: 20px;
  color: var(--text);
  margin-bottom: 8px;
}
.rel-panel-desc {
  font-family: "IM Fell English", serif;
  font-size: 17px;
  line-height: 1.8;
  color: var(--muted);
  margin: 0;
}

/* ── Secciones y burbujas ── */
.rel-orbit-section { margin-bottom: 32px; }
.rel-orbit-label {
  font-family: "Cinzel Decorative", serif;
  font-size: 13px;
  letter-spacing: .22em;
  text-transform: uppercase;
  color: var(--gold);
  opacity: .85;
  margin: 0 0 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba([gold-rgb], .14);
  font-weight: 700;
  text-align: center;
}
.rel-bubbles {
  display: flex;
  flex-wrap: wrap;
  gap: 24px 28px;
  align-items: flex-start;
  justify-content: center;
}
.rel-bubble {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}
.rel-bubble-img {
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid rgba([gold-rgb], .22);
  transition: transform .22s ease, border-color .22s, box-shadow .22s;
  flex-shrink: 0;
}
.rel-bubble-img img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
  transform: scale(1.4);
  transform-origin: top center;
}
.rel-bubble:hover .rel-bubble-img {
  transform: scale(1.08);
  border-color: var(--gold);
  box-shadow: 0 0 0 4px rgba([gold-rgb], .16), 0 0 18px rgba([gold-rgb], .2);
}
.rel-bubble.active .rel-bubble-img {
  transform: scale(1.12);
  border-color: var(--gold);
  box-shadow: 0 0 0 5px rgba([gold-rgb], .26), 0 0 26px rgba([gold-rgb], .3);
}
.rel-bubble-name {
  font-family: "Noto Serif SC", serif;
  font-size: 14px;
  color: var(--muted);
  text-align: center;
  transition: color .22s;
  max-width: 110px;
  line-height: 1.3;
}
.rel-bubble:hover .rel-bubble-name,
.rel-bubble.active .rel-bubble-name { color: var(--text); }
.rel-bubbles--lg .rel-bubble-img { width: 155px; height: 155px; }
.rel-bubbles--lg .rel-bubble-name { font-size: 15px; max-width: 150px; }
.rel-bubbles--md .rel-bubble-img { width: 115px; height: 115px; }
.rel-bubble-img--placeholder {
  background: rgba([gold-rgb], .07);
  display: flex;
  align-items: center;
  justify-content: center;
}
.rel-bubble-img--placeholder span {
  font-family: "Cinzel Decorative", serif;
  font-size: 15px;
  color: var(--gold);
  opacity: .45;
}

/* ── Era Slider ── */
.era-slider-wrap {
  margin-bottom: 32px;
  padding: 20px 22px 16px;
  background: rgba([accent-rgb], .05);
  border: 1px solid rgba([gold-rgb], .14);
  border-radius: 14px;
}
.era-slider-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 14px;
}
.era-slider-name {
  font-family: "Noto Serif SC", serif;
  font-size: 22px;
  color: var(--text);
}
.era-slider-years {
  font-family: "Cinzel Decorative", serif;
  font-size: 12px;
  letter-spacing: .18em;
  color: var(--gold);
  opacity: .75;
}
.era-range {
  width: 100%;
  accent-color: var(--gold);
  cursor: pointer;
  margin-bottom: 10px;
}
.era-tick-labels {
  display: flex;
  justify-content: space-between;
  font-family: "Cinzel Decorative", serif;
  font-size: 9px;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--muted);
  opacity: .55;
}

/* ── Animación de entrada de burbujas ── */
@keyframes bubbleIn {
  from { opacity: 0; transform: scale(0.75); }
  to   { opacity: 1; transform: scale(1); }
}
.rel-bubble.bubble-entering {
  animation: bubbleIn 0.32s ease forwards;
}
.rel-bubble.era-hidden { pointer-events: none; }
.rel-orbit-section.era-empty { display: none; }
```

Sustituye `[gold-rgb]` por los bytes RGB del `--gold` de la paleta (ej. para `#9bb1d3` → `155, 177, 211`).
Sustituye `[accent-rgb]` por los bytes RGB del `--accent`.

---

## Paso 6 — JS completo

Todo el JS va dentro de un IIFE `(function() { ... })()` en un `<script>` inline antes de los scripts externos. Incluye:

1. Sistema de pager (navegación entre páginas)
2. Sistema de panel (clic en burbuja → info)
3. Era slider (`applyEra`)

```js
(function () {
  // ── Pager ──
  const links = document.querySelectorAll('.sec-link[data-page]');
  const pages = document.querySelectorAll('.wrap-page');
  const slider = document.querySelector('.wrap-pages');

  function goTo(pageId) {
    const idx = [...pages].findIndex(p => p.dataset.page === pageId);
    if (idx < 0) return;
    slider.style.transform = `translateX(-${idx * 100}%)`;
    links.forEach(l => l.classList.toggle('active', l.dataset.page === pageId));
  }

  links.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      goTo(link.dataset.page);
    });
  });

  // ── Panel ──
  const panel = document.getElementById('rel-panel');
  const panelBadge = panel.querySelector('.rel-panel-badge');
  const panelName  = panel.querySelector('.rel-panel-name');
  const panelDesc  = panel.querySelector('.rel-panel-desc');

  function showPanel(bubble) {
    const { badge, badgeColor, name, desc } = bubble.dataset;
    panelBadge.textContent = badge;
    panelBadge.style.color = badgeColor;
    panelBadge.style.borderColor = badgeColor;
    panelName.textContent = name;
    panelDesc.textContent = desc;
    panel.hidden = false;
    panel.style.animation = 'none';
    panel.offsetHeight;
    panel.style.animation = '';
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  document.querySelectorAll('.rel-bubble').forEach(bubble => {
    bubble.addEventListener('click', () => {
      const wasActive = bubble.classList.contains('active');
      document.querySelectorAll('.rel-bubble').forEach(b => b.classList.remove('active'));
      if (wasActive) {
        panel.hidden = true;
      } else {
        bubble.classList.add('active');
        showPanel(bubble);
      }
    });
  });

  panel.querySelector('.rel-panel-close').addEventListener('click', () => {
    panel.hidden = true;
    document.querySelectorAll('.rel-bubble').forEach(b => b.classList.remove('active'));
  });

  // ── Era Slider ──
  const ERAS = [
    { id: 'han-tardio',      name: 'Han Tardío',             years: '155 – 189 d.C.' },
    { id: 'dong-zhuo',       name: 'Era Dong Zhuo',          years: '189 – 192 d.C.' },
    { id: 'guerras-senores', name: 'Guerras de los Señores', years: '192 – 200 d.C.' },
    { id: 'chibi',           name: 'Chibi',                  years: '200 – 210 d.C.' },
    { id: 'tres-reinos',     name: 'Los Tres Reinos',        years: '213 – 220 d.C.' },
    // Añadir más según las eras del personaje
  ];

  function toCamel(str) {
    return str.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join('');
  }

  function applyEra(idx, instant) {
    const era = ERAS[idx];
    document.querySelector('.era-slider-name').textContent = era.name;
    document.querySelector('.era-slider-years').textContent = era.years;

    document.querySelectorAll('.rel-bubble').forEach(b => {
      const eras = (b.dataset.eras || '').split(' ');
      const visible = eras.includes(era.id);

      // Aplicar overrides de badge/desc para esta era
      const key = toCamel(era.id);
      if (b.dataset['badge' + key])      b.dataset.badge      = b.dataset['badge' + key];
      if (b.dataset['badgeColor' + key]) b.dataset.badgeColor = b.dataset['badgeColor' + key];
      if (b.dataset['desc' + key])       b.dataset.desc       = b.dataset['desc' + key];

      if (visible) {
        if (b.style.display === 'none') {
          b.classList.remove('era-hidden');
          b.style.display = '';
          b.offsetHeight;
          if (!instant) {
            b.classList.add('bubble-entering');
            b.addEventListener('animationend', () => b.classList.remove('bubble-entering'), { once: true });
          }
        }
      } else {
        b.classList.add('era-hidden');
        b.style.display = 'none';
      }
    });

    // Mostrar/ocultar secciones vacías
    document.querySelectorAll('.rel-orbit-section').forEach(sec => {
      const hasVisible = [...sec.querySelectorAll('.rel-bubble')]
        .some(b => b.style.display !== 'none');
      sec.classList.toggle('era-empty', !hasVisible);
    });

    // Cerrar panel si la burbuja activa desaparece
    const active = document.querySelector('.rel-bubble.active');
    if (active && active.style.display === 'none') {
      panel.hidden = true;
      active.classList.remove('active');
    }
  }

  document.getElementById('era-range').addEventListener('input', e => applyEra(+e.target.value));
  applyEra(0, true); // carga inicial sin animación
})();
```

**Importante:** ajustar el array `ERAS` al personaje — solo las eras que usa, en orden cronológico. El `max` del slider debe ser `ERAS.length - 1`.

---

## Paso 7 — Fact-check de relaciones

Antes de escribir las descripciones, verifica históricamente:

- ¿En qué eras estuvo activo este personaje junto al protagonista?
- ¿Cambió el tipo de relación (aliado → rival, subordinado → independiente)?
- ¿Hay personajes que deberían estar pero faltan?
- ¿Hay personajes incluidos que tienen poca relevancia real para este personaje?

**Criterio de inclusión:** un personaje debe haber tenido un rol activo en la historia del protagonista, no solo haber existido en la misma época. Episodios memorables cuentan, pero si la relación central del personaje es con otro (ej. Xu Shu es de Liu Bei, no de Cao Cao), no incluirlo.

---

## Paso 8 — Colores de badge por tipo de relación

Usa colores coherentes para comunicar el tipo de relación:

| Tipo de relación | Color badge | Hex |
|-----------------|-------------|-----|
| Aliado / fiel / hermano de armas | color de la facción del protagonista | varía |
| General o consejero propio | azul Wei / verde Shu / rojo Wu según facción | `#9bb1d3` / `#d9b76a` / `#d49e6a` |
| Rival principal | verde Shu o rojo Wu (el enemigo) | `#49804a` / `#bf2020` |
| Figura de autoridad (señor/emperador) | dorado Han | `#c9a84c` |
| Familiar | color de la facción, tono más suave | varía |
| Traidor / que lo abandonó | marrón/ocre | `#8b6914` |
| Tirano/antagonista puro | rojo | `#bf2020` |

---

## Paso 9 — Confirmación al usuario

Al terminar, informa:
1. Personajes añadidos por sección y era
2. Personajes que decidiste NO incluir y por qué
3. Si hay imágenes que faltan (placeholder usado)
4. Si se necesita ampliar alguna descripción
