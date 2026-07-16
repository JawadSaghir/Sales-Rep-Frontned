import asyncio
import json
import logging
import os
import re
from collections.abc import Callable
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentConfigUpdate,
    AgentServer,
    AgentSession,
    ChatContext,
    JobContext,
    JobProcess,
    RunContext,
    cli,
    function_tool,
    room_io,
)
from livekit.agents.utils.audio import AudioByteStream
from livekit.plugins import cartesia, deepgram, openai, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel
from mem0 import AsyncMemoryClient

logger = logging.getLogger("agent")

load_dotenv(".env.local")

# ---------------------------------------------------------------------------
# PERSONA — edit prompts/agent-instructions.md to change who your agent is.
# This is the "brain" prompt. Keep it focused: voice agents feel sluggish when
# the prompt is long, so say who the agent is, its goal, and its tone — no more.
# The path is resolved relative to THIS file, so it works no matter which
# directory you launch the agent from.
# ---------------------------------------------------------------------------
PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "agent-instructions.md"
with open(PROMPT_PATH, encoding="utf-8") as f:
    AGENT_INSTRUCTIONS = f.read()

# Prospect character cards (the AI role-plays a prospect the rep practices against).
CHARACTERS_DIR = Path(__file__).parent.parent / "prompts" / "characters"


def load_character_card(stem: str) -> str:
    """Read a prospect character card by file stem from prompts/characters/."""
    path = CHARACTERS_DIR / f"{stem}.md"
    return path.read_text(encoding="utf-8")


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


GREETING_INSTRUCTIONS = """Greet the caller warmly and introduce yourself, e.g.:
'Hi, this is Alex — thanks for reaching out! How can I help you today?'
or a natural variation. Then wait for them to respond."""


# ---------------------------------------------------------------------------
# CALL TRANSCRIPTS — every call's conversation is written to transcripts/ as a
# readable .txt at the end of the call. These are the training data for the
# objection-trained characters (see mission.md).
# ---------------------------------------------------------------------------
TRANSCRIPTS_DIR = Path(__file__).parent.parent / "transcripts"


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


class Assistant(Agent):
    def __init__(self, chat_context: ChatContext | None = None) -> None:
        super().__init__(
            instructions=AGENT_INSTRUCTIONS,
            chat_ctx=chat_context,
        )

    # To give the agent abilities (look up a price, book a demo, check inventory),
    # add tools with the @function_tool decorator. Add this import at the top:
    #   from livekit.agents import function_tool, RunContext
    #
    # @function_tool
    # async def lookup_price(self, context: RunContext, product: str):
    #     """Look up the current price for a product the caller asks about.
    #
    #     Args:
    #         product: The product name the caller mentioned.
    #     """
    #     logger.info(f"Looking up price for {product}")
    #     return "The Pro plan is $49 per month."


class ProspectAgent(Agent):
    """The AI plays a prospect the rep practices against (see prompts/characters/)."""

    def __init__(
        self,
        character_prompt: str,
        *,
        coach_factory=None,
        chat_ctx: ChatContext | None = None,
    ) -> None:
        super().__init__(instructions=character_prompt, chat_ctx=chat_ctx)
        self._coach_factory = coach_factory

    @function_tool()
    async def end_practice_and_get_feedback(self, context: RunContext):
        """End the roleplay and hand the rep to their coach for feedback.

        Call this when the rep says they are done, asks for feedback, or ends the
        practice.
        """
        if self._coach_factory is None:
            return "Practice ended."
        coach = self._coach_factory(self.chat_ctx.copy(exclude_instructions=True))
        return coach, "Handing you to your coach for feedback."


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
    except Exception:
        logging.warning(
            "Mem0 unavailable (network/API-key issue) — continuing without "
            "long-term memory for this call.",
            exc_info=True,
        )
        return None


def prewarm(proc: JobProcess):
    # Load the voice-activity-detection model once per worker process so each
    # call starts fast instead of loading it on every connection.
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


@server.rtc_session()
async def my_agent(ctx: JobContext):
    # A stable identifier for this caller. Everything this user says is stored in
    # Mem0 under this id and recalled on their next call. If you can identify the
    # caller (phone number, account id, logged-in user), set it here so memory is
    # per-person instead of shared.
    user_name = "unknown"

    async def shutdown_hook(
        chat_ctx: ChatContext, mem0: AsyncMemoryClient | None, memory_str: str
    ):
        # When the call ends, save the conversation to long-term memory so the
        # agent remembers this caller next time. Skipped if Mem0 was unavailable.
        if mem0 is None:
            logging.info("Mem0 unavailable — skipping memory save on shutdown.")
            return

        logging.info("Shutting down, saving chat context to memory...")

        messages_formatted = []
        logging.info(f"Chat context messages: {chat_ctx.items}")

        for item in chat_ctx.items:
            if isinstance(item, AgentConfigUpdate):
                continue
            content_str = (
                "".join(item.content)
                if isinstance(item.content, list)
                else str(item.content)
            )
            if memory_str and memory_str in content_str:
                continue
            if item.role in ["user", "assistant"]:
                messages_formatted.append(
                    {"role": item.role, "content": content_str.strip()}
                )

        logging.info(f"Formatted messages to add to memory: {messages_formatted}")
        try:
            await mem0.add(messages_formatted, user_id=user_name)
            logging.info("Chat context saved to memory.")
        except Exception:
            logging.warning("Failed to save chat context to Mem0", exc_info=True)

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
        ),
        # Text-to-speech: Cartesia (sonic-3). Reads CARTESIA_API_KEY from .env.local.
        # Change `voice` to any Cartesia voice id to change how the agent sounds.
        # See https://docs.livekit.io/agents/models/tts/
        tts=cartesia.TTS(model="sonic-3", voice="9626c31c-bec5-4cca-baa8-f8ba9e84c8bc"),
        vad=ctx.proc.userdata["vad"],
        # Turn detection + endpointing + interruption (SDK 1.5+ unified config).
        # See https://docs.livekit.io/agents/build/turns
        turn_handling={
            # Semantic model that decides when the caller has finished a sentence.
            "turn_detection": MultilingualModel(),
            # Reply sooner after the caller stops (default min_delay is 0.5s).
            "endpointing": {"min_delay": 0.3, "max_delay": 3.0},
            # Barge-in: "vad" stops the agent the instant the caller speaks over it.
            # (The default "adaptive" mode waits to confirm turn-taking and can ignore
            # short interruptions.) resume_false_interruption=False keeps it stopped
            # once interrupted instead of resuming after a pause.
            "interruption": {
                "mode": "vad",
                "min_duration": 0.3,
                "resume_false_interruption": False,
            },
        },
        # Start generating the reply before end-of-turn is fully confirmed — a big
        # perceived-latency win. See
        # https://docs.livekit.io/agents/build/audio/#preemptive-generation
        preemptive_generation=True,
    )

    # --- Long-term memory (Mem0): recall what this caller told us before ---
    # Reads MEM0_API_KEY from .env.local. Optional: a network/API failure here
    # must not abort the call, so mem0 may be None and recall is best-effort.
    mem0 = await init_memory()

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
        agent=Assistant(initial_ctx),
        room=ctx.room,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=APMNoiseSuppression(),
            ),
        ),
    )

    # Speak first so the caller isn't met with silence.
    await session.generate_reply(instructions=GREETING_INSTRUCTIONS)

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
