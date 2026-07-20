"""The coach handoff must not stall the voice pipeline.

`score_session` sends the whole transcript to OpenRouter through a *synchronous*
`complete()` adapter (see `make_openrouter_complete` in src/agent.py). Awaiting
nothing while that runs blocks the event loop, which freezes audio I/O, STT and
turn detection for the whole scoring call — the agent goes dead mid-session
exactly when the prospect hands off to the coach.

`src/agent.py` already offloads its two other blocking calls (`AsyncMemoryClient`
construction, the Mem0 snapshot dump) with `asyncio.to_thread`; this pins the
same requirement for scoring.
"""

from __future__ import annotations

import asyncio
import time

import pytest

from coaching import CoachAgent
from scorecard import Scorecard

BLOCKING_SECONDS = 0.6
HEARTBEAT_INTERVAL = 0.02


class _StubSession:
    """Stands in for AgentSession — records the debrief instead of speaking."""

    def __init__(self) -> None:
        self.replies: list[str] = []

    async def generate_reply(self, *, instructions: str) -> None:
        self.replies.append(instructions)


def _make_coach(monkeypatch, session) -> CoachAgent:
    coach = CoachAgent(
        transcript="Rep: hello\nProspect: not interested",
        rubric="rubric text",
        retriever=object(),
        complete=lambda _prompt: "{}",
        rep_id="rep-1",
        session_id="sess-1",
        character="april-alvarado-closing",
        scorecards_dir=None,
        mem0=None,
    )
    # CoachAgent.session is a read-only Agent property; patch on the instance's
    # type is unnecessary — bind our stub directly.
    monkeypatch.setattr(type(coach), "session", property(lambda _self: session))
    return coach


@pytest.mark.asyncio
async def test_on_enter_does_not_block_the_event_loop(monkeypatch, tmp_path):
    """A slow scoring call must yield to the loop, not freeze it."""
    import coaching

    def _slow_score(*_args, **_kwargs):
        time.sleep(BLOCKING_SECONDS)  # stand-in for the blocking HTTP request
        return Scorecard(
            rep_id="rep-1",
            session_id="sess-1",
            character="april-alvarado-closing",
            overall_grade="B",
            per_objection=[],
            notes="",
        )

    monkeypatch.setattr(coaching, "score_session", _slow_score)
    monkeypatch.setattr(coaching, "save_scorecard", lambda *a, **k: None)

    session = _StubSession()
    coach = _make_coach(monkeypatch, session)
    coach._scorecards_dir = tmp_path

    ticks = 0

    async def heartbeat() -> None:
        nonlocal ticks
        while True:
            await asyncio.sleep(HEARTBEAT_INTERVAL)
            ticks += 1

    beat = asyncio.create_task(heartbeat())
    await coach.on_enter()
    beat.cancel()

    assert session.replies, "coach should still deliver its debrief"
    # A responsive loop ticks ~30x during a 0.6s scoring call. A blocked loop
    # ticks 0-1 times. Assert well clear of both to stay robust on slow CI.
    assert ticks >= 5, (
        f"event loop was blocked during scoring — only {ticks} heartbeat tick(s) "
        f"in {BLOCKING_SECONDS}s; audio/STT would be frozen for that long"
    )
