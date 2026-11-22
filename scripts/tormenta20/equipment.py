"""Equipamento (Tormenta20, p. 139–157): tabelas de armas, armaduras e itens + descrições."""
from __future__ import annotations

import re

import tables
from tokens import PAGE_OFFSET, join, tokens
from util import clean_heading, norm_name, slug


def money(v: str) -> float | None:
    m = re.search(r"T\$\s*([\d.]+(?:,\d+)?)", v)
    return float(m.group(1).replace(".", "").replace(",", ".")) if m else None


def weight(v: str) -> float | None:
    m = re.match(r"([\d,]+)\s*(kg|g)", v)
    if not m:
        return None
    n = float(m.group(1).replace(",", "."))
    return n / 1000 if m.group(2) == "g" else n


def dash(v: str) -> str | None:
    return None if v in ("—", "-", "") else v


PROF = {"Armas Simples": "simples", "Armas Marciais": "marciais", "Armas Exóticas": "exoticas", "Armas de Fogo": "fogo"}


def proficiency_headers(doc, page: int) -> list[tuple[float, str]]:
    out = []
    for b in doc[page + PAGE_OFFSET - 1].get_text("dict")["blocks"]:
        for line in b.get("lines", []):
            for sp in line["spans"]:
                if sp["font"].startswith("IowanOldStyle-Bold") and sp["size"] == 10.0 and sp["text"].strip() in PROF:
                    out.append((sp["bbox"][1], sp["text"].strip()))
    return sorted(out)


def weapon_table(doc) -> dict[str, dict]:
    out = {}
    for page in (140, 141):
        heads = proficiency_headers(doc, page)
        cat = ""
        for r in tables.rows(doc, page):
            if len(r) == 1 and r[0]["bold"]:
                cat = r[0]["text"]
                continue
            if len(r) != 7:
                continue
            prof = [h for y, h in heads if y < r[0]["y"]][-1]
            name, price, dmg, crit, rng, wt, typ = (c["text"] for c in r)
            grip = "leve" if "Leves" in cat else "uma-mao" if "Uma Mão" in cat else "duas-maos" if "Duas Mãos" in cat else "distancia"
            out[slug(name)] = {
                "category": "municao" if name.endswith("(20)") else "arma",
                "proficiency": PROF[prof], "grip": grip, "price": money(price), "damage": dash(dmg),
                "critical": dash(crit), "range": dash(rng), "weight": weight(wt), "damageType": dash(typ),
            }
    return out


def armor_table(doc) -> dict[str, dict]:
    out, cat = {}, ""
    for r in tables.rows(doc, 149):
        if len(r) == 1 and r[0]["bold"]:
            cat = r[0]["text"]
            continue
        if len(r) != 5:
            continue
        name, price, bonus, pen, wt = (c["text"] for c in r)
        out[slug(name)] = {
            "category": "escudo" if cat == "Escudos" else "armadura",
            "armorType": "leve" if "Leves" in cat else "pesada" if "Pesadas" in cat else "escudo",
            "price": money(price), "defense": int(bonus.replace("+", "")),
            "armorPenalty": int(pen.replace("–", "-")), "weight": weight(wt),
        }
    return out


def item_table(doc) -> dict[str, dict]:
    out = {}
    for left in (True, False):
        parent = None
        for r in tables.rows(doc, 151):
            cells = [c for c in r if (c["x0"] < 310) == left]
            if not cells:
                continue
            if len(cells) == 1:
                parent = None if cells[0]["bold"] else cells[0]["text"]
                continue
            name = cells[0]["text"]
            if parent and cells[0]["x0"] > 330:
                name = f"{parent.split(' (')[0]} {name}"
            price = cells[1]["text"]
            out[slug(re.sub(r"\s*\(.*?\)", "", name))] = {
                "price": money(price) if "por km" not in price else None,
                "priceText": re.sub(r"T\$\s*", "", price) + (" moedas" if "por km" not in price else "").strip()
                if "T$" in price else None,
                "weight": weight(cells[2]["text"]) if len(cells) > 2 else None,
            }
    for v in out.values():
        if v["priceText"] and "por km" in v["priceText"]:
            v["priceText"] = v["priceText"].replace(" por km", " moedas por km")
    return out


SKIP_BR = {"Armas Simples", "Armas Marciais", "Armas Exóticas", "Armas de Fogo", "Penalidade por Não Proficiência",
           "Corpo a Corpo", "Ataque à Distância", "Passos de Dano", "Preço", "Dano", "Crítico", "Alcance", "Peso",
           "Tipo", "Armaduras Leves", "Armaduras Pesadas", "Escudos", "Bônus na Defesa", "Penalidade de Armadura", "•"}
SECTIONS = {"Itens Gerais": "item", "Alquimia": "alquimico", "Vestuário": "vestuario", "Hospedagem": "hospedagem",
            "Alimentação": "alimentacao", "Animais": "animal", "Veículos": "veiculo", "Serviços": "servico",
            "Modificações": "modificacao", "Materiais Especiais": "material"}


def equipment(doc) -> list[dict]:
    wt, at, it = weapon_table(doc), armor_table(doc), item_table(doc)
    items, cur, section = [], None, None
    for t in tokens(doc, 142, 157):
        if t.kind == "SEC":
            h = clean_heading(t.text)
            if h in SECTIONS:
                section = h
            cur = None
            continue
        if t.kind == "BR":
            label = clean_heading(t.text).rstrip(".")
            if label in SKIP_BR:
                cur = None
                continue
            cur = {"name": label, "page": t.page, "section": section, "body": []}
            items.append(cur)
            continue
        if t.kind in ("B", "H", "SUB") or (t.kind == "I" and t.size < 9.2):
            continue  # cabeçalhos de tabela e legendas das ilustrações
        if cur is not None:
            cur["body"].append(t)
    out = []
    for i in items:
        if i["section"] in ("Modificações", "Materiais Especiais"):
            continue  # itens superiores: ver magic.superior()
        k = slug(i["name"])
        base = {"name": norm_name(i["name"]), "page": i["page"], "text": join(i["body"])}
        if i["page"] <= 147:
            if i["name"] == "Escudo Leve ou Pesado":
                continue  # o escudo como arma entra nas entradas de escudo
            if i["name"] == "Munição":
                row = wt.get("municao-20")
            else:
                row = wt.get(k) or wt.get(f"{k}-20")
            out.append({**base, **(row or {"category": "arma"})})
        elif k in at:
            w = wt.get(k)
            extra = {"damage": w["damage"], "critical": w["critical"], "damageType": w["damageType"]} if w else {}
            out.append({**base, **at[k], **extra})
        else:
            if i["section"] == "Hospedagem":
                row = it.get(f"estadia-{k}")
            elif i["section"] == "Serviços" and k == "condução":
                row = None
            else:
                row = it.get(k) or next((v for kk, v in it.items() if kk.startswith(k + "-")), None)
            out.append({**base, "category": SECTIONS.get(i["section"] or "", "item"), **(row or {})})
    return out
