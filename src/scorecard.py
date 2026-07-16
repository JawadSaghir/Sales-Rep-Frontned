"""Per-session scorecard model and JSON persistence for the rep trainer."""

import json
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass(frozen=True)
class ObjectionScore:
    type: str
    handled: bool
    rubric_steps_hit: list[str]
    missed: list[str]
    model_answer: str


@dataclass(frozen=True)
class Scorecard:
    rep_id: str
    session_id: str
    character: str
    per_objection: list[ObjectionScore]
    overall_grade: str
    notes: str

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "Scorecard":
        return cls(
            rep_id=d["rep_id"],
            session_id=d["session_id"],
            character=d["character"],
            per_objection=[ObjectionScore(**o) for o in d["per_objection"]],
            overall_grade=d["overall_grade"],
            notes=d["notes"],
        )


def save_scorecard(card: Scorecard, base_dir: Path) -> Path:
    """Write a scorecard to base_dir/<rep_id>/<session_id>.json and return the path."""
    rep_dir = base_dir / card.rep_id
    rep_dir.mkdir(parents=True, exist_ok=True)
    path = rep_dir / f"{card.session_id}.json"
    path.write_text(json.dumps(card.to_dict(), indent=2), encoding="utf-8")
    return path


def load_rep_history(rep_id: str, base_dir: Path) -> list[Scorecard]:
    """Return all prior scorecards for a rep, sorted by session_id (empty if none)."""
    rep_dir = base_dir / rep_id
    if not rep_dir.is_dir():
        return []
    return [
        Scorecard.from_dict(json.loads(p.read_text(encoding="utf-8")))
        for p in sorted(rep_dir.glob("*.json"))
    ]
