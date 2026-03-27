#!/usr/bin/env python3
"""Inspect and normalize WangchanX-Legal-ThaiCCL-RAG for Thai Niti MVP."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any, Dict, Iterable, List

from datasets import load_dataset


DATASET_NAME = "airesearch/WangchanX-Legal-ThaiCCL-RAG"


def clean_text(text: str) -> str:
    """Normalize whitespace while preserving paragraph/newline boundaries."""
    text = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def stable_id(parts: Iterable[str], prefix: str) -> str:
    joined = "||".join(parts)
    digest = hashlib.sha1(joined.encode("utf-8")).hexdigest()[:16]
    return f"{prefix}_{digest}"


def to_normalized_rows(split: str, row_idx: int, row: Dict[str, Any]) -> List[Dict[str, Any]]:
    question = clean_text(row.get("question") or "")
    answer = clean_text(row.get("positive_answer") or "")
    out: List[Dict[str, Any]] = []

    def add_rows(contexts: List[Dict[str, Any]], source_type: str) -> None:
        for ctx in contexts:
            metadata = ctx.get("metadata") or {}
            context_text = clean_text(ctx.get("context") or "")
            law_title = clean_text(metadata.get("law_title") or "")
            section = clean_text(str(metadata.get("section") or ""))
            out.append(
                {
                    "id": stable_id(
                        [split, str(row_idx), source_type, question, law_title, section, context_text],
                        prefix="ctx",
                    ),
                    "question": question,
                    "answer": answer,
                    "law_title": law_title or None,
                    "section": section or None,
                    "context_text": context_text,
                    "source_type": source_type,
                    "split": split,
                }
            )

    add_rows(row.get("positive_contexts") or [], source_type="positive")
    add_rows(row.get("hard_negative_contexts") or [], source_type="hard_negative")
    return out


def profile_split(split: str, rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    question_counts = Counter()
    context_counts = Counter()

    missing_section = 0
    missing_law_title = 0
    empty_context_text = 0
    rows_with_repeated_contexts = 0

    format_issues = {
        "double_space_contexts": 0,
        "raw_crlf_contexts": 0,
        "leading_or_trailing_whitespace_contexts": 0,
    }

    empty_hard_negative_context_rows = 0
    empty_hard_negative_answer_rows = 0

    for row in rows:
        q = row.get("question") or ""
        pa = row.get("positive_answer") or ""
        hna = row.get("hard_negative_answer") or ""
        if not clean_text(hna):
            empty_hard_negative_answer_rows += 1

        question_counts[clean_text(q)] += 1
        if len(row.get("hard_negative_contexts") or []) == 0:
            empty_hard_negative_context_rows += 1

        seen_in_row = set()
        for source_key in ("positive_contexts", "hard_negative_contexts"):
            for context in row.get(source_key) or []:
                text_raw = context.get("context") or ""
                text_clean = clean_text(text_raw)
                if not text_clean:
                    empty_context_text += 1
                    continue

                if "  " in text_raw:
                    format_issues["double_space_contexts"] += 1
                if "\r\n" in text_raw or "\r" in text_raw:
                    format_issues["raw_crlf_contexts"] += 1
                if text_raw != text_raw.strip():
                    format_issues["leading_or_trailing_whitespace_contexts"] += 1

                metadata = context.get("metadata") or {}
                law_title = clean_text(metadata.get("law_title") or "")
                section = clean_text(str(metadata.get("section") or ""))

                if not law_title:
                    missing_law_title += 1
                if not section:
                    missing_section += 1

                context_counts[text_clean] += 1
                if text_clean in seen_in_row:
                    rows_with_repeated_contexts += 1
                seen_in_row.add(text_clean)

    duplicate_questions = sum(c - 1 for c in question_counts.values() if c > 1)
    repeated_contexts = sum(c - 1 for c in context_counts.values() if c > 1)

    return {
        "split": split,
        "rows": len(rows),
        "fields": list(rows[0].keys()) if rows else [],
        "duplicate_question_rows": duplicate_questions,
        "unique_questions": len(question_counts),
        "missing_law_title_count": missing_law_title,
        "missing_section_count": missing_section,
        "empty_context_text_count": empty_context_text,
        "repeated_context_instances": repeated_contexts,
        "rows_with_repeated_contexts": rows_with_repeated_contexts,
        "empty_hard_negative_context_rows": empty_hard_negative_context_rows,
        "empty_hard_negative_answer_rows": empty_hard_negative_answer_rows,
        "format_issues": format_issues,
    }


def normalize_dataset() -> Dict[str, Any]:
    dataset = load_dataset(DATASET_NAME)

    raw_by_split: Dict[str, List[Dict[str, Any]]] = {}
    normalized_records: List[Dict[str, Any]] = []
    split_profiles: Dict[str, Any] = {}

    for split, split_ds in dataset.items():
        split_rows = [dict(row) for row in split_ds]
        raw_by_split[split] = split_rows
        split_profiles[split] = profile_split(split, split_rows)

        for idx, row in enumerate(split_rows):
            normalized_records.extend(to_normalized_rows(split, idx, row))

    # Global dedupe metrics in normalized output.
    normalized_id_counts = Counter(record["id"] for record in normalized_records)
    duplicate_normalized_ids = sum(v - 1 for v in normalized_id_counts.values() if v > 1)

    context_key_counts = Counter(
        (
            record["law_title"] or "",
            record["section"] or "",
            record["context_text"],
        )
        for record in normalized_records
    )
    repeated_context_triples = sum(v - 1 for v in context_key_counts.values() if v > 1)

    report = {
        "dataset_name": DATASET_NAME,
        "splits": split_profiles,
        "normalized_records": len(normalized_records),
        "duplicate_normalized_ids": duplicate_normalized_ids,
        "repeated_normalized_context_triples": repeated_context_triples,
        "normalized_schema": {
            "id": "string (stable hash)",
            "question": "string",
            "answer": "string (positive_answer)",
            "law_title": "string | null",
            "section": "string | null",
            "context_text": "string",
            "source_type": "positive | hard_negative",
            "split": "train | test",
        },
    }

    return {
        "normalized_records": normalized_records,
        "report": report,
    }


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        default="data/processed",
        help="Directory where normalized JSON and report files are written.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir)
    result = normalize_dataset()

    write_json(output_dir / "thai_niti_normalized.json", result["normalized_records"])
    write_json(output_dir / "dataset_profile_report.json", result["report"])

    print(f"Wrote {len(result['normalized_records'])} normalized records")
    print(f"Report: {(output_dir / 'dataset_profile_report.json').as_posix()}")
    print(f"Data: {(output_dir / 'thai_niti_normalized.json').as_posix()}")


if __name__ == "__main__":
    main()
