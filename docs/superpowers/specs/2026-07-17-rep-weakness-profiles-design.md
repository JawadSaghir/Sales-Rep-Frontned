# Rep Trainer Data Layer — Design Spec (Spec 1)

**Date:** 2026-07-17
**Status:** Approved design → ready for implementation plan
**Branch:** feat/rep-trainer-runtime-loop

## The four artifacts

The rep-trainer needs four related data artifacts. Naming them clarifies how they relate:

| # | Artifact | Grain | Source | Spec |
|---|----------|-------|--------|------|
| **A** | Rep profiles (weaknesses) | one per rep | scorecards | **Spec 1** |
| **B** | Personas (client behavior the voice agent plays) | one per character | transcripts + `casting_calls.xlsx` | Spec 2 |
| **C** | Objection taxonomy | one canonical list | `objections_surfaced` + `Objection/Friction` + `objections.json` | **Spec 1** |
| **D** | Weakness taxonomy | one canonical list | `what_to_improve` + `why_no_close` + `red_flags` (all reps) | **Spec 1** |

**Key architecture idea:** C and D are shared *controlled vocabularies*, not leaf documents.
A and B reference them by ID. Building them once (bottom-up, by clustering raw free-text)
is what lets you (1) aggregate "what weaknesses exist across the whole team" and
(2) auto-match a rep to the persona that drills their weakest objection type.

```
   Rep profile (A) ──weak at──▶ weakness_type (D)
        └──weak at──▶ objection_type (C) ◀──throws── Persona (B)
   "Mike weak at TIMING" + "persona too_busy throws TIMING" ⇒ drill Mike with too_busy
```

## Storage architecture

**SQLite is the source of truth; YAML files are generated views exported from it.**

- **SQLite** (`cleaned_data/rep_trainer.db`) holds the relational core: reps, calls, the C/D
  taxonomies, and the many-to-many links between them. All analysis/aggregation runs as SQL here.
- **YAML** rep profiles (`cleaned_data/rep_profiles/<slug>.yaml`) are *exported from* the DB for
  the voice-agent runtime (already uses `yaml.safe_load`) and for human coaches. Regenerable anytime.

Engine choice: **SQLite, not Postgres** — the project is file-based and single-machine;
`sqlite3` is built into Python, needs no server, and versions as one file. Revisit Postgres
only if this becomes multi-user/web.

## Scope

**Spec 1 (this doc)**
- Clean `data/raw_data/Performance Bot Scorecards-Grid view.csv` in `notebooks/cleaning.ipynb`.
- Build SQLite DB: `reps`, `calls`, objection taxonomy (**C**), weakness taxonomy (**D**),
  the `call_objections` / `call_weaknesses` link tables, summary tables, and `export_meta`.
- Discover taxonomies via **embeddings + clustering**, LLM-labelled, then **human-approved** in a
  `taxonomy_studio.ipynb` gate before any profile is generated.
- Export rep-profile YAML views (**A**) + a profile-quality evaluation report.
- Create the (empty) `personas` / `persona_objections` / `rep_persona_match_scores` tables so
  Spec 2 slots in via one join.

**Spec 2 (separate)**
- Populate personas (**B**) from transcripts + `casting_calls.xlsx`, tagged with objection-type IDs.
- Rep→persona matching queries.

## Data reality (from analysis)

- **3,967 rows / 194 reps.** Top reps 60–125 scored calls; a long tail has few.
- **1,628 rows have no grade** — no-shows / disqualified / skipped. Must be filtered.
- **`grade` mixes two rubrics:** letter grades (`C+`, `B-`, `A-`) AND qualitative labels
  (`Elite`, `Strong`, `Developing`, `Needs Improvement`), plus 3 Unicode-minus variants and
  junk (`"D (context-adjusted…)"`). Needs normalization to one scale.
- **`scoring_raw_json` ≈ 48 MB** (12,174 chars × 3,967) — ~60% of the file. Drop it.
- **Numeric scores are sparse:** objection_handling/close_mechanics/frame_and_control/prospect_read
  ~44%; total_score/grade/did_rep_ask_for_close ~59%; coachability_signal only 13%.
