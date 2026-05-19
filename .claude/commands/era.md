# Skill: Era · Portal ROTK

Fact-check, expansión y revisión de calidad de una era del Portal ROTK. Trabaja sobre el reader paginado en `assets/js/era-content.js` y el HTML estático en `assets/Periods/era-[slug].html`, manteniendo cohesión narrativa con las eras adyacentes.

**Era solicitada:** $ARGUMENTS

---

## Paso 0 — Sin argumento

Si `$ARGUMENTS` está vacío, lee `assets/js/era-content.js`. Lista todos los slugs del objeto `C` indicando para cada uno:
- `paged: true/false`
- Número de elementos en `events`
- Subtitle/rango temporal extraído del HTML estático correspondiente (`assets/Periods/era-[slug].html` → `.era-subtitle`)

Presenta la lista numerada al usuario y pregunta cuál revisar. Espera respuesta antes de continuar.

Slugs canónicos del proyecto: `han-tardio`, `turbantes`, `dong-zhuo`, `guerras-senores`, `chibi`, `tres-reinos`, `guerras-ocaso`, `sima`, `jin`, `ocho-principes`.

---

## Paso 1 — Localizar y leer el estado actual

1. Localiza el objeto de la era en `assets/js/era-content.js`. Lee íntegros:
   - `lede`
   - `prose: []` (lista de párrafos)
   - `events: []` (cada uno con `y`, `type`, `n`, `d`, `body`, `char`, opcional `bgImg`)
   - Notas históricas presentes (busca `<aside class="reader-hist">` dentro de los `body`)
2. Lee también `assets/Periods/era-[slug].html` íntegro:
   - `<title>`, `<meta description>`
   - `.era-title`, `.era-subtitle`, `.era-lede`
   - Párrafos `.era-prose`
   - Lista de `<article class="t-item">` en `.timeline`
   - Lista de `<article class="char">` en `.chars`
3. Anota:
   - Número de eventos actuales en el reader
   - Número de items en la timeline estática
   - Personajes destacados en `.chars`
   - Si hay desincronía entre reader y HTML estático

---

## Paso 2 — Determinar el rango histórico canónico

Extrae el rango temporal de `.era-subtitle` (ej. `192 — 208 d.C.`).

Construye la **línea temporal canónica del Romance** para ese rango: los hitos imprescindibles según la novela y los capítulos relevantes. Esto es el "objetivo de cobertura" — la lista contra la que vas a contrastar el contenido actual.

**Referencias canónicas por era** (para orientarte; sigue verificando cada caso):

| Slug | Rango | Capítulos del Romance | Hitos clave imprescindibles |
|---|---|---|---|
| `han-tardio` | ~168–184 d.C. | 1 (intro) | Diez Eunucos, Emp. Ling, Zhang Jiao, año Jiazi |
| `turbantes` | 184 d.C. | 1–2 | Juramento del Melocotonero, primera campaña de los tres futuros señores |
| `dong-zhuo` | 189–192 d.C. | 3–9 | He Jin, Dong Zhuo entra en Luoyang, intento de magnicidio, Coalición, Hu Lao, quema de Luoyang, Sello, Estratagema de la Belleza |
| `guerras-senores` | 192–208 d.C. | 9–37 | Li Jue/Guo Si, Cao Cao toma Yan, Xuzhou, Lü Bu Xuzhou, Acoger al Emperador, Wancheng, Yuan Shu emperador, Xiapi, Edicto del Cinturón + Cinco Pasos, Guandu, Sun Ce→Sun Quan, Wuhuan/Guo Jia, Tres Visitas |
| `chibi` | 208 d.C. | 37–50 | Caída de Jingzhou, diplomacia de Zhuge Liang, flechas de paja, cadena de barcos, Gran Fuego, huida por Hua Rong, reparto de Jing |
| `tres-reinos` | 208–220 d.C. | 50–80 | Liu Bei toma Yi, Tong Pass (Ma Chao), Xiangyang/Fan Cheng, muerte de Guan Yu, Yiling, muerte de Liu Bei |
| `guerras-ocaso` | 220–263 d.C. | 80–119 | Expediciones del norte de Zhuge Liang, Sima Yi vs Zhuge Liang, Wuzhang Yuan, caída de Shu |
| `sima` | ~249–265 d.C. | 107–119 | Incidente de Gaoping, ascenso de Sima Yi/Shi/Zhao, asesinato de Cao Mao |
| `jin` | 263–280 d.C. | 119–120 | Du Yu cruza el Yangtzé, caída de Wu, reunificación |

