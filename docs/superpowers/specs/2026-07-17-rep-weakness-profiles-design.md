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

## Data reality (validated against the full CSV)

- **3,967 rows / 194 reps.** Top reps 60–125 calls; a long tail has few.
- **`call_status` is `'scored'` for ALL 3,967 rows** — it does NOT flag no-shows/skips; useless as a filter.
- **The 1,628 rows with no `grade` are NOT no-shows** — they are an *older scoring rubric* that emits
  no letter-grade/`total_score` but still carries ~100% of the coaching free-text. **They must be kept**
  (they feed weakness taxonomy D + `call_weaknesses`); they are excluded only from *numeric* averages.
  Filtering them would discard ~41% of the coaching signal.
- **`no_show` is a messy mixed field:** clean values `no`/`false`/`No`/`none` (~3,957 attended) plus
  ~10 free-text no-show narratives (`"Technical No-Show"`, `"Yes — rep did not appear…"`). Needs a
  robust parser, not `== "true"`. Genuine no-shows (~10) are the only rows dropped as "not a call".
- **`grade` mixes two rubrics:** letter grades (`C+`, `B-`, `A-`) AND qualitative labels
  (`Elite`, `Strong`, `Developing`, `Needs Improvement`), plus 3 Unicode-minus variants and
  junk (`"D (context-adjusted…)"`). Needs normalization to one scale.
- **`scoring_raw_json` ≈ 48 MB** (12,174 chars × 3,967) — ~60% of the file. Drop it.
- **Numeric dimension scores are sparse AND corrupted:** `objection_handling`/`close_mechanics`/
  `frame_and_control`/`prospect_read` are only ~44% populated and mis-encoded (e.g. `"1425"` = 14/25
  with the separator lost; scale is /25, not /10). **Decision: dropped** — keep only `total_score`
  (0–100, ~59%) and `close_ask_rate` as numeric signal. See Field taxonomy.
- **`did_rep_ask_for_close`** (scored subset ~59%): `yes`/`Yes`/`no`/`No`/`unclear` + narrative values.
  Normalize case → bool; `unclear`/narrative → `None`; close-ask rate over clean yes/no only.
- **`call_date` is clean ISO-8601** (`2026-05-06T19:40:57.000Z`) → `grade_trend` is computable.
- **`objections_surfaced` is rich numbered free-text** (`"1. … 2. … 3. …"`, mixed `1.`/`1)` markers),
  each item blending objection + handling commentary → extraction splits on `\d+[.)]`; confirms the
  embed+cluster approach (cannot be hand-mapped).
- **Free-text ~100% covered:** what_to_improve, why_no_close, coaching_tip, rudys_note,
  one_line_verdict, biggest_strength, objections_surfaced.
  → **Narrative/clustering is the backbone; `total_score`/`close_ask` are the only numeric layer.**

## Field taxonomy

### INCLUDE — weakness signal (core, ~100%) → feeds D + call_weaknesses
`what_to_improve` · `why_no_close` · `red_flags` · `coaching_tip` ·
`Rep Improvement Suggestions (AI)` · `what_id_polish` · `rudys_note` · `one_line_verdict`

### INCLUDE — strengths (balance) → rep profile
`biggest_strength` · `what_went_well` · `what_made_this_close_work`

### INCLUDE — numeric signal (scored subset) → calls table
`total_score` (0–100) · `grade` (normalized categorical) · `did_rep_ask_for_close` (→ close-ask rate)

### INCLUDE — objection linkage & context → C + call_objections
`objections_surfaced` · `intended_outcome` · `deal_outcome_context` · `Flagged For Follow-Up (AI)`

### INCLUDE — identity / traceability → reps + calls
`rep_name` · `Rep Email` · `call_date` · `client_name` · `meeting_title` · `show_name` · `meeting_id`

### EXCLUDE — unnecessary (plumbing / bloat / near-empty / corrupted)
`scoring_raw_json` (48 MB bloat) · `grading_trace` · `source_airtable_*` · `model_version` ·
`meeting_link` · `meeting_transcript_link` · `rep_pdf_link` · `Meeting Transcript` ·
`minutes` (0.1%) · `skip_reason`/`error_details` (0%) · `call_status` (uniformly `'scored'`) ·
`coachability_signal` (13%) · `scorecard_key`/`automation_key` ·
**`objection_handling`/`close_mechanics`/`frame_and_control`/`prospect_read`/`self_assessment_accuracy`**
(44% sparse + corrupted /25 encoding — dropped per validation)

## SQLite schema (`cleaned_data/rep_trainer.db`)

