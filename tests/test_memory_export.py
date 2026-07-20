"""Unit tests for the Mem0 export formatting (no network required)."""

import json

from src.memory_export import (
    build_snapshot,
    fetch_all,
    render_markdown,
    simplify_memory,
    write_export,
)

_RAW = {
    "id": "abc-123",
    "memory": "User will offer a 70% discount.",
    "user_id": "unknown",
    "metadata": None,
    "categories": ["professional_details"],
    "created_at": "2026-07-16T09:25:47-07:00",
    "updated_at": "2026-07-16T10:34:28-07:00",
    "structured_attributes": {"year": 2026},
}


class _FakeClient:
    """Minimal stand-in for Mem0's MemoryClient."""

    def __init__(self, by_user):
        self._by_user = by_user

    def users(self):
        return {"results": [{"name": u} for u in self._by_user]}

    def get_all(self, version=None, filters=None):
        return {"results": self._by_user[filters["user_id"]]}


def test_simplify_memory_keeps_human_fields_and_drops_internals():
    simplified = simplify_memory(_RAW)

    assert simplified == {
        "id": "abc-123",
        "memory": "User will offer a 70% discount.",
        "categories": ["professional_details"],
        "created_at": "2026-07-16T09:25:47-07:00",
        "updated_at": "2026-07-16T10:34:28-07:00",
    }
    assert "structured_attributes" not in simplified


def test_simplify_memory_defaults_missing_categories_to_empty_list():
    assert simplify_memory({"memory": "x"})["categories"] == []


def test_build_snapshot_counts_and_sorts_users():
    snapshot = build_snapshot(
        {"zeb": [_RAW], "amy": []},
        generated_at="2026-07-17T12:00:00Z",
    )

    assert snapshot["total_memories"] == 1
    assert snapshot["user_count"] == 2
    assert list(snapshot["users"]) == ["amy", "zeb"]  # sorted
    assert snapshot["users"]["zeb"]["count"] == 1
    assert snapshot["generated_at"] == "2026-07-17T12:00:00Z"


def test_render_markdown_includes_memory_text_and_headers():
    snapshot = build_snapshot({"unknown": [_RAW]}, generated_at="NOW")
    md = render_markdown(snapshot)

    assert "# Mem0 memory snapshot" in md
    assert "## unknown (1)" in md
    assert "User will offer a 70% discount." in md
    assert "professional_details" in md


def test_render_markdown_handles_user_with_no_memories():
    snapshot = build_snapshot({"empty": []}, generated_at="NOW")
    assert "_No memories._" in render_markdown(snapshot)


def test_fetch_all_scopes_each_user(monkeypatch):
    client = _FakeClient({"unknown": [_RAW], "playground": []})
    assert fetch_all(client) == {"unknown": [_RAW], "playground": []}


def test_write_export_writes_json_and_markdown(tmp_path):
    snapshot = write_export(
        tmp_path,
        {"unknown": [_RAW]},
        generated_at="2026-07-17T12:00:00Z",
    )

    raw = json.loads((tmp_path / "memories.json").read_text(encoding="utf-8"))
    # JSON keeps full fidelity, including internal fields.
    assert raw["users"]["unknown"][0]["structured_attributes"] == {"year": 2026}

    # YAML is intentionally not produced.
    assert not (tmp_path / "memories.yaml").exists()

    md = (tmp_path / "index.md").read_text(encoding="utf-8")
    assert "User will offer a 70% discount." in md
    assert snapshot["total_memories"] == 1
