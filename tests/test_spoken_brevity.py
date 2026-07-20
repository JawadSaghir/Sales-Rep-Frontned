"""The prospect prompt must constrain replies for *speech*, not prose.

The buyer prompt once produced essay-length turns with markdown stage directions
(`*pauses briefly, then responds*`) — ~1200 characters per reply. Deepgram then
logged `flush audio emitter due to slow audio generation` while synthesising it,
and the rep heard nothing for many seconds.

The spoken/brevity/no-markup rules used to live in the (now removed) `system`
layer; they are now baked directly into `render_buyer()`. These tests assert
against the *rendered* buyer prompt — the actual text the LLM receives — so they
hold regardless of where the rules are authored.
"""

from __future__ import annotations

from context.assembler import assemble
from context.renderer import render_buyer
from context.selection import DEFAULT_SELECTION

_SPOKEN_HINTS = ("speak", "spoken", "aloud", "hear", "listening", "out loud")
_BREVITY_HINTS = ("short", "brief", "concise", "sentence")
_FORMATTING_HINTS = ("asterisk", "stage direction", "markdown", "narrat", "emoji")


def _rendered() -> str:
    context, _ = assemble(DEFAULT_SELECTION)
    return render_buyer(context).lower()


def test_prompt_says_the_conversation_is_spoken():
    text = _rendered()
    assert any(h in text for h in _SPOKEN_HINTS), (
        "prompt never tells the model its output is spoken aloud, so it writes "
        f"prose; expected one of {_SPOKEN_HINTS}"
    )


def test_prompt_constrains_reply_length():
    text = _rendered()
    assert any(h in text for h in _BREVITY_HINTS), (
        f"prompt never limits reply length; expected one of {_BREVITY_HINTS}"
    )


def test_prompt_forbids_stage_directions_and_markup():
    text = _rendered()
    assert any(h in text for h in _FORMATTING_HINTS), (
        "prompt never forbids narration like '*pauses briefly*', which TTS reads "
        f"aloud or stumbles over; expected one of {_FORMATTING_HINTS}"
    )
