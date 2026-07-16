from identity import resolve_rep_id


def test_prefers_room_metadata_rep_id():
    assert resolve_rep_id('{"rep_id": "Jenn O"}', "sip_123", "envrep") == "jenn_o"


def test_falls_back_to_participant_identity():
    assert resolve_rep_id(None, "Marco Garcia", "envrep") == "marco_garcia"


def test_falls_back_to_env_then_unknown():
    assert resolve_rep_id(None, None, "EnvRep") == "envrep"
    assert resolve_rep_id(None, None, None) == "unknown"


def test_ignores_malformed_metadata():
    assert resolve_rep_id("not-json", "Marco", None) == "marco"
