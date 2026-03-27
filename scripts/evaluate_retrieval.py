#!/usr/bin/env python3
"""Evaluate Thai legal retrieval: original vs normalized vs hybrid."""

from __future__ import annotations

import argparse
import csv
import json
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Tuple
import sys

from datasets import load_dataset

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from lib.normalize_query import normalize_query
from lib.retrieval import RetrievalResult, build_retriever_from_file
from lib.semantic_rerank import SemanticRerankConfig


DATASET_NAME = "airesearch/WangchanX-Legal-ThaiCCL-RAG"


@dataclass
class ExpectedContext:
    law_title: str
    section: str
    context_text: str


@dataclass
class MethodSuccess:
    top1_strict: bool
    top3_strict: bool
    top5_strict: bool
    top1_relaxed: bool
    top3_relaxed: bool
    top5_relaxed: bool


def clean_text(text: str) -> str:
    return " ".join((text or "").strip().split())


def normalize_expected_contexts(row: Dict) -> List[ExpectedContext]:
    contexts: List[ExpectedContext] = []
    for item in row.get("positive_contexts") or []:
        metadata = item.get("metadata") or {}
        contexts.append(
            ExpectedContext(
                law_title=clean_text(metadata.get("law_title") or ""),
                section=clean_text(str(metadata.get("section") or "")),
                context_text=clean_text(item.get("context") or ""),
            )
        )
    # Deduplicate in-case of repeated positives.
    unique = {}
    for c in contexts:
        unique[(c.law_title, c.section, c.context_text)] = c
    return list(unique.values())


def result_to_dict(r: RetrievalResult) -> Dict:
    return {
        "rank": r.rank,
        "score": r.score,
        "law_title": clean_text(r.law_title),
        "section": clean_text(r.section),
        "context_text": clean_text(r.context_text),
        "split": r.split,
    }


def strict_match(result: RetrievalResult, expected: Sequence[ExpectedContext]) -> bool:
    r_key = (
        clean_text(result.law_title),
        clean_text(result.section),
        clean_text(result.context_text),
    )
    for e in expected:
        e_key = (e.law_title, e.section, e.context_text)
        if r_key == e_key:
            return True
    return False


def relaxed_match(result: RetrievalResult, expected: Sequence[ExpectedContext]) -> bool:
    r_key = (clean_text(result.law_title), clean_text(result.section))
    for e in expected:
        if r_key == (e.law_title, e.section):
            return True
    return False


def topk_success(
    results: Sequence[RetrievalResult],
    expected: Sequence[ExpectedContext],
    k: int,
    matcher,
) -> bool:
    for r in results[:k]:
        if matcher(r, expected):
            return True
    return False


def evaluate_method(results: Sequence[RetrievalResult], expected: Sequence[ExpectedContext]) -> MethodSuccess:
    return MethodSuccess(
        top1_strict=topk_success(results, expected, 1, strict_match),
        top3_strict=topk_success(results, expected, 3, strict_match),
        top5_strict=topk_success(results, expected, 5, strict_match),
        top1_relaxed=topk_success(results, expected, 1, relaxed_match),
        top3_relaxed=topk_success(results, expected, 3, relaxed_match),
        top5_relaxed=topk_success(results, expected, 5, relaxed_match),
    )


