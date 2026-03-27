#!/usr/bin/env python3
"""Ingest statute-only track data from approved Thai law sources."""

from __future__ import annotations

import argparse
import csv
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib.request import urlopen

from datasets import load_dataset


CRIMINAL_RELEASE_URL = (
    "https://github.com/PyThaiNLP/thai-law/releases/download/"
    "criminal-csv-v0.1/criminal-datasets.csv"
)
THAILAW_V1_NAME = "pythainlp/thailaw-v1.0"
IAPP_RAG_NAME = "iapp/rag_thai_laws"


NON_STATUTORY_MARKERS = (
    "ราชกิจจานุเบกษา",
    "ประกาศ",
    "กฎกระทรวง",
    "ระเบียบ",
    "คำสั่ง",
    "คำพิพากษา",
    "ฎีกา",
)

AMENDMENT_STYLE_MARKERS = (
    "แก้ไขเพิ่มเติม",
    "(ฉบับที่",
    "ฉบับที่ ",
)


THAI_DIGITS = str.maketrans("๐๑๒๓๔๕๖๗๘๙", "0123456789")


@dataclass(frozen=True)
class TrackConfig:
    track_id: str
    track_name_en: str
    track_name_th: str
    title_patterns: Tuple[str, ...]
    source_priority: Tuple[str, ...]


TRACKS: Tuple[TrackConfig, ...] = (
    TrackConfig(
        track_id="pc",
        track_name_en="Penal Code",
        track_name_th="ประมวลกฎหมายอาญา",
        title_patterns=("ประมวลกฎหมายอาญา",),
        source_priority=("pythainlp_release_criminal", "pythainlp_thailaw_v1"),
    ),
    TrackConfig(
        track_id="bankruptcy",
        track_name_en="Bankruptcy Act",
        track_name_th="พระราชบัญญัติล้มละลาย",
        title_patterns=("พระราชบัญญัติล้มละลาย",),
        source_priority=("pythainlp_thailaw_v1", "iapp_rag_thai_laws"),
    ),
    TrackConfig(
        track_id="crpc",
        track_name_en="Criminal Procedure Code",
        track_name_th="ประมวลกฎหมายวิธีพิจารณาความอาญา",
        title_patterns=("ประมวลกฎหมายวิธีพิจารณาความอาญา",),
        source_priority=("pythainlp_thailaw_v1", "iapp_rag_thai_laws"),
    ),
)


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def normalized_section_number(raw: str) -> Optional[str]:
    text = normalize_whitespace(raw).translate(THAI_DIGITS)
    if not text:
        return None
    match = re.search(r"(\d+(?:/\d+)?)", text)
    return match.group(1) if match else None


def extract_section_number_from_text(text: str) -> Optional[str]:
    cleaned = normalize_whitespace(text).translate(THAI_DIGITS)
    match = re.search(r"มาตรา\s*([0-9]+(?:/[0-9]+)?)", cleaned)
    return match.group(1) if match else None


def extract_section_chunks(text: str) -> List[Tuple[str, str]]:
    cleaned = normalize_whitespace(text).translate(THAI_DIGITS)
    if not cleaned:
        return []
    # Capture each "มาตรา X ..." chunk until next section marker or end.
    pattern = re.compile(r"(มาตรา\s*([0-9]+(?:/[0-9]+)?)(.*?))(?=มาตรา\s*[0-9]+(?:/[0-9]+)?|$)")
    chunks: List[Tuple[str, str]] = []
    for match in pattern.finditer(cleaned):
        section_number = match.group(2)
        chunk_text = normalize_whitespace(match.group(1))
        if not section_number or not chunk_text:
            continue
        chunks.append((section_number, chunk_text))
    return chunks


def is_statute_title(title: str, title_patterns: Iterable[str]) -> bool:
    normalized = normalize_whitespace(title)
    if not normalized:
        return False
    if not any(normalized.startswith(pattern) for pattern in title_patterns):
        return False
    if any(marker in normalized for marker in NON_STATUTORY_MARKERS):
        return False
    if any(marker in normalized for marker in AMENDMENT_STYLE_MARKERS):
        return False
    return True