Estos hitos son orientativos; añade los que el rango exija.

---

## Paso 3 — Fact-check obligatorio (tres ejes)

**Obligatorio antes de escribir o expandir cualquier evento.** Verifica cada evento existente y cada evento candidato a añadir en tres ejes:

### Eje 1 — Romance de los Tres Reinos (fuente principal)

- ¿Qué capítulo cubre el evento?
- ¿Qué dice exactamente la novela? ¿Hay frases o diálogos memorables citables con `<em>…</em>`?
- ¿La descripción actual del evento es fiel a lo que dice el Romance?

### Eje 2 — Sanguo Zhi / Hou Han Shu (historia)

- ¿La historia confirma el evento? ¿Con qué fecha exacta?
- ¿Hay divergencias notables entre Romance e historia? Las divergencias más comunes:
  - Hazañas individuales transferidas entre personajes (ej. Sun Jian → Guan Yu en Hua Xiong; los Cinco Pasos son invención de Luo Guanzhong).
  - Magnitudes exageradas o suavizadas (ej. masacre de Xuzhou: la magnitud varía según la fuente).
  - Conspiraciones añadidas o eliminadas (ej. juramento del melocotonero: no histórico).
  - Profecías retroactivas (ej. Zhang Jiao y el Año Jiazi están en historia; las profecías de Yu Ji y Zuo Ci son ficción).
- Si hay divergencia notable → candidato a `<aside class="reader-hist"><strong>Nota histórica</strong>…</aside>`.

### Eje 3 — No confundir personajes similares

Atención especial a parejas confundibles:

| Confusión frecuente | Quiénes son |
|---|---|
| Yuan Shao ≠ Yuan Shu | Hermanos del clan Yuan; Shao es el mayor, Shu el menor y usurpador imperial |
| Liu Bei ≠ Liu Biao | Bei es el héroe; Biao es el gobernador de Jingzhou que lo acoge |
| Liu Bei ≠ Liu Bian (Emp. Shao) ≠ Liu Xie (Emp. Xian) | El héroe vs los dos emperadores niños |
| Cao Cao ≠ Cao Ren ≠ Cao Hong ≠ Cao Pi ≠ Cao Zhi | Señor y sus primos/hijos |
| Sun Ce ≠ Sun Quan ≠ Sun Jian | Padre y dos hijos |
| Zhang Liao ≠ Zhang Liang ≠ Zhang He ≠ Zhang Fei ≠ Zhang Jiao | Cinco hombres distintos |
| Zhuge Liang ≠ Zhuge Jin ≠ Zhuge Dan | Hermanos en facciones distintas |
| Ma Chao ≠ Ma Dai ≠ Ma Su ≠ Ma Liang | Cuatro hombres distintos |
| Li Jue ≠ Li Dian ≠ Li Ru | Generales de tres facciones distintas |

**Si detectas un error o dato dudoso en el contenido actual, adviértele al usuario antes de continuar.** No reescribas sin avisar.

---

## Paso 4 — Análisis de cobertura

Compara la línea temporal canónica (Paso 2) con los eventos actuales (Paso 1). Presenta una tabla con tres columnas:

| Evento canónico | Estado actual | Decisión |
|---|---|---|
| (cada hito imprescindible del rango) | Cubierto / Parcial / Ausente | Conservar / Pulir / Añadir / Fusionar |

Decide el número final de eventos:
- **Estándar**: 7–10 eventos por era.
- **Excepción al alza**: eras muy densas (`turbantes`, `guerras-senores`) pueden llegar a 12.
- **Excepción a la baja**: eras-puente (`han-tardio`, `jin`) pueden quedarse en 5–6.

