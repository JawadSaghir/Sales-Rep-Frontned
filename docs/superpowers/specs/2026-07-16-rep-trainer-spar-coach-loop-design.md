# Design Spec — "Rep Trainer": a Spar → Coach → Adapt Loop

> Date: 2026-07-16 · Status: APPROVED DESIGN (pre-implementation)
> Companion: `docs/ragflow-integration-plan.md` (RAG mechanics), `docs/knowledge_base.md`, `docs/what_get_embed.md`.
> This spec is the source of truth for *what* we build and *why*. The RAG plan is the *how* for the retrieval layer.

---

## 1. Context & goal

`mission.md`: *"voice-only agent using existing call transcripts to create objection-trained characters."*

The deeper goal, confirmed in brainstorming: **train sales reps and measurably improve them over time.** A realistic sparring partner alone does not improve a rep — *feedback against a standard of good* does. So the system is a two-phase loop: the AI is a tough **prospect** during a practice call, then a **coach** afterward that scores the rep and shows them what a top rep would have said, and remembers each rep so coaching compounds.

**The central design principle: the right context is phase-specific.**
- As the *prospect*, the AI must hold ONLY its character (persona, objections, escalation). Giving it the rubric or winning answers would leak the answer key and break realism.
- As the *coach*, the AI needs the standard of good (rubric + real winning lines), the session transcript, and this rep's history.

## 2. Confirmed decisions (brainstorming, 2026-07-16)

| # | Decision | Choice |
|---|---|---|
| 1 | What "train reps" means | **Sparring + post-call coaching** |
| 2 | Standard the coach grades against | **Blend** — curated rubric for structure + real winning quotes as exemplars |
| 3 | How coaching is delivered | **Both** — spoken debrief at call end + persisted written scorecard |
| 4 | Tracking | **Per-rep identity + progression** across sessions |
| 5 | Phase architecture | **LiveKit handoff**: lean Prospect agent → scoped Coach agent |

Carried over from the RAG plan (still in force): RAGFlow runs as an external service reached via `ragflow-sdk` (not imported); **local dev only** for now; **HuggingFace embeddings via RAGFlow's built-in TEI**; the vendored `rag/` tree is server-side only.

## 3. Architecture

```
Rep joins room
   │  (states name → rep_id)
   ▼
┌──────────────────────────┐        end-of-call / "I'm done"
│  PROSPECT AGENT          │ ───────────────handoff───────────────►┐
│  context: ONE character  │                                        │
│  card only               │                                        ▼
│  Deepgram→LLM→Cartesia    │                          ┌──────────────────────────┐
│  low-latency, in-character│                          │  COACH AGENT             │
└──────────────────────────┘                          │  context: rubric +        │
                                                       │  session transcript +     │
                                                       │  winning rep-lines        │
                                                       │  (live RAGFlow retrieve) +│
                                                       │  rep history (Mem0)       │
                                                       │  → spoken debrief         │
                                                       │  → writes scorecard       │
                                                       └───────────┬──────────────┘
                                                                   ▼
                                              scorecard store (JSON) + Mem0[rep_id]
                                                                   │
                                                                   └──► feeds next session's coach
```

Two agents, one room, isolated context per phase. Uses LiveKit Agents handoffs/tasks per `AGENTS.md` guidance (prefer scoped workflows over one long multi-phase prompt).

## 4. The three context assets ("the right context to AI")

| Asset | Definition | How built | Consumed by |
|---|---|---|---|
| **Character cards** | Persona (demographic, mood, speaking style) + top 3–4 objections with verbatim quotes + escalation behavior | Offline pipeline from transcripts (see §7) | **Prospect** agent — loaded as its entire system prompt |
| **Coaching rubric** | Per-objection-type ideal structure, e.g. *acknowledge → reframe → evidence → re-ask*; pass/fail criteria per step | Hand-authored; seeded from the existing objection playbook in `prompts/agent-instructions.md` | **Coach** agent — grading structure |
| **Winning rep-lines** | Real rep responses where the objection was overcome (`rep_response_worked = yes` / deal advanced) | Offline → RAGFlow `rep_lines` dataset | **Coach** agent — retrieved live at debrief as "here's how a top rep phrased it" |

Rule: the Prospect gets asset 1 only. The Coach gets assets 2 + 3 + transcript + rep history.

## 5. Data model & stores

### RAGFlow datasets (embed only the quote; everything else is `meta_fields`)
- **`objections`** — one chunk per customer objection quote. `meta_fields`: `objection_type, intensity, rep_response_worked, cluster_id, role=customer, transcript_id, customer_age_range, business_type`. Primarily offline (card-building); optional live use later.
- **`rep_lines`** — one chunk per **winning** rep response. `meta_fields`: `objection_type, technique, outcome=won, transcript_id, role=rep`. **The Coach's live-retrieval source.**

