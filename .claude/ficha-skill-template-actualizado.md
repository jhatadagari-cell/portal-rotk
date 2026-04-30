# Template HTML Actualizado para Skill /ficha

Este es el template del Paso 6 **actualizado** para incluir la navegación de secciones.

Reemplaza el template HTML en el Paso 6 de tu skill `/ficha` con este:

```html
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>[en] · Ficha Completa</title>
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
  <a href="#presentacion" class="sec-link active">Presentación</a>
  <a href="#relaciones" class="sec-link">Relaciones Clave</a>
  <a href="#eras" class="sec-link">Eras</a>
  <a href="#legado" class="sec-link soon">Legado · Próximamente</a>
</nav>

<main class="wrap">
  <section class="hero" id="presentacion">
    <!-- Incluir solo si hay imagen -->
    <div class="hero-media">
      <img src="../img/[en]/[en].png" alt="[en]" />
    </div>
    <!-- /imagen -->
    <div class="hero-copy">
      <div class="eyebrow">Ficha completa</div>
      <h1 class="title">[en] · [zi o zh]</h1>
      <p class="subtitle">[frase corta y evocadora, 1-2 líneas]</p>
      <blockquote class="hero-quote">
        <span class="quote-mark">"</span>
        [cita o frase narrativa característica]
      </blockquote>
      <p class="lede">[párrafo introductorio evocador, 2-3 frases]</p>
    </div>
  </section>

  <section class="intro">
    <p>[Párrafo general sobre el arco del personaje en la novela, 2-3 frases que sitúen al lector.]</p>
  </section>

  <section class="era-block" id="relaciones">
    <h2 class="sec-title">Relaciones Clave</h2>
    <div class="era-grid">
      <article class="era-card">
        <h3>[Nombre de relación 1]</h3>
        <p>[2-3 frases sobre esta relación]</p>
      </article>
      <article class="era-card">
        <h3>[Nombre de relación 2]</h3>
        <p>[2-3 frases sobre esta relación]</p>
      </article>
    </div>
  </section>

  <!-- Repetir para cada era en c.eras, alternando sin/con "alt" -->
  <section class="era-block alt" id="eras">
    <h2 class="sec-title">[nombre era en español]</h2>
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
  </section>

  <section class="epilogue" id="legado">
    <h2>Epílogo</h2>
    <p>[Párrafo final sobre el legado o la muerte del personaje. Cierre literario.]</p>
  </section>
</main>

  <script src="../js/data.js"></script>
  <script src="../js/inline-links.js"></script>
</body>
</html>
```

## Cambios realizados:

1. **Navegación añadida** (después de `</header>`):
   ```html
   <nav class="sec-nav">
     <a href="#presentacion" class="sec-link active">Presentación</a>
     <a href="#relaciones" class="sec-link">Relaciones Clave</a>
     <a href="#eras" class="sec-link">Eras</a>
     <a href="#legado" class="sec-link soon">Legado · Próximamente</a>
   </nav>
   ```

2. **IDs en secciones**:
   - `<section class="hero" id="presentacion">`
   - `<section class="era-block" id="relaciones">` (Relaciones Clave)
   - `<section class="era-block alt" id="eras">` (Primera era)
   - `<section class="epilogue" id="legado">`

## CSS necesario:

Agregar esto a **Paso 5** (después del `.hb:hover`):

```css
.sec-nav{display:flex;gap:12px;padding:12px 20px;background:rgba(255,255,255,.02);border-bottom:1px solid rgba(255,255,255,.08);position:sticky;top:0;z-index:100;flex-wrap:wrap;justify-content:center}
.sec-link{font-family:'Cinzel Decorative',serif;font-size:12px;padding:8px 12px;border-radius:3px;color:var(--gold);text-decoration:none;transition:background .22s,color .22s;border:1px solid transparent;scroll-behavior:smooth}
.sec-link:hover:not(.soon){background:rgba(var(--gold-rgb),.08)}
.sec-link.active{background:rgba(var(--gold-rgb),.15);border-color:rgba(var(--gold-rgb),.3)}
.sec-link.soon{opacity:.45;cursor:not-allowed}
```

## Instrucciones para actualizar el `/ficha` skill:

1. Abre tu configuración de Claude Code/Project Settings
2. Busca la skill `ficha` (probablemente en projectSettings)
3. En el **Paso 5 — Crear CSS**, busca `@media(max-width:640px)` y ANTES de esa línea, agrega el CSS anterior
4. En el **Paso 6 — Crear HTML**, reemplaza el template completo con el que aparece arriba
5. Guarda los cambios

Ahora cualquier ficha creada con `/ficha` incluirá automáticamente la navegación.
