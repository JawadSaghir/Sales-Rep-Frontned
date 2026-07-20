"""Coach agent: scores a finished practice call and debriefs the rep.

This module imports livekit (Agent) and so cannot be collected on machines where
PyAV is blocked; its pure debrief logic lives in debrief.py, which is tested
directly.
"""

import asyncio
import logging
from collections.abc import Callable
from pathlib import Path

from livekit.agents import Agent, ChatContext

from debrief import build_debrief_instructions
from retrieval import Retriever
from scorecard import save_scorecard
from scoring import score_session

logger = logging.getLogger("agent.coaching")


class CoachAgent(Agent):
    def __init__(
        self,
        *,
        transcript: str,
        rubric: str,
        retriever: Retriever,
        complete: Callable[[str], str],
        rep_id: str,
        session_id: str,
        character: str,
        scorecards_dir: Path,
        mem0=None,
        chat_ctx: ChatContext | None = None,
    ) -> None:
        super().__init__(
            instructions="You are a sales coach debriefing a rep after practice.",
            chat_ctx=chat_ctx,
        )
        self._transcript = transcript
        self._rubric = rubric
        self._retriever = retriever
        self._complete = complete
        self._rep_id = rep_id
        self._session_id = session_id
        self._character = character
        self._scorecards_dir = scorecards_dir
        self._mem0 = mem0

    async def on_enter(self) -> None:
        # score_session() is synchronous and sends the whole transcript to
        # OpenRouter, so calling it directly here froze the event loop for the
        # full round trip — audio I/O, STT and turn detection all stalled and
        # the agent went dead the moment the prospect handed off. Offload it,
        # matching how agent.py handles its other blocking calls.
        card = await asyncio.to_thread(
            score_session,
            self._transcript,
            self._rubric,
            self._retriever,
            self._complete,
            rep_id=self._rep_id,
            session_id=self._session_id,
            character=self._character,
        )
        await self.session.generate_reply(instructions=build_debrief_instructions(card))
        try:
            # Disk write — small, but it is still blocking I/O on the loop.
            await asyncio.to_thread(save_scorecard, card, self._scorecards_dir)
        except Exception:
            logger.warning("Failed to persist scorecard.", exc_info=True)
        if self._mem0 is not None and card.per_objection:
            weak = [o.type for o in card.per_objection if not o.handled]
            if weak:
                try:
                    await self._mem0.add(
                        [
                            {
                                "role": "assistant",
                                "content": (
                                    f"Rep struggled with these objection types: "
                                    f"{', '.join(weak)} (grade {card.overall_grade})."
                                ),
                            }
                        ],
                        user_id=self._rep_id,
                    )
                except Exception:
                    logger.warning("Failed to save weak spots to Mem0.", exc_info=True)
