import asyncio
import contextlib
import json
import logging
import os
import re
import sys
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    ChatContext,
    JobContext,
    JobProcess,
    RunContext,
    cli,
    function_tool,
    inference,
    room_io,
)
from livekit.agents.utils.audio import AudioByteStream
from livekit.plugins import cartesia, deepgram, openai, silero
from mem0 import AsyncMemoryClient

from coaching import CoachAgent
from identity import resolve_rep_id
from memory_export import fetch_all, write_export
from retrieval import SeedRetriever
from scoring import DEFAULT_RUBRIC, format_practice_transcript

# Force UTF-8 on stdout/stderr so logging persona memories (curly quotes,
# non-breaking hyphens, etc.) doesn't crash Windows' default cp1252 handler.
for _stream in (sys.stdout, sys.stderr):
    with contextlib.suppress(AttributeError, ValueError):
        _stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]

logger = logging.getLogger("agent")

load_dotenv(".env.local")


def make_openrouter_complete(model: str) -> Callable[[str], str]:
    """Return complete(prompt) -> JSON text, via OpenRouter (OPENROUTER_API_KEY)."""
    import openai

    client = openai.OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=os.environ["OPENROUTER_API_KEY"],
    )

    def complete(prompt: str) -> str:
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        return resp.choices[0].message.content or ""

    return complete


# ---------------------------------------------------------------------------
# CALL TRANSCRIPTS — every call's conversation is written to transcripts/ as a
# readable .txt at the end of the call. These are the training data for the
# objection-trained characters (see mission.md).
# ---------------------------------------------------------------------------
TRANSCRIPTS_DIR = Path(__file__).parent.parent / "transcripts"

# Rep-trainer assets and outputs.
SCORECARDS_DIR = Path(__file__).parent.parent / "data" / "scorecards"
SEED_OBJECTION_EXAMPLES_PATH = (
    Path(__file__).parent.parent / "data" / "seed" / "objection_examples.json"
)


def format_transcript(chat_ctx: ChatContext) -> str:
    """Render the spoken user/assistant turns as readable 'Speaker: text' lines."""
    lines = []
    for item in chat_ctx.items:
        if getattr(item, "type", None) != "message" or item.role not in (
            "user",
            "assistant",
        ):
            continue
        speaker = "Rep" if item.role == "assistant" else "Prospect"
        text = (item.text_content or "").strip()
        if text:
            lines.append(f"{speaker}: {text}")
    return "\n".join(lines)


def format_memory_messages(
    chat_ctx: ChatContext, memory_str: str
) -> list[dict[str, str]]:
    """Render the spoken user/assistant turns as Mem0 message dicts.

    Selects `message` items positively rather than skipping known non-message
    kinds: a ChatContext also holds function calls, their outputs, and config
    updates, none of which carry a `.content` attribute. Anything the persona's
    tools add later is therefore ignored instead of crashing shutdown.

    The memory blob injected at session start is dropped so recalled memories
    are not written straight back as new ones.
    """
    messages = []
    for item in chat_ctx.items:
        if getattr(item, "type", None) != "message" or item.role not in (
            "user",
            "assistant",
        ):
            continue
        text = (item.text_content or "").strip()
        if not text:
            continue
        if memory_str and memory_str in text:
            continue
        messages.append({"role": item.role, "content": text})
    return messages


