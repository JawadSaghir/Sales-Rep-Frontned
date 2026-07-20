I now have a full picture of the system. Here's the architecture.

What problem it solves

This is an AI Sales Development Representative (SDR) for Systems Limited. It replaces (or assists) a human sales rep in early-stage B2B sales conversations. Concretely, it:

- Runs a qualifying sales conversation with a lead — opening → discovery → handling objections → closing.
- Grounds every claim in the company's real docs (case studies, pricing, technical capabilities) via RAG, so it doesn't hallucinate what the company can do or charge.
- Remembers each lead across sessions — so a follow-up call picks up where the last one left off, with the lead's pain points, budget, and objections already known.
- Optionally does this by voice (talk to it like a phone call), not just text chat.

The core problem: human SDRs don't scale, forget context between calls, and give inconsistent, ungrounded pitches. This agent gives every lead a consistent, doc-grounded, memory-aware conversation.

★ Insight ─────────────────────────────────────
This is a "ReAct" agent (Reason + Act) built on LangGraph. Instead of one
LLM call answering directly, the agent loops: think → pick a tool → observe
result → think again → until it decides to speak. This is what lets it
retrieve real pricing before quoting a price, rather than making one up.
─────────────────────────────────────────────────

The big picture

┌─────────────────────────────────────────────────────────────┐
│  ENTRY POINTS (main.py)                                       │
│  • CLI text     • Streamlit web UI     • Voice loop           │
└───────────────────────────┬─────────────────────────────────┘
                            │  every path goes through
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  AgentAPI  (agent/AgentAPI.py) — the façade                   │
│  load_initial_data() → get_opening_statement() →              │
│  process_message() ... holds ConversationState                │
└───────────────────────────┬─────────────────────────────────┘
                            │  invokes the compiled graph
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  LangGraph state machine  (agent/graph.py)                    │
│                                                               │
│   START ──(every 3rd turn?)──► stage_guidance ──►┐            │
│      └───────────────(else)──────────────────────┤            │
│                                                  ▼            │
│                                              ┌───────┐        │
│                          ┌──────────────────►│ think │        │
│                          │                   └───┬───┘        │
│                    execute_tool ◄────"use tool"──┤            │
│                    (RAG search)                  │            │
│                                    "generate"────┴──► END     │
│                                    "end_conv" ──► finalize    │
└──────────────────────────────────────┬──────────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────┐
        ▼                              ▼                          ▼
  LLM service              Knowledge retriever            Memory manager
  (Gemini 2.0 flash)       (FAISS + BM25 hybrid RAG)      (per-lead JSON)

How a turn actually works

The heart is agent/graph.py — a compiled LangGraph StateGraph with 4 nodes. A single ConversationState dict (agent/state.py) flows through it as "working memory" (messages, retrieved docs, qualification scores, turn counter, long-term memory).

1. stage_guidance node (every 3rd turn) — should_invoke_stage_guidance fires periodically. It asks the LLM to step back and assess the sale: what stage are we in, what's the lead's qualification score (budget/authority/urgency/engagement), what objections and buying signals appeared. This becomes strategic coaching injected into the next prompt.

2. think node (reasoning.py) — the LLM is prompted (get_reasoning_prompt) to output JSON like:
{"thought": "...", "action": {"tool": "search_pricing_models", "keywords": "cloud migration"}}

3. Router should_continue_reasoning — parses that JSON and branches:
- a search tool → execute_tool
- generate_response → finalize the turn, append the answer, go to END
- end_conversation → go to finalize

4. execute_tool node — runs the chosen RAG search, appends the result to retrieved_docs, then loops back to think. So the agent can chain: search pricing → search case studies → then answer.

★ Insight ─────────────────────────────────────
The routing logic lives in a plain Python function that JSON-parses the
LLM's output — not in the LLM itself. This is the classic tradeoff: the
graph is deterministic and debuggable (you control the control flow), but
it's brittle to malformed JSON. You can see defensive try/except around
every json.loads() in reasoning.py and graph.py for exactly this reason.
─────────────────────────────────────────────────

