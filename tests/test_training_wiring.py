from pathlib import Path

from livekit.agents import ChatContext

from agent import build_coach_factory
from coaching import CoachAgent
from retrieval import SeedRetriever


def test_coach_factory_builds_coach(tmp_path: Path):
    seed = tmp_path / "objection_examples.json"
    seed.write_text(
        '[{"type":"price","quote":"q","intensity":"low",'
        '"rep_response_worked":"yes","context":"c"}]',
        encoding="utf-8",
    )
    factory = build_coach_factory(
        rubric="r",
        retriever=SeedRetriever(seed),
        complete=lambda p: "{}",
        rep_id="jenn",
        session_id="s1",
        character="burned_before_skeptic",
        scorecards_dir=tmp_path,
        mem0=None,
    )
    coach = factory(ChatContext())
    assert isinstance(coach, CoachAgent)
