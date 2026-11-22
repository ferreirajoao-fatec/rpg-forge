"""Leitura das tabelas do livro (células em SourceSansPro), agrupando por linha e coluna."""
from __future__ import annotations

import pymupdf

from tokens import PAGE_OFFSET


def rows(doc: pymupdf.Document, page: int, y_tol: float = 2.5) -> list[list[dict]]:
    """Linhas da tabela na página: cada célula = {text, x0, x1, bold}."""
    p = doc[page + PAGE_OFFSET - 1]
    spans = []
    for b in p.get_text("dict")["blocks"]:
        for line in b.get("lines", []):
            for s in line["spans"]:
                if not s["font"].startswith("SourceSans") or not s["text"].strip():
                    continue
                if s["color"] == 0xFFFFFF:
                    continue
                x0, y0, x1, y1 = s["bbox"]
                spans.append({"text": s["text"].strip(), "x0": x0, "x1": x1, "y": (y0 + y1) / 2, "bold": "Bold" in s["font"], "size": s["size"]})
    spans.sort(key=lambda s: (round(s["y"]), s["x0"]))
    out: list[list[dict]] = []
    for s in spans:
        if out and abs(out[-1][0]["y"] - s["y"]) <= y_tol:
            out[-1].append(s)
        else:
            out.append([s])
    for r in out:
        r.sort(key=lambda s: s["x0"])
    return out
