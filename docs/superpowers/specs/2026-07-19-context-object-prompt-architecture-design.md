# Context Object Prompt Architecture — Phase 1 Design

**Date:** 2026-07-19
**Status:** Approved design (architecture locked) → ready for implementation plan
**Branch:** feat/rep-trainer-runtime-loop

## Goal

Make a **Validated Context Object** the single source of truth for the AI Sales
Roleplay platform. Layers are loaded, validated, and assembled into a typed, frozen
Context Object; renderers then format that object into prompts. The prompt is an
*output* of the Context, never the source of truth. This Phase 1 covers the static +
session-config layers; runtime-stateful layers (Dynamic State, Conversation Memory,
a fully separate Evaluator LLM pipeline) are **reserved as placeholders** and deferred.

## Overall architecture

```
Context Sources
      │
      ▼
Context Assembler          (loads layers, merges objection packs, builds manifest)
      │
      ▼
Context Validator          (fail-fast; never silently recovers)
      │
      ▼
Validated Context Object   (single source of truth)
      ├───────────────┐
      ▼               ▼
Buyer Renderer    Evaluator Renderer
      │               │
      ▼               ▼
 Buyer Prompt    Evaluation Prompt
      │
      ▼
 Prospect Agent
```

- The **Context Object owns meaning; renderers own formatting.** (Principle A/C below.)
- The **Buyer Renderer** never sees `evaluation_config` (or `state`/`memory`).
- The **Evaluator Renderer** formats `evaluation_config` for the coach/scorer; it is the
  seam for the future separate Evaluator LLM — Phase 1 keeps it a simple formatter feeding
  the existing coach, not a new LLM pipeline.

## Scope

**Phase 1 (this spec)**
- `context/` package: typed layer models, `Assembler`, `Validator`, `Context`, `BuyerRenderer`,
  `EvaluatorRenderer`, context manifest.
- Layers below (real content from the corpus). `knowledge`, `state`, `memory` are **reserved
  placeholder fields** — present in the object, not implemented.
- Migrate real content from `prompts/*` into `context/*`; `build_bot_prompt` becomes a thin
  shim over `assemble → validate → render`, then removed once the agent is wired.
- Wire `src/agent.py` to assemble+validate a Context from session metadata and inject the buyer render.

**Deferred (later specs — do NOT build here)**
- Dynamic State behavioral evolution; Conversation Memory (summarization/facts); a fully separate
  Evaluator/Coach LLM pipeline; RAG/retrieval/knowledge architecture; orchestration engines;
  runtime state machines; advanced analytics.

**Hard constraint:** persona/company/scenario/objection content derives from the **real corpus**
(existing bots `april-alvarado`, `charlie-ritenour`; CSVs; objection taxonomy). The SaaS examples
in the proposal (Michael Thompson / PivotalScale / Copilot) are illustrative only and NOT used.

## Context layers

```
Context
├── system                (universal buyer rules)
├── conversation_policy   (how conversations work)
├── persona               (who the buyer is)
├── company               (buyer's environment; minimal-real)
├── knowledge             (PLACEHOLDER: {items: []})
├── scenario              (why the call is happening)
├── objection_pack        (composed from cards; hybrid selection)
├── difficulty            (session choice)
├── call_type             (session choice)
├── state                 (PLACEHOLDER: null)
├── memory                (PLACEHOLDER: null)
└── evaluation_config     (NOT rendered to buyer)
```

### Layer ownership (Principle B — one owner per field, no duplication)
- **Persona** owns: identity, personality, communication_style, decision_style, values, risk_tolerance.
- **Company** owns: name, industry, sub_industry, business_stage, initiatives.
- **Scenario** owns: meeting context, buyer_goal/objectives, hidden_information.
- **Difficulty** owns: behavioral intensity, skepticism, interruption style (authored `framing`).
- **Conversation Policy** owns: answering/disclosure/turn-taking rules (shared by all buyers).
- **System** owns: universal, never-changing buyer rules.
No field appears in two layers.

