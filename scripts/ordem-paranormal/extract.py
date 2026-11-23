"""Extrai o conteúdo de Ordem Paranormal RPG (v1.1) e Sobrevivendo ao Horror (v1.3.1)
para content/ordem-paranormal-1e/data/.

Uso (Python 3.11+, PyMuPDF):
    python scripts/ordem-paranormal/extract.py "caminho/ordem-paranormal-rpg-v1-1.pdf" ["caminho/sobrevivendo-ao-horror-v1-3-1.pdf"]

Os PDFs nunca entram no repositório.
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "content" / "ordem-paranormal-1e" / "data"

BOOK_CORE = "op-core-1.1"
BOOK_SAH = "op-sah-1.3.1"
LIC = "Proprietário (importação local)"


def slug(s: str) -> str:
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def clean_text(s: str) -> str:
    # Remove NULL bytes, soft hyphens and fix hyphenated line breaks
    s = s.replace("\x00", "").replace("\xad", "")
    s = re.sub(r"(\w)-\s*\n\s*(\w)", r"\1\2", s)
    s = s.replace("\u2022", "•").replace("\uf062", "").replace("\t", " ")
    s = re.sub(r"[ \u00a0]+", " ", s)
    s = re.sub(r" *\n *", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def first_sentence(text: str, limit: int = 240) -> str:
    t = re.sub(r"\s+", " ", text).strip()
    if len(t) <= limit:
        return t
    m = re.search(r"^(.{40,}?[.!?])(?:\s|$)", t)
    if m and len(m.group(1)) <= limit + 40:
        return m.group(1)
    cut = t[:limit].rsplit(" ", 1)[0]
    return cut.rstrip(",;:") + "…"


@dataclass
class Span:
    text: str
    font: str
    size: float
    color: str
    page: int  # book page
    pdf_page: int
    x0: float
    y0: float
    x1: float
    y1: float
    col: int


def format_dice_glyph(txt: str) -> str:
    """Converte glifos da fonte d20-Regular ('O', 'OO') em texto legível."""
    def repl(m: re.Match) -> str:
        n = len(m.group(0))
        return f"{n}d20"
    return re.sub(r"O+", repl, txt)


def page_spans(doc: pymupdf.Document, pdf_page: int, page_offset: int) -> list[Span]:
    """Lê spans de uma página em ordem de colunas (esquerda → direita, topo → base)."""
    page = doc[pdf_page - 1]
    w, h = page.rect.width, page.rect.height
    mid = w * 0.49
    book_page = pdf_page - page_offset
    raw_lines: list[tuple[int, float, float, list[Span]]] = []

    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        bx0, by0, bx1, by1 = b["bbox"]
        # Ignora número de página isolado nas bordas extremas
        if by0 > h - 38 or by1 < 30:
            txt_all = "".join(
                s["text"] for l in b.get("lines", []) for s in l.get("spans", [])
            ).strip()
            if txt_all.isdigit() or len(txt_all) <= 3:
                continue
        for l in b.get("lines", []):
            lx0, ly0, lx1, ly1 = l["bbox"]
            # Coluna: spans muito largos no topo são full-width (col=0), senão esquerda(1) ou direita(2)
            width = lx1 - lx0
            if width > w * 0.56 and ly0 < h * 0.25:
                col = 0
            elif lx0 < mid:
                col = 1
            else:
                col = 2
            line_spans: list[Span] = []
            for s in l.get("spans", []):
                txt = s["text"]
                if not txt:
                    continue
                font = s["font"]
                color = f"{s['color']:06x}"
                size = round(s["size"], 1)
                # Ignora número de página em OptimaLTPro-Bold cinza/dourado na margem
                if font == "OptimaLTPro-Bold" and size == 10.0 and txt.strip().isdigit() and (ly0 < 55 or ly1 > h - 55):
                    continue
                if "d20" in font.lower():
                    txt = format_dice_glyph(txt)
                if "OutroLado" in font:
                    # Marcador de lista (b / I / etc.)
                    txt = "• "
                if "Wingdings" in font or "Symbol" in font:
                    if txt.strip() in ("q", "\uf071", ""):
                        txt = " quadrados"
                txt = txt.replace("\uf071", " quadrados").replace("\uf062", "• ").replace("", " quadrados")
                line_spans.append(Span(txt, font, size, color, book_page, pdf_page, s["bbox"][0], s["bbox"][1], s["bbox"][2], s["bbox"][3], col))
            if line_spans:
                raw_lines.append((col, round(ly0, 1), round(lx0, 1), line_spans))

    raw_lines.sort(key=lambda r: (r[0], r[1], r[2]))
    out: list[Span] = []
    for idx, (col, y0, x0, lspans) in enumerate(raw_lines):
        if idx > 0:
            prev_col, prev_y0, _, _ = raw_lines[idx - 1]
            # Quebra de linha / parágrafo
            if col != prev_col or abs(y0 - prev_y0) > 4:
                if out:
                    out[-1].text += "\n"
        out.extend(lspans)
    return out


def join_spans(spans: list[Span]) -> str:
    parts: list[str] = []
    for s in spans:
        t = s.text
        # Corrige casos onde d20 veio colado a número: "3" + "1d20" -> "3d20"
        if parts and re.search(r"\d$", parts[-1]) and t.startswith("1d20"):
            t = t[1:]
        elif parts and re.search(r"[+–-]$", parts[-1]) and t == "1d20":
            t = "1d20"
        parts.append(t)
    raw = "".join(parts)
    # Corrige "31d20" -> "3d20" se escapou
    raw = re.sub(r"(\d)1d20\b", r"\1d20", raw)
    # Normaliza "+O" / "–O" residuais fora da fonte d20
    raw = re.sub(r"([+–-])OO\b", r"\g<1>2d20", raw)
    raw = re.sub(r"([+–-])O\b", r"\g<1>1d20", raw)
    # Junta quebras de linha dentro de parágrafos
    raw = raw.replace("\x00", "").replace("\xad\n", "").replace("\xad", "")
    # Hifenização tipográfica em português repete o hífen na linha seguinte (ex.: "Pré-\n-requisito:")
    raw = re.sub(r"(\w)-\s*\n\s*-(\w)", r"\1-\2", raw)
    raw = re.sub(r"(\w)-\n(\w)", r"\1\2", raw)
    lines = [ln.strip() for ln in raw.splitlines()]
    joined: list[str] = []
    for ln in lines:
        if not ln:
            continue
        if joined and not joined[-1].endswith((".", "!", "?", ":", ")")) and not ln.startswith("•"):
            joined[-1] += " " + ln
        else:
            joined.append(ln)
    res = re.sub(r"[ \u00a0]+", " ", "\n".join(joined)).strip()
    res = re.sub(r"Pré-+\s*-?requisitos?:", lambda m: "Pré-requisitos:" if m.group(0).lower().endswith("s:") else "Pré-requisito:", res, flags=re.I)
    return res


def src_core(page: int, section: str) -> dict:
    return {"sourcebookId": BOOK_CORE, "edition": "1ª edição", "version": "1.1", "section": section, "page": page}


def src_sah(page: int, section: str) -> dict:
    return {"sourcebookId": BOOK_SAH, "edition": "1ª edição", "version": "1.3.1", "section": section, "page": page}


def make_entry(eid: str, kind: str, name: str, summary: str, source: dict, data: dict, prerequisites: dict | None = None, roles: list[str] | None = None) -> dict:
    e: dict = {
        "id": eid,
        "kind": kind,
        "name": name,
        "summary": summary,
        "origin": "official",
        "source": source,
        "license": LIC,
        "roles": roles or [],
        "data": data,
    }
    if prerequisites:
        e["prerequisites"] = prerequisites
    return e


# ---------------------------------------------------------------------------
# 1. Perícias (Core p. 41–49 / PDF 49–57)
# ---------------------------------------------------------------------------

SKILLS_META = [
    ("Acrobacia", "agi", False, True, False, 41),
    ("Adestramento", "pre", True, False, False, 42),
    ("Artes", "pre", True, False, False, 42),
    ("Atletismo", "for", False, False, False, 42),
    ("Atualidades", "int", False, False, False, 43),
    ("Ciências", "int", True, False, False, 43),
    ("Crime", "agi", True, True, True, 43),
    ("Diplomacia", "pre", False, False, False, 44),
    ("Enganação", "pre", False, False, True, 44),
    ("Fortitude", "vig", False, False, False, 45),
    ("Furtividade", "agi", False, True, False, 45),
    ("Iniciativa", "agi", False, False, False, 45),
    ("Intimidação", "pre", False, False, False, 45),
    ("Intuição", "pre", False, False, False, 45),
    ("Investigação", "int", False, False, False, 46),
    ("Luta", "for", False, False, False, 46),
    ("Medicina", "int", False, False, True, 46),
    ("Ocultismo", "int", True, False, False, 47),
    ("Percepção", "pre", False, False, False, 47),
    ("Pilotagem", "agi", True, False, False, 47),
    ("Pontaria", "agi", False, False, False, 47),
    ("Profissão", "int", True, False, False, 47),
    ("Reflexos", "agi", False, False, False, 48),
    ("Religião", "pre", True, False, False, 48),
    ("Sobrevivência", "int", False, False, False, 48),
    ("Tática", "int", True, False, False, 48),
    ("Tecnologia", "int", True, False, True, 48),
    ("Vontade", "pre", False, False, False, 49),
]

SKILL_NAME_TO_ID = {slug(name): f"skill:{slug(name)}" for name, *_ in SKILLS_META}


def extract_skills(doc: pymupdf.Document) -> list[dict]:
    spans: list[Span] = []
    for p in range(49, 58):
        spans.extend(page_spans(doc, p, 8))

    # Agrupa por cabeçalho DaisyWheel >= 18pt
    blocks: dict[str, list[Span]] = {}
    cur: str | None = None
    for s in spans:
        if "DaisyWheel" in s.font and s.size >= 18:
            # Ex.: "ACROBACIA (AGI)"
            m = re.match(r"([A-ZÀ-ÚÇ ]+?)\s*\(", s.text.strip())
            if m:
                cur = slug(m.group(1).strip())
                blocks.setdefault(cur, [])
                continue
        if cur is not None:
            # Pula tabela 2.1 (p. 41)
            if "TABELA 2.1" in s.text:
                cur = None
                continue
            if "DaisyWheel" in s.font and s.size >= 13 and s.text.strip() in ("CARGA", "SOMENTE TREINADA", "KIT"):
                continue
            blocks[cur].append(s)

    out = []
    for name, abil, trained_only, load_pen, needs_kit, book_page in SKILLS_META:
        sid = slug(name)
        text = join_spans(blocks.get(sid, []))
        summary = first_sentence(text) if text else f"Perícia baseada em {abil.upper()}."
        out.append(make_entry(
            f"skill:{sid}",
            "skill",
            name,
            summary,
            src_core(book_page, "Perícias"),
            {
                "ability": abil,
                "trainedOnly": trained_only,
                "loadPenalty": load_pen,
                "needsKit": needs_kit,
                "text": text,
            },
        ))
    return out


# ---------------------------------------------------------------------------
# 2. Origens (Core p. 16–21 / PDF 24–29 + SaH p. 8–14 / PDF 8–14)
# ---------------------------------------------------------------------------

ORIGIN_EFFECTS: dict[str, dict] = {
    "cultista-arrependido": {"halfInitialSanity": True, "bonusParanormalPower": 1},
    "desgarrado": {"hpPerNex": 1},
    "policial": {"defenseBonus": 2},
    "universitario": {"peBonus": 1, "pePerOddNex": True, "peLimitBonus": 1},
    "vitima": {"sanPerNex": 1},
    "magnata": {"creditBump": 1},
    "teorico-da-conspiracao": {"mentalRdInt": True},
    "amnesico": {"freeSkills": 2},
}


def parse_skill_list(raw: str) -> list[str]:
    found: list[str] = []
    low = slug(raw)
    for sk_slug, sk_id in SKILL_NAME_TO_ID.items():
        if re.search(rf"(?:^|-){re.escape(sk_slug)}(?:-|$)", low):
            found.append(sk_id)
    return found


def extract_core_origins(doc: pymupdf.Document) -> list[dict]:
    spans: list[Span] = []
    for p in range(24, 30):
        spans.extend(page_spans(doc, p, 8))

    toc_origins = [
        title.strip() for lvl, title, pg in doc.get_toc()
        if lvl == 3 and 24 <= pg <= 29
    ]
    toc_set = {slug(t): t for t in toc_origins}

    entries_raw: list[dict] = []
    cur: dict | None = None
    in_table = False
    for s in spans:
        t = s.text.strip()
        if "TABELA 1.1" in t or "EXEMPLO DE CRIAÇÃO" in t:
            in_table = True
            cur = None
            continue
        if "DaisyWheel" in s.font and s.size >= 18:
            # Pode quebrar título em 2 spans?
            st = slug(t)
            if st in toc_set:
                in_table = False
                cur = {"name": toc_set[st], "page": s.page, "spans": []}
                entries_raw.append(cur)
                continue
            elif cur is not None and not cur["spans"]:
                comb = slug(cur["name"] + " " + t)
                if comb in toc_set:
                    cur["name"] = toc_set[comb]
                    continue
            else:
                # Tenta correspondência parcial (ex.: "Teórico da" + "Conspiração")
                match_start = [name for sl, name in toc_set.items() if sl.startswith(st) and len(st) >= 3]
                if match_start:
                    in_table = False
                    cur = {"name": match_start[0], "page": s.page, "spans": []}
                    entries_raw.append(cur)
                    continue
        if in_table or cur is None:
            continue
        cur["spans"].append(s)

    out = []
    seen = set()
    for item in entries_raw:
        oid = slug(item["name"])
        if oid in seen:
            continue
        seen.add(oid)
        text = join_spans(item["spans"])
        # Separa Perícias treinadas e Poder
        m_sk = re.search(r"Perícias?\s+[Tt]reinadas?\.?\s*([^\n]+)", text)
        skills_raw = m_sk.group(1) if m_sk else ""
        skills = parse_skill_list(skills_raw)
        # Poder: última linha ou trecho após Perícias treinadas
        after = text[m_sk.end():].strip() if m_sk else ""
        m_pw = re.match(r"^([^.:\n]{2,50}?)\.\s*(.+)$", after, re.S)
        power_name = m_pw.group(1).strip() if m_pw else f"Poder de {item['name']}"
        power_text = m_pw.group(2).strip() if m_pw else after
        desc = text[:m_sk.start()].strip() if m_sk else text

        data = {
            "skills": skills,
            "skillsNote": skills_raw.rstrip("."),
            "power": {"name": power_name, "summary": first_sentence(power_text, 220), "text": power_text},
            "text": text,
            **ORIGIN_EFFECTS.get(oid, {}),
        }
        out.append(make_entry(
            f"origin:{oid}",
            "origin",
            item["name"],
            f"{power_name}: {first_sentence(power_text, 160)}",
            src_core(item["page"], "Origens"),
            data,
        ))
    return out


def extract_sah_origins(doc: pymupdf.Document) -> list[dict]:
    toc_origins = [
        (title.strip(), pg) for lvl, title, pg in doc.get_toc()
        if lvl == 3 and 8 <= pg <= 14
    ]
    spans: list[Span] = []
    for p in range(8, 15):
        spans.extend(page_spans(doc, p, 1))

    # Reconstruir texto completo com marcadores de títulos usando Keyes-Regular-SC700 / Keyes-Regular
    toc_slugs = {slug(t): t for t, _ in toc_origins}
    toc_slugs["amigo-dos-animais"] = "Amigo dos Animais"
    blocks: list[dict] = []
    cur: dict | None = None
    buf_title = ""
    buf_page = 8
    for s in spans:
        t = s.text.strip()
        if "Keyes" in s.font and s.size >= 10.5 and s.color in ("231f20", "ffffff"):
            if not buf_title:
                buf_page = s.page
            # SC700 separa inicial maiúscula ('A') do resto ('migos dos Animais')
            if buf_title and not buf_title.endswith(" ") and s.text and not s.text[0].isspace() and len(buf_title.split()[-1]) == 1:
                buf_title += t
            else:
                buf_title = (buf_title + " " + t).strip()
            sl = slug(buf_title)
            if sl in toc_slugs:
                cur = {"name": toc_slugs[sl], "page": buf_page, "spans": []}
                blocks.append(cur)
                buf_title = ""
            continue
        else:
            if buf_title:
                sl = slug(buf_title)
                if sl in toc_slugs:
                    cur = {"name": toc_slugs[sl], "page": buf_page, "spans": []}
                    blocks.append(cur)
                buf_title = ""
        if cur is not None:
            cur["spans"].append(s)

    out = []
    seen = set()
    for item in blocks:
        oid = slug(item["name"])
        if oid in seen:
            continue
        seen.add(oid)
        text = join_spans(item["spans"])
        m_sk = re.search(r"Perícias?\s+[Tt]reinadas?\.?\s*([^\n]+)", text)
        skills_raw = m_sk.group(1) if m_sk else ""
        skills = parse_skill_list(skills_raw)
        after = text[m_sk.end():].strip() if m_sk else ""
        m_pw = re.match(r"^([^.:\n]{2,60}?)\.\s*(.+)$", after, re.S)
        power_name = m_pw.group(1).strip() if m_pw else f"Poder de {item['name']}"
        power_text = m_pw.group(2).strip() if m_pw else after
        out.append(make_entry(
            f"origin:{oid}",
            "origin",
            item["name"],
            f"{power_name}: {first_sentence(power_text, 160)}",
            src_sah(item["page"], "Novas Origens (Sobrevivendo ao Horror)"),
            {
                "skills": skills,
                "skillsNote": skills_raw.rstrip("."),
                "power": {"name": power_name, "summary": first_sentence(power_text, 220), "text": power_text},
                "text": text,
                "supplement": "sobrevivendo-ao-horror",
            },
        ))
    return out


# ---------------------------------------------------------------------------
# 3. Classes (Core: Combatente, Especialista, Ocultista + SaH: Sobrevivente)
# ---------------------------------------------------------------------------

def build_classes() -> list[dict]:
    return [
        make_entry(
            "class:combatente",
            "class",
            "Combatente",
            "Linha de frente contra o Outro Lado: 20+VIG PV iniciais (+4+VIG/NEX), 2+PRE PE (+2+PRE/NEX), 12 SAN (+3/NEX). Proficiente com armas simples, táticas e proteções leves.",
            src_core(24, "Combatente"),
            {
                "hp": {"initial": 20, "perLevel": 4},
                "pe": {"initial": 2, "perLevel": 2},
                "san": {"initial": 12, "perLevel": 3},
                "skills": {
                    "fixed": [],
                    "oneOf": [
                        ["skill:luta", "skill:pontaria"],
                        ["skill:fortitude", "skill:reflexos"],
                    ],
                    "choose": 1,
                    "intBonus": True,
                },
                "trainingUpgradeBase": 2,
                "proficiencies": ["armas simples", "armas táticas", "proteções leves"],
                "subclassLevel": 2,  # NEX 10%
                "asiLevels": [4, 10, 16, 19],  # NEX 20%, 50%, 80%, 95%
                "powerLevels": [3, 6, 9, 12, 15, 18],  # NEX 15, 30, 45, 60, 75, 90%
                "trainingLevels": [7, 14],  # NEX 35%, 70%
                "versatilityLevel": 10,  # NEX 50%
                "features": [
                    {"level": 1, "name": "Ataque Especial (2 PE, +5)", "summary": "Ao atacar, gaste 2 PE para receber +5 no teste de ataque ou na rolagem de dano."},
                    {"level": 2, "name": "Habilidade de Trilha (NEX 10%)", "summary": "Escolha uma trilha de Combatente e receba sua primeira habilidade."},
                    {"level": 3, "name": "Poder de Combatente", "summary": "Escolha um poder de Combatente, poder geral ou Transcender."},
                    {"level": 4, "name": "Aumento de Atributo", "summary": "Aumente um atributo à sua escolha em +1 (máximo 5)."},
                    {"level": 5, "name": "Ataque Especial (3 PE, +10)", "summary": "Você pode gastar até 3 PE no Ataque Especial para distribuir +10 entre ataque e dano."},
                    {"level": 6, "name": "Poder de Combatente", "summary": "Escolha um novo poder de Combatente, poder geral ou Transcender."},
                    {"level": 7, "name": "Grau de Treinamento", "summary": "Aumente o grau de treinamento de 2 + INT perícias treinadas para Veterano (+10)."},
                    {"level": 8, "name": "Habilidade de Trilha (NEX 40%)", "summary": "Você recebe a segunda habilidade de sua trilha."},
                    {"level": 9, "name": "Poder de Combatente", "summary": "Escolha um novo poder de Combatente, poder geral ou Transcender."},
                    {"level": 10, "name": "Aumento de Atributo & Versatilidade", "summary": "+1 em um atributo (máx. 5) e escolha um poder de classe ou a 1ª habilidade de outra trilha de Combatente. Afinidade elemental liberada."},
                    {"level": 11, "name": "Ataque Especial (4 PE, +15)", "summary": "Você pode gastar até 4 PE no Ataque Especial para distribuir +15 entre ataque e dano."},
                    {"level": 12, "name": "Poder de Combatente", "summary": "Escolha um novo poder de Combatente, poder geral ou Transcender."},
                    {"level": 13, "name": "Habilidade de Trilha (NEX 65%)", "summary": "Você recebe a terceira habilidade de sua trilha."},
                    {"level": 14, "name": "Grau de Treinamento", "summary": "Aumente o grau de treinamento de 2 + INT perícias (para Veterano +10 ou Expert +15)."},
                    {"level": 15, "name": "Poder de Combatente", "summary": "Escolha um novo poder de Combatente, poder geral ou Transcender."},
                    {"level": 16, "name": "Aumento de Atributo", "summary": "Aumente um atributo à sua escolha em +1 (máximo 5)."},
                    {"level": 17, "name": "Ataque Especial (5 PE, +20)", "summary": "Você pode gastar até 5 PE no Ataque Especial para distribuir +20 entre ataque e dano."},
                    {"level": 18, "name": "Poder de Combatente", "summary": "Escolha um novo poder de Combatente, poder geral ou Transcender."},
                    {"level": 19, "name": "Aumento de Atributo", "summary": "Aumente um atributo à sua escolha em +1 (máximo 5)."},
                    {"level": 20, "name": "Habilidade de Trilha (NEX 99%)", "summary": "Você recebe a habilidade final de sua trilha."},
                ],
            },
        ),
        make_entry(
            "class:especialista",
            "class",
            "Especialista",
            "Versátil em investigação, perícias e técnica: 16+VIG PV iniciais (+3+VIG/NEX), 3+PRE PE (+3+PRE/NEX), 16 SAN (+4/NEX). 7 + INT perícias treinadas.",
            src_core(28, "Especialista"),
            {
                "hp": {"initial": 16, "perLevel": 3},
                "pe": {"initial": 3, "perLevel": 3},
                "san": {"initial": 16, "perLevel": 4},
                "skills": {"fixed": [], "oneOf": [], "choose": 7, "intBonus": True},
                "trainingUpgradeBase": 5,
                "proficiencies": ["armas simples", "proteções leves"],
                "subclassLevel": 2,
                "asiLevels": [4, 10, 16, 19],
                "powerLevels": [3, 6, 9, 12, 15, 18],
                "trainingLevels": [7, 14],
                "versatilityLevel": 10,
                "features": [
                    {"level": 1, "name": "Eclético & Perito (2 PE, +1d6)", "summary": "Gaste 2 PE para agir como treinado em qualquer perícia; escolha 2 perícias (exceto Luta/Pontaria) para somar +1d6 gastando 2 PE."},
                    {"level": 2, "name": "Habilidade de Trilha (NEX 10%)", "summary": "Escolha uma trilha de Especialista e receba sua primeira habilidade."},
                    {"level": 3, "name": "Poder de Especialista", "summary": "Escolha um poder de Especialista, poder geral ou Transcender."},
                    {"level": 4, "name": "Aumento de Atributo", "summary": "Aumente um atributo à sua escolha em +1 (máximo 5)."},
                    {"level": 5, "name": "Perito (3 PE, +1d8)", "summary": "Você pode gastar 3 PE em Perito para somar +1d8 no teste."},
                    {"level": 6, "name": "Poder de Especialista", "summary": "Escolha um novo poder de Especialista, poder geral ou Transcender."},
                    {"level": 7, "name": "Grau de Treinamento", "summary": "Aumente o grau de treinamento de 5 + INT perícias treinadas para Veterano (+10)."},
                    {"level": 8, "name": "Engenhosidade (Veterano) & Trilha (NEX 40%)", "summary": "Ao usar Eclético, pode gastar +2 PE para agir como Veterano (+10). Recebe a 2ª habilidade da trilha."},
                    {"level": 9, "name": "Poder de Especialista", "summary": "Escolha um novo poder de Especialista, poder geral ou Transcender."},
                    {"level": 10, "name": "Aumento de Atributo & Versatilidade", "summary": "+1 em um atributo (máx. 5) e escolha um poder de classe ou a 1ª habilidade de outra trilha de Especialista. Afinidade elemental liberada."},
                    {"level": 11, "name": "Perito (4 PE, +1d10)", "summary": "Você pode gastar 4 PE em Perito para somar +1d10 no teste."},
                    {"level": 12, "name": "Poder de Especialista", "summary": "Escolha um novo poder de Especialista, poder geral ou Transcender."},
                    {"level": 13, "name": "Habilidade de Trilha (NEX 65%)", "summary": "Você recebe a terceira habilidade de sua trilha."},
                    {"level": 14, "name": "Grau de Treinamento", "summary": "Aumente o grau de treinamento de 5 + INT perícias (para Veterano +10 ou Expert +15)."},
                    {"level": 15, "name": "Engenhosidade (Expert) & Poder de Especialista", "summary": "Ao usar Eclético, pode gastar +4 PE para agir como Expert (+15). Escolha um novo poder."},
                    {"level": 16, "name": "Aumento de Atributo", "summary": "Aumente um atributo à sua escolha em +1 (máximo 5)."},
                    {"level": 17, "name": "Perito (5 PE, +1d12)", "summary": "Você pode gastar 5 PE em Perito para somar +1d12 no teste."},
                    {"level": 18, "name": "Poder de Especialista", "summary": "Escolha um novo poder de Especialista, poder geral ou Transcender."},
                    {"level": 19, "name": "Aumento de Atributo", "summary": "Aumente um atributo à sua escolha em +1 (máximo 5)."},
                    {"level": 20, "name": "Habilidade de Trilha (NEX 99%)", "summary": "Você recebe a habilidade final de sua trilha."},
                ],
            },
        ),
        make_entry(
            "class:ocultista",
            "class",
            "Ocultista",
            "Estudioso do Outro Lado e conjurador de rituais: 12+VIG PV iniciais (+2+VIG/NEX), 4+PRE PE (+4+PRE/NEX), 20 SAN (+5/NEX). Começa com 3 rituais de 1º círculo.",
            src_core(32, "Ocultista"),
            {
                "hp": {"initial": 12, "perLevel": 2},
                "pe": {"initial": 4, "perLevel": 4},
                "san": {"initial": 20, "perLevel": 5},
                "skills": {"fixed": ["skill:ocultismo", "skill:vontade"], "oneOf": [], "choose": 3, "intBonus": True},
                "trainingUpgradeBase": 3,
                "proficiencies": ["armas simples"],
                "spellcasting": {"ability": "pre", "initialRituals": 3, "ritualsPerLevel": 1, "circleLevels": {1: 1, 2: 5, 3: 11, 4: 17}},
                "subclassLevel": 2,
                "asiLevels": [4, 10, 16, 19],
                "powerLevels": [3, 6, 9, 12, 15, 18],
                "trainingLevels": [7, 14],
                "versatilityLevel": 10,
                "features": [
                    {"level": 1, "name": "Escolhido pelo Outro Lado (1º círculo)", "summary": "Você pode conjurar rituais de 1º círculo. Começa com 3 rituais de 1º círculo e aprende +1 ritual a cada novo NEX."},
                    {"level": 2, "name": "Habilidade de Trilha (NEX 10%)", "summary": "Escolha uma trilha de Ocultista e receba sua primeira habilidade."},
                    {"level": 3, "name": "Poder de Ocultista", "summary": "Escolha um poder de Ocultista, poder geral ou Transcender."},
                    {"level": 4, "name": "Aumento de Atributo", "summary": "Aumente um atributo à sua escolha em +1 (máximo 5)."},
                    {"level": 5, "name": "Escolhido pelo Outro Lado (2º círculo)", "summary": "Você passa a poder aprender e conjurar rituais de 2º círculo."},
                    {"level": 6, "name": "Poder de Ocultista", "summary": "Escolha um novo poder de Ocultista, poder geral ou Transcender."},
                    {"level": 7, "name": "Grau de Treinamento", "summary": "Aumente o grau de treinamento de 3 + INT perícias treinadas para Veterano (+10)."},
                    {"level": 8, "name": "Habilidade de Trilha (NEX 40%)", "summary": "Você recebe a segunda habilidade de sua trilha."},
                    {"level": 9, "name": "Poder de Ocultista", "summary": "Escolha um novo poder de Ocultista, poder geral ou Transcender."},
                    {"level": 10, "name": "Aumento de Atributo & Versatilidade", "summary": "+1 em um atributo (máx. 5) e escolha um poder de classe ou a 1ª habilidade de outra trilha de Ocultista. Afinidade elemental liberada."},
                    {"level": 11, "name": "Escolhido pelo Outro Lado (3º círculo)", "summary": "Você passa a poder aprender e conjurar rituais de 3º círculo."},
                    {"level": 12, "name": "Poder de Ocultista", "summary": "Escolha um novo poder de Ocultista, poder geral ou Transcender."},
                    {"level": 13, "name": "Habilidade de Trilha (NEX 65%)", "summary": "Você recebe a terceira habilidade de sua trilha."},
                    {"level": 14, "name": "Grau de Treinamento", "summary": "Aumente o grau de treinamento de 3 + INT perícias (para Veterano +10 ou Expert +15)."},
                    {"level": 15, "name": "Poder de Ocultista", "summary": "Escolha um novo poder de Ocultista, poder geral ou Transcender."},
                    {"level": 16, "name": "Aumento de Atributo", "summary": "Aumente um atributo à sua escolha em +1 (máximo 5)."},
                    {"level": 17, "name": "Escolhido pelo Outro Lado (4º círculo)", "summary": "Você passa a poder aprender e conjurar rituais de 4º círculo."},
                    {"level": 18, "name": "Poder de Ocultista", "summary": "Escolha um novo poder de Ocultista, poder geral ou Transcender."},
                    {"level": 19, "name": "Aumento de Atributo", "summary": "Aumente um atributo à sua escolha em +1 (máximo 5)."},
                    {"level": 20, "name": "Habilidade de Trilha (NEX 99%)", "summary": "Você recebe a habilidade final de sua trilha."},
                ],
            },
        ),
        make_entry(
            "class:sobrevivente",
            "class",
            "Sobrevivente (NEX 0%)",
            "Classe opcional de Sobrevivendo ao Horror para pessoas comuns (Estágios 1 a 5): 8+VIG PV (+2/estágio), 2+PRE PE (+1/estágio), 8 SAN (+2/estágio). Limite de PE sempre 1.",
            src_sah(30, "Nova Classe: O Sobrevivente"),
            {
                "isSurvivor": True,
                "maxLevel": 5,
                "hp": {"initial": 8, "perLevel": 2, "addAbilityPerLevel": False},
                "pe": {"initial": 2, "perLevel": 1, "addAbilityPerLevel": False},
                "san": {"initial": 8, "perLevel": 2},
                "skills": {"fixed": [], "oneOf": [], "choose": 1, "intBonus": True},
                "trainingUpgradeBase": 0,
                "proficiencies": ["armas simples"],
                "subclassLevel": 2,  # Estágio 2
                "asiLevels": [3],  # Estágio 3 (máx 3)
                "asiMax": 3,
                "powerLevels": [],
                "trainingLevels": [],
                "supplement": "sobrevivendo-ao-horror",
                "features": [
                    {"level": 1, "name": "Empenho", "summary": "Quando faz um teste de perícia, pode gastar 1 PE para receber +2 nesse teste."},
                    {"level": 2, "name": "Trilha de Sobrevivente (1ª habilidade)", "summary": "Escolha Durão, Esperto ou Esotérico e receba sua primeira habilidade."},
                    {"level": 3, "name": "Aumento de Atributo", "summary": "Aumente um atributo à sua escolha em +1 (máximo 3)."},
                    {"level": 4, "name": "Trilha de Sobrevivente (2ª habilidade)", "summary": "Receba a segunda habilidade de sua trilha de Sobrevivente."},
                    {"level": 5, "name": "Cicatrizado", "summary": "Escolha um elemento traumático (–1d20 contra ele); 1×/sessão, sacrifique 1 PV permanente para ignorar dano mental/gasto de PE, ou 1 PE permanente para reduzir dano físico à metade."},
                ],
            },
        ),
    ]


# ---------------------------------------------------------------------------
# 4. Trilhas (Core: 15 + SaH: 12)
# ---------------------------------------------------------------------------

def parse_trilha_features(text: str, survivor: bool = False) -> tuple[str, list[dict]]:
    if survivor:
        pat = re.compile(r"Estágio\s*(\d+)\s*[–-]\s*([^.:\n]+)\.\s*")
    else:
        pat = re.compile(r"NEX\s*(\d+)%\s*[–-]\s*([^.:\n]+)\.\s*")
    matches = list(pat.finditer(text))
    if not matches:
        return text, []
    intro = text[: matches[0].start()].strip()
    feats = []
    nex_to_lvl = {5: 1, 10: 2, 15: 3, 20: 4, 25: 5, 30: 6, 35: 7, 40: 8, 45: 9, 50: 10, 55: 11, 60: 12, 65: 13, 70: 14, 75: 15, 80: 16, 85: 17, 90: 18, 95: 19, 99: 20}
    for i, m in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[m.end() : end].strip()
        num = int(m.group(1))
        lvl = num if survivor else nex_to_lvl.get(num, max(1, round(num / 5)))
        feats.append({
            "level": lvl,
            "nex": 0 if survivor else num,
            "name": m.group(2).strip(),
            "summary": first_sentence(body, 220),
            "text": body,
        })
    return intro, feats


def extract_core_subclasses(doc: pymupdf.Document) -> list[dict]:
    trilha_spec = [
        ("class:combatente", (34, 35), ["Aniquilador", "Comandante de Campo", "Guerreiro", "Operações Especiais", "Tropa de Choque"]),
        ("class:especialista", (38, 39), ["Atirador de Elite", "Infiltrador", "Médico de Campo", "Negociador", "Técnico"]),
        ("class:ocultista", (42, 43), ["Conduíte", "Flagelador", "Graduado", "Intuitivo", "Lâmina Paranormal"]),
    ]
    out = []
    for class_id, (p1, p2), names in trilha_spec:
        # Nas páginas de trilhas, o texto nativo do PDF já segue exatamente a ordem de leitura das trilhas
        raw = "\n".join(doc[p - 1].get_text("text") for p in range(p1, p2 + 1))
        raw = re.sub(r"([+–-])OO\b", r"\g<1>2d20", raw)
        raw = re.sub(r"([+–-])O\b", r"\g<1>1d20", raw)
        raw = raw.replace("Tudo comeca pelo Sangue", "")
        raw = clean_text(raw)
        # Localiza cada trilha pelo nome em linha isolada
        positions: list[tuple[int, int, str]] = []
        for n in names:
            m = re.search(rf"(?:^|\n){re.escape(n)}\s*\n", raw)
            if m:
                positions.append((m.start(), m.end(), n))
        positions.sort()
        for idx, (_, start_body, name) in enumerate(positions):
            end_body = positions[idx + 1][0] if idx + 1 < len(positions) else len(raw)
            text = raw[start_body:end_body].strip()
            intro, feats = parse_trilha_features(text, survivor=False)
            prereq = {"type": "hasProficiency", "proficiency": "skill:medicina"} if name == "Médico de Campo" else None
            page_num = (p1 - 8) if idx < 2 else (p2 - 8)
            out.append(make_entry(
                f"subclass:{slug(name)}",
                "subclass",
                name,
                first_sentence(intro or text, 200),
                src_core(page_num, f"Trilhas ({class_id.split(':')[1].title()})"),
                {"classId": class_id, "features": feats, "text": text},
                prerequisites=prereq,
            ))
    return out


def extract_sah_subclasses(doc: pymupdf.Document) -> list[dict]:
    spec = [
        ("class:combatente", (16, 22), False, ["Agente Secreto", "Caçador", "Monstruoso"]),
        ("class:especialista", (24, 26), False, ["Bibliotecário", "Perseverante", "Muambeiro"]),
        ("class:ocultista", (28, 30), False, ["Exorcista", "Possuído", "Parapsicólogo"]),
        ("class:sobrevivente", (32, 33), True, ["Durão", "Esperto", "Esotérico"]),
    ]
    out = []
    for class_id, (p1, p2), is_surv, names in spec:
        spans: list[Span] = []
        for p in range(p1, p2 + 1):
            spans.extend(page_spans(doc, p, 1))
        name_map = {slug(n): n for n in names}
        cur: dict | None = None
        blocks: list[dict] = []
        for s in spans:
            if "Keyes" in s.font and s.size >= 14:
                sl = slug(s.text.strip())
                if sl in name_map:
                    cur = {"name": name_map[sl], "page": s.page, "spans": []}
                    blocks.append(cur)
                    continue
            if cur is not None:
                if "TREINAMENTO ESPECIAL" in s.text.upper() or "QUANDO JOGAR DE SOBREVIVENTE" in s.text.upper():
                    cur = None
                    continue
                cur["spans"].append(s)
        for b in blocks:
            text = join_spans(b["spans"])
            intro, feats = parse_trilha_features(text, survivor=is_surv)
            out.append(make_entry(
                f"subclass:{slug(b['name'])}",
                "subclass",
                b["name"],
                first_sentence(intro or text, 200),
                src_sah(b["page"], "Novas Trilhas (Sobrevivendo ao Horror)"),
                {"classId": class_id, "features": feats, "text": text, "supplement": "sobrevivendo-ao-horror"},
            ))
    return out


# ---------------------------------------------------------------------------
# 5. Poderes (Classe Core + SaH, Poderes Gerais SaH, Poderes Paranormais Core + SaH)
# ---------------------------------------------------------------------------

NEX_TO_LEVEL = {5: 1, 10: 2, 15: 3, 20: 4, 25: 5, 30: 6, 35: 7, 40: 8, 45: 9, 50: 10, 55: 11, 60: 12, 65: 13, 70: 14, 75: 15, 80: 16, 85: 17, 90: 18, 95: 19, 99: 20}
ABIL_MAP = {"agi": "agi", "agilidade": "agi", "for": "for", "forca": "for", "int": "int", "intelecto": "int", "pre": "pre", "presenca": "pre", "vig": "vig", "vigor": "vig"}


def parse_op_prereqs(prereq_text: str, extra_class: str | None = None, known_power_ids: set[str] | None = None) -> tuple[dict | None, dict | None]:
    """Converte pré-requisitos de Ordem Paranormal para a DSL + requisito elemental."""
    reqs: list[dict] = []
    elem_req: dict | None = None
    if extra_class:
        reqs.append({"type": "hasClass", "classId": extra_class})

    if prereq_text:
        pt = prereq_text.strip().rstrip(".")
        # Quebra por vírgula ou " e "
        parts = [p.strip() for p in re.split(r",\s*|\s+e\s+", pt) if p.strip()]
        for part in parts:
            pl = slug(part)
            # Elemento N (ex: "Morte 2", "Conhecimento 1")
            m_el = re.match(r"^(conhecimento|energia|morte|sangue)-(\d+)$", pl)
            if m_el:
                elem_req = {"element": m_el.group(1), "count": int(m_el.group(2))}
                continue
            # NEX XX%
            m_nex = re.search(r"nex\s*(\d+)%", part, re.I)
            if m_nex:
                nex = int(m_nex.group(1))
                lvl = NEX_TO_LEVEL.get(nex, max(1, round(nex / 5)))
                reqs.append({"type": "minLevel", "level": lvl})
                continue
            # Atributo (ex: "For 2", "Agi 3", "Int 2", "Vig 2")
            m_ab = re.match(r"^(agi|agilidade|for|forca|int|intelecto|pre|presenca|vig|vigor)-(\d+)$", pl)
            if m_ab:
                reqs.append({"type": "minAbility", "ability": ABIL_MAP[m_ab.group(1)], "value": int(m_ab.group(2))})
                continue
            # Treinado em X ou Y
            m_tr = re.match(r"^treinado\s+em\s+(.+)$", part, re.I)
            if m_tr:
                body = m_tr.group(1)
                if " ou " in body.lower():
                    opts = [parse_skill_list(x) for x in re.split(r"\s+ou\s+", body, flags=re.I)]
                    ids = [o[0] for o in opts if o]
                    if len(ids) > 1:
                        reqs.append({"type": "anyOf", "of": [{"type": "hasProficiency", "proficiency": i} for i in ids]})
                        continue
                sks = parse_skill_list(body)
                if sks:
                    for sk in sks:
                        reqs.append({"type": "hasProficiency", "proficiency": sk})
                    continue
            # Outro poder pelo nome (ex.: "Proteção Pesada", "Especialista em Elemento")
            if known_power_ids:
                cand = f"power:{slug(part)}"
                if cand in known_power_ids:
                    reqs.append({"type": "hasContent", "contentId": cand})
                    continue
                if "especialista em elemento" in part.lower() and "power:especialista-em-elemento" in known_power_ids:
                    reqs.append({"type": "hasContent", "contentId": "power:especialista-em-elemento"})
                    continue
            # Caso restante: aviso/julgamento do mestre se não for óbvio
            if "pericia escolhida" not in pl and "elemento escolhido" not in pl:
                reqs.append({"type": "gmJudgement", "description": part})

    if not reqs:
        return None, elem_req
    return (reqs[0] if len(reqs) == 1 else {"type": "allOf", "of": reqs}), elem_req


def extract_bullet_powers(doc: pymupdf.Document, pages: range, page_offset: int, stop_words: tuple[str, ...]) -> list[dict]:
    """Extrai listas de poderes de classe marcados por WarnockPro-SemiboldIt em vermelho/dourado."""
    spans: list[Span] = []
    for p in pages:
        spans.extend(page_spans(doc, p, page_offset))
    items: list[dict] = []
    cur: dict | None = None
    in_list = False
    for s in spans:
        t = s.text.strip()
        if any(sw in t for sw in stop_words):
            in_list = False
            cur = None
            continue
        is_title = "SemiboldIt" in s.font and s.color in ("b9272d", "ba272d", "bba268") and len(t) >= 3
        if is_title:
            # Pode ser título novo ou continuação do título imediatamente anterior (quebrado em linha)
            if cur is not None and not cur["spans"] and not cur["name"].endswith("."):
                cur["name"] += " " + t
                continue
            in_list = True
            cur = {"name": t, "page": s.page, "spans": []}
            items.append(cur)
            continue
        if in_list and cur is not None:
            # Ignora caixas de características (cor branca ou Keyes)
            if s.color == "ffffff" and page_offset == 8:
                continue
            if "Keyes" in s.font and s.size >= 11:
                continue
            if "DaisyWheel" in s.font and s.size >= 13:
                in_list = False
                cur = None
                continue
            if "OptimaLTPro" in s.font and s.color == "bba268":
                continue
            if re.match(r"^(5|10|15|20|25|30|35|40|45|50|55|60|65|70|75|80|85|90|95|99)%$", t):
                continue
            if t in ("Ataque especial (2 PE, +5)", "Habilidade de trilha", "Poder de combatente", "Aumento de atributo",
                     "Grau de treinamento", "Poder de especialista", "Poder de ocultista", "Eclético, perito (2 PE, +1d6)"):
                continue
            cur["spans"].append(s)

    cleaned = []
    for it in items:
        name = re.sub(r"\s+", " ", it["name"]).strip().rstrip(".")
        if name.lower().startswith(("pré-requisito", "afinidade", "especial", "habilidade")):
            continue
        text = join_spans(it["spans"])
        # Remove texto de Aumento de Atributo / Grau de Treinamento caso tenha vazado no último item
        text = re.split(r"\n?Aumento de Atributo\.", text)[0].strip()
        text = re.split(r"\n?Grau de Treinamento\.", text)[0].strip()
        m_pre = re.search(r"Pré-*\s*requisitos?:\s*([^.\n]+)\.?", text, re.I)
        prereq_text = ""
        if m_pre:
            prereq_text = m_pre.group(1).strip().rstrip(".")
            # Mantém o texto principal sem duplicar o sufixo se estiver no final
            body = (text[: m_pre.start()] + text[m_pre.end() :]).strip()
        else:
            body = text
        cleaned.append({"name": name, "page": it["page"], "text": body, "prereqText": prereq_text})
    return cleaned


def extract_core_paranormal_powers(doc: pymupdf.Document) -> list[dict]:
    spans: list[Span] = []
    for p in range(122, 125):
        spans.extend(page_spans(doc, p, 8))
    cur_elem = "variavel"
    cur: dict | None = None
    items: list[dict] = []
    started = False
    for s in spans:
        t = s.text.strip()
        if "LISTA DE PODERES" in t:
            started = True
            continue
        if not started:
            continue
        if "RESPONDENDO AO OUTRO LADO" in t or t in ("RA", "N", "ORMAL"):
            cur = None
            continue
        if "OptimaLTPro-Bold" in s.font and s.size >= 13 and "PODERES DE" in t.upper():
            for el in ("conhecimento", "energia", "morte", "sangue"):
                if el in t.lower():
                    cur_elem = el
            cur = None
            continue
        if "DaisyWheel" in s.font and s.size >= 18:
            if cur is not None and not cur["spans"]:
                cur["name"] += " " + t
                continue
            cur = {"name": t, "element": cur_elem, "page": s.page, "spans": []}
            items.append(cur)
            continue
        if cur is not None:
            cur["spans"].append(s)

    # Fix página 124 (Sangue de Ferro teve o começo na coluna direita e continuação na esquerda!)
    # Na página 124, o primeiro bloco antes de "Sangue Fervente" é continuação de "Sangue de Ferro".
    out = []
    for it in items:
        text = join_spans(it["spans"])
        # Caso especial de Sangue de Ferro na p. 116 (PDF p. 124) devido à quebra de coluna do PDF
        if slug(it["name"]) == "sangue-de-ferro" and "Você recebe +2" in text and "pontos de vida por NEX" not in text:
            p124 = doc[123].get_text("text")
            m_cont = re.search(r"tos de vida por NEX\..*?doenças\.", p124, re.S)
            if m_cont:
                text = text.rstrip("pon-") + "pontos de vida por NEX." + clean_text(m_cont.group(0)[len("tos de vida por NEX."):])
        m_af = re.search(r"Afinidade:\s*(.+)$", text, re.S)
        affinity = m_af.group(1).strip() if m_af else ""
        body = text[: m_af.start()].strip() if m_af else text
        m_pre = re.search(r"Pré-*\s*requisitos?:\s*([^.\n]+)\.?", body, re.I)
        prereq_text = m_pre.group(1).strip().rstrip(".") if m_pre else ""
        if m_pre:
            body = (body[: m_pre.start()] + body[m_pre.end() :]).strip()
        out.append({
            "name": re.sub(r"\s+", " ", it["name"]).strip(),
            "element": it["element"],
            "page": it["page"],
            "text": body,
            "affinity": affinity,
            "prereqText": prereq_text,
        })
    return out


def extract_sah_general_and_paranormal(doc: pymupdf.Document) -> tuple[list[dict], list[dict]]:
    # Poderes Gerais: PDF p. 34-37 (TOC level 3)
    toc_gen = [title.strip() for lvl, title, pg in doc.get_toc() if lvl == 3 and 34 <= pg <= 37]
    toc_gen_map = {slug(t): t for t in toc_gen}
    spans_g: list[Span] = []
    for p in range(34, 38):
        spans_g.extend(page_spans(doc, p, 1))
    gen_blocks: list[dict] = []
    cur: dict | None = None
    buf_title = ""
    buf_page = 33
    for s in spans_g:
        t = s.text.strip()
        if "Keyes" in s.font and s.size >= 10.5 and s.color == "231f20":
            if not buf_title:
                buf_page = s.page
            if buf_title and not buf_title.endswith(" ") and len(buf_title.split()[-1]) == 1:
                buf_title += t
            else:
                buf_title = (buf_title + " " + t).strip()
            sl = slug(buf_title)
            if sl in toc_gen_map:
                cur = {"name": toc_gen_map[sl], "page": buf_page, "spans": []}
                gen_blocks.append(cur)
                buf_title = ""
            continue
        else:
            if buf_title:
                sl = slug(buf_title)
                if sl in toc_gen_map:
                    cur = {"name": toc_gen_map[sl], "page": buf_page, "spans": []}
                    gen_blocks.append(cur)
                buf_title = ""
        if cur is not None:
            cur["spans"].append(s)

    general = []
    seen = set()
    for b in gen_blocks:
        sl = slug(b["name"])
        if sl in seen:
            continue
        seen.add(sl)
        text = join_spans(b["spans"])
        m_pre = re.search(r"Pré-*\s*requisitos?:\s*([^.\n]+)\.?", text, re.I)
        prereq_text = m_pre.group(1).strip().rstrip(".") if m_pre else ""
        body = (text[: m_pre.start()] + text[m_pre.end() :]).strip() if m_pre else text
        general.append({"name": b["name"], "page": b["page"], "text": body, "prereqText": prereq_text})

    # Poderes Paranormais SaH: PDF p. 47-48
    spans_p: list[Span] = []
    for p in range(47, 49):
        spans_p.extend(page_spans(doc, p, 1))
    cur_elem = "sangue"
    p_blocks: list[dict] = []
    cur = None
    buf_title = ""
    buf_page = 46
    for s in spans_p:
        t = s.text.strip()
        if "OptimaLTPro-Bold" in s.font and s.size >= 13 and "PODERES DE" in t.upper():
            for el in ("conhecimento", "energia", "morte", "sangue"):
                if el in t.lower():
                    cur_elem = el
            cur = None
            buf_title = ""
            continue
        if "Keyes" in s.font and s.size >= 10.5 and s.color == "231f20":
            if not buf_title:
                buf_page = s.page
            if buf_title and not buf_title.endswith(" ") and len(buf_title.split()[-1]) == 1:
                buf_title += t
            else:
                buf_title = (buf_title + " " + t).strip()
            continue
        else:
            if buf_title and len(buf_title) >= 4:
                cur = {"name": buf_title.strip(), "element": cur_elem, "page": buf_page, "spans": []}
                p_blocks.append(cur)
                buf_title = ""
        if cur is not None:
            cur["spans"].append(s)

    para = []
    for b in p_blocks:
        text = join_spans(b["spans"])
        m_af = re.search(r"Afinidade:\s*(.+)$", text, re.S)
        affinity = m_af.group(1).strip() if m_af else ""
        body = text[: m_af.start()].strip() if m_af else text
        m_pre = re.search(r"Pré-*\s*requisitos?:\s*([^.\n]+)\.?", body, re.I)
        prereq_text = m_pre.group(1).strip().rstrip(".") if m_pre else ""
        if m_pre:
            body = (body[: m_pre.start()] + body[m_pre.end() :]).strip()
        para.append({
            "name": b["name"],
            "element": b["element"],
            "page": b["page"],
            "text": body,
            "affinity": affinity,
            "prereqText": prereq_text,
        })

    return general, para


def extract_all_powers(doc_core: pymupdf.Document, doc_sah: pymupdf.Document | None) -> list[dict]:
    # Primeiro coletamos os nomes de todos os poderes para resolver referências cruzadas de pré-requisitos
    core_class_specs = [
        ("class:combatente", range(33, 35), ("TRILHAS DE", "Aumento de Atributo", "Grau de Treinamento")),
        ("class:especialista", range(37, 39), ("TRILHAS DE", "Aumento de Atributo", "Grau de Treinamento")),
        ("class:ocultista", range(41, 43), ("TRILHAS", "Aumento de Atributo", "Grau de Treinamento")),
    ]
    sah_class_specs = [
        ("class:combatente", range(15, 17), ("NOVAS TRILHAS", "AGENTE SECRETO")),
        ("class:especialista", range(23, 25), ("NOVAS TRILHAS", "BIBLIOTECÁRIO")),
        ("class:ocultista", range(27, 29), ("NOVAS TRILHAS", "EXORCISTA")),
    ]

    # Poderes promovidos a Gerais no SaH (p. 33): Artista Marcial, Combater com Duas Armas, Saque Rápido, Tiro Certeiro
    promoted_general = {"artista-marcial", "combater-com-duas-armas", "saque-rapido", "tiro-certeiro"}
    # Poderes compartilhados por todas as classes no core (Transcender, Treinamento em Perícia)
    shared_core = {"transcender", "treinamento-em-pericia"}

    raw_class: list[tuple[str, dict, bool]] = []
    for cid, pages, stops in core_class_specs:
        for p in extract_bullet_powers(doc_core, pages, 8, stops):
            raw_class.append((cid, p, False))
    if doc_sah is not None:
        for cid, pages, stops in sah_class_specs:
            for p in extract_bullet_powers(doc_sah, pages, 1, stops):
                raw_class.append((cid, p, True))

    raw_para_core = extract_core_paranormal_powers(doc_core)
    raw_gen_sah, raw_para_sah = extract_sah_general_and_paranormal(doc_sah) if doc_sah else ([], [])

    known_ids: set[str] = set()
    for _, p, _ in raw_class:
        known_ids.add(f"power:{slug(p['name'])}")
    for p in raw_gen_sah:
        known_ids.add(f"power:{slug(p['name'])}")
    for p in raw_para_core + raw_para_sah:
        known_ids.add(f"power:{slug(p['name'])}")

    out: list[dict] = []
    seen: set[str] = set()

    # Classe (deduplicando poderes compartilhados como Artista Marcial / Transcender / Treinamento em Perícia)
    for cid, p, is_sah in raw_class:
        sl = slug(p["name"])
        if sl in seen:
            continue
        seen.add(sl)
        is_shared = sl in shared_core or (doc_sah is not None and sl in promoted_general)
        group = "geral" if is_shared else "classe"
        extra_cls = None if is_shared else cid
        prereq, elem_req = parse_op_prereqs(p["prereqText"], extra_class=extra_cls, known_power_ids=known_ids)
        src = src_sah(p["page"], "Novos Poderes de Classe") if is_sah else src_core(p["page"], f"Poderes de {cid.split(':')[1].title()}")
        data = {
            "group": group,
            "text": p["text"],
            **({"classId": cid} if not is_shared else {}),
            **({"prereqText": p["prereqText"]} if p["prereqText"] else {}),
            **({"elementPrereq": elem_req} if elem_req else {}),
            **({"supplement": "sobrevivendo-ao-horror"} if is_sah else {}),
        }
        out.append(make_entry(f"power:{sl}", "power", p["name"], first_sentence(p["text"], 200), src, data, prerequisites=prereq))

    # Poderes Gerais (SaH)
    for p in raw_gen_sah:
        sl = slug(p["name"])
        if sl in seen:
            continue
        seen.add(sl)
        prereq, _ = parse_op_prereqs(p["prereqText"], known_power_ids=known_ids)
        out.append(make_entry(
            f"power:{sl}",
            "power",
            p["name"],
            first_sentence(p["text"], 200),
            src_sah(p["page"], "Poderes Gerais"),
            {
                "group": "geral",
                "text": p["text"],
                **({"prereqText": p["prereqText"]} if p["prereqText"] else {}),
                "supplement": "sobrevivendo-ao-horror",
            },
            prerequisites=prereq,
        ))

    # Poderes Paranormais (Core + SaH)
    for is_sah, plist in [(False, raw_para_core), (True, raw_para_sah)]:
        for p in plist:
            name = p["name"].replace("<Elemento>", "(Elemento)")
            sl = slug(name)
            if sl in seen:
                continue
            seen.add(sl)
            prereq, elem_req = parse_op_prereqs(p["prereqText"], known_power_ids=known_ids)
            full_text = p["text"] + (f"\n\nAfinidade: {p['affinity']}" if p["affinity"] else "")
            src = src_sah(p["page"], "Novos Poderes Paranormais") if is_sah else src_core(p["page"], "Poderes Paranormais")
            out.append(make_entry(
                f"power:{sl}",
                "power",
                name,
                first_sentence(p["text"], 200),
                src,
                {
                    "group": "paranormal",
                    "element": p["element"],
                    "affinity": p["affinity"],
                    "text": full_text,
                    **({"prereqText": p["prereqText"]} if p["prereqText"] else {}),
                    **({"elementPrereq": elem_req} if elem_req else {}),
                    **({"supplement": "sobrevivendo-ao-horror"} if is_sah else {}),
                },
                prerequisites=prereq,
            ))

    return out


# ---------------------------------------------------------------------------
# 6. Rituais (Core p. 124–143 / PDF 132–151 + SaH p. 48–56 / PDF 49–57)
# ---------------------------------------------------------------------------

RITUAL_COST = {1: 1, 2: 3, 3: 6, 4: 10}


def parse_ritual_spans(spans: list[Span]) -> dict:
    """Separa cabeçalho (OptimaLTPro 9pt) do corpo descritivo (WarnockPro 10pt) sem misturar texto."""
    header_spans: list[Span] = []
    body_spans: list[Span] = []
    in_body = False
    for s in spans:
        if not in_body and ("WarnockPro" in s.font or s.size >= 9.8):
            in_body = True
        if in_body:
            body_spans.append(s)
        else:
            header_spans.append(s)

    header_raw = re.sub(r"\s+", " ", "".join(s.text.replace("\n", " ") for s in header_spans)).strip()
    header_norm = re.sub(
        r"\s*(Execução|Alcance|Alvos?|Área|Efeito|Duração|Resistência):?\s*",
        r"\n\1: ",
        header_raw,
        flags=re.I,
    ).strip()

    fields: dict[str, str] = {}
    field_re = re.compile(r"^(Execução|Alcance|Alvos?|Área|Efeito|Duração|Resistência):\s*(.+)$", re.I)
    for ln in header_norm.splitlines():
        m = field_re.match(ln.strip())
        if not m:
            continue
        key = slug(m.group(1))
        if key in ("alvo", "alvos"):
            key = "target"
        elif key == "execucao":
            key = "execution"
        elif key == "alcance":
            key = "range"
        elif key == "area":
            key = "area"
        elif key == "efeito":
            key = "effect"
        elif key == "duracao":
            key = "duration"
        elif key == "resistencia":
            key = "resistance"
        fields[key] = m.group(2).strip().rstrip(";.")

    rest = join_spans(body_spans)
    # Fallback se o corpo estiver vazio (ex.: texto veio misturado no header)
    if not rest and not fields:
        rest = join_spans(spans)

    m_disc = re.search(r"Discente\s*\(([^)]+)\):\s*(.+?)(?=(?:\n?\s*Verdadeiro\s*\(|$))", rest, re.S)
    m_verd = re.search(r"Verdadeiro\s*\(([^)]+)\):\s*(.+)$", rest, re.S)
    cut = len(rest)
    if m_disc:
        cut = min(cut, m_disc.start())
    if m_verd:
        cut = min(cut, m_verd.start())
    desc = rest[:cut].strip()
    out = {**fields, "text": desc}
    if m_disc:
        out["discente"] = {"cost": m_disc.group(1).strip(), "text": m_disc.group(2).strip()}
    if m_verd:
        out["verdadeiro"] = {"cost": m_verd.group(1).strip(), "text": m_verd.group(2).strip()}
    return out


def extract_core_rituals(doc: pymupdf.Document) -> list[dict]:
    spans: list[Span] = []
    for p in range(132, 152):
        spans.extend(page_spans(doc, p, 8))
    blocks: list[dict] = []
    cur: dict | None = None
    for s in spans:
        t = s.text.strip()
        if "DaisyWheel" in s.font and s.size >= 18:
            if cur is not None and not cur["spans"] and not cur["tag"]:
                cur["name"] += " " + t
                continue
            cur = {"name": t, "page": s.page, "tag": "", "spans": []}
            blocks.append(cur)
            continue
        if cur is None:
            continue
        if "OptimaLTPro" in s.font and s.color == "ffffff" and s.size <= 10.5 and re.search(r"(CONHECIMENTO|ENERGIA|MORTE|SANGUE|MEDO)\s*[1-4]", t):
            cur["tag"] = (cur["tag"] + " " + t).strip()
            continue
        cur["spans"].append(s)

    out = []
    seen = set()
    for b in blocks:
        name = re.sub(r"\s+", " ", b["name"]).strip()
        sl = slug(name)
        if not b["tag"] or sl in seen:
            continue
        seen.add(sl)
        tags = re.findall(r"(CONHECIMENTO|ENERGIA|MORTE|SANGUE|MEDO)\s*([1-4])", b["tag"])
        if not tags:
            continue
        circle = int(tags[0][1])
        elements = [el.lower() for el, _ in tags]
        element = elements[0] if len(elements) == 1 else "variavel"
        parsed = parse_ritual_spans(b["spans"])
        full_text = parsed["text"]
        if "discente" in parsed:
            full_text += f"\n\nDiscente ({parsed['discente']['cost']}): {parsed['discente']['text']}"
        if "verdadeiro" in parsed:
            full_text += f"\n\nVerdadeiro ({parsed['verdadeiro']['cost']}): {parsed['verdadeiro']['text']}"
        out.append(make_entry(
            f"spell:{sl}",
            "spell",
            name,
            first_sentence(parsed["text"], 200),
            src_core(b["page"], "Rituais"),
            {
                "circle": circle,
                "cost": RITUAL_COST[circle],
                "element": element,
                "elements": elements,
                **{k: v for k, v in parsed.items() if k != "text"},
                "text": full_text,
            },
        ))
    return out


def extract_sah_rituals(doc: pymupdf.Document, existing_ids: set[str]) -> list[dict]:
    spans: list[Span] = []
    for p in range(49, 58):
        spans.extend(page_spans(doc, p, 1))
    blocks: list[dict] = []
    cur: dict | None = None
    for s in spans:
        t = s.text.strip()
        if "Keyes" in s.font and s.size >= 14 and s.color == "231f20":
            if "NOVOS RITUAIS" in t.upper():
                continue
            if cur is not None and not cur["spans"] and not cur["tag"]:
                cur["name"] += " " + t
                continue
            cur = {"name": t.title(), "page": s.page, "tag": "", "spans": []}
            blocks.append(cur)
            continue
        if cur is None:
            continue
        if "OptimaLTPro" in s.font and s.color == "ffffff" and s.size <= 10.5 and re.search(r"(CONHECIMENTO|ENERGIA|MORTE|SANGUE|MEDO)\s*[1-4]", t):
            cur["tag"] = (cur["tag"] + " " + t).strip()
            continue
        if "OptimaLTPro-Bold" in s.font and s.size >= 13 and "RITUAIS DE" in t.upper():
            cur = None
            continue
        cur["spans"].append(s)

    out = []
    for b in blocks:
        name = re.sub(r"\s+", " ", b["name"]).strip()
        # Corrige capitalização de preposições
        for prep in (" De ", " Da ", " Do ", " Das ", " Dos ", " Em ", " Na ", " No ", " E ", " A ", " O ", " Para ", " Com "):
            name = name.replace(prep, prep.lower())
        sl = slug(name)
        eid = f"spell:{sl}"
        if not b["tag"] or eid in existing_ids:
            continue
        existing_ids.add(eid)
        tags = re.findall(r"(CONHECIMENTO|ENERGIA|MORTE|SANGUE|MEDO)\s*([1-4])", b["tag"])
        if not tags:
            continue
        circle = int(tags[0][1])
        elements = [el.lower() for el, _ in tags]
        element = elements[0] if len(elements) == 1 else "variavel"
        parsed = parse_ritual_spans(b["spans"])
        full_text = parsed["text"]
        if "discente" in parsed:
            full_text += f"\n\nDiscente ({parsed['discente']['cost']}): {parsed['discente']['text']}"
        if "verdadeiro" in parsed:
            full_text += f"\n\nVerdadeiro ({parsed['verdadeiro']['cost']}): {parsed['verdadeiro']['text']}"
        out.append(make_entry(
            eid,
            "spell",
            name,
            first_sentence(parsed["text"], 200),
            src_sah(b["page"], "Novos Rituais (Sobrevivendo ao Horror)"),
            {
                "circle": circle,
                "cost": RITUAL_COST[circle],
                "element": element,
                "elements": elements,
                "supplement": "sobrevivendo-ao-horror",
                **{k: v for k, v in parsed.items() if k != "text"},
                "text": full_text,
            },
        ))
    return out


# ---------------------------------------------------------------------------
# 7. Equipamentos, Modificações, Proteções, Maldições e Itens Amaldiçoados
# ---------------------------------------------------------------------------

ROMAN_CAT = {"0": 0, "I": 1, "II": 2, "III": 3, "IV": 4}
DMG_TYPE = {"C": "Corte", "I": "Impacto", "P": "Perfuração", "B": "Balístico", "Fogo": "Fogo"}


def build_core_equipment(doc: pymupdf.Document) -> list[dict]:
    out: list[dict] = []

    # --- Armas (Tabela 3.3, p. 56–57) ---
    # (name, cat, dmg, crit, rng, dmgType, spaces, prof, weaponType, grip, agile, automatic, ammo, summary)
    weapons = [
        # Simples - Corpo a Corpo - Leves
        ("Faca", 0, "1d4", "19", "Curto", "C", 1, "simples", "corpo-a-corpo", "leve", True, False, None, "Lâmina longa e afiada. Arma ágil e pode ser arremessada."),
        ("Martelo", 0, "1d6", "x2", None, "I", 1, "simples", "corpo-a-corpo", "leve", False, False, None, "Ferramenta comum usada como arma."),
        ("Punhal", 0, "1d4", "x3", None, "P", 1, "simples", "corpo-a-corpo", "leve", True, False, None, "Faca pontiaguda usada em rituais. Arma ágil."),
        # Simples - Corpo a Corpo - Uma Mão
        ("Bastão", 0, "1d6/1d8", "x2", None, "I", 1, "simples", "corpo-a-corpo", "uma-mao", False, False, None, "Cilindro de madeira ou metal. 1d6 com uma mão ou 1d8 com duas."),
        ("Machete", 0, "1d6", "19", None, "C", 1, "simples", "corpo-a-corpo", "uma-mao", False, False, None, "Lâmina longa usada para abrir trilhas."),
        ("Lança", 0, "1d6", "x2", "Curto", "P", 1, "simples", "corpo-a-corpo", "uma-mao", False, False, None, "Haste com ponta metálica afiada. Pode ser arremessada."),
        # Simples - Corpo a Corpo - Duas Mãos
        ("Cajado", 0, "1d6/1d6", "x2", None, "I", 2, "simples", "corpo-a-corpo", "duas-maos", True, False, None, "Arma ágil; funciona com Combater com Duas Armas como uma mão + leve."),
        # Simples - Disparo - Duas Mãos
        ("Arco", 0, "1d6", "x3", "Médio", "P", 2, "simples", "disparo", "duas-maos", False, False, "flechas", "Arco e flecha comum, usa Flechas."),
        ("Besta", 0, "1d8", "19", "Médio", "P", 2, "simples", "disparo", "duas-maos", False, False, "flechas", "Exige ação de movimento para recarregar a cada disparo. Usa Flechas."),
        # Simples - Fogo - Leves
        ("Pistola", 1, "1d12", "18", "Curto", "B", 1, "simples", "fogo", "leve", False, False, "balas-curtas", "Arma de fogo curta e confiável. Usa Balas curtas."),
        ("Revólver", 1, "2d6", "19/x3", "Curto", "B", 1, "simples", "fogo", "leve", False, False, "balas-curtas", "Arma de fogo comum e confiável. Usa Balas curtas."),
        # Simples - Fogo - Duas Mãos
        ("Fuzil de caça", 1, "2d8", "19/x3", "Médio", "B", 2, "simples", "fogo", "duas-maos", False, False, "balas-longas", "Arma longa popular entre caçadores. Usa Balas longas."),
        # Táticas - Corpo a Corpo - Leves
        ("Machadinha", 0, "1d6", "x3", "Curto", "C", 1, "taticas", "corpo-a-corpo", "leve", False, False, None, "Ferramenta leve de corte; pode ser arremessada."),
        ("Nunchaku", 0, "1d8", "x2", None, "I", 1, "taticas", "corpo-a-corpo", "leve", True, False, None, "Dois bastões ligados por corrente. Arma ágil."),
        # Táticas - Corpo a Corpo - Uma Mão
        ("Corrente", 0, "1d8", "x2", None, "I", 1, "taticas", "corpo-a-corpo", "uma-mao", False, False, None, "Fornece +2 em testes para desarmar e derrubar."),
        ("Espada", 1, "1d8/1d10", "19", None, "C", 1, "taticas", "corpo-a-corpo", "uma-mao", False, False, None, "1d8 com uma mão ou 1d10 com as duas mãos."),
        ("Florete", 1, "1d6", "18", None, "C", 1, "taticas", "corpo-a-corpo", "uma-mao", True, False, None, "Espada de lâmina fina e comprida. Arma ágil."),
        ("Machado", 1, "1d8", "x3", None, "C", 1, "taticas", "corpo-a-corpo", "uma-mao", False, False, None, "Machado pesado de corte."),
        ("Maça", 1, "2d4", "x2", None, "I", 1, "taticas", "corpo-a-corpo", "uma-mao", False, False, None, "Bastão com cabeça metálica pesada."),
        # Táticas - Corpo a Corpo - Duas Mãos
        ("Acha", 1, "1d12", "x3", None, "C", 2, "taticas", "corpo-a-corpo", "duas-maos", False, False, None, "Machado grande e pesado de duas mãos."),
        ("Gadanho", 1, "2d4", "x4", None, "C", 2, "taticas", "corpo-a-corpo", "duas-maos", False, False, None, "Foice grande de duas mãos com crítico devastador."),
        ("Katana", 1, "1d10", "19", None, "C", 2, "taticas", "corpo-a-corpo", "duas-maos", True, False, None, "Arma ágil. Se for Veterano em Luta, pode usá-la com uma mão."),
        ("Marreta", 1, "3d4", "x2", None, "I", 2, "taticas", "corpo-a-corpo", "duas-maos", False, False, None, "Ferramenta de demolição de impacto pesado."),
        ("Montante", 1, "2d6", "19", None, "C", 2, "taticas", "corpo-a-corpo", "duas-maos", False, False, None, "Espada longa de 1,5m de duas mãos."),
        ("Motosserra", 1, "3d6", "x2", None, "C", 2, "taticas", "corpo-a-corpo", "duas-maos", False, False, None, "Cada 6 no dado de dano gera +1d6 extra. Impõe –1d20 no ataque; ligar gasta ação de movimento."),
        # Táticas - Disparo - Duas Mãos
        ("Arco composto", 1, "1d10", "x3", "Médio", "P", 2, "taticas", "disparo", "duas-maos", False, False, "flechas", "Soma sua Força nas rolagens de dano. Usa Flechas."),
        ("Balestra", 1, "1d12", "19", "Médio", "P", 2, "taticas", "disparo", "duas-maos", False, False, "flechas", "Besta pesada; recarregar exige ação de movimento. Usa Flechas."),
        # Táticas - Fogo
        ("Submetralhadora", 1, "2d6", "19/x3", "Curto", "B", 1, "taticas", "fogo", "uma-mao", False, True, "balas-curtas", "Arma automática de uma mão. Usa Balas curtas."),
        ("Espingarda", 1, "4d6", "x3", "Curto", "B", 2, "taticas", "fogo", "duas-maos", False, False, "cartuchos", "Causa metade do dano em alcance médio ou maior. Usa Cartuchos."),
        ("Fuzil de assalto", 2, "2d10", "19/x3", "Médio", "B", 2, "taticas", "fogo", "duas-maos", False, True, "balas-longas", "Arma automática padrão militar. Usa Balas longas."),
        ("Fuzil de precisão", 3, "2d10", "19/x3", "Longo", "B", 2, "taticas", "fogo", "duas-maos", False, False, "balas-longas", "Veterano em Pontaria que mirar recebe +5 na margem de ameaça. Usa Balas longas."),
        # Pesadas
        ("Bazuca", 3, "10d8", "x2", "Médio", "I", 2, "pesadas", "fogo", "duas-maos", False, False, "foguete", "Explosão em raio de 3m (Reflexos DT Agi reduz à metade em alvos secundários). Recarrega com ação de movimento."),
        ("Lança-chamas", 3, "6d6", "x2", "Curto", "Fogo", 2, "pesadas", "fogo", "duas-maos", False, False, "combustivel", "Atinge linha de 1,5m em alcance curto; alvos atingidos ficam em chamas. Usa Combustível."),
        ("Metralhadora", 2, "2d12", "19/x3", "Médio", "B", 2, "pesadas", "fogo", "duas-maos", False, True, "balas-longas", "Arma automática; exige FOR 4 ou ação de movimento para apoiar em tripé (senão –5 no ataque). Usa Balas longas."),
    ]
    for name, cat, dmg, crit, rng, dt, sp, prof, wtype, grip, agile, auto, ammo, summary in weapons:
        out.append(make_entry(
            f"equipment:{slug(name)}",
            "equipment",
            name,
            summary,
            src_core(56 if prof == "simples" else 57, "Armas"),
            {
                "category": "arma",
                "itemCategory": cat,
                "spaces": sp,
                "weight": sp,
                "damage": dmg,
                "critical": crit,
                "range": rng,
                "damageType": DMG_TYPE[dt],
                "proficiency": prof,
                "weaponType": wtype,
                "grip": "distancia" if wtype in ("disparo", "fogo") else grip,
                "handGrip": grip,
                "agile": agile,
                "automatic": auto,
                **({"ammo": ammo} if ammo else {}),
            },
        ))

    # --- Munições (Tabela 3.4, p. 59) ---
    ammos = [
        ("Balas curtas", 0, 1, "Usadas em pistolas, revólveres e submetralhadoras. Dura 2 cenas."),
        ("Balas longas", 1, 1, "Usadas em fuzis e metralhadoras. Dura 1 cena."),
        ("Cartuchos", 1, 1, "Usados em espingardas. Dura 1 cena."),
        ("Combustível", 1, 1, "Tanque para lança-chamas. Dura 1 cena."),
        ("Flechas", 0, 1, "Usadas em arcos e bestas. Reaproveitáveis; dura uma missão inteira."),
        ("Foguete", 1, 1, "Disparado por bazucas. Dura um único disparo."),
    ]
    for name, cat, sp, summary in ammos:
        out.append(make_entry(
            f"equipment:{slug(name)}",
            "equipment",
            name,
            summary,
            src_core(59, "Munições"),
            {"category": "municao", "itemCategory": cat, "spaces": sp, "weight": sp},
        ))

    # --- Proteções (Tabela 3.6, p. 62) ---
    protections = [
        ("Proteção leve", 1, 2, 5, 0, 0, "leve", "Jaqueta de couro pesada ou colete de kevlar. +5 na Defesa."),
        ("Proteção pesada", 2, 5, 10, -5, 2, "pesada", "Equipamento tático completo. +10 na Defesa, RD 2 (balístico, corte, impacto, perfuração), –5 em perícias de carga."),
        ("Escudo", 1, 2, 2, 0, 0, "escudo", "Empunhado em uma mão; +2 na Defesa (acumula com proteção). Conta como proteção pesada para proficiência."),
    ]
    for name, cat, sp, defense, pen, rd, atype, summary in protections:
        out.append(make_entry(
            f"equipment:{slug(name)}",
            "equipment",
            name,
            summary,
            src_core(62, "Proteções"),
            {
                "category": "escudo" if atype == "escudo" else "armadura",
                "itemCategory": cat,
                "spaces": sp,
                "weight": sp,
                "defense": defense,
                "armorPenalty": pen,
                "damageReduction": rd,
                "armorType": atype,
            },
        ))

    # --- Equipamentos Gerais (Tabela 3.8 e 3.10, p. 63–67) ---
    general_items = [
        # Acessórios
        ("Kit de perícia", "acessorio", 0, 1, "Ferramentas exigidas por certas perícias (Crime, Enganação, Medicina, Tecnologia). Sem o kit, sofre –5."),
        ("Utensílio", "acessorio", 1, 1, "Item utilitário empunhado que fornece +2 em uma perícia (exceto Luta e Pontaria)."),
        ("Vestimenta", "vestuario", 1, 1, "Peça vestida que fornece +2 em uma perícia (exceto Luta e Pontaria). Máximo de 2 vestimentas."),
        # Explosivos
        ("Granada de atordoamento", "explosivo", 0, 1, "Alcance médio, raio 6m: atordoados por 1 rodada (Fortitude DT Agi reduz para ofuscado e surdo)."),
        ("Granada de fragmentação", "explosivo", 1, 1, "Alcance médio, raio 6m: 8d6 perfuração (Reflexos DT Agi reduz à metade)."),
        ("Granada de fumaça", "explosivo", 0, 1, "Alcance médio, raio 6m: fumaça espessa (cegos e camuflagem total) por 2 rodadas."),
        ("Granada incendiária", "explosivo", 1, 1, "Alcance médio, raio 6m: 6d6 fogo e em chamas (Reflexos DT Agi reduz à metade e evita chamas)."),
        ("Mina antipessoal", "explosivo", 1, 1, "Detonada remotamente (alcance longo): cone 6m, 12d6 perfuração (Reflexos DT Int reduz à metade)."),
        # Operacionais
        ("Algemas", "item", 0, 1, "Prende pulsos (–5 em testes com mãos, impede conjuração). Escapar: Acrobacia DT 30."),
        ("Arpéu", "item", 0, 1, "Prender: Pontaria DT 15. Fornece +5 em Atletismo para escalar com corda."),
        ("Bandoleira", "item", 1, 1, "1×/rodada pode sacar ou guardar um item do inventário como ação livre."),
        ("Binóculos", "item", 0, 1, "Fornece +5 em Percepção para observar coisas distantes."),
        ("Bloqueador de sinal", "item", 1, 1, "Impede celulares e sinais de rádio em alcance médio."),
        ("Cicatrizante", "alquimico", 1, 1, "Ação padrão (consumível): cura 2d8+2 PV em você ou ser adjacente."),
        ("Corda", "item", 0, 1, "10 metros de corda resistente (+5 em Atletismo para subir/descer)."),
        ("Equipamento de sobrevivência", "item", 0, 2, "+5 em Sobrevivência para acampar/orientar-se; permite usar destreinado."),
        ("Lanterna tática", "item", 1, 1, "Ilumina áreas escuras; ação de movimento ofusca um ser em alcance curto por 1 rodada."),
        ("Máscara de gás", "item", 0, 1, "+10 em Fortitude contra efeitos respiratórios."),
        ("Mochila militar", "item", 1, 0, "Não ocupa espaço e aumenta sua capacidade de carga em +2 espaços."),
        ("Óculos de visão térmica", "item", 1, 1, "Elimina penalidades por camuflagem."),
        ("Pé de cabra", "item", 0, 1, "+5 em testes de Força para arrombar portas; pode ser usado como bastão."),
        ("Pistola de dardos", "item", 1, 1, "Ataque à distância deixa o alvo inconsciente até o fim da cena (Fortitude DT Agi reduz). Vem com 2 dardos."),
        ("Pistola sinalizadora", "item", 0, 1, "Disparo leve alcance curto, 2d6 de fogo. Vem com 2 cargas."),
        ("Soqueira", "item", 0, 1, "+1 no dano desarmado; pode receber modificações e maldições de armas corpo a corpo."),
        ("Spray de pimenta", "item", 1, 1, "Ação padrão em alvo adjacente: cego por 1d4 rodadas (Fortitude DT Agi evita). 2 usos."),
        ("Taser", "item", 1, 1, "Ação padrão adjacente: 1d6 eletricidade e atordoado por 1 rodada (Fortitude DT Agi evita). 2 usos."),
        ("Traje hazmat", "vestuario", 1, 2, "+5 em resistências contra efeitos ambientais e resistência a químico 10."),
        # Paranormais (Tabela 3.10, p. 67)
        ("Amarras de (elemento)", "paranormal", 2, 1, "Imobiliza criaturas vulneráveis ao elemento como armadilha (3×3m, 2 PE) ou laço (1 PE)."),
        ("Câmera de aura paranormal", "paranormal", 2, 1, "Ação padrão e 1 PE: tira foto instantânea que revela auras paranormais por elemento."),
        ("Componentes ritualísticos de (elemento)", "paranormal", 0, 1, "Necessários para conjurar rituais do elemento escolhido (Sangue, Morte, Conhecimento ou Energia)."),
        ("Emissor de pulsos paranormais", "paranormal", 2, 1, "Ação completa e 1 PE: atrai criaturas do mesmo elemento e afasta do elemento opressor (Vontade DT Pre)."),
        ("Escuta de ruídos paranormais", "paranormal", 2, 1, "Ação completa e 2 PE: grava até 24h; ouvir dá +5 em Ocultismo para identificar criaturas."),
        ("Medidor de estabilidade da Membrana", "paranormal", 2, 1, "Permite avaliar a estabilidade da Membrana numa área (requer Ocultismo treinado)."),
        ("Scanner de manifestação paranormal de (elemento)", "paranormal", 2, 1, "Ação padrão, 1 PE/rodada: indica a direção de manifestações do elemento em alcance longo."),
    ]
    for name, cat, icat, sp, summary in general_items:
        extra = {"extraSpaces": 2} if slug(name) == "mochila-militar" else {}
        out.append(make_entry(
            f"equipment:{slug(name)}",
            "equipment",
            name,
            summary,
            src_core(67 if cat == "paranormal" else 63, "Equipamento Geral"),
            {"category": cat, "itemCategory": icat, "spaces": sp, "weight": sp, **extra},
        ))

    # --- Modificações (+I na categoria cada) ---
    mods = [
        # Armas corpo a corpo e disparo
        ("Certeira", "arma", "+2 em testes de ataque.", 60),
        ("Cruel", "arma", "+2 em rolagens de dano.", 60),
        ("Perigosa", "arma", "+2 na margem de ameaça.", 60),
        ("Tática", "arma", "Pode sacar a arma como ação livre.", 60),
        ("Discreta", "arma-protecao", "–1 espaço ocupado, +5 em Crime para ocultar (pode usar destreinado).", 60),
        # Armas de fogo
        ("Alongada", "arma-fogo", "+2 em testes de ataque com arma de fogo.", 60),
        ("Calibre grosso", "arma-fogo", "Aumenta o dano da arma de fogo em +1 dado do mesmo tipo.", 60),
        ("Compensador", "arma-fogo", "Anula a penalidade por disparar rajadas em armas automáticas.", 60),
        ("Ferrolho automático", "arma-fogo", "Torna a arma de fogo automática.", 60),
        ("Mira laser", "arma-fogo", "+2 na margem de ameaça com arma de fogo.", 60),
        ("Mira telescópica", "arma-fogo", "Aumenta o alcance em uma categoria e libera Ataque Furtivo em qualquer alcance.", 60),
        ("Silenciador", "arma-fogo", "Reduz em –10 a penalidade em Furtividade ao esconder-se após disparar.", 60),
        ("Visão de calor", "arma-fogo", "Ignora camuflagem do alvo ao disparar.", 60),
        # Munições
        ("Dum dum", "municao", "+1 no multiplicador de crítico (balas curtas e longas).", 60),
        ("Explosiva", "municao", "+2d6 de dano (balas curtas e longas).", 60),
        # Proteções
        ("Antibombas", "protecao-pesada", "+5 em testes de resistência contra efeitos de área (só proteção pesada).", 62),
        ("Blindada", "protecao-pesada", "Aumenta RD da proteção pesada para 5 e ocupa +1 espaço.", 62),
        ("Reforçada", "protecao", "+2 na Defesa fornecida pela proteção e ocupa +1 espaço.", 62),
        # Acessórios
        ("Aprimorado", "acessorio", "Aumenta o bônus em perícia do acessório para +5.", 64),
        ("Função adicional", "acessorio", "Concede +2 em uma perícia adicional.", 64),
        ("Instrumental", "acessorio", "O acessório funciona como um kit de perícia.", 64),
    ]
    for name, target, effect, pg in mods:
        out.append(make_entry(
            f"equipment:mod-{slug(name)}",
            "equipment",
            name,
            effect,
            src_core(pg, "Modificações"),
            {"category": "modificacao", "target": target, "effectSummary": effect, "categoryIncrease": 1},
        ))

    # --- Maldições (Armas, Proteções e Acessórios, p. 145–147) ---
    curses = [
        # Armas
        ("Antielemento", "arma", "conhecimento", "Gaste 2 PE ao atacar criatura do elemento escolhido para causar +4d8 de dano.", 145),
        ("Ritualística", "arma", "conhecimento", "Armazena um ritual na arma e descarrega como ação livre ao acertar um ataque.", 145),
        ("Senciente", "arma", "conhecimento", "Ação de movimento e 2 PE (1 PE/turno): arma flutua e ataca sozinha em alcance curto.", 146),
        ("Empuxo", "arma", "energia", "Arma corpo a corpo pode ser arremessada (+1 dado de dano) e volta para sua mão.", 146),
        ("Energética", "arma", "energia", "2 PE/ataque: +5 no ataque, ignora RD e converte todo o dano para Energia.", 146),
        ("Vibrante", "arma", "energia", "Concede Ataque Extra (ou reduz seu custo em –1 PE se já possuir).", 146),
        ("Consumidora", "arma", "morte", "Alvos atingidos ficam lentos; 2 PE ao atacar deixa imóvel por 1 rodada.", 146),
        ("Erosiva", "arma", "morte", "+1d8 dano de Morte; 2 PE causa 2d4 Morte nos próximos 2 turnos do alvo.", 146),
        ("Repulsora", "arma", "morte", "+2 na Defesa enquanto empunhada; 2 PE ao bloquear concede +5 extra na Defesa.", 146),
        ("Lancinante", "arma", "sangue", "+1d8 dano de Sangue (multiplicado em acertos críticos).", 146),
        ("Predadora", "arma", "sangue", "Anula camuflagem/cobertura, +1 categoria de alcance e duplica a margem de ameaça.", 146),
        ("Sanguinária", "arma", "sangue", "Alvo atingido fica sangrando (cumulativo); crítico deixa fraco e dá 2d10 PV temp.", 146),
        # Proteções
        ("Abascanta", "protecao", "conhecimento", "+5 em resistências contra rituais; 1×/cena reflete um ritual ao conjurador.", 146),
        ("Profética", "protecao", "conhecimento", "Resistência a Conhecimento 10; 2 PE para rolar novamente um teste de resistência.", 146),
        ("Sombria", "protecao", "conhecimento", "+5 em Furtividade, ignora penalidade de carga em Furtividade e disfarça como roupa comum.", 147),
        ("Cinética", "protecao", "energia", "+2 na Defesa e RD 2 (leve/escudo) ou RD 5 (pesada).", 147),
        ("Lépida", "protecao", "energia", "+10 em Atletismo, +3m de deslocamento; 2 PE para mover-se sobrenaturalmente.", 147),
        ("Voltaica", "protecao", "energia", "Resistência a Energia 10; 2 PE gera aura que causa 2d6 Energia em adjacentes.", 147),
        ("Letárgica", "protecao", "morte", "+2 na Defesa e 25% (leve/escudo) ou 50% (pesada) de chance de ignorar críticos/furtivo.", 147),
        ("Repulsiva", "protecao", "morte", "Resistência a Morte 10; 2 PE cobre-se de lodo (atacantes corpo a corpo sofrem 2d8 Morte).", 147),
        ("Regenerativa", "protecao", "sangue", "Resistência a Sangue 10; ação de movimento e 1 PE cura 1d12 PV.", 147),
        ("Sádica", "protecao", "sangue", "+1 em ataque e dano para cada 10 pontos de dano sofridos desde o último turno.", 147),
        # Acessórios
        ("Carisma", "acessorio", "conhecimento", "+1 em Presença (não fornece PE adicionais).", 147),
        ("Conjuração", "acessorio", "conhecimento", "Permite conjurar um ritual de 1º círculo armazenado (ou –1 PE se já conhecer).", 147),
        ("Escudo mental", "acessorio", "conhecimento", "Resistência a dano mental 10.", 147),
        ("Reflexão", "acessorio", "conhecimento", "1×/rodada gasta PE igual ao ritual para refleti-lo ao conjurador.", 147),
        ("Sagacidade", "acessorio", "conhecimento", "+1 em Intelecto (não fornece perícias adicionais).", 147),
        ("Defesa (maldição)", "acessorio", "energia", "+5 na Defesa.", 147),
        ("Destreza", "acessorio", "energia", "+1 em Agilidade.", 147),
        ("Potência", "acessorio", "energia", "+1 na DT de seus rituais e habilidades.", 147),
        ("Esforço adicional", "acessorio", "morte", "+5 PE (ativa após 1 dia de uso).", 147),
        ("Disposição", "acessorio", "sangue", "+1 em Vigor.", 147),
        ("Pujança", "acessorio", "sangue", "+1 em Força.", 147),
        ("Vitalidade", "acessorio", "sangue", "+15 PV (ativa após 1 dia de uso).", 147),
        ("Proteção elemental", "acessorio", "variavel", "Resistência 10 contra um elemento escolhido.", 147),
    ]
    for name, target, elem, effect, pg in curses:
        out.append(make_entry(
            f"equipment:maldicao-{slug(name)}",
            "equipment",
            name,
            effect,
            src_core(pg, "Maldições"),
            {"category": "encanto", "target": target, "element": elem, "effectSummary": effect},
        ))

    # --- Itens Amaldiçoados Especiais (Core p. 148–151 / PDF 156–159) ---
    spans_sp: list[Span] = []
    for p in range(156, 160):
        spans_sp.extend(page_spans(doc, p, 8))
    cur_elem = "sangue"
    cur: dict | None = None
    spec_blocks: list[dict] = []
    for s in spans_sp:
        t = s.text.strip()
        if "OptimaLTPro" in s.font and s.color == "ffffff" and t.upper() in ("SANGUE", "MORTE", "CONHECIMENTO", "ENERGIA", "MEDO"):
            cur_elem = t.lower()
            cur = None
            continue
        if "DaisyWheel" in s.font and 13 <= s.size <= 16:
            if cur is not None and not cur["spans"]:
                cur["name"] += " " + t
                continue
            cur = {"name": t, "element": cur_elem, "page": s.page, "spans": []}
            spec_blocks.append(cur)
            continue
        if cur is not None:
            cur["spans"].append(s)

    seen_ids = {e["id"] for e in out}
    for b in spec_blocks:
        name = re.sub(r"\s+", " ", b["name"]).strip()
        eid = f"equipment:{slug(name)}"
        if eid in seen_ids:
            continue
        seen_ids.add(eid)
        text = join_spans(b["spans"])
        cat = 2
        if "categoria III" in text:
            cat = 3
        elif "categoria IV" in text:
            cat = 4
        elif "categoria I " in text or "categoria I." in text:
            cat = 1
        sp = 1
        m_sp = re.search(r"ocupa\s+(\d+)\s+espaç", text, re.I)
        if m_sp:
            sp = int(m_sp.group(1))
        out.append(make_entry(
            eid,
            "equipment",
            name,
            first_sentence(text, 200),
            src_core(b["page"], "Itens Amaldiçoados Especiais"),
            {
                "category": "item-amaldicoado",
                "itemCategory": cat,
                "spaces": sp,
                "weight": sp,
                "element": b["element"],
                "cursed": True,
                "text": text,
            },
        ))

    return out


# ---------------------------------------------------------------------------
# 8. Condições (Core p. 310–311 / PDF 318–319)
# ---------------------------------------------------------------------------

def extract_conditions(doc: pymupdf.Document) -> list[dict]:
    text = ""
    for p in (318, 319):
        text += "\n" + join_spans(page_spans(doc, p, 8))
    # Quebra por "Nome. Descrição" — condições conhecidas começam em nova linha
    cond_names = [
        "Abalado", "Agarrado", "Alquebrado", "Apavorado", "Asfixiado", "Atordoado", "Caído", "Cego",
        "Confuso", "Debilitado", "Desprevenido", "Doente", "Em Chamas", "Enjoado", "Enredado",
        "Envenenado", "Esmorecido", "Exausto", "Fascinado", "Fatigado", "Fraco", "Frustrado",
        "Imóvel", "Inconsciente", "Indefeso", "Lento", "Machucado", "Morrendo", "Ofuscado",
        "Paralisado", "Pasmo", "Petrificado", "Sangrando", "Surdo", "Surpreendido", "Vulnerável",
    ]
    pat = re.compile(r"(?:^|\n|CONDIÇÕES\s+)(" + "|".join(re.escape(n) for n in cond_names) + r")\.\s+")
    matches = list(pat.finditer(text))
    out = []
    for i, m in enumerate(matches):
        name = m.group(1)
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[m.end() : end].strip()
        body = re.sub(r"\n?A menos que especificado o contrário.*$", "", body, flags=re.S).strip()
        page = 310 if i < 16 else 311
        out.append(make_entry(
            f"condition:{slug(name)}",
            "condition",
            name,
            first_sentence(body, 200),
            src_core(page, "Condições"),
            {"category": "condicao", "text": body},
        ))
    return out


# ---------------------------------------------------------------------------
# 9. Ameaças & Perigos (Core p. 182–293 / PDF 190–301 + SaH p. 126–164)
# ---------------------------------------------------------------------------

def extract_creatures(doc_core: pymupdf.Document, doc_sah: pymupdf.Document | None) -> list[dict]:
    toc = doc_core.get_toc()
    # Ameaças Paranormais (L3 entre p. 190 e 287 + L2 Degolificada p. 288) + Realidade (L3 p. 292–297)
    entries: list[tuple[str, str, int, int, pymupdf.Document, int]] = []
    group_name = "Sangue"
    for idx, (lvl, title, pg) in enumerate(toc):
        t = title.strip()
        if lvl == 2 and 190 <= pg <= 297:
            if "Sangue" in t:
                group_name = "Sangue"
            elif "Morte" in t:
                group_name = "Morte"
            elif "Conhecimento" in t:
                group_name = "Conhecimento"
            elif "Energia" in t:
                group_name = "Energia"
            elif "Degolificada" in t:
                group_name = "Medo"
                next_pg = toc[idx + 1][2] if idx + 1 < len(toc) else pg + 4
                entries.append((t, group_name, pg, next_pg - 1, doc_core, 8))
            elif "Realidade" in t:
                group_name = "Realidade"
        elif lvl == 3 and 190 <= pg <= 297:
            next_pg = toc[idx + 1][2] if idx + 1 < len(toc) else pg + 1
            end_pg = max(pg, min(next_pg - 1 if next_pg > pg else pg, pg + 3))
            entries.append((t, group_name, pg, end_pg, doc_core, 8))

    if doc_sah is not None:
        stoc = doc_sah.get_toc()
        for idx, (lvl, title, pg) in enumerate(stoc):
            t = title.strip()
            if lvl == 2 and 127 <= pg <= 158:
                m_vd = re.match(r"^(.+?)\s*\(VD\s*([^)]+)\)", t)
                name = m_vd.group(1).strip() if m_vd else t
                next_pg = stoc[idx + 1][2] if idx + 1 < len(stoc) else pg + 2
                entries.append((name, "Sobrevivendo ao Horror", pg, max(pg, min(next_pg - 1, pg + 3)), doc_sah, 1))
            elif lvl == 3 and 159 <= pg <= 164:
                m_vd = re.match(r"^(.+?)\s*\(VD\s*([^)]+)\)", t)
                name = m_vd.group(1).strip() if m_vd else t
                if name.lower() == "animais":
                    continue
                entries.append((name, "Realidade (SaH)", pg, pg, doc_sah, 1))

    out = []
    seen: set[str] = set()
    for name, grp, p1, p2, d, offset in entries:
        sl = slug(name)
        if not sl:
            sl = "estrangeiro-desconhecido"
            name = "??? (O Estrangeiro / Criatura sem nome)"
        eid = f"creature:{sl}"
        if eid in seen:
            continue
        seen.add(eid)
        raw = "\n".join(d[p - 1].get_text("text") for p in range(p1, min(p2 + 1, len(d) + 1)))
        # Se há múltiplas criaturas na mesma página (Ameaças da Realidade), recorta o trecho desta criatura
        if p1 == p2 and ("Realidade" in grp):
            up_name = name.upper().replace(",", "")
            m_start = re.search(re.escape(name.split(",")[0].upper()), raw)
            if m_start:
                raw = raw[m_start.start():]
                # Corta na próxima linha com "VD \d+" após a primeira
                vds = list(re.finditer(r"\bVD\s+\d+", raw))
                if len(vds) >= 2:
                    cut_pos = raw.rfind("\n", 0, vds[1].start() - 2)
                    if cut_pos > 40:
                        raw = raw[:cut_pos]

        # Normaliza glifos de d20
        txt = re.sub(r"(\d+)O", r"\1d20", raw)
        txt = re.sub(r"\bO(\+\d+|\b)", r"1d20\1", txt)
        txt = clean_text(txt)

        m_vd = re.search(r"VD\s*(\d+|variável)", txt, re.I)
        vd_raw = m_vd.group(1) if m_vd else "—"
        vd = str(int(vd_raw)) if vd_raw.isdigit() else vd_raw
        m_def = re.search(r"DEFESA\s+(\d+)", txt)
        defense = int(m_def.group(1)) if m_def else None
        m_hp = re.search(r"PONTOS DE VIDA\s+(\d+)", txt)
        hp = int(m_hp.group(1)) if m_hp else None
        m_size = re.search(r"(CRIATURA|PESSOA|ANIMAL)\s*[•·-]\s*(MINÚSCULO|PEQUENO|MÉDIO|GRANDE|ENORME|COLOSSAL)", txt, re.I)
        ctype = m_size.group(1).title() if m_size else ("Pessoa" if "Realidade" in grp else "Criatura")
        size = m_size.group(2).title() if m_size else "Médio"
        m_pres = re.search(r"PRESENÇA PERTURBADORA\s*\n?\s*([^\n]+)", txt)
        presence = m_pres.group(1).strip() if m_pres else ""

        summary_parts = [f"VD {vd}", grp]
        if defense is not None:
            summary_parts.append(f"Defesa {defense}")
        if hp is not None:
            summary_parts.append(f"{hp} PV")
        if presence:
            summary_parts.append(f"Presença Perturbadora: {presence}")

        src = src_sah(p1 - offset, "Ameaças (Sobrevivendo ao Horror)") if offset == 1 else src_core(p1 - offset, f"Ameaças ({grp})")
        out.append(make_entry(
            eid,
            "creature",
            name,
            " · ".join(summary_parts),
            src,
            {
                "nd": vd,
                "vd": int(vd) if vd.isdigit() else 0,
                "group": grp,
                "creatureType": ctype,
                "size": size,
                "defense": defense,
                "hp": hp,
                "presence": presence,
                "treasure": "Nenhum",
                "text": txt[:2600],
                "actions": [],
            },
        ))
    return out


def extract_hazards(doc: pymupdf.Document) -> list[dict]:
    toc = [(title.strip(), pg) for lvl, title, pg in doc.get_toc() if lvl == 3 and 298 <= pg <= 301]
    full = "\n".join(join_spans(page_spans(doc, p, 8)) for p in range(298, 302))
    out = []
    for i, (name, pg) in enumerate(toc):
        m1 = re.search(re.escape(name.upper()), full)
        if not m1:
            continue
        m2 = re.search(re.escape(toc[i + 1][0].upper()), full[m1.end():]) if i + 1 < len(toc) else None
        body = full[m1.end() : (m1.end() + m2.start() if m2 else len(full))].strip()
        htype = "doenca" if "doenç" in name.lower() else "veneno" if "venen" in name.lower() else "armadilha" if "armadilha" in name.lower() else "complexo"
        out.append(make_entry(
            f"hazard:{slug(name)}",
            "hazard",
            name,
            first_sentence(body, 200),
            src_core(pg - 8, "Perigos"),
            {"hazardType": htype, "text": body},
        ))
    return out


def build_gm_rules() -> list[dict]:
    return [
        make_entry(
            "rule:construindo-combates-vd",
            "rule",
            "Construindo Combates (Valor de Desafio)",
            "Some o VD das ameaças e compare com a soma do NEX do grupo: ~0,5× Fácil, ~1× Equilibrado, ~1,5× Difícil (veteranos: 2×).",
            src_core(177, "Construindo Combates"),
            {
                "category": "regra",
                "text": "Para determinar se um combate é equilibrado, some o VD de todas as ameaças do combate e compare o resultado com a soma do NEX de todos os personagens do grupo. Equivalente = Equilibrado; ~50% = Fácil; ~150% = Difícil. Contra jogadores veteranos, considere o dobro do NEX do grupo para um combate difícil.",
            },
        ),
        make_entry(
            "rule:pontos-de-prestigio",
            "rule",
            "Pontos de Prestígio e Patentes",
            "Ao concluir missões, o grupo recebe PP: +10 solução do caso, +2 por pista adicional, –2 morte de inocente, –5 morte de agente.",
            src_core(53, "Patente"),
            {
                "category": "regra",
                "text": "Patentes: Recruta (0 PP: 2 Cat I, Crédito Baixo), Operador (20 PP: 3 Cat I / 1 Cat II, Crédito Médio), Agente Especial (50 PP: 3 Cat I / 2 Cat II / 1 Cat III, Crédito Médio, libera Itens Amaldiçoados), Oficial de Operações (100 PP: 3/3/2/1, Crédito Alto), Agente de Elite (200 PP: 3/3/3/2, Crédito Ilimitado).",
            },
        ),
        make_entry(
            "rule:presenca-perturbadora",
            "rule",
            "Presença Perturbadora",
            "Ao ver uma criatura paranormal pela primeira vez na cena, cada agente faz teste de Vontade contra a DT indicada (passar reduz dano mental à metade).",
            src_core(180, "Habilidades de Criaturas"),
            {
                "category": "regra",
                "text": "Se houver mais de uma criatura na cena, use a Presença Perturbadora da criatura de maior VD e adicione +1d6 de dano mental por cada criatura adicional. Personagens com NEX igual ou superior ao valor indicado são imunes àquela Presença Perturbadora.",
            },
        ),
        make_entry(
            "rule:custo-do-paranormal",
            "rule",
            "O Custo do Paranormal",
            "Ao conjurar ritual (exceto Medo), teste Ocultismo (DT 20 + custo em PE). Falha causa dano mental igual ao custo em PE; falha por 5+ perde 1 SAN permanente.",
            src_core(121, "Rituais"),
            {
                "category": "regra",
                "text": "Rituais de Medo não exigem teste de Ocultismo, mas causam dano mental igual ao custo em PE e perda permanente de 1 SAN (básico), 2 SAN (discente) ou 3 SAN (verdadeiro).",
            },
        ),
        make_entry(
            "rule:afinidade-elemental",
            "rule",
            "Afinidade Elemental (NEX 50%)",
            "Em NEX 50% você se liga a Sangue, Morte, Conhecimento ou Energia; ao Transcender novamente desenvolve afinidade (+2d20 contra o elemento, –2d20 contra o opressor, sem componentes).",
            src_core(114, "Poderes Paranormais"),
            {
                "category": "regra",
                "text": "Relação entre elementos: Sangue oprime Conhecimento; Conhecimento oprime Energia; Energia oprime Morte; Morte oprime Sangue; Medo é neutro. Afinidade dispensa componentes ritualísticos do elemento e permite escolher poderes do elemento uma segunda vez para receber o efeito de Afinidade.",
            },
        ),
        make_entry(
            "rule:ferimentos-e-insanidade",
            "rule",
            "Ferimentos, Morte e Enlouquecendo",
            "0 PV = Inconsciente e Morrendo (morre após 3 rodadas). 0 SAN = Enlouquecendo (enlouquece permanentemente após 3 rodadas se não for acalmado com Diplomacia/Religião DT 20).",
            src_core(88, "Combate"),
            {
                "category": "regra",
                "text": "Machucado: menos da metade dos PV máximos. Perturbado: menos da metade da SAN máxima. Um aliado pode estabilizar alguém morrendo (Medicina DT 20) ou acalmar alguém enlouquecendo (Diplomacia ou Religião DT 20).",
            },
        ),
    ]


def build_features() -> list[dict]:
    """Escolhas exclusivas de classe (Afinidade Elemental em NEX 50%)."""
    elems = [
        ("sangue", "Sangue", "Oprime Conhecimento; é oprimido por Morte. Dispensa componentes de Sangue e libera melhorias de Afinidade em poderes de Sangue."),
        ("morte", "Morte", "Oprime Sangue; é oprimida por Energia. Dispensa componentes de Morte e libera melhorias de Afinidade em poderes de Morte."),
        ("conhecimento", "Conhecimento", "Oprime Energia; é oprimido por Sangue. Dispensa componentes de Conhecimento e libera melhorias de Afinidade em poderes de Conhecimento."),
        ("energia", "Energia", "Oprime Morte; é oprimida por Conhecimento. Dispensa componentes de Energia e libera melhorias de Afinidade em poderes de Energia."),
    ]
    return [
        make_entry(
            f"feature:afinidade-{eid}",
            "feature",
            f"Afinidade: {label}",
            summary,
            src_core(114, "Afinidade Elemental"),
            {"exclusiveGroup": "afinidade", "element": eid},
            prerequisites={"type": "minLevel", "level": 10},  # NEX 50%
        )
        for eid, label, summary in elems
    ]


def main() -> None:
    if len(sys.argv) < 2:
        print("Uso: python scripts/ordem-paranormal/extract.py <core.pdf> [sobrevivendo-ao-horror.pdf]")
        sys.exit(1)

    doc_core = pymupdf.open(sys.argv[1])
    doc_sah = pymupdf.open(sys.argv[2]) if len(sys.argv) >= 3 else None

    skills = extract_skills(doc_core)
    origins = extract_core_origins(doc_core)
    if doc_sah is not None:
        seen_o = {o["id"] for o in origins}
        origins += [o for o in extract_sah_origins(doc_sah) if o["id"] not in seen_o]

    classes = build_classes()
    subclasses = extract_core_subclasses(doc_core)
    if doc_sah is not None:
        subclasses += extract_sah_subclasses(doc_sah)

    powers = extract_all_powers(doc_core, doc_sah)
    spells = extract_core_rituals(doc_core)
    if doc_sah is not None:
        spells += extract_sah_rituals(doc_sah, {s["id"] for s in spells})

    equipment = build_core_equipment(doc_core)
    conditions = extract_conditions(doc_core)
    creatures = extract_creatures(doc_core, doc_sah)
    hazards = extract_hazards(doc_core)
    gm_rules = build_gm_rules()
    features = build_features()

    datasets = {
        "skills": skills,
        "origins": origins,
        "classes": classes,
        "subclasses": subclasses,
        "powers": powers,
        "spells": spells,
        "equipment": equipment,
        "conditions": conditions,
        "creatures": creatures,
        "hazards": hazards,
        "gm-rules": gm_rules,
        "features": features,
    }

    OUT.mkdir(parents=True, exist_ok=True)
    all_ids: set[str] = set()
    dupes: list[str] = []
    for name, rows in datasets.items():
        for r in rows:
            if r["id"] in all_ids:
                dupes.append(r["id"])
            all_ids.add(r["id"])
        (OUT / f"{name}.json").write_text(
            json.dumps(rows, ensure_ascii=False, indent=1) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        print(f"{name}: {len(rows)}")
    if dupes:
        print("DUPLICADOS:", dupes)


if __name__ == "__main__":
    main()