def load_release_criminal_rows() -> List[Dict[str, Any]]:
    with urlopen(CRIMINAL_RELEASE_URL) as response:
        raw = response.read().decode("utf-8-sig")
    reader = csv.DictReader(raw.splitlines())
    return [dict(row) for row in reader]


def load_hf_rows(dataset_name: str) -> List[Dict[str, Any]]:
    ds = load_dataset(dataset_name, split="train")
    return [dict(row) for row in ds]


def to_record(
    track: TrackConfig,
    section_number: Optional[str],
    text: str,
    source_name: str,
    source_url: str,
    section_title: Optional[str] = None,
    notes: Optional[str] = None,
    is_cancelled: Optional[bool] = None,
) -> Optional[Dict[str, Any]]:
    section = normalized_section_number(section_number or "")
    payload_text = normalize_whitespace(text)
    if not section or not payload_text:
        return None
    return {
        "track_id": track.track_id,
        "track_name_en": track.track_name_en,
        "track_name_th": track.track_name_th,
        "section_number": section,
        "section_title": section_title,
        "text": payload_text,
        "notes": notes,
        "is_cancelled": is_cancelled,
        "source_name": source_name,
        "source_url": source_url,
    }


def dedupe(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen = set()
    out: List[Dict[str, Any]] = []
    for row in records:
        key = (row["track_id"], row["section_number"], row["text"])
        if key in seen:
            continue
        seen.add(key)
        out.append(row)
    return out


def ingest_from_release_criminal(track: TrackConfig) -> Tuple[List[Dict[str, Any]], str]:
    rows = load_release_criminal_rows()
    out: List[Dict[str, Any]] = []
    malformed = 0
    for row in rows:
        article = str(row.get("article") or "")
        text = str(row.get("text") or "")
        notes_raw = row.get("notes")
        notes = normalize_whitespace(str(notes_raw)) if notes_raw not in (None, "", "nan") else None
        section_number = normalized_section_number(article) or extract_section_number_from_text(text)
        rec = to_record(
            track=track,
            section_number=section_number,
            text=text,
            section_title=None,
            notes=notes,
            is_cancelled=("ยกเลิก" in notes) if notes else None,
            source_name="PyThaiNLP/thai-law release criminal-datasets.csv",
            source_url=CRIMINAL_RELEASE_URL,
        )
        if rec is None:
            malformed += 1
            continue
        out.append(rec)
    return dedupe(out), f"release rows={len(rows)} malformed_or_empty={malformed}"


def ingest_from_hf(
    track: TrackConfig,
    dataset_name: str,
    text_field: str,
    source_name: str,
    source_url: str,
) -> Tuple[List[Dict[str, Any]], str]:
    rows = load_hf_rows(dataset_name)
    out: List[Dict[str, Any]] = []
    fallback_out: List[Dict[str, Any]] = []
    matched_titles = 0
    skipped_non_statute = 0
    malformed = 0
    fallback_non_statute_used = 0
    for row in rows:
        title = str(row.get("title") or "")
        if not any(pattern in title for pattern in track.title_patterns):
            continue
        matched_titles += 1
        text = str(row.get(text_field) or "")
        is_strict_statute = is_statute_title(title, track.title_patterns)
        section_chunks = extract_section_chunks(text)
        if not section_chunks:
            section_number = extract_section_number_from_text(text)
            if section_number:
                section_chunks = [(section_number, normalize_whitespace(text))]
        if not section_chunks:
            malformed += 1
            continue
        for section_number, chunk_text in section_chunks:
            rec = to_record(
                track=track,
                section_number=section_number,
                text=chunk_text,
                section_title=None,
                notes=None if is_strict_statute else "supplementary_non_statute_fallback_from_approved_source",
                is_cancelled=None,
                source_name=source_name,
                source_url=source_url,
            )
            if rec is None:
                malformed += 1
                continue
            if is_strict_statute:
                out.append(rec)
            else:
                fallback_out.append(rec)

        if not is_strict_statute:
            skipped_non_statute += 1

    out = dedupe(out)
    fallback_out = dedupe(fallback_out)
    strict_count = len(out)
    used_fallback = 0
    if not out and fallback_out:
        out = fallback_out
        used_fallback = len(out)
        fallback_non_statute_used = len(out)

    debug = (
        f"dataset_rows={len(rows)} title_matches={matched_titles} "
        f"non_statute_or_amendment={skipped_non_statute} malformed_or_empty={malformed} "
        f"strict_records={strict_count} "
        f"fallback_records={len(fallback_out)} fallback_used={fallback_non_statute_used}"
    )
    return out, debug


def ingest_track(track: TrackConfig) -> Tuple[List[Dict[str, Any]], List[Dict[str, str]], str]:
    checked: List[Dict[str, str]] = []
    for source_key in track.source_priority:
        if source_key == "pythainlp_release_criminal":
            source_url = CRIMINAL_RELEASE_URL
            try:
                records, debug = ingest_from_release_criminal(track)
            except Exception as exc:  # noqa: BLE001
                checked.append(
                    {
                        "source_key": source_key,
                        "source_url": source_url,
                        "result": f"failed: {exc}",
                    }
                )
                continue
            checked.append(
                {
                    "source_key": source_key,
                    "source_url": source_url,
                    "result": f"ok records={len(records)} {debug}",
                }
            )
            if records:
                return records, checked, source_key
            continue

        if source_key == "pythainlp_thailaw_v1":
            source_url = f"https://huggingface.co/datasets/{THAILAW_V1_NAME}"
            try:
                records, debug = ingest_from_hf(
                    track=track,
                    dataset_name=THAILAW_V1_NAME,
                    text_field="text",
                    source_name="HuggingFace pythainlp/thailaw-v1.0",
                    source_url=source_url,
                )
            except Exception as exc:  # noqa: BLE001
                checked.append(
                    {
                        "source_key": source_key,
                        "source_url": source_url,
                        "result": f"failed: {exc}",
                    }
                )
                continue
            checked.append(
                {
                    "source_key": source_key,
                    "source_url": source_url,
                    "result": f"ok records={len(records)} {debug}",
                }
            )
            if records:
                return records, checked, source_key
            continue

        if source_key == "iapp_rag_thai_laws":
            source_url = f"https://huggingface.co/datasets/{IAPP_RAG_NAME}"
            try:
                records, debug = ingest_from_hf(
                    track=track,
                    dataset_name=IAPP_RAG_NAME,
                    text_field="txt",
                    source_name="HuggingFace iapp/rag_thai_laws",
                    source_url=source_url,
                )
            except Exception as exc:  # noqa: BLE001
                checked.append(
                    {
                        "source_key": source_key,
                        "source_url": source_url,
                        "result": f"failed: {exc}",
                    }
                )
                continue
            checked.append(
                {
                    "source_key": source_key,
                    "source_url": source_url,
                    "result": f"ok records={len(records)} {debug}",
                }
            )
            if records:
                return records, checked, source_key
            continue

        checked.append(
            {
                "source_key": source_key,
                "source_url": "n/a",
                "result": "failed: unsupported source key in config",
            }
        )

    return [], checked, "none"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        default="data/processed/statute_tracks",
        help="Directory for normalized per-track output files.",
    )
    return parser.parse_args()


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    summary_rows: List[Dict[str, Any]] = []
    source_failures: List[Dict[str, Any]] = []

    for track in TRACKS:
        records, checked, used_source = ingest_track(track)
        out_path = output_dir / f"{track.track_id}.json"
        write_json(out_path, records)

        summary_rows.append(
            {
                "track_id": track.track_id,
                "track_name_en": track.track_name_en,
                "track_name_th": track.track_name_th,
                "count": len(records),
                "source_used": used_source,
                "output_file": out_path.as_posix(),
            }
        )

        if not records:
            source_failures.append(
                {
                    "track_id": track.track_id,
                    "track_name_en": track.track_name_en,
                    "checked_sources": checked,
                }
            )

        print(
            f"[{track.track_id}] count={len(records)} source={used_source} "
            f"output={out_path.as_posix()}"
        )
        if not records:
            for check in checked:
                print(
                    f"[{track.track_id}] checked {check['source_key']} "
                    f"({check['source_url']}) -> {check['result']}"
                )

    summary_payload = {
        "tracks": summary_rows,
        "failures": source_failures,
    }
    write_json(output_dir / "summary.json", summary_payload)
    print(f"summary={ (output_dir / 'summary.json').as_posix() }")


if __name__ == "__main__":
    main()
