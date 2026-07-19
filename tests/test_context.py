from dataclasses import FrozenInstanceError

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
