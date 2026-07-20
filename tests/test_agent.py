"""Behavior tests for the prospect training agent.

Uses LiveKit Inference as an impartial judge model, so these run on your
LIVEKIT_* credentials alone (no OpenRouter tokens burned). Run: uv run pytest
"""

import pytest
from livekit.agents import AgentSession, inference, llm

from agent import ProspectAgent
from context.assembler import assemble
from context.renderer import render_buyer
from context.selection import DEFAULT_SELECTION


def _llm() -> llm.LLM:
    return inference.LLM(model="openai/gpt-4.1-mini")


def _prospect_prompt() -> str:
    # The buyer prompt now comes from the context pipeline (render_buyer), the
    # same path the runtime uses, instead of the retired legacy persona renderer.
    context, _ = assemble(DEFAULT_SELECTION)
    return render_buyer(context)


@pytest.mark.asyncio
async def test_prospect_stays_in_character_and_objects() -> None:
    """The prospect persona resists and raises an objection rather than selling."""
    prompt = _prospect_prompt()
    async with (
        _llm() as judge,
        AgentSession(llm=judge) as session,
    ):
        await session.start(ProspectAgent(prompt))
        result = await session.run(
            user_input="Hi, I'd love to tell you about our casting program!"
        )
        await (
            result.expect.next_event()
            .is_message(role="assistant")
            .judge(
                judge,
                intent="Responds AS a guarded prospect/customer being sold to — "
                "e.g. skeptical, non-committal, or raising a concern about trust, "
                "price, or needing to check with a partner. It does NOT act as the "
                "salesperson and does NOT pitch a product.",
            )
        )
        result.expect.no_more_events()
