#!/usr/bin/env python3
"""Thai query normalization for retrieval preprocessing."""

from __future__ import annotations

import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import List, Tuple


WHITESPACE_RE = re.compile(r"\s+")

# Lightweight colloquial-to-standard mappings inspired by local Thai phrasing patterns.
PHRASE_RULES: List[Tuple[str, str]] = [
    ("ได้มั้ย", "ได้หรือไม่"),
    ("ได้ไหม", "ได้หรือไม่"),
    ("ทำได้มั้ย", "สามารถทำได้หรือไม่"),
    ("ทำได้ไหม", "สามารถทำได้หรือไม่"),
    ("ผิดกฎหมายมั้ย", "ขัดต่อกฎหมายหรือไม่"),
    ("ผิดกฎหมายไหม", "ขัดต่อกฎหมายหรือไม่"),
    ("บอท.", "ธนาคารแห่งประเทศไทย"),
    ("แบงก์ชาติ", "ธนาคารแห่งประเทศไทย"),
    ("ธปท", "ธนาคารแห่งประเทศไทย"),
    ("บ.จำกัด", "บริษัทจำกัด"),
    ("หจก.", "ห้างหุ้นส่วนจำกัด"),
    ("บมจ.", "บริษัทมหาชนจำกัด"),
    ("ม.", "มาตรา"),
    ("มาตรา ", "มาตรา "),
    ("เรื่องนี้", "กรณีนี้"),
    ("ยังไง", "อย่างไร"),
    ("ยังไงบ้าง", "อย่างไรบ้าง"),
    ("ไง", "อย่างไร"),
    ("เกี่ยวกับ", "เกี่ยวข้องกับ"),
    ("กม.", "กฎหมาย"),
]


LEGAL_HINT_EXPANSIONS: List[Tuple[str, str]] = [
    ("ถือหุ้นเกิน", "ถือหุ้นเกินกว่าที่กฎหมายกำหนด"),
    ("โอนหุ้น", "โอนหุ้นตามกฎหมาย"),
    ("ใบอนุญาต", "การได้รับใบอนุญาตตามกฎหมาย"),
    ("ประกาศ", "ประกาศที่ออกตามพระราชบัญญัติ"),
]


@dataclass
class QueryNormalizationResult:
    original_query: str
    normalized_query: str
    applied_rules: List[str]
    meaningful_change: bool


def _clean_query(text: str) -> str:
    text = (text or "").strip()
    text = WHITESPACE_RE.sub(" ", text)
    return text


def _replace_phrases(text: str) -> tuple[str, List[str]]:
    applied: List[str] = []
    out = text
    for src, dst in PHRASE_RULES:
        if src in out:
            out = out.replace(src, dst)
            applied.append(f"{src}->{dst}")
    return out, applied


def _expand_legal_hints(text: str) -> tuple[str, List[str]]:
    applied: List[str] = []
    out = text
    for src, dst in LEGAL_HINT_EXPANSIONS:
        if src in out and dst not in out:
            out = out.replace(src, dst)
            applied.append(f"expand:{src}")
    return out, applied


def _is_meaningful_change(original: str, normalized: str, applied_rules: List[str]) -> bool:
    if not applied_rules:
        return False
    if original == normalized:
        return False
    ratio = SequenceMatcher(None, original, normalized).ratio()
    # Treat as meaningful if enough difference after rule application.
    return ratio < 0.94


def normalize_query(query: str) -> QueryNormalizationResult:
    original = _clean_query(query)
    normalized = original
    applied_rules: List[str] = []

    normalized, phrase_rules = _replace_phrases(normalized)
    applied_rules.extend(phrase_rules)

    normalized, legal_hint_rules = _expand_legal_hints(normalized)
    applied_rules.extend(legal_hint_rules)

    # Normalize punctuation spacing.
    normalized = normalized.replace("?", "").replace("？", "")
    normalized = normalized.replace("ฯ", " ")
    normalized = _clean_query(normalized)

    meaningful_change = _is_meaningful_change(original, normalized, applied_rules)
    return QueryNormalizationResult(
        original_query=original,
        normalized_query=normalized,
        applied_rules=applied_rules,
        meaningful_change=meaningful_change,
    )
