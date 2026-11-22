"""Fichas de criaturas do Capítulo 7 (p. 268–301).

As fichas ficam em quadros (fontes SourceSans), fora do texto corrido que tokens.py lê.
Os blocos de texto do PDF vêm em ordem de leitura, então basta percorrê-los em sequência:

    <nome> ND <x>              (fonte Tormenta20; o nome pode ocupar duas linhas)
    <tipo> <nível>, <tamanho>  (itálico)
    Iniciativa +3, Percepção +0, visão no escuro
    Defesa 14, Fort +5, Ref +1, Von +0
    ...                        (rótulos em versalete: SourceSansPro-Bold-SC700)

Só as regras da ficha são extraídas. A descrição em texto corrido de cada criatura
(ambientação) fica de fora.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

import pymupdf

from tokens import PAGE_OFFSET, WATERMARK

SIZES = "Minúsculo|Pequeno|Médio|Grande|Enorme|Colossal"
TYPE_LINE = re.compile(rf"^(?P<type>.+?) (?P<level>\d+), (?P<size>{SIZES})\b\.?\s*(?P<rest>.*)$")
ND_LINE = re.compile(r"^(?:(?P<name>.*?)\s+)?ND\s*(?P<nd>\d+(?:/\d+)?)\s*$", re.IGNORECASE)


@dataclass
class Seg:
    label: bool
    text: str


@dataclass
class Line:
    page: int
    font: str
    size: float
    segs: list[Seg]
    soft_hyphen: bool

    @property
    def text(self) -> str:
        return "".join(s.text for s in self.segs)


def stream(doc: pymupdf.Document, first: int, last: int):
    """Linhas em ordem de documento, sem a marca d'água."""
    for page in range(first, last + 1):
        p = doc[page + PAGE_OFFSET - 1]
        for b in p.get_text("dict")["blocks"]:
            for l in b.get("lines", []):
                spans = [s for s in l["spans"] if not s["font"].startswith("Helvetica")]
                if not spans or any(WATERMARK.search(s["text"]) for s in spans):
                    continue
                segs: list[Seg] = []
                for s in spans:
                    t = s["text"]
                    if s["font"].startswith("SpiralsFont"):
                        continue
                    is_label = "Bold-SC" in s["font"]
                    if segs and segs[-1].label == is_label:
                        segs[-1].text += t
                    else:
                        segs.append(Seg(is_label, t))
                raw = "".join(s.text for s in segs)
                if not raw.strip():
                    continue
                soft = raw.rstrip(" ").endswith("\xad")
                for s in segs:
                    s.text = s.text.replace("\xad", "")
                yield Line(page, spans[0]["font"], spans[0]["size"], segs, soft)


def _is_title(l: Line) -> bool:
    return l.font.startswith("Tormenta20") and l.size >= 11


def _join(parts: list[tuple[str, bool]]) -> str:
    """Junta os trechos de um campo; o hífen opcional no fim da linha une a palavra partida."""
    out = ""
    prev_soft = False
    for text, soft in parts:
        text = text.replace("\t", " ")
        if prev_soft:
            out = out.rstrip(" ") + text.lstrip(" ")
        else:
            out += text
        prev_soft = soft
    return re.sub(r"\s{2,}", " ", out).strip()


@dataclass
class Block:
    name: str
    nd: str
    page: int
    type_line: str = ""
    # Sequência (rótulo, texto) depois da linha de tipo.
    fields: list[list] = field(default_factory=list)
    closed: bool = False


def blocks(doc: pymupdf.Document, first: int, last: int) -> list[Block]:
    out: list[Block] = []
    name_parts: list[str] = []
    pending: Block | None = None
    cur: Block | None = None
    for l in stream(doc, first, last):
        text = l.text.strip()
        if _is_title(l):
            m = ND_LINE.match(text.replace("\t", " "))
            if m and (name_parts or m.group("name")):
                name = " ".join(name_parts + ([m.group("name")] if m.group("name") else []))
                pending = Block(re.sub(r"\s+", " ", name).strip(), m.group("nd"), l.page)
                name_parts = []
                cur = None
            elif not m and not text.isdigit():
                # Títulos decorativos de capítulo têm só uma letra; nomes têm mais.
                if len(text) > 1:
                    name_parts = name_parts + [text] if name_parts and l.size >= 16 else [text]
            continue
        name_parts = []
        if "SourceSans" not in l.font:
            continue  # texto corrido (descrição) e títulos de seção
        if pending and "It" in l.font and TYPE_LINE.match(text):
            cur = pending
            cur.type_line = text
            out.append(cur)
            pending = None
            continue
        if not cur or cur.closed:
            continue
        for seg in l.segs:
            if seg.label and seg.text.strip():
                cur.fields.append([seg.text.strip(), []])
            elif cur.fields:
                cur.fields[-1][1].append([seg.text, False])
            # Texto antes do primeiro rótulo (raro) é ignorado.
        if cur.fields and cur.fields[-1][1]:
            cur.fields[-1][1][-1][1] = l.soft_hyphen
        elif cur.fields:
            cur.fields[-1][1].append(["", l.soft_hyphen])
        # A ficha termina no Tesouro.
        if cur.fields and cur.fields[-1][0].lower().startswith("tesouro"):
            body = "".join(t for t, _ in cur.fields[-1][1]).strip()
            if body.endswith((".", ")")) and not l.soft_hyphen:
                cur.closed = True
    return out


