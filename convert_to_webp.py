#!/usr/bin/env python3
"""Convierte todos los PNG de assets/img/ a WebP preservando la estructura de carpetas."""

from pathlib import Path
from PIL import Image

QUALITY = 85
IMG_DIR = Path("assets/img")
SKIP_DIRS = {"referencias"}

converted = skipped = 0
total_orig = total_new = 0

for png in sorted(IMG_DIR.rglob("*.png")):
    if any(p in SKIP_DIRS for p in png.parts):
        skipped += 1
        continue
    webp = png.with_suffix(".webp")
    if webp.exists():
        skipped += 1
        continue
    with Image.open(png) as img:
        if img.mode not in ("RGB",):
            img = img.convert("RGB")
        img.save(webp, "WEBP", quality=QUALITY, method=6)
    orig_kb = png.stat().st_size / 1024
    new_kb  = webp.stat().st_size / 1024
    pct = 100 * (1 - new_kb / orig_kb)
    total_orig += orig_kb
    total_new  += new_kb
    print(f"  {png.name:44s}  {orig_kb:7.0f} KB → {new_kb:6.0f} KB  (-{pct:.0f}%)")
    converted += 1

if converted:
    pct_total = 100 * (1 - total_new / total_orig)
    print(f"\n{'='*70}")
    print(f"  Total: {total_orig/1024:.1f} MB → {total_new/1024:.1f} MB  (-{pct_total:.0f}%)")
print(f"  {converted} convertidos, {skipped} omitidos")
