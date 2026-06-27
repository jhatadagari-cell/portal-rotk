#!/usr/bin/env python3
"""
assemble-char-sprites.py — Ensambla assets/img/char-sprites.png a partir de un
sprite sheet de arte externo (p.ej. generado por IA).

ENTRADA esperada: una imagen con 8 columnas × 3 filas de personajes sobre fondo
BLANCO o transparente, en este orden:
    columnas: S · SE · E · NE · N · NW · W · SW   (giro completo)
    filas:    idle · walkA (una pierna) · walkB (la otra pierna)
Las columnas/filas NO necesitan estar perfectamente alineadas: el script detecta
cada sprite por su contenido, recorta, escala uniforme y alinea por PIES (línea
de suelo) y CENTRO de cuerpo, de modo que la animación no bota ni se desliza.

SALIDA: assets/img/char-sprites.png — 8×3 celdas de 48×72, fondo transparente,
pies a 5px del fondo de cada celda (coincide con FEET=H-5 de hac-folk.js).
El color de la túnica lo recolorea hac-char.js en tiempo de ejecución; aquí solo
se conserva el tono original del arte.

Uso:  python3 tools/assemble-char-sprites.py <sheet-entrada.png>
Requiere: Pillow, numpy.
"""
import sys, os
from PIL import Image
import numpy as np

COLS = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW']
NROWS = 3
OW, OH = 48, 72          # tamaño de celda de salida (px en pantalla a SCALE=2)
TARGET_H = 60.0          # altura objetivo del personaje más alto (cabeza→pies)
BASELINE = OH - 5        # Y de los pies dentro de la celda
CENTERX = OW // 2

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets/img/char-sprites.png')


def runs(mask, gap):
    out, start, last = [], None, None
    for i, v in enumerate(mask):
        if v:
            if start is None:
                start = i
            last = i
        elif start is not None and i - last > gap:
            out.append((start, last)); start = None
    if start is not None:
        out.append((start, last))
    return out


def main(src_path):
    src = Image.open(src_path).convert('RGBA')
    arr = np.array(src)
    rgb, alpha = arr[:, :, :3], arr[:, :, 3]
    content = ~(((rgb > 240).all(axis=2)) | (alpha < 10))

    crun = runs(content.any(axis=0), gap=40)
    rrun = runs(content.any(axis=1), gap=10)
    if len(crun) != 8 or len(rrun) != NROWS:
        sys.exit(f'Esperaba 8 columnas × {NROWS} filas, detecté {len(crun)}×{len(rrun)}. '
                 'Revisa el fondo (blanco/transparente) y la separación entre sprites.')

    # bbox tight + pies + centro de cuerpo por sprite
    boxes = {}
    for ri, (ry0, ry1) in enumerate(rrun):
        for ci, (cx0, cx1) in enumerate(crun):
            sub = content[ry0:ry1 + 1, cx0:cx1 + 1]
            ys, xs = np.where(sub)
            top, bot, left, right = ys.min(), ys.max(), xs.min(), xs.max()
            upper = sub[top:top + int((bot - top) * 0.45)]
            _, ux = np.where(upper)
            bcx = int(np.median(ux))
            boxes[(ci, ri)] = dict(top=ry0 + top, feetY=ry0 + bot,
                                   left=cx0 + left, right=cx0 + right, bcx=cx0 + bcx)

    tall = max(b['feetY'] - b['top'] for b in boxes.values())
    s = TARGET_H / tall

    sheet = Image.new('RGBA', (OW * 8, OH * NROWS), (0, 0, 0, 0))
    for ri in range(NROWS):
        for ci in range(8):
            b = boxes[(ci, ri)]
            crop = src.crop((b['left'], b['top'], b['right'] + 1, b['feetY'] + 1)).convert('RGBA')
            a = np.array(crop)
            white = (a[:, :, 0] > 240) & (a[:, :, 1] > 240) & (a[:, :, 2] > 240)
            a[white, 3] = 0
            crop = Image.fromarray(a)
            sc = crop.resize((max(1, round(crop.width * s)), max(1, round(crop.height * s))), Image.LANCZOS)
            bcx_local = (b['bcx'] - b['left']) * s
            feet_local = (b['feetY'] - b['top']) * s
            px = ci * OW + CENTERX - round(bcx_local)
            py = ri * OH + BASELINE - round(feet_local)
            sheet.alpha_composite(sc, (px, py))

    sheet.save(OUT)
    print(f'✓ {OUT}  ({sheet.width}×{sheet.height}, celda {OW}×{OH}, escala {s:.4f})')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('Uso: python3 tools/assemble-char-sprites.py <sheet-entrada.png>')
    main(sys.argv[1])
