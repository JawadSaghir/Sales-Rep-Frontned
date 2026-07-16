"""Behavior tests for the prospect training agent.

Uses LiveKit Inference as an impartial judge model, so these run on your
LIVEKIT_* credentials alone (no OpenRouter tokens burned). Run: uv run pytest
"""

import pytest
from livekit.agents import AgentSession, inference, llm

from agent import ProspectAgent
from personas import build_prospect_prompt


def _llm() -> llm.LLM:
    return inference.LLM(model="openai/gpt-4.1-mini")


@pytest.mark.asyncio
async def test_prospect_stays_in_character_and_objects() -> None:
    """The prospect persona resists and raises an objection rather than selling."""
    prompt = build_prospect_prompt("burned_before_skeptic")
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
