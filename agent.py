import json
import logging

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
    cli,
    room_io,
)
from livekit.plugins import cartesia, deepgram, noise_cancellation, openai, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel
from mem0 import AsyncMemoryClient

logger = logging.getLogger("agent")

load_dotenv(".env.local")


# ---------------------------------------------------------------------------
# PERSONA — customize these two strings to change who your agent is.
# This is the "brain" prompt. Keep it focused: voice agents feel sluggish when
# the prompt is long, so say who the agent is, its goal, and its tone — no more.
# ---------------------------------------------------------------------------
AGENT_INSTRUCTIONS = """You are Alex, a friendly and professional sales representative.
Your goal is to understand the caller's needs, answer their questions clearly, and guide
them toward the right product or a next step (a demo, a quote, or a follow-up call).
Keep every response short and conversational — the caller is listening to you speak, not
reading. Ask one question at a time. Be warm, never pushy."""

GREETING_INSTRUCTIONS = """Greet the caller warmly and introduce yourself, e.g.:
'Hi, this is Alex — thanks for reaching out! How can I help you today?'
or a natural variation. Then wait for them to respond."""


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


server = AgentServer()


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
        chat_ctx: ChatContext, mem0: AsyncMemoryClient, memory_str: str
    ):
        # When the call ends, save the conversation to long-term memory so the
        # agent remembers this caller next time.
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
        await mem0.add(messages_formatted, user_id=user_name)
        logging.info("Chat context saved to memory.")

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
            model="openai/gpt-oss-120b",
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
    mem0 = AsyncMemoryClient()  # Reads MEM0_API_KEY from .env.local.
    results = await mem0.get_all(filters={"user_id": user_name})

    initial_ctx = ChatContext()
    memory_str = ""
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

    # Start the session, warming up the pipeline. Noise cancellation adapts to the
    # channel: telephony filter for SIP/phone callers, full BVC otherwise.
    await session.start(
        agent=Assistant(initial_ctx),
        room=ctx.room,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=lambda params: (
                    noise_cancellation.BVCTelephony()
                    if params.participant.kind
                    == rtc.ParticipantKind.PARTICIPANT_KIND_SIP
                    else noise_cancellation.BVC()
                ),
            ),
        ),
    )

    # Speak first so the caller isn't met with silence.
    await session.generate_reply(instructions=GREETING_INSTRUCTIONS)

    await ctx.connect()
    ctx.add_shutdown_callback(
        lambda: shutdown_hook(session._agent.chat_ctx, mem0, memory_str)
    )


if __name__ == "__main__":
    cli.run_app(server)
