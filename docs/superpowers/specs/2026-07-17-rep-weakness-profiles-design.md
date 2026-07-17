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
  and the `call_objections` / `call_weaknesses` link tables.
- Export rep-profile YAML views (**A**).
- Create the (empty) `personas` / `persona_objections` tables so Spec 2 slots in via one join.

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

-- created empty in Spec 1, populated in Spec 2:
personas(persona_id PK, name, ...)                              -- B
persona_objections(persona_id FK, obj_id FK)                    -- M:N
```

### Exports fall out as SQL
- **Rep profile YAML** ← `reps → calls → call_weaknesses/call_objections`, aggregated.
- **"Weaknesses across all reps"** ← `SELECT wt.label, COUNT(*) FROM call_weaknesses cw
  JOIN weakness_types wt USING(weak_id) GROUP BY wt.label ORDER BY 2 DESC`.
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
  db.py                    # thin persistence: create schema, load DataFrame → tables,
                           #   run export queries
  clustering.py            # LLM cluster calls: raw free-text → objection_types / weakness_types
                           #   + assign each call to type IDs (schema-validated)
  rep_trainer.db           # SQLite source of truth
  taxonomies/
    objection_types.yaml   # human-readable export of table C (review/edit convenience)
    weakness_types.yaml    # human-readable export of table D
  rep_profiles/<slug>.yaml # exported rep profile views (A)

notebooks/
  cleaning.ipynb           # orchestrator; imports cleaned_data.*

tests/
  test_cleaning.py         # pytest over pure functions + schema checks
```

### Notebook cell order
1. **Load & config** — read CSV (`csv.field_size_limit` bumped), select only INCLUDE columns.
2. **Filter non-calls** — drop no-show/skipped/ungraded-empty; print before/after counts.
3. **Normalize** — grade→unified scale (+ `grade_raw` quarantine for junk); close_ask→bool;
   rep name/email canonicalization (194-name collision check).
4. **Load into SQLite** — populate `reps` + `calls`.
5. **Cluster taxonomies (LLM)** — build `objection_types` (C) + `weakness_types` (D) from the
   pooled free-text, then tag each call → `call_objections` / `call_weaknesses`.
6. **Create empty persona tables** (for Spec 2).
7. **Export views** — rep-profile YAML + taxonomy YAML from SQL; print the team-wide weakness report.

### Grade normalization
Map both rubrics to one ordered band: `elite > strong > good > developing > needs_improvement > weak`.
Align letter grades and qualitative labels; fix Unicode-minus variants; junk → `grade_raw` only.
`total_score` (0–100) is the primary numeric; normalized grade is the categorical.

### LLM clustering & synthesis
- **Provider:** OpenRouter (OpenAI-compatible endpoint), model via `REP_PROFILE_MODEL`,
  default = current cheapest JSON-capable model. Key: `OPENROUTER_API_KEY`.
- **Two-pass:** (1) discover canonical objection/weakness clusters from a sampled/pooled set of
  free-text → the taxonomy tables; (2) classify each call against those clusters (multi-label) →
  the M:N link tables + evidence quotes.
- **Validation:** JSON schema (required keys; `frequency`/scores in range); retry on invalid.

### Thin-data handling
Reps below `min_scored_calls` get `data_confidence: thin`, numeric averages suppressed,
narrative still attempted if any free-text exists.

## Testing
`pytest tests/test_cleaning.py` over pure functions:
- `normalize_grade`: every observed variant → expected band; junk → quarantine; Unicode-minus fixed.
- `is_real_call`: no-show/skipped/empty-ungraded excluded; valid retained.
- `parse_close_ask` + close-ask-rate math.
- `canonicalize_rep`: case/whitespace/spelling collisions collapse to one slug.
- `aggregate_stats`: averages ignore missing; thin-data suppression below threshold.
- DB round-trip: load → export query returns expected shape.
- LLM outputs validated by **schema**, not exact text.

## Open items (implementation-time)
- `min_scored_calls` threshold.
- Exact OpenRouter model.
- Grade-band ordering — confirm it matches how the team reads the labels.
