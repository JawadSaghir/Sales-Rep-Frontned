
from src import bot_config


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
