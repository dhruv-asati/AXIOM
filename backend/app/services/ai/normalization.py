"""Deterministic text normalization for English and common Hinglish requests.

This module only prepares text for later interpretation. It does not resolve
dates, infer identity, make booking decisions, or apply disruptions.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


_PUNCTUATION = re.compile(
    r"(?<!\d)[.,!?;()\[\]{}\"'“”‘’/\\]|[.,!?;()\[\]{}\"'“”‘’/\\](?!\d)"
)
_WHITESPACE = re.compile(r"\s+")
_TEMPORAL_TERMS = re.compile(r"\b(?:kal|parso)\b")
_HINGLISH_MARKERS = {
    "baje",
    "chahiye",
    "dopahar",
    "ghanta",
    "ghante",
    "log",
    "mein",
    "shaam",
    "subah",
}
_HINGLISH_REPLACEMENTS = {
    "shaam": "evening",
    "subah": "morning",
    "dopahar": "afternoon",
    "ghante": "hours",
    "ghanta": "hours",
    "chahiye": "need",
    "mein": "in",
}
_TOKEN = re.compile(r"\b[\w]+\b", re.UNICODE)


@dataclass(frozen=True)
class NormalizationResult:
    """Normalized text and metadata, retaining the exact source message."""

    original_text: str
    normalized_text: str
    ambiguous_temporal_terms: tuple[str, ...]


def normalize_text(text: str) -> NormalizationResult:
    """Normalize English/Hinglish wording without resolving ambiguous dates.

    The original string is returned unchanged in ``original_text``. Common
    punctuation is converted to spacing, repeated whitespace is collapsed,
    and conservative whole-word Hinglish replacements are applied. ``kal``
    and ``parso`` remain in the normalized text and are reported in encounter
    order as ambiguous temporal terms.
    """

    if not isinstance(text, str):
        raise TypeError("text must be a string")

    normalized = text.lower().strip()
    normalized = _PUNCTUATION.sub(" ", normalized)
    normalized = _WHITESPACE.sub(" ", normalized).strip()

    tokens = set(_TOKEN.findall(normalized))
    hinglish_context = bool(tokens & _HINGLISH_MARKERS)

    def replace_token(match: re.Match[str]) -> str:
        token = match.group(0)
        replacement = _HINGLISH_REPLACEMENTS.get(token)
        if token == "me" and hinglish_context:
            return "in"
        return replacement or token

    normalized = _TOKEN.sub(replace_token, normalized)
    normalized = _WHITESPACE.sub(" ", normalized).strip()

    ambiguous_terms = tuple(dict.fromkeys(_TEMPORAL_TERMS.findall(normalized)))
    return NormalizationResult(
        original_text=text,
        normalized_text=normalized,
        ambiguous_temporal_terms=ambiguous_terms,
    )
