"""Converte o texto de pré-requisitos do livro na DSL de pré-requisitos do RPG Forge.

O que não puder ser expresso vira {"type": "gmJudgement"} com o texto original
(já sem Identidade do Produto), para o mestre avaliar.
"""
from __future__ import annotations

import re
import unicodedata

ABIL = {"For": "for", "Des": "des", "Con": "con", "Int": "int", "Sab": "sab", "Car": "car"}
CLASSES = {
    "arcanista": "arcanista", "bárbaro": "barbaro", "bardo": "bardo", "bucaneiro": "bucaneiro", "caçador": "cacador",
    "cavaleiro": "cavaleiro", "clérigo": "clerigo", "druida": "druida", "guerreiro": "guerreiro", "ladino": "ladino",
    "lutador": "lutador", "nobre": "nobre", "paladino": "paladino", "inventor": "artifice",
}
CASTERS = ["class:arcanista", "class:bardo", "class:clerigo", "class:druida"]
# Nível de classe em que cada conjurador alcança cada círculo (Arcanista e clérigo a cada 4 níveis; bardo e druida a partir do 6º).
CIRCLE_LEVEL = {
    "class:arcanista": {1: 1, 2: 5, 3: 9, 4: 13, 5: 17},
    "class:clerigo": {1: 1, 2: 5, 3: 9, 4: 13, 5: 17},
    "class:bardo": {1: 1, 2: 6, 3: 10, 4: 14},
    "class:druida": {1: 1, 2: 6, 3: 10, 4: 14},
}


def slug(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def _key(s: str) -> str:
    return slug(re.sub(r"\s+", " ", s))


class Context:
    def __init__(self, skills: dict[str, str], powers: dict[str, str], spells: dict[str, str], deities: list[str], scrub):
        self.skills = {_key(k): v for k, v in skills.items()}
        self.powers = {_key(k): v for k, v in powers.items()}
        self.spells = {_key(k): v for k, v in spells.items()}
        self.deities = deities
        self.scrub = scrub


def _atom(piece: str, ctx: Context, owner_class: str | None, prefix: str | None = None):
    p = piece.strip().rstrip(".").strip()
    p = re.sub(r"\s+e$", "", p)  # marcador de habilidade mágica que vaza do texto
    if prefix and not re.match(r"(?i)treinad", p):
        p = f"{prefix} {p}"
    if not p:
        return None

    m = re.fullmatch(r"(For|Des|Con|Int|Sab|Car) (\d+)", p)
    if m:
        return {"type": "minAbility", "ability": ABIL[m.group(1)], "value": int(m.group(2))}

    m = re.fullmatch(r"(\d+)\s*[º°ª] nível de personagem", p)
    if m:
        return {"type": "minLevel", "level": int(m.group(1))}

    m = re.fullmatch(r"(\d+)\s*[º°ª] nível de (\w+)", p)
    if m and m.group(2).lower() in CLASSES:
        return {"type": "minClassLevel", "classId": f"class:{CLASSES[m.group(2).lower()]}", "level": int(m.group(1))}

    m = re.fullmatch(r"(?i)treinad[oa] em ([\wÀ-ú]+)(?: \(([^)]*)\))?", p)
    if m and _key(m.group(1)) in ctx.skills:
        return {"type": "hasProficiency", "proficiency": ctx.skills[_key(m.group(1))]}

    m = re.fullmatch(r"(?i)proficiência com (armaduras pesadas|escudos|armas marciais|armas exóticas|armas de fogo)", p)
    if m:
        return {"type": "hasProficiency", "proficiency": f"prof:{m.group(1).lower()}"}

    if p in ("Bruxo", "Mago", "Feiticeiro"):
        return {"type": "hasContent", "contentId": f"feature:arcanista-{slug(p)}"}

    if re.fullmatch(r"(?i)(possuir a )?habilidade de classe Magias", p):
        return {"type": "anyOf", "of": [{"type": "hasClass", "classId": c} for c in CASTERS]}
    if re.fullmatch(r"(?i)não possuir a habilidade de classe Magias", p):
        return {"type": "not", "of": {"type": "anyOf", "of": [{"type": "hasClass", "classId": c} for c in CASTERS]}}

    m = re.fullmatch(r"(?i)lançar magias de (\d)\s*[º°] círculo", p)
    if m:
        n = int(m.group(1))
        return {"type": "anyOf", "of": [
            {"type": "minClassLevel", "classId": c, "level": lv[n]} for c, lv in CIRCLE_LEVEL.items() if n in lv
        ]}

    if re.fullmatch(r"(?i)devoto de um deus maior|devoto", p):
        return {"type": "anyOf", "of": [{"type": "hasContent", "contentId": d} for d in ctx.deities]}

    # Poder ou magia pelo nome (com qualificadores do tipo "com a arma escolhida").
    name = re.sub(r"\s+(com a .* escolhida|duas vezes)$", "", p)
    k = _key(name)
    if owner_class and f"{owner_class}-{k}" in ctx.powers:
        return {"type": "hasContent", "contentId": ctx.powers[f"{owner_class}-{k}"]}
    if k in ctx.powers:
        return {"type": "hasContent", "contentId": ctx.powers[k]}
    if k in ctx.spells:
        return {"type": "hasContent", "contentId": ctx.spells[k]}
    return {"type": "gmJudgement", "description": ctx.scrub(p)}


def _split_top(text: str) -> list[str]:
    """Divide por vírgulas fora de parênteses."""
    parts, depth, cur = [], 0, ""
    for ch in text:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    parts.append(cur)
    return [p.strip() for p in parts if p.strip()]


def parse(text: str, ctx: Context, owner_class: str | None = None):
    text = re.sub(r"\.\s*e$", "", text.strip()).strip().rstrip(".")
    if not text:
        return None
    # "devoto de uma divindade (exceto X, Y)" é tratado como um todo.
    m = re.search(r"devoto de uma divindade \(exceto ([^)]*)\)", text)
    pre = []
    if m:
        excluded = {slug(x) for x in re.split(r",\s*|\s+e\s+", m.group(1))}
        pre.append({"type": "anyOf", "of": [{"type": "hasContent", "contentId": d} for d in ctx.deities if d.split(":")[1] not in excluded]})
        text = (text[: m.start()] + text[m.end():]).strip(" ,")
    atoms = list(pre)
    pieces = []
    for piece in _split_top(text):
        m = re.fullmatch(r"(?i)(treinad[oa] em) ([\wÀ-ú]+) e ([\wÀ-ú]+)", piece.strip())
        pieces += [f"{m.group(1)} {m.group(2)}", f"{m.group(1)} {m.group(3)}"] if m else [piece]
    for piece in pieces:
        alts = re.split(r"\s+ou\s+", piece)
        if len(alts) > 1:
            prefix = None
            pm = re.match(r"(?i)(treinad[oa] em)\s", alts[0])
            if pm:
                prefix = pm.group(1)
            parsed = [_atom(a, ctx, owner_class, prefix if i else None) for i, a in enumerate(alts)]
            # "Canalizar Energia Positiva ou Negativa": alternativa sem sujeito -> julgamento do mestre.
            if any(x and x["type"] == "gmJudgement" for x in parsed):
                atoms.append({"type": "gmJudgement", "description": ctx.scrub(piece)})
            else:
                atoms.append({"type": "anyOf", "of": [x for x in parsed if x]})
        else:
            a = _atom(piece, ctx, owner_class)
            if a:
                atoms.append(a)
    if not atoms:
        return None
    return atoms[0] if len(atoms) == 1 else {"type": "allOf", "of": atoms}
