#!/usr/bin/env python3
"""Conservative Thai legal query expansion for lexical retrieval."""

from __future__ import annotations

from typing import List, Tuple


LEGAL_QUERY_EXPANSIONS: List[Tuple[str, str]] = [
    ("ม.", "มาตรา"),
    ("ธปท", "ธนาคารแห่งประเทศไทย"),
    ("แบงก์ชาติ", "ธนาคารแห่งประเทศไทย"),
    ("หนี้", "หนี้ obligation debt"),
    ("ลูกหนี้", "ลูกหนี้ debtor"),
    ("เจ้าหนี้", "เจ้าหนี้ creditor"),
    ("บมจ.", "บริษัทมหาชนจำกัด"),
    ("บ.จำกัด", "บริษัทจำกัด"),
]


def expand_query_text(query: str) -> str:
    """
    Expand query with Thai-legal aliases while keeping original wording.
    Strategy: append canonical terms only when trigger terms exist.
    """
    q = (query or "").strip()
    if not q:
        return q

    additions: List[str] = []
    for trigger, expansion in LEGAL_QUERY_EXPANSIONS:
        if trigger in q and expansion not in q:
            additions.append(expansion)

    if not additions:
        return q
    return f"{q} {' '.join(additions)}"
