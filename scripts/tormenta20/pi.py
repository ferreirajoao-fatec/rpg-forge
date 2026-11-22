"""Substituição de termos de Identidade do Produto (Tormenta20, p. 391).

O livro declara como Identidade do Produto "todos os termos referentes ao cenário
de Tormenta, incluindo nomes e descrições de personagens, deuses, lugares e
fenômenos" e as regras da classe inventor. Este módulo troca esses termos por
equivalentes genéricos e remove frases que só existem para citar personagens do
cenário (texto de ambientação, não de regras).
"""
from __future__ import annotations

import re

# Deus -> (título genérico, gênero). O título descreve a função, sem o nome.
GODS: dict[str, tuple[str, str]] = {
    "Aharadak": ("Deus Aberrante", "m"),
    "Allihanna": ("Deusa da Natureza", "f"),
    "Arsenal": ("Deus da Guerra", "m"),
    "Azgher": ("Deus do Sol", "m"),
    "Hyninn": ("Deus da Trapaça", "m"),
    "Kallyadranoch": ("Deus dos Dragões", "m"),
    "Kally": ("Deus dos Dragões", "m"),
    "Khalmyr": ("Deus da Justiça", "m"),
    "Heredrimm": ("Deus da Justiça", "m"),
    "Lena": ("Deusa da Vida", "f"),
    "Lin-Wu": ("Deus da Honra", "m"),
    "Marah": ("Deusa da Paz", "f"),
    "Megalokk": ("Deus dos Monstros", "m"),
    "Nimb": ("Deus do Caos", "m"),
    "Oceano": ("Deus dos Mares", "m"),
    "Sszzaas": ("Deus da Traição", "m"),
    "Tanna-Toh": ("Deusa do Conhecimento", "f"),
    "Tenebra": ("Deusa das Trevas", "f"),
    "Thwor": ("Deus dos Goblinoides", "m"),
    "Thyatis": ("Deus da Profecia", "m"),
    "Valkaria": ("Deusa da Ambição", "f"),
    "Wynna": ("Deusa da Magia", "f"),
    "Glórienn": ("Deusa dos Elfos", "f"),
    "Tauron": ("Deus da Força", "m"),
    "Tilliann": ("Deus dos Gnomos", "m"),
    "Ragnar": ("Deus da Morte", "m"),
}

# Raças com nomes do cenário (mesmos nomes usados em pack.ts).
RACES: list[tuple[str, str]] = [
    (r"\bqareens?\b", "meios-gênios"),
    (r"\bdahllans?\b", "meias-dríades"),
    (r"\bhynnes?\b", "halflings"),
    (r"\bklirens?\b", "meios-gnomos"),
    (r"\bosteons?\b", "esqueletos despertos"),
    (r"\bsuraggels?\b", "descendentes planares"),
    (r"\baggelus\b", "descendentes celestiais"),
    (r"\bsulfures?\b", "descendentes abissais"),
    (r"\btrogs\b", "trogloditas"),
    (r"\btrog\b", "troglodita"),
    (r"\blefous\b", "crias aberrantes"),
    (r"\blefou\b", "cria aberrante"),
    # "lefeu" também é usado como plural ("Lefeu são imunes...").
    (r"\blefeu(?= (?:são|não precisam|têm|possuem)\b)", "criaturas aberrantes"),
    (r"\blefeus\b", "criaturas aberrantes"),
    (r"\blefeu\b", "criatura aberrante"),
    (r"\bduyshidakks?\b", "goblinoides"),
    (r"\binventor(es)?\b", lambda m: "artífice" + ("s" if m.group(1) else "")),
]