ABILITY_KEYS = {"For": "for", "Des": "des", "Con": "con", "Int": "int", "Sab": "sab", "Car": "car"}
SIMPLE = {
    "iniciativa": "initiative", "percepção": "perception", "defesa": "defense", "fort": "fort", "ref": "ref",
    "von": "will", "pontos de vida": "hp", "pontos de mana": "mp", "deslocamento": "speed",
    "corpo a corpo": "melee", "ataque corpo a corpo": "melee", "ataque à distância": "ranged", "à distância": "ranged", "perícias": "skills",
    "equipamento": "equipment", "tesouro": "treasure",
}


def _num(s: str) -> int | None:
    m = re.match(r"^[\s.,:]*([+–-]?\d+)", s)
    if not m:
        return None
    return int(m.group(1).replace("–", "-"))


def parse(b: Block) -> dict:
    m = TYPE_LINE.match(b.type_line)
    assert m, b.type_line
    out: dict = {
        "name": b.name,
        "nd": b.nd,
        "page": b.page,
        "creatureType": m.group("type"),
        "level": int(m.group("level")),
        "size": m.group("size"),
        "abilities": {},
        "actions": [],
    }
    for label, parts in b.fields:
        value = _join([(t, s) for t, s in parts]).strip().rstrip(",").strip()
        key = label.strip().rstrip(".")
        low = key.lower()
        # A linha de atributos vem inteira na fonte dos rótulos: "For 18, Des 11, ... Car 8".
        attrs = re.findall(r"\b(For|Des|Con|Int|Sab|Car)\s+([+–-]?\d+|—|–)", f"{key} {value}")
        if len(attrs) >= 4:
            for k, v in attrs:
                out["abilities"][ABILITY_KEYS[k]] = _num(v)
            continue
        if key in ABILITY_KEYS:
            n = _num(value)
            out["abilities"][ABILITY_KEYS[key]] = n  # None = "–" (não possui)
            continue
        if low in SIMPLE:
            k = SIMPLE[low]
            if k in ("initiative", "perception", "defense", "fort", "ref", "will", "hp", "mp"):
                n = _num(value)
                rest = re.sub(r"^[\s.,:]*[+–-]?\d+\s*,?\s*", "", value).strip().rstrip(".")
                out[k] = n
                if rest:
                    extra = {"perception": "senses", "will": "defenses", "defense": "defenseNote", "hp": "hpNote"}.get(k, f"{k}Note")
                    out[extra] = rest
            elif k in ("melee", "ranged"):
                out.setdefault(k, []).append(value.rstrip("."))
            else:
                value = value.rstrip(".")
                if k == "treasure":
                    # Título de quadro lateral colado no valor ("...ameaça ao ReinadoMetade").
                    glued = re.search(r"[a-zà-ú](Nenhum|Metade|Padrão|Dobro)$", value)
                    if glued:
                        value = glued.group(1)
                out[k] = value
            continue
        # Habilidade: "Fúria (Livre, 2 PM)" + texto.
        am = re.match(r"^(.*?)\s*\(([^)]*)\)\s*$", key)
        action = {"name": am.group(1) if am else key, "text": value}
        if am:
            action["cost"] = am.group(2)
        out["actions"].append(action)
    # Erro de diagramação em algumas fichas: "Fort +6, Ref +2, Von +0" sem o negrito do rótulo.
    note = out.get("defenseNote", "")
    for k, lab in (("fort", "Fort"), ("ref", "Ref"), ("will", "Von")):
        mm = re.search(rf"\b{lab}\s*([+–-]?\d+)", note)
        if out.get(k) is None and mm:
            out[k] = _num(mm.group(1))
    if note and all(out.get(k) is not None for k in ("fort", "ref", "will")):
        rest = re.sub(r"\b(Fort|Ref|Von)\s*[+–-]?\d+,?\s*", "", note).strip(" ,.")
        if rest:
            out["defenses"] = ", ".join(x for x in (rest, out.get("defenses")) if x)
        del out["defenseNote"]
    return out


def creatures(doc: pymupdf.Document, first: int = 268, last: int = 301) -> list[dict]:
    return [parse(b) for b in blocks(doc, first, last)]
