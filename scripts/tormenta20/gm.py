"""Regras do mestre e ameaças: Capítulos 6 (só as partes com regras), 7, 8 (XP e tesouro) e Apêndice.

Ficam de fora os conselhos de narração (Como Mestrar, estrutura de aventuras e campanhas,
tipos de NPCs), a descrição de ambientação de cada criatura e os quadros laterais de variantes.
"""
from __future__ import annotations

import re

import pymupdf

import tables
from creatures import ND_LINE, Block, _join, creatures as creature_blocks, stream
from equipment import money
from tokens import Tok, join, tokens
from util import clean_heading, slug

# ---------------------------------------------------------------------------
# Criaturas: grupo de cada uma (índice da p. 270–271) e traços comuns dos grupos
# ---------------------------------------------------------------------------


def creature_index(doc) -> dict[str, tuple[str, str]]:
    out = {}
    for pg in (270, 271):
        for r in tables.rows(doc, pg):
            t = [c["text"] for c in r]
            if len(t) == 6:
                for name, group, nd in (t[:3], t[3:]):
                    out[slug(name.replace("Fintroll", "Finntroll"))] = (group, nd)
    return out


def creatures(doc) -> list[dict]:
    index = creature_index(doc)
    out = []
    for c in creature_blocks(doc):
        group, nd = index[slug(c["name"])]
        assert nd == c["nd"], (c["name"], nd, c["nd"])
        out.append({**c, "name": c["name"][:1].upper() + c["name"][1:], "group": group})
    assert len(out) == len(index) == 80, len(out)
    return out


# Traços descritos no texto corrido de alguns grupos (rótulo em IowanOldStyle-Black).
TRAIT_GROUPS = {295: "Trolls nobres", 297: "Dragões", 300: "Tormenta"}


def creature_traits(doc) -> list[dict]:
    out: list[dict] = []
    cur = None
    for l in stream(doc, 293, 301):
        if "Black" in l.font:
            m = re.match(r"^([^.]{2,60})\.\s*(.*)$", l.text.lstrip(), re.DOTALL)
            if m:
                cur = {"group": TRAIT_GROUPS.get(l.page, ""), "name": m.group(1), "page": l.page, "parts": [(m.group(2), l.soft_hyphen)]}
                out.append(cur)
                continue
        if cur and "Iowan" in l.font and "Roman" in l.font and not cur["parts"][-1][0].rstrip().endswith((".", "!", ")")):
            cur["parts"].append((l.text, l.soft_hyphen))
        elif cur and "Iowan" in l.font and "Roman" in l.font and cur["parts"][-1][1]:
            cur["parts"].append((l.text, l.soft_hyphen))
        else:
            cur = None if not ("Black" in l.font) else cur
    return [{"group": t["group"], "name": t["name"], "page": t["page"], "text": _join(t["parts"])} for t in out]


# ---------------------------------------------------------------------------
# Perigos: armadilhas, doenças, venenos, perigos complexos
# ---------------------------------------------------------------------------


def _labelled_lines(doc, first: int, last: int):
    """Pares (rótulo, texto) dos quadros, na ordem de leitura."""
    out: list[list] = []
    for l in stream(doc, first, last):
        if "SourceSans" not in l.font:
            if l.font.startswith("Tormenta20") and l.size >= 16:
                out.append([None, []])  # título encerra o rótulo anterior
            continue
        for seg in l.segs:
            if seg.label and seg.text.strip():
                out.append([seg.text.strip(), [], l.page])
            elif out and out[-1][0]:
                out[-1][1].append([seg.text, False])
        if out and out[-1][0] and out[-1][1]:
            out[-1][1][-1][1] = l.soft_hyphen
    return [(lab, _join([(t, s) for t, s in parts]), rest[0]) for lab, parts, *rest in out if lab]


def traps(doc) -> list[dict]:
    out = []
    for name, text, page in _labelled_lines(doc, 302, 303):
        m = re.search(r";\s*ND (\d+(?:/\d+)?)\.?$", text)
        if m:
            out.append({"name": name, "page": page, "hazardType": "armadilha", "nd": m.group(1), "text": text})
    return out


