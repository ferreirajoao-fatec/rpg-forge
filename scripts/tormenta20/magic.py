"""Itens superiores (p. 155–157) e itens mágicos (p. 319–335)."""
from __future__ import annotations

import re

import tables
from equipment import money
from tokens import Tok, join, tokens
from util import clean_heading, norm_name, slug


def _rows(doc, page: int, left: bool | None = None, split: float = 300):
    for r in tables.rows(doc, page):
        cells = [c for c in r if left is None or (c["x0"] < split) == left]
        if cells:
            yield cells


def _table(doc, page: int, left: bool | None = None, split: float = 300) -> list[list[str]]:
    """Linhas da tabela; células que quebram linha são unidas à linha anterior."""
    out: list[list[str]] = []
    for cells in _rows(doc, page, left, split):
        texts = [c["text"] for c in cells]
        if re.match(r"^\d{2}(-\d{2,3})?$", texts[0]):
            out.append(texts)
        elif out and not texts[0].startswith("*") and not re.match(r"^\d$", texts[0]):
            row = out[-1]
            if money(row[-1]) is not None:  # célula quebrada antes do preço (notas das poções)
                if len(row) > 3:
                    row[-2] += " " + " ".join(texts)
                else:
                    row.insert(-1, " ".join(texts))
            else:
                row[-1] += " " + " ".join(texts)
    return out


# ---------------------------------------------------------------------------
# Tabelas
# ---------------------------------------------------------------------------

def weapon_enchantments(doc) -> dict[str, dict]:
    out = {}
    for r in _table(doc, 322):
        name, effect = r[1], " ".join(r[2:])
        if name.startswith(("Arma específica",)):
            continue
        double = name.endswith("*")
        out[slug(name.rstrip("*"))] = {"target": "arma", "effectSummary": effect, "encantos": 2 if double else 1}
    return out


def armor_enchantments(doc) -> dict[str, dict]:
    out = {}
    for r in _table(doc, 325):
        if r[1].startswith("Item específico"):
            continue
        marks = [x for x in r[2:-1] if re.fullmatch(r"\d", x)]
        effect = r[-1] if not re.fullmatch(r"\d", r[-1]) else ""
        if len(r) > 3 and r[2] == "Lança":  # célula partida ("Lança | Manto de Sombras")
            effect = "Lança Manto de Sombras"
        shield_only = "1" in marks
        out[slug(r[1])] = {"target": "escudo" if shield_only else "armadura-escudo", "effectSummary": effect,
                           "encantos": 2 if "2" in marks else 1}
    return out


def priced(doc, page: int, left: bool | None = None, split: float = 300) -> dict[str, float]:
    return {slug(r[1]): money(r[-1]) for r in _table(doc, page, left, split) if money(r[-1])}


def potions(doc) -> list[dict]:
    out = []
    for r in _table(doc, 327):
        spell = r[1]
        note = re.sub(r"\(\s*|\s*\)", "", " ".join(x for x in r[2:-1] if x != "*")).replace(" ;", ";").strip()
        out.append({"spell": spell, "note": note.strip("() ;"), "price": money(r[-1]), "roll": r[0]})
    return out


def material_prices(doc) -> dict[str, dict[str, float | None]]:
    """Tabela 3-8 (p. 157): custo adicional de cada material especial por tipo de item."""
    materials = ["aco-rubi", "adamante", "gelo-eterno", "madeira-tollon", "materia-vermelha", "mitral"]
    out: dict[str, dict[str, float | None]] = {m: {} for m in materials}
    for cells in _rows(doc, 157):
        if len(cells) != 7:
            continue
        kind = {"Arma": "arma", "Armadura leve": "armadura-leve", "Armadura pesada": "armadura-pesada", "Escudo": "escudo"}.get(cells[0]["text"])
        if not kind:
            continue
        for m, c in zip(materials, cells[1:]):
            out[m][kind] = money(c["text"])
    return out


MODIFICATION_TARGET = {"Modificações para armas": "arma", "Modificações para armaduras e escudos": "armadura-escudo",
                       "Outras modificações": "outro"}


