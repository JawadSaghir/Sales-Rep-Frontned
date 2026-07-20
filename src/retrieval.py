"""Winning-example retrieval. Seed (local JSON) now; RAGFlow-backed in Plan 2.

Records use the objection extraction schema produced by the offline pipeline
(see data/*.json): {type, quote, intensity, rep_response_worked, context}.
A "winning example" is an objection turn where the rep's response worked
(rep_response_worked in {"yes", "partially"}); its `context` describes what the
rep actually did, which the coach surfaces as the model answer.

The Coach depends only on the Retriever protocol, so the backend is swappable.
"""

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

logger = logging.getLogger("agent.retrieval")

WORKED_VALUES = {"yes", "partially"}


@dataclass(frozen=True)
class WinningExample:
    objection_type: str
    quote: str
    intensity: str
    rep_response_worked: str
    context: str


class Retriever(Protocol):
    def winning_lines(self, objection_type: str, k: int = 1) -> list[WinningExample]:
        """Return up to k objection turns of this type where the rep succeeded."""
        ...


class SeedRetriever:
    """Retriever backed by a local JSON list of objection records."""

    def __init__(self, path: Path) -> None:
        p = Path(path)
        if not p.is_file():
            # The seed file is an optional training asset. If it's absent (e.g.
            # removed in a refactor), degrade to no examples rather than crash
            # the call at startup — the coach still runs, just without model
            # answers drawn from winning examples.
            logger.warning("Seed file not found at %s; no winning examples loaded.", p)
            self._examples = []
            return
        raw = json.loads(p.read_text(encoding="utf-8"))
        self._examples = [
            WinningExample(
                objection_type=item["type"],
                quote=item["quote"],
                intensity=item.get("intensity", ""),
                rep_response_worked=item["rep_response_worked"],
                context=item.get("context", ""),
            )
            for item in raw
        ]

    def winning_lines(self, objection_type: str, k: int = 1) -> list[WinningExample]:
        matches = [
            ex
            for ex in self._examples
            if ex.objection_type == objection_type
            and ex.rep_response_worked in WORKED_VALUES
        ]
        return matches[:k]
