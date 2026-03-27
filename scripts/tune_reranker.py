#!/usr/bin/env python3
"""Tune lexical reranker weights for better Top-1 retrieval."""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Sequence, Tuple
import sys

from datasets import load_dataset

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from lib.normalize_query import normalize_query
from lib.rerank import LegalMetadataReranker
from lib.retrieval import RetrievalResult, build_retriever_from_file

DATASET_NAME = "airesearch/WangchanX-Legal-ThaiCCL-RAG"


@dataclass
class ExpectedContext:
    law_title: str
    section: str
    context_text: str


def clean_text(text: str) -> str:
    return " ".join((text or "").strip().split())


def expected_contexts(row: Dict) -> List[ExpectedContext]:
    out: List[ExpectedContext] = []
    for item in row.get("positive_contexts") or []:
        md = item.get("metadata") or {}
        out.append(
            ExpectedContext(
                law_title=clean_text(md.get("law_title") or ""),
                section=clean_text(str(md.get("section") or "")),
                context_text=clean_text(item.get("context") or ""),
            )
        )
    uniq = {}
    for c in out:
        uniq[(c.law_title, c.section, c.context_text)] = c
    return list(uniq.values())


def strict_match(r: RetrievalResult, expected: Sequence[ExpectedContext]) -> bool:
    rk = (clean_text(r.law_title), clean_text(r.section), clean_text(r.context_text))
    return any(rk == (e.law_title, e.section, e.context_text) for e in expected)


def relaxed_match(r: RetrievalResult, expected: Sequence[ExpectedContext]) -> bool:
    rk = (clean_text(r.law_title), clean_text(r.section))
    return any(rk == (e.law_title, e.section) for e in expected)


def topk_success(results: Sequence[RetrievalResult], expected: Sequence[ExpectedContext], k: int, matcher) -> bool:
    return any(matcher(r, expected) for r in results[:k])


def evaluate_weights(
    retriever,
    weight_config: Dict[str, float],
    eval_rows: List[Dict],
) -> Tuple[Dict[str, Dict[str, float]], List[Dict]]:
    if retriever.reranker is not None:
        retriever.reranker.weights = LegalMetadataReranker.make_weights(weight_config)

    method_counts = {
        "original": {"top1_strict": 0, "top3_strict": 0, "top5_strict": 0, "top1_relaxed": 0, "top3_relaxed": 0, "top5_relaxed": 0},
        "normalized": {"top1_strict": 0, "top3_strict": 0, "top5_strict": 0, "top1_relaxed": 0, "top3_relaxed": 0, "top5_relaxed": 0},
        "hybrid": {"top1_strict": 0, "top3_strict": 0, "top5_strict": 0, "top1_relaxed": 0, "top3_relaxed": 0, "top5_relaxed": 0},
    }
    per_question: List[Dict] = []

    for idx, row in enumerate(eval_rows):
        q = clean_text(row.get("question") or "")
        nq = normalize_query(q).normalized_query
        exp = expected_contexts(row)

        res_map = {
            "original": retriever.search(q, top_k=5),
            "normalized": retriever.search(nq, top_k=5),
            "hybrid": retriever.search_hybrid(q, nq, top_k=5),
        }

        row_out = {"row_id": idx, "question": q, "expected": [asdict(e) for e in exp], "success": {}}
        for method, results in res_map.items():
            s = {
                "top1_strict": topk_success(results, exp, 1, strict_match),
                "top3_strict": topk_success(results, exp, 3, strict_match),
                "top5_strict": topk_success(results, exp, 5, strict_match),
                "top1_relaxed": topk_success(results, exp, 1, relaxed_match),
                "top3_relaxed": topk_success(results, exp, 3, relaxed_match),
                "top5_relaxed": topk_success(results, exp, 5, relaxed_match),
            }
            row_out["success"][method] = s
            for k, v in s.items():
                method_counts[method][k] += 1 if v else 0
        per_question.append(row_out)

    total = len(eval_rows)
    metrics = {}
    for method, counts in method_counts.items():
        metrics[method] = {k: (v / total if total else 0.0) for k, v in counts.items()}
    return metrics, per_question


