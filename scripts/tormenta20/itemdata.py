"""Dados estruturados de itens para o inventário da ficha.

* Armas e armaduras específicas: o livro descreve cada uma como "<item base> <modificações>
  <encantos> [de <material>]" (ex.: "Esta armadura completa reforçada defensora de adamante").
  Daqui saem baseItemId, modifications, enchantments e materialId.
* Bônus fixos ("Você recebe +2 em Carisma", "+2 de Defesa", "+2 em testes de resistência")
  viram data.bonuses, que o motor aplica quando o item está equipado.
"""
from __future__ import annotations

import re
import unicodedata

ABILITIES = {"Força": "for", "Destreza": "des", "Constituição": "con", "Inteligência": "int", "Sabedoria": "sab", "Carisma": "car"}


def _fold(s: str) -> str:
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()


def _stem(word: str) -> str:
    """Radical sem flexão de gênero e número (defensora/defensor, guardiã/guardião, zelosa/zeloso)."""
    w = _fold(word)
    for suf in ("oes", "aes", "ao", "as", "os", "es", "a", "o", "s"):
        if len(w) > 4 and w.endswith(suf):
            return w[: -len(suf)]
    return w


def _stems(phrase: str) -> tuple[str, ...]:
    return tuple(_stem(w) for w in re.findall(r"[\wÀ-ú-]+", phrase))


def structure_specific(entries: list[dict], equipment: list[dict]) -> None:
    """Preenche baseItemId/modifications/enchantments/materialId em armas e armaduras específicas."""
    bases = [(e["id"], _stems(e["name"])) for e in equipment if e["data"].get("category") in ("arma", "armadura", "escudo")]
    # Plural do nome base também aparece ("Estas espadas longas").
    bases.sort(key=lambda b: -len(b[1]))
    mods = [(e["id"], _stems(e["name"].split(" (")[0])) for e in equipment if e["data"].get("category") == "modificacao"]
    mats = [(e["id"], _stems(e["name"])) for e in equipment if e["data"].get("category") == "material"]
    enchants_by_target = {
        kind: [(e["id"], _stems(e["name"])) for e in entries if e["data"].get("category") == "encanto"
               and (e["data"].get("target") == "arma") == (kind == "arma")]
        for kind in ("arma", "armadura")
    }
    for e in entries:
        if e["data"].get("category") not in ("arma-magica", "armadura-magica"):
            continue
        enchants = enchants_by_target["arma" if e["data"]["category"] == "arma-magica" else "armadura"]
        words = _stems(e["data"]["text"])
        best = None
        for i in range(len(words)):
            for bid, b in bases:
                if words[i : i + len(b)] == b:
                    best = (i, bid, len(b))
                    break
            if best:
                break
        if not best:
            continue
        i, bid, n = best
        if bid == "equipment:escudo-leve" and "pesad" in words[i + 1 : i + 2]:
            bid = "equipment:escudo-pesado"
        j = i + n
        found_mods, found_ench, material = [], [], None
        while j < len(words):
            matched = False
            for pool, out in ((mods, found_mods), (enchants, found_ench)):
                for cid, s in sorted(pool, key=lambda p: -len(p[1])):
                    if words[j : j + len(s)] == s:
                        out.append(cid)
                        j += len(s)
                        matched = True
                        break
                if matched:
                    break
            if not matched and words[j] == "de":
                for cid, s in mats:
                    if words[j + 1 : j + 1 + len(s)] == s:
                        material = cid
                        j += 1 + len(s)
                        matched = True
                        break
            if not matched:
                break
        e["data"]["baseItemId"] = bid
        if found_mods:
            e["data"]["modifications"] = found_mods
        if found_ench:
            e["data"]["enchantments"] = found_ench
        if material:
            e["data"]["materialId"] = material


BONUS_PATTERNS = [
    (re.compile(r"^Você recebe \+(\d+) (?:em|de) (Força|Destreza|Constituição|Inteligência|Sabedoria|Carisma)(?: \([^)]*\))?\.$"),
     lambda m: {"target": f"ability:{ABILITIES[m.group(2)]}", "value": int(m.group(1))}),
    (re.compile(r"^Você recebe \+(\d+) (?:em|de|na) Defesa\.$"),
     lambda m: {"target": "defense", "value": int(m.group(1))}),
    (re.compile(r"^Você recebe \+(\d+) (?:em|de|na) Defesa, cumulativo com outros itens mágicos, mas não com armaduras\.$"),
     lambda m: {"target": "defense", "value": int(m.group(1)), "stacks": True, "noArmor": True}),
    (re.compile(r"^Como braceletes de bronze, mas fornece \+(\d+) em Defesa\.$"),
     lambda m: {"target": "defense", "value": int(m.group(1)), "stacks": True, "noArmor": True}),
    (re.compile(r"^Você recebe \+(\d+) (?:em|nos) testes de resistência\.$"),
     lambda m: {"target": "saves", "value": int(m.group(1))}),
]


def structure_bonuses(entries: list[dict]) -> None:
    for e in entries:
        if e["data"].get("category") not in ("acessorio", "arma-magica", "armadura-magica"):
            continue
        bonuses = []
        for sentence in re.split(r"(?<=[.!?])\s+", e["data"]["text"]):
            # "Você recebe +2 em Força e a habilidade Briga" também conta o bônus de atributo.
            sentence = re.sub(r" e a habilidade [^.]*\.$", ".", sentence.strip())
            for pat, make in BONUS_PATTERNS:
                m = pat.match(sentence)
                if m:
                    bonuses.append(make(m))
                    break
        if bonuses:
            e["data"]["bonuses"] = bonuses
