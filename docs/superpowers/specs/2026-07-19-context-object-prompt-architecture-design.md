# Context Object Prompt Architecture — Phase 1 Design

**Date:** 2026-07-19
**Status:** Approved design → ready for implementation plan
**Branch:** feat/rep-trainer-runtime-loop

## Goal

Replace the direct `build_bot_prompt() → string` synthesis with a
**Context Assembler → validated Context Object → Prompt Renderer** pipeline. The
Context Object becomes the single source of truth: layers are loaded and validated
into a typed, frozen object, then rendered into the prospect agent's system prompt.
This Phase 1 covers the **static + session-config layers only**; runtime-stateful
layers (Dynamic State, Conversation Memory, separate Evaluator LLM) are deferred to
later specs and plug into the Context Object then.

## Scope

**Phase 1 (this spec)**
- `context/` package: layer loaders + typed dataclasses, `Assembler`, `Context`, `Renderer`.
- Layers: **system, conversation-policy, persona, company (minimal), scenario,
  objection packs, difficulty (session), call-type (session), evaluation-config**;
  **knowledge as an optional, empty-tolerant slot**.
- Migrate real content from `prompts/*` into `context/*`; `build_bot_prompt` becomes a
  thin shim over `assemble()+render()`, then is removed once the agent is wired.
- Wire `src/agent.py` to assemble a Context from session metadata and inject the render.

**Deferred (later specs, not built here)**
- Layer 9 Dynamic State (trust/interest/patience evolving mid-call).
- Layer 10 Conversation Memory (facts, per-turn extraction/compaction).
- Layer 11 as a fully separate Evaluator/Coach LLM pipeline (current `scoring.py`/coach stays).

**Hard constraint:** all persona/company/scenario/objection content is derived from the
**real corpus** (existing bots `april-alvarado`, `charlie-ritenour`; CSVs; objection
taxonomy). The SaaS examples in the source proposal (Michael Thompson / PivotalScale /
Copilot) are illustrative only and are NOT used.

## Context: what exists today

- `src/bot_config.py`: `build_bot_prompt(bot_slug, *, ...)` merges persona + scenario +
  objection_card + call_type + difficulty into `prompts/behavior_template.md` → one string.
- `prompts/`: `behavior_template.md` (rules + character card baked together),
  `personas/*`, `scenarios/*`, `objection_cards/*`, `call_types/*`, `difficulty/*`,
  `scorecards/*`, `rubric.md`.
- `src/agent.py:425-426`: still injects the OLD `build_prospect_prompt(env var)` — not the
  layered system. Reads `rep_id` (not bot) from `ctx.room.metadata`.

This design generalizes the implicit assembly in `build_bot_prompt` into an explicit,
validated Context Object, and finishes the agent wiring through it.

## Architecture

```
Assembler.assemble(selection, dirs) ──▶ Context (frozen, validated) ──▶ render(context) ──▶ str ──▶ ProspectAgent
```

Directory (`context/` package holds both code and layer YAML, mirroring `cleaned_data/` convention):
```
context/
  __init__.py
  models.py          # typed dataclasses: SystemRules, ConversationPolicy, Persona,
                     #   Company, KnowledgeBundle, Scenario, ObjectionCard, ObjectionPack,
                     #   Difficulty, CallType, ScorecardConfig, Context
  loaders.py         # load_yaml + per-layer parse/validate → dataclass (raise on bad)
  assembler.py       # assemble(selection) -> Context  (loads, composes packs, validates)
  renderer.py        # render(context) -> str
  data/
    system/system.yaml
    policy/conversation.yaml
    personas/<id>.yaml
    companies/<id>.yaml
    scenarios/<id>.yaml
    objections/<id>.yaml        # one card per objection type
    difficulty/{easy,medium,hard}.yaml
    call_types/{closing,discovery,follow_up}.yaml
    scorecards/<name>.yaml
    knowledge/<id>.yaml         # optional; absent is valid
```

## The layers (Phase 1)