- **Free-text ~100% covered:** what_to_improve, why_no_close, coaching_tip, rudys_note,
  one_line_verdict, biggest_strength, objections_surfaced.
  → **Narrative/clustering is the backbone; numeric trends are a supporting layer over the scored subset.**

## Field taxonomy

### INCLUDE — weakness signal (core, ~100%) → feeds D + call_weaknesses
`what_to_improve` · `why_no_close` · `red_flags` · `coaching_tip` ·
`Rep Improvement Suggestions (AI)` · `what_id_polish` · `rudys_note` · `one_line_verdict`

### INCLUDE — strengths (balance) → rep profile
`biggest_strength` · `what_went_well` · `what_made_this_close_work`

### INCLUDE — numeric dimensions (scored subset, sparse-aware) → calls table
`total_score` · `grade` (normalized) · `objection_handling` · `did_rep_ask_for_close`
(→ close-ask rate) · `close_mechanics` · `frame_and_control` · `prospect_read` · `self_assessment_accuracy`

### INCLUDE — objection linkage & context → C + call_objections
`objections_surfaced` · `intended_outcome` · `deal_outcome_context` · `Flagged For Follow-Up (AI)`

### INCLUDE — identity / traceability → reps + calls
`rep_name` · `Rep Email` · `call_date` · `client_name` · `meeting_title` · `show_name` · `meeting_id`

### EXCLUDE — unnecessary (plumbing / bloat / near-empty)
`scoring_raw_json` (48 MB bloat) · `grading_trace` · `source_airtable_*` · `model_version` ·
`meeting_link` · `meeting_transcript_link` · `rep_pdf_link` · `Meeting Transcript` ·
`minutes` (0.1%) · `skip_reason`/`error_details` (0%) · `coachability_signal` (13%) ·
`scorecard_key`/`automation_key`

## SQLite schema (`cleaned_data/rep_trainer.db`)

```sql
reps(rep_id PK, name, email, slug UNIQUE)

calls(call_id PK, rep_id FK→reps, client_name, call_date, show_name, meeting_id,
      total_score, grade_normalized, grade_raw, close_ask BOOL,
      objection_handling, close_mechanics, frame_and_control, prospect_read,
      self_assessment_accuracy, intended_outcome, deal_outcome_context, flagged_followup,
      one_line_verdict, biggest_strength, what_went_well, what_made_close_work,
      what_to_improve, why_no_close, red_flags, coaching_tip, rep_improvement, rudys_note)

objection_types(obj_id PK, label, definition, aliases)          -- C
weakness_types(weak_id PK, label, definition, coaching_fix)     -- D

call_objections(call_id FK, obj_id FK, handling_score, quote)   -- M:N
call_weaknesses(call_id FK, weak_id FK, evidence_quote)         -- M:N

-- provenance: which build produced the current export
export_meta(export_id PK, generated_at, taxonomy_version, model_used, git_sha, row_counts_json)

-- created empty in Spec 1, populated in Spec 2:
personas(persona_id PK, name, ...)                              -- B
persona_objections(persona_id FK, obj_id FK)                    -- M:N
```

### Materialized summary tables (refreshed on each export)
Precompute the hot queries as plain tables (SQLite lacks true materialized views) so the
runtime and coaches read them directly instead of re-aggregating:
- `rep_weakness_summary(rep_id, weak_id, frequency, last_seen)` — per-rep ranked weaknesses.
- `team_weakness_ranking(weak_id, rep_count, call_count)` — the "weaknesses across all reps" report.
- `rep_persona_match_scores(rep_id, persona_id, score)` — populated in Spec 2; empty table now.

### Exports fall out as SQL
- **Rep profile YAML** ← `reps → calls → call_weaknesses/call_objections`, aggregated.
- **"Weaknesses across all reps"** ← read `team_weakness_ranking`.
- **Runtime drill query** ← `get_rep_drill_plan(slug)` in `db.py`: top-3 rows of
  `rep_weakness_summary` for the rep + (Spec 2) best `rep_persona_match_scores`.
