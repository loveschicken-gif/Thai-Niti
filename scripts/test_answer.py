#!/usr/bin/env python3
"""Terminal test script for grounded Thai legal answers."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys
from typing import List

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from lib.answer import build_answer_engine


DEFAULT_QUERIES = [
    "บริษัทจำกัดสามารถประกอบกิจการธนาคารพาณิชย์ได้หรือไม่",
    "ถือหุ้นสถาบันการเงินเกินร้อยละ 10 ได้ไหม",
    "ประกาศของธนาคารแห่งประเทศไทยมีผลบังคับเมื่อใด",
]


def preview(text: str, max_chars: int = 220) -> str:
    t = (text or "").strip()
    if len(t) <= max_chars:
        return t
    return t[: max_chars - 3] + "..."


def print_answer_block(payload) -> None:
    print("=" * 110)
    print(f"question: {payload.question}")
    if payload.normalization_applied:
        print(f"normalized query used for retrieval: {payload.normalized_query}")
    print("-" * 110)
    print("short thai answer:")
    print(payload.answer)
    print(f"grounded: {payload.grounded}")
    print("-" * 110)
    print("supporting citations:")
    if not payload.citations:
        print("- none")
    else:
        for c in payload.citations:
            law = c.law_title or "ไม่ระบุชื่อกฎหมาย"
            sec = c.section or "ไม่ระบุมาตรา"
            print(f"- {law} | มาตรา {sec}")
    print("-" * 110)
    print("top retrieved context previews:")
    if not payload.retrieved_results:
        print("- none")
    else:
        for r in payload.retrieved_results:
            print(
                f"[rank {r.rank}] {r.law_title or '-'} | มาตรา {r.section or '-'} | score={r.score:.6f}"
            )
            print(f"preview: {preview(r.context_text)}")
            print("-" * 110)
    print()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--data",
        default="data/processed/thai_niti_normalized.json",
        help="Path to normalized JSON file.",
    )
    parser.add_argument(
        "--dedup-out",
        default="data/processed/thai_niti_deduped.json",
        help="Optional output path for deduped contexts.",
    )
    parser.add_argument("--top-k", type=int, default=3, help="Top-K retrieval results.")
    parser.add_argument(
        "--query",
        action="append",
        default=[],
        help="Question to answer (can pass multiple times).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    queries: List[str] = args.query if args.query else DEFAULT_QUERIES

    engine = build_answer_engine(
        normalized_json_path=args.data,
        dedup_output_path=args.dedup_out,
    )
    print(f"indexed documents: {engine.retriever.total_docs}")
    print()

    for q in queries:
        payload = engine.answer_query(q, top_k=args.top_k)
        print_answer_block(payload)


if __name__ == "__main__":
    main()
