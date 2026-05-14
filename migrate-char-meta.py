#!/usr/bin/env python3
"""
Migración: propaga los cambios de ficha a todos los personajes.

Acciones por fichero (solo en fichas con char-banner):
  1. Elimina <header class="char-banner">...</header>
  2. Elimina <div class="eyebrow">...</div>
  3. Añade factions.js + char-meta.js tras data.js (si no están ya)
"""

import re
import sys
from pathlib import Path

PERIODS = Path("assets/Periods")

BANNER_RE = re.compile(
    r'\n?[ \t]*<header class="char-banner">.*?</header>[ \t]*\n?',
    re.DOTALL
)
EYEBROW_RE = re.compile(
    r'[ \t]*<div class="eyebrow">.*?</div>\n?'
)
DATA_JS = '<script src="../js/data.js"></script>'
INJECT = (
    '<script src="../js/data.js"></script>\n'
    '    <script src="../js/factions.js"></script>\n'
    '    <script src="../js/char-meta.js"></script>'
)

updated = []
skipped = []

for path in sorted(PERIODS.glob("*.html")):
    text = path.read_text(encoding="utf-8")

    # Only touch character fichas (those that had a char-banner)
    if 'class="char-banner"' not in text:
        skipped.append(path.name)
        continue

    original = text

    # 1. Remove char-banner
    text = BANNER_RE.sub("\n", text)

    # 2. Remove eyebrow div
    text = EYEBROW_RE.sub("", text)

    # 3. Inject script tags (idempotent)
    if "char-meta.js" not in text and DATA_JS in text:
        text = text.replace(DATA_JS, INJECT)

    if text != original:
        path.write_text(text, encoding="utf-8")
        updated.append(path.name)
    else:
        skipped.append(path.name)

print(f"\nActualizadas : {len(updated)}")
print(f"Sin cambios  : {len(skipped)}")
if updated:
    print("\nFicheros modificados:")
    for name in updated:
        print(f"  ✓ {name}")
if skipped:
    print("\nFicheros omitidos (era pages / ya migrados):")
    for name in skipped:
        print(f"  – {name}")
