"""Funções de texto compartilhadas pelo extrator."""
from __future__ import annotations

import re
import unicodedata


def slug(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def clean_heading(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace("\t", " ").replace("\xad", "")).strip()


def norm_name(s: str) -> str:
    """Título com a capitalização do livro (alguns títulos vêm com minúsculas)."""
    small = {"de", "da", "do", "das", "dos", "e", "a", "o", "com", "em", "na", "no", "para", "por", "ou"}
    words = clean_heading(s).rstrip(".").split(" ")
    return " ".join(w if (i and w.lower() in small) else w[:1].upper() + w[1:] for i, w in enumerate(words))
