# Design Spec — Transcript Knowledge Layer on RAGFlow (tough prospect + data-driven coach)

> Date: 2026-07-17 · Status: APPROVED DESIGN (pre-implementation)
> Supersedes the retrieval decisions in `docs/ragflow-integration-plan.md` (which proposed cards-only / deferred RAG). This spec is the source of truth for the transcript knowledge layer.
> Note: ignore the older `docs/knowledge_base.md`, `docs/what_get_embed.md`, `docs/voice_ai_design.md` — per the user, they can mislead.

---

## 1. Context & goal

We have ~2000 real Zoom sales-call transcripts (`Agent-Vault/airtable-zoom-calls/*.md`) from Inside Success TV casting calls. A rep (casting director) runs the call: rapport → discovery/qualification → show-fit → pitch the paid feature → objections → close or decline. Example: `2026-06-22-mike-zanardelli-cher-…md`, where Mike runs a clean **disqualification** ("you're too early, come back in 6 months") — excellent execution on a call that did **not** close.

The runtime trainer already exists (branch `feat/rep-trainer-runtime-loop`): a tough AI **prospect** (persona from YAML) the rep spars with, then a **coach** that scores the rep and, via a swappable `Retriever`, shows "what a top rep did." Today the coach uses a hand-seeded `SeedRetriever`.

**Goal:** turn the 2000 transcripts into (a) rich, stage-aware **prospect personas** and (b) a **RAGFlow-backed coaching index** the coach queries live after each practice call. Make the prospect genuinely tough (never helps; the rep must find the solution), and make the coach's advice grounded in real skilled moves.

## 2. Confirmed decisions (brainstorming, 2026-07-16 → 2026-07-17)

| # | Decision | Choice |
|---|---|---|
| 1 | Who consumes retrieved knowledge | **AI training-prospect** (offline-baked) **+ post-call coach** (live) |
| 2 | Training target | **Full end-to-end casting call** (objection handling + full arc + pitch/close are phases of one call); tough prospect that never helps |
| 3 | "Good rep move" signal | **Per-move execution quality via LLM + rubric, outcome-independent** (a skilled decline counts) |
| 4 | Prospect knowledge use | **Baked offline** into personas — zero live retrieval on the voice path |
| 5 | Retrieval engine | **RAGFlow** (vendored `rag/`), via `ragflow-sdk` over HTTP `:9380` — not built from scratch, not imported in-process |
| 6 | Storage shape | **One RAGFlow document per coaching unit** + local `units.jsonl` payload map (RAGFlow filters `meta_fields` at document level only) |
| 7 | Embeddings | RAGFlow bundled **TEI `bge-m3`** (no external embedding cost) |
| 8 | Advanced retrieval | Hybrid+synonym+term-weight (default) · per-unit `questions` + `important_keywords` boosting · `metadata_condition` filter · **cross-encoder rerank (`bge-reranker-v2-m3`)**. **Skip** RAPTOR, GraphRAG/`use_kg`, TOC-enhance, cross-language, Deep-Research |

## 3. The extraction unit (the core artifact)

One transcript → many **stage-tagged exchanges**: `prospect_move → rep_move → per-move quality`. This one schema feeds both consumers.

```json
{
  "unit_id": "rec1UEasLmmJm9acx_014",
  "transcript_id": "rec1UEasLmmJm9acx",
  "rep_name": "Mike Zanardelli",
  "show_name": "Daymond John - Next Level CEO",
  "call_stage": "show_fit",                       // rapport|discovery|show_fit|pitch|objection|close
  "prospect_move": {
    "utterance": "We have a product, we can sell a backpack... we wanna scale it.",
    "type": "pushback_too_early",                 // objection:price|authority|timing|trust, story, buying_signal, skepticism, deferral
    "profile_hint": "early-stage founder, pre-revenue-ish, over-explains"
  },
  "rep_move": {
    "utterance": "I think we're a little early... come back in 6 months when revenues are moving.",
    "technique": "disqualify_with_path"           // qualifying_question|reframe|evidence|disqualify|close_ask|acknowledge
  },
  "quality": { "score": 5, "rationale": "Honest, kind disqualification with a concrete re-entry path." },
  "prospect_reaction": "accepts gracefully",
  "question_variants": [                            // paraphrases of prospect_move for retrieval recall
    "We already have a working product, why is it too early?",
    "We're generating some revenue, isn't that enough?"
  ]
}
```

Quality is judged on **craft, not outcome**. Only units with `quality.score ≥ 4` become coaching units (loaded to RAGFlow); all units (any score) feed persona clustering.

## 4. Two consumers, one extraction

- **Prospect (offline-baked, no DB):** cluster `prospect_move` + `profile_hint` across calls → generate stage-aware **persona YAMLs** (`prompts/personas/*.yaml`, the existing format). The prospect embodies real behavior with zero live retrieval.
- **Coach (live, post-call → RAGFlow):** given a moment from the practice transcript, query the RAGFlow coaching index (§6) → real skilled `rep_move` + technique + rationale, spoken in the debrief and saved in the scorecard.

## 5. Databases / engines

- **RAGFlow** (semantic-filter index): dataset `coaching_moves`; embeddings via bundled TEI `bge-m3`; cross-encoder rerank `bge-reranker-v2-m3` registered as a rerank model. Runs from `rag/docker/` on `:9380` (local dev). Reached only via `ragflow-sdk`.
- **Local `data/coaching/units.jsonl`** (payload source of truth): full unit keyed by `unit_id`. RAGFlow answers "which units match"; this file answers "what's in the unit." Avoids depending on whether a retrieved `Chunk` echoes document `meta_fields`.
- **Scorecards**: existing JSON files (`data/scorecards/`), unchanged.
- No pgvector/Qdrant/Postgres — RAGFlow is the vector store.

