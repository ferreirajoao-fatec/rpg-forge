"""Entradas do pacote para ameaças e regras do mestre (dados brutos de gm.py)."""
from __future__ import annotations

import json
import re

import pi
from util import slug

# Grupos do índice de criaturas (p. 270–271) com nomes genéricos.
GROUPS = {"Duyshidakk": "Goblinoides", "Puristas": "Fanáticos", "Sszzaazitas": "Serpentes", "Tormenta": "Aberrações",
          "Trolls nobres": "Trolls"}
TRAIT_GROUPS = {"Trolls nobres": "Variantes de troll", "Dragões": "Dragões", "Tormenta": "Aberrações"}


def _scrub_data(data):
    """Aplica a troca de termos em todos os textos de um objeto (nomes, ações, notas)."""
    if isinstance(data, str):
        return pi.scrub(data)
    if isinstance(data, list):
        return [_scrub_data(x) for x in data]
    if isinstance(data, dict):
        return {k: _scrub_data(v) for k, v in data.items()}
    return data


# Cabeçalhos de tabela que o PDF põe no meio do texto corrido.
TABLE_HEADERS = [
    "Tipo de Porta RD PV CD", "Deslocamento Distância por hora1 Distância por dia2", "Doença Tipo CD Efeito1",
    "ND d% Dinheiro d% Itens ND d% Dinheiro d% Itens", "Menor Média Maior Valor (moedas) Exemplos", "Menor Média Maior Valor (T$) Exemplos",
    "Número de Encantos Aumento no Custo Aumento na CD",
    "d% Item d% Arma d% Arma d% Armadura/Escudo", "d% Armas d% Armaduras/Escudos", "Nível Tesouro Nível Tesouro",
    "1d6 Recompensa Castigo Sucessos Consequência 2d12 Perícia Exemplo",
]


def strip_table_headers(text: str) -> str:
    for h in TABLE_HEADERS:
        h = re.escape(h).replace(r"\ ", r"\s+")
        text = re.sub(rf"(?<=[a-zà-ú]){h}\s*(?=[a-zà-ú])", "", text)  # palavra partida pelo cabeçalho
        text = re.sub(rf"\s*{h}", "", text)
    return text


def _paragraphs(text: str) -> str:
    return "\n\n".join(pi.scrub(strip_table_headers(p)) for p in text.split("\n\n") if p.strip())


# ---------------------------------------------------------------------------
# Tesouro: resultados das tabelas em forma estruturada
# ---------------------------------------------------------------------------

CURRENCY = {"TC": "mc", "T$": "m", "TO": "mo"}
DICE = re.compile(r"^(\d+d\d+(?:[+-]\d+)?)(?:x([\d.]+))?$")


def _dice(expr: str) -> dict:
    m = DICE.match(expr)
    assert m, expr
    return {"dice": m.group(1), "multiplier": int(m.group(2).replace(".", "")) if m.group(2) else 1}


def money_result(s: str) -> dict | None:
    if s == "—":
        return None
    m = re.match(r"^(\S+) (TC|T\$|TO)$", s)
    if m:
        return {"type": "moedas", **_dice(m.group(1)), "currency": CURRENCY[m.group(2)]}
    m = re.match(r"^(\d+|\d+d\d+(?:\+\d+)?) riquezas? (menor|média|maior)(?:es|s)?$", s)
    assert m, s
    tier = {"menor": "menor", "média": "media", "maior": "maior"}[m.group(2)]
    return {"type": "riquezas", "count": m.group(1), "tier": tier}


def item_result(s: str) -> dict | None:
    if s == "—":
        return None
    if s == "Diverso":
        return {"type": "diverso"}
    if s == "Arma/armadura":
        return {"type": "arma-armadura"}
    m = re.match(r"^Superior \((\d) modificaç", s)
    if m:
        return {"type": "superior", "modifications": int(m.group(1))}
    m = re.match(r"^(\d+|\d+d\d+(?:\+\d+)?) poç", s)
    if m:
        return {"type": "pocao", "count": m.group(1)}
    m = re.match(r"^Item mágico \((menor|médio|maior)\)$", s)
    assert m, s
    return {"type": "magico", "tier": {"menor": "menor", "médio": "medio", "maior": "maior"}[m.group(1)]}


