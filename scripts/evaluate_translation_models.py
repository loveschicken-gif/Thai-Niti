#!/usr/bin/env python3
"""Evaluate Thai legal -> English translation models for product baseline."""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from huggingface_hub import InferenceClient
from huggingface_hub import HfApi, hf_hub_download
from peft import PeftConfig, PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline


MODELS = [
    "Charatrit/scb10x_llama-3-typhoon-v1.5-8b-instruct_Thai_to_English_KamMuang",
    "ChayakornP/Thai_to_English_KamMuang_Qwen3-8B",
    "ChayakornP/Thai_to_English_KamMuang_Qwen2-7B",
]

PROMPT_TMPL = """You are a legal translator.
Translate the following Thai legal text into clear, formal English.
Rules:
- Keep legal meaning faithful; do not simplify away obligations/conditions.
- Keep law title names and section numbers.
- Do not add legal advice.
- Output translation only.

Thai text:
{text}
"""


@dataclass
class Snippet:
    id: str
    snippet_type: str
    thai_text: str


def clean_text(text: str) -> str:
    text = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def build_test_set(normalized_path: Path, limit: int = 24) -> List[Snippet]:
    rows = json.loads(normalized_path.read_text(encoding="utf-8"))
    positives = [r for r in rows if r.get("source_type") == "positive"]

    snippets: List[Snippet] = []
    used = set()

    # 1) law titles
    for r in positives:
        law = clean_text(r.get("law_title") or "")
        if law and law not in used:
            snippets.append(Snippet(id=f"title_{len(snippets)+1}", snippet_type="law_title", thai_text=law))
            used.add(law)
        if len([s for s in snippets if s.snippet_type == "law_title"]) >= 6:
            break

    # 2) section headings
    for r in positives:
        law = clean_text(r.get("law_title") or "")
        sec = clean_text(r.get("section") or "")
        if law and sec:
            txt = f"{law} มาตรา {sec}"
            if txt not in used:
                snippets.append(Snippet(id=f"sec_{len(snippets)+1}", snippet_type="section_heading", thai_text=txt))
                used.add(txt)
        if len([s for s in snippets if s.snippet_type == "section_heading"]) >= 6:
            break

    # 3) short provisions
    for r in positives:
        ctx = clean_text(r.get("context_text") or "")
        if 80 <= len(ctx) <= 260 and ctx not in used:
            snippets.append(Snippet(id=f"short_{len(snippets)+1}", snippet_type="short_provision", thai_text=ctx))
            used.add(ctx)
        if len([s for s in snippets if s.snippet_type == "short_provision"]) >= 6:
            break

    # 4) regulatory-like announcement titles (heuristic contains ประกาศ/ธนาคารแห่งประเทศไทย)
    for r in positives:
        ctx = clean_text(r.get("context_text") or "")
        if ("ประกาศ" in ctx or "ราชกิจจานุเบกษา" in ctx) and len(ctx) <= 260 and ctx not in used:
            snippets.append(
                Snippet(id=f"ann_{len(snippets)+1}", snippet_type="regulatory_announcement", thai_text=ctx)
            )
            used.add(ctx)
        if len([s for s in snippets if s.snippet_type == "regulatory_announcement"]) >= 3:
            break

    # 5) longer passages
    for r in positives:
        ctx = clean_text(r.get("context_text") or "")
        if len(ctx) >= 700 and ctx not in used:
            snippets.append(Snippet(id=f"long_{len(snippets)+1}", snippet_type="long_passage", thai_text=ctx))
            used.add(ctx)
        if len([s for s in snippets if s.snippet_type == "long_passage"]) >= 4:
            break

    return snippets[:limit]