def summarize_metrics(method_rows: Iterable[MethodSuccess], total: int) -> Dict[str, float]:
    sums = {
        "top1_strict": 0,
        "top3_strict": 0,
        "top5_strict": 0,
        "top1_relaxed": 0,
        "top3_relaxed": 0,
        "top5_relaxed": 0,
    }
    for row in method_rows:
        for key in sums.keys():
            sums[key] += 1 if getattr(row, key) else 0
    if total == 0:
        return {k: 0.0 for k in sums.keys()}
    return {k: v / total for k, v in sums.items()}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--normalized-data",
        default="data/processed/thai_niti_normalized.json",
        help="Path to normalized local data (for building retriever index).",
    )
    parser.add_argument(
        "--dedup-data-out",
        default="data/processed/thai_niti_deduped.json",
        help="Optional deduped output path used by retriever.",
    )
    parser.add_argument(
        "--split",
        default="test",
        choices=["train", "test", "all"],
        help="Dataset split used for evaluation.",
    )
    parser.add_argument(
        "--max-questions",
        type=int,
        default=0,
        help="Optional cap for faster iteration (0 means all).",
    )
    parser.add_argument(
        "--output-dir",
        default="data/eval",
        help="Directory for machine-readable evaluation outputs.",
    )
    parser.add_argument(
        "--retrieval-profile",
        default="improved",
        choices=["baseline", "improved", "semantic"],
        help="baseline=lexical only, improved=lexical+metadata, semantic=lexical+metadata+semantic rerank.",
    )
    parser.add_argument(
        "--semantic-model",
        default="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
        help="Sentence-transformers model name for semantic reranking profile.",
    )
    parser.add_argument(
        "--lexical-weight",
        type=float,
        default=0.60,
        help="Lexical score weight for semantic profile (default 0.60).",
    )
    parser.add_argument(
        "--semantic-weight",
        type=float,
        default=0.40,
        help="Semantic score weight for semantic profile (default 0.40).",
    )
    parser.add_argument(
        "--candidate-pool",
        type=int,
        default=20,
        help="Lexical candidate pool size for second-stage semantic rerank.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    profile = args.retrieval_profile
    use_improved = profile in {"improved", "semantic"}
    use_semantic = profile == "semantic"
    semantic_cfg = (
        SemanticRerankConfig(
            model_name=args.semantic_model,
            lexical_weight=args.lexical_weight,
            semantic_weight=args.semantic_weight,
        )
        if use_semantic
        else None
    )

    effective_config = {
        "use_thai_word_tokenizer": use_improved,
        "enable_query_expansion": use_improved,
        "enable_rerank": use_improved,
        "enable_semantic_rerank": use_semantic,
        "semantic_model": semantic_cfg.model_name if semantic_cfg else None,
        "lexical_weight": semantic_cfg.lexical_weight if semantic_cfg else None,
        "semantic_weight": semantic_cfg.semantic_weight if semantic_cfg else None,
        "candidate_pool": args.candidate_pool if use_semantic else None,
    }

    print("Retrieval config:")
    print(json.dumps(effective_config, ensure_ascii=False, indent=2))
    print()

    retriever = build_retriever_from_file(
        normalized_json_path=args.normalized_data,
        dedup_output_path=args.dedup_data_out,
        use_thai_word_tokenizer=use_improved,
        enable_query_expansion=use_improved,
        enable_rerank=use_improved,
        enable_semantic_rerank=use_semantic,
        semantic_rerank_config=semantic_cfg,
        semantic_candidate_pool=args.candidate_pool,
    )

    hf_dataset = load_dataset(DATASET_NAME)
    if args.split == "all":
        eval_rows = [dict(x) for split in ("train", "test") for x in hf_dataset[split]]
        eval_split_name = "all"
    else:
        eval_rows = [dict(x) for x in hf_dataset[args.split]]
        eval_split_name = args.split

    if args.max_questions > 0:
        eval_rows = eval_rows[: args.max_questions]

    detailed_rows: List[Dict] = []
    orig_successes: List[MethodSuccess] = []
    norm_successes: List[MethodSuccess] = []
    hybrid_successes: List[MethodSuccess] = []

    for idx, row in enumerate(eval_rows):
        question = clean_text(row.get("question") or "")
        expected = normalize_expected_contexts(row)
        normalized = normalize_query(question)

        original_results = retriever.search(question, top_k=5)
        normalized_results = retriever.search(normalized.normalized_query, top_k=5)
        hybrid_results = retriever.search_hybrid(
            original_query=question,
            normalized_query=normalized.normalized_query,
            top_k=5,
        )

        orig_eval = evaluate_method(original_results, expected)
        norm_eval = evaluate_method(normalized_results, expected)
        hybrid_eval = evaluate_method(hybrid_results, expected)

        orig_successes.append(orig_eval)
        norm_successes.append(norm_eval)
        hybrid_successes.append(hybrid_eval)

        detailed_rows.append(
            {
                "row_id": idx,
                "question": question,
                "normalized_query": normalized.normalized_query,
                "normalization_applied": normalized.meaningful_change,
                "expected_contexts": [asdict(e) for e in expected],
                "expected_law_title": expected[0].law_title if expected else "",
                "expected_section": expected[0].section if expected else "",
                "original": {
                    "success": asdict(orig_eval),
                    "top_results": [result_to_dict(r) for r in original_results],
                },
                "normalized": {
                    "success": asdict(norm_eval),
                    "top_results": [result_to_dict(r) for r in normalized_results],
                },
                "hybrid": {
                    "success": asdict(hybrid_eval),
                    "top_results": [result_to_dict(r) for r in hybrid_results],
                },
            }
        )

    total = len(detailed_rows)
    summary = {
        "dataset": DATASET_NAME,
        "split": eval_split_name,
        "retrieval_profile": profile,
        "retrieval_config": effective_config,
        "questions_evaluated": total,
        "metrics": {
            "original": summarize_metrics(orig_successes, total),
            "normalized": summarize_metrics(norm_successes, total),
            "hybrid": summarize_metrics(hybrid_successes, total),
        },
    }

    # Normalization impact stats.
    improved_by_normalized_top3_relaxed = 0
    improved_by_hybrid_top3_relaxed = 0
    worsened_by_normalized_top3_relaxed = 0
    worsened_by_hybrid_top3_relaxed = 0
    for row in detailed_rows:
        o = row["original"]["success"]["top3_relaxed"]
        n = row["normalized"]["success"]["top3_relaxed"]
        h = row["hybrid"]["success"]["top3_relaxed"]
        if (not o) and n:
            improved_by_normalized_top3_relaxed += 1
        if (not o) and h:
            improved_by_hybrid_top3_relaxed += 1
        if o and (not n):
            worsened_by_normalized_top3_relaxed += 1
        if o and (not h):
            worsened_by_hybrid_top3_relaxed += 1

    summary["normalization_impact_top3_relaxed"] = {
        "improved_by_normalized_vs_original": improved_by_normalized_top3_relaxed,
        "improved_by_hybrid_vs_original": improved_by_hybrid_top3_relaxed,
        "worsened_by_normalized_vs_original": worsened_by_normalized_top3_relaxed,
        "worsened_by_hybrid_vs_original": worsened_by_hybrid_top3_relaxed,
    }

    # Error analysis buckets.
    improved_examples = []
    failed_examples = []
    ambiguous_examples = []
    for row in detailed_rows:
        o = row["original"]["success"]["top3_relaxed"]
        n = row["normalized"]["success"]["top3_relaxed"]
        h = row["hybrid"]["success"]["top3_relaxed"]
        is_ambiguous = len(row["expected_contexts"]) > 1

        if (not o) and (n or h) and len(improved_examples) < 25:
            improved_examples.append(row)
        if (not o) and (not n) and (not h) and len(failed_examples) < 25:
            failed_examples.append(row)
        if is_ambiguous and len(ambiguous_examples) < 25:
            ambiguous_examples.append(row)

    analysis_report = {
        "improved_examples_original_failed_but_normalized_or_hybrid_succeeded": improved_examples,
        "still_failed_examples": failed_examples,
        "possible_ambiguity_examples": ambiguous_examples,
    }

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    summary_path = output_dir / f"retrieval_eval_summary_{eval_split_name}_{profile}_{timestamp}.json"
    details_path = output_dir / f"retrieval_eval_details_{eval_split_name}_{profile}_{timestamp}.json"
    analysis_path = output_dir / f"retrieval_eval_error_analysis_{eval_split_name}_{profile}_{timestamp}.json"
    csv_path = output_dir / f"retrieval_eval_table_{eval_split_name}_{profile}_{timestamp}.csv"

    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    details_path.write_text(json.dumps(detailed_rows, ensure_ascii=False, indent=2), encoding="utf-8")
    analysis_path.write_text(json.dumps(analysis_report, ensure_ascii=False, indent=2), encoding="utf-8")

    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "row_id",
                "question",
                "normalized_query",
                "expected_law_title",
                "expected_section",
                "original_top1_relaxed",
                "original_top3_relaxed",
                "original_top5_relaxed",
                "normalized_top1_relaxed",
                "normalized_top3_relaxed",
                "normalized_top5_relaxed",
                "hybrid_top1_relaxed",
                "hybrid_top3_relaxed",
                "hybrid_top5_relaxed",
            ],
        )
        writer.writeheader()
        for row in detailed_rows:
            writer.writerow(
                {
                    "row_id": row["row_id"],
                    "question": row["question"],
                    "normalized_query": row["normalized_query"],
                    "expected_law_title": row["expected_law_title"],
                    "expected_section": row["expected_section"],
                    "original_top1_relaxed": row["original"]["success"]["top1_relaxed"],
                    "original_top3_relaxed": row["original"]["success"]["top3_relaxed"],
                    "original_top5_relaxed": row["original"]["success"]["top5_relaxed"],
                    "normalized_top1_relaxed": row["normalized"]["success"]["top1_relaxed"],
                    "normalized_top3_relaxed": row["normalized"]["success"]["top3_relaxed"],
                    "normalized_top5_relaxed": row["normalized"]["success"]["top5_relaxed"],
                    "hybrid_top1_relaxed": row["hybrid"]["success"]["top1_relaxed"],
                    "hybrid_top3_relaxed": row["hybrid"]["success"]["top3_relaxed"],
                    "hybrid_top5_relaxed": row["hybrid"]["success"]["top5_relaxed"],
                }
            )

    print(f"Dataset: {DATASET_NAME}")
    print(f"Split: {eval_split_name}")
    print(f"Profile: {profile}")
    print(f"Questions evaluated: {total}")
    print()
    for method in ("original", "normalized", "hybrid"):
        metrics = summary["metrics"][method]
        print(
            f"{method:>10} | "
            f"Top1 strict={metrics['top1_strict']:.4f}, "
            f"Top3 strict={metrics['top3_strict']:.4f}, "
            f"Top5 strict={metrics['top5_strict']:.4f} | "
            f"Top1 relaxed={metrics['top1_relaxed']:.4f}, "
            f"Top3 relaxed={metrics['top3_relaxed']:.4f}, "
            f"Top5 relaxed={metrics['top5_relaxed']:.4f}"
        )
    print()
    impact = summary["normalization_impact_top3_relaxed"]
    print("Normalization impact (Top-3 relaxed, vs original):")
    print(f"- improved by normalized: {impact['improved_by_normalized_vs_original']}")
    print(f"- improved by hybrid:     {impact['improved_by_hybrid_vs_original']}")
    print(f"- worsened by normalized: {impact['worsened_by_normalized_vs_original']}")
    print(f"- worsened by hybrid:     {impact['worsened_by_hybrid_vs_original']}")
    print()
    print(f"Summary JSON: {summary_path.as_posix()}")
    print(f"Details JSON: {details_path.as_posix()}")
    print(f"Analysis JSON: {analysis_path.as_posix()}")
    print(f"CSV table: {csv_path.as_posix()}")


if __name__ == "__main__":
    main()