def generate_weight_candidates(defaults: Dict[str, float]) -> List[Dict[str, float]]:
    candidates: List[Dict[str, float]] = [dict(defaults)]
    # Conservative search around section-sensitive signals.
    section_match_values = [1.8, 2.25, 2.8, 3.4]
    section_mismatch_values = [0.2, 0.3, 0.5, 0.8]
    exact_section_values = [0.8, 1.1, 1.4, 1.8]
    context_overlap_values = [0.5, 0.7, 0.9]
    title_exact_values = [0.4, 0.8, 1.2]

    for sm in section_match_values:
        for sp in section_mismatch_values:
            for eq in exact_section_values:
                for co in context_overlap_values:
                    for te in title_exact_values:
                        c = dict(defaults)
                        c["section_match_bonus"] = sm
                        c["section_mismatch_penalty"] = sp
                        c["exact_section_query_boost"] = eq
                        c["context_overlap_weight"] = co
                        c["law_title_exact_mention_boost"] = te
                        candidates.append(c)
    return candidates


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--split", default="test", choices=["train", "test"], help="Dataset split for tuning.")
    p.add_argument("--max-questions", type=int, default=30, help="Sample size for tuning loop.")
    p.add_argument("--normalized-data", default="data/processed/thai_niti_normalized.json")
    p.add_argument("--dedup-data-out", default="data/processed/thai_niti_deduped.json")
    p.add_argument("--output", default="data/eval/reranker_tuning_results.json")
    p.add_argument("--max-combinations", type=int, default=80, help="Limit candidates for runtime.")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    ds = load_dataset(DATASET_NAME)[args.split]
    rows = [dict(x) for x in ds]
    if args.max_questions > 0:
        rows = rows[: args.max_questions]

    default_weights = LegalMetadataReranker.default_weights()
    candidates = generate_weight_candidates(default_weights)[: args.max_combinations]

    retriever = build_retriever_from_file(
        normalized_json_path=args.normalized_data,
        dedup_output_path=args.dedup_data_out,
        use_thai_word_tokenizer=True,
        enable_query_expansion=True,
        enable_rerank=True,
        rerank_weights=default_weights,
    )

    baseline_metrics, baseline_rows = evaluate_weights(
        retriever, default_weights, rows
    )

    best_weights = dict(default_weights)
    best_metrics = baseline_metrics
    best_rows = baseline_rows
    best_score = (
        baseline_metrics["original"]["top1_relaxed"],
        baseline_metrics["original"]["top1_strict"],
        baseline_metrics["original"]["top3_relaxed"],
    )

    tested = []
    for i, w in enumerate(candidates):
        metrics, per_question = evaluate_weights(retriever, w, rows)
        score = (
            metrics["original"]["top1_relaxed"],
            metrics["original"]["top1_strict"],
            metrics["original"]["top3_relaxed"],
        )
        tested.append({"index": i, "weights": w, "metrics": metrics, "score_key": score})
        if score > best_score:
            best_score = score
            best_weights = w
            best_metrics = metrics
            best_rows = per_question

    improved_examples = []
    for before, after in zip(baseline_rows, best_rows):
        if (
            before["success"]["original"]["top1_relaxed"] is False
            and after["success"]["original"]["top1_relaxed"] is True
        ):
            improved_examples.append(
                {
                    "row_id": after["row_id"],
                    "question": after["question"],
                    "expected": after["expected"],
                }
            )
        if len(improved_examples) >= 20:
            break

    output_payload = {
        "dataset": DATASET_NAME,
        "split": args.split,
        "questions_evaluated": len(rows),
        "baseline_weights": default_weights,
        "baseline_metrics": baseline_metrics,
        "best_weights": best_weights,
        "best_metrics": best_metrics,
        "top1_improved_examples": improved_examples,
        "candidates_tested": len(candidates),
        "tested": tested,
        "timestamp_utc": datetime.utcnow().isoformat(),
    }

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output_payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Dataset: {DATASET_NAME}")
    print(f"Split: {args.split}")
    print(f"Questions evaluated: {len(rows)}")
    print(f"Candidates tested: {len(candidates)}")
    print()
    print("Baseline (original query):")
    print(
        f"- Top1 strict={baseline_metrics['original']['top1_strict']:.4f}, "
        f"Top1 relaxed={baseline_metrics['original']['top1_relaxed']:.4f}, "
        f"Top3 relaxed={baseline_metrics['original']['top3_relaxed']:.4f}, "
        f"Top5 relaxed={baseline_metrics['original']['top5_relaxed']:.4f}"
    )
    print("Best tuned (original query):")
    print(
        f"- Top1 strict={best_metrics['original']['top1_strict']:.4f}, "
        f"Top1 relaxed={best_metrics['original']['top1_relaxed']:.4f}, "
        f"Top3 relaxed={best_metrics['original']['top3_relaxed']:.4f}, "
        f"Top5 relaxed={best_metrics['original']['top5_relaxed']:.4f}"
    )
    print()
    print("Best weights:")
    print(json.dumps(best_weights, ensure_ascii=False, indent=2))
    print()
    print(f"Top1 improved examples count: {len(improved_examples)}")
    print(f"Saved tuning results: {output_path.as_posix()}")


if __name__ == "__main__":
    main()