def translate_with_hf_inference(model_id: str, thai_text: str, hf_token: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    prompt = PROMPT_TMPL.format(text=thai_text)
    try:
        client = InferenceClient(model=model_id, token=hf_token)
        out = client.text_generation(
            prompt=prompt,
            max_new_tokens=420,
            temperature=0.1,
            top_p=0.9,
        )
        return clean_text(out), None
    except Exception as e:
        msg = str(e).strip() or repr(e)
        return None, msg


_LOCAL_GENERATORS: Dict[str, Any] = {}
_LOCAL_LOAD_ERRORS: Dict[str, str] = {}

BASE_MODEL_OVERRIDES = {
    # Adapter config points to unsloth bnb bases; use public full bases for local fallback.
    "ChayakornP/Thai_to_English_KamMuang_Qwen2-7B": "Qwen/Qwen2-7B-Instruct",
    "ChayakornP/Thai_to_English_KamMuang_Qwen3-8B": "Qwen/Qwen3-8B",
    "Charatrit/scb10x_llama-3-typhoon-v1.5-8b-instruct_Thai_to_English_KamMuang": "typhoon-ai/llama3.1-typhoon2-8b-instruct",
}

_MODEL_DEBUG: Dict[str, Dict[str, Any]] = {}


def inspect_model_type(model_id: str) -> Dict[str, Any]:
    api = HfApi()
    files = api.list_repo_files(model_id)
    is_adapter = "adapter_config.json" in files and "adapter_model.safetensors" in files
    base_model = None
    if is_adapter:
        try:
            cfg = json.loads(Path(hf_hub_download(model_id, "adapter_config.json")).read_text())
            base_model = cfg.get("base_model_name_or_path")
        except Exception:
            base_model = None
    return {
        "model_id": model_id,
        "is_adapter": is_adapter,
        "base_model_name_or_path": base_model,
        "files_count": len(files),
    }


def resolve_base_model(model_id: str, adapter_base: Optional[str]) -> str:
    return BASE_MODEL_OVERRIDES.get(model_id) or (adapter_base or model_id)


def _load_local_generator(model_id: str):
    if model_id in _LOCAL_GENERATORS:
        return _LOCAL_GENERATORS[model_id], None
    if model_id in _LOCAL_LOAD_ERRORS:
        return None, _LOCAL_LOAD_ERRORS[model_id]
    try:
        info = inspect_model_type(model_id)
        _MODEL_DEBUG[model_id] = info

        if info["is_adapter"]:
            adapter_base = info.get("base_model_name_or_path")
            base_model = resolve_base_model(model_id, adapter_base)
            tokenizer = AutoTokenizer.from_pretrained(base_model, trust_remote_code=True)
            model = AutoModelForCausalLM.from_pretrained(base_model, trust_remote_code=True)
            model = PeftModel.from_pretrained(model, model_id)
            model = model.merge_and_unload()
            info["load_mode"] = "adapter_merge"
            info["resolved_base_model"] = base_model
        else:
            tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)
            model = AutoModelForCausalLM.from_pretrained(model_id, trust_remote_code=True)
            info["load_mode"] = "standalone"
            info["resolved_base_model"] = model_id

        gen = pipeline(
            "text-generation",
            model=model,
            tokenizer=tokenizer,
        )
        _LOCAL_GENERATORS[model_id] = gen
        return gen, None
    except Exception as e:
        msg = f"local_load_error: {str(e).strip() or repr(e)}"
        _LOCAL_LOAD_ERRORS[model_id] = msg
        if model_id not in _MODEL_DEBUG:
            _MODEL_DEBUG[model_id] = {"model_id": model_id}
        _MODEL_DEBUG[model_id]["load_error"] = msg
        return None, msg


def translate_with_transformers_local(model_id: str, thai_text: str) -> Tuple[Optional[str], Optional[str]]:
    prompt = PROMPT_TMPL.format(text=thai_text)
    gen, load_err = _load_local_generator(model_id)
    if load_err:
        return None, load_err
    try:
        output = gen(
            prompt,
            max_new_tokens=420,
            do_sample=False,
            temperature=0.1,
            top_p=0.9,
            return_full_text=False,
        )
        if isinstance(output, list) and output:
            text = output[0].get("generated_text", "")
            return clean_text(text), None
        return None, "local_generation_error: empty output"
    except Exception as e:
        return None, f"local_generation_error: {str(e).strip() or repr(e)}"


