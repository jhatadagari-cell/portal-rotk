#!/usr/bin/env python3
"""Envuelve cada <img src="...img/...png"> en <picture> con <source> WebP."""

import re
from pathlib import Path

HTML_DIRS = [Path("assets/Periods")]

PATTERN = re.compile(
    r'(<img\b[^>]*\bsrc="(\.\./img/[^"]+\.png)"[^>]*/?>)',
    re.DOTALL
)

def wrap(m):
    img_tag  = m.group(1)
    png_src  = m.group(2)
    webp_src = png_src[:-4] + ".webp"
    return (f'<picture>\n'
            f'          <source srcset="{webp_src}" type="image/webp" />\n'
            f'          {img_tag}\n'
            f'        </picture>')

updated_files = updated_tags = 0

for d in HTML_DIRS:
    if not d.exists():
        print(f"  SKIP dir {d} (no existe)")
        continue
    for html in sorted(d.glob("*.html")):
        txt = html.read_text("utf-8")
        if '<source srcset="' in txt:
            print(f"  SKIP  {html.name} (ya tiene <picture>)")
            continue
        new_txt, n = PATTERN.subn(wrap, txt)
        if n:
            html.write_text(new_txt, "utf-8")
            print(f"  OK    {html.name}: {n} img(s) → <picture>")
            updated_files += 1
            updated_tags  += n
        else:
            print(f"  NOOP  {html.name}")

print(f"\n{updated_files} archivos modificados, {updated_tags} tags actualizados")