# Nomes da tabela que diferem do nome no catálogo.
ALIASES = {"kit-de-oficio-escolha-um": "kit-de-oficio", "racoes-de-viagem": "racao-de-viagem", "machado-taurico": "machado-de-minotauro"}


def _rows(rows: list[dict], equipment_ids: dict[str, str] | None = None) -> list[dict]:
    out = []
    for r in sorted(rows, key=lambda r: r["range"][0]):
        row = {"range": r["range"], "result": pi.scrub(r["result"])}
        if equipment_ids is not None:
            name = re.sub(r"\s*\(\d+\)$", "", re.sub(r"^\d+d\d+ ", "", row["result"]))
            key = ALIASES.get(slug(name), slug(name))
            eid = equipment_ids.get(key) or equipment_ids.get(key.rstrip("s"))
            assert eid, f"item sem entrada no catálogo: {row['result']}"
            row["entryId"] = eid
            q = re.match(r"^(\d+d\d+) ", row["result"]) or re.search(r"\((\d+)\)$", row["result"])
            if q:
                row["quantity"] = q.group(1)
        if "counts" in r:
            row["counts"] = r["counts"]
        out.append(row)
    lo = 1
    for row in out:  # as faixas cobrem 1–100 sem buracos
        assert row["range"][0] == lo, (row, lo)
        lo = row["range"][1] + 1
    assert lo == 101, out[-1]
    return out


def treasure_data(t: dict, equipment: list[dict]) -> dict:
    ids = {slug(e["name"]): e["id"] for e in equipment}
    ids |= {e["id"].split(":", 1)[1]: e["id"] for e in equipment}
    by_nd = [{"nd": r["nd"],
              "money": [{"range": x["range"], "result": pi.scrub(x["result"]), "roll": money_result(x["result"])} for x in r["money"]],
              "items": [{"range": x["range"], "result": x["result"], "roll": item_result(x["result"])} for x in r["items"]]}
             for r in t["byNd"]]
    wealth = []
    for w in t["wealth"]:
        wealth.append({"menor": w["menor"], "media": w["media"], "maior": w["maior"], **_dice(w["value"]),
                       "average": w["average"], "examples": pi.scrub(w["examples"])})
    for tier in ("menor", "media", "maior"):  # cada coluna cobre 1–100
        _rows([{"range": w[tier], "result": str(w["average"])} for w in wealth if w[tier]])
    misc = _rows(t["misc"], ids)
    return {
        "byNd": by_nd,
        "wealth": wealth,
        "misc": misc,
        "weapons": _rows(t["weapons"], ids),
        "armors": _rows(t["armors"], ids),
        "weaponMods": [{**r, "entryId": ids.get(slug(r["result"]))} if slug(r["result"]) in ids else r for r in _rows(t["weaponMods"])],
        "armorMods": [{**r, "entryId": ids.get(slug(r["result"]))} if slug(r["result"]) in ids else r for r in _rows(t["armorMods"])],
        "perScene": [{"level": x["level"], "value": x["value"]} for x in t["perScene"]],
        "weaponEnchantSpecific": t["weaponEnchantSpecific"],
        "armorEnchantSpecific": t["armorEnchantSpecific"],
        "materials": [f"equipment:{m}" for m in t["materials"]],
    }


# ---------------------------------------------------------------------------
# Entradas
# ---------------------------------------------------------------------------

STAT_LABELS = [("initiative", "Iniciativa"), ("perception", "Percepção"), ("defense", "Defesa"), ("fort", "Fort"),
               ("ref", "Ref"), ("will", "Von"), ("hp", "PV"), ("mp", "PM")]


def _signed(n: int) -> str:
    return f"+{n}" if n >= 0 else f"–{-n}"


def creature_text(c: dict) -> str:
    """Resumo da ficha em uma linha, para busca e para o campo de texto."""
    parts = [f"{c['creatureType']} {c['level']}, {c['size']}"]
    stats = []
    for k, lab in STAT_LABELS:
        if c.get(k) is not None:
            stats.append(f"{lab} {_signed(c[k]) if k in ('initiative', 'perception', 'fort', 'ref', 'will') else c[k]}")
    parts.append(", ".join(stats))
    if c.get("melee"):
        parts.append("Corpo a corpo: " + "; ".join(c["melee"]))
    if c.get("ranged"):
        parts.append("À distância: " + "; ".join(c["ranged"]))
    return ". ".join(parts) + "."


