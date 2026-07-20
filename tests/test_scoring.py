import json

from retrieval import WinningExample
from scoring import DEFAULT_RUBRIC, RUBRIC_STEPS, score_session


class _FakeRetriever:
    def winning_lines(self, objection_type, k=1):
        return [
            WinningExample(
                objection_type=objection_type,
                quote="q",
                intensity="medium",
                rep_response_worked="yes",
                context=f"what a top rep did for {objection_type}",
            )
        ]


_LLM_JSON = json.dumps(
    {
        "overall_grade": "B-",
        "notes": "Gave up on authority too early.",
        "per_objection": [
            {
                "type": "price",
                "handled": True,
                "rubric_steps_hit": ["acknowledge", "reframe"],
                "missed": [],
            },
            {
                "type": "authority",
                "handled": False,
                "rubric_steps_hit": ["acknowledge"],
                "missed": ["reframe", "re_ask"],
            },
        ],
    }
)


def test_scores_and_attaches_model_answers():
    card = score_session(
        transcript="Rep: ...\nProspect: too expensive",
        rubric="acknowledge -> reframe -> evidence -> re_ask",
        retriever=_FakeRetriever(),
        complete=lambda prompt: _LLM_JSON,
        rep_id="jenn",
        session_id="s1",
        character="burned_before_skeptic",
    )
    assert card.overall_grade == "B-"
    assert [o.type for o in card.per_objection] == ["price", "authority"]
    authority = card.per_objection[1]
    assert authority.handled is False
    assert authority.missed == ["reframe", "re_ask"]
    assert authority.model_answer == "what a top rep did for authority"


def test_default_rubric_is_self_contained():
    # The rubric lives in code, not a file: the agent must not depend on a
    # prompts/rubric.md asset that a refactor could remove.
    assert isinstance(DEFAULT_RUBRIC, str)
    assert DEFAULT_RUBRIC.strip()
    for step in RUBRIC_STEPS:
        assert step in DEFAULT_RUBRIC


def test_score_session_works_with_default_rubric():
    card = score_session(
        transcript="Rep: ...\nProspect: too expensive",
        rubric=DEFAULT_RUBRIC,
        retriever=_FakeRetriever(),
        complete=lambda prompt: _LLM_JSON,
        rep_id="jenn",
        session_id="s1",
        character="c",
    )
    assert card.overall_grade == "B-"
    assert [o.type for o in card.per_objection] == ["price", "authority"]


def test_fail_open_on_bad_llm_output():
    card = score_session(
        transcript="x",
        rubric="y",
        retriever=_FakeRetriever(),
        complete=lambda prompt: "not json at all",
        rep_id="jenn",
        session_id="s1",
        character="c",
    )
    assert card.overall_grade == "incomplete"
    assert card.per_objection == []