### Scorecard (persisted per session)
```json
{
  "rep_id": "jenn",
  "session_id": "2026-07-16T14:03Z-room-abc",
  "character": "burned_before_skeptic",
  "per_objection": [
    {"type": "price", "handled": true,  "rubric_steps_hit": ["acknowledge","reframe","evidence","re-ask"], "missed": [], "model_answer": "…real winning quote…"},
    {"type": "authority", "handled": false, "rubric_steps_hit": ["acknowledge"], "missed": ["reframe","re-ask"], "model_answer": "…"}
  ],
  "overall_grade": "B-",
  "notes": "Gave up on the partner objection after one attempt."
}
```
Stored as JSON (e.g. `data/scorecards/<rep_id>/<session_id>.json`). Cross-session weak-spot memory lives in **Mem0** keyed by real `rep_id` (replaces hardcoded `user_name="unknown"`).

## 6. Components & interfaces

1. **Prospect agent** (`src/agent.py`, `Assistant` → prospect persona)
   - Input: one character card (selectable via env/room metadata). Behavior: role-plays, raises objections, resists until handled. Pipeline unchanged (Deepgram/OpenRouter/Cartesia, tuned barge-in).
2. **Coach agent** (new handoff target)
   - Inputs: full session transcript (already captured by `write_transcript`), rubric, `rep_lines` retrieval results, rep history from Mem0.
   - Outputs: (a) spoken debrief; (b) structured scorecard (§5) via the Scorer.
3. **Scorer** (pure-ish function, unit-testable)
   - `score(transcript, rubric, winning_lines) -> Scorecard`. LLM grades each detected objection turn against rubric steps.
4. **Retriever** (`src/retrieval.py`)
   - Thin `Retriever` Protocol wrapping `ragflow-sdk`: `retrieve(dataset, question, filters, k) -> list[Chunk]`. Swappable backend (pgvector/Qdrant) without touching agents. Used by the Coach only in the first cut.
5. **Identity** (`src/agent.py`)
   - Capture `rep_id` at call start (rep states name — console-friendly for local dev; later: login/room metadata). Used for Mem0 + scorecard keys.
6. **Offline pipeline** (`scripts/`) — see §7.

## 7. Offline pipeline (build-time, `uv run`)

1. **Extract** — `scripts/extract.py`: `Agent-Vault/airtable-zoom-calls/*.md` → `data/objections/<record_id>.json` (existing sample schema). Idempotent, keyed by record id. Also emit rep winning responses for `rep_lines`.
2. **Cluster** — `scripts/cluster.py`: aggregate → 6–10 objection clusters ranked by frequency + correlation with lost deals; write `cluster_id`; fill `data/objections.json`.
3. **Cards** — `scripts/cards.py`: 5–8 `prompts/characters/<cluster>.md` cards.
4. **Rubric** — `prompts/rubric.md`: hand-authored per-objection grading structure, seeded from `prompts/agent-instructions.md`'s playbook.
5. **Ingest** — `scripts/ingest_ragflow.py`: create/lookup `objections` + `rep_lines` datasets; upload quotes/winning-lines as chunks with `meta_fields`; parse/embed via TEI. Idempotent via content hash.

## 8. Error handling

Mirror the existing fail-open pattern (`init_memory()` in `src/agent.py`):
- RAGFlow unreachable → Coach debriefs from transcript + rubric only (skips live exemplars); log, never drop the call.
- Mem0 unreachable → coaching proceeds without cross-session history.
- Retrieval wrapped in an `asyncio.wait_for` timeout.
- Handoff failure → at minimum persist a transcript-only scorecard.

## 9. Testing (TDD, per `AGENTS.md`)

Extend `tests/test_agent.py` (LLM-judge pattern already in repo):
- Prospect raises and *sustains* an objection; stays in character (no rubric leakage).
- Coach scorecard flags a deliberately fumbled objection as `handled=false` with the right missing rubric steps.
- Coach fail-open: with RAGFlow stubbed down, debrief + scorecard still produced.
- Identity: `rep_id` captured and used as Mem0/scorecard key.
- Scorer unit tests on fixture transcripts.
Run: `uv run pytest`; format/lint: `uv run ruff format && uv run ruff check`.

## 10. Scope — first cut vs. later

**First cut (local dev, console-tested):**
- Prospect agent on character cards.
- Coach agent: rubric scoring + spoken debrief + persisted scorecard + live `rep_lines` retrieval (latency-safe because it's in the debrief, not the call).
- Per-rep identity + Mem0 history.
- Offline pipeline over the local 847 transcripts (validate schema on the 3 existing samples first).

**Later:**
- Manager/team aggregate view.
- Cloud-hosted, access-controlled RAGFlow for LiveKit Cloud deployment.
- Full 16k-transcript clustering; optional live retrieval in the Prospect phase.

## 11. Prerequisites / open items

- **Security (blocks first commit of code):** confirm `.env.local` is gitignored; rotate any key ever committed. Add RAGFlow env keys to `.env.example`.
- **Persona switch is a behavior change** → TDD-first (§9).
- **Extraction LLM + budget** for scaling the transcript pass — decide before Phase "Extract"; start small to validate schema.
- **Rubric authoring** — needs a short pass to formalize `prompts/rubric.md` from the existing playbook.
