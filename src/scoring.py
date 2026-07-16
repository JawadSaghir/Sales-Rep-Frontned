"""Grade a practice call against the rubric and produce a Scorecard."""

import json
import logging
from collections.abc import Callable
from typing import TYPE_CHECKING

from retrieval import Retriever
from scorecard import ObjectionScore, Scorecard

if TYPE_CHECKING:
    from livekit.agents import ChatContext

logger = logging.getLogger("agent.scoring")

RUBRIC_STEPS = ["acknowledge", "reframe", "evidence", "re_ask"]


def format_practice_transcript(chat_ctx: "ChatContext") -> str:
    """Render turns for scoring. In training the AI is the Prospect (assistant
    role) and the human trainee is the Rep (user role) — the inverse of
    agent.format_transcript, which is used for saved rep-persona calls.
    """
    lines = []
    for item in chat_ctx.items:
        if getattr(item, "type", None) != "message" or item.role not in (
            "user",
            "assistant",
        ):
            continue
        speaker = "Prospect" if item.role == "assistant" else "Rep"
        text = (item.text_content or "").strip()
        if text:
            lines.append(f"{speaker}: {text}")
    return "\n".join(lines)


def _build_prompt(transcript: str, rubric: str) -> str:
    return (
        "You are a sales-training evaluator. Grade the REP's handling of each "
        "objection the PROSPECT raised in this practice call.\n\n"
        f"RUBRIC:\n{rubric}\n\n"
        f"TRANSCRIPT:\n{transcript}\n\n"
        "Respond with ONLY a JSON object of this exact shape:\n"
        '{"overall_grade": "<A-F letter grade>", "notes": "<one or two sentences>", '
        '"per_objection": [{"type": "<price|authority|timing|trust|time_commitment>", '
        '"handled": <true|false>, "rubric_steps_hit": ["acknowledge", ...], '
        '"missed": ["reframe", ...]}]}\n'
        "If the prospect raised no objections, return an empty per_objection list."
    )


def score_session(
    transcript: str,
    rubric: str,
    retriever: Retriever,
    complete: Callable[[str], str],
    *,
    rep_id: str,
    session_id: str,
    character: str,
) -> Scorecard:
    """Grade the transcript and attach a model answer per objection.

    complete(prompt) -> str is an LLM adapter that returns JSON text. The model
    answer for each objection is the `context` of a real winning example for that
    objection type (what a rep who succeeded actually did). Any failure (LLM error
    or unparseable output) yields a fail-open 'incomplete' scorecard so the coach
    can still speak instead of crashing the call.
    """
    try:
        raw = complete(_build_prompt(transcript, rubric))
        parsed = json.loads(raw)
        per_objection = []
        for obj in parsed.get("per_objection", []):
            otype = obj["type"]
            examples = retriever.winning_lines(otype, 1)
            model_answer = examples[0].context if examples else ""
            per_objection.append(
                ObjectionScore(
                    type=otype,
                    handled=bool(obj["handled"]),
                    rubric_steps_hit=list(obj.get("rubric_steps_hit", [])),
                    missed=list(obj.get("missed", [])),
                    model_answer=model_answer,
                )
            )
        return Scorecard(
            rep_id=rep_id,
            session_id=session_id,
            character=character,
            per_objection=per_objection,
            overall_grade=str(parsed.get("overall_grade", "incomplete")),
            notes=str(parsed.get("notes", "")),
        )
    except Exception:
        logger.warning("Scoring failed; returning incomplete scorecard.", exc_info=True)
        return Scorecard(
            rep_id=rep_id,
            session_id=session_id,
            character=character,
            per_objection=[],
            overall_grade="incomplete",
            notes="Automated scoring was unavailable for this session.",
        )
