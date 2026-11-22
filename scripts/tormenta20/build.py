"""Monta as entradas do pacote (formato ContentEntry) a partir dos dados extraídos."""
from __future__ import annotations

import re

import pi
import gmbuild
import itemdata
import prereqs
from util import slug

CLASS_NAMES = {"arcanista": "Arcanista", "barbaro": "Bárbaro", "bardo": "Bardo", "bucaneiro": "Bucaneiro",
               "cacador": "Caçador", "cavaleiro": "Cavaleiro", "clerigo": "Clérigo", "druida": "Druida",
               "guerreiro": "Guerreiro", "ladino": "Ladino", "lutador": "Lutador", "nobre": "Nobre", "paladino": "Paladino"}
SKILLS = ["Acrobacia", "Adestramento", "Atletismo", "Atuação", "Cavalgar", "Conhecimento", "Cura", "Diplomacia",
          "Enganação", "Fortitude", "Furtividade", "Guerra", "Iniciativa", "Intimidação", "Intuição", "Investigação",
          "Jogatina", "Ladinagem", "Luta", "Misticismo", "Nobreza", "Ofício", "Percepção", "Pilotagem", "Pontaria",
          "Reflexos", "Religião", "Sobrevivência", "Vontade"]
CASTER_TRADITION = {"class:arcanista": "arcana", "class:bardo": "arcana", "class:clerigo": "divina", "class:druida": "divina"}
SPELL_FIELDS = {"execução": "execution", "alcance": "range", "alvo": "target", "alvos": "target", "área": "area", "alvoouárea": "targetOrArea",
                "efeito": "effect", "duração": "duration", "resistência": "resistance"}


def summary_of(text: str, limit: int = 220) -> str:
    first = re.split(r"(?<=[.!?])\s+", text, maxsplit=1)[0] if text else ""
    return first if len(first) <= limit else first[: limit - 1].rsplit(" ", 1)[0] + "…"


def src(page: int, section: str) -> dict:
    return {"sourcebookId": "t20-2020", "edition": "2020", "version": "1ª edição (2020)", "section": section, "page": page}


def entry(kind: str, id_: str, original: str, page: int, section: str, text: str, data: dict, prereq=None) -> dict:
    name = pi.scrub(original)
    text = pi.scrub(text)
    e = {"id": f"{kind}:{id_}", "kind": kind, "name": name, "summary": summary_of(text),
         "origin": "official", "source": src(page, section), "license": "OGL-1.0a", "roles": [],
         "data": {"text": text, **data}}
    if name != original:
        e["data"]["renamed"] = {"reason": "Identidade do Produto (OGL 1.0a, seção 7)",
                                "reference": f"Livro básico (2020), p. {page}"}
    if prereq is not None:
        e["prerequisites"] = prereq
    return e


def pid(name: str) -> str:
    return slug(pi.scrub(name))


# Artefatos: o texto mistura mitologia do cenário (Identidade do Produto) e regras.
# Ficam só as frases com mecânica de jogo e sem referência a deuses ou à história do cenário.
MECHANICS = re.compile(r"\d|\bCD\b|\bPM\b|teste|dano|fornece|exige|role|cartas?\b|Jogatina|magias?\b|nível|"
                       r"resistência|atroz|indestrutível|crític|aprimoramento|ataques?\b|falhar|rodada|mestre",
                       re.IGNORECASE)
LORE = re.compile(r"Panteão|Deus[a]? d|deuses|divindade|chamam|Criação|\bNada\b|Vazio|princípio|universo|castigo|"
                  r"avatar|plano|roubou|julgado|decretou|tavernas|Dizem|estudiosos|Poucos duvidam|Fisicamente|"
                  r"cobiçado|na verdade|Na verdade")


def rules_only(text: str) -> str:
    sentences = re.split(r"(?<=[.!?])\s+", text)
    return " ".join(x for x in sentences if MECHANICS.search(x) and not LORE.search(x))