### Layer metadata (Phase 1: metadata only, no runtime behavior)
Every layer YAML includes:
```yaml
id: hard
version: 1
priority: 60
```
Suggested priorities: System 100, Conversation Policy 90, Persona 80, Company 75, Scenario 70,
Difficulty 60, Knowledge 50, Memory 40, Evaluation 10. **Priorities are metadata only in Phase 1**
— no ordering/behavior is driven by them yet (render order is the fixed canonical order below).

## Canonical buyer render order

The Buyer Renderer emits sections in this fixed logical order:
```
1. System
2. Conversation Policy
3. Difficulty
4. Persona
5. Company
6. Scenario + Call Type
7. Objection Packs
8. Knowledge (optional; omitted when empty)
```
`evaluation_config`, `state`, and `memory` are **excluded** from the buyer prompt.

## Directory structure

`context/` holds both code and layer YAML (mirrors the `cleaned_data/` convention):
```
context/
  __init__.py
  models.py        # frozen dataclasses: LayerMeta, SystemRules, ConversationPolicy, Persona,
                   #   Company, KnowledgeBundle, Scenario, ObjectionCard, ObjectionPack,
                   #   Difficulty, CallType, ScorecardConfig, Context, Selection, ContextManifest
  loaders.py       # load YAML → dataclass (+ LayerMeta), reject missing required fields
  assembler.py     # assemble(selection) -> (Context, ContextManifest); merges objection pack
  validator.py     # validate(context) -> None  (fail-fast; raises ValidationError)
  renderer.py      # render_buyer(context) -> str ; render_evaluator(context) -> str
  data/
    system/system.yaml
    policy/conversation.yaml
    personas/<id>.yaml
    companies/<id>.yaml
    scenarios/<id>.yaml
    objections/<id>.yaml         # one card per objection type
    difficulty/{easy,medium,hard}.yaml
    call_types/{closing,discovery,follow_up}.yaml
    scorecards/<name>.yaml
    knowledge/                   # reserved; empty in Phase 1
```

## Context Object

```python
@dataclass(frozen=True)
class Context:
    system: SystemRules
    conversation_policy: ConversationPolicy
    persona: Persona
    company: Company
    knowledge: KnowledgeBundle          # placeholder: items == []
    scenario: Scenario
    objection_pack: ObjectionPack        # composed via hybrid merge
    difficulty: Difficulty               # session choice
    call_type: CallType                  # session choice
    state: None = None                   # placeholder, deferred
    memory: None = None                  # placeholder, deferred
    evaluation_config: ScorecardConfig = ...   # not rendered to buyer
```
Each concrete layer is its own frozen dataclass carrying a `meta: LayerMeta` (id/version/priority).
`Context` is inspectable/testable without rendering.

## Assembler + Validator (two distinct stages)

- **`assemble(selection, data_dir) -> (Context, ContextManifest)`**: loads each referenced layer,
  computes the hybrid objection pack, sets `knowledge=KnowledgeBundle(items=[])`, `state=None`,
  `memory=None`, and produces the manifest. Does NOT decide behavior — pure loading/formatting inputs.
- **`validate(context) -> None`**: a separate fail-fast stage run before any rendering. Validates:
  persona exists, scenario exists, difficulty exists, company exists, every objection id exists,
  evaluation_config exists, call_type is valid. Raises `ValidationError` on any failure. **Never
  silently recovers** from invalid configuration.

Pipeline: `assemble → validate → render`. The agent calls all three; a validation failure aborts
call start loudly.

## Objection Pack selection — HYBRID (scenario defaults + session overrides)

Neither purely scenario-owned nor session-owned. The scenario declares default objection ids; the
session may add/remove:
```
final_ids = (scenario.default_objection_ids  +  session.add_ids)  −  session.remove_ids
```
Example: Discovery scenario defaults `[authority, pricing]`; session override `+security -pricing`
→ final `[authority, security]`. The Assembler resolves each id to a card and composes an
`ObjectionPack` (ordered, deduped, first = primary). Unknown id → validation error.