Fusiona eventos colaterales si el total supera los 12. Corta hitos secundarios si no aportan al arco narrativo.

---

## Paso 5 — Cohesión con eras adyacentes

Lee:
- El **último evento** y el lede de la **era anterior** en `era-content.js`.
- El **lede y los primeros eventos** de la **era siguiente** en `era-content.js`.

Anota:
- ¿El primer evento de la era actual conecta con el cierre de la anterior? Idealmente, una frase del primer evento debe enlazar visualmente con el cierre del evento previo (ej. "Mientras Chang'an celebraba la muerte de Dong Zhuo, Li Jue marchaba ya sobre la ciudad").
- ¿El último evento de la era actual entrega los elementos que el lede de la siguiente da por sentados? Lista los personajes y situaciones que el lede de la siguiente menciona y verifica que aparecen aquí.
- ¿Hay personajes que aparecen "de la nada" en la era siguiente y que deberían anticiparse en esta? Caso típico: Zhou Yu, Lu Su o Sun Quan apareciendo en `chibi` sin que se les haya presentado en `guerras-senores`.

Si detectas un agujero de cohesión, anótalo como **personaje a anticipar** y asegúrate de que aparece como `char` o se menciona en el `body` de algún evento de esta era.

---

## Paso 6 — Plan de reescritura

Presenta al usuario en una sola tabla los eventos finales propuestos:

| # | Año | Tipo | Nombre del evento | Personaje destacado (char) | Nota histórica | Acción |
|---|---|---|---|---|---|---|
| 1 | … | … | … | … | Sí/No | Conservar / Pulir / Reescribir / Nuevo |

Espera confirmación del usuario antes de escribir.

---

## Paso 7 — Escribir contenido

Para cada evento del plan aprobado, redactar siguiendo el patrón de `dong-zhuo` (referencia de calidad):

### Campos del evento

- `y`: año o rango con `d.C.` (ej. `"192–195 d.C."`, `"200 d.C."`).
- `type`: una palabra o sintagma corto (ej. `"Anarquía"`, `"Batalla decisiva"`, `"Ruptura"`, `"Sucesión"`, `"Campaña fronteriza"`).
- `n`: nombre del evento. Incluye caracteres chinos cuando el evento tiene un nombre canónico en chino (ej. `"官渡之戰 — La batalla de Guandu"`, `"宛城 — Wancheng y la última noche de Dian Wei"`).
- `d`: descripción corta de 1–2 frases con gancho narrativo. Va antes del `body` y se muestra como subtítulo del evento.
- `body`: template literal con backticks. **3–4 párrafos `<p>` de ~150–250 palabras cada uno**, narración omnisciente. Usa `<em>…</em>` para frases directas del Romance traducidas. Caracteres chinos en el primer uso de términos clave (nombres, eventos canónicos, conceptos).
- `<aside class="reader-hist"><strong>Nota histórica</strong>…</aside>`: solo en eventos con divergencia Romance vs Sanguo Zhi notable. Estándar: 2–5 notas por era.
- `char`: figura central del evento.
  - `zh`: caracteres chinos (ej. `"曹操"`).
  - `en`: romanización pinyin (ej. `"Cao Cao"`).
  - `fc`: color de facción del personaje (Wei `#1e5abf`, Shu `#1e8a2e`, Wu `#bf2020`, neutrales/varios `#7a6040`, `#c9a84c`, etc.).
  - `role`: rol específico en ESTE evento, no genérico (ej. `"Inspector de Yan"` en lugar de `"Señor"`).
  - `note`: explicación del papel del personaje en el evento concreto. 2–4 frases. Evita repetir información del body.
  - `href`: `"assets/Periods/[slug-del-personaje].html"` si la ficha existe, `null` si no.

### Reglas de tono (de `feedback_fichas_tono.md`)

