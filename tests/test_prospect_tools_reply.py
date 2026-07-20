"""Prospect tools must not silently end the turn.

livekit-agents decides whether to speak after a tool call with, in
`voice/generation.py::make_tool_output`:

    reply_required=fnc_out is not None  # require a reply if the tool returned an output

and then in `voice/agent_activity.py`:

    if fnc_executed_ev._reply_required and not speech_handle.interrupted:
        ...generate the spoken reply

So a tool returning ``None`` makes the agent produce **no speech at all** for
that turn. `log_prospect_signal` is called often mid-roleplay (any interest or
buying signal), and returning None there made the prospect go mute exactly when
the rep said something encouraging — observed live as the agent answering a few
turns and then dying.
"""

from __future__ import annotations

import pytest

from agent import ProspectAgent


@pytest.fixture
def prospect() -> ProspectAgent:
    return ProspectAgent("You are a skeptical prospect.")


async def test_log_prospect_signal_returns_output_so_the_agent_still_speaks(prospect):
    """A silent tool must still hand back output, or the turn produces no speech."""
    result = await prospect.log_prospect_signal.__wrapped__(
        prospect, None, "interest", "Okay, I hear that."
    )

    assert result is not None, (
        "returning None sets reply_required=False in livekit-agents, so the "
        "prospect stays silent for the whole turn"
    )


async def test_log_prospect_signal_still_records_the_signal(prospect):
    """The debrief depends on these; returning output must not lose them."""
    await prospect.log_prospect_signal.__wrapped__(
        prospect, None, "buying_signal", "How soon could we start?"
    )

    assert prospect.signals == [
        {"signal_type": "buying_signal", "quote": "How soon could we start?"}
    ]


@pytest.mark.parametrize(
    "tool_name, args",
    [
        ("end_practice_and_get_feedback", ()),
        ("end_call", ("hard no",)),
    ],
)
async def test_ending_tools_return_output(prospect, tool_name, args):
    """The handoff tools already return output — guard against regression."""
    tool = getattr(prospect, tool_name)
    result = await tool.__wrapped__(prospect, None, *args)

    assert result is not None