# Personagens do cenário: frases que os citam são ambientação e são removidas.
NPCS = [
    "Vectorius", "Talude", "Reynard", "Edauros", "Vladislav", "Ichabod", "Aleph", "Mestre Arsenal",
    "Sckhar", "Lisandra", "Ferren Asloth", "Rhogar", "Zaled",
    # Lugares do cenário citados como ambientação.
    "Bielefeld", "Zakharov", "Yuvalin", "Montanhas Uivantes", "Deheon", "Doherimm", "Lenórienn", "Tamu-ra",
    "Montanhas Sanguinárias", "Deserto da Perdição", "Tiberus", "Rhond", "Grande Corruptor",
    "Lamnor", "Tyrondir", "Ahlen", "Wynlla", "Sambúrdia", "Callistia", "Petrynia", "Portsmouth", "Trebuck",
]

# Trocas pontuais (aplicadas antes das regras gerais). Nomes de magias e poderes
# que citam personagens ou fenômenos do cenário perdem a referência.
PHRASES: list[tuple[str, str]] = [
    (r"\s+de (Edauros|Reynard|Talude|Vectorius|Vladislav|Ichabod|Aleph)\b", ""),
    (r"roubar o tesouro de Sckhar", "roubar o tesouro de um rei dragão"),
    (r"uma carona de barco até Galrasia", "uma carona de barco até uma ilha distante"),
    (r"“Gwen, a elfa”", "“a elfa de cabelos prateados”"),
    (r"a espada longa encantada do Barão Rulyn", "a espada longa encantada do barão local"),
    (r"Mundos dos Deuses", "planos divinos"),
    (r"Deus-Sol", "Deus do Sol"),
    (r"por legionários do Império de Tauron", "por legionários de impérios militaristas"),
    (r"Afinidade com a Tormenta", "Afinidade Aberrante"),
    (r"Tropas Duyshidakk", "Tropas Goblinoides"),
    (r"Inimigo de Tenebra", "Inimigo das Trevas"),
    (r"Linhagem Rubra", "Linhagem Aberrante"),
    (r"Machado Táurico", "Machado de Minotauro"),
    (r"Sorte de Nimb", "Sorte do Caos"),
    (r"Martelo de Doherimm", "Martelo dos Anões"),
    (r"Usado por chefes bárbaros das Montanhas Sanguinárias, este", "Usado por chefes bárbaros, este"),
    (r" é originária do Deserto da Perdição\.", " vem dos grandes desertos."),
    # Ameaças (Capítulo 7): criaturas, grupos e facções com nomes do cenário.
    (r"Maníaco [Ll]efou", "Maníaco Aberrante"),
    (r"maníaco lefou", "maníaco aberrante"),
    (r"Insanidade da Tormenta", "Insanidade Aberrante"),
    (r"adaga da Tormenta", "adaga aberrante"),
    (r"Sombra Rubra", "Sombra Aberrante"),
    (r"Visco Rubro", "Visco Aberrante"),
    (r"\bPuristas\b", "Fanáticos"),
    (r"\bPurista\b", "Fanático"),
    (r"\bpuristas\b", "fanáticos"),
    (r"\bpurista\b", "fanático"),
    (r"Cavaleiro do Leopardo Negro", "Cavaleiro Sombrio"),
    (r"cavaleiro do Leopardo Negro", "cavaleiro sombrio"),
    (r"Leopardo Negro", "Ordem Sombria"),
    (r"Tirano do Terceiro", "Tirano Dracônico"),
    (r"tirano do Terceiro", "tirano dracônico"),
    (r"\bGeraktril\b", "Aberração Ceifadora"),
    (r"\bgeraktril\b", "aberração ceifadora"),
    (r"\bUktril\b", "Aberração Rastejante"),
    (r"\buktril\b", "aberração rastejante"),
    (r"\bReishid\b", "Aberração Espiã"),
    (r"\breishid\b", "aberração espiã"),
    (r"\bThuwarokk\b", "Aberração Colossal"),
    (r"\bthuwarokk\b", "aberração colossal"),
    (r"\bGorloggs?\b", "Lobo-Crocodilo"),
    (r"\bgorloggs?\b", "lobo-crocodilo"),
    (r"\bLagash\b", "Serpente Colossal"),
    (r"\blagash\b", "serpente colossal"),
    (r"\bNagahs?\b", "Naga"),
    (r"\bnagahs?\b", "naga"),
    (r"\bFinntrolls\b", "Trolls Nobres"),
    (r"\bfinntrolls?\b(?= raramente| deixam)", "trolls nobres"),
    (r"\bFinntroll\b", "Troll Nobre"),
    (r"\bfinntrolls?\b", "troll nobre"),
    (r"troll glacioll", "troll do gelo"),
    (r"\bglacioll\b", "troll do gelo"),
    (r"\bghillanin\b", "troll das rochas"),
    (r"\bvrakoll\b", "troll aquático"),
    (r"habitantes das Uivantes", "habitantes de montanhas geladas"),
    (r"\bGlops?\b", "Gosma Ácida"),
    (r"\bglops?\b", "gosma ácida"),
    (r"antigos\s+(?:[Tt]ibares|moedas|T\$|TO)\s+de\s+ouro,\s+da\s+época\s+do\s+Rei-\s*Imperador\s+Phylidio,\s+o\s+Tranquilo",
     "antigas moedas de ouro, cunhadas por um rei esquecido"),
    (r"Sopro das Uivantes", "Sopro Glacial"),
    (r"travessia pelo Deserto da Perdição", "travessia por um grande deserto"),
    (r"\b[Ee]m Tormenta20\b", lambda m: ("Neste" if m.group(0)[0] == "E" else "neste") + " jogo"),
    (r"\b[Ss]szzaazitas?\b", "da Traição"),
    (r"de origem lefeu", "de origem aberrante"),
    (r"As terras de Tollon produzem", "Certas florestas produzem"),
    (r"\bDoherimm\b", "o reino anão"),
    # Itens com nomes de lugares, criaturas e fenômenos do cenário.
    (r"[Bb]atata [Vv]alkariana", "Batata da Capital"),
    (r"[Mm]acarrão de Yuvalin", "Macarrão das Montanhas"),
    (r"[Gg]orad [Qq]uente", "Cacau Quente"),
    (r"\bgorad\b", "cacau"),
    (r"\bGorad\b", "Cacau"),
    (r"\b[Tt]robos\b", "aves de carga"),
    (r"\bTrobo\b", "Ave de Carga"),
    (r"\btrobo\b", "ave de carga"),
    (r"[Mm]adeira [Tt]ollon", "Madeira-de-Ferro"),
    (r"\bTollon\b", "madeira-de-ferro"),
    (r"[Mm]atéria [Vv]ermelha", "Matéria Aberrante"),
    (r"\bvalkarian[oa]s?\b", "da capital"),
    (r"poderes da Tormenta", "poderes aberrantes"),
    (r"poder da Tormenta", "poder aberrante"),
    (r"Poderes da Tormenta", "Poderes Aberrantes"),
    (r"área de Tormenta", "área aberrante"),
    (r"áreas de Tormenta", "áreas aberrantes"),
    (r"\bTormenta\b", "tempestade aberrante"),
    (r"tempestade rubra", "tempestade aberrante"),
    (r"\bde Arton\b", "do mundo"),
    (r"\bem Arton\b", "no mundo"),
    (r"\bartonian[oa]s\b", "do mundo"),
    (r"\bArton\b", "o mundo"),
    (r"\bEspada-Deus\b", "Espada Divina"),
    (r"\bespada-deus\b", "espada divina"),
    (r"jogos como wyrt", "jogos de cartas"),
    (r"mesa de wyrt ou outro jogo de azar", "mesa de cartas ou outro jogo de azar"),
    (r"\bdo Reinado\b", "dos reinos"),
    (r"\bno Reinado\b", "nos reinos"),
    (r"\bo Reinado\b", "os reinos"),
    (r"\bReinado\b", "reinos"),
    (r"\btibares\b", "moedas"),
    (r"\bTibares\b", "moedas"),
    (r"\btibar\b", "moeda"),
    (r"T\$\s*(\d+(?:\.\d{3})*(?:,\d+)?)", r"\1 moedas"),
    (r"\(T\$\)", "(moedas)"),
    (r"T\$", "moedas"),
]


