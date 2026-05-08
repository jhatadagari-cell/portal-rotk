#!/usr/bin/env python3
"""Reemplaza <picture><source webp><img png></picture> por <img src=".webp">."""

import re
from pathlib import Path

HTML_DIRS = [Path("assets/Periods"), Path("assets/Battles")]

PICTURE_BLOCK = re.compile(r'<picture>.*?</picture>', re.DOTALL)

def simplify(m):
    block = m.group(0)
    webp = re.search(r'<source\s+srcset="([^"]+\.webp)"', block)
    if not webp:
        return block
    webp_url = webp.group(1)

    img = re.search(r'<img\b(.*?)/?>', block, re.DOTALL)
    if not img:
        return block

    # Todos los atributos del <img> menos src
    attrs_raw = img.group(1)
    attrs = re.sub(r'\s*src="[^"]*"', '', attrs_raw)
    attrs = ' '.join(attrs.split()).strip()

    return f'<img src="{webp_url}" {attrs} />' if attrs else f'<img src="{webp_url}" />'

updated_files = updated_tags = 0

for d in HTML_DIRS:
    if not d.exists():
        print(f"  SKIP {d}")
        continue
    for html in sorted(d.glob("*.html")):
        txt = html.read_text("utf-8")
        if '<picture>' not in txt:
            print(f"  NOOP  {html.name}")
            continue
        new_txt, n = PICTURE_BLOCK.subn(simplify, txt)
        if n:
            html.write_text(new_txt, "utf-8")
            print(f"  OK    {html.name}: {n} <picture> → <img>")
            updated_files += 1
            updated_tags += n

print(f"\n{updated_files} archivos, {updated_tags} tags simplificados")