def build_gm(raw: dict, equipment: list[dict], entry) -> dict[str, list[dict]]:
    creatures = []
    for c in raw["creatures"]:
        data = {k: v for k, v in c.items() if k not in ("name", "page") and v not in (None, "", [], {})}
        data["group"] = GROUPS.get(c["group"], c["group"])
        data = _scrub_data(data)
        e = entry("creature", slug(pi.scrub(c["name"])), c["name"], c["page"], "Capítulo 7: Ameaças", creature_text(data), data)
        e["name"] = e["name"][:1].upper() + e["name"][1:]
        e["summary"] = f"ND {c['nd']} · {data['creatureType'][:1].upper() + data['creatureType'][1:]} {c['level']}, {c['size']} · {data['group']}"
        creatures.append(e)

    hazards = []
    for h in raw["hazards"]:
        data = _scrub_data({k: v for k, v in h.items() if k not in ("name", "page", "text") and v not in (None, "", [])})
        text = h.get("text") or " ".join(x for x in (h.get("objective"), h.get("effect")) if x) or h.get("effect", "")
        if h["hazardType"] in ("doenca", "veneno"):
            text = f"{h['vector']}, CD {h['dc']}. {h['effect']}" + (".", "")[h["effect"].endswith(".")]
        hazards.append(entry("hazard", slug(pi.scrub(h["name"])), h["name"], h["page"], "Capítulo 7: Perigos", text, data))

    rules = []
    for c in raw["conditions"]:
        rules.append(entry("condition", slug(c["name"]), c["name"], c["page"], "Apêndice: Condições", c["text"], {}))
    for a in raw["creatureAbilities"]:
        rules.append(entry("rule", "habilidade-" + slug(a["name"]), a["name"], a["page"], "Apêndice: Habilidades de Criaturas",
                           a["text"], {"category": "habilidade-de-criatura"}))
    for t in raw["creatureTraits"]:
        group = TRAIT_GROUPS[t["group"]]
        rules.append(entry("rule", slug(f"{group} {pi.scrub(t['name'])}"), t["name"], t["page"], "Capítulo 7: Ameaças",
                           t["text"], {"category": "traco-de-grupo", "group": group}))
    seen = set()
    for s in raw["rules"]:
        title = "Fichas para NPCs" if s["title"] == "Fichas para NPC" else s["title"]
        rid = slug(pi.scrub(title))
        if rid in seen:
            rid = slug(f"{s['group']} {title}")
        seen.add(rid)
        subsections = [{"title": pi.scrub(x["title"]), "text": _paragraphs(x["text"])} for x in s["subsections"]]
        body = strip_table_headers(s["text"] or (s["subsections"][0]["text"] if s["subsections"] else ""))
        ruleTables = _scrub_data(raw.get("ruleTables", {}).get(rid, []))
        for t in ruleTables:
            if t.get("notes") and rid == "viagens":  # o sinal de multiplicação é um desenho no PDF
                t["notes"] = ["1. Deslocamento × 0,5 km.", "2. Distância por hora × 8."]
        e = entry("rule", rid, title, s["page"], s["chapter"], body,
                  {"category": "regra", "chapter": s["chapter"], "group": pi.scrub(s["group"]),
                   **({"subsections": subsections} if subsections else {}),
                   **({"tables": ruleTables} if ruleTables else {})})
        e["data"]["text"] = _paragraphs(s["text"])
        rules.append(e)
    rules.append(entry("rule", "tabelas-de-tesouro", "Tabelas de tesouro", 314, "Capítulo 8: Recompensas",
                       "Tabelas 8-2 a 8-7: tesouro por ND, riquezas, itens diversos, armas e armaduras, itens superiores e tesouro médio por cena.",
                       {"category": "tabela", "treasure": treasure_data(raw["treasure"], equipment)}))
    return {"creatures": creatures, "hazards": hazards, "gm-rules": rules}
