from src import bot_config, bot_extract
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


def _seed_bot(tmp_path):
    # minimal fixture bot + layers under tmp_path mirroring prompts/ dirs
    (tmp_path / "bots").mkdir()
    (tmp_path / "personas").mkdir()
    (tmp_path / "scenarios").mkdir()
    (tmp_path / "objection_cards").mkdir()
    (tmp_path / "call_types").mkdir()
    (tmp_path / "difficulty").mkdir()
    (tmp_path / "bots" / "b.yaml").write_text(
        "slug: b\npersona: p\nscenario: s\nobjection_card: o\n"
        "call_type: closing\ndifficulty: medium\nscorecard: closing_v1\n",
        encoding="utf-8",
    )
    (tmp_path / "personas" / "p.yaml").write_text(
        "character_name: April\ncharacter_age: 38\n"
        "character_background: owner of April's Beauty Bar\n"
        "character_backstory: solo cosmetologist\n"
        "character_core_motivation: build credibility\n"
        'speech_style_description: warm, direct\nsignature_phrases: ["you know"]\n'
        "baseline_tone: guarded\n",
        encoding="utf-8",
    )
    (tmp_path / "scenarios" / "s.yaml").write_text(
        "call_type: closing\nsituation: expanding to brick-and-mortar\n"
        "offer_on_table: [Light, Standard, VIP]\n"
        "what_would_flip_them: proof it converts\n"
        "disposition_context: Scheduled Follow-Up\nshutdown_line: I'm done here.\n",
        encoding="utf-8",
    )
    (tmp_path / "objection_cards" / "o.yaml").write_text(
        "objection_types: [trust, timing, finances]\nprimary: trust\n"
        "primary_objection_type: trust\n"
        "primary_objection_underlying_feeling: fear of wasting money\n"
        'primary_objection_example_lines: ["how do I know this works?"]\n'
        "secondary_objection_type: timing\n"
        'secondary_objection_example_lines: ["not right now"]\n'
        "tertiary_objection_type: finances\n"
        'tertiary_objection_example_lines: ["it\'s a lot of money"]\n',
        encoding="utf-8",
    )
    (tmp_path / "call_types" / "closing.yaml").write_text(
        "call_type: closing\nframe: Rapport is built; present the offer.\n"
        "rep_objective: Get a dated commitment.\n",
        encoding="utf-8",
    )
    (tmp_path / "difficulty" / "medium.yaml").write_text(
        "level: medium\nskepticism_baseline: guarded\nobjections_stack: true\n"
        "softening_speed: normal\nshutdown_threshold: 2\n",
        encoding="utf-8",
    )


def test_build_bot_prompt_composes_layers(tmp_path):
    _seed_bot(tmp_path)
    prompt = bot_config.build_bot_prompt("b", prompts_dir=tmp_path)
    assert "April" in prompt
    assert "present the offer" in prompt  # call_type frame
    assert "Get a dated commitment" in prompt  # rep_objective
    assert "guarded" in prompt  # difficulty framing
    assert "{{" not in prompt  # no unfilled placeholders


def test_build_bot_prompt_missing_layer_raises(tmp_path):
    import pytest

    _seed_bot(tmp_path)
    (tmp_path / "personas" / "p.yaml").unlink()
    with pytest.raises(FileNotFoundError):
        bot_config.build_bot_prompt("b", prompts_dir=tmp_path)


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