def complex_hazards(doc) -> list[dict]:
    out, cur, name_parts = [], None, []
    for l in stream(doc, 306, 307):
        text = l.text.strip()
        if l.font.startswith("Tormenta20") and l.size >= 11:
            m = ND_LINE.match(text.replace("\t", " "))
            if m and name_parts:
                cur = {"name": " ".join(name_parts).strip(), "nd": m.group("nd"), "page": l.page, "hazardType": "complexo", "fields": []}
                out.append(cur)
                name_parts = []
            elif not m and not text.isdigit() and l.size >= 16:
                name_parts = [text]
            continue
        if not cur or "SourceSans" not in l.font:
            continue
        for seg in l.segs:
            if seg.label and seg.text.strip():
                cur["fields"].append([seg.text.strip(), []])
            elif cur["fields"]:
                cur["fields"][-1][1].append([seg.text, False])
        if cur["fields"] and cur["fields"][-1][1]:
            cur["fields"][-1][1][-1][1] = l.soft_hyphen
    for h in out:
        fields = [(lab, _join([(t, s) for t, s in parts])) for lab, parts in h.pop("fields")]
        h["objective"] = next((v for k, v in fields if k == "Objetivo"), "")
        h["effect"] = next((v for k, v in fields if k == "Efeito"), "")
        h["actions"] = []
        for k, v in fields:
            if k in ("Objetivo", "Efeito"):
                continue
            m = re.match(r"^(.*?)\s*\((.*)\)$", k)
            h["actions"].append({"name": m.group(1) if m else k, "test": m.group(2) if m else "", "text": v})
    return out


def diseases(doc) -> list[dict]:
    out = []
    for r in tables.rows(doc, 303):
        t = [c["text"] for c in r]
        if len(t) >= 4 and t[1] in ("Contato", "Ferimento", "Inalação", "Ingestão") and t[2].isdigit():
            effect = re.sub(r"\s*\|\s*", "", " ".join(t[3:]))
            effect = re.sub(r"(Constituição|Carisma)2", r"\1", effect.replace(" 2 /", "/").replace(" 2/", "/"))
            out.append({"name": t[0], "page": 303, "hazardType": "doenca", "vector": t[1], "dc": int(t[2]), "effect": effect.strip()})
    return out


def poisons(doc) -> list[dict]:
    out = []
    for r in tables.rows(doc, 304):
        t = [c["text"] for c in r]
        if len(t) == 5 and t[1] in ("Contato", "Ferimento", "Inalação", "Ingestão"):
            out.append({"name": t[0], "page": 304, "hazardType": "veneno", "vector": t[1], "dc": int(t[2]), "effect": t[3], "price": money(t[4])})
        elif len(t) == 1 and out and t[0].startswith("("):
            out[-1]["effect"] += " " + t[0]
    return out


# ---------------------------------------------------------------------------
# Seções de regras (texto corrido)
# ---------------------------------------------------------------------------


def _title(s: str) -> str:
    s = re.sub(r"\s+", " ", clean_heading(s)).strip()
    return s[:1].upper() + s[1:]


def sections(doc, first: int, last: int, chapter: str, keep=lambda top, mid: True) -> list[dict]:
    """Seções por título: nível 1 = SEC com corpo ≥ 24pt, nível 2 = SEC menor, nível 3 = H."""
    toks = tokens(doc, first, last)
    out: list[dict] = []
    top = mid = None
    cur = None
    sub_title = None
    body: list[Tok] = []

    last: dict | None = None  # último trecho guardado: {"section", "sub"}

    def flush():
        nonlocal body, last
        if not body:
            return
        text = join(body).strip()
        hyphen = body[-1].text.rstrip(" \n").endswith("\xad")
        body = []
        if not text:
            return
        # Texto que começa em minúscula continua a frase interrompida antes do título
        # (a coluna seguinte vem depois do título na ordem de leitura).
        same_place = last is not None and last["section"] is cur and last["sub"] == bool(sub_title) and last.get("title") == sub_title
        if last is not None and (text[:1].islower() or same_place):
            sec, sub = last["section"], last["sub"]
            parts = sec["subsections"][-1] if sub else None
            prev = parts["text"] if parts else sec["intro"][-1]
            if not prev.rstrip().endswith((".", "!", "?", ":", ")")):
                glue = "" if last["hyphen"] else " "
                if parts:
                    parts["text"] = prev.rstrip() + glue + text
                else:
                    sec["intro"][-1] = prev.rstrip() + glue + text
                last["hyphen"] = hyphen
                return
        if cur is None:
            return
        if sub_title and same_place:
            cur["subsections"][-1]["text"] += "\n\n" + text
        elif sub_title:
            cur["subsections"].append({"title": sub_title, "text": text})
        else:
            cur.setdefault("intro", []).append(text)
        last = {"section": cur, "sub": bool(sub_title), "hyphen": hyphen, "title": sub_title}

    i = 0
    while i < len(toks):
        t = toks[i]
        if t.kind in ("SEC", "H"):
            # Títulos em várias linhas viram um só.
            j, parts = i, []
            # Linhas do mesmo título ficam coladas verticalmente (até ~1,3× o tamanho da fonte).
            while (j < len(toks) and toks[j].kind == t.kind and abs(toks[j].size - t.size) < 1 and toks[j].page == t.page
                   and (j == i or 0 <= toks[j].y - toks[j - 1].y <= t.size * 1.4)):
                parts.append(toks[j].text)
                j += 1
            heading = _title(re.sub(r"(?<=[A-Z]) (?=s$)", "", " ".join(p.strip() for p in parts)))
            i = j
            if len(heading) <= 1:
                continue  # letra capitular
            flush()
            if t.kind == "SEC" and t.size >= 24:
                top, mid, sub_title = heading, None, None
                cur = {"chapter": chapter, "group": top, "title": top, "page": t.page, "subsections": []} if keep(top, None) else None
                if cur:
                    out.append(cur)
            elif t.kind == "SEC":
                mid, sub_title = heading, None
                cur = {"chapter": chapter, "group": top or heading, "title": heading, "page": t.page, "subsections": []} if keep(top, heading) else None
                if cur:
                    out.append(cur)
            else:
                sub_title = heading
            continue
        if t.kind in ("T", "B", "BR", "I"):
            # Salto para o topo de outra coluna ou página: novo trecho.
            if body and t.newline and (t.page != body[-1].page or t.y < body[-1].y - 40):
                flush()
            body.append(t)
        i += 1
    flush()
    for s in out:
        s["text"] = "\n\n".join(s.pop("intro", []))
    return [s for s in out if s["text"] or s["subsections"]]


