from dataclasses import FrozenInstanceError

from context import CONTEXT_DATA, assembler, loaders
from context import models as m
from context.models import Selection


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


def test_real_content_loads():
    d = CONTEXT_DATA
    sys_ = loaders.load_system(d / "system" / "system.yaml")
    assert sys_.rules and "character" in " ".join(sys_.rules).lower()
    loaders.load_policy(d / "policy" / "conversation.yaml")
    p = loaders.load_persona(d / "personas" / "april-alvarado.yaml")
    assert p.name and p.company_id
    loaders.load_company(d / "companies" / f"{p.company_id}.yaml")
    for level in ["easy", "medium", "hard"]:
        assert loaders.load_difficulty(d / "difficulty" / f"{level}.yaml").framing
    for ct in ["closing", "discovery", "follow_up"]:
        loaders.load_call_type(d / "call_types" / f"{ct}.yaml")
    for oid in ["trust", "timing", "finances"]:
        assert loaders.load_objection_card(d / "objections" / f"{oid}.yaml").buyer_language
    loaders.load_scorecard(d / "scorecards" / "closing_v1.yaml")
    sc = loaders.load_scenario(d / "scenarios" / "april-alvarado.yaml")
    assert sc.default_objection_ids  # scenario names its default objections


def test_merge_objection_ids_hybrid():
    out = assembler.merge_objection_ids(("authority", "pricing"), ("security",), ("pricing",))
    assert out == ("authority", "security")  # add appended, remove dropped, order kept, deduped


def test_assemble_real_selection_builds_context_and_manifest():
    sel = Selection(persona_id="april-alvarado", scenario_id="april-alvarado",
                    call_type="closing", difficulty="hard", scorecard="closing_v1")
    ctx, manifest = assembler.assemble(sel)
    assert ctx.persona.name == "April Alvarado"
    assert ctx.company.name == "April's Beauty Bar"        # loaded via persona.company_id
    assert ctx.difficulty.level == "hard"
    assert ctx.objection_pack.card_ids[:1] == ("trust",)    # scenario default, first = primary
    assert ctx.knowledge.items == () and ctx.state is None and ctx.memory is None
    assert "objection_pack" in manifest.included_layers
    assert {"knowledge", "state", "memory"} <= set(manifest.omitted_layers)


def test_assemble_session_override_objections():
    sel = Selection(persona_id="april-alvarado", scenario_id="april-alvarado",
                    call_type="closing", difficulty="medium", scorecard="closing_v1",
                    add_objection_ids=("authority",), remove_objection_ids=("finances",))
    ctx, _ = assembler.assemble(sel)
    assert "authority" in ctx.objection_pack.card_ids
    assert "finances" not in ctx.objection_pack.card_ids


def _ctx():
    return assembler.assemble(Selection(persona_id="april-alvarado",
        scenario_id="april-alvarado", call_type="closing", difficulty="hard",
        scorecard="closing_v1"))[0]


def test_validate_accepts_real_context():
    from context import validator
    validator.validate(_ctx())  # must not raise


def test_validate_rejects_empty_objection_pack():
    import dataclasses

    import pytest

    from context import validator
    from context.models import ObjectionPack
    ctx = dataclasses.replace(_ctx(), objection_pack=ObjectionPack(cards=()))
    with pytest.raises(validator.ValidationError):
        validator.validate(ctx)


def test_validate_rejects_missing_persona_name():
    import dataclasses

    import pytest

    from context import validator
    ctx = _ctx()
    bad = dataclasses.replace(ctx, persona=dataclasses.replace(ctx.persona, name=""))
    with pytest.raises(validator.ValidationError):
        validator.validate(bad)


def test_render_buyer_canonical_order_and_content():
    from context import renderer
    out = renderer.render_buyer(_ctx())
    # canonical order: SYSTEM before POLICY before DIFFICULTY before PERSONA
    assert out.index("# SYSTEM") < out.index("# CONVERSATION POLICY") \
        < out.index("# DIFFICULTY") < out.index("# WHO YOU ARE")
    assert "April Alvarado" in out                 # persona
    assert "skeptical" in out                       # difficulty framing
    assert "mixed reviews" in out.lower()           # objection buyer_language
    assert "{{" not in out                          # no unfilled placeholders
    # evaluation / state / memory never leak into the buyer prompt
    assert "scorecard" not in out.lower() and "criteria" not in out.lower()


def test_render_evaluator_has_criteria_and_is_separate():
    from context import renderer
    ctx = _ctx()
    ev = renderer.render_evaluator(ctx)
    assert "closing_v1" in ev
    assert ev != renderer.render_buyer(ctx)
