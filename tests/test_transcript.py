"""Unit tests for call-transcript writing.

These are pure/offline: they build a ChatContext by hand and never touch the
network, LiveKit Inference, or any provider keys. Run with: uv run pytest
"""

from livekit.agents import ChatContext

from agent import format_transcript, write_transcript


def _sample_ctx() -> ChatContext:
    ctx = ChatContext()
    ctx.add_message(role="user", content="Hi")
    ctx.add_message(role="assistant", content="Hello, this is Alex.")
    return ctx


def test_format_transcript_renders_speaker_lines() -> None:
    text = format_transcript(_sample_ctx())
    assert "Prospect: Hi" in text
    assert "Rep: Hello, this is Alex." in text


def test_write_transcript_creates_file(tmp_path) -> None:
    path = write_transcript(_sample_ctx(), "test-room", out_dir=tmp_path)
    assert path.exists()
    assert path.suffix == ".txt"
    content = path.read_text(encoding="utf-8")
    assert "test-room" in content
    assert "Prospect: Hi" in content
    assert "Rep: Hello, this is Alex." in content