Card schema (`objections/<id>.yaml`):
```yaml
id: trust
version: 1
priority: 60
trigger: prospect burned by a prior vendor / skeptical of claims
emotion: guarded
buyer_language: ["How do I actually know this works?", "I've heard that pitch before."]
acceptable_resolution: proof / social proof / concrete result
coach_signal: rep acknowledged the concern and backed the reframe with evidence
```
Real cards derived from the objection taxonomy (trust, timing, finances, authority, price, …).

## Renderers (Principle A — renderers stay dumb)

- **`render_buyer(context) -> str`**: formats the canonical-order sections into the prospect system
  prompt. Reuses `behavior_template.md`'s character/objection/escalation prose for the persona/
  scenario/objection sections; system + policy + difficulty framing prepend from their layers.
  Preserves fail-on-unfilled-placeholder. Excludes evaluation/state/memory.
- **`render_evaluator(context) -> str`**: formats `evaluation_config` (scorecard criteria) into an
  evaluation prompt for the coach/scorer. Never merged with the buyer prompt.
- Renderers ONLY format validated context + apply templates. No business logic, no context
  selection, no orchestration — all decisions happen in Assembler/Validator/Selection before rendering.

## Context Manifest (Principle C — developer observability)

`assemble` returns a `ContextManifest` for debugging/observability only — never exposed to any LLM:
```yaml
context_manifest:
  version: 1
  renderer: buyer_v1
  included_layers: [system, conversation_policy, persona, company, scenario, objection_pack, difficulty]
  omitted_layers: [knowledge, state, memory]
```
Used in tests/logs to assert which layers were included/omitted for a given selection.

## Migration & agent wiring

- Create `context/` and migrate real content: extract system + conversation_policy from
  `behavior_template.md`; move/derive personas, companies (from persona business fields), scenarios,
  objection cards, difficulty (authored `framing`), call_types, scorecards into `context/data/*`
  from the existing `prompts/*` + real bots.
- `build_bot_prompt` → thin shim: builds a `Selection` from a bot slug + session overrides, runs
  `assemble → validate → render_buyer`. Existing `build_bot_prompt` tests keep passing via the shim;
  shim removed once the agent is wired.
- `src/agent.py`: build a `Selection` from `ctx.room.metadata` (persona/bot id, scenario, call_type,
  difficulty, objection add/remove) → `assemble → validate → render_buyer` → inject into
  `ProspectAgent` (replacing the old `build_prospect_prompt` path). Console fallback = a default
  Selection. Briefing sourced from the Context's persona + objection pack. The coach/scorer consume
  `render_evaluator(context)`.

## Testing

TDD on pure units:
- Loaders: valid YAML → dataclass (+ meta); missing required field → error.
- `assemble`: valid selection → Context + manifest; sets knowledge=`{items:[]}`, state/memory=None.
- Hybrid objection merge: scenario defaults + `+add`/`-remove` → correct final ordered/deduped pack.
- `validate`: missing persona/scenario/difficulty/company/objection-id/evaluation/call_type → raises;
  valid context passes.
- `render_buyer`: sections in canonical order, no unfilled `{{...}}`, evaluation/state/memory absent.
- `render_evaluator`: contains scorecard criteria; is separate from the buyer prompt.
- Manifest: included/omitted layers correct (knowledge/state/memory omitted).
- Real end-to-end: assemble+validate a real bot's selection → render_buyer → prompt contains persona
  name, selected objections' `buyer_language`, and the chosen difficulty `framing`.
- `build_bot_prompt` shim: existing behaviour preserved.

## Scope guardrails (explicit non-goals for Phase 1)

No RAG, retrieval policies, knowledge retrieval modes, dynamic emotional state, transcript/structured
memory, orchestration engines, runtime state machines, or advanced analytics. `knowledge`, `state`,
`memory` are reserved placeholder fields only. Layer `priority` is metadata only (no runtime behavior).

## Open items (implementation-time)
- Exact `Selection` fields in `POST /api/sessions` metadata (persona id, scenario id, objection
  add/remove lists, call_type, difficulty) — confirm the payload shape when wiring the agent.
- Whether the Buyer Renderer emits system + conversation_policy as two labeled sections or one merged
  header block (formatting choice; both layers stay independent in the Context Object).
