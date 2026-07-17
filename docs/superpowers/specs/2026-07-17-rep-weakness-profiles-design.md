# Rep Weakness Profiles — Design Spec

**Date:** 2026-07-17
**Status:** Approved design → ready for implementation plan
**Branch:** feat/rep-trainer-runtime-loop

## Goal

Clean the scattered Zoom-call scorecard data into **one YAML weakness profile per
sales rep**. Each profile captures a rep's recurring weaknesses (with evidence),
supporting numeric trends, strengths, and the objection types they fumble — so the
rep-trainer can target training at each rep's real gaps and a human coach can read
the profile directly.

## Scope

**In scope**
- Data cleaning of `data/raw_data/Performance Bot Scorecards-Grid view.csv`
  (3,967 rows, 194 reps, 81 MB) in `notebooks/cleaning.ipynb`.
- One `cleaned_data/rep_profiles/<rep_slug>.yaml` per rep with enough scored calls.
- A cleaned intermediate dataset for re-running synthesis without re-cleaning.

**Out of scope (separate task)**
- Prospect personas / objection+escalation library for the voice agent.
  *Exception:* each rep profile records **which objection types the rep is weakest at**
  (`objection_profile`), the bridge that later selects which prospect to drill them against.

## Data reality (from analysis)

- **3,967 rows / 194 reps.** Top reps have 60–125 scored calls; a long tail has few.
- **1,628 rows have no grade** — no-shows / disqualified / skipped. Must be filtered.
- **`grade` mixes two rubrics:** letter grades (`C+`, `B-`, `A-`) AND qualitative labels
  (`Elite`, `Strong`, `Developing`, `Needs Improvement`), plus 3 Unicode-minus variants
  and junk values (`"D (context-adjusted…)"`). Needs normalization to one scale.
- **`scoring_raw_json` ≈ 48 MB** (12,174 chars × 3,967) — ~60% of the file. Pure bloat; drop.
- **Numeric scores are sparse:** `objection_handling`/`close_mechanics`/`frame_and_control`/
  `prospect_read` on ~44% of rows; `total_score`/`grade`/`did_rep_ask_for_close` on ~59%;
  `coachability_signal` on only 13%.
- **Free-text is ~100% covered:** `what_to_improve`, `why_no_close`, `coaching_tip`,
  `rudys_note`, `one_line_verdict`, `biggest_strength`, `objections_surfaced`.
  → **Narrative synthesis is the backbone; numeric trends are a supporting layer over the scored subset.**

## Field taxonomy

### INCLUDE — weakness signal (core, ~100%)
`what_to_improve` · `why_no_close` · `red_flags` · `coaching_tip` ·
`Rep Improvement Suggestions (AI)` · `what_id_polish` · `rudys_note` · `one_line_verdict`

### INCLUDE — strengths (balance)
`biggest_strength` · `what_went_well` · `what_made_this_close_work`

### INCLUDE — numeric dimensions (scored subset only, sparse-aware)
`total_score` · `grade` (normalized) · `objection_handling` · `did_rep_ask_for_close`
(→ close-ask rate) · `close_mechanics` · `frame_and_control` · `prospect_read` ·
`self_assessment_accuracy`

### INCLUDE — objection linkage & context
`objections_surfaced` · `intended_outcome` · `deal_outcome_context` · `Flagged For Follow-Up (AI)`

### INCLUDE — identity / traceability (metadata, not analyzed)
`rep_name` · `Rep Email` · `call_date` · `client_name` · `meeting_title` · `show_name` · `meeting_id`

### EXCLUDE — unnecessary (plumbing / bloat / near-empty)
`scoring_raw_json` (48 MB bloat) · `grading_trace` (audit dump) ·
`source_airtable_record_id` / `_created_time` / `_ingested_at` / `_processing_status` ·
`model_version` · `meeting_link` · `meeting_transcript_link` · `rep_pdf_link` ·
`Meeting Transcript` · `minutes` (0.1%) · `skip_reason` / `error_details` (0%) ·
`coachability_signal` (13% — too sparse) · `scorecard_key` / `automation_key`

## Rep profile YAML schema

One file per rep: `cleaned_data/rep_profiles/<rep_slug>.yaml`. Flat `snake_case`,
consistent with `prompts/personas/*.yaml` conventions.

