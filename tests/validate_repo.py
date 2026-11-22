#!/usr/bin/env python3
"""Static integrity checks for FrutiDry (Astral Sanctuary). Python standard library only.

Use: python tests/validate_repo.py
Requires Node.js on PATH for JavaScript syntax checking; game runtime does not.
"""
from __future__ import annotations

import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
WEBP_REF = re.compile(r"assets/[A-Za-z0-9_./-]+\.webp")
problems: list[str] = []


def fail(message: str) -> None:
    problems.append(message)


class LocalReferences(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        data = dict(attrs)
        for field in ("src", "href"):
            value = data.get(field)
            if value and not value.startswith(("#", "http:", "https:", "data:", "mailto:")):
                self.links.add(value.split("?", 1)[0])


try:
    manifest = json.loads((ASSETS / "manifest.json").read_text(encoding="utf-8"))
    entries = manifest["assets"]
    if not isinstance(entries, dict) or not entries:
        raise ValueError("El manifiesto no contiene recursos")
except (OSError, ValueError, KeyError, TypeError) as error:
    print("ERROR: assets/manifest.json:", error, file=sys.stderr)
    sys.exit(1)

on_disk = {path.relative_to(ASSETS).as_posix() for path in ASSETS.rglob("*.webp")}
listed = set(entries)
for name in sorted(on_disk - listed):
    fail(f"Recurso WebP sin manifestar: {name}")
for name in sorted(listed - on_disk):
    fail(f"Recurso manifestado inexistente: {name}")
for name, expected in entries.items():
    path = ASSETS / name
    if not path.is_file():
        continue
    raw = path.read_bytes()
    if len(raw) != expected.get("bytes"):
        fail(f"Tamaño alterado: {name}")
    if hashlib.sha256(raw).hexdigest() != expected.get("sha256"):
        fail(f"SHA-256 incorrecto: {name}")
    if raw[:4] != b"RIFF" or raw[8:12] != b"WEBP":
        fail(f"Formato WebP inválido: {name}")

html_path = ROOT / "index.html"
html = html_path.read_text(encoding="utf-8")
if '<title>FrutiDry — Astral Sanctuary' not in html or '<span class="brand">FrutiDry ' not in html:
    fail('La identidad oficial FrutiDry no coincide entre título y cabecera')
if 'aria-label="Tablero de FrutiDry.' not in html:
    fail('El nombre accesible del tablero no coincide con FrutiDry')
# Never break imports of progress or diagnostics created under the previous public name.
continuity_source = (ROOT / 'js/continuity.js').read_text(encoding='utf-8')
if "'kosen-berkan-progress'" not in continuity_source or "'kosen-berkan-run-diagnostic'" not in continuity_source:
    fail('Se ha alterado un formato histórico de progreso o diagnóstico')
parser = LocalReferences()
parser.feed(html)
for name in parser.links:
    if not (ROOT / name).is_file():
        fail(f"Archivo referenciado desde HTML no encontrado: {name}")

sources = [html_path, ROOT / "css/style.css", *sorted((ROOT / "js").glob("*.js"))]
for source in sources:
    for match in WEBP_REF.findall(source.read_text(encoding="utf-8")):
        if not (ROOT / match).is_file():
            fail(f"Sprite referenciado pero ausente ({source.relative_to(ROOT)}): {match}")

node = shutil.which("node")
if not node:
    fail("Node.js no está en PATH (necesario para comprobar sintaxis JS)")
else:
    for source in sorted((ROOT / "js").glob("*.js")):
        result = subprocess.run([node, "--check", str(source)], capture_output=True, text=True)
        if result.returncode:
            fail(f"Error de sintaxis en {source.relative_to(ROOT)}: {result.stderr.strip()}")

if problems:
    print("VALIDACIÓN FALLIDA")
    for error in problems:
        print(" -", error)
    sys.exit(1)
print(f"VALIDACIÓN CORRECTA: {len(entries)} recursos WebP, referencias locales y sintaxis de JavaScript")