GM_KEEP = {
    "fichas-para-npc": None,  # tudo
    "aliados": None,
    "masmorras": {"elementos-de-masmorras"},
    "os-ermos": {"clima", "terrenos", "outros-elementos-dos-ermos", "viagens"},
    "ambientes-urbanos": {"tipos-de-comunidades", "lei-ordem", "perseguicoes", "outros-elementos-urbanos"},
    "tempo-entre-aventuras": None,
}


def _gm_keep(top, mid):
    allowed = GM_KEEP.get(slug(top or ""), "no")
    if allowed == "no":
        return False
    return allowed is None or (mid is not None and slug(mid) in allowed)


def rule_sections(doc) -> list[dict]:
    out = []
    out += sections(doc, 243, 265, "Capítulo 6: O Mestre", _gm_keep)
    for s in out:
        if slug(s["title"]) in ("regras-de-aliados", "tipos-de-aliados"):
            s["group"] = "Aliados"
        elif s["group"] == "Fichas para NPC":
            s["group"] = "Fichas para NPCs"
    out += [{**s, "group": "Tempo entre aventuras"} for s in sections(doc, 262, 265, "Capítulo 6: O Mestre", lambda top, mid: mid is not None and slug(top or "") == "jogando-solos")]
    out += sections(doc, 268, 270, "Capítulo 7: Ameaças")
    out += [{**s, "group": "Perigos"} for s in sections(doc, 302, 305, "Capítulo 7: Ameaças") if slug(s["title"]) != "perigos-complexos"]
    out += sections(doc, 310, 311, "Capítulo 8: Recompensas", lambda top, mid: slug(mid or "") != "metodos")
    out += sections(doc, 314, 318, "Capítulo 8: Recompensas")
    out += sections(doc, 319, 320, "Capítulo 8: Recompensas")
    out += sections(doc, 394, 395, "Apêndice")
    return out