def build(raw: dict) -> dict[str, list[dict]]:
    # Divindades (os poderes concedidos apontam para elas).
    deities, power_names = [], {}
    for d in raw["deities"]:
        did = pid(d["name"])
        names = [p.strip() for p in re.split(r",\s*", d.get("grantedPowers", "").split(".")[0]) if p.strip()]
        power_names[f"deity:{did}"] = names
        e = entry("deity", did, d["name"], d["page"], "Capítulo 3: Religião", d.get("obligations", ""), {
            "devotees": pi.scrub(d.get("devotees", "")),
            "channelEnergy": pi.scrub(d.get("channelEnergy", "")).rstrip("."),
            "favoredWeapon": pi.scrub(d.get("favoredWeapon", "")).rstrip("."),
        })
        e["data"]["obligations"] = e["data"].pop("text")
        e["summary"] = f"Devotos: {e['data']['devotees']}"
        deities.append(e)

    granted_by: dict[str, list[str]] = {}
    for did, names in power_names.items():
        for n in names:
            granted_by.setdefault(pid(n), []).append(did)

    ids = {}
    for p in raw["powers"]:
        ids[slug(p["name"])] = ids[pid(p["name"])] = f"power:{pid(p['name'])}"
    for p in raw["classPowers"]:
        full = f"power:{p['class']}-{pid(p['name'])}"
        ids[f"{p['class']}-{slug(p['name'])}"] = ids[f"{p['class']}-{pid(p['name'])}"] = full
    spell_ids = {}
    for s in raw["spells"]:
        spell_ids[slug(s["name"])] = spell_ids[pid(s["name"])] = f"spell:{pid(s['name'])}"
    ctx = prereqs.Context(skills={n: f"skill:{slug(n)}" for n in SKILLS}, powers=ids, spells=spell_ids,
                          deities=[d["id"] for d in deities], scrub=pi.scrub)

    powers = []
    for p in raw["powers"]:
        data: dict = {"group": p["group"]}
        if p.get("magical"):
            data["magical"] = True  # habilidade mágica (símbolo no livro)
        if p["group"] == "concedido":
            data["grantedBy"] = granted_by.get(pid(p["name"]), [])
        pre = None
        if p["prereqText"]:
            data["prerequisiteText"] = pi.scrub(p["prereqText"])
            pre = prereqs.parse(data["prerequisiteText"], ctx)
        if p["group"] == "concedido" and data["grantedBy"]:
            devotion = {"type": "anyOf", "of": [{"type": "hasContent", "contentId": d} for d in data["grantedBy"]]}
            pre = devotion if pre is None else {"type": "allOf", "of": [devotion, pre]}
        powers.append(entry("power", pid(p["name"]), p["name"], p["page"], "Capítulo 2: Poderes", p["text"], data, pre))

    for p in raw["classPowers"]:
        cls = p["class"]
        data = {"group": "classe", "classId": f"class:{cls}"}
        if p.get("magical"):
            data["magical"] = True  # habilidade mágica (símbolo no livro)
        pre: dict = {"type": "hasClass", "classId": f"class:{cls}"}
        if p["prereqText"]:
            data["prerequisiteText"] = pi.scrub(p["prereqText"])
            extra = prereqs.parse(data["prerequisiteText"], ctx, cls)
            if extra:
                pre = {"type": "allOf", "of": [pre, *(extra["of"] if extra["type"] == "allOf" else [extra])]}
        powers.append(entry("power", f"{cls}-{pid(p['name'])}", p["name"], p["page"],
                            f"Capítulo 1: {CLASS_NAMES[cls]}", p["text"], data, pre))

    known = {p["id"] for p in powers}
    for d in deities:
        d["data"]["grantedPowers"] = [f"power:{pid(n)}" for n in power_names[d["id"]] if f"power:{pid(n)}" in known]

    features = [
        entry("feature", f"{f['class']}-{pid(f['name'])}", f["name"], f["page"], f"Capítulo 1: {CLASS_NAMES[f['class']]}",
              f["text"], {"classId": f"class:{f['class']}",
                          "tiers": [{"name": pi.scrub(t["name"]), "text": pi.scrub(t["text"])} for t in f["tiers"]]},
              {"type": "hasClass", "classId": f"class:{f['class']}"})
        for f in raw["classFeatures"]
    ]

    spells = []
    for s in raw["spells"]:
        data = {SPELL_FIELDS[k]: pi.scrub(s[k]) for k in SPELL_FIELDS if s.get(k)}
        data.update({"tradition": s["tradition"], "circle": s["circle"], "school": s["school"],
                     "enhancements": [{"cost": e["cost"], "text": pi.scrub(e["text"])} for e in s["enhancements"]]})
        casters = [c for c, t in CASTER_TRADITION.items() if s["tradition"] in (t, "universal")]
        pre = {"type": "anyOf", "of": [
            {"type": "minClassLevel", "classId": c, "level": prereqs.CIRCLE_LEVEL[c][s["circle"]]}
            for c in casters if s["circle"] in prereqs.CIRCLE_LEVEL[c]
        ]}
        spells.append(entry("spell", pid(s["name"]), s["name"], s["page"], "Capítulo 4: Magia", s["text"], data, pre))

    equipment = []
    for i in raw["equipment"]:
        data = {k: v for k, v in i.items() if k not in ("name", "page", "text") and v is not None}
        if "priceText" in data:
            data["priceText"] = pi.scrub(data["priceText"])
        equipment.append(entry("equipment", pid(i["name"]), i["name"], i["page"], "Capítulo 3: Equipamento", i["text"], data))

    for i in raw["superior"]:
        data = {k: v for k, v in i.items() if k not in ("name", "page", "text", "prereqText") and v not in (None, "", {})}
        if i.get("prereqText"):
            data["requiresModification"] = pi.scrub(i["prereqText"])  # pré-requisito do item, não do personagem
        equipment.append(entry("equipment", pid(i["name"]), i["name"], i["page"], "Capítulo 3: Itens Superiores", i["text"], data))

    spell_by_name = {slug(s["name"]): f"spell:{pid(s['name'])}" for s in raw["spells"]}
    magic_items = []
    for i in raw["magicItems"]:
        data = {k: v for k, v in i.items() if k not in ("name", "page", "text", "spellName") and v is not None}
        text = i["text"]
        if i["category"] == "pocao":
            data["spellId"] = spell_by_name.get(slug(i["spellName"]))
            text = f"Contém a magia {pi.scrub(i['spellName'])}" + (f" ({i['name'].split('(', 1)[1]}" if "(" in i["name"] else "") + "."
            if data.get("form") in ("óleo", "granada"):
                text += " " + {"óleo": "Óleo: aplicado em um objeto com uma ação padrão.",
                               "granada": "Granada: arremessada em alcance curto com uma ação padrão; o efeito é centrado no ponto atingido."}[data["form"]]
        magic_items.append(entry("equipment", pid(i["name"]), i["name"], i["page"], "Capítulo 8: Itens Mágicos", text, data))
    for a in raw["artifacts"]:
        data = {"category": "artefato",
                "tiers": [{**t, "name": pi.scrub(t["name"]), "text": pi.scrub(t["text"]),
                           **({"summary": pi.scrub(t["summary"])} if "summary" in t else {})} for t in a["tiers"]]}
        magic_items.append(entry("equipment", pid(a["name"]), a["name"], a["page"], "Capítulo 8: Artefatos",
                                 rules_only(pi.scrub(a["text"])), data))

    itemdata.structure_specific(magic_items, equipment)
    itemdata.structure_bonuses(magic_items)

    out = {"powers": powers, "features": features, "spells": spells, "deities": deities, "equipment": equipment,
           "magic-items": magic_items}
    if "gm" in raw:
        out.update(gmbuild.build_gm(raw["gm"], equipment, entry))
    return out
