"""
v1-build-sitemap.py — Genera sitemap.xml desde data.js, incluyendo solo
las paginas del nucleo v1 (CHARS y BATTLES con v1: true) mas las paginas
top del sitio.

Salida: sitemap.xml en la raiz del repo.

Uso:
    python to-do/v1-build-sitemap.py
"""
from __future__ import annotations
import re
import sys
from datetime import date
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://jhatadagari-cell.github.io/portal-rotk/"
DATA = ROOT / "assets" / "js" / "data.js"
OUT = ROOT / "sitemap.xml"


def extract_root_objects(text: str, array_name: str) -> list[str]:
    """Tokeniza el contenido de un array de objetos JS, ignorando strings
    y respetando profundidad de llaves. Devuelve los `{...}` al nivel raiz."""
    m = re.search(rf"\bconst\s+{array_name}\s*=\s*\[", text)
    if not m:
        return []
    i = m.end()
    objs: list[str] = []
    depth = 0
    obj_start: int | None = None
    in_str = False
    str_char = ""
    while i < len(text):
        c = text[i]
        if in_str:
            if c == "\\":
                i += 2
                continue
            if c == str_char:
                in_str = False
            i += 1
            continue
        if c in ('"', "'", "`"):
            in_str = True
            str_char = c
            i += 1
            continue
        if c == "{":
            if depth == 0:
                obj_start = i
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0 and obj_start is not None:
                objs.append(text[obj_start : i + 1])
                obj_start = None
        elif c == "]" and depth == 0:
            return objs
        i += 1
    return objs


def field(obj_src: str, name: str) -> str | None:
    m = re.search(rf'\b{name}\s*:\s*"([^"]*)"', obj_src)
    return m.group(1) if m else None


def has_v1_true(obj_src: str) -> bool:
    return bool(re.search(r"\bv1\s*:\s*true\b", obj_src))


def main() -> int:
    text = DATA.read_text(encoding="utf-8")

    chars = extract_root_objects(text, "CHARS")
    battles = extract_root_objects(text, "BATTLES")

    nucleo_chars = [field(o, "detailHref") for o in chars if has_v1_true(o)]
    nucleo_battles = [field(o, "detailHref") for o in battles if has_v1_true(o)]
    nucleo_chars = [h for h in nucleo_chars if h]
    nucleo_battles = [h for h in nucleo_battles if h]

    print(f"  CHARS v1: {len(nucleo_chars)}")
    print(f"  BATTLES v1: {len(nucleo_battles)}")

    today = date.today().isoformat()

    def url_for(rel_path: str) -> str:
        parts = [quote(p) for p in rel_path.split("/")]
        return SITE + "/".join(parts)

    entries: list[tuple[str, str, str]] = []
    entries.append((SITE, "1.0", "weekly"))
    entries.append((url_for("acerca.html"), "0.6", "monthly"))
    entries.append((url_for("assets/batallas.html"), "0.9", "weekly"))
    entries.append((url_for("assets/mapa.html"), "0.8", "monthly"))

    for href in nucleo_chars:
        entries.append((url_for(href), "0.7", "monthly"))
    for href in nucleo_battles:
        entries.append((url_for(href), "0.6", "monthly"))

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for loc, prio, freq in entries:
        lines += [
            "  <url>",
            f"    <loc>{loc}</loc>",
            f"    <lastmod>{today}</lastmod>",
            f"    <changefreq>{freq}</changefreq>",
            f"    <priority>{prio}</priority>",
            "  </url>",
        ]
    lines.append("</urlset>")
    lines.append("")

    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"\nEscrito {OUT.name} con {len(entries)} URLs.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
