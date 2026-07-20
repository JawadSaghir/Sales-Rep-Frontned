
Validated Design — "Rep Trainer": a spar → coach → adapt loop

§ 1 — Architecture (the training loop)

A single practice call has two phases connected by a LiveKit handoff:

Rep joins → [PROSPECT AGENT] realistic objection sparring → rep signals "done" / call ends
          → handoff → [COACH AGENT] spoken debrief + written scorecard → persist to rep's history
                                                                        ↑ feeds next session
Two agents, isolated context each. The Prospect never sees the rubric or the "right answers"; the Coach never has to stay in character.

§ 2 — The three context assets (this is "the right context to AI")

┌────────────────┬─────────────────────────────────────────────────────────────┬──────────────────────────────────────────────────────┬──────────────────────────────┐
│     Asset      │                         What it is                          │                        Built                         │           Used by            │
├────────────────┼─────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────┼──────────────────────────────┤
│ Character      │ Persona + real objections + escalation, per cluster         │ Offline, from transcripts                            │ Prospect agent (as its whole │
│ cards          │                                                             │                                                      │  prompt)                     │
├────────────────┼─────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────┼──────────────────────────────┤
│ Coaching       │ Curated per-objection structure ("acknowledge → reframe →   │ Hand-authored (seed from existing playbook in        │ Coach agent                  │
│ rubric         │ evidence → re-ask")                                         │ agent-instructions.md)                               │                              │
├────────────────┼─────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────┼──────────────────────────────┤
│ Winning        │ Real quotes where the objection was overcome                │ Offline → RAGFlow rep_lines dataset                  │ Coach agent, retrieved live  │
│ rep-lines      │ (rep_response_worked=yes)                                   │                                                      │ at debrief                   │
└────────────────┴─────────────────────────────────────────────────────────────┴──────────────────────────────────────────────────────┴──────────────────────────────┘

The Prospect gets asset 1 only. The Coach gets assets 2 + 3 (+ the session transcript + the rep's past scorecards).

§ 3 — Data model & stores

- RAGFlow objections dataset — one chunk per customer objection quote; meta_fields = type/intensity/cluster/etc. (Powers offline card-building; optional live use later.)
- RAGFlow rep_lines dataset — one chunk per winning rep response; meta_fields = objection_type, technique, outcome. This is the Coach's live-retrieval source.
- Scorecard store — per-session JSON: {rep_id, timestamp, character, per_objection:[{type, handled, rubric_steps_hit, missed, model_answer}], overall_grade}. Plus Mem0 keyed by real rep_id for cross-session weak-spot memory ("partner objection tripped you up 3× now").

§ 4 — Components

1. Prospect agent — loads one character card; role-plays; low latency (unchanged pipeline). TDD: raises objection, stays in character.
2. Coach agent (handoff target) — inputs: transcript + rubric + rep_lines retrieval + rep history → outputs spoken debrief + scorecard.
3. Scorer — LLM grading each objection turn against the rubric; produces the structured scorecard.
4. Retriever (src/retrieval.py, thin Retriever protocol) — ragflow-sdk client; used by the Coach.
5. Identity — rep says their name at call start (console-friendly for local dev) → rep_id; used for Mem0 + scorecard keys. (Replaces hardcoded user_name="unknown".)
6. Offline pipeline (scripts/) — extract → cluster → cards + rubric authoring + ingest objections and rep_lines into RAGFlow.

§ 5 — Error handling (fail-open, like Mem0 today)

RAGFlow or Mem0 unreachable → Coach still debriefs from transcript + rubric (skips live exemplars / history), never drops the call. Retrieval wrapped in a timeout.

§ 6 — Testing (per AGENTS.md, TDD)

LLM-judge tests (extend tests/test_agent.py): Prospect raises + sustains an objection; Coach's scorecard correctly flags a deliberately fumbled objection; Coach fail-open when RAGFlow is down; identity captured. uv run pytest.

§ 7 — First cut vs. later

- First cut (local dev, console): Prospect agent (cards) + Coach agent (rubric + transcript scoring + spoken debrief + written scorecard) + per-rep identity/history. rep_lines live retrieval included here — because it's in the Coach (latency-safe), it's no longer deferred.
- Later: manager/team aggregate view; cloud-hosted RAGFlow; richer clustering at full 16k-transcript scale.

---
This reframes the earlier RAGFlow plan: RAG's real payoff is in coaching (winning-line retrieval at debrief), and the prospect stays lean. Everything you chose is satisfied.

Does this design look right — and is there any section (§1–§7) you want to change before I write it up as the spec?





Design — Transcript Knowledge Layer (feeds the tough prospect + the coach)

§ 1 — The one artifact that solves your "biggest problem"

The unit we extract from every transcript is a stage-tagged exchange: a prospect move → the rep's response → a per-move quality judgment. That single schema serves both consumers, which is why it's the whole game. From the Mike → Cher call, one exchange looks like:

{
  "transcript_id": "rec1UEasLmmJm9acx",
  "rep_name": "Mike Zanardelli", "show_name": "Daymond John - Next Level CEO",
  "exchange_index": 14,
  "call_stage": "show_fit",                 // rapport|discovery|show_fit|pitch|objection|close
  "prospect_move": {
    "utterance": "We have a product, we can sell a backpack, it's on Amazon... we wanna scale it.",
    "type": "pushback_too_early",           // objection:price|authority|timing|trust, story, buying_signal, skepticism...
    "profile_hint": "early-stage founder, pre-revenue-ish, over-explains"
  },
  "rep_move": {
    "utterance": "I think we're a little early... come back in 6 months when revenues are moving.",
    "technique": "disqualify_with_path"      // qualifying_question|reframe|evidence|disqualify|close_ask...
  },
  "quality": { "score": 5, "rationale": "Honest, kind disqualification that leaves a concrete re-entry path." },
  "prospect_reaction": "accepts gracefully"
}

Note the quality is judged on craft, not outcome — this decline scores a 5. Does the unit + fields look right?

§ 2 — Two consumers, two very different uses of the same extraction

- Prospect (offline-baked): cluster the prospect_moves + profile_hints → generate stage-aware persona YAMLs (the system you already run). The prospect embodies real behavior with zero live retrieval. No database on the call path.
- Coach (live, post-call): the only thing that hits a database. Given a moment in the practice call (e.g., "authority objection at close from an over-talker"), it queries: filter by call_stage + type + quality>=4, rank by semantic similarity to the prospect's line → returns the top real rep_move(s) + technique + rationale as "here's what a top rep did."

So the vector row embeds the prospect_move utterance; everything else is filterable metadata + the rep's answer.

§ 3 — RAGFlow vs. scratch, and the database (your direct questions)

Don't use RAGFlow. Its value is deep-document parsing (PDF/tables/OCR) — you have none. Your value is the LLM extraction (§1) and simple filter-then-rank retrieval (§2). RAGFlow would add a 6-service stack (ES + MySQL + MinIO + Redis + TEI + API) to run for a query you can do in one SQL statement.

Build a thin RAG on Postgres + pgvector:
- One store holds the coaching rows: structured metadata columns + a vector column. Retrieval = WHERE stage=… AND type=… AND quality>=4 ORDER BY embedding <=> $q LIMIT 3. Filter-first-then-rank in one query, one system to operate.
- Embeddings: text-embedding-3-small (simple, cheap) or a local sentence-transformer to avoid per-call cost — swappable.
- Scorecards stay as JSON files for now (already built); can move into Postgres later.
- (Qdrant is a fine alternative if you'd rather a purpose-built vector DB, but pgvector keeps metadata + vectors + everything in one place.)

Does pgvector-not-RAGFlow sit right with you?

§ 4 — Offline pipeline (the build), idempotent, keyed by transcript_id

1. Parse — read frontmatter + the timestamped, speaker-labeled dialogue (handle ASR noise).
2. Segment & extract (LLM) — split the call into stages and emit stage-tagged exchanges (§1).
3. Judge quality (LLM + rubric) — score each rep_move on craft, outcome-independent.
4. Load — embed each prospect_move, upsert row → pgvector (coaching store).
5. Personas — cluster prospect behavior → generate persona YAMLs (feeds the trainer).
Run on a small sample first to validate the schema, then the full ~2000.

§ 5 — Integration with what's already built

- src/retrieval.py already defines the Retriever protocol with SeedRetriever. Add a VectorRetriever (pgvector-backed) implementing the same protocol; swap it into the coach. The coach and prospect code don't change — just the retriever backend.
- Persona YAMLs already drive the prospect; the pipeline just generates more of them.

§ 6 — Staging (so this ships without a big-bang)

- A: parser + stage/exchange extractor → validated JSON on a 20-call sample.
- B: per-move quality judge.
- C: pgvector load + VectorRetriever → swap into coach (replaces SeedRetriever).
- D: cluster prospect behavior → auto-generate persona YAMLs.

---
That's the whole design. The heart is §1 (the exchange schema) and §2 (offline prospect / live coach split). Does this look right — and is there any section you want to change before I write it up as the spec?


✻ Waiting for 1 background agent to finish

● Agent "Catalog RAGFlow advanced retrieval" finished · 5m 43s                                  
I've mapped every advanced technique in rag/rag/. Here's the honest part first, because "use aof them" would actually hurt thisfor long-document / multi-hopretrieval, and your units are short conversational utterances. So "what works best" = switch othe advanced techniques that fit up, and deliberately skip the ones that only add ingest cost and latency.                                                        
Advanced retrieval stack for coaching-moment lookup                                           
Enabled (these genuinely raise precision here):                                               1. Hybrid dense + sparse search —rieve() already fuses vectorsimilarity with full-text term weighting (IDF via term_weight), synonym/query expansion       (nlp/synonym.py WordNet), and fintune vector_similarity_weight ≈0.8 so semantics lead but keyword signal still counts. This alone is well beyond naive vector search.
2. Question-expansion via per-unit questions — add_chunk(questions=[…]) is a real param, and
RAGFlow boosts question_tks^20 innerate 2–3 paraphrase variants ofeach prospect utterance and attach them. Cheap, and it's the single biggest recall win for
"prospect said something like thi
3. Keyword boosting via per-unit important_keywords — boosted important_kwd^30. I'll attach
objection_type, technique, call_sact-ish matches surface. (Alsocarries our unit_id.)
4. Metadata filter-first — metadaobjection_type, quality_score≥4}before ranking. Filter → then hybrid rank.
5. Cross-encoder rerank (rerank_i a final precision pass on the top candidates. This is the classic "advanced RAG" precision lever and it's exactly right for
picking the single best "what a tering a rerank model — an opschoice, see question below.)

Deliberately skipped (help long-doc/multi-hop, not utterances): RAPTOR (hierarchical summaries),
TOC-enhance, and Deep-Research qutant-only anyway). Enabling themadds ingest/query cost and dilutes short-utterance results.

★ Insight ─────────────────────────────────────
- The highest-leverage "advanced" — it's shaping the index atingest: per-unit questions (paraphrases) + important_keywords tap RAGFlow's heavily-boosted
fields (question_tks^20, importan gains for free because RAGFlowalready weights those fields — no extra query latency.
─────────────────────────────────

Two techniques are genuine judgmeit, so I want your call ratherthan guessing:

● User answered Claude's questions:
· Which of the heavier advance on? (Each adds an operational orper-query cost.) → Cross-encoder rerank (recommended)

Locked: cross-encoder rerank only — clean, focused stack (no GraphRAG/cross-language overhead).
I have everything now. Writing th

● Write(docs\superpowers\specs\2026wledge-layer-design.md)
Wrote 139 lines to
docs\superpowers\specs\2026-07dge-layer-design.md
# Design Spec — Transcript Knowledge Layer on RAGFlow (tough prospect + data-driven
 coach)
> Date: 2026-07-17 · Status: APPROVED DESIGN (pre-implementation)
> Supersedes the retrieval tegration-plan.md` (which p
roposed cards-only / deferred RAG). This spec is the source of truth for the transc
> Note: ignore the older `d/what_get_embed.md`, `docs/
voice_ai_design.md` — per the user, they can mislead.


## 1. Context & goal
… +203 lines

Spec written to docs/superpowers/specs/2026-07-17-ragflow-transcript-knowledge-layer-design.md.
Self-review passed — no placeholdAGFlow-only storage, rerank-onlyadvanced stack, offline prospect / live coach all line up), scope is one coherent subsystem
staged A→D, and the one ambiguitylagged as an implementationchoice.

This is your review gate before I turn it into an implementation plan.

Please review the spec at
docs/superpowers/specs/2026-07-17-layer-design.md. The parts mostworth checking:
- §3 — the extraction unit (stageariants). This is the artifacteverything hangs on; make sure the fields/enums match how you think about your calls.
- §6 — the RAGFlow mapping (one-der keys,questions/important_keywords boosting, the tuned retrieve call with rerank). This is the
concrete "advanced retrieval" you
- §11 — the A→D staging. Confirm the order works for you.

Two notes:
- I did not commit the spec (your-when-asked). Say the word andI'll commit it to feat/rep-trainer-runtime-loop.
- Once you approve, the next stepd, task-by-task implementationplan (which will likely split into the offline pipeline plan and the retriever-integration
plan).

Anything you want changed in the ?




With 27,000 calls, I would build both:

Offline Knowledge Layer (about 90–95% of the value)
Extract conversation units.
Build personas.
Learn objection patterns.
Learn industry-specific behavior.
Learn response styles.
Small, targeted RAG Layer (about 5–10% of the value)
Used only when the AI needs additional context that's not already covered by the persona.
Used extensively by the coach after the call.