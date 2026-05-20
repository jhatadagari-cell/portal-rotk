"""
v1-inject-og.py — Inserta meta tags Open Graph y Twitter Card en todas
las paginas HTML del sitio. Idempotente: localiza el bloque marcado por
los comentarios sentinela y lo reemplaza completo en cada ejecucion.

Uso:
    python to-do/v1-inject-og.py            # dry-run, no escribe
    python to-do/v1-inject-og.py --apply    # aplica cambios

Diseno:
- Los crawlers sociales (Twitter, Facebook, LinkedIn, Slack, Discord) no
  ejecutan JS. Por eso los og:* y twitter:* tienen que estar en el HTML
  inicial, no inyectados por chrome.js.
- Si la pagina ya trae <meta name="description">, NO la duplicamos: el
  bloque omite description pero conserva og:description y twitter:description.
- og:image apunta siempre a og-default.png (URL absoluta de GH-Pages).
- og:url es absoluta, generada desde la ruta del fichero.
"""
from __future__ import annotations
import re
import sys
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://jhatadagari-cell.github.io/portal-rotk/"
OG_IMAGE = SITE + "assets/img/og-default.png"
SITE_NAME = "Portal ROTK"

START = "<!-- v1-og:start -->"
END = "<!-- v1-og:end -->"


def page_url(rel: Path) -> str:
    parts = [quote(p) for p in rel.parts]
    if parts and parts[-1] == "index.html":
        parts = parts[:-1]
    return SITE + "/".join(parts)


def title_of(html: str) -> str:
    m = re.search(r"<title>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
    return m.group(1).strip() if m else "Portal ROTK"


def main_subject(title: str) -> str:
    return title.split("·")[0].strip()


def section(rel: Path) -> str:
    s = str(rel).replace("\\", "/")
    if s.startswith("assets/Periods/"):
        return "ficha"
    if s.startswith("assets/Battles/"):
        return "batalla"
    if s == "index.html":
        return "home"
    if s == "acerca.html":
        return "acerca"
    if s == "404.html":
        return "404"
    if s.endswith("batallas.html"):
        return "listado-batallas"
    if s.endswith("mapa.html"):
        return "mapa"
    return "otro"


def description_for(rel: Path, title: str) -> str:
    sec = section(rel)
    subj = main_subject(title)
    if sec == "ficha":
        return (
            f"Ficha de {subj} en el Romance de los Tres Reinos. "
            f"Biografia, hechos clave, batallas y relaciones segun la novela de Luo Guanzhong."
        )
    if sec == "batalla":
        m = re.match(r"Battle of (.+)", subj, re.IGNORECASE)
        name = m.group(1) if m else subj
        return (
            f"Batalla de {name} en el Romance de los Tres Reinos. "
            f"Bandos, desarrollo y consecuencias segun la novela de Luo Guanzhong."
        )
    if sec == "home":
        return (
            "Portal de fandom dedicado al Romance de los Tres Reinos. "
            "Fichas de personajes, batallas, mapa interactivo y eras del ocaso del Han a la unificacion Jin."
        )
    if sec == "acerca":
        return (
            "Sobre Portal ROTK: alcance, fuentes textuales "
            "(Luo Guanzhong, Chen Shou, Pei Songzhi), creditos y autoria."
        )
    if sec == "listado-batallas":
        return (
            "Listado de batallas del Romance de los Tres Reinos: "
            "Guandu, Chibi, Yiling y otras decisivas del periodo 184–280."
        )
    if sec == "mapa":
        return (
            "Mapa interactivo de la China de los Tres Reinos: "
            "13 provincias (州), ciudades clave y emplazamientos de los senores feudales."
        )
    if sec == "404":
        return "Pagina no encontrada en el Portal ROTK."
    return "Portal ROTK."


def og_type(rel: Path) -> str:
    return "website" if section(rel) in ("home", "acerca") else "article"


def build_block(url: str, title: str, desc: str, kind: str, include_description: bool) -> str:
    def e(s: str) -> str:
        return s.replace('&', '&amp;').replace('"', '&quot;')

    lines = [START]
    if include_description:
        lines.append(f'<meta name="description" content="{e(desc)}">')
    lines += [
        f'<meta property="og:site_name" content="{e(SITE_NAME)}">',
        f'<meta property="og:type" content="{kind}">',
        f'<meta property="og:title" content="{e(title)}">',
        f'<meta property="og:description" content="{e(desc)}">',
        f'<meta property="og:url" content="{url}">',
        f'<meta property="og:image" content="{OG_IMAGE}">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        '<meta name="twitter:card" content="summary_large_image">',
        f'<meta name="twitter:title" content="{e(title)}">',
        f'<meta name="twitter:description" content="{e(desc)}">',
        f'<meta name="twitter:image" content="{OG_IMAGE}">',
        END,
    ]
    return "\n".join(lines)


BLOCK_RE = re.compile(re.escape(START) + r".*?" + re.escape(END), re.DOTALL)
HEAD_RE = re.compile(r"(<head[^>]*>)(.*?)(</head>)", re.IGNORECASE | re.DOTALL)
FIRST_LINK_RE = re.compile(r"\s*<link\b", re.IGNORECASE)
DESC_RE = re.compile(r'<meta\s+name=["\']description["\']', re.IGNORECASE)


def process(path: Path, apply: bool) -> tuple[bool, str]:
    rel = path.relative_to(ROOT)
    html = path.read_text(encoding="utf-8")

    title = title_of(html)
    desc = description_for(rel, title)
    url = page_url(rel)
    kind = og_type(rel)

    cleaned = BLOCK_RE.sub("", html)
    has_existing_desc = bool(DESC_RE.search(cleaned))
    block = build_block(url, title, desc, kind, include_description=not has_existing_desc)

    m = HEAD_RE.search(cleaned)
    if not m:
        return False, "no <head>"
    head_open, head_inner, head_close = m.group(1), m.group(2), m.group(3)

    lm = FIRST_LINK_RE.search(head_inner)
    if lm:
        new_inner = head_inner[: lm.start()] + "\n" + block + "\n" + head_inner[lm.start():]
    else:
        new_inner = head_inner.rstrip() + "\n" + block + "\n"

    new_html = cleaned[: m.start()] + head_open + new_inner + head_close + cleaned[m.end():]

    if new_html == html:
        return False, "no change"

    if apply:
        path.write_text(new_html, encoding="utf-8")
    return True, "updated" if apply else "would update"


def main() -> int:
    apply = "--apply" in sys.argv
    targets: list[Path] = [
        ROOT / "index.html",
        ROOT / "acerca.html",
        ROOT / "404.html",
        ROOT / "assets" / "batallas.html",
        ROOT / "assets" / "mapa.html",
    ]
    targets += sorted((ROOT / "assets" / "Periods").glob("*.html"))
    targets += sorted((ROOT / "assets" / "Battles").glob("*.html"))

    changed = 0
    for p in targets:
        if not p.exists():
            print(f"  ?  missing: {p.relative_to(ROOT)}")
            continue
        ok, msg = process(p, apply)
        prefix = "  +  " if ok else "  =  "
        print(f"{prefix}{msg}: {p.relative_to(ROOT)}")
        if ok:
            changed += 1

    mode = "APPLIED" if apply else "DRY-RUN (re-run with --apply)"
    print(f"\n{mode} - {changed}/{len(targets)} files would change")
    return 0


if __name__ == "__main__":
    sys.exit(main())