```sql
reps(rep_id PK, name, email, slug UNIQUE)

calls(call_id PK, rep_id FK→reps, client_name, call_date, show_name, meeting_id,
      total_score, grade_normalized, grade_raw, close_ask BOOL, has_numeric_score BOOL,
      intended_outcome, deal_outcome_context, flagged_followup,
      one_line_verdict, biggest_strength, what_went_well, what_made_close_work,
      what_to_improve, why_no_close, red_flags, coaching_tip, rep_improvement, rudys_note,
      objections_surfaced)

objection_types(obj_id PK, label, definition, aliases)          -- C
weakness_types(weak_id PK, label, definition, coaching_fix)     -- D

call_objections(call_id FK, obj_id FK, handled, quote)          -- M:N; `handled` = well/poorly/unclear,
                                                                --   LLM-derived from the objection narrative
                                                                --   (NOT the dropped objection_handling column)
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
  calls_with_narrative: 73            # all real calls (incl. older-rubric, no numeric grade)
  calls_with_numeric_score: 68        # subset with total_score/grade
  avg_total_score: 47.2               # over calls_with_numeric_score only
  grade_normalized: developing
  grade_trend: improving              # improving / flat / declining (by call_date)
  close_ask_rate: 0.28                # over calls with a clean yes/no did_rep_ask_for_close
  data_confidence: high               # high / thin (< min_scored_calls)

recurring_weaknesses:                 # from call_weaknesses, ranked by frequency
  - weakness_type: accepts-stalls-without-probing
    frequency: 0.41
    evidence: ["attorney review stall accepted at face value"]
    coaching_fix: "Treat 'review with X' as a hidden money objection; probe before sending docs."

objection_profile:                    # from call_objections.handled, per objection type
  weakest_objection_types: [timing, authority]   # most often handled "poorly"
  strongest_objection_types: [price]             # most often handled "well"

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
  embeddings.py            # extract phrases, embed via OpenRouter, UMAP+HDBSCAN → proposed clusters
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
2. **Filter non-calls** — drop ONLY genuine no-shows (robust `no_show` parse) and rows with no
   free-text AND no scores. **Keep** the 1,628 older-rubric rows (narrative present). Set
   `has_numeric_score` per row. Print before/after counts + how many are narrative-only.
3. **Normalize** — grade→unified scale (+ `grade_raw` quarantine); `did_rep_ask_for_close`→bool
   (case-normalized; `unclear`/narrative→None); rep name/email canonicalization (194-name collisions).
4. **Load into SQLite** — populate `reps` + `calls`; create empty persona/summary tables.
5. **Propose clusters** — extract phrases (split `objections_surfaced` on `\d+[.)]`, plus weakness
   free-text) → embed → UMAP+HDBSCAN → candidate clusters; LLM labels each (label, definition,
   aliases, coaching_fix); seed `aliases` from existing `objections.json` types; export draft
   `taxonomies/*.yaml`.

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
1. **Extract** phrases: split `objections_surfaced` on `\d+[.)]` markers; pool weakness free-text.
2. **Embed** them via **OpenRouter's `/api/v1/embeddings`** endpoint, model `openai/text-embedding-3-small`,
   using the already-installed `openai` client with `base_url=https://openrouter.ai/api/v1`. Key:
   `OPENROUTER_API_KEY`. **No torch / sentence-transformers dependency.** (OpenRouter added embeddings
   support; confirmed available July 2026.)
3. **Cluster** — UMAP dimensionality reduction + HDBSCAN → candidate clusters (no fixed K).
4. **Label (strong LLM)** — for each cluster, produce canonical `label`, `definition`, `aliases`,
   `coaching_fix`. This is the only generative step and it's where a capable model earns its keep.
5. **Human gate** — Taxonomy Studio review/approve (above).
6. **Classify (cheap LLM, `gpt-4o-mini`)** — map every call to the *frozen* type IDs (multi-label)
   with an evidence quote. Closed-set → cheap, stable, reproducible.

- **LLM provider:** OpenRouter (OpenAI-compatible), chat model via `REP_PROFILE_MODEL`
  (default `openai/gpt-4o-mini` for classify; a stronger model for the label step). Embeddings model
  via `REP_EMBED_MODEL` (default `openai/text-embedding-3-small`). Key: `OPENROUTER_API_KEY`.
- **Validation:** JSON schema (required keys; scores/`frequency` in range); retry on invalid.

### Dependencies (validated: currently missing)
The `uv` venv has `openai`, `numpy`, `yaml`. The clustering step needs **`umap-learn`, `hdbscan`,
`scikit-learn`, `pandas`** (+ optional `pyarrow` for Parquet). These are for the *offline notebook
only* — add them to a **separate `[dependency-groups] data` group** so the deployed voice-agent image
stays lean. Embeddings reuse the existing `openai` client (no torch).

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
- `is_real_call`: genuine no-shows (incl. free-text no-show narratives) excluded; older-rubric
  narrative-only rows RETAINED; fully-empty rows excluded.
- `parse_close_ask`: `yes`/`Yes`→True, `no`/`No`→False, `unclear`/narrative/blank→None; rate math.
- `has_numeric_score` set correctly for graded vs older-rubric rows.
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

## Validation status
Deeply validated against the full CSV + `uv` venv (2026-07-17). Resolved: filtering bug (keep
older-rubric rows), corrupted numeric dims (dropped), messy `no_show`/`did_rep_ask_for_close`
(robust parsers), dependency weight (OpenRouter embeddings, no torch), OpenRouter embeddings
feasibility (confirmed supported). No open blockers.

## Open items (implementation-time, non-blocking)
- `min_scored_calls` default 8 — confirm with the team.
- Label-step chat model on OpenRouter (classify is `gpt-4o-mini`).
- Grade-band ordering — confirm it matches how the team reads the labels.
