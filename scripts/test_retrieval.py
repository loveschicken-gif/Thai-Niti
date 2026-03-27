#!/usr/bin/env python3
"""Run quick terminal tests for Thai Niti retrieval."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys
from typing import List

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from lib.retrieval import build_retriever_from_file


DEFAULT_QUERIES = [
    "บริษัทจำกัดสามารถทำธุรกิจธนาคารพาณิชย์ได้หรือไม่",
    "ธนาคารแห่งประเทศไทยมีอำนาจกำกับดูแลอะไรบ้าง",
    "สถาบันการเงินถือหุ้นเกินร้อยละ 10 ได้ไหม",
]


def preview(text: str, max_chars: int = 220) -> str:
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 3] + "..."


def print_results(query: str, results: List, top_k: int) -> None:
    print("=" * 100)
    print(f"QUERY: {query}")
    print("-" * 100)
    if not results:
        print("No results.")
        print()
        return

    for r in results[:top_k]:
        print(f"rank: {r.rank}")
        print(f"law title: {r.law_title or '-'}")
        print(f"section: {r.section or '-'}")
        print(f"score: {r.score:.6f}")
        print(f"preview: {preview(r.context_text)}")
        print("-" * 100)
    print()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--data",
        default="data/processed/thai_niti_normalized.json",
        help="Path to normalized JSON dataset.",
    )
    parser.add_argument(
        "--dedup-out",
        default="data/processed/thai_niti_deduped.json",
        help="Optional output path for deduplicated positive contexts.",
    )
    parser.add_argument("--top-k", type=int, default=3, help="Number of results per query.")
    parser.add_argument(
        "--query",
        action="append",
        default=[],
        help="Query to search. Can be passed multiple times. Uses defaults when omitted.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    data_path = Path(args.data)
    dedup_out = Path(args.dedup_out) if args.dedup_out else None

    retriever = build_retriever_from_file(data_path, dedup_output_path=dedup_out)
    print(f"Indexed documents: {retriever.total_docs}")
    if dedup_out:
        print(f"Deduped file: {dedup_out.as_posix()}")
    print()

    queries = args.query if args.query else DEFAULT_QUERIES
    for q in queries:
        results = retriever.search(q, top_k=args.top_k)
        print_results(q, results, args.top_k)


if __name__ == "__main__":
    main()