def ch6_tables(doc) -> dict[str, list[dict]]:
    """Tabelas 6-2 a 6-6, presas à regra que as usa. Os cabeçalhos são desenhos no PDF; vão escritos aqui."""
    def cells(page, lo=0, hi=1000):
        for r in tables.rows(doc, page):
            row = [c["text"] for c in r if lo <= c["x0"] < hi]
            if row:
                yield row

    doors = [r for r in cells(251, 0, 300) if len(r) == 4]
    travel = [r for r in cells(256, 0, 300) if len(r) == 3 and r[0].endswith("m")]
    notes = [" ".join(r[1:]).replace(" .", ".").strip() for r in cells(256, 0, 300) if len(r) == 2 and r[0] in ("1", "2")]
    travel_notes = []
    for r in tables.rows(doc, 256):  # notas 1 e 2: o número vem depois do texto na mesma linha
        t = [c["text"] for c in sorted(r, key=lambda c: c["x0"])]
        if len(t) == 3 and t[0] in ("1", "2") and "deslocamento" in t[1]:
            travel_notes.append(f"{t[0]}. {t[1].strip()} {t[2].strip()}")
    chase = [r for r in cells(260, 0, 300) if len(r) == 4 and re.fullmatch(r"\d+(-\d+)?", r[0])]
    quests = [r[:3] for r in cells(265, 0, 300) if len(r) >= 3 and r[0].isdigit()]
    successes = [r for r in cells(265, 350, 1000) if len(r) == 2 and r[0].isdigit()]
    consequences = [r for r in cells(265, 320, 1000) if len(r) == 3 and r[0].isdigit()]
    assert len(doors) == 5 and len(travel) == 6 and len(chase) >= 8 and len(quests) == 23 and len(successes) == 4 and len(consequences) == 6, \
        (len(doors), len(travel), len(chase), len(quests), len(successes), len(consequences))
    return {
        "elementos-de-masmorras": [{"title": "Tabela 6-2: Portas", "columns": ["Tipo de porta", "RD", "PV", "CD (Força)"], "rows": doors}],
        "viagens": [{"title": "Tabela 6-3: Velocidade de viagem", "columns": ["Deslocamento", "Distância por hora¹", "Distância por dia²"],
                     "rows": travel, "notes": travel_notes or notes}],
        "perseguicoes": [{"title": "Tabela 6-4: Perseguições", "columns": ["1d20", "Elemento", "Teste", "Exemplo"], "rows": chase}],
        "busca": [
            {"title": "Tabela 6-5: Desafios de buscas", "columns": ["2d12", "Perícia", "Exemplo"], "rows": quests},
            {"title": "Resultado da busca", "columns": ["Sucessos", "Consequência"], "rows": successes},
            {"title": "Tabela 6-6: Consequências de buscas", "columns": ["1d6", "Recompensa", "Castigo"], "rows": consequences},
        ],
    }


def bold_labelled(doc, page: int, last: int | None = None) -> list[dict]:
    """Verbetes "Rótulo. texto" em negrito (habilidades de criaturas, condições)."""
    out, cur = [], None
    for t in tokens(doc, page, last or page):
        if t.kind in ("B", "BR") and re.match(r"^[A-ZÀ-Ú][^.]{1,50}\.\s*$", t.text.strip()):
            cur = {"name": t.text.strip().rstrip("."), "page": page, "body": []}
            out.append(cur)
        elif t.kind == "SEC" and out:
            break  # próxima seção do apêndice
        elif cur is not None and t.kind in ("T", "B", "I"):
            cur["body"].append(t)
    return [{"name": c["name"], "page": c["page"], "text": join(c["body"]).strip()} for c in out]


# ---------------------------------------------------------------------------
# Tabelas de tesouro (Capítulo 8)
# ---------------------------------------------------------------------------

RANGE = re.compile(r"^\d{2,3}(-\d{2,3})?$")


def _range(s: str) -> list[int]:
    a, _, b = s.partition("-")
    return [int(a), int(b or a)]


def treasure_by_nd(doc) -> list[dict]:
    """Tabela 8-2: para cada ND, faixas de d% de dinheiro e de itens."""
    out: list[dict] = []
    for pg in (314, 315):
        for r in tables.rows(doc, pg):
            t = [c["text"] for c in r]
            if len(t) == 5 and re.fullmatch(r"\d+(/\d+)?", t[0]) and RANGE.match(t[1]):
                out.append({"nd": t[0], "money": [], "items": []})
                t = t[1:]
            if len(t) == 4 and out and RANGE.match(t[0]) and RANGE.match(t[2]):
                out[-1]["money"].append({"range": _range(t[0]), "result": t[1]})
                out[-1]["items"].append({"range": _range(t[2]), "result": t[3]})
    assert len(out) == 23, len(out)
    # Erros de diagramação (ex.: ND 1/4, itens "01-55" seguido de "51-75"): vale o início da faixa seguinte.
    for row in out:
        for col in (row["money"], row["items"]):
            for a, b in zip(col, col[1:]):
                a["range"][1] = b["range"][0] - 1
    return out


