from dataclasses import FrozenInstanceError

from context import loaders
from context import models as m


def test_models_construct_and_are_frozen():
    import pytest

    meta = m.LayerMeta(id="hard", version=1, priority=60)
    diff = m.Difficulty(
        meta=meta, level="hard", framing="You are skeptical."
    )
    assert diff.level == "hard" and diff.meta.priority == 60
    with pytest.raises(FrozenInstanceError):
        diff.level = "easy"  # frozen


def test_objection_pack_primary_and_ids():
    meta = lambda i: m.LayerMeta(id=i)  # noqa: E731
    c1 = m.ObjectionCard(
        meta=meta("trust"),
        trigger="t",
        emotion="guarded",
        buyer_language=("How do I know?",),
        acceptable_resolution="proof",
        coach_signal="acknowledged",
    )
    c2 = m.ObjectionCard(
        meta=meta("timing"),
        trigger="t",
        emotion="busy",
        buyer_language=("Not now.",),
        acceptable_resolution="urgency",
        coach_signal="created urgency",
    )
    pack = m.ObjectionPack(cards=(c1, c2))
    assert pack.primary is c1
    assert pack.card_ids == ("trust", "timing")
    assert m.ObjectionPack(cards=()).primary is None


def test_load_difficulty_and_meta(tmp_path):
    p = tmp_path / "hard.yaml"
    p.write_text("id: hard\nversion: 2\npriority: 60\nlevel: hard\n"
                 "framing: You are skeptical and interrupt weak answers.\n", encoding="utf-8")
    d = loaders.load_difficulty(p)
    assert d.level == "hard" and d.meta.version == 2 and d.meta.priority == 60
    assert "skeptical" in d.framing


def test_load_objection_card(tmp_path):
    p = tmp_path / "trust.yaml"
    p.write_text(
        "id: trust\ntrigger: burned before\nemotion: guarded\n"
        "buyer_language:\n  - How do I know this works?\n"
        "acceptable_resolution: proof\ncoach_signal: acknowledged then evidence\n",
        encoding="utf-8")
    c = loaders.load_objection_card(p)
    assert c.meta.id == "trust" and c.buyer_language == ("How do I know this works?",)


def test_loader_rejects_missing_required_field(tmp_path):
    import pytest
    p = tmp_path / "bad.yaml"
    p.write_text("id: x\nlevel: hard\n", encoding="utf-8")  # missing 'framing'
    with pytest.raises(loaders.LoaderError):
        loaders.load_difficulty(p)


def test_load_scorecard_requires_criteria(tmp_path):
    import pytest
    p = tmp_path / "sc.yaml"
    p.write_text("id: sc\nname: closing_v1\n", encoding="utf-8")  # no criteria
    with pytest.raises(loaders.LoaderError):
        loaders.load_scorecard(p)
