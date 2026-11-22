"""Leitura do PDF do Tormenta20 (2020) como sequência de trechos classificados pela fonte.

Uso interno do extrator (extract.py). Requer PyMuPDF (`pip install pymupdf`).
Página impressa = índice do PDF - 6 (página 1 do livro é a 7ª do arquivo).
"""
from __future__ import annotations

import re
from dataclasses import dataclass

import pymupdf

PAGE_OFFSET = 6
RED = {0xD13435, 0xB53135}
# Marca d'água de compra (Helvetica, com e-mail): dados pessoais de quem comprou o PDF, nunca extraídos.
WATERMARK = re.compile(r"[\w.+-]+@[\w-]+\.\w+")


@dataclass
class Tok:
    kind: str  # H, SEC, SUB, BR (negrito vermelho), B, I, T
    text: str
    page: int
    newline: bool  # começa uma nova linha
    x: float = 0.0
    y: float = 0.0
    size: float = 0.0


def classify(span: dict) -> str | None:
    font, size, color = span["font"], span["size"], span["color"]
    if font.startswith("SpiralsFont"):
        return "MAG"  # símbolo de habilidade mágica
    if color == 0xFFFFFF or font.startswith("SourceSans"):
        return None  # quadros laterais
    if font.startswith("Tormenta20"):
        if color in RED and size >= 19:
            return "SEC"
        if color in RED and size >= 12:
            return "H"
        if 8 <= size <= 10 and color not in RED:
            return "SUB"
        return None  # números de página, títulos decorativos
    if "Bold" in font:
        if size >= 10 and color == 0x7C3425:
            return None  # cabeçalho corrido
        return "BR" if color in RED else "B"
    if "Italic" in font:
        return "I"
    return "T"


def tokens(doc: pymupdf.Document, first: int, last: int) -> list[Tok]:
    out: list[Tok] = []
    for page in range(first, last + 1):
        p = doc[page + PAGE_OFFSET - 1]
        for b in p.get_text("dict")["blocks"]:
            for line in b.get("lines", []):
                first_span = True
                for s in line["spans"]:
                    t = s["text"]
                    if not t.strip() or s["font"].startswith("Helvetica") or WATERMARK.search(t):
                        continue
                    kind = classify(s)
                    if kind is None:
                        continue
                    out.append(Tok(kind, t, page, first_span, s["bbox"][0], s["bbox"][1], s["size"]))
                    first_span = False
    return out


def join(toks: list[Tok]) -> str:
    """Junta trechos em texto corrido, desfazendo hifenização de fim de linha."""
    buf = ""
    for t in toks:
        if t.kind == "MAG":
            continue
        txt = t.text
        if not buf:
            buf = txt.lstrip()
            continue
        if t.newline:
            if buf.endswith("\xad"):
                buf = buf[:-1] + txt.lstrip()
            elif buf.endswith("-") and not buf.endswith(" -"):
                buf = buf + txt.lstrip()
            else:
                buf = buf.rstrip() + " " + txt.lstrip()
        else:
            buf += txt
    buf = buf.replace("\xad", "")
    buf = re.sub(r"\s+", " ", buf).strip()
    buf = re.sub(r"\s+([.,;:)])", r"\1", buf)
    return buf
