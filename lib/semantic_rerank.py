#!/usr/bin/env python3
"""Lightweight semantic reranking over lexical candidates."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

import numpy as np

try:
    from sentence_transformers import SentenceTransformer
except Exception:
    SentenceTransformer = None


@dataclass
class SemanticRerankConfig:
    # Lightweight multilingual baseline, suitable for local/dev evaluation.
    model_name: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    lexical_weight: float = 0.60
    semantic_weight: float = 0.40
    max_context_chars: int = 600


class SemanticReranker:
    """Semantic reranker for top lexical candidates."""

    def __init__(self, config: SemanticRerankConfig | None = None) -> None:
        self.config = config or SemanticRerankConfig()
        self._model = None

    @property
    def available(self) -> bool:
        return SentenceTransformer is not None

    def _ensure_model(self) -> None:
        if not self.available:
            raise RuntimeError("sentence-transformers is not available")
        if self._model is None:
            self._model = SentenceTransformer(self.config.model_name)

    @staticmethod
    def _minmax(values: np.ndarray) -> np.ndarray:
        if values.size == 0:
            return values
        v_min = float(values.min())
        v_max = float(values.max())
        if abs(v_max - v_min) < 1e-9:
            return np.ones_like(values) * 0.5
        return (values - v_min) / (v_max - v_min)

    def rerank(self, query: str, candidates: List[Dict], top_k: int = 3) -> List[Dict]:
        if not candidates:
            return []
        if not self.available:
            return candidates[:top_k]

        self._ensure_model()
        cfg = self.config

        texts = []
        for cand in candidates:
            law = (cand.get("law_title") or "").strip()
            section = (cand.get("section") or "").strip()
            ctx = (cand.get("context_text") or "").strip()[: cfg.max_context_chars]
            texts.append(f"{law} มาตรา {section} {ctx}".strip())

        query_emb = self._model.encode([query], normalize_embeddings=True)
        cand_emb = self._model.encode(texts, normalize_embeddings=True)
        sem_scores = np.matmul(cand_emb, query_emb[0])
        sem_norm = self._minmax(sem_scores)

        lex_scores = np.array([float(c.get("score", 0.0)) for c in candidates], dtype=float)
        lex_norm = self._minmax(lex_scores)

        combined = (cfg.lexical_weight * lex_norm) + (cfg.semantic_weight * sem_norm)

        reranked: List[Dict] = []
        for i, cand in enumerate(candidates):
            item = dict(cand)
            item["semantic_score"] = float(sem_scores[i])
            item["score"] = float(combined[i])
            reranked.append(item)

        reranked.sort(key=lambda x: x["score"], reverse=True)
        return reranked[:top_k]