- **System** (`system/system.yaml`): universal buyer rules (never coach, never break
  character, never invent facts, don't reveal hidden info unless earned). Extracted from
  `behavior_template.md`. Loaded every session.
- **Conversation Policy** (`policy/conversation.yaml`): HOW conversations work
  (`only_answer_questions_asked`, `volunteer_information: false`, `ask_questions_back`,
  `interrupt_if_salesy`, `never_teach_rep`). Also extracted from the template. Shared by all.
- **Persona** (`personas/<id>.yaml`): identity + personality + communication/decision style +
  values + risk tolerance. From real bots. **No difficulty field.**
- **Company** (`companies/<id>.yaml`, minimal-real): `name`, `industry`, `sub_industry`,
  optional `business_stage`/`initiatives` — derived from the persona's real business fields.
  A persona references a `company` id (many personas may share one later).
- **Knowledge** (`knowledge/<id>.yaml`, optional): known pains/metrics/desired outcome. The
  Assembler tolerates absence (`knowledge=None`); no fabricated research blob for ISTV data.
- **Scenario** (`scenarios/<id>.yaml`): why the call is happening — `type`, `context`,
  `buyer_goal`, `hidden_information`. From real scenarios.
- **Objection Packs** (`objections/<id>.yaml`): one **card** per objection type
  (`id, trigger, emotion, buyer_language, acceptable_resolution, coach_signal`). The
  selection names card ids; the Assembler composes them into an `ObjectionPack`. Real content
  from the objection taxonomy + real `objections_surfaced`.
- **Difficulty** (`difficulty/<level>.yaml`, session choice): authored `framing` block per
  level (easy/medium/hard), injected verbatim. Not part of persona.
- **Call-type** (`call_types/<type>.yaml`, session choice): `frame` + `rep_objective`.
- **Evaluation-config** (`scorecards/<name>.yaml`): weighted criteria. Carried in Context for
  the coach/scorer; the buyer render never includes it.

## The Context Object

```python
@dataclass(frozen=True)
class Context:
    system: SystemRules
    policy: ConversationPolicy
    persona: Persona
    company: Company
    knowledge: KnowledgeBundle | None
    scenario: Scenario
    objections: ObjectionPack
    difficulty: Difficulty
    call_type: CallType
    evaluation: ScorecardConfig
```
Each field is its own frozen dataclass parsed from YAML. `Context` is inspectable and
testable without rendering (assert on `context.persona.name`, `context.objections.card_ids`, …).

## Assembler & validation (fail-fast)

`assemble(selection: Selection, data_dir=CONTEXT_DATA) -> Context` where `Selection` =
`{persona_id, scenario_id, objection_ids, call_type, difficulty, scorecard, company_id?, knowledge_id?}`.
It loads each referenced layer, composes the objection cards into an `ObjectionPack`, and
validates: every referenced id resolves; required fields non-empty; `difficulty`/`call_type`
are known; unknown `objection_id` → `ValueError`; missing persona/scenario → `ValueError`;
absent `knowledge_id` → `knowledge=None` (allowed). Nothing half-built reaches a call.

## Objection Packs

Replace the single `objection_card` with per-type cards. Card schema:
```yaml
id: trust
trigger: prospect has been burned by a prior vendor / skeptical of claims
emotion: guarded
buyer_language: ["How do I actually know this works?", "I've heard that pitch before."]
acceptable_resolution: proof / social proof / concrete result
coach_signal: rep acknowledged the concern and backed the reframe with evidence
```
`ObjectionPack` = ordered list of selected cards (first = primary). Composition dedupes by id;
unknown id raises. Real card set derived from the objection taxonomy (trust, timing, finances,
authority, price, …).

## Prompt Renderer

`render(context: Context) -> str` assembles sections top-to-bottom:
`system → policy → persona (+company, +knowledge?) → scenario → objection pack → difficulty
framing → call-type frame`. Reuses `behavior_template.md`'s character/objection/escalation
prose as the persona/scenario/objection section; system + policy are prepended from their own
layers. Preserves fail-on-unfilled-placeholder. `evaluation` is NOT rendered into the buyer prompt.

## Migration & agent wiring

- Create `context/` and migrate real content: system/policy extracted from `behavior_template.md`;
  personas/scenarios/objection cards/difficulty/call_types/scorecards moved or derived from the
  existing `prompts/*` + real bots (april-alvarado, charlie-ritenour) into `context/data/*`.
- `build_bot_prompt` → thin shim: builds a `Selection` from a bot slug + session overrides,
  calls `assemble()+render()`. Existing `build_bot_prompt` tests keep passing via the shim.
  Remove the shim once the agent is wired.
- `src/agent.py`: build a `Selection` from `ctx.room.metadata` (persona/bot id, call_type,
  difficulty, objection ids from the scenario) → `assemble()` → `render()` → inject into
  `ProspectAgent` (replacing the old `build_prospect_prompt` path). Console fallback = a default
  Selection. Briefing sourced from the Context's persona + objection pack.

## Testing

TDD on pure units:
- Each loader parses valid YAML → dataclass; rejects missing required fields.
- `assemble`: valid selection → Context; unknown persona/scenario/objection id → `ValueError`;
  absent knowledge tolerated (`None`); difficulty/call-type validated.
- `ObjectionPack` composition: ids → ordered deduped pack; unknown id raises; first = primary.
- `render(context)`: all sections present, no unfilled `{{...}}`, evaluation absent from output.
- Real end-to-end: assemble a real bot's selection → render → prompt contains persona name,
  the selected objections' `buyer_language`, and the chosen difficulty `framing`.
- `build_bot_prompt` shim: existing behaviour preserved (delegates to assemble+render).

## Open items (implementation-time)
- Exact `Selection` source in metadata: which field carries objection-card ids (scenario-derived
  vs explicit) — confirm against the `POST /api/sessions` payload.
- Whether system/policy stay as separate top-of-prompt sections or fold into a single
  `behavior_template` header (both keep the authored text; a structural choice).
- Company/Knowledge enrichment is deferred until real content exists.
