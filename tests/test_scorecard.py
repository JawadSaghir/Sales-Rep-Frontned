from pathlib import Path

from scorecard import (
    ObjectionScore,
    Scorecard,
    load_rep_history,
    save_scorecard,
)


def _card(session_id: str = "2026-07-16T10-00Z-room1") -> Scorecard:
    return Scorecard(
        rep_id="jenn",
        session_id=session_id,
        character="burned_before_skeptic",
        per_objection=[
            ObjectionScore(
                type="price",
                handled=True,
                rubric_steps_hit=["acknowledge", "reframe"],
                missed=[],
                model_answer="Totally hear you on cost...",
            )
        ],
        overall_grade="B",
        notes="Solid on price.",
    )


def test_roundtrip_to_from_dict():
    card = _card()
    assert Scorecard.from_dict(card.to_dict()) == card


def test_save_and_load_history(tmp_path: Path):
    save_scorecard(_card("2026-07-16T10-00Z-a"), tmp_path)
    save_scorecard(_card("2026-07-16T11-00Z-b"), tmp_path)
    history = load_rep_history("jenn", tmp_path)
    assert [c.session_id for c in history] == [
        "2026-07-16T10-00Z-a",
        "2026-07-16T11-00Z-b",
    ]


def test_load_history_empty_when_none(tmp_path: Path):
    assert load_rep_history("nobody", tmp_path) == []
