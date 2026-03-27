#!/usr/bin/env python3
"""Metadata-aware reranking layer for legal retrieval candidates."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Dict, List, Set, Tuple


TOKEN_RE = re.compile(r"[\u0E00-\u0E7Fa-zA-Z0-9]+")
SECTION_RE = re.compile(r"(?:มาตรา|ม\.)\s*([0-9]{1,4})")
THAI_WORD_RE = re.compile(r"[\u0E00-\u0E7F]{2,}")

THAI_STOPWORDS: Set[str] = {
    "การ",
    "และ",
    "หรือ",
    "ของ",
    "ใน",
    "ให้",
    "ตาม",
    "ที่",
    "เป็น",
    "ได้",
    "จะ",
    "กับ",
    "โดย",
    "จาก",
    "เมื่อ",
    "ว่า",
    "ซึ่ง",
    "ต่อ",
    "เพื่อ",
    "ไม่",
    "มี",
    "ต้อง",
}


def _tokens(text: str) -> List[str]:
    return TOKEN_RE.findall((text or "").lower())


def _overlap_ratio(a_tokens: List[str], b_tokens: List[str]) -> float:
    if not a_tokens or not b_tokens:
        return 0.0
    a, b = set(a_tokens), set(b_tokens)
    inter = len(a.intersection(b))
    return inter / max(1, len(a))


class LegalMetadataReranker:
    """Rerank BM25 candidates using legal metadata signals."""

    @dataclass
    class Weights:
        section_match_bonus: float = 3.20
        section_mismatch_penalty: float = 0.80
        law_title_overlap_weight: float = 1.35
        context_overlap_weight: float = 0.60
        first_line_overlap_weight: float = 1.10
        overlap_density_weight: float = 1.40
        exact_section_context_boost: float = 0.40
        exact_section_query_boost: float = 2.20
        law_title_exact_mention_boost: float = 1.00
        short_phrase_context_boost: float = 0.70
        phrase_ngram_match_boost: float = 1.10
        law_focus_bonus: float = 0.90

    def __init__(self, weights: "LegalMetadataReranker.Weights | None" = None) -> None:
        self.weights = weights or LegalMetadataReranker.Weights()

    @staticmethod
    def default_weights() -> Dict[str, float]:
        return asdict(LegalMetadataReranker.Weights())

    @staticmethod
    def make_weights(overrides: Dict[str, float] | None = None) -> "LegalMetadataReranker.Weights":
        base = LegalMetadataReranker.Weights()
        if not overrides:
            return base
        valid_keys = set(asdict(base).keys())
        for k, v in overrides.items():
            if k in valid_keys:
                setattr(base, k, float(v))
        return base

    def rerank(self, query: str, candidates: List[Dict], top_k: int = 3) -> List[Dict]:
        query_tokens = _tokens(query)
        section_mentions = set(SECTION_RE.findall(query))
        w = self.weights
        query_ngrams = self._query_phrases(query)

        # Identify the most likely law from BM25 candidate mass.
        law_mass: Dict[str, float] = {}
        for cand in candidates:
            law = (cand.get("law_title") or "").strip()
            if not law:
                continue
            law_mass[law] = law_mass.get(law, 0.0) + float(cand.get("score", 0.0))
        likely_law = max(law_mass.items(), key=lambda x: x[1])[0] if law_mass else ""

        reranked: List[Dict] = []
        for cand in candidates:
            base = float(cand.get("score", 0.0))
            law_title = cand.get("law_title", "")
            section = str(cand.get("section", "")).strip()
            context_text = cand.get("context_text", "")
            first_line = context_text.split("\n", 1)[0] if context_text else ""

            title_overlap = _overlap_ratio(query_tokens, _tokens(law_title))
            context_overlap = _overlap_ratio(query_tokens, _tokens(context_text[:280]))
            first_line_overlap = _overlap_ratio(query_tokens, _tokens(first_line))
            overlap_density = self._overlap_density(query_tokens, context_text)
            ngram_boost = self._ngram_phrase_boost(query_ngrams, context_text)

            section_bonus = 0.0
            if section_mentions:
                if section in section_mentions:
                    section_bonus += w.section_match_bonus
                else:
                    section_bonus -= w.section_mismatch_penalty

            if "มาตรา" in query and section and f"มาตรา {section}" in context_text:
                section_bonus += w.exact_section_context_boost

            # Strong boost if query explicitly names section and candidate is that section.
            if section and section in section_mentions:
                section_bonus += w.exact_section_query_boost

            # Boost if law title appears in query directly.
            title_exact_bonus = w.law_title_exact_mention_boost if law_title and law_title in query else 0.0

            # Boost short discriminative query phrase if appears in context.
            query_phrase_bonus = 0.0
            query_core = query.strip()
            if 8 <= len(query_core) <= 40 and query_core in context_text:
                query_phrase_bonus = w.short_phrase_context_boost

            law_focus_bonus = w.law_focus_bonus if likely_law and law_title == likely_law else 0.0

            meta_bonus = (
                (w.law_title_overlap_weight * title_overlap)
                + (w.context_overlap_weight * context_overlap)
                + (w.first_line_overlap_weight * first_line_overlap)
                + (w.overlap_density_weight * overlap_density)
                + section_bonus
                + title_exact_bonus
                + query_phrase_bonus
                + (w.phrase_ngram_match_boost * ngram_boost)
                + law_focus_bonus
            )
            final_score = base + meta_bonus

            updated = dict(cand)
            updated["bm25_score"] = base
            updated["rerank_bonus"] = meta_bonus
            updated["score"] = final_score
            reranked.append(updated)

        reranked.sort(key=lambda x: x["score"], reverse=True)
        return reranked[:top_k]

    @staticmethod
    def _overlap_density(query_tokens: List[str], context_text: str) -> float:
        if not query_tokens or not context_text:
            return 0.0
        qset = set(query_tokens)
        c_tokens = _tokens(context_text[:420])
        if not c_tokens:
            return 0.0
        overlap = sum(1 for t in c_tokens if t in qset)
        return overlap / max(1, len(c_tokens))

    @staticmethod
    def _query_phrases(query: str) -> List[str]:
        words = [w for w in THAI_WORD_RE.findall(query) if w not in THAI_STOPWORDS]
        phrases: List[str] = []
        for n in (3, 2):
            if len(words) < n:
                continue
            for i in range(len(words) - n + 1):
                p = "".join(words[i : i + n])
                if len(p) >= 6:
                    phrases.append(p)
        # unique keep order
        seen = set()
        out = []
        for p in phrases:
            if p not in seen:
                seen.add(p)
                out.append(p)
        return out[:10]

    @staticmethod
    def _ngram_phrase_boost(query_ngrams: List[str], context_text: str) -> float:
        if not query_ngrams or not context_text:
            return 0.0
        hits = sum(1 for g in query_ngrams if g in context_text)
        return min(1.0, hits / max(1, len(query_ngrams)))
