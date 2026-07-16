import json
from pathlib import Path

from retrieval import SeedRetriever, WinningExample


def _seed(tmp_path: Path) -> Path:
    data = [
        {
            "type": "price",
            "quote": "That's more than I paid last time, and that was a waste.",
            "intensity": "high",
            "rep_response_worked": "yes",
            "context": "Rep reframed cost against the value of one closed deal and it landed.",
        },
        {
            "type": "price",
            "quote": "be close, but I'll try to get it, so...",
            "intensity": "low",
            "rep_response_worked": "partially",
            "context": "Rep revealed the fee and noted payment flexibility; prospect hesitated but did not refuse.",
        },
        {
            "type": "authority",
            "quote": "I'd have to run this by my business partner.",
            "intensity": "medium",
            "rep_response_worked": "no",
            "context": "Rep accepted the deferral without offering to include the partner.",
        },
    ]
    p = tmp_path / "objection_examples.json"
    p.write_text(json.dumps(data), encoding="utf-8")
    return p


def test_returns_only_worked_examples_for_type(tmp_path: Path):
    r = SeedRetriever(_seed(tmp_path))
    lines = r.winning_lines("price", k=5)
    assert len(lines) == 2
    assert all(isinstance(x, WinningExample) for x in lines)
    assert all(x.rep_response_worked in {"yes", "partially"} for x in lines)


def test_limits_k(tmp_path: Path):
    r = SeedRetriever(_seed(tmp_path))
    assert len(r.winning_lines("price", k=1)) == 1


def test_excludes_failed_and_unknown_types(tmp_path: Path):
    r = SeedRetriever(_seed(tmp_path))
    # authority example exists but rep_response_worked == "no"
    assert r.winning_lines("authority") == []
    assert r.winning_lines("teleportation") == []