def modifications_table(doc) -> dict[str, dict]:
    out, target = {}, None
    for cells in _rows(doc, 156):
        t = [c["text"] for c in cells]
        if len(t) == 1 and t[0] in MODIFICATION_TARGET:
            target = MODIFICATION_TARGET[t[0]]
            continue
        if len(t) >= 2:
            out[slug(re.sub(r"\s*\(.*\)", "", t[0]) + (" " + re.search(r"\((.*)\)", t[0]).group(1) if "(" in t[0] else ""))] = {
                "target": target, "effectSummary": " ".join(t[1:])}
            last = slug(t[0])
        elif t and out:
            out[list(out)[-1]]["effectSummary"] += " " + t[0]
    return out


# ---------------------------------------------------------------------------
# Descrições (rótulos em negrito vermelho)
# ---------------------------------------------------------------------------

def _ends(body: list[Tok]) -> bool:
    return bool(body) and join(body).rstrip().endswith((".", "!", "?", ")"))


def labelled(toks: list[Tok]) -> list[dict]:
    """Blocos "Rótulo. texto". Texto que abre uma página antes do primeiro rótulo e começa em
    minúscula é continuação de algum bloco sem ponto final (a ordem das colunas no PDF nem
    sempre é a de leitura): vai para o bloco aberto da mesma página ou, se não houver, o anterior."""
    items, cur, section, page = [], None, None, None
    orphans: list[tuple[int, list[Tok]]] = []
    for t in toks:
        if t.page != page:
            page = t.page
            if t.kind == "T" and t.text.strip()[:1].islower() and (cur is None or _ends(cur["body"])):
                orphans.append((page, []))
                cur = None
        if t.kind == "SEC":
            section = clean_heading(t.text)
            cur = None
            continue
        if t.kind == "BR":
            label = clean_heading(t.text).rstrip(".")
            if cur is not None and not cur["body"]:
                cur["name"] = f"{cur['name']}{'' if cur['name'].endswith('­') or not label[:1].isupper() else ' '}{label}".strip()
                continue
            cur = {"name": label, "page": t.page, "section": section, "body": []}
            items.append(cur)
            continue
        if t.kind in ("B", "H", "SUB") or (t.kind == "I" and t.size < 9.2):
            continue
        if cur is not None:
            cur["body"].append(t)
        elif orphans and orphans[-1][0] == t.page and not any(i["page"] == t.page for i in items):
            orphans[-1][1].append(t)
    for pg, body in orphans:
        same = [i for i in items if i["page"] == pg and not _ends(i["body"])]
        before = [i for i in items if i["page"] < pg and not _ends(i["body"])]
        target = (same or before or [None])[-1]
        if target is not None:
            target["body"] += body
    return items


def split_prereq_text(text: str) -> tuple[str, str]:
    m = re.search(r"\s*Pré-requisitos?:\s*(.+?)\.?$", text)
    return (text[: m.start()].strip(), m.group(1).strip()) if m else (text, "")


def superior(doc) -> list[dict]:
    """Modificações e materiais especiais, com efeito resumido e custos das tabelas."""
    table = modifications_table(doc)
    mats = material_prices(doc)
    out = []
    for i in labelled(tokens(doc, 155, 157)):
        k = slug(i["name"])
        text = join(i["body"])
        if i["section"] == "Materiais Especiais" or k in mats:
            out.append({"name": norm_name(i["name"]), "page": i["page"], "text": text, "category": "material",
                        "materialCost": mats.get(k, {})})
        elif k in table:
            body, pre = split_prereq_text(text)
            out.append({"name": norm_name(i["name"]), "page": i["page"], "text": body, "category": "modificacao",
                        **table[k], "prereqText": pre})
    return out


ACCESSORY_TIERS = [(328, None, "menor"), (329, True, "medio"), (329, False, "maior")]


def roll_ranges(doc, page: int, left: bool | None = None) -> dict[str, str]:
    """Faixa de d% de cada linha de uma tabela de geração aleatória (ex.: "01-05")."""
    return {slug(r[1].rstrip("*")): r[0] for r in _table(doc, page, left)}


