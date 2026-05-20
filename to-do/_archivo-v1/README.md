# Archivo v1.0 — CERRADO

La v1.0 del Portal ROTK quedó **completa** (bloques C1–C8). Esta carpeta conserva
la bitácora y los scripts de aquel ciclo para referencia histórica.

- `v1-progreso.md` — bitácora completa de la v1 (estado final al cierre).
- `v1-mark-nucleo.js` — marcó `v1: true` en fichas/batallas del núcleo. Ya no se usa.
- `v1-migrate-chrome.py` — migró las páginas al chrome compartido. Ya no se usa.
- `v1-inject-og.py` — **reutilizable**: re-correr si se añaden páginas y hay que
  refrescar los bloques OG/Twitter.
- `v1-build-sitemap.py` — **reutilizable**: re-correr para regenerar `sitemap.xml`
  tras añadir contenido nuevo.

Backlog opcional pendiente (no bloqueante, ver bitácora): I1 páginas de Reino ·
I2 bubbles linkeables · I3 glosario · I4 filtros de batallas.
