#!/usr/bin/env python3
"""Inspect and normalize Open Law Data Thailand corpora."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from datasets import load_dataset


DATASET_SPECS = [
    {
        "dataset_id": "open-law-data-thailand/soc-ratchakitcha",
        "corpus": "gazette",
        "default_source_type": "royal_gazette",
    },
    {
        "dataset_id": "open-law-data-thailand/ocs-krisdika",
        "corpus": "krisdika",
        "default_source_type": "regulatory_reference",
    },
]


def clean_text(value: Any) -> str:
    text = "" if value is None else str(value)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def stable_id(parts: Iterable[str]) -> str:
    h = hashlib.sha1("||".join(parts).encode("utf-8")).hexdigest()[:16]
    return f"openlaw_{h}"


def first_non_empty(row: Dict[str, Any], keys: List[str]) -> str:
    for key in keys:
        if key in row:
            val = clean_text(row.get(key))
            if val:
                return val
    return ""


def infer_context_text(row: Dict[str, Any]) -> str:
    candidates = [
        "context_text",
        "content",
        "text",
        "body",
        "article_text",
        "full_text",
        "document_text",
        "description",
        "summary",
    ]
    text = first_non_empty(row, candidates)
    if text:
        return text
    # Fallback: join long string fields.
    parts = []
    for k, v in row.items():
        if isinstance(v, str):
            t = clean_text(v)
            if len(t) >= 120:
                parts.append(t)
    return clean_text("\n\n".join(parts))


@dataclass
class DatasetRunResult:
    dataset_id: str
    corpus: str
    success: bool
    splits: Dict[str, int]
    fields: List[str]
    sampled_rows: int
    normalized_rows: int
    duplicate_rows_removed: int
    missing_title_count: int
    missing_context_count: int
    missing_date_count: int
    missing_url_count: int
    notes: List[str]
    error: Optional[str] = None


def normalize_rows(
    dataset_id: str,
    corpus: str,
    default_source_type: str,
    split: str,
    rows: List[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
    out: List[Dict[str, Any]] = []
    stats = {
        "missing_title_count": 0,
        "missing_context_count": 0,
        "missing_date_count": 0,
        "missing_url_count": 0,
    }
    for i, row in enumerate(rows):
        title = first_non_empty(row, ["title", "document_title", "name", "subject", "topic"])
        law_title = first_non_empty(row, ["law_title", "act_title", "title", "law_name"])
        section = first_non_empty(row, ["section", "article", "article_no", "clause", "มาตรา"])
        category = first_non_empty(row, ["category", "type", "document_type", "group"])
        publication_date = first_non_empty(
            row,
            ["publication_date", "date", "published_date", "issued_date", "announce_date"],
        )
        agency = first_non_empty(row, ["agency", "issuer", "ministry", "organization"])
        context_text = infer_context_text(row)
        source_pdf = first_non_empty(row, ["source_pdf", "pdf_url", "pdf", "file_url"])
        url = first_non_empty(row, ["url", "source_url", "link", "document_url"])
        source_type = first_non_empty(row, ["source_type", "document_type", "type"]) or default_source_type

        if not title:
            stats["missing_title_count"] += 1
        if not context_text:
            stats["missing_context_count"] += 1
        if not publication_date:
            stats["missing_date_count"] += 1
        if not url:
            stats["missing_url_count"] += 1

        out.append(
            {
                "id": stable_id([dataset_id, split, str(i), title, law_title, section, context_text[:120]]),
                "corpus": corpus,
                "source_dataset": dataset_id,
                "source_type": source_type,
                "title": title or None,
                "law_title": law_title or None,
                "section": section or None,
                "category": category or None,
                "publication_date": publication_date or None,
                "agency": agency or None,
                "context_text": context_text or "",
                "source_pdf": source_pdf or None,
                "url": url or None,
                "split": split,
            }
        )
    return out, stats


def run_dataset(
    dataset_id: str,
    corpus: str,
    default_source_type: str,
    hf_token: Optional[str],
    sample_limit_per_split: int,
) -> Tuple[DatasetRunResult, List[Dict[str, Any]]]:
    notes: List[str] = []
    all_normalized: List[Dict[str, Any]] = []
    try:
        ds = load_dataset(dataset_id, token=hf_token)
    except Exception as e:
        return (
            DatasetRunResult(
                dataset_id=dataset_id,
                corpus=corpus,
                success=False,
                splits={},
                fields=[],
                sampled_rows=0,
                normalized_rows=0,
                duplicate_rows_removed=0,
                missing_title_count=0,
                missing_context_count=0,
                missing_date_count=0,
                missing_url_count=0,
                notes=["Dataset could not be downloaded. Check HF_TOKEN or dataset access permissions."],
                error=str(e),
            ),
            [],
        )

    splits = list(ds.keys())
    fields = list(ds[splits[0]].features.keys()) if splits else []
    split_sizes = {split: len(ds[split]) for split in splits}

    sampled_rows = 0
    missing_title = 0
    missing_context = 0
    missing_date = 0
    missing_url = 0

    for split in splits:
        rows: List[Dict[str, Any]] = []
        take_n = min(sample_limit_per_split, len(ds[split])) if sample_limit_per_split > 0 else len(ds[split])
        for i in range(take_n):
            rows.append(dict(ds[split][i]))
        sampled_rows += len(rows)
        normalized, stats = normalize_rows(dataset_id, corpus, default_source_type, split, rows)
        all_normalized.extend(normalized)
        missing_title += stats["missing_title_count"]
        missing_context += stats["missing_context_count"]
        missing_date += stats["missing_date_count"]
        missing_url += stats["missing_url_count"]

    # Deduplicate by source identity shape.
    seen = set()
    deduped: List[Dict[str, Any]] = []
    for row in all_normalized:
        key = (
            row["source_dataset"],
            row["title"] or "",
            row["law_title"] or "",
            row["section"] or "",
            row["context_text"],
            row["url"] or "",
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(row)

    duplicate_rows_removed = len(all_normalized) - len(deduped)
    all_normalized = deduped

    notes.extend(
        [
            f"Corpus label assigned: {corpus}",
            f"Source type fallback: {default_source_type}",
            "Deduplication key: (source_dataset, title, law_title, section, context_text, url)",
        ]
    )
    return (
        DatasetRunResult(
            dataset_id=dataset_id,
            corpus=corpus,
            success=True,
            splits=split_sizes,
            fields=fields,
            sampled_rows=sampled_rows,
            normalized_rows=len(all_normalized),
            duplicate_rows_removed=duplicate_rows_removed,
            missing_title_count=missing_title,
            missing_context_count=missing_context,
            missing_date_count=missing_date,
            missing_url_count=missing_url,
            notes=notes,
        ),
        all_normalized,
    )


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--output-dir",
        default="data/processed",
        help="Where normalized JSON and profile report are written.",
    )
    p.add_argument(
        "--sample-limit-per-split",
        type=int,
        default=5000,
        help="Max rows per split to process (0 for all rows).",
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    hf_token = os.environ.get("HF_TOKEN")
    run_results: List[DatasetRunResult] = []
    combined_rows: List[Dict[str, Any]] = []

    for spec in DATASET_SPECS:
        result, rows = run_dataset(
            dataset_id=spec["dataset_id"],
            corpus=spec["corpus"],
            default_source_type=spec["default_source_type"],
            hf_token=hf_token,
            sample_limit_per_split=args.sample_limit_per_split,
        )
        run_results.append(result)
        combined_rows.extend(rows)

    combined_path = output_dir / "open_law_normalized.json"
    profile_path = output_dir / "open_law_profile_report.json"

    combined_path.write_text(json.dumps(combined_rows, ensure_ascii=False, indent=2), encoding="utf-8")
    profile_payload = {
        "generated_at_utc": datetime.utcnow().isoformat(),
        "target_schema": [
            "id",
            "source_dataset",
            "source_type",
            "title",
            "law_title",
            "section",
            "category",
            "publication_date",
            "agency",
            "context_text",
            "source_pdf",
            "url",
            "split",
            "corpus",
        ],
        "runs": [r.__dict__ for r in run_results],
        "combined_rows": len(combined_rows),
        "global_notes": [
            "Corpus separation preserved with `corpus` field.",
            "Use corpus='ccc' for existing Thai Civil Code records, 'gazette' for soc-ratchakitcha, and 'krisdika' for ocs-krisdika.",
            "If access errors occur, set HF_TOKEN with dataset access permissions and rerun.",
        ],
    }
    profile_path.write_text(json.dumps(profile_payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Wrote normalized rows: {len(combined_rows)}")
    print(f"Normalized file: {combined_path.as_posix()}")
    print(f"Profile report: {profile_path.as_posix()}")
    for r in run_results:
        status = "ok" if r.success else "error"
        print(f"- {r.dataset_id}: {status}, normalized_rows={r.normalized_rows}, sampled_rows={r.sampled_rows}")


if __name__ == "__main__":
    main()
