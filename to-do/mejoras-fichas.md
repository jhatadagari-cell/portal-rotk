# Mejoras de fichas de personaje — Ideas

Análisis comparativo (2026-05) frente a threekingdoms.wiki. **Principio rector:**
no copiar el formato enciclopédico/estático. Cada mejora debe ser **dinámica,
interactiva y acorde a nuestra estética narrativa**, reutilizando componentes que
ya tenemos (sliders de era/año, paneles al clic) cuando sea posible.

> ❌ **Descartado: infobox "Datos clave" estándar.** Se prototipó (banda horizontal
> bajo el hero) y se descartó: aunque es el estándar wiki, choca con nuestra estética.
> Los datos duros deben vivir dentro de secciones vivas (abajo), no en una tabla.

---

## Estética "ancient China" (Cao Cao, en curso 2026-05)
Capas aplicadas a la pestaña Relaciones de `cao-cao.html`, todas autocontenidas
(filtros/texturas SVG nativos, sin dependencias):
- [x] **Filtro tinta/pincel** `#ink-brush` (feTurbulence+feDisplacementMap): conectores
  del árbol como trazos de pincel + aros de tinta alrededor de los retratos.
- [x] **Caligrafía de pincel** (Ma Shan Zheng, Google Fonts): 曹氏 del título y
  caracteres placeholder del árbol.
- [x] **Sello rojo 印章** 曹 estampado en la esquina del linaje.
- [x] **Pergamino Wei**: superficie de papel envejecido en paleta Wei (azul-acero)
  aplicada a TODA la página de Relaciones (`.wrap-page[data-page="relaciones"]`):
  grano + manchado + viñeta + pátina dorada. Cohesiona árbol y círculos.
- [ ] **Animación de trazo** (pendiente): que el linaje "se pinte" al abrir (stroke-dashoffset).
- [ ] Propagar a otras fichas con su sello (劉 Liu Bei, 孫 Sun Quan…). Hook `--lineage-bg`
  disponible si se quiere imagen 水墨 de fondo.

## Prioridad alta — nuestro lenguaje visual

- [x] **Árbol genealógico (Casa de Cao)** — interactivo ✅ (Cao Cao, 2026-05)
  Implementado en la pestaña "Relaciones Clave" de `cao-cao.html`, al inicio, como
  bloque `.lineage` con divisor antes del slider de eras. Nodos circulares (estilo
  burbuja) conectados por líneas: Cao Teng → Cao Song → (Lady Ding · Cao Cao · Lady Bian)
  → 6 hijos (Ang · Pi · Zhang · Zhi · Chong · Jie). Al clic reutilizan el `#rel-panel`
  existente (badge + nombre + descripción). CSS en `cao-cao.css` con hook `--lineage-bg`
  para imagen de fondo futura. Pendiente: retratos faltantes (Cao Teng, Cao Song,
  Lady Ding, Cao Ang, Cao Zhang, Cao Chong, Cao Jie usan placeholder de carácter).
  Plantilla a propagar a otras fichas con su propia familia.
  · Cohesión (2026-05): toda la pestaña "Relaciones" se reestructuró con marco
    narrativo (intro + lede) y dos sub-bloques rotulados: "La Casa de Cao 曹氏"
    (árbol) y "El Tejido de Alianzas 縱橫" (slider de eras). Se eliminó la
    duplicación: la familia (Cao Pi, Cao Zhi, Lady Bian) vive SOLO en el árbol;
    se quitaron de los círculos. El árbol tiene su propio panel (#tree-panel)
    para no saltar al de los círculos.

- [ ] **Timeline de progresión de poder** — el dato duro hecho narrativa
  Eje temporal donde se ve crecer su **título, tierras, ejércitos** a lo largo de la vida:
  Magistrado → Canciller de Jinan → Marqués → Canciller Imperial 丞相 → Duque de Wei (213)
  → Rey de Wei (216) → (póstumo) Emperador Wu 魏武帝 / templo Taizu 太祖.
  Idea: reutilizar el patrón del slider de años de Batallas; al mover el año, se actualizan
  título vigente, capital (Xuchang → Ye), tamaño aproximado del ejército y territorio.
  Aquí caben de forma natural los datos del infobox descartado (fechas, dignidades, capital).

## Prioridad media — alto encaje con la voz del portal

- [ ] **"El Poeta del Norte"** — sección de poemas interactiva
  观沧海 (Contemplando el Mar) y 短歌行 (Canción Breve) en chino + traducción + contexto,
  en tarjetas que despliegan al clic (verso ↔ traducción ↔ nota). Conecta con la literatura
  Jian'an (建安文学) ya mencionada en el epílogo.

- [ ] **"El juicio de la historia"** — slider temporal de reputación
  Cómo se valoró a Cao Cao a través de los siglos: contemporáneos (Xu Shao) → Chen Shou
  (Sanguo Zhi) → Pei Songzhi → Sima Guang (crítica de usurpación) → ópera Ming-Qing
  (villano cara blanca) → siglo XX (rehabilitación, Mao) → tumba de Gaoling 2009.
  Reutiliza el mismo componente slider que usamos en Relaciones.

## Prioridad baja — toques de color

- [ ] **Folclore y cultura popular** — bloque corto
  Dicho 说曹操，曹操到 ("hablando del rey de Roma…"), el "Cao Cao de cara blanca" de la
  ópera de Pekín, hallazgo de la tumba Gaoling en Anyang (2009).

- [ ] **Fuentes / referencias** — pie de credibilidad
  Consolidar las fuentes que ya citamos inline (Sanguo Zhi, Pei Songzhi, de Crespigny).

---

## Ignorar deliberadamente (ruido enciclopédico)
Granularidad de cargos administrativos año a año, tablas exhaustivas de adaptaciones a
videojuegos/TV, detalle arqueológico de ADN. Matarían el dinamismo de la lectura.

> Nota: estas mejoras, una vez validadas en Cao Cao, son plantillas a propagar a las
> demás fichas (empezando por Liu Bei y Sun Quan).
