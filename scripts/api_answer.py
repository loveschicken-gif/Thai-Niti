#!/usr/bin/env python3
"""Local adapter for Next.js API route -> grounded answer engine."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from lib.answer import build_answer_engine


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--query", required=True, help="Thai legal question")
    parser.add_argument("--top-k", type=int, default=3, help="Top K retrieval results")
    parser.add_argument(
        "--data",
        default="data/processed/thai_niti_normalized.json",
        help="Path to normalized dataset",
    )
    parser.add_argument(
        "--dedup-out",
        default="data/processed/thai_niti_deduped.json",
        help="Path to optional dedup output",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    engine = build_answer_engine(
        normalized_json_path=Path(args.data),
        dedup_output_path=Path(args.dedup_out),
    )
    payload = engine.answer_query(args.query, top_k=args.top_k)

    response = {
        "question": payload.question,
        "normalized_query": payload.normalized_query,
        "normalization_applied": payload.normalization_applied,
        "answer": payload.answer,
        "short_answer": payload.short_answer,
        "grounded": payload.grounded,
        "main_ccc_provision": (
            {
                "law_title": payload.main_ccc_provision.law_title,
                "section": payload.main_ccc_provision.section,
                "excerpt": payload.main_ccc_provision.excerpt,
                "full_text": payload.main_ccc_provision.full_text,
                "score": payload.main_ccc_provision.score,
            }
            if payload.main_ccc_provision is not None
            else None
        ),
        "related_ccc_provisions": [
            {
                "law_title": p.law_title,
                "section": p.section,
                "excerpt": p.excerpt,
                "full_text": p.full_text,
                "score": p.score,
            }
            for p in payload.related_ccc_provisions
        ],
        "additional_authorities": [
            {
                "law_title": p.law_title,
                "section": p.section,
                "excerpt": p.excerpt,
                "full_text": p.full_text,
                "score": p.score,
            }
            for p in payload.additional_authorities
        ],
        "citations": [
            {"law_title": c.law_title, "section": c.section}
            for c in payload.citations
        ],
        "retrieved_results": [
            {
                "rank": r.rank,
                "score": r.score,
                "law_title": r.law_title,
                "section": r.section,
                "context_text": r.context_text,
                "split": r.split,
            }
            for r in payload.retrieved_results
        ],
    }
    print(json.dumps(response, ensure_ascii=False))


if __name__ == "__main__":
    main()
