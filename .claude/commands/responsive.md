# Skill: Responsive · Portal ROTK

Agente validador de responsiveness para el Portal ROTK. Audita elementos, propone soluciones con previsualizaciones cuando hay ambigüedad, e implementa los cambios CSS necesarios para mobile.

**Objetivo solicitado:** $ARGUMENTS

---

## Contexto del proyecto

El Portal ROTK usa:
- **Nav altura:** `--nav-h: 58px` (variable CSS en `:root` de `main.css`)
- **Breakpoints establecidos:** `640px` (mobile), `900px` (tablet/medium)
- **Archivos CSS principales:** `assets/css/main.css`, `assets/css/chrome.css`, fichas individuales en `assets/css/[slug].css`
- **Estética:** dark, cinematic, caligrafía china — las soluciones deben mantener ese tono
- **Bottom-right reservado** para el botón scroll-to-top (no colocar elementos ahí)
- **Safe area iOS:** usar `env(safe-area-inset-bottom, 0px)` en elementos con `bottom` fijo

---

## Paso 1 — Entender el objetivo

Si `$ARGUMENTS` está vacío → haz una **auditoría general**:
1. Lee `assets/css/main.css` y `assets/css/chrome.css`
2. Busca elementos `position:fixed` o `position:sticky` sin media queries mobile
3. Busca elementos con `left`/`right` fijos en px que puedan salirse en pantallas pequeñas
4. Busca grids con `grid-template-columns` sin `auto-fit` ni breakpoints
5. Devuelve una lista priorizada de problemas

Si `$ARGUMENTS` describe un elemento concreto → audita solo ese elemento.

---

## Paso 2 — Auditar el elemento

Lee el CSS del elemento. Extrae:
- Posicionamiento (`position`, `top`, `left`, `right`, `bottom`, `z-index`)
- Dimensiones (`width`, `height`, `min-width`, `max-width`)
- Layout (`display`, `flex-direction`, `grid-template-columns`)
- Media queries existentes
- JavaScript que lo controla (si lo hay)

Determina el problema: ¿se superpone a contenido? ¿se sale de pantalla? ¿queda inaccesible?

---

## Paso 3 — Proponer (cuando hay ambigüedad)

Si hay más de una solución razonable, **SIEMPRE presenta opciones** antes de implementar. Usa AskUserQuestion con:
- 2-4 opciones máximo
- Cada opción con un `preview` ASCII que muestre el comportamiento mobile
- Descripción clara de pros/cons

**No implementes sin confirmación cuando haya ambigüedad de diseño.**

Si la solución es obvia (ej. añadir `overflow:hidden` a un wrapper), impleméntala directamente e informa.

---

## Paso 4 — Implementar

Al implementar un fix responsive:

1. **Añade al final del CSS afectado** (o en el bloque `@media` existente si lo hay):
```css
@media(max-width:640px){
  /* ── [nombre del elemento] mobile ── */
  /* cambios */
}
```

2. **Prioriza estas técnicas** según el caso:
   - Elementos flotantes que solapan: mover a `bottom` del viewport con `translateY` + `env(safe-area-inset-bottom)`
   - Texto vertical → horizontal en mobile si mejora legibilidad
   - Columnas fijas → `auto-fit, minmax()` o single column
   - Padding/margin en px → ajustar a valores menores en `640px`
   - `font-size` en px → considerar `clamp()` o reducción proporcional

3. **Nunca uses `!important`** salvo que sea el único camino.

4. **Mantén la animación** si existe — adapta los valores del `transform` preservando el easing original.

---

## Paso 5 — Validar

Tras el fix, describe exactamente **qué comprobar en DevTools mobile**:

```
Para validar este fix:
1. Abre DevTools → Toggle device toolbar → iPhone SE (375px)  
2. [acción específica que activa el elemento]
3. Verifica: [lo que debe verse]
4. Comprueba también en: iPhone 14 Pro (393px), Galaxy S21 (360px)
5. Caso edge: [si hay un caso especial a revisar]
```

---

## Reglas de estilo para soluciones

- **Píldoras / chips flotantes:** usar `border-radius: 4px`, borde izquierdo con color de acento, fondo oscuro semitransparente
- **Bandas horizontales:** 32-40px de altura, fuente Cinzel Decorative o IM Fell English, color de era al 12% de opacidad de fondo
- **Animaciones:** mantener `cubic-bezier(.34,1.12,.64,1)` para slide-in con overshoot leve
- **Tipografía:** `font-size` mínimo 13px en mobile para legibilidad
- **Touch targets:** mínimo 44×44px para elementos interactivos
