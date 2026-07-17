"""OpenRouter embeddings + UMAP/HDBSCAN clustering (offline notebook use)."""

from __future__ import annotations

import os
from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    import openai


def make_client() -> openai.OpenAI:
    import openai

    return openai.OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=os.environ["OPENROUTER_API_KEY"],
    )


def embed_texts(
    texts: list[str],
    client: openai.OpenAI,
    model: str | None = None,
    batch_size: int = 128,
) -> list[list[float]]:
    model = model or os.environ.get("REP_EMBED_MODEL", "openai/text-embedding-3-small")
    out: list[list[float]] = []
    for i in range(0, len(texts), batch_size):
        chunk = texts[i : i + batch_size]
        resp = client.embeddings.create(model=model, input=chunk)
        out.extend(d.embedding for d in resp.data)
    return out


def cluster_vectors(vectors: list[list[float]], min_cluster_size: int = 5) -> list[int]:
    import hdbscan

    x = np.asarray(vectors, dtype="float32")
    if len(x) >= 4 * min_cluster_size and x.shape[1] > 5:
        import umap

        n_comp = min(5, x.shape[1] - 1)
        x = umap.UMAP(n_components=n_comp, random_state=42, n_jobs=1).fit_transform(x)
    labels = hdbscan.HDBSCAN(min_cluster_size=min_cluster_size).fit_predict(x)
    return [int(v) for v in labels]


def group_by_cluster(items: list[str], labels: list[int]) -> dict[int, list[str]]:
    grouped: dict[int, list[str]] = {}
    for item, label in zip(items, labels):
        if label == -1:
            continue
        grouped.setdefault(label, []).append(item)
    return grouped