## 6. RAGFlow storage & advanced retrieval (exact mapping)

**Ingest — one document per coaching unit** (`quality.score ≥ 4`):
- `display_name = unit_id`; document content/blob = `prospect_move.utterance` (clean embed target).
- document `meta_fields = {call_stage, objection_type, quality_score, technique, transcript_id, unit_id}` — the filter keys (RAGFlow filters `metadata_condition` at **document** level).
- one `add_chunk(content=prospect_move.utterance, questions=question_variants, important_keywords=[unit_id, objection_type, technique, call_stage])` — taps RAGFlow's boosted fields (`question_tks^20`, `important_kwd^30`) and guarantees `unit_id` returns on the chunk.
- dataset created with `embedding_model="BAAI/bge-m3@…"` (TEI). Idempotent by `unit_id`.

**Retrieve (coach, post-call):**
```python
hits = rag.retrieve(
    dataset_ids=[coaching_ds_id],
    question=prospect_line_from_practice_call,
    metadata_condition={"logic": "and", "conditions": [
        {"name": "call_stage",     "comparison_operator": "=", "value": stage},
        {"name": "objection_type", "comparison_operator": "=", "value": otype},
        {"name": "quality_score",  "comparison_operator": "≥", "value": "4"}]},
    vector_similarity_weight=0.8,     # semantics lead; term/synonym signal still counts
    similarity_threshold=0.2,
    top_k=256, page_size=3,
    rerank_id=RERANK_MODEL_ID,        # bge-reranker-v2-m3 cross-encoder
)
# hits -> unit_id (from chunk.important_keywords) -> units.jsonl -> rep_move_text + technique + rationale
```
Automatic (RAGFlow defaults, no flags): synonym expansion, IDF term weighting, hybrid fusion, PageRank/tag rank features. **Not used:** RAPTOR, GraphRAG/`use_kg`, `toc_enhance`, `keyword=True`, cross-language.

## 7. Offline pipeline (`scripts/`, run via `uv`)

1. **Parse** — read frontmatter + timestamped speaker-labeled dialogue; tolerate ASR noise.
2. **Extract exchanges** (LLM) — segment into stages; emit stage-tagged exchanges (§3) incl. `question_variants`.
3. **Judge quality** (LLM + rubric) — score each `rep_move` on craft, outcome-independent.
4. **Load coaching index** — for each unit with `score ≥ 4`: create RAGFlow doc + `meta_fields` + `add_chunk`; append full unit to `units.jsonl`. Idempotent by `unit_id`.
5. **Build personas** — cluster prospect behavior across all units → generate `prompts/personas/*.yaml`.
Validate on a ~20-call sample before the full ~2000 run. Extraction/judge LLM via existing OpenRouter adapter.

## 8. Integration with the existing runtime

- Add `RagflowRetriever` in `src/retrieval.py` implementing the existing `Retriever` protocol, backed by `ragflow-sdk` + `units.jsonl`. Return a richer result (rep_move_text, technique, rationale, stage) — extend `WinningExample` or add a field; keep the protocol swappable.
- Swap `SeedRetriever` → `RagflowRetriever` in the coach wiring (`src/agent.py`); **coach and prospect code unchanged**.
- New deps: `ragflow-sdk`. New env: `RAGFLOW_BASE_URL`, `RAGFLOW_API_KEY`, `RAGFLOW_COACHING_DATASET_ID`, `RAGFLOW_RERANK_MODEL_ID`. Fail-open (coach falls back to rubric-only if RAGFlow is unreachable — mirrors existing Mem0 pattern).

## 9. Error handling

- RAGFlow unreachable / timeout → coach debriefs from rubric + transcript only; log, never block. Wrap `retrieve` in a timeout.
- Extraction/judge LLM failure on a transcript → skip that transcript, log, continue (idempotent re-run picks it up).
- Malformed transcript → skip with a logged reason; never abort the batch.

## 10. Testing (TDD)

- **Parser** (pure) — frontmatter + dialogue parsing on a fixture transcript.
- **Extraction/judge** — validate against a fake LLM `complete` returning canned JSON (as `test_scoring.py` does); assert schema + `score≥4` gating.
- **RagflowRetriever** — unit-test with a stubbed `ragflow-sdk` client: builds correct `metadata_condition`, maps `unit_id` → `units.jsonl` payload, honors timeout fail-open.
- **Integration (opt-in, needs local RAGFlow)** — ingest 3 sample units, `retrieve("too expensive", stage=objection,type=price)` returns the seeded price unit; rerank changes order sensibly.
- LiveKit-dependent tests stay guarded by the existing `tests/conftest.py` PyAV skip.

## 11. Staging (ships incrementally, no rework)

- **A** — parser + exchange extractor → validated units JSON on a 20-call sample.
- **B** — per-move quality judge.
- **C** — RAGFlow load + `RagflowRetriever` → swap into coach (replaces `SeedRetriever`); stand up RAGFlow + rerank model locally.
- **D** — cluster prospect behavior → auto-generate persona YAMLs; run full ~2000.

## 12. Open items / prerequisites

- Stand up RAGFlow (`rag/docker/`, enable `tei-cpu` profile) and register a `bge-reranker-v2-m3` rerank model; mint an API key.
- Extraction/judge LLM + budget for the full 2000-call pass (start with the 20-call sample).
- `objection_type` / `technique` / `call_stage` enums finalized during Phase A on real data.
