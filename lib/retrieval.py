#!/usr/bin/env python3
"""Lightweight lexical retrieval for Thai Niti legal contexts."""

from __future__ import annotations

import json
import math
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

from lib.query_expansion import expand_query_text
from lib.rerank import LegalMetadataReranker
from lib.semantic_rerank import SemanticRerankConfig, SemanticReranker

try:
    from pythainlp.tokenize import word_tokenize
except Exception:
    word_tokenize = None


THAI_BLOCK_RE = re.compile(r"[\u0E00-\u0E7Fa-zA-Z0-9]+")


@dataclass
class RetrievalResult:
    rank: int
    score: float
    law_title: str
    section: str
    context_text: str
    split: str
    bm25_score: float = 0.0
    rerank_bonus: float = 0.0
    semantic_score: float = 0.0


def _char_ngrams(text: str, n: int) -> List[str]:
    if len(text) < n:
        return []
    return [text[i : i + n] for i in range(0, len(text) - n + 1)]


def tokenize_thai_lexical(text: str, use_word_tokenizer: bool = True) -> List[str]:
    """
    A simple tokenizer that works reasonably for Thai + mixed text:
    - keeps contiguous Thai/latin/digit blocks
    - adds character bi/tri-grams for Thai-heavy segments
    """
    text = (text or "").strip().lower()
    if not text:
        return []

    blocks = THAI_BLOCK_RE.findall(text)
    tokens: List[str] = []
    for block in blocks:
        tokens.append(block)
        # Thai text often lacks spaces, so n-grams help lexical matching.
        if any("\u0E00" <= ch <= "\u0E7F" for ch in block):
            tokens.extend(_char_ngrams(block, 2))
            tokens.extend(_char_ngrams(block, 3))

    # Optional Thai word token stream for better semantic chunks.
    if use_word_tokenizer and word_tokenize is not None:
        try:
            words = word_tokenize(text, engine="newmm")
            tokens.extend([w.strip().lower() for w in words if w and w.strip()])
        except Exception:
            pass
    return tokens


