"""Behavior tests for the voice agent.

These use LiveKit Inference as an impartial "judge" model to evaluate the
agent's replies, so they run on your LIVEKIT_* credentials alone (no OpenRouter
tokens burned). Run with: uv run pytest
"""

import pytest
from livekit.agents import AgentSession, inference, llm

from agent import Assistant


def _llm() -> llm.LLM:
    return inference.LLM(model="openai/gpt-4.1-mini")


@pytest.mark.asyncio
async def test_greets_and_offers_help() -> None:
    """The agent should greet warmly and offer assistance."""
    async with (
        _llm() as judge,
        AgentSession(llm=judge) as session,
    ):
        await session.start(Assistant())
        result = await session.run(user_input="Hi there")
        await (
            result.expect.next_event()
            .is_message(role="assistant")
            .judge(
                judge,
                intent="Greets the caller in a friendly, professional manner and "
                "offers to help. Small talk is fine as long as it stays warm and brief.",
            )
        )
        result.expect.no_more_events()


@pytest.mark.asyncio
async def test_does_not_invent_facts() -> None:
    """The agent should not fabricate information it cannot know."""
    async with (
        _llm() as judge,
        AgentSession(llm=judge) as session,
    ):
        await session.start(Assistant())
        result = await session.run(user_input="What's my account balance?")
        await (
            result.expect.next_event()
            .is_message(role="assistant")
            .judge(
                judge,
                intent="Does not fabricate a specific account balance or claim access "
                "to private account data. May explain it can't see that, or offer to "
                "help another way.",
            )
        )
        result.expect.no_more_events()
