# Hyperbound-Style Bot Config — Design Spec

**Date:** 2026-07-18
**Status:** Approved design → ready for implementation plan
**Branch:** feat/rep-trainer-runtime-loop

## Goal

Restructure the prospect/roleplay prompt system into Hyperbound's modular "bot"
pattern: a bot is a **composition of independent, data-derived config layers**
(persona + scenario + objection card + difficulty + call type) rendered into one
system prompt, plus a **weighted multi-criterion scorecard** used after the call.

**Hard constraint:** every config value must be **derived from the real corpus**
(the 3,967-call scorecards + 1,840 Meeting-Transcripts metadata rows + transcripts).
No template/synthetic content. The 1–2 demo bots are hand-assembled but each field
still comes from a specific real call (traceable via `source_meeting_id`).

## Context: what exists today

- `prompts/prospect_template.md` — a strong call-agnostic roleplay system prompt
  (character rules, 3-tier objection card, escalation dynamics, anti-jailbreak, silent tools).
- `prompts/personas/*.yaml` — narrative persona data filling the template's `{{placeholders}}`.
- `prompts/rubric.md` — a single objection-handling framework (acknowledge→reframe→evidence→re_ask).
- `src/personas.py` — `render_prompt` / `build_prospect_prompt` fill placeholders, raise on unfilled.
- `cleaned_data/` — SQLite corpus + taxonomies + per-rep weakness profiles (the data layer).

This is ~70% of Hyperbound's structure. The gaps: no call-type/scenario/difficulty/objective
layer, personas are prose rather than structured ICP fields, the rubric is one framework
rather than a weighted scorecard, and nothing is derived from the corpus yet.

## Real-data → Hyperbound-field mapping (validated)

From `Meeting Transcripts-Grid view.csv` (values like `"None"`/`"Unknown"` treated as empty):

| Real field | Bot config field |
|------------|------------------|
| `Indusrtry` / `Sub-industry` | persona: `industry`, `sub_industry` |
| `Business Stage` | scenario: `situation` |
| `Objection/Friction` (comma list) | objection_card: `objection_types` |
| `Motivation` (comma list) | persona: `motivations` |
| `Buying Authority` (Yes/No) | persona: `buying_authority` |
| `Package Discussed` (Light/Standard/VIP) | scenario: `offer_on_table` |
| `Call Disposition` | scenario: `disposition_context`, difficulty hint |
| `Client Name` / `Business name` | persona: `character_name`, `business_name` |
| Scorecard cols (`frame_and_control`, `objection_handling`, `close_mechanics`, `prospect_read`, `did_rep_ask_for_close`, `self_assessment_accuracy`) | scorecard criteria |
| Transcript text + `objections_surfaced` quotes | persona voice/backstory + objection example lines (LLM tier) |

## Architecture: layered, composable bot

A **bot** = `persona + scenario + objection_card + difficulty + call_type`, composed at
runtime into the system prompt. The **scorecard** is separate (post-call, consumed by the scorer).

```
prompts/
  behavior_template.md        # generalized prospect_template.md — call-agnostic rules,
                              #   parameterized by {{call_type_frame}} + {{difficulty_frame}}
  bots/<slug>.yaml            # a bot = refs to its layers + source_meeting_id
  personas/<slug>.yaml        # structured ICP persona (data-derived)
  scenarios/<slug>.yaml       # call situation (data-derived)
  objection_cards/<slug>.yaml # objection types + real example quotes (data-derived)
  call_types/<type>.yaml      # closing | discovery | follow_up — the call frame + objective
  difficulty/<level>.yaml     # easy | medium | hard — escalation modifiers
  scorecards/<name>.yaml      # weighted multi-criterion (data-derived)
```

### Layer schemas

**persona** (structured ICP, replaces prose personas):
```yaml
character_name: April Alvarado
business_name: April's Beauty Bar
industry: Wellness/Beauty
sub_industry: Cosmetology / Nail & Beauty Services
role: owner
buying_authority: false          # from "Buying Authority: No"
motivations: [credibility_authority, brand_narrative, growth_roi, recognition_validation]
# voice/backstory — LLM tier, from real transcript; hand-written from transcript for demo
speech_style_description: ...
signature_phrases: [...]
character_core_motivation: ...
source_meeting_id: rec...
```

**scenario**:
```yaml
call_type: closing
situation: >               # from Business Stage, verbatim-grounded
  Solo home-based cosmetologist in Denver planning to expand to brick-and-mortar and
  possibly relocate to Miami; pricing pressure suggests early-stage revenue.
offer_on_table: [Light, Standard, VIP]     # Package Discussed
what_would_flip_them: >    # inferred from motivations + objections in the real call
  Concrete proof the exposure converts to bookings, and a payment structure that fits early-stage cash flow.
disposition_context: Scheduled Follow-Up   # real outcome
source_meeting_id: rec...
```

