import pytest

from personas import (
    PERSONAS_DIR,
    build_briefing,
    build_prospect_prompt,
    load_persona,
    render_prompt,
)

PERSONA_STEMS = sorted(p.stem for p in PERSONAS_DIR.glob("*.yaml"))


def test_personas_exist():
    assert PERSONA_STEMS, "no persona YAML files found"


@pytest.mark.parametrize("stem", PERSONA_STEMS)
def test_persona_renders_with_no_unfilled_blanks(stem):
    prompt = build_prospect_prompt(stem)
    assert "{{" not in prompt
    assert "}}" not in prompt
    # Offer context and the closing frame are always present.
    assert "Inside Success TV" in prompt
    assert prompt.strip().endswith("REACT.")


def test_burned_before_skeptic_has_name_and_upper():
    prompt = build_prospect_prompt("burned_before_skeptic")
    assert "Randy" in prompt
    assert "RANDY" in prompt  # {{character_name_upper}} derived value


def test_render_prompt_raises_on_missing_field():
    with pytest.raises(KeyError):
        render_prompt("Hello {{missing}}", {"present": "x"})


@pytest.mark.parametrize("stem", PERSONA_STEMS)
def test_briefing_has_name_and_objections(stem):
    briefing = build_briefing(stem)
    persona = load_persona(stem)
    assert "{{" not in briefing
    assert str(persona["character_name"]) in briefing
    assert persona["primary_objection_type"] in briefing
    assert briefing.strip().endswith("start your call.")
