from debrief import build_debrief_instructions
from scorecard import ObjectionScore, Scorecard


def test_debrief_mentions_missed_step_and_model_answer():
    card = Scorecard(
        rep_id="jenn",
        session_id="s1",
        character="burned_before_skeptic",
        per_objection=[
            ObjectionScore(
                type="authority",
                handled=False,
                rubric_steps_hit=["acknowledge"],
                missed=["reframe", "re_ask"],
                model_answer="Rep offered to join a call with both partners.",
            )
        ],
        overall_grade="C+",
        notes="Folded on the partner objection.",
    )
    text = build_debrief_instructions(card)
    assert "authority" in text
    assert "C+" in text
    assert "not handled" in text
    assert "Rep offered to join a call with both partners." in text


def test_debrief_handles_no_objections():
    card = Scorecard(
        rep_id="jenn",
        session_id="s1",
        character="c",
        per_objection=[],
        overall_grade="incomplete",
        notes="",
    )
    text = build_debrief_instructions(card)
    assert "didn't catch a clear objection" in text
