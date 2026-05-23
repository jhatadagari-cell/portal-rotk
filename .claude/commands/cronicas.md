# Skill: Crónicas de Personaje · Portal ROTK

Reescribe o amplía la sección de Crónicas de una ficha existente sin tocar el resto del HTML ni el CSS.

**Personaje solicitado:** $ARGUMENTS

---

## Paso 0 — Sin argumento

Si `$ARGUMENTS` está vacío, busca todos los archivos en `assets/Periods/*.html` que contengan `<div class="cronica-list">` y muestra una lista numerada. Pregunta al usuario cuál quiere mejorar y espera su respuesta.

---

## Paso 1 — Localizar la ficha y el personaje en data.js

1. Calcula el slug a partir de `$ARGUMENTS` (minúsculas, espacios → guiones, sin tildes).
2. Comprueba que existe `assets/Periods/[slug].html`. Si no existe, informa al usuario y detente.
3. Busca en `assets/js/data.js` la entrada cuyo `en` coincida con `$ARGUMENTS`.
4. Extrae: `zh`, `en`, `zi`, `ttl`, `bio`, `fac`, `eras`.

---

## Paso 2 — Mapa Vital exhaustivo

Antes de escribir nada, construye internamente una lista cronológica completa de todos los hitos del personaje en el Romance de los Tres Reinos:

- Origen, infancia o formación (si tiene relevancia narrativa)
- Cada alianza, traición o cambio de bando
- Cada batalla o campaña mayor en la que participa
- Cada episodio célebre, estratagema o momento icónico
- Cada pérdida significativa (aliados, territorios, batallas)
- Inventos, obras escritas u otras aportaciones si las hay
- Muerte, legado o destino final

Este mapa es la referencia. Ningún periodo de más de ~8 años de vida activa puede quedar sin cobertura.

---

## Paso 3 — Auditar las crónicas existentes

Lee el bloque `<div class="cronica-list">` del HTML actual e identifica:

- Qué periodos ya están cubiertos (con sus fechas)
- Qué hitos del Mapa Vital faltan completamente
- Qué entradas existentes son correctas y deben conservarse
- Qué entradas existentes contienen errores factuales (corrígelas)

No elimines entradas correctas. Conserva su `id` original para no romper posibles deep-links.

---

## Paso 4 — Planificar la lista completa de entradas

Antes de escribir HTML, planifica internamente la lista ordenada de todas las entradas (existentes + nuevas) con:

- `id` propuesto (`cronica-[slug-evento]`)
- Fecha aproximada
- Título en español
- Título en chino (canónico o aproximado)
- Categoría (`cronica-tag`)

Verifica que:
- El orden es estrictamente cronológico
- No hay huecos de más de ~8 años sin entrada
- Están representados al menos: Formación/Acto fundacional · Momento cumbre · Episodio de carácter · Declive o derrota · Final o legado

**Escala esperada:**
- Personajes de primer orden (Cao Cao, Liu Bei, Zhuge Liang…): 10-17 entradas
- Personajes secundarios importantes: 5-9 entradas
- Personajes menores: mínimo 3 entradas

---

## Paso 5 — Escribir el nuevo bloque `cronica-list`

Escribe el HTML completo del bloque con todas las entradas (conservadas + nuevas + corregidas).

**Estructura de cada entrada:**

```html
<article class="cronica-entry" id="cronica-[slug-evento]">
  <div class="cronica-hd">
    <span class="cronica-year">[año] d.C.</span>
    <span class="cronica-tag">[categoría]</span>
    <span class="cronica-zh">[título chino]</span>
    <h3 class="cronica-n">[título español]</h3>
  </div>
  <div class="cronica-body">
    <p>[párrafo 1 — 3-6 frases]</p>
    <p>[párrafo 2 — 3-6 frases]</p>
  </div>
</article>
```

**Reglas de calidad:**
- Exactamente 2 párrafos por entrada, cada uno de 3-6 frases
- Prosa narrativa en español literario (tono IM Fell English)
- Factual: basado en el Romance; si algo es leyenda vs. historia, señalarlo dentro del texto sin romper el estilo
- `cronica-zh` obligatorio en todas las entradas; si no existe título chino canónico, crear uno breve y apropiado
- No inventar datos; no confundir personajes similares

**Categorías disponibles para `cronica-tag`:**
Formación · Acto fundacional · Alianza · Diplomacia · Estratagema · Batalla
Conquista · Administración · Lealtad · Traición · Tragedia · Política
Derrota · Victoria · Decisión · Legado · Leyenda · Ingenio · Final

---

## Paso 6 — Aplicar el cambio al HTML

Localiza el bloque exacto en `assets/Periods/[slug].html`:

```html
    <div class="wrap-page" data-page="cronicas">
      <div class="cronica-list">
        ...contenido actual...
      </div>
    </div>
```

Reemplaza únicamente el contenido interior de `<div class="cronica-list">` con las entradas del Paso 5. No toques ninguna otra parte del archivo.

---

## Paso 7 — Confirmar al usuario

Informa de:
1. Archivo modificado: `assets/Periods/[slug].html`
2. **Informe de crónicas:**
   - Entradas anteriores: N (conservadas: X, corregidas: Y)
   - Entradas nuevas añadidas: Z
   - Total final: N+Z
   - Rango temporal cubierto (desde ~ X d.C. hasta ~ Y d.C.)
3. Lista de todos los `id` de anchor disponibles (`#cronica-[slug]`) para deep-linking
4. Periodos que no tienen cobertura y por qué (vida documentada corta, fuentes insuficientes, etc.)
5. Si alguna entrada existente fue corregida factualmente, detalla qué cambió y por qué
