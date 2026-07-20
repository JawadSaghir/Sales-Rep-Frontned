"""Regression guard: this is a voice-only agent.

The Beyond Presence (BEY) video avatar was removed on purpose (see mission.md:
"voice-only agent"). It crashed in `console` mode because console runs against a
mock room whose LocalParticipant has no private `_rpc_handlers` for the avatar's
playback-finished RPC. These offline checks fail loudly if the avatar wiring is
ever reintroduced, so console mode can't silently break again.

Run with: uv run pytest
"""

from pathlib import Path

import agent as agent_module

# Importing `agent` at all proves the module loads without pulling the bey plugin.
AGENT_SRC = Path(agent_module.__file__).read_text(encoding="utf-8")


def test_agent_module_has_no_avatar_helper() -> None:
    assert not hasattr(agent_module, "start_avatar")


def test_source_has_no_bey_avatar_wiring() -> None:
    assert "bey" not in AGENT_SRC
    assert "AvatarSession" not in AGENT_SRC
    assert "start_avatar" not in AGENT_SRC
