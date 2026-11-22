"""Extrai o Conteúdo Open Game do Tormenta20 (2020) para content/tormenta20-2020/data.

Uso (Python 3.11+, PyMuPDF):
    python scripts/tormenta20/extract.py "caminho/Tormenta 20.pdf"

O PDF NÃO é versionado. Somente os JSON gerados (Conteúdo Open Game, com os
termos de Identidade do Produto substituídos por pi.py) entram no repositório.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pymupdf

sys.path.insert(0, str(Path(__file__).parent))
from tokens import Tok, join, tokens  # noqa: E402
import pi  # noqa: E402
import prereqs  # noqa: E402
from equipment import equipment  # noqa: E402
import gm  # noqa: E402
import magic  # noqa: E402
from build import build  # noqa: E402
from util import clean_heading, norm_name, slug  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "content" / "tormenta20-2020" / "data"


# ---------------------------------------------------------------------------
# Blocos com título (poderes gerais, magias)
# ---------------------------------------------------------------------------

def headed_blocks(toks: list[Tok], heading_kinds=("H",)) -> list[dict]:
    """Agrupa trechos em blocos iniciados por um título; títulos em linhas seguidas são unidos."""
    blocks: list[dict] = []
    cur: dict | None = None
    section = None
    for t in toks:
        if t.kind == "SEC":
            if cur and cur["body"] == [] and cur.get("sec"):
                cur["title"] += " " + t.text
                continue
            section_text = clean_heading(t.text)
            if blocks and blocks[-1].get("sec") and not blocks[-1]["body"]:
                blocks[-1]["title"] += " " + section_text
                section = clean_heading(blocks[-1]["title"])
                continue
            cur = {"sec": True, "title": section_text, "body": [], "page": t.page}
            blocks.append(cur)
            section = section_text
            continue
        if t.kind in heading_kinds:
            if cur and not cur.get("sec") and not cur["body"]:
                cur["title"] += " " + t.text
                continue
            cur = {"title": t.text, "body": [], "page": t.page, "section": section}
            blocks.append(cur)
            continue
        if cur is not None:
            cur["body"].append(t)
    for b in blocks:
        b["title"] = clean_heading(b["title"])
        if b.get("sec"):
            continue
    # Atualiza seção dos blocos conforme os SEC unidos.
    section = None
    for b in blocks:
        if b.get("sec"):
            section = b["title"]
        else:
            b["section"] = section
    return [b for b in blocks if not b.get("sec")]


def split_prereq(body: list[Tok]) -> tuple[list[Tok], list[Tok]]:
    """Separa o texto do pré-requisito (marcado por "Pré-requisito(s):" em itálico, às vezes quebrado)."""
    pat = re.compile(r"^Pré-?re-?qui-?sitos?:")
    for i, t in enumerate(body):
        if t.kind != "I" or not t.text.strip().startswith("Pré"):
            continue
        combined = ""
        for j in range(i, min(i + 3, len(body))):
            if body[j].kind != "I":
                break
            combined += body[j].text.replace("­", "").replace(" ", "").replace("	", "")
            if pat.match(combined):
                return body[:i], body[j + 1:]
    return body, []


# ---------------------------------------------------------------------------
# Poderes gerais (p. 124–135)
# ---------------------------------------------------------------------------

GROUPS = {
    "Poderes de Combate": "combate",
    "Poderes de Destino": "destino",
    "Poderes de Magia": "magia",
    "Poderes Concedidos": "concedido",
    "Poderes da Tormenta": "aberrante",
}


def general_powers(doc) -> list[dict]:
    toks = [t for t in tokens(doc, 124, 135) if t.page not in (126, 127)]
    out = []
    for b in headed_blocks(toks):
        group = GROUPS.get(b["section"])
        if not group:
            continue
        # Tabelas internas (ex.: "Ao Sabor do Destino") entram como texto.
        text_toks, pre_toks = split_prereq(b["body"])
        out.append({
            "name": norm_name(b["title"]),
            "page": b["page"],
            "magical": any(t.kind == "MAG" for t in b["body"]),
            "group": group,
            "text": join(text_toks),
            "prereqText": join(pre_toks).rstrip(".") if pre_toks else "",
        })
    return out


# ---------------------------------------------------------------------------
# Classes: poderes de classe, linhagens e formas selvagens (p. 36–84)
# ---------------------------------------------------------------------------

CLASS_PAGES = {
    "arcanista": (36, 39), "barbaro": (40, 42), "bardo": (43, 45), "bucaneiro": (46, 48), "cacador": (49, 51),
    "cavaleiro": (52, 55), "clerigo": (56, 59), "druida": (60, 63), "guerreiro": (64, 66), "ladino": (72, 74),
    "lutador": (75, 77), "nobre": (78, 80), "paladino": (81, 84),
}


def drop_tables(toks: list[Tok]) -> list[Tok]:
    """Remove o cabeçalho da tabela de progressão (as células usam fonte de quadro e já são ignoradas)."""
    return [t for t in toks if not (t.kind == "B" and t.text.strip() in ("Nível", "Habilidades de Classe"))]


def bullets(toks: list[Tok]) -> list[dict]:
    """Itens '• Nome. texto' em itálico (formato das listas de poderes de classe)."""
    items, cur = [], None
    orphans: list[tuple[int, list[Tok]]] = []  # continuações no topo da página (ordem de colunas do PDF)
    i, page = 0, None
    while i < len(toks):
        t = toks[i]
        txt = t.text.strip()
        if t.page != page:
            page = t.page
            # Só é órfão se o bloco anterior já terminou; senão é a continuação natural dele.
            if t.kind == "T" and txt[:1].islower() and cur is not None \
                    and join(cur["body"]).rstrip().endswith((".", "!", "?", ")")):
                orphans.append((page, []))
                cur = None
        if cur is None and orphans and orphans[-1][0] == t.page and not (t.kind == "I" and txt.startswith("•")) \
                and not any(it["page"] == t.page for it in items):
            orphans[-1][1].append(t)
            i += 1
            continue
        if t.kind == "I" and txt.startswith("•"):
            rest = txt.lstrip("•").strip()
            name_tok = None
            if rest:
                name = rest
            else:
                i += 1
                name_tok = toks[i]
                name = name_tok.text.strip()
            # Nome pode continuar em outro trecho itálico até o ponto final.
            while not name.endswith(".") and i + 1 < len(toks) and toks[i + 1].kind == "I":
                i += 1
                name += " " + toks[i].text.strip()
            cur = {"name": norm_name(name), "page": t.page, "body": []}
            items.append(cur)
        elif cur is not None:
            cur["body"].append(t)
        i += 1
    ended = lambda it: join(it["body"]).rstrip().endswith((".", "!", "?", ")"))  # noqa: E731
    for pg, body in orphans:
        same = [it for it in items if it["page"] == pg and not ended(it)]
        before = [it for it in items if it["page"] < pg and not ended(it)]
        target = (same or before or [None])[-1]
        if target is not None:
            target["body"] += body
    for it in items:
        it["magical"] = any(t.kind == "MAG" for t in it["body"])
        text_toks, pre_toks = split_prereq(it.pop("body"))
        it["text"] = join(text_toks)
        it["prereqText"] = join(pre_toks).rstrip(".") if pre_toks else ""
        m = re.search(r"\s*Pré-requisitos?:\s*(.+?)\.?$", it["text"])
        if m and not it["prereqText"]:  # rótulo sem itálico
            it["text"], it["prereqText"] = it["text"][: m.start()].strip(), m.group(1).strip()
    return items


def class_content(doc) -> tuple[list[dict], list[dict]]:
    powers, features = [], []
    for cls, (a, b) in CLASS_PAGES.items():
        toks = drop_tables(tokens(doc, a, b))
        mode, buf, box = None, [], None
        boxes: list[dict] = []
        paused = False
        for t in toks:
            if t.kind == "BR":
                if t.text.strip().startswith("Poder de "):
                    mode, buf, paused = "powers", [], False
                elif mode == "powers":
                    paused = True  # habilidade de classe intercalada pela diagramação em colunas
                continue
            if t.kind in ("SEC", "H"):
                if mode == "powers":
                    powers += [{**p, "class": cls} for p in bullets(buf)]
                    mode, buf = "done", []
                if t.kind == "H":
                    box = {"title": clean_heading(t.text), "page": t.page, "body": [], "class": cls}
                    boxes.append(box)
                else:
                    box = None
                continue
            if mode == "powers":
                if paused and t.kind == "I" and t.text.strip().startswith("•"):
                    paused = False
                if not paused:
                    buf.append(t)
            elif box is not None:
                box["body"].append(t)
        if mode == "powers":
            powers += [{**p, "class": cls} for p in bullets(buf)]
        for bx in boxes:
            items = bullets(bx["body"])
            first_bullet = next((i for i, t in enumerate(bx["body"]) if t.kind == "I" and t.text.strip().startswith("•")), len(bx["body"]))
            features.append({
                "name": norm_name(bx["title"]),
                "page": bx["page"],
                "class": cls,
                "text": join(bx["body"][:first_bullet]),
                "tiers": [{"name": it["name"], "text": it["text"]} for it in items],
            })
    return powers, features


# ---------------------------------------------------------------------------
# Magias (p. 170–203)
# ---------------------------------------------------------------------------

FIELD = re.compile(r"^(Execução|Alcance|Alvos?|Área|AlvoouÁrea|Efeito|Duração|Resistência)$")


def spells(doc) -> list[dict]:
    toks = tokens(doc, 170, 203)
    blocks = headed_blocks(toks)
    out = []
    for b in blocks:
        body = b["body"]
        sub = next((t for t in body[:3] if t.kind == "SUB"), None)
        if not sub:
            continue  # títulos de quadros dentro do capítulo
        m = re.match(r"^\s*(Arcana|Divina|Universal)\s+(\d)\s*\(([^)]+)\)", sub.text)
        if not m:
            continue
        tradition, circle, school = m.group(1).lower(), int(m.group(2)), m.group(3).strip()
        rest = [t for t in body if t is not sub]
        fields: dict[str, str] = {}
        desc: list[Tok] = []
        enh: list[dict] = []
        i = 0
        # Campos: rótulos em negrito escuro, possivelmente quebrados ("Dura" + "ção:").
        while i < len(rest):
            t = rest[i]
            if t.kind == "B":
                label = t.text
                while not label.strip().endswith(":") and i + 1 < len(rest) and rest[i + 1].kind == "B":
                    i += 1
                    label += rest[i].text
                key = label.replace("\xad", "").replace(" ", "").rstrip(":")
                if FIELD.match(key):
                    i += 1
                    vals = []
                    while i < len(rest) and rest[i].kind not in ("B", "BR") and not (vals and rest[i].newline and join(vals).endswith(".")):
                        vals.append(rest[i])
                        i += 1
                    fields[key.lower()] = join(vals).rstrip(";.").strip()
                    continue
                break
            break
        # Descrição e aprimoramentos.
        cur_enh = None
        for t in rest[i:]:
            if t.kind == "BR":
                label = t.text.strip()
                if cur_enh is not None and not label.endswith(":") and not re.match(r"^[+]", label):
                    cur_enh["body"].append(t)
                    continue
                cur_enh = {"cost": label.rstrip(":").strip(), "body": []}
                enh.append(cur_enh)
                continue
            (cur_enh["body"] if cur_enh is not None else desc).append(t)
        out.append({
            "name": norm_name(b["title"]),
            "page": b["page"],
            "tradition": tradition,
            "circle": circle,
            "school": school,
            **{k: v for k, v in fields.items()},
            "text": join(desc),
            "enhancements": [{"cost": e["cost"], "text": join(e["body"])} for e in enh],
        })
    return out


# ---------------------------------------------------------------------------
# Divindades (p. 96–105)
# ---------------------------------------------------------------------------

DEITY_FIELDS = {
    "Devotos": "devotees",
    "Canalizar Energia": "channelEnergy",
    "Arma Preferida": "favoredWeapon",
    "Obrigações & Restrições": "obligations",
    "Obrigações e Restrições": "obligations",
    "Poderes Concedidos": "grantedPowers",
}


def deities(doc) -> list[dict]:
    toks = tokens(doc, 96, 105)
    out, cur, field = [], None, None
    for t in toks:
        if t.kind == "SEC" and t.size >= 19 and t.size < 25:
            cur = {"name": clean_heading(t.text), "page": t.page, "fields": {}}
            out.append(cur)
            field = None
            continue
        if cur is None:
            continue
        if t.kind == "BR":
            field = t.text.strip().rstrip(".")
            target = cur
            if field in cur["fields"]:
                # Coluna fora de ordem (p. 105): o campo pertence à divindade anterior que ainda não o tem.
                target = next((d for d in reversed(out) if field not in d["fields"]), cur)
            target["fields"].setdefault(field, [])
            field_owner = target
            continue
        if t.kind == "B" and t.text.strip() in ("Divindade", "Energia", "Arma"):
            field = None  # tabela-resumo
            continue
        if field:
            field_owner["fields"][field].append(t)
    result = []
    for d in out:
        f = {DEITY_FIELDS[k]: join(v).strip() for k, v in d["fields"].items() if k in DEITY_FIELDS}
        result.append({"name": d["name"], "page": d["page"], **f})
    return result


# ---------------------------------------------------------------------------


def main(pdf: str) -> None:
    doc = pymupdf.open(pdf)
    raw = {"powers": general_powers(doc), "spells": spells(doc), "deities": deities(doc), "equipment": equipment(doc),
           "superior": magic.superior(doc), "magicItems": magic.magic_items(doc), "artifacts": magic.artifacts(doc)}
    raw["classPowers"], raw["classFeatures"] = class_content(doc)
    raw["gm"] = gm.main(doc)
    if "--raw" in sys.argv:
        Path(sys.argv[sys.argv.index("--raw") + 1]).write_text(json.dumps(raw, ensure_ascii=False, indent=1), encoding="utf-8")
    out = build(raw)
    OUT.mkdir(parents=True, exist_ok=True)
    problems, seen = [], set()
    for name, entries in out.items():
        for e in entries:
            if e["id"] in seen:
                problems.append(f"id repetido: {e['id']}")
            seen.add(e["id"])
            for term in pi.residual(json.dumps(e, ensure_ascii=False)):
                problems.append(f"{e['id']}: {term}")
        (OUT / f"{name}.json").write_text(json.dumps(entries, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
        print(f"{name}: {len(entries)}")
    for p in problems:
        print("AVISO", p)


if __name__ == "__main__":
    main(sys.argv[1])