```yaml
rep_name: Mike Zanardelli
rep_email: mike.z@example.com
rep_slug: mike-zanardelli
generated_at: 2026-07-17
data_window: {first_call: 2026-01-04, last_call: 2026-07-10}

stats:                          # deterministic; scored subset only
  calls_scored: 68
  calls_total_ingested: 73      # incl. no-shows/skipped (transparency)
  avg_total_score: 47.2
  grade_normalized: developing  # unified across both rubrics
  grade_trend: improving        # improving / flat / declining over time
  close_ask_rate: 0.28          # from did_rep_ask_for_close
  dimension_avgs:               # omitted per-key if < min_samples
    objection_handling: 6.1
    frame_and_control: 5.4
    prospect_read: 6.8
  data_confidence: high         # high / thin — drives whether stats show

recurring_weaknesses:           # LLM theme synthesis, ranked most→least frequent
  - theme: Accepts stalls without probing
    frequency: 0.41             # share of calls exhibiting it (0–1)
    evidence:
      - "attorney review stall was accepted at face value"
      - "handed the timeline to the prospect"
    coaching_fix: "Treat 'I need to review with X' as a hidden money objection; probe before sending docs."
  - theme: Rarely asks for the commitment
    frequency: 0.72
    evidence: ["never asked for a commitment"]
    coaching_fix: "..."

objection_profile:              # bridge to prospect drilling
  weakest_objection_types: [timing, authority]
  strongest_objection_types: [price]

strengths:
  - Clean offer walkthrough
  - Reads the room and pivots smoothly

coach_notes:                    # synthesis of rudys_note (human coach signal)
  - "Gap is behavioral, not knowledge — he knows the product cold."

source_scorecards: 68           # traceability
```

## Architecture

```
cleaned_data/
  __init__.py
  cleaning_utils.py          # pure, unit-tested: normalize_grade, is_real_call,
                             #   parse_close_ask, canonicalize_rep, aggregate_stats,
                             #   build_profile_dict, dump_profile_yaml
  scored_calls.parquet       # cleaned intermediate (re-run synthesis w/o re-cleaning)
  rep_profiles/
    <rep_slug>.yaml          # one per qualifying rep

notebooks/
  cleaning.ipynb             # orchestrator; imports cleaned_data.cleaning_utils

tests/
  test_cleaning.py           # pytest over the pure functions
```

**Separation of concerns:** logic lives in `cleaned_data/cleaning_utils.py` (importable,
testable, reusable by the agent runtime later); the notebook only orchestrates and shows
before/after counts. Data outputs also land in `cleaned_data/`.

### Notebook cell order
1. **Load & config** — read CSV with `csv.field_size_limit` bumped; select only INCLUDE
   columns (drops `scoring_raw_json`/`grading_trace` at read → ~60% memory saved).
2. **Filter non-calls** — drop `no_show`/skipped/ungraded-empty; print before/after counts.
3. **Normalize** — `grade` → unified scale; `did_rep_ask_for_close` → bool;
   `rep_name`/`email` canonicalization (194-name collision check).
4. **Aggregate per rep** — deterministic `stats` block.
5. **LLM synthesis** — per rep, free-text → `recurring_weaknesses` + `objection_profile`
   + `coach_notes` as structured JSON (OpenRouter, cheapest model).
6. **Emit** — write `rep_profiles/*.yaml` + `scored_calls.parquet`.

### Grade normalization
Map both rubrics to one ordered band (e.g. `elite > strong > good > developing >
needs_improvement > weak`), aligning letter grades and qualitative labels. Fix the 3
Unicode-minus variants. Quarantine junk values in a `grade_raw` field, never in the
normalized one. `total_score` (0–100, when present) is the primary numeric; normalized
grade is the categorical.

### LLM synthesis
- **Provider:** OpenRouter (OpenAI-compatible endpoint), model configurable via
  `REP_PROFILE_MODEL`, default = current cheapest capable-of-JSON model. Key: `OPENROUTER_API_KEY`.
- **Input per rep:** the concatenated free-text weakness/strength/coach fields across that
  rep's scored calls (chunked if over context).
- **Output:** JSON validated against the `recurring_weaknesses` / `objection_profile` /
  `coach_notes` schema (required keys present, `frequency` ∈ [0,1]); retry on invalid.

### Thin-data handling
Reps below a `min_scored_calls` threshold get `data_confidence: thin`, numeric averages
suppressed (or shown with a caveat), narrative synthesis still attempted if any free-text exists.

## Testing

`pytest tests/test_cleaning.py` over the pure functions:
- `normalize_grade`: every observed variant → expected band; junk → quarantine; Unicode-minus fixed.
- `is_real_call`: no-show / skipped / empty-ungraded excluded; valid retained.
- `parse_close_ask`: yes/no/blank → bool/None; close-ask rate math.
- `canonicalize_rep`: case/whitespace/spelling collisions collapse to one slug.
- `aggregate_stats`: averages ignore missing; thin-data suppression triggers below threshold.
- Profile dict conforms to schema; YAML round-trips.

LLM synthesis validated by **schema**, not exact text.

## Open questions / assumptions
- `cleaned_data/` is a new top-level package holding both logic and outputs (per user).
- Exact `min_scored_calls` threshold and the OpenRouter model chosen at implementation.
- Parquet chosen for the intermediate; falls back to CSV if `pyarrow` unavailable.
