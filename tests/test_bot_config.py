from src import bot_config
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
