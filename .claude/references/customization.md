# Customization reference

Everything here maps to a specific spot in `src/agent.py`. Read this when the
user wants to change how the agent behaves, sounds, or performs.

## Table of contents
- [Persona / what the agent says](#persona)
- [Voice (how it sounds)](#voice)
- [LLM model and latency](#llm-model-and-latency)
- [Interruption / barge-in feel](#interruption--barge-in)
- [Response latency](#response-latency)
- [Giving the agent abilities (tools)](#tools)
- [Per-caller memory](#per-caller-memory)
- [Telephony (real phone numbers)](#telephony)
- [Deploying to production](#deploying)

## Persona
Edit `AGENT_INSTRUCTIONS` and `GREETING_INSTRUCTIONS` near the top of `agent.py`.
Keep the persona short and goal-directed — long prompts make a voice agent feel
slow and rambly. Say who the agent is, its one main goal, and its tone.

## Voice
In the `cartesia.TTS(...)` call, change `voice="..."` to any Cartesia voice id.
Browse and copy voice ids at https://play.cartesia.ai. To change the TTS engine
entirely, swap `model="sonic-3"` (e.g. a different Cartesia model), or replace
the whole `tts=` with another provider's plugin.

## LLM model and latency
In `openai.LLM.with_openrouter(...)`:
- `model="openai/gpt-oss-120b"` — the flagship GPT-OSS. For lower cost/latency
  use `"openai/gpt-oss-20b"`. Any OpenRouter model id works here.
- `provider={"sort": "latency"}` — routes to the fastest host. Alternatives:
  `{"sort": "throughput"}`, `{"sort": "price"}`, or pin providers explicitly with
  `{"order": ["cerebras", "groq"]}` (GPT-OSS is served very fast by those).

## Interruption / barge-in
In `turn_handling["interruption"]`:
- `"mode": "vad"` — stops the agent the instant the caller speaks. This is the
  responsive setting. The SDK default (`"adaptive"`) waits to confirm real
  turn-taking and can ignore short interruptions.
- `"min_duration": 0.3` — how long (seconds) the caller must speak to interrupt.
  Raise toward `0.5` if background noise or coughs cut the agent off too easily;
  add `"min_words": 1` so a stray sound alone won't stop it.
- `"resume_false_interruption": False` — once interrupted, stay stopped. Set
  `True` to have the agent resume after a brief false interruption.

## Response latency
- `turn_handling["endpointing"]["min_delay"]` — seconds of silence before the
  agent decides the caller is done. `0.3` is snappy; lower feels rushed and may
  cut callers off; raise if it interrupts people who pause mid-thought.
- `preemptive_generation=True` — keep this on; it starts the reply early.
- Model/provider choice (above) is usually the biggest latency lever.

## Tools
Give the agent real abilities (look up a price, book a demo, check an order) by
adding methods decorated with `@function_tool` inside the `Assistant` class.
There's a commented example in `agent.py`. Add this import at the top:
`from livekit.agents import function_tool, RunContext`. Keep tool docstrings
short and clear — the model uses them to decide when to call the tool.

## Per-caller memory
`user_name` in `my_agent()` is the memory key. It defaults to `"unknown"`, so all
callers currently share one memory. To make memory per-person, set `user_name` to
something stable for the caller (their phone number for SIP calls, an account id,
or a logged-in user id) before the Mem0 calls.

## Telephony
To take real phone calls, set up a SIP trunk and dispatch rule with the LiveKit
CLI (`lk sip ...`) so PSTN calls land in a room the agent joins. The agent code
already handles SIP callers (telephony noise cancellation). See
https://docs.livekit.io/agents/start/telephony/.

## Deploying
The bundled `Dockerfile` builds a production image. Deploy to LiveKit Cloud with
the LiveKit CLI: `lk agent create`. The container runs `src/agent.py start`
(production mode) instead of `dev`. Commit `uv.lock` so builds are reproducible.
