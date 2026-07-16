"""Behavior tests for the voice agent.

These use LiveKit Inference as an impartial "judge" model to evaluate the
agent's replies, so they run on your LIVEKIT_* credentials alone (no OpenRouter
tokens burned). Run with: uv run pytest
"""

import pytest
from livekit.agents import AgentSession, inference, llm

from agent import Assistant, ProspectAgent
from personas import build_prospect_prompt


def _llm() -> llm.LLM:
    return inference.LLM(model="openai/gpt-4.1-mini")


@pytest.mark.asyncio
async def test_greets_with_rapport() -> None:
    """The agent (a rapport-first sales rep) should open warmly and build rapport.

    Per the persona in prompts/agent-instructions.md, Alex opens with the rapport
    stage — a warm, human greeting that invites the prospect to talk (e.g. asking
    how they're doing or what brought them to the call) — rather than immediately
    pitching or listing ways it can help.
    """
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
                intent="Greets the caller warmly and in a human, conversational way, "
                "and builds rapport — for example by asking how they're doing or what "
                "brought them to the call. It does NOT immediately pitch a product or "
                "list features. A light offer to help is acceptable but not required.",
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