def score_translation(thai_text: str, en_text: str) -> Dict[str, Any]:
    thai = clean_text(thai_text)
    en = clean_text(en_text)
    if not en:
        return {
            "faithfulness": 0.0,
            "legal_tone": 0.0,
            "clarity": 0.0,
            "oversimplified": True,
            "safe_for_convenience_layer": False,
            "overall": 0.0,
        }

    # Faithfulness heuristics: section number & key legal tokens.
    thai_section = re.findall(r"(?:มาตรา|ม\.)\s*([0-9]{1,4})", thai)
    en_section_hit = 0
    for s in thai_section:
        if re.search(rf"(Section|section)\s*{re.escape(s)}", en) or re.search(rf"\b{re.escape(s)}\b", en):
            en_section_hit += 1
    section_score = (en_section_hit / max(1, len(thai_section))) if thai_section else 0.8

    key_pairs = [
        ("พระราชบัญญัติ", ["Act", "B.E.", "law"]),
        ("ธนาคารแห่งประเทศไทย", ["Bank of Thailand"]),
        ("ประกาศ", ["Notification", "Announcement", "published"]),
        ("ใบอนุญาต", ["license", "licence"]),
        ("ผู้ถือหุ้น", ["shareholder"]),
    ]
    key_hits = 0
    key_total = 0
    for th, ens in key_pairs:
        if th in thai:
            key_total += 1
            if any(x.lower() in en.lower() for x in ens):
                key_hits += 1
    keyword_score = (key_hits / max(1, key_total)) if key_total else 0.8
    faithfulness = round(5.0 * (0.55 * section_score + 0.45 * keyword_score), 2)

    tone_terms = ["shall", "pursuant", "section", "act", "minister", "bank", "license", "regulation"]
    tone_hits = sum(1 for t in tone_terms if t in en.lower())
    legal_tone = round(min(5.0, 2.0 + tone_hits * 0.45), 2)

    en_words = re.findall(r"[A-Za-z]+", en)
    clarity = 4.0
    if len(en_words) < 6:
        clarity = 2.0
    elif len(en_words) > 220:
        clarity = 3.5
    clarity = round(clarity, 2)

    thai_len = max(1, len(thai))
    en_len = len(en)
    ratio = en_len / thai_len
    oversimplified = ratio < 0.35

    overall = round((0.45 * faithfulness) + (0.25 * legal_tone) + (0.30 * clarity), 2)
    if oversimplified:
        overall = round(max(0.0, overall - 0.8), 2)

    safe = overall >= 3.2 and faithfulness >= 3.0
    return {
        "faithfulness": faithfulness,
        "legal_tone": legal_tone,
        "clarity": clarity,
        "oversimplified": oversimplified,
        "safe_for_convenience_layer": safe,
        "overall": overall,
    }