def _god_sub(text: str) -> str:
    for name, (title, g) in sorted(GODS.items(), key=lambda kv: -len(kv[0])):
        art, de, por, em, a = ("o", "do", "pelo", "no", "ao") if g == "m" else ("a", "da", "pela", "na", "à")
        n = re.escape(name)
        text = re.sub(rf"\b(?:de|do|da) {n}\b", f"{de} {title}", text)
        text = re.sub(rf"\b(?:por|pelo|pela) {n}\b", f"{por} {title}", text)
        text = re.sub(rf"\b(?:em|no|na) {n}\b", f"{em} {title}", text)
        text = re.sub(rf"(?<![\wÀ-ú])a {n}\b", f"{a} {title}", text)
        text = re.sub(rf"\b(?:o|a) {n}\b", f"{art} {title}", text)
        text = re.sub(rf"\b{n}\b", title, text)
    return text


def drop_npc_sentences(text: str) -> str:
    parts = re.split(r"(?<=[.!?])\s+", text)
    kept = [p for p in parts if not any(re.search(rf"\b{re.escape(n)}\b", p) for n in NPCS)]
    return " ".join(kept)


def scrub(text: str) -> str:
    if not text:
        return text
    text = text.replace("\xad", "")
    # Nomes comuns que coincidem com nomes de deuses ficam protegidos.
    text = text.replace("Arsenal das Profundezas", "@@ARSP@@")
    for pat, rep in PHRASES:
        text = re.sub(pat, rep, text)
    text = drop_npc_sentences(text)
    text = _god_sub(text)
    for pat, rep in RACES:
        text = re.sub(pat, rep, text, flags=re.IGNORECASE) if isinstance(rep, str) else re.sub(pat, rep, text, flags=re.IGNORECASE)
    text = text.replace("@@ARSP@@", "Arsenal das Profundezas")
    return re.sub(r"\s{2,}", " ", text).strip()