# Tabelas de geração aleatória de itens mágicos (Capítulo 8).
ROLL_TABLES = {"encanto-arma": (322, None), "arma-especifica": (323, None), "encanto-armadura": (325, None),
               "armadura-especifica": (326, None), "acessorio-menor": (328, None), "acessorio-medio": (329, True),
               "acessorio-maior": (329, False)}


def magic_items(doc) -> list[dict]:
    wench, aench = weapon_enchantments(doc), armor_enchantments(doc)
    sweapons = priced(doc, 323)
    sarmor = priced(doc, 326)
    acc: dict[str, tuple[float, str]] = {}
    for page, left, tier in ACCESSORY_TIERS:
        for k, v in priced(doc, page, left).items():
            acc[k] = (v, tier)
    rolls = {t: roll_ranges(doc, p, l) for t, (p, l) in ROLL_TABLES.items()}

    def roll(table: str, key: str) -> dict:
        r = rolls[table].get(key)
        return {"roll": {"table": table, "range": r}} if r else {}

    out = []
    for i in labelled(tokens(doc, 321, 331)):
        k = slug(i["name"])
        base = {"name": norm_name(i["name"]), "page": i["page"], "text": join(i["body"])}
        if k in wench and i["page"] <= 322:
            out.append({**base, "category": "encanto", **wench[k], **roll("encanto-arma", k)})
        elif k in aench and i["page"] in (324, 325):
            out.append({**base, "category": "encanto", **aench[k], **roll("encanto-armadura", k)})
        elif k in sweapons:
            out.append({**base, "category": "arma-magica", "price": sweapons[k], "tier": "maior", **roll("arma-especifica", k)})
        elif k in sarmor:
            out.append({**base, "category": "armadura-magica", "price": sarmor[k], "tier": "maior", **roll("armadura-especifica", k)})
        elif k in acc:
            out.append({**base, "category": "acessorio", "price": acc[k][0], "tier": acc[k][1], **roll(f"acessorio-{acc[k][1]}", k)})
    for it in out:
        if it["category"] == "encanto":
            it["text"], pre = split_prereq_text(it["text"])
            if pre:
                it["requiresEnchantment"] = pre[:1].upper() + pre[1:]  # pré-requisito do item, não do personagem
    for p in potions(doc):
        out.append({"name": f"Poção de {p['spell']}" + (f" ({p['note']})" if p["note"] else ""), "page": 327,
                    "text": "", "category": "pocao", "spellName": p["spell"], "price": p["price"],
                    "roll": {"table": "pocao", "range": p["roll"]},
                    **({"form": "óleo" if "óleo" in p["note"] else "granada" if "granada" in p["note"] else "poção"})})
    return out


def artifacts(doc) -> list[dict]:
    """Artefatos (p. 332–335): título em SEC, texto até o próximo SEC; cartas do baralho em BR."""
    out, cur = [], None
    for t in tokens(doc, 332, 335):
        if t.kind == "SEC":
            cur = {"name": norm_name(clean_heading(t.text)), "page": t.page, "body": [], "tiers": []}
            out.append(cur)
            continue
        if cur is None or t.kind in ("B", "H", "SUB") or (t.kind == "I" and t.size < 9.2):
            continue
        if t.kind == "BR":
            cur["tiers"].append({"name": clean_heading(t.text).rstrip("."), "body": []})
            continue
        (cur["tiers"][-1]["body"] if cur["tiers"] else cur["body"]).append(t)
    result = [{"name": a["name"], "page": a["page"], "text": join(a["body"]), "category": "artefato",
               "tiers": [{"name": x["name"], "text": join(x["body"])} for x in a["tiers"]]} for a in out]
    # Cartas do baralho: a tabela traz todas as 22 (resultado no d% e efeito); só algumas têm texto longo.
    deck = next(a for a in result if "Baralho" in a["name"])
    detail = {t["name"]: t["text"] for t in deck["tiers"]}
    deck["tiers"] = [{"name": r[1], "roll": r[0], "summary": " ".join(r[2:]), "text": detail.get(r[1], "")}
                     for r in _table(doc, 333)]
    return result