The RAG layer — why it won't hallucinate the pitch

agent/services/knowledge_retriever.py exposes 5 specialized searches, each hitting a different corpus. This is hierarchical / routed retrieval — the agent picks which knowledge base to search rather than one blob:

┌───────────────────────────────┬────────────────────────────────────────┐
│             Tool              │                 Corpus                 │
├───────────────────────────────┼────────────────────────────────────────┤
│ search_company_case_studies   │ projects.json                          │
├───────────────────────────────┼────────────────────────────────────────┤
│ search_technical_capabilities │ company_technical.json                 │
├───────────────────────────────┼────────────────────────────────────────┤
│ search_pricing_models         │ company_price_models.json              │
├───────────────────────────────┼────────────────────────────────────────┤
│ search_company_profile        │ company_profile.json                   │
├───────────────────────────────┼────────────────────────────────────────┤
│ search_knowledge_base         │ full doc set (data/company_docs/*.txt) │
└───────────────────────────────┴────────────────────────────────────────┘

Under the hood (vectorstores/create_knowledge_bases.py) each search is a hybrid retriever: EnsembleRetriever combining FAISS (dense/semantic vector search with Gemini embeddings) + BM25 (sparse keyword match). Hybrid catches both "conceptually similar" and "exact term" matches — better recall than either alone.

Memory — cross-session continuity

agent/services/memory_manager.py persists to data/long_term_memory.json, keyed by lead_id. When a conversation ends, the finalize node (finalization.py) does two LLM passes:
1. Synthesize the whole transcript + retrieved docs into a structured JSON memory (pain points, budget, authority, objections, stage reached, sentiment, next steps).
2. Compress that into a natural-language summary for the next call's opening prompt.

Next session, load_initial_data loads that memory back into state — that's the "picks up where you left off" behavior.

Voice layer (optional, currently partial)

Voice is a separate two-process, socket-based design (voice_service_server.py ↔ audio_loop.py over TCP 127.0.0.1:5001):
- STT: audio/voice_service.py shells out to whisper.cpp (whisper-cli.exe) — records mic, transcribes locally.
- TTS: audio/tts.py uses Kokoro (local neural TTS, af_heart voice) to speak responses.

The loop is: server records → sends transcription over socket → audio_loop.py feeds it to the same AgentAPI.process_message → speaks the reply. Note the README flags the Streamlit voice mode as currently crashing; the CLI voice loop is the working path.

★ Insight ─────────────────────────────────────
Notice the whole system funnels through ONE interface: AgentAPI. CLI,
Streamlit, and the voice loop all call the same process_message(). The
brain (LangGraph) is completely decoupled from the I/O modality. That's
why adding voice didn't require touching agent/graph.py at all — a clean
ports-and-adapters separation.
─────────────────────────────────────────────────

Tech stack summary

- Orchestration: LangGraph (stateful agent graph)
- LLM: Google Gemini 2.0 Flash (via langchain_google_genai, temp=0 for determinism)
- RAG: FAISS + BM25 hybrid, Gemini embeddings
- Memory: flat JSON files per lead
- STT/TTS: whisper.cpp + Kokoro (both local)
- UI: Streamlit / CLI / voice socket loop
- Tooling: uv package manager, optional LangSmith tracing

One thing worth noting: agent/nodes/ops_agent.py (a sub-agent for scheduling meetings, sending emails, creating docs) is fully written but its header says NOT USED WAS JUST AN IDEA — it's a planned "action-taking" delegation layer that isn't wired into the graph yet.

Want me to generate a visual architecture diagram (the repo already has agent_graph.png for the LangGraph portion), or go deeper on any one layer — the ReAct loop, the hybrid RAG, or the memory synthesis?

● Ran 3 stop hooks
  ⎿  Stop hook error: Failed with non-blocking status code: No stderr output

✻ Cooked for 2m 29s

──────────────────────────────────────────────────────────────────────────────
❯
─────────────────────────────────────────────