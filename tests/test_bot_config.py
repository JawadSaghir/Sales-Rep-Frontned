import json

import pytest

from src import bot_config, bot_enrich, bot_extract
from src.personas import PROMPTS_DIR


def test_load_layer_reads_yaml(tmp_path):
    d = tmp_path / "personas"
    d.mkdir()
    (d / "acme.yaml").write_text(
        "character_name: April\nindustry: Wellness/Beauty\n", encoding="utf-8"
    )
    layer = bot_config.load_layer("personas", "acme", prompts_dir=tmp_path)
    assert layer["character_name"] == "April"
    assert layer["industry"] == "Wellness/Beauty"


def test_load_layer_unknown_kind_raises(tmp_path):
    import pytest

    with pytest.raises(KeyError):
        bot_config.load_layer("not_a_kind", "x", prompts_dir=tmp_path)


def test_authored_call_types_and_difficulty_load():
    for ct in ["closing", "discovery", "follow_up"]:
        layer = bot_config.load_layer("call_types", ct)
        assert layer["call_type"] == ct
        assert layer["frame"].strip()
        assert layer["rep_objective"].strip()
    for lvl in ["easy", "medium", "hard"]:
        d = bot_config.load_layer("difficulty", lvl)
        assert d["level"] == lvl
        assert isinstance(d["shutdown_threshold"], int)


def test_behavior_template_has_new_placeholders():
    text = (PROMPTS_DIR / "behavior_template.md").read_text(encoding="utf-8")
    for ph in ["{{call_type_frame}}", "{{rep_objective}}", "{{difficulty_framing}}"]:
        assert ph in text


_REAL_ROW = {
    "Meeting ID": "rec123",
    "Client Name": "April Alvarado",
    "Business name": "April's Beauty Bar",
    "Indusrtry": "Wellness/Beauty",
    "Sub-industry": "Cosmetology / Nail & Beauty Services",
    "Objection/Friction": "Trust,Timing,Finances",
    "Buying Authority": "No",
    "Motivation": "Credibility/Authority,Brand Narrative,Growth/ROI",
    "Business Stage": "Solo home-based cosmetologist in Denver planning brick-and-mortar.",
    "Package Discussed": "Light,Standard,VIP",
    "Call Disposition": "Scheduled Follow-Up",
}


def test_clean_and_split():
    assert bot_extract.clean("None") == ""
    assert bot_extract.clean("Unknown") == ""
    assert bot_extract.clean("  Wellness ") == "Wellness"
    assert bot_extract.split_list("Trust, Timing ,Finances") == [
        "Trust",
        "Timing",
        "Finances",
    ]
    assert bot_extract.split_list("None") == []


def test_row_to_layers_maps_real_fields():
    out = bot_extract.row_to_layers(_REAL_ROW)
    p, s, o = out["persona"], out["scenario"], out["objection_card"]
    assert p["character_name"] == "April Alvarado"
    assert p["business_name"] == "April's Beauty Bar"
    assert p["industry"] == "Wellness/Beauty"
    assert p["buying_authority"] is False
    assert p["motivations"] == [
        "credibility_authority",
        "brand_narrative",
        "growth_roi",
    ]
    assert s["situation"].startswith("Solo home-based")
    assert s["offer_on_table"] == ["Light", "Standard", "VIP"]
    assert s["disposition_context"] == "Scheduled Follow-Up"
    assert o["objection_types"] == ["trust", "timing", "finances"]
    assert o["primary"] == "trust"
    assert p["source_meeting_id"] == "rec123"


def test_row_to_layers_slugs_multiword_objections():
    row = dict(
        _REAL_ROW, **{"Objection/Friction": "Business Fit, Personality Fit ,Trust"}
    )
    o = bot_extract.row_to_layers(row)["objection_card"]
    assert o["objection_types"] == ["business_fit", "personality_fit", "trust"]
    assert o["primary"] == "business_fit"


def test_scorecard_loads_and_validates():
    sc = bot_config.load_scorecard("closing_v1")
    bot_config.validate_scorecard(sc)  # must not raise
    total = sum(c["weight"] for c in sc["criteria"])
    assert abs(total - 1.0) < 1e-6
    for c in sc["criteria"]:
        assert c["key"] in bot_config.REAL_SCORE_COLUMNS


def test_validate_scorecard_rejects_bad_weights_and_keys():
    import pytest

    with pytest.raises(ValueError):
        bot_config.validate_scorecard(
            {"criteria": [{"key": "objection_handling", "weight": 0.5}]}
        )  # sums to 0.5
    with pytest.raises(ValueError):
        bot_config.validate_scorecard(
            {"criteria": [{"key": "not_a_real_column", "weight": 1.0}]}
        )


def test_parse_enrichment_valid():
    content = json.dumps(
        {
            "speech_style_description": "warm, direct",
            "signature_phrases": ["you know?"],
            "character_core_motivation": "prove she's legit",
            "baseline_tone": "guarded",
            "shutdown_line": "I'm done here.",
            "character_backstory": "solo cosmetologist for 6 years",
            "example_lines": {
                "trust": ["how do I know this works?"],
                "timing": ["not now"],
            },
        }
    )
    out = bot_enrich.parse_enrichment(content, ["trust", "timing"])
    assert out["speech_style_description"] == "warm, direct"
    assert out["example_lines"]["trust"] == ["how do I know this works?"]


def test_parse_enrichment_missing_objection_lines_raises():
    content = json.dumps(
        dict.fromkeys(bot_enrich.ENRICH_KEYS, "x")
        | {"signature_phrases": ["a"], "example_lines": {"trust": ["q"]}}
    )
    with pytest.raises(ValueError):
        bot_enrich.parse_enrichment(content, ["trust", "timing"])  # 'timing' missing