def aggregate(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    by_model: Dict[str, List[Dict[str, Any]]] = {}
    for r in records:
        by_model.setdefault(r["model_id"], []).append(r)

    model_summary = {}
    for model, rows in by_model.items():
        scored = [r for r in rows if r.get("translation_en")]
        if not scored:
            model_summary[model] = {
                "translated_count": 0,
                "errors": len(rows),
                "avg_overall": 0.0,
                "avg_faithfulness": 0.0,
                "avg_legal_tone": 0.0,
                "avg_clarity": 0.0,
                "safe_rate": 0.0,
            }
            continue
        def avg(k: str) -> float:
            return round(sum(x["scores"][k] for x in scored) / len(scored), 3)
        safe_rate = round(sum(1 for x in scored if x["scores"]["safe_for_convenience_layer"]) / len(scored), 3)
        model_summary[model] = {
            "translated_count": len(scored),
            "errors": len(rows) - len(scored),
            "avg_overall": avg("overall"),
            "avg_faithfulness": avg("faithfulness"),
            "avg_legal_tone": avg("legal_tone"),
            "avg_clarity": avg("clarity"),
            "safe_rate": safe_rate,
        }

    # Best picks
    available = [(m, s) for m, s in model_summary.items() if s["translated_count"] > 0]
    best_overall = max(available, key=lambda x: x[1]["avg_overall"])[0] if available else None

    def best_for(snippet_types: set[str]) -> Optional[str]:
        best_model = None
        best_score = -1.0
        for model, rows in by_model.items():
            filtered = [r for r in rows if r["snippet_type"] in snippet_types and r.get("translation_en")]
            if not filtered:
                continue
            score = sum(r["scores"]["overall"] for r in filtered) / len(filtered)
            if score > best_score:
                best_score = score
                best_model = model
        return best_model

    return {
        "model_summary": model_summary,
        "best_overall_model": best_overall,
        "best_for_short_metadata_title": best_for({"law_title", "section_heading", "regulatory_announcement"}),
        "best_for_long_passage": best_for({"long_passage"}),
    }


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input", default="data/processed/thai_niti_normalized.json")
    p.add_argument("--num-snippets", type=int, default=24, help="20-30 recommended")
    p.add_argument(
        "--backend",
        default="hf_inference",
        choices=["hf_inference", "transformers_local"],
        help="Inference backend for translation generation.",
    )
    p.add_argument(
        "--model",
        default="",
        help="Optional single model id to evaluate (otherwise evaluates all configured models).",
    )
    p.add_argument(
        "--max-samples",
        type=int,
        default=0,
        help="Optional hard cap on number of snippets for quick tests.",
    )
    p.add_argument("--out-json", default="data/eval/translation_model_comparison.json")
    p.add_argument("--out-csv", default="data/eval/translation_model_comparison.csv")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    input_path = Path(args.input)
    snippets = build_test_set(input_path, limit=args.num_snippets)
    if args.max_samples > 0:
        snippets = snippets[: args.max_samples]
    hf_token = os.environ.get("HF_TOKEN")
    models = [args.model] if args.model else MODELS

    rows: List[Dict[str, Any]] = []
    for model_id in models:
        for snip in snippets:
            if args.backend == "hf_inference":
                translation, error = translate_with_hf_inference(model_id, snip.thai_text, hf_token)
            else:
                translation, error = translate_with_transformers_local(model_id, snip.thai_text)
            scores = score_translation(snip.thai_text, translation or "")
            rows.append(
                {
                    "model_id": model_id,
                    "snippet_id": snip.id,
                    "snippet_type": snip.snippet_type,
                    "thai_text": snip.thai_text,
                    "translation_en": translation,
                    "scores": scores,
                    "error": error,
                }
            )

    summary = aggregate(rows)
    payload = {
        "generated_at_utc": datetime.utcnow().isoformat(),
        "note": "Thai remains source of truth; translations are for convenience only, not official legal translation.",
        "num_snippets": len(snippets),
        "models": models,
        "model_debug": _MODEL_DEBUG,
        "summary": summary,
        "records": rows,
    }

    out_json = Path(args.out_json)
    out_csv = Path(args.out_csv)
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    with out_csv.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "model_id",
                "snippet_id",
                "snippet_type",
                "thai_text",
                "translation_en",
                "faithfulness",
                "legal_tone",
                "clarity",
                "oversimplified",
                "safe_for_convenience_layer",
                "overall",
                "error",
            ],
        )
        writer.writeheader()
        for r in rows:
            sc = r["scores"]
            writer.writerow(
                {
                    "model_id": r["model_id"],
                    "snippet_id": r["snippet_id"],
                    "snippet_type": r["snippet_type"],
                    "thai_text": r["thai_text"],
                    "translation_en": r["translation_en"] or "",
                    "faithfulness": sc["faithfulness"],
                    "legal_tone": sc["legal_tone"],
                    "clarity": sc["clarity"],
                    "oversimplified": sc["oversimplified"],
                    "safe_for_convenience_layer": sc["safe_for_convenience_layer"],
                    "overall": sc["overall"],
                    "error": r["error"] or "",
                }
            )

    print(f"Snippets evaluated: {len(snippets)}")
    print("Model loading summary:")
    for m in models:
        md = _MODEL_DEBUG.get(m, {})
        model_type = "adapter" if md.get("is_adapter") else "standalone_or_unknown"
        base = md.get("base_model_name_or_path")
        resolved = md.get("resolved_base_model")
        load_mode = md.get("load_mode")
        load_error = md.get("load_error")
        print(f"- model: {m}")
        print(f"  type: {model_type}")
        print(f"  required_base_model: {base}")
        print(f"  resolved_base_model: {resolved}")
        print(f"  load_mode: {load_mode}")
        print(f"  load_success: {load_error is None}")
        if load_error:
            print(f"  load_error: {load_error}")
    # Print one sample translation if available.
    sample = next((r for r in rows if r.get("translation_en")), None)
    if sample:
        print("Sample translation:")
        print(f"- model: {sample['model_id']}")
        print(f"- thai: {sample['thai_text'][:220]}")
        print(f"- en:   {sample['translation_en'][:220]}")

    print(f"Best overall model: {summary['best_overall_model']}")
    print(f"Best short metadata/title: {summary['best_for_short_metadata_title']}")
    print(f"Best long passage: {summary['best_for_long_passage']}")
    print(f"JSON: {out_json.as_posix()}")
    print(f"CSV: {out_csv.as_posix()}")


if __name__ == "__main__":
    main()