- **Rep→persona match (Spec 2)** ← rep's weak `obj_id`s joined to `persona_objections`.

## Rep profile YAML (exported view)

```yaml
rep_name: Mike Zanardelli
rep_email: mike.z@example.com
rep_slug: mike-zanardelli
generated_at: 2026-07-17
data_window: {first_call: 2026-01-04, last_call: 2026-07-10}

stats:
  calls_scored: 68
  calls_total_ingested: 73
  avg_total_score: 47.2
  grade_normalized: developing
  grade_trend: improving              # improving / flat / declining
  close_ask_rate: 0.28
  dimension_avgs: {objection_handling: 6.1, frame_and_control: 5.4, prospect_read: 6.8}
  data_confidence: high               # high / thin

recurring_weaknesses:                 # from call_weaknesses, ranked by frequency
  - weakness_type: accepts-stalls-without-probing
    frequency: 0.41
    evidence: ["attorney review stall accepted at face value"]
    coaching_fix: "Treat 'review with X' as a hidden money objection; probe before sending docs."

objection_profile:
  weakest_objection_types: [timing, authority]
  strongest_objection_types: [price]

strengths: ["Clean offer walkthrough", "Reads the room and pivots smoothly"]
coach_notes: ["Gap is behavioral, not knowledge — he knows the product cold."]
```

## Architecture / files

```
cleaned_data/
  __init__.py
  cleaning_utils.py        # pure, unit-tested: normalize_grade, is_real_call,
                           #   parse_close_ask, canonicalize_rep, aggregate_stats
  db.py                    # persistence: create schema, load DataFrame → tables,
                           #   refresh summary tables, export queries, get_rep_drill_plan()
  embeddings.py            # extract phrases, embed, UMAP+HDBSCAN → proposed clusters
  clustering.py            # LLM labels clusters (label/definition/aliases/coaching_fix);
                           #   cheap-model classifier maps each call → type IDs
  evaluate.py              # profile-quality rubric (see Evaluation)
  rep_trainer.db           # SQLite source of truth
  taxonomies/
    objection_types.yaml   # export of table C (also the Taxonomy Studio edit surface)
    weakness_types.yaml    # export of table D
  rep_profiles/<slug>.yaml # exported rep profile views (A)

notebooks/
  cleaning.ipynb           # Stage 1: clean → DB → propose clusters → export taxonomy YAML
  taxonomy_studio.ipynb    # Stage 2 (human): review/merge/split/edit taxonomies, then approve
                           #   → re-import into DB, classify all calls, export profiles

tests/
  test_cleaning.py         # pytest over pure functions + schema checks
```

### Pipeline stages (two notebooks, human gate between)
**`cleaning.ipynb` (Stage 1 — automated up to proposal):**
1. **Load & config** — read CSV (`csv.field_size_limit` bumped), select only INCLUDE columns.
2. **Filter non-calls** — drop no-show/skipped/ungraded-empty; print before/after counts.
3. **Normalize** — grade→unified scale (+ `grade_raw` quarantine); close_ask→bool;
   rep name/email canonicalization (194-name collision check).
4. **Load into SQLite** — populate `reps` + `calls`; create empty persona/summary tables.
5. **Propose clusters** — extract raw weakness/objection phrases → embed → UMAP+HDBSCAN →
   candidate clusters; LLM labels each (label, definition, aliases, coaching_fix);
   seed `aliases` from existing `objections.json` types; export draft `taxonomies/*.yaml`.

**`taxonomy_studio.ipynb` (Stage 2 — human-in-the-loop, then finalize):**
6. **Human review** — sales manager merges/splits/edits weakness & objection types and rewrites
   `coaching_fix` text in `taxonomies/*.yaml`, then flags the taxonomy **approved**.
7. **Classify** — cheap model (`gpt-4o-mini`) tags every call against the *frozen* taxonomy →
   `call_objections` / `call_weaknesses` + evidence quotes.