def write_transcript(
    chat_ctx: ChatContext, room_name: str, out_dir: Path = TRANSCRIPTS_DIR
) -> Path:
    """Write one call's transcript to out_dir and return the file path.

    The path is anchored to the project root, so the file lands in
    <project>/transcripts/ no matter which directory the agent is launched from.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now()
    safe_room = re.sub(r"[^A-Za-z0-9_-]+", "_", room_name or "call")
    path = out_dir / f"{ts:%Y%m%d-%H%M%S}_{safe_room}.txt"
    header = (
        f"Call transcript — room: {room_name} — {ts:%Y-%m-%d %H:%M:%S}\n"
        + "=" * 60
        + "\n"
    )
    path.write_text(header + format_transcript(chat_ctx) + "\n", encoding="utf-8")
    return path


# ---------------------------------------------------------------------------
# NOISE SUPPRESSION — local, open-source, no BVC/Krisp, no LiveKit Cloud.
# Wraps WebRTC's AudioProcessingModule (shipped with livekit.rtc) as a
# FrameProcessor and plugs into AudioInputOptions(noise_cancellation=...).
# The APM needs exactly-10ms frames but RoomIO delivers ~50ms, so we re-chunk
# to 10ms, process in place, and reassemble. See docs/noise-cancellation.md.
# ---------------------------------------------------------------------------
class APMNoiseSuppression(rtc.FrameProcessor[rtc.AudioFrame]):
    def __init__(
        self, *, noise_suppression: bool = True, high_pass_filter: bool = True
    ) -> None:
        self._enabled = True
        # auto_gain_control stays off: RoomIO already applies its own AGC.
        self._apm = rtc.AudioProcessingModule(
            noise_suppression=noise_suppression,
            high_pass_filter=high_pass_filter,
        )
        self._chunker: AudioByteStream | None = None
        self._rate = 0
        self._channels = 0

    @property
    def enabled(self) -> bool:
        return self._enabled

    @enabled.setter
    def enabled(self, value: bool) -> None:
        self._enabled = value

    def _process(self, frame: rtc.AudioFrame) -> rtc.AudioFrame:
        # (Re)build the 10ms chunker if the stream format changes.
        if (
            self._chunker is None
            or frame.sample_rate != self._rate
            or frame.num_channels != self._channels
        ):
            self._rate = frame.sample_rate
            self._channels = frame.num_channels
            self._chunker = AudioByteStream(
                frame.sample_rate,
                frame.num_channels,
                samples_per_channel=frame.sample_rate // 100,  # 10ms
            )
        out: list[rtc.AudioFrame] = []
        for chunk in self._chunker.push(bytes(frame.data)):
            self._apm.process_stream(chunk)  # in-place, exactly 10ms
            out.append(chunk)
        return rtc.combine_audio_frames(out) if out else frame

    def _close(self) -> None:
        self._chunker = None


class ProspectAgent(Agent):
    """The AI role-plays a prospect the rep practices against.

    The character prompt is assembled from context/data/ layers and rendered by
    context.renderer.render_buyer (see my_agent below).
    """

    def __init__(
        self,
        character_prompt: str,
        *,
        coach_factory=None,
        chat_ctx: ChatContext | None = None,
    ) -> None:
        super().__init__(instructions=character_prompt, chat_ctx=chat_ctx)
        self._coach_factory = coach_factory
        self.signals: list[dict[str, str]] = []

    def _to_coach(self):
        if self._coach_factory is None:
            return None
        return self._coach_factory(self.chat_ctx.copy(exclude_instructions=True))

    @function_tool()
    async def end_practice_and_get_feedback(self, context: RunContext):
        """End the roleplay and hand the rep to their coach for feedback.

        Call this when the rep says they are done, asks for feedback, or ends the
        practice.
        """
        coach = self._to_coach()
        if coach is None:
            return "Practice ended."
        return coach, "Handing you to your coach for feedback."

    @function_tool()
    async def end_call(self, context: RunContext, reason: str):
        """End the call because you (the prospect) have shut down — a hard no.

        Call this only when you have hit your shutdown condition and will not
        re-engage. The rep still gets a coaching debrief afterward.
        """
        logger.info("Prospect ended call: %s", reason)
        coach = self._to_coach()
        if coach is None:
            return "Call ended."
        return coach, "Ending the call."

    @function_tool()
    async def log_prospect_signal(
        self, context: RunContext, signal_type: str, quote: str
    ):
        """Silently record a notable signal (the rep never hears this).

        Args:
            signal_type: e.g. "interest", "buying_signal", or "hard_no".
            quote: your own words, verbatim.
        """
        self.signals.append({"signal_type": signal_type, "quote": quote})
        logger.info("Prospect signal [%s]: %s", signal_type, quote)
        # Must return output, not None. livekit-agents sets
        # `reply_required = fnc_out is not None` (voice/generation.py), and skips
        # speech generation entirely when it's False — so returning None made the
        # prospect go mute for the whole turn every time it logged a signal.
        # The rep never hears this string; it only keeps the turn alive.
        return "Signal recorded. Continue the conversation in character."


server = AgentServer()


async def init_memory() -> AsyncMemoryClient | None:
    """Create the Mem0 client without letting a network hiccup kill the call.

    `AsyncMemoryClient()` runs a *blocking* `requests.get` ping to api.mem0.ai in
    its constructor. On any DNS/connectivity failure that raises (see the
    getaddrinfo crash), and because it's synchronous it also stalls the event
    loop. We run it in a thread and treat memory as optional: if it's
    unreachable, the agent still takes the call — it just won't recall or save
    long-term memory this time.
    """
    try:
        return await asyncio.to_thread(AsyncMemoryClient)
    except Exception as exc:
        # Expected, handled degradation (DNS/connectivity down or a bad key).
        # Log the exception type only, not a full traceback — this path is not a
        # crash, and a 40-line stack here reads like one (see the getaddrinfo
        # cascade during a transient DNS outage). The call proceeds without
        # long-term memory.
        logging.warning(
            "Mem0 unavailable (%s) — continuing without long-term memory "
            "for this call.",
            exc.__class__.__name__,
        )
        return None


# Local, human-readable mirror of everything stored in Mem0 cloud.
MEMORY_DIR = Path(__file__).resolve().parent.parent / "memory"


async def refresh_local_snapshot() -> None:
    """Mirror all Mem0 memories into the local ``memory/`` folder (best-effort).

    Called after a call ends, so blocking network work is acceptable — we push
    it to a thread and never let a failure escape. Keeping this a fresh sync
    ``MemoryClient`` keeps it decoupled from the call's async client.
    """

    def _dump() -> int:
        from mem0 import MemoryClient

        client = MemoryClient()
        snapshot = write_export(
            MEMORY_DIR,
            fetch_all(client),
            generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        )
        return snapshot["total_memories"]

    try:
        total = await asyncio.to_thread(_dump)
        logging.info("Refreshed local memory snapshot (%s memories).", total)
    except Exception:
        logging.warning("Failed to refresh local memory snapshot.", exc_info=True)


def prewarm(proc: JobProcess):
    # Load the voice-activity-detection model once per worker process so each
    # call starts fast instead of loading it on every connection.
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


def build_coach_factory(
    *,
    rubric: str,
    retriever,
    complete,
    rep_id: str,
    session_id: str,
    character: str,
    scorecards_dir: Path,
    mem0,
):
    """Return a factory that builds a CoachAgent from the post-call chat context.

    Called by the prospect's handoff tool once the roleplay ends.
    """

    def factory(chat_ctx):
        transcript = format_practice_transcript(chat_ctx)
        return CoachAgent(
            transcript=transcript,
            rubric=rubric,
            retriever=retriever,
            complete=complete,
            rep_id=rep_id,
            session_id=session_id,
            character=character,
            scorecards_dir=scorecards_dir,
            mem0=mem0,
            chat_ctx=chat_ctx,
        )

    return factory


@server.rtc_session()
async def my_agent(ctx: JobContext):
    # Identify the trainee (rep). Scorecards + Mem0 are keyed by this id so
    # coaching compounds across sessions. Falls back to REP_ID env / "unknown".
    rep_id = resolve_rep_id(ctx.room.metadata, None, os.environ.get("REP_ID"))
    user_name = rep_id  # Mem0 + scorecard key

    async def shutdown_hook(
        chat_ctx: ChatContext, mem0: AsyncMemoryClient | None, memory_str: str
    ):
        # When the call ends, save the conversation to long-term memory so the
        # agent remembers this caller next time. Skipped if Mem0 was unavailable.
        if mem0 is None:
            logging.info("Mem0 unavailable — skipping memory save on shutdown.")
            return

        logging.info("Shutting down, saving chat context to memory...")

        messages_formatted = format_memory_messages(chat_ctx, memory_str)

        logging.info(f"Formatted messages to add to memory: {messages_formatted}")
        try:
            await mem0.add(messages_formatted, user_id=user_name)
            logging.info("Chat context saved to memory.")
        except Exception:
            logging.warning("Failed to save chat context to Mem0", exc_info=True)

        # Refresh the local memory/ mirror so it reflects this session.
        await refresh_local_snapshot()

    ctx.log_context_fields = {"room": ctx.room.name}

    # --- The voice pipeline: ears (STT) -> brain (LLM) -> voice (TTS) ---
    session = AgentSession(
        # Speech-to-text: Deepgram (nova-3). Reads DEEPGRAM_API_KEY from .env.local.
        # See https://docs.livekit.io/agents/models/stt/
        stt=deepgram.STT(),
        # Large language model: GPT-OSS via OpenRouter, using the OpenAI-compatible
        # plugin. Reads OPENROUTER_API_KEY from .env.local.
        # provider={"sort": "latency"} routes to OpenRouter's fastest host for lower
        # response latency. See https://docs.livekit.io/agents/models/llm/
        llm=openai.LLM.with_openrouter(
            model="anthropic/claude-3-haiku",
            provider={"sort": "latency"},
            temperature=0.6,
        ),
        # Text-to-speech: Cartesia Sonic-3. Reads CARTESIA_API_KEY from .env.local.
        # `voice` is a Cartesia voice *id* (UUID), not a display name — copy one from
        # https://play.cartesia.ai (Voices > ... > Copy ID).
        # NOTE: this account previously hit `quota_exceeded` ("Model credits limit
        # reached") and 402'd every TTS request, which made the agent join calls but
        # never speak. If it goes silent again, check Cartesia credits first.
        # See https://docs.livekit.io/agents/models/tts/
        tts=cartesia.TTS(
            model="sonic-3",
            voice="5ee9feff-1265-424a-9d7f-8e4d431a12c7",
        ),
        vad=ctx.proc.userdata["vad"],
        # Turn detection + endpointing + interruption (SDK 1.5+ unified config).
        # See https://docs.livekit.io/agents/build/turns
        turn_handling={
            # Semantic model that decides when the caller has finished a sentence.
            # Pinned to v1-mini, which transports/eot runs in-process (ctypes).
            # The default would be v1: detector.py picks it whenever
            # `is_hosted() or is_dev_mode()`, so `agent.py dev` silently routed
            # every turn to LiveKit Cloud and logged "turn detection transport
            # latency is too high: 777ms". v1 is more accurate but only free for
            # agents deployed on LiveKit Cloud; locally it just costs a round trip.
            "turn_detection": inference.TurnDetector(version="v1-mini"),
            # Fixed, not dynamic. audio_recognition.py sets
            # `endpointing_delay = max_delay` outright whenever the detector's
            # confidence lands under unlikely_threshold, so max_delay is the
            # common path for short replies — 2.0s instead of the old 3.0s.
            # "dynamic" was tried and reverted: it adapts min_delay from observed
            # pauses, and one 26s idle gap pushed min_delay 0.3 -> 2.0 for the
            # rest of the session ("min endpointing delay updated ... pause: 26.5").
            # It learns from silence, which a practice call has plenty of.
            "endpointing": {"mode": "fixed", "min_delay": 0.3, "max_delay": 2.0},
            # Barge-in: "vad" stops the agent the instant the caller speaks over it.
            # (The default "adaptive" mode waits to confirm turn-taking and can ignore
            # short interruptions.) resume_false_interruption=False keeps it stopped
            # once interrupted instead of resuming after a pause.
            "interruption": {
                "mode": "vad",
                "min_duration": 0.3,
                "resume_false_interruption": False,
            },
            # Start generating the reply before end-of-turn is fully confirmed — a
            # big perceived-latency win. (Was the top-level `preemptive_generation=True`
            # kwarg, deprecated in favour of this nested form; removed in v2.0.) See
            # https://docs.livekit.io/agents/build/audio/#preemptive-generation
            "preemptive_generation": {"enabled": True},
        },
    )

    # --- Long-term memory (Mem0): recall what this caller told us before ---
    # Reads MEM0_API_KEY from .env.local. Optional: a network/API failure here
    # must not abort the call, so mem0 may be None and recall is best-effort.
    mem0 = await init_memory()

    # --- Training assets: prospect card, rubric, retriever, scorer, coach ---
    # `context` is a repo-root package; make it importable when this file is
    # run directly (`uv run src/agent.py dev` puts only src/ on sys.path).
    # Guard the insert so the long-running worker doesn't grow sys.path per call.
    _repo_root = str(Path(__file__).resolve().parent.parent)
    if _repo_root not in sys.path:
        sys.path.insert(0, _repo_root)
    from context.assembler import assemble
    from context.renderer import render_buyer
    from context.selection import DEFAULT_SELECTION, selection_from_metadata
    from context.validator import validate

    selection = selection_from_metadata(ctx.room.metadata, fallback=DEFAULT_SELECTION)
    _bot_context, _manifest = assemble(selection)
    validate(_bot_context)
    character = selection.persona_id
    character_prompt = render_buyer(_bot_context)
    logging.info("context manifest: %s", _manifest)
    # Rubric is inlined (see scoring.DEFAULT_RUBRIC) rather than loaded from a
    # file, so there is no asset to go missing and crash the call at startup.
    rubric = DEFAULT_RUBRIC
    retriever = SeedRetriever(SEED_OBJECTION_EXAMPLES_PATH)
    complete = make_openrouter_complete("anthropic/claude-3-haiku")
    safe_room = re.sub(r"[^A-Za-z0-9_-]+", "_", ctx.room.name or "call")
    session_id = f"{datetime.now():%Y-%m-%dT%H-%M-%S}_{safe_room}"
    coach_factory = build_coach_factory(
        rubric=rubric,
        retriever=retriever,
        complete=complete,
        rep_id=rep_id,
        session_id=session_id,
        character=character,
        scorecards_dir=SCORECARDS_DIR,
        mem0=mem0,
    )

    initial_ctx = ChatContext()
    memory_str = ""
    if mem0 is not None:
        try:
            results = await mem0.get_all(filters={"user_id": user_name})
            logging.info(f"Memories: {results}")
            if results and results.get("results"):
                memories = [
                    {"memory": result["memory"], "updated_at": result["updated_at"]}
                    for result in results["results"]
                ]
                memory_str = json.dumps(memories)
                logging.info(f"Memories: {memory_str}")
                initial_ctx.add_message(
                    role="assistant",
                    content=f"Relevant context about this caller from past conversations: {memory_str}.",
                )
        except Exception:
            logging.warning("Failed to recall memories from Mem0", exc_info=True)

    # Start the session, warming up the pipeline. Noise suppression is local and
    # open-source (WebRTC APM, see APMNoiseSuppression above) — no BVC/Krisp, no
    # LiveKit Cloud, safe in console/mock mode.
    await session.start(
        agent=ProspectAgent(
            character_prompt, coach_factory=coach_factory, chat_ctx=initial_ctx
        ),
        room=ctx.room,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=APMNoiseSuppression(),
            ),
        ),
    )

    # Take the initiative: brief the rep out-of-character on who they're about to
    # call (persona, backstory, character, and objections to expect). Then the
    # ProspectAgent takes over in character and waits for the rep to lead.
    await session.say(
        _bot_context.persona.briefing_summary
        or "Whenever you're ready, go ahead and start your call."
    )

    await ctx.connect()
    ctx.add_shutdown_callback(
        lambda: shutdown_hook(session._agent.chat_ctx, mem0, memory_str)
    )

    async def transcript_hook():
        # Save the full conversation to transcripts/ when the call ends.
        try:
            path = write_transcript(session.history, ctx.room.name)
            logging.info(f"Transcript saved to {path}")
        except Exception:
            logging.exception("Failed to write transcript")

    ctx.add_shutdown_callback(transcript_hook)


if __name__ == "__main__":
    cli.run_app(server)
