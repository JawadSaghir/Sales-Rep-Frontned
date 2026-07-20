"""Unit tests for formatting chat context into Mem0 memory messages.

These are pure/offline: they build a ChatContext by hand and never touch the
network, Mem0, or any provider keys. Run with: uv run pytest

Regression context: the original inline loop assumed every ChatContext item had
a `.content` attribute. Once the buyer persona started emitting tool calls
(`log_prospect_signal` fires on most turns), shutdown crashed with
`AttributeError: 'FunctionCall' object has no attribute 'content'` and the
long-term memory save silently never ran.
"""

from livekit.agents import ChatContext
from livekit.agents.llm import FunctionCall, FunctionCallOutput

from agent import format_memory_messages


def _ctx_with_tool_calls() -> ChatContext:
    ctx = ChatContext()
    ctx.add_message(role="user", content="Can you hear me?")
    ctx.items.append(
        FunctionCall(
            call_id="call_1",
            name="log_prospect_signal",
            arguments='{"signal_type": "interest"}',
        )
    )
    ctx.items.append(
        FunctionCallOutput(
            call_id="call_1",
            name="log_prospect_signal",
            output="",
            is_error=False,
        )
    )
    ctx.add_message(role="assistant", content="Yeah, I can hear you.")
    return ctx


def test_tool_calls_do_not_crash_and_are_excluded() -> None:
    messages = format_memory_messages(_ctx_with_tool_calls(), memory_str="")
    assert messages == [
        {"role": "user", "content": "Can you hear me?"},
        {"role": "assistant", "content": "Yeah, I can hear you."},
    ]


def test_injected_memory_message_is_excluded() -> None:
    memory_str = "Randy is blunt and gruff."
    ctx = ChatContext()
    ctx.add_message(
        role="assistant",
        content=f"Relevant context about this caller: {memory_str}",
    )
    ctx.add_message(role="user", content="So what's this about?")

    messages = format_memory_messages(ctx, memory_str=memory_str)

    assert messages == [{"role": "user", "content": "So what's this about?"}]


def test_content_is_stripped() -> None:
    ctx = ChatContext()
    ctx.add_message(role="user", content="  padded  ")

    messages = format_memory_messages(ctx, memory_str="")

    assert messages == [{"role": "user", "content": "padded"}]


def test_empty_context_returns_empty_list() -> None:
    assert format_memory_messages(ChatContext(), memory_str="") == []