def wealth(doc) -> list[dict]:
    """Tabela 8-3: riquezas (colunas menor, média, maior; valor; exemplos)."""
    out: list[dict] = []
    for r in tables.rows(doc, 316):
        cells = sorted(r, key=lambda c: c["x0"])
        cols = {"menor": None, "media": None, "maior": None}
        value, examples = None, []
        for c in cells:
            x, text = c["x0"], c["text"]
            if x < 100:
                cols["menor"] = text
            elif x < 150:
                cols["media"] = text
            elif x < 195:
                cols["maior"] = text
            elif x < 255:
                value = text
            else:
                examples.append(text)
        if any(v is not None for v in cols.values()):
            m = re.match(r"^(\S+)\s*(?:\(([\d.]+)\))?$", value or "")
            out.append({k: (_range(v) if v and RANGE.match(v) else None) for k, v in cols.items()}
                       | {"value": m.group(1) if m else value, "average": int(m.group(2).replace(".", "")) if m and m.group(2) else None,
                          "examples": " ".join(examples)})
        elif out:
            if value and value.startswith("("):
                out[-1]["average"] = int(value.strip("()").replace(".", ""))
            if examples:
                out[-1]["examples"] += " " + " ".join(examples)
    for w in out:
        w["examples"] = re.sub(r"\s+", " ", w["examples"]).strip()
    return out


def _pairs(cells: list[dict]) -> list[tuple[str, str]]:
    out, i = [], 0
    while i + 1 < len(cells):
        if RANGE.match(cells[i]["text"]):
            out.append((cells[i]["text"], cells[i + 1]["text"]))
            i += 2
        else:
            i += 1
    return out


def item_tables(doc) -> dict[str, list[dict]]:
    """Tabelas 8-4 (itens diversos), 8-5 (armas; armaduras e escudos), 8-6 (itens superiores) e 8-7."""
    misc, weapons, armors = [], [], []
    for r in tables.rows(doc, 317):
        left = [c for c in r if c["x0"] < 300]
        right = [c for c in r if c["x0"] >= 300]
        misc += [{"range": _range(a), "result": b} for a, b in _pairs(left)]
        if right and any(330 <= c["x0"] < 360 for c in right):
            weapons += [{"range": _range(a), "result": b} for a, b in _pairs(right)]
        elif right:
            armors += [{"range": _range(a), "result": b} for a, b in _pairs(right)]
    weapon_mods, armor_mods, per_scene = [], [], []
    target = weapon_mods
    for r in tables.rows(doc, 318):
        left = [c for c in r if c["x0"] < 300 and not (c["x0"] > 185 and re.fullmatch(r"\d", c["text"]))]
        marks = [c["text"] for c in r if c["x0"] < 300 and c["x0"] > 185 and re.fullmatch(r"\d", c["text"])]
        for a, b in _pairs(left):
            if a.startswith("01") and weapon_mods:
                target = armor_mods
            row = {"range": _range(a), "result": b}
            if "1" in marks:
                row["counts"] = 2  # conta como duas modificações
            target.append(row)
        right = [c["text"] for c in r if c["x0"] >= 300]
        for k in range(0, len(right) - 1, 2):
            if re.fullmatch(r"\d+º", right[k]):
                per_scene.append({"level": int(right[k][:-1]), "value": money(right[k + 1])})
    per_scene.sort(key=lambda x: x["level"])
    assert len(per_scene) == 20 and misc and weapons and armors, (len(per_scene), len(misc), len(weapons), len(armors))
    return {"misc": misc, "weapons": weapons, "armors": armors, "weaponMods": weapon_mods, "armorMods": armor_mods, "perScene": per_scene}


def treasure(doc) -> dict:
    special = {}
    for key, page in (("weaponEnchantSpecific", 322), ("armorEnchantSpecific", 325)):
        for r in tables.rows(doc, page):
            t = [c["text"] for c in r]
            if t and RANGE.match(t[0]) and len(t) > 1 and t[1].startswith(("Arma específica", "Item específico")):
                special[key] = _range(t[0])
    return {"byNd": treasure_by_nd(doc), "wealth": wealth(doc), **item_tables(doc), **special,
            # "Role 1d6 para definir o material" (nota 2 da Tabela 8-6).
            "materials": ["aco-rubi", "adamante", "gelo-eterno", "madeira-de-ferro", "materia-aberrante", "mitral"]}


def main(doc) -> dict:
    return {
        "creatures": creatures(doc),
        "creatureTraits": creature_traits(doc),
        "hazards": traps(doc) + diseases(doc) + poisons(doc) + complex_hazards(doc),
        "conditions": bold_labelled(doc, 393, 394),
        "creatureAbilities": bold_labelled(doc, 392),
        "rules": rule_sections(doc),
        "ruleTables": ch6_tables(doc),
        "treasure": treasure(doc),
    }