# Termos que nunca podem restar no conteúdo gerado (verificado também nos testes).
FORBIDDEN = sorted(
    set(GODS) - {"Oceano", "Arsenal", "Lena"}
    | {"Arton", "Reinado", "Tormenta", "Yuvalin", "Gorad", "gorad", "Trobo", "trobo", "Tollon", "alkarian", "wyrt", "Espada-Deus", "artonian", "Galrasia", "Gwen", "Rulyn", "T$", "tibar", "Tibar", "lefeu", "lefou",
       "qareen", "dahllan", "hynne", "kliren", "osteon", "suraggel", "aggelus", "sulfure", "Duyshidakk", "nventor",
       "Purista", "purista", "Leopardo Negro", "do Terceiro", "Uktril", "uktril", "Geraktril", "Reishid", "Thuwarokk", "Gorlogg", "gorlogg",
       "Lagash", "lagash", "Nagah", "nagah", "Finntroll", "finntroll", "ghillanin", "glacioll", "vrakoll", "Phylidio", "Glop", "glop", "Uivantes",
       "zzaazita"}
    | set(NPCS)
)


def residual(text: str) -> list[str]:
    text = text.replace("Tormenta20", "").replace("Arsenal das Profundezas", "")
    found = []
    for t in FORBIDDEN + ["Oceano", "Arsenal", "Lena"]:
        if t in ("T$", "nventor", "alkarian", "artonian", "zzaazita"):
            if t in text:
                found.append(t)
        elif re.search(rf"(?<![\wÀ-ú]){re.escape(t)}", text):
            found.append(t)
    return found