8. **Refresh + export** — rebuild summary tables, write `export_meta`, export rep-profile YAML;
   print `team_weakness_ranking`; run `evaluate.py`.

### Grade normalization
Map both rubrics to one ordered band: `elite > strong > good > developing > needs_improvement > weak`.
Align letter grades and qualitative labels; fix Unicode-minus variants; junk → `grade_raw` only.
`total_score` (0–100) is the primary numeric; normalized grade is the categorical.

### Taxonomy building — hybrid, not pure LLM synthesis
Pure LLM theme-synthesis drifts: labels change every re-run, and there's no clean human
refinement point. Instead the taxonomy is *discovered by clustering, named by the LLM, then
frozen*:
1. **Extract** all raw weakness/objection phrases from the free-text fields.
2. **Embed** them — default local `nomic-embed-text` via `sentence-transformers` (offline, free);
   optional `text-embedding-3-small` if an OpenAI key is preferred.
3. **Cluster** — UMAP dimensionality reduction + HDBSCAN → candidate clusters (no fixed K).
4. **Label (strong LLM)** — for each cluster, produce canonical `label`, `definition`, `aliases`,
   `coaching_fix`. This is the only generative step and it's where a capable model earns its keep.
5. **Human gate** — Taxonomy Studio review/approve (above).
6. **Classify (cheap LLM, `gpt-4o-mini`)** — map every call to the *frozen* type IDs (multi-label)
   with an evidence quote. Closed-set → cheap, stable, reproducible.

- **LLM provider:** OpenRouter (OpenAI-compatible), model via `REP_PROFILE_MODEL`
  (default `openai/gpt-4o-mini` for classify; a stronger model for the label step). Key: `OPENROUTER_API_KEY`.
- **Validation:** JSON schema (required keys; scores/`frequency` in range); retry on invalid.

### Thin-data handling
Default `min_scored_calls = 8`. Reps below it get `data_confidence: thin`, numeric averages
suppressed (shown only with an explicit caveat), narrative still attempted if any free-text exists.

### Runtime access (voice agent)
The agent must answer *"top 3 weaknesses + suggested drills for rep X"* fast. `db.py` exposes
`get_rep_drill_plan(slug)` → reads `rep_weakness_summary` (top 3) + `rep_persona_match_scores`
(Spec 2) in one indexed query. No YAML parsing on the hot path; indexes on `reps.slug`,
`rep_weakness_summary.rep_id`.

## Testing
`pytest tests/test_cleaning.py` over pure functions:
- `normalize_grade`: every observed variant → expected band; junk → quarantine; Unicode-minus fixed.
- `is_real_call`: no-show/skipped/empty-ungraded excluded; valid retained.
- `parse_close_ask` + close-ask-rate math.
- `canonicalize_rep`: case/whitespace/spelling collisions collapse to one slug.
- `aggregate_stats`: averages ignore missing; thin-data suppression below threshold.
- DB round-trip: load → export query returns expected shape.
- `get_rep_drill_plan` returns ≤3 weaknesses for a known rep.
- LLM outputs validated by **schema**, not exact text.

## Evaluation (profile quality rubric)
`evaluate.py` scores each export so quality is measurable, not vibes:
- **Evidence coverage** — % of `recurring_weaknesses` with ≥2 evidence quotes (target ≥80%).
- **Coaching_fix completeness** — % of weakness types with a non-empty, non-generic `coaching_fix`.
- **Classification coverage** — % of scored calls mapped to ≥1 weakness type (flag "unclustered" tail).
- **Taxonomy health** — cluster count in a sane range; no giant catch-all cluster > X% of calls.
Report printed at export and stored in `export_meta`.

## Notes / non-blocking
- **YAML size:** fine for 194 reps; revisit compaction/pagination only if profiles grow large.

## Open items (implementation-time)
- `min_scored_calls` default set to 8 — confirm with the team.
- Embedding provider: local `nomic-embed-text` (default) vs OpenAI `text-embedding-3-small`.
- Label-step model on OpenRouter (classify is `gpt-4o-mini`).
- Grade-band ordering — confirm it matches how the team reads the labels.
