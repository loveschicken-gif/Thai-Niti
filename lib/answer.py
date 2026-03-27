#!/usr/bin/env python3
"""Grounded answer generation on top of Thai Niti retrieval."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import List

from lib.normalize_query import normalize_query
from lib.retrieval import RetrievalResult, ThaiNitiRetriever, build_retriever_from_file


@dataclass
class Citation:
    law_title: str
    section: str


@dataclass
class LayeredProvision:
    law_title: str
    section: str
    excerpt: str
    full_text: str
    score: float


@dataclass
class AnswerPayload:
    question: str
    normalized_query: str
    normalization_applied: bool
    answer: str
    short_answer: str
    main_ccc_provision: LayeredProvision | None
    related_ccc_provisions: List[LayeredProvision]
    additional_authorities: List[LayeredProvision]
    citations: List[Citation]
    retrieved_results: List[RetrievalResult]
    grounded: bool


class GroundedAnswerEngine:
    """
    Retrieval-first grounded answer engine.

    This implementation is rule-based (no LLM dependency):
    - Generates a short Thai answer from top retrieved contexts only
    - Returns citation list for transparency
    - Explicitly marks insufficient evidence when needed
    """

    def __init__(self, retriever: ThaiNitiRetriever) -> None:
        self.retriever = retriever

    @staticmethod
    def _is_ccc_title(law_title: str) -> bool:
        title = (law_title or "").strip().lower()
        if not title:
            return False
        return (
            "ประมวลกฎหมายแพ่งและพาณิชย์" in title
            or "civil and commercial code" in title
            or title == "ccc"
        )

    @staticmethod
    def _extract_summary_sentence(text: str, max_chars: int = 240) -> str:
        cleaned = (text or "").strip()
        if not cleaned:
            return ""

        # Prefer the first substantive line (not just title/section metadata).
        lines = [ln.strip() for ln in cleaned.split("\n") if ln.strip()]
        sentence = lines[0] if lines else cleaned
        if len(lines) > 1 and ("มาตรา" in sentence or "บัญชีอัตราอากร" in sentence):
            sentence = lines[1]
        if not sentence:
            sentence = cleaned

        if len(sentence) > max_chars:
            return sentence[: max_chars - 3].strip() + "..."
        return sentence

    def _to_layered_provision(self, result: RetrievalResult) -> LayeredProvision:
        return LayeredProvision(
            law_title=(result.law_title or "").strip(),
            section=(result.section or "").strip(),
            excerpt=self._extract_summary_sentence(result.context_text, max_chars=220),
            full_text=(result.context_text or "").strip(),
            score=float(result.score),
        )

    def _build_layers(
        self, results: List[RetrievalResult]
    ) -> tuple[LayeredProvision | None, List[LayeredProvision], List[LayeredProvision]]:
        ccc_results = [r for r in results if self._is_ccc_title(r.law_title)]
        non_ccc_results = [r for r in results if not self._is_ccc_title(r.law_title)]

        main_ccc = self._to_layered_provision(ccc_results[0]) if ccc_results else None

        related_ccc: List[LayeredProvision] = []
        seen_ccc_sections: set[str] = set()
        if main_ccc and main_ccc.section:
            seen_ccc_sections.add(main_ccc.section)
        for r in ccc_results[1:]:
            section = (r.section or "").strip()
            if section in seen_ccc_sections:
                continue
            if section:
                seen_ccc_sections.add(section)
            related_ccc.append(self._to_layered_provision(r))
            if len(related_ccc) >= 3:
                break

        additional_authorities: List[LayeredProvision] = []
        seen_authorities: set[tuple[str, str]] = set()
        for r in non_ccc_results:
            key = ((r.law_title or "").strip(), (r.section or "").strip())
            if key in seen_authorities:
                continue
            seen_authorities.add(key)
            additional_authorities.append(self._to_layered_provision(r))
            if len(additional_authorities) >= 4:
                break

        return main_ccc, related_ccc, additional_authorities

    @staticmethod
    def _build_citations(
        main_ccc: LayeredProvision | None,
        related_ccc: List[LayeredProvision],
        additional_authorities: List[LayeredProvision],
    ) -> List[Citation]:
        seen = set()
        citations: List[Citation] = []
        ordered_sources: List[LayeredProvision] = []
        if main_ccc is not None:
            ordered_sources.append(main_ccc)
        ordered_sources.extend(related_ccc)
        ordered_sources.extend(additional_authorities)
        for src in ordered_sources:
            key = ((src.law_title or "").strip(), (src.section or "").strip())
            if key in seen:
                continue
            seen.add(key)
            citations.append(Citation(law_title=key[0], section=key[1]))
        return citations

    def _build_short_answer(
        self,
        main_ccc: LayeredProvision | None,
        related_ccc: List[LayeredProvision],
        additional_authorities: List[LayeredProvision],
    ) -> tuple[str, bool]:
        if main_ccc is not None and main_ccc.excerpt:
            section_text = f"มาตรา {main_ccc.section}" if main_ccc.section else "มาตราที่เกี่ยวข้อง"
            answer = (
                f"คำตอบโดยย่อ (อิงประมวลกฎหมายแพ่งและพาณิชย์): {main_ccc.excerpt} "
                f"(อ้างอิงหลัก: ประมวลกฎหมายแพ่งและพาณิชย์ {section_text})"
            )
            if related_ccc:
                answer += "\nมีมาตราใน CCC ที่เกี่ยวข้องเพิ่มเติม โปรดพิจารณาในหัวข้อถัดไป"
            if additional_authorities:
                answer += "\nมีแหล่งกฎหมายอื่นที่อาจเกี่ยวข้องในฐานะแหล่งประกอบ"
            grounded = main_ccc.score > 0
            return answer, grounded

        if additional_authorities:
            top = additional_authorities[0]
            section_text = f"มาตรา {top.section}" if top.section else "ไม่ระบุมาตรา"
            answer = (
                "ยังไม่พบมาตราหลักในประมวลกฎหมายแพ่งและพาณิชย์จากผลที่ค้นคืนได้โดยตรง "
                f"จึงแสดงผลจากกฎหมายอื่นที่เกี่ยวข้องก่อน: {top.excerpt} "
                f"(อ้างอิง: {top.law_title} {section_text})"
            )
            return answer, False

        return (
            "ไม่พบข้อความกฎหมายที่เกี่ยวข้องเพียงพอจากชุดข้อมูลที่ดึงมา จึงยังสรุปคำตอบไม่ได้ และควรตรวจสอบบทกฎหมายเพิ่มเติม",
            False,
        )

    def _build_answer(self, query: str, results: List[RetrievalResult]) -> tuple[str, bool]:
        if not results:
            return (
                "ไม่พบข้อความกฎหมายที่เกี่ยวข้องเพียงพอจากชุดข้อมูลที่ดึงมา จึงยังสรุปคำตอบไม่ได้ และควรตรวจสอบบทกฎหมายเพิ่มเติม",
                False,
            )
        main_ccc, related_ccc, additional_authorities = self._build_layers(results)
        return self._build_short_answer(main_ccc, related_ccc, additional_authorities)

    def answer_query(self, query: str, top_k: int = 3) -> AnswerPayload:
        normalized = normalize_query(query)
        results = self.retriever.search_hybrid(
            original_query=normalized.original_query,
            normalized_query=normalized.normalized_query,
            top_k=top_k,
        )
        main_ccc, related_ccc, additional_authorities = self._build_layers(results)
        short_answer, grounded = self._build_short_answer(main_ccc, related_ccc, additional_authorities)
        citations = self._build_citations(main_ccc, related_ccc, additional_authorities)
        return AnswerPayload(
            question=query,
            normalized_query=normalized.normalized_query,
            normalization_applied=normalized.meaningful_change,
            answer=short_answer,
            short_answer=short_answer,
            main_ccc_provision=main_ccc,
            related_ccc_provisions=related_ccc,
            additional_authorities=additional_authorities,
            citations=citations,
            retrieved_results=results,
            grounded=grounded,
        )


def build_answer_engine(
    normalized_json_path: str | Path = "data/processed/thai_niti_normalized.json",
    dedup_output_path: str | Path | None = "data/processed/thai_niti_deduped.json",
) -> GroundedAnswerEngine:
    retriever = build_retriever_from_file(
        normalized_json_path=normalized_json_path,
        dedup_output_path=dedup_output_path,
    )
    return GroundedAnswerEngine(retriever=retriever)