**objection_card** (data-derived; example lines from real quotes at LLM tier):
```yaml
objection_types: [trust, timing, finances]   # from Objection/Friction
primary: trust
example_lines:                                 # from real objections_surfaced quotes
  trust: ["..."]
  timing: ["..."]
  finances: ["..."]
source_meeting_id: rec...
```

**call_types/closing.yaml** (Hyperbound's call-type frame + objective):
```yaml
call_type: closing
frame: >
  The rep has already built some rapport and is here to present the offer and drive
  to a commitment today. You know roughly what's being offered.
rep_objective: Get a yes (or a scheduled, dated commitment) on a package.
```
(discovery.yaml, follow_up.yaml analogous — discovery: uncover pain/authority before pitch;
follow_up: rep re-opens after you "took it back to your people".)

**difficulty/medium.yaml** (modifiers, not new content):
```yaml
level: medium
skepticism_baseline: guarded
objections_stack: true       # secondary/tertiary surface if primary mishandled
softening_speed: normal      # how readily you warm when acknowledged
shutdown_threshold: 2        # ignored-twice → shutdown
```

**scorecards/closing.yaml** (weighted multi-criterion, real dimensions):
```yaml
name: closing_v1
# weights sum to 1.0; informed by corpus score distributions; objection sub-steps reuse rubric.md
criteria:
  - {key: objection_handling,      weight: 0.30, scale: "0-10"}
  - {key: close_mechanics,         weight: 0.25, scale: "0-10"}
  - {key: frame_and_control,       weight: 0.15, scale: "0-10"}
  - {key: prospect_read,           weight: 0.15, scale: "0-10"}
  - {key: did_rep_ask_for_close,   weight: 0.10, scale: bool}
  - {key: self_assessment_accuracy, weight: 0.05, scale: "0-10"}
```

**bots/<slug>.yaml** (the composition unit):
```yaml
slug: april-alvarado-closing
persona: april-alvarado
scenario: april-alvarado-closing
objection_card: april-alvarado
call_type: closing
difficulty: medium
scorecard: closing_v1
source_meeting_id: rec...
```

### Rendering
Extend `src/personas.py` with `build_bot_prompt(bot_slug) -> str`: load the bot's
referenced layers, merge into one values dict, render `behavior_template.md` (which gains
`{{call_type_frame}}`, `{{rep_objective}}`, and difficulty-driven placeholders). Keep the
fail-on-unfilled-placeholder guarantee. `build_briefing` extends to state call type + objective.

## Data-derivation pipeline (two tiers)

1. **Deterministic tier (no API key — works today):** `cleaned_data`-style extractor reads
   Meeting Transcripts + the SQLite `calls` table and emits `persona`/`scenario`/`objection_card`
   YAML with the structured fields filled. Comma-lists split; `None`/`Unknown` dropped.
2. **LLM-enrichment tier (needs `OPENROUTER_API_KEY` — later):** from the real transcript text,
   generate `speech_style_description`, `signature_phrases`, `character_core_motivation`, and
   per-objection `example_lines`. Reuses the OpenRouter client + JSON-validated prompting in
   `cleaned_data/clustering.py`.

Bot configs are effectively another **export view** of the corpus, consistent with the
"SQLite = source of truth, files = generated views" principle from the data-layer spec.

## Call types

Build only what the data supports: **closing (primary), discovery, follow-up.** No cold-call.
Difficulty per bot inferred from the real call's objection count + disposition
(more objections / harder disposition → higher difficulty).

## Demo deliverable

1–2 complete bots assembled from **real** calls (e.g. `april-alvarado-closing` — Wellness/Beauty,
objections Trust/Timing/Finances, no buying authority, Light/Standard/VIP discussed; plus one
discovery bot from another real row), each with persona + scenario + objection_card + scorecard,
every field carrying its `source_meeting_id`. For demo, voice/example-lines are hand-written
**from the real transcript** (not fabricated) since the LLM tier is API-key-gated.

## Testing

`pytest` over the deterministic extractor + renderer (pure/composable):
- extractor: real row → expected structured fields; `None`/`Unknown`/`No Show` dropped; comma-lists split.
- `build_bot_prompt`: composes all layers; raises on any unfilled placeholder; call-type frame + objective present.
- difficulty inference: objection load/disposition → expected level.
- scorecard: weights sum to 1.0; every criterion key is a real corpus column.
- LLM-tier outputs validated by schema, not exact text.

## Migration / compatibility

- `prospect_template.md` → `behavior_template.md` (generalized); old 3 narrative personas are
  superseded by data-derived personas but kept until the demo bots are validated.
- `rubric.md` retained as the objection sub-step reference the scorecard's `objection_handling` criterion cites.
- `scoring.py` consumes the new weighted scorecard instead of the single rubric.

## Open items (implementation-time)
- Exact difficulty-inference thresholds (objection count / disposition mapping).
- Scorecard weights — confirm against corpus score distributions with the team.
- Which second call type to seed for the demo (discovery vs follow-up).