class ThaiNitiRetriever:
    """BM25 retriever over deduplicated positive legal contexts."""

    def __init__(
        self,
        k1: float = 1.5,
        b: float = 0.75,
        use_thai_word_tokenizer: bool = True,
        enable_query_expansion: bool = True,
        enable_rerank: bool = True,
        rerank_weights: Dict[str, float] | None = None,
        enable_semantic_rerank: bool = False,
        semantic_rerank_config: SemanticRerankConfig | None = None,
        semantic_candidate_pool: int = 20,
    ) -> None:
        self.k1 = k1
        self.b = b
        self.use_thai_word_tokenizer = use_thai_word_tokenizer
        self.enable_query_expansion = enable_query_expansion
        self.enable_rerank = enable_rerank
        self.enable_semantic_rerank = enable_semantic_rerank
        self.semantic_candidate_pool = max(3, int(semantic_candidate_pool))
        self.documents: List[Dict[str, str]] = []
        self.doc_freqs: Dict[str, int] = defaultdict(int)
        self.term_freqs_per_doc: List[Counter] = []
        self.doc_lengths: List[int] = []
        self.avg_doc_len: float = 0.0
        self.total_docs: int = 0
        self.reranker = (
            LegalMetadataReranker(LegalMetadataReranker.make_weights(rerank_weights))
            if enable_rerank
            else None
        )
        self.semantic_reranker = (
            SemanticReranker(semantic_rerank_config) if enable_semantic_rerank else None
        )

    @staticmethod
    def load_normalized(path: str | Path) -> List[Dict[str, str]]:
        with Path(path).open("r", encoding="utf-8") as f:
            return json.load(f)

    @staticmethod
    def dedupe_positive_records(records: Iterable[Dict[str, str]]) -> List[Dict[str, str]]:
        seen: set[Tuple[str, str, str]] = set()
        deduped: List[Dict[str, str]] = []
        for row in records:
            if row.get("source_type") != "positive":
                continue
            key = (
                (row.get("law_title") or "").strip(),
                (row.get("section") or "").strip(),
                (row.get("context_text") or "").strip(),
            )
            if not key[2]:
                continue
            if key in seen:
                continue
            seen.add(key)
            deduped.append(
                {
                    "law_title": key[0],
                    "section": key[1],
                    "context_text": key[2],
                    "split": (row.get("split") or "").strip(),
                }
            )
        return deduped

    @staticmethod
    def save_json(path: str | Path, payload: object) -> None:
        out = Path(path)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def build_index(self, documents: List[Dict[str, str]]) -> None:
        self.documents = documents
        self.total_docs = len(documents)
        if self.total_docs == 0:
            self.avg_doc_len = 0.0
            return

        for doc in documents:
            tokens = tokenize_thai_lexical(
                doc["context_text"],
                use_word_tokenizer=self.use_thai_word_tokenizer,
            )
            tf = Counter(tokens)
            self.term_freqs_per_doc.append(tf)
            self.doc_lengths.append(sum(tf.values()))
            for term in tf.keys():
                self.doc_freqs[term] += 1

        self.avg_doc_len = sum(self.doc_lengths) / self.total_docs

    def _idf(self, term: str) -> float:
        df = self.doc_freqs.get(term, 0)
        if df == 0:
            return 0.0
        # BM25 Okapi idf with +1 inside log for positive value.
        return math.log(1 + (self.total_docs - df + 0.5) / (df + 0.5))

    def _bm25_score(self, query_terms: List[str], doc_idx: int) -> float:
        if self.total_docs == 0:
            return 0.0
        tf_doc = self.term_freqs_per_doc[doc_idx]
        doc_len = self.doc_lengths[doc_idx]
        score = 0.0
        for term in query_terms:
            tf = tf_doc.get(term, 0)
            if tf == 0:
                continue
            idf = self._idf(term)
            denom = tf + self.k1 * (1 - self.b + self.b * (doc_len / self.avg_doc_len))
            score += idf * (tf * (self.k1 + 1)) / denom
        return score

    def _search_scored_indices(self, query: str, top_k: int) -> List[Tuple[int, float]]:
        query_for_retrieval = expand_query_text(query) if self.enable_query_expansion else query
        query_terms = tokenize_thai_lexical(
            query_for_retrieval,
            use_word_tokenizer=self.use_thai_word_tokenizer,
        )
        if not query_terms or self.total_docs == 0:
            return []

        scored: List[Tuple[int, float]] = []
        for i in range(self.total_docs):
            s = self._bm25_score(query_terms, i)
            if s > 0:
                scored.append((i, s))

        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:top_k]

    def _results_from_scored(
        self,
        scored: List[Tuple[int, float]],
        top_k: int,
        query_for_rerank: str | None = None,
    ) -> List[RetrievalResult]:
        candidate_dicts: List[Dict] = []
        for doc_idx, score in scored:
            doc = self.documents[doc_idx]
            candidate_dicts.append(
                {
                    "doc_idx": doc_idx,
                    "score": score,
                    "law_title": doc["law_title"],
                    "section": doc["section"],
                    "context_text": doc["context_text"],
                    "split": doc["split"],
                }
            )

        if self.reranker is not None and query_for_rerank:
            candidate_dicts = self.reranker.rerank(query_for_rerank, candidate_dicts, top_k=top_k)
        else:
            candidate_dicts = candidate_dicts[:top_k]

        if self.semantic_reranker is not None and query_for_rerank:
            candidate_dicts = self.semantic_reranker.rerank(
                query_for_rerank,
                candidate_dicts,
                top_k=top_k,
            )

        results: List[RetrievalResult] = []
        for rank, cand in enumerate(candidate_dicts, start=1):
            results.append(
                RetrievalResult(
                    rank=rank,
                    score=float(cand["score"]),
                    law_title=cand["law_title"],
                    section=cand["section"],
                    context_text=cand["context_text"],
                    split=cand["split"],
                    bm25_score=float(cand.get("bm25_score", cand["score"])),
                    rerank_bonus=float(cand.get("rerank_bonus", 0.0)),
                    semantic_score=float(cand.get("semantic_score", 0.0)),
                )
            )
        return results

    def search(self, query: str, top_k: int = 3) -> List[RetrievalResult]:
        if self.enable_semantic_rerank:
            # Second-stage semantic reranker over a small lexical candidate pool.
            pool_k = max(top_k, self.semantic_candidate_pool)
        else:
            pool_k = max(top_k * 8, 24) if self.enable_rerank else top_k
        scored = self._search_scored_indices(query=query, top_k=pool_k)
        return self._results_from_scored(scored, top_k=top_k, query_for_rerank=query)

    def search_hybrid(self, original_query: str, normalized_query: str, top_k: int = 3) -> List[RetrievalResult]:
        """
        Retrieval fusion using original + normalized query.
        - retrieves from both queries
        - merges by document id
        - rewards documents surfaced by both
        """
        per_query_k = max(top_k * 4, 12)
        original_scored = self._search_scored_indices(original_query, top_k=per_query_k)
        normalized_scored = self._search_scored_indices(normalized_query, top_k=per_query_k)

        merged: Dict[int, Dict[str, float]] = {}
        for doc_idx, score in original_scored:
            merged.setdefault(doc_idx, {"orig": 0.0, "norm": 0.0})
            merged[doc_idx]["orig"] = score
        for doc_idx, score in normalized_scored:
            merged.setdefault(doc_idx, {"orig": 0.0, "norm": 0.0})
            merged[doc_idx]["norm"] = score

        fused_scored: List[Tuple[int, float]] = []
        for doc_idx, v in merged.items():
            orig = v["orig"]
            norm = v["norm"]
            overlap_bonus = 0.20 * min(orig, norm) if orig > 0 and norm > 0 else 0.0
            fused = max(orig, norm) + overlap_bonus
            if fused > 0:
                fused_scored.append((doc_idx, fused))

        fused_scored.sort(key=lambda x: x[1], reverse=True)
        if self.enable_semantic_rerank:
            # Keep hybrid path consistent: semantic rerank only lexical top-20.
            pool_k = max(top_k, self.semantic_candidate_pool)
        else:
            pool_k = max(top_k * 8, 24) if self.enable_rerank else top_k
        return self._results_from_scored(
            fused_scored[:pool_k],
            top_k=top_k,
            query_for_rerank=original_query,
        )


def build_retriever_from_file(
    normalized_json_path: str | Path,
    dedup_output_path: str | Path | None = None,
    use_thai_word_tokenizer: bool = True,
    enable_query_expansion: bool = True,
    enable_rerank: bool = True,
    rerank_weights: Dict[str, float] | None = None,
    enable_semantic_rerank: bool = False,
    semantic_rerank_config: SemanticRerankConfig | None = None,
    semantic_candidate_pool: int = 20,
) -> ThaiNitiRetriever:
    records = ThaiNitiRetriever.load_normalized(normalized_json_path)
    deduped = ThaiNitiRetriever.dedupe_positive_records(records)
    if dedup_output_path is not None:
        ThaiNitiRetriever.save_json(dedup_output_path, deduped)

    retriever = ThaiNitiRetriever(
        use_thai_word_tokenizer=use_thai_word_tokenizer,
        enable_query_expansion=enable_query_expansion,
        enable_rerank=enable_rerank,
        rerank_weights=rerank_weights,
        enable_semantic_rerank=enable_semantic_rerank,
        semantic_rerank_config=semantic_rerank_config,
        semantic_candidate_pool=semantic_candidate_pool,
    )
    retriever.build_index(deduped)
    return retriever
