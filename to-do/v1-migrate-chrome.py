"""
v1-migrate-chrome.py — migración masiva de fichas y batallas individuales al chrome compartido.

Para cada `.html` en assets/Periods/ y assets/Battles/:
  1. Añade data-page-section al <html>.
  2. Inserta <link rel="stylesheet" href="../css/chrome.css"> tras el último link a ../css/*.css.
  3. Sustituye <header id="hdr">…</header> por <div id="chrome-nav"></div>.
  4. Inserta <div id="chrome-footer"></div> + <script src="../../assets/js/chrome.js"></script> antes de </body>.

Idempotente: si el archivo ya tiene id="chrome-nav", se salta.

Uso:
  python to-do/v1-migrate-chrome.py            # dry-run, no escribe
  python to-do/v1-migrate-chrome.py --apply    # escribe los cambios
  python to-do/v1-migrate-chrome.py --file assets/Periods/cao-cao.html --apply  # solo un archivo
"""
import os
import re
import sys
import argparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGETS = [
    (os.path.join(ROOT, "assets", "Periods"),  "personajes"),
    (os.path.join(ROOT, "assets", "Battles"),  "batallas"),
]

# <html ...>  (1 grupo)
HTML_TAG_RE = re.compile(r'<html\b([^>]*)>', re.IGNORECASE)

# Match <link ...href="../css/algo.css"...>  (cualquier link a un CSS local en ../css/)
LOCAL_CSS_LINK_RE = re.compile(
    r'<link\b[^>]*href\s*=\s*"\.\./css/[^"]+\.css"[^>]*/?>',
    re.IGNORECASE
)

# <header id="hdr"> ... </header>  (greedy hasta el primer </header>)
HEADER_HDR_RE = re.compile(
    r'<header\b[^>]*\bid\s*=\s*"hdr"[^>]*>.*?</header>',
    re.IGNORECASE | re.DOTALL
)

BODY_END_RE = re.compile(r'</body>', re.IGNORECASE)
ALREADY_DONE_RE = re.compile(r'id\s*=\s*"chrome-nav"')


def migrate(content: str, section: str):
    """Devuelve (new_content, status). Status: 'ok' | 'skip' | 'no-header' | 'no-css-link'."""
    if ALREADY_DONE_RE.search(content):
        return content, "skip"

    # 1. data-page-section en <html>
    def add_section(m):
        attrs = m.group(1)
        if 'data-page-section' in attrs:
            return m.group(0)
        return f'<html{attrs} data-page-section="{section}">'

    new_content, n = HTML_TAG_RE.subn(add_section, content, count=1)
    if n == 0:
        return content, "no-html-tag"
    content = new_content

    # 2. Insertar <link> a chrome.css después del último link a ../css/*.css
    matches = list(LOCAL_CSS_LINK_RE.finditer(content))
    if not matches:
        return content, "no-css-link"
    last = matches[-1]
    chrome_link = '\n<link rel="stylesheet" href="../css/chrome.css">'
    content = content[:last.end()] + chrome_link + content[last.end():]

    # 3. Reemplazar <header id="hdr">…</header> por <div id="chrome-nav"></div>
    new_content, n = HEADER_HDR_RE.subn('<div id="chrome-nav"></div>', content, count=1)
    if n == 0:
        return content, "no-header"
    content = new_content

    # 4. Insertar chrome-footer + script antes de </body>
    chrome_tail = '\n<div id="chrome-footer"></div>\n<script src="../../assets/js/chrome.js"></script>\n'
    content, n = BODY_END_RE.subn(chrome_tail + '</body>', content, count=1)
    if n == 0:
        return content, "no-body-end"

    return content, "ok"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true', help='Escribe los cambios. Sin esta flag, solo simula.')
    ap.add_argument('--file', help='Migrar solo un archivo concreto (ruta relativa al repo).')
    args = ap.parse_args()

    files = []
    if args.file:
        # Decidir sección por carpeta
        full = os.path.join(ROOT, args.file) if not os.path.isabs(args.file) else args.file
        section = "personajes" if "Periods" in full else "batallas"
        files.append((full, section))
    else:
        for dir_path, section in TARGETS:
            for name in sorted(os.listdir(dir_path)):
                if name.endswith('.html'):
                    files.append((os.path.join(dir_path, name), section))

    counts = {}
    for path, section in files:
        with open(path, encoding='utf-8') as f:
            original = f.read()
        new_content, status = migrate(original, section)
        counts[status] = counts.get(status, 0) + 1

        rel = os.path.relpath(path, ROOT).replace('\\', '/')
        marker = '·' if status == 'ok' else '!' if status not in ('skip',) else '='
        print(f"  {marker} [{status:14}] {rel}")

        if args.apply and status == 'ok' and new_content != original:
            with open(path, 'w', encoding='utf-8', newline='\n') as f:
                f.write(new_content)

    print()
    print("Resumen:", ", ".join(f"{k}={v}" for k, v in sorted(counts.items())))
    print("Modo:", "APLICADO" if args.apply else "DRY-RUN (usa --apply para escribir)")


if __name__ == '__main__':
    main()