- **Tono directo y factual basado en el Romance**, no prosa poética.
- **Excepción**: personajes legendarios (Lü Bu, Guan Yu, Zhao Yun) — permitido recrearse en sus momentos heroicos exagerados de la novela.
- **No invenciones**. Si la fuente es ambigua, anótalo en `reader-hist`.
- Narración omnisciente, **nunca** "según las fuentes" o "el Sanguo Zhi cuenta que" en el body principal — esos juicios van en `reader-hist`.

### Sintaxis JS importante

- Strings normales con comillas dobles `"…"`.
- `body` con template literals (backticks) `` `…` ``. Permite usar comillas dobles libremente para atributos HTML.
- Caracteres chinos, acentos y eñes son UTF-8: sin escape.
- Cada objeto de evento cierra con coma. Cada array cierra con coma. Mantén la indentación de 8 espacios (igual que `dong-zhuo`).

---

## Paso 8 — Sincronizar el HTML estático

Actualiza `assets/Periods/era-[slug].html` para reflejar el reader:

1. **`.era-lede`**: copia o adapta el lede del reader (1 párrafo).
2. **`.era-prose`** (2 párrafos): versión condensada de la prose del reader. No copies literalmente — redúcelo si los párrafos del reader son largos.
3. **`<div class="timeline">`**: una `<article class="t-item">` por cada evento del reader. Estructura exacta:
   ```html
   <article class="t-item">
     <div class="t-top"><span class="t-year">[y]</span><span class="t-type">[type]</span></div>
     <h3 class="t-name">[n]</h3>
     <p class="t-desc">[descripción corta — 1–2 frases, derivada del d del reader]</p>
   </article>
   ```
4. **`<div class="chars">`**: 6–7 personajes destacados. Selecciónalos así:
   - Prioriza personajes pivotales del arco de la era.
   - Incluye al menos un personaje nuevo que aparecerá en la era siguiente, para anticipar (regla del Paso 5).
   - Estructura exacta:
   ```html
   <article class="char">
     <h3 class="char-name">[Nombre] [zh]</h3>
     <div class="char-role">[rol en esta era — corto]</div>
     <p class="char-txt">[2–4 frases con su arco en esta era específicamente]</p>
   </article>
   ```

---

## Paso 9 — Verificación final

Confirma al usuario:

1. **Eventos**: cuántos había antes (`N`), cuántos hay ahora (`M`), qué se conservó, qué se reescribió, qué se añadió.
2. **Cohesión con eras adyacentes**: era anterior (`[slug]`) y era siguiente (`[slug]`); personajes nuevos introducidos para anticipar la siguiente.
3. **Notas históricas**: lista los eventos que llevan `<aside class="reader-hist">` y el dato que cada una anota.
4. **HTML estático**: confirmar sincronía con el reader (lede, prose, timeline, chars).
5. **Imágenes pendientes**: el campo `bgImg` se deja sin tocar salvo que el usuario indique lo contrario. Si el usuario quiere imágenes en este pase, sigue la regla de `feedback_ficha_skill.md`: buscar primero en el proyecto (`assets/img/Eras/`), después en `C:\Users\usuario\Downloads`, y si no hay → omitir.
6. **Fichas y batallas pendientes**: durante la revisión puede aparecer un personaje sin ficha (sin `assets/Periods/[slug].html`) o una batalla sin página detallada. Repórtalo al usuario sugiriendo `/ficha [nombre]` o `/batalla [id]` como siguiente paso.

---

## Referencias rápidas

- **Patrón de evento extendido (calidad de referencia)**: `dong-zhuo` en `assets/js/era-content.js` (líneas ~224–369).
- **Patrón de nota histórica (`reader-hist`)**: ver `dong-zhuo` evento `Dong Zhuo ocupa Luoyang`, `han-tardio` evento `Predicación de Zhang Jiao`.
- **Patrón de char con anticipación de era siguiente**: ver `guerras-senores` evento `Sun Ce cae — Sun Quan hereda Jiangdong` (introduce Sun Quan, Zhou Yu y Lu Su antes de `chibi`).
- **CSS del reader paginado**: `assets/css/periodos.css` (no se modifica, solo se consume).
- **CSS del timeline estático**: `assets/css/era.css` (no se modifica).
