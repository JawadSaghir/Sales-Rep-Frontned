# Hyperbound-Style Bot Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the prospect prompt system into Hyperbound's modular pattern — a bot is a composition of data-derived YAML layers (persona + scenario + objection_card + call_type + difficulty) rendered into one system prompt, plus a weighted multi-criterion scorecard.

**Architecture:** New `src/bot_config.py` loads + composes layers and renders `prompts/behavior_template.md` (reusing `src/personas.py:render_prompt`). `src/bot_extract.py` derives persona/scenario/objection_card from real Meeting-Transcripts rows (deterministic, no API key). `src/bot_enrich.py` adds voice/example-lines from transcripts via OpenRouter (API-key-gated). Demo bots are assembled from real calls.

**Tech Stack:** Python ≥3.10, `uv`, `pyyaml`, stdlib `csv`; OpenRouter via the `openai` client (enrichment only); `pytest`.

## Global Constraints

- Python `>=3.10, <3.15`; run via `uv` (`uv run pytest`, `uv run ruff`). Tests: `./.venv/Scripts/python.exe -m pytest` also works and avoids slow `uv` sync.
- Ruff: line-length 88, double quotes, type-annotate all signatures.
- **Every persona/scenario/objection_card value must derive from the real corpus** (`data/raw_data/Meeting Transcripts-Grid view.csv` + SQLite `cleaned_data/rep_trainer.db` + transcripts). No synthetic buyer data. `call_type`, `difficulty`, and `behavior_template.md` are call-agnostic *structural* frames (roleplay rules), authored once — not buyer content.
- Treat CSV values `"None"`, `"Unknown"`, `"N/A"`, `""` (case-insensitive) as empty.
- Every derived layer carries `source_meeting_id` (the CSV `Meeting ID`).
- Reuse `src/personas.py:render_prompt` (fills `{{placeholders}}`, raises `KeyError` on any unfilled) — keep that fail-fast guarantee.
- Real CSV columns (verbatim): `Meeting ID`, `Client Name`, `Business name`, `Indusrtry` (sic), `Sub-industry`, `Objection/Friction`, `Buying Authority`, `Motivation`, `Business Stage`, `Package Discussed`, `Call Disposition`, `Call #`, `Meeting Transcript File`.
- Scorecard criteria keys must be real Performance-Bot columns: `objection_handling`, `close_mechanics`, `frame_and_control`, `prospect_read`, `did_rep_ask_for_close`, `self_assessment_accuracy`.

---

## File Structure

- `src/bot_config.py` — layer loaders, `build_bot_prompt()`, scorecard loader/validator.
- `src/bot_extract.py` — `row_to_layers()` (pure mapping) + CSV row lookup + YAML writers.
- `src/bot_enrich.py` — OpenRouter enrichment + pure JSON validator.
- `prompts/behavior_template.md` — generalized roleplay template (new placeholders).
- `prompts/call_types/{closing,discovery,follow_up}.yaml` — authored call frames.
- `prompts/difficulty/{easy,medium,hard}.yaml` — authored escalation modifiers.
- `prompts/scorecards/closing_v1.yaml` — weighted criteria (real dimensions).
- `prompts/{personas,scenarios,objection_cards,bots}/<slug>.yaml` — data-derived + composition.
- `tests/test_bot_config.py` — pytest over loaders, mapping, composition, scorecard, validators.

---

## Task 1: Layer loaders + directory scaffold

**Files:**
- Create: `src/bot_config.py`
- Test: `tests/test_bot_config.py`

**Interfaces:**
- Consumes: `src/personas.py` (`PROMPTS_DIR`, `_load_yaml`).
- Produces: `LAYER_DIRS: dict[str,str]`; `load_layer(kind: str, slug: str, prompts_dir: Path = PROMPTS_DIR) -> dict`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_bot_config.py`:

```python
from pathlib import Path

from src import bot_config


def test_load_layer_reads_yaml(tmp_path):
    d = tmp_path / "personas"
    d.mkdir()
    (d / "acme.yaml").write_text("character_name: April\nindustry: Wellness/Beauty\n",
                                 encoding="utf-8")
    layer = bot_config.load_layer("personas", "acme", prompts_dir=tmp_path)
    assert layer["character_name"] == "April"
    assert layer["industry"] == "Wellness/Beauty"


def test_load_layer_unknown_kind_raises(tmp_path):
    import pytest
    with pytest.raises(KeyError):
        bot_config.load_layer("not_a_kind", "x", prompts_dir=tmp_path)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_bot_config.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'src.bot_config'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/bot_config.py`:

```python
"""Compose Hyperbound-style bots from data-derived + authored config layers."""

from __future__ import annotations

from pathlib import Path

from src.personas import PROMPTS_DIR, _load_yaml

LAYER_DIRS: dict[str, str] = {
    "personas": "personas",
    "scenarios": "scenarios",
    "objection_cards": "objection_cards",
    "call_types": "call_types",
    "difficulty": "difficulty",
    "scorecards": "scorecards",
    "bots": "bots",
}


def load_layer(kind: str, slug: str, prompts_dir: Path = PROMPTS_DIR) -> dict:
    """Load one config layer YAML by kind + slug."""
    if kind not in LAYER_DIRS:
        raise KeyError(f"unknown layer kind: {kind!r}")
    return _load_yaml(Path(prompts_dir) / LAYER_DIRS[kind] / f"{slug}.yaml")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_bot_config.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/bot_config.py tests/test_bot_config.py
git commit -m "feat: bot config layer loaders + scaffold"
```

---

## Task 2: Authored structural layers (call_types, difficulty, behavior_template)

**Files:**
- Create: `prompts/call_types/closing.yaml`, `prompts/call_types/discovery.yaml`, `prompts/call_types/follow_up.yaml`
- Create: `prompts/difficulty/easy.yaml`, `prompts/difficulty/medium.yaml`, `prompts/difficulty/hard.yaml`
- Create: `prompts/behavior_template.md`
- Test: `tests/test_bot_config.py`

**Interfaces:**
- Consumes: `load_layer`.
- Produces: authored YAML with keys — call_type: `call_type`, `frame`, `rep_objective`; difficulty: `level`, `skepticism_baseline`, `objections_stack`, `softening_speed`, `shutdown_threshold`. `behavior_template.md` adds placeholders `{{call_type_frame}}`, `{{rep_objective}}`, `{{difficulty_framing}}`.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_bot_config.py`:

```python
from src.personas import PROMPTS_DIR


def test_authored_call_types_and_difficulty_load():
    for ct in ["closing", "discovery", "follow_up"]:
        layer = bot_config.load_layer("call_types", ct)
        assert layer["call_type"] == ct
        assert layer["frame"].strip()
        assert layer["rep_objective"].strip()
    for lvl in ["easy", "medium", "hard"]:
        d = bot_config.load_layer("difficulty", lvl)
        assert d["level"] == lvl
        assert isinstance(d["shutdown_threshold"], int)


def test_behavior_template_has_new_placeholders():
    text = (PROMPTS_DIR / "behavior_template.md").read_text(encoding="utf-8")
    for ph in ["{{call_type_frame}}", "{{rep_objective}}", "{{difficulty_framing}}"]:
        assert ph in text
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_bot_config.py -k "authored or behavior_template" -v`
Expected: FAIL — files do not exist.

- [ ] **Step 3: Create the authored YAML files**

`prompts/call_types/closing.yaml`:
```yaml
call_type: closing
frame: >
  Rapport is already built. The rep is here to present the offer and drive to a
  commitment today. You roughly know what's being offered and that a decision is expected.
rep_objective: Get a yes, or a specific dated commitment, on a package.
```

`prompts/call_types/discovery.yaml`:
```yaml
call_type: discovery
frame: >
  This is an early call. The rep is trying to understand your business, your goals,
  and who decides — before any real pitch. No offer is on the table yet.
rep_objective: Uncover the prospect's situation, motivation, and buying authority.
```

`prompts/call_types/follow_up.yaml`:
```yaml
call_type: follow_up
frame: >
  You spoke before and said you needed to think it over or check with someone. The
  rep is calling back to re-open the conversation and move you toward a decision.
rep_objective: Re-open the stall and advance to a commitment or clear next step.
```

`prompts/difficulty/easy.yaml`:
```yaml
level: easy
skepticism_baseline: open but cautious
objections_stack: false
softening_speed: fast
shutdown_threshold: 3
```

`prompts/difficulty/medium.yaml`:
```yaml
level: medium
skepticism_baseline: guarded
objections_stack: true
softening_speed: normal
shutdown_threshold: 2
```

`prompts/difficulty/hard.yaml`:
```yaml
level: hard
skepticism_baseline: skeptical and impatient
objections_stack: true
softening_speed: slow
shutdown_threshold: 1
```

- [ ] **Step 4: Create `prompts/behavior_template.md`**

Copy `prompts/prospect_template.md` to `prompts/behavior_template.md`, then make these exact changes:

(a) Replace the first paragraph's second sentence region by inserting the call frame + objective. The opening becomes:

```markdown
You are {{character_name}}, {{character_age}}, {{character_background}}. You are on a call with a sales rep from {{company_name}}, who is offering {{offer_description}}.

# THIS CALL

{{call_type_frame}}

The rep's goal on this call: {{rep_objective}}. You do not know or care about their goal — you just react.

# HOW HARD YOU ARE TODAY

{{difficulty_framing}}
```

(b) Leave the rest of the template (WHO YOU ARE, ABSOLUTE RULES, OBJECTION CARD, escalation, tools, WHAT YOU ARE NOT DOING) unchanged — it still consumes the existing persona/objection placeholders.

- [ ] **Step 5: Run test to verify it passes**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_bot_config.py -k "authored or behavior_template" -v`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add prompts/call_types prompts/difficulty prompts/behavior_template.md tests/test_bot_config.py
git commit -m "feat: authored call-type + difficulty layers + generalized behavior template"
```

---

## Task 3: build_bot_prompt() composition

**Files:**
- Modify: `src/bot_config.py`
- Test: `tests/test_bot_config.py`

**Interfaces:**
- Consumes: `load_layer`, `src/personas.py` (`render_prompt`, `_stringify`, `load_offer`).
- Produces: `difficulty_framing(difficulty: dict) -> str`; `build_bot_prompt(bot_slug: str, *, prompts_dir: Path = PROMPTS_DIR, template_name: str = "behavior_template.md") -> str`.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_bot_config.py`:

```python
def _seed_bot(tmp_path):
    # minimal fixture bot + layers under tmp_path mirroring prompts/ dirs
    (tmp_path / "bots").mkdir()
    (tmp_path / "personas").mkdir()
    (tmp_path / "scenarios").mkdir()
    (tmp_path / "objection_cards").mkdir()
    (tmp_path / "call_types").mkdir()
    (tmp_path / "difficulty").mkdir()
    (tmp_path / "bots" / "b.yaml").write_text(
        "slug: b\npersona: p\nscenario: s\nobjection_card: o\n"
        "call_type: closing\ndifficulty: medium\nscorecard: closing_v1\n",
        encoding="utf-8")
    (tmp_path / "personas" / "p.yaml").write_text(
        "character_name: April\ncharacter_age: 38\n"
        "character_background: owner of April's Beauty Bar\n"
        "character_backstory: solo cosmetologist\n"
        "character_core_motivation: build credibility\n"
        "speech_style_description: warm, direct\nsignature_phrases: [\"you know\"]\n"
        "baseline_tone: guarded\n", encoding="utf-8")
    (tmp_path / "scenarios" / "s.yaml").write_text(
        "call_type: closing\nsituation: expanding to brick-and-mortar\n"
        "offer_on_table: [Light, Standard, VIP]\n"
        "what_would_flip_them: proof it converts\n"
        "disposition_context: Scheduled Follow-Up\nshutdown_line: I'm done here.\n",
        encoding="utf-8")
    (tmp_path / "objection_cards" / "o.yaml").write_text(
        "objection_types: [trust, timing, finances]\nprimary: trust\n"
        "primary_objection_type: trust\n"
        "primary_objection_underlying_feeling: fear of wasting money\n"
        "primary_objection_example_lines: [\"how do I know this works?\"]\n"
        "secondary_objection_type: timing\n"
        "secondary_objection_example_lines: [\"not right now\"]\n"
        "tertiary_objection_type: finances\n"
        "tertiary_objection_example_lines: [\"it's a lot of money\"]\n",
        encoding="utf-8")
    (tmp_path / "call_types" / "closing.yaml").write_text(
        "call_type: closing\nframe: Rapport is built; present the offer.\n"
        "rep_objective: Get a dated commitment.\n", encoding="utf-8")
    (tmp_path / "difficulty" / "medium.yaml").write_text(
        "level: medium\nskepticism_baseline: guarded\nobjections_stack: true\n"
        "softening_speed: normal\nshutdown_threshold: 2\n", encoding="utf-8")


def test_build_bot_prompt_composes_layers(tmp_path):
    _seed_bot(tmp_path)
    prompt = bot_config.build_bot_prompt("b", prompts_dir=tmp_path)
    assert "April" in prompt
    assert "present the offer" in prompt          # call_type frame
    assert "Get a dated commitment" in prompt      # rep_objective
    assert "guarded" in prompt                     # difficulty framing
    assert "{{" not in prompt                      # no unfilled placeholders


def test_build_bot_prompt_missing_layer_raises(tmp_path):
    import pytest
    _seed_bot(tmp_path)
    (tmp_path / "personas" / "p.yaml").unlink()
    with pytest.raises(FileNotFoundError):
        bot_config.build_bot_prompt("b", prompts_dir=tmp_path)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_bot_config.py -k build_bot_prompt -v`
Expected: FAIL — `build_bot_prompt` not defined.

- [ ] **Step 3: Write minimal implementation**

Append to `src/bot_config.py` (add imports at top: `from src.personas import render_prompt, load_offer`):

```python
def difficulty_framing(difficulty: dict) -> str:
    """Render the difficulty layer into a short natural-language frame."""
    return (
        f"Your baseline posture today is {difficulty['skepticism_baseline']}. "
        f"You soften {difficulty['softening_speed']} when the rep genuinely "
        f"acknowledges you. If the rep ignores or talks over you "
        f"{difficulty['shutdown_threshold']} time(s), you shut the call down. "
        + ("Your objections stack: unresolved ones resurface and new ones appear."
           if difficulty.get("objections_stack") else
           "You raise mainly your primary objection and do not pile others on.")
    )


def build_bot_prompt(
    bot_slug: str,
    *,
    prompts_dir: Path = PROMPTS_DIR,
    template_name: str = "behavior_template.md",
) -> str:
    """Compose a bot's layers and render the behavior template."""
    bot = load_layer("bots", bot_slug, prompts_dir)
    persona = load_layer("personas", bot["persona"], prompts_dir)
    scenario = load_layer("scenarios", bot["scenario"], prompts_dir)
    objection = load_layer("objection_cards", bot["objection_card"], prompts_dir)
    call_type = load_layer("call_types", bot["call_type"], prompts_dir)
    difficulty = load_layer("difficulty", bot["difficulty"], prompts_dir)

    values: dict = {}
    values.update(load_offer())
    values.update(persona)
    values.update(scenario)
    values.update(objection)
    values["call_type_frame"] = call_type["frame"]
    values["rep_objective"] = call_type["rep_objective"]
    values["difficulty_framing"] = difficulty_framing(difficulty)
    values["character_name_upper"] = str(persona.get("character_name", "")).upper()

    template = (Path(prompts_dir) / template_name).read_text(encoding="utf-8")
    return render_prompt(template, values)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_bot_config.py -k build_bot_prompt -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/bot_config.py tests/test_bot_config.py
git commit -m "feat: build_bot_prompt composes layers into behavior template"
```

---

## Task 4: Deterministic extractor from real rows

**Files:**
- Create: `src/bot_extract.py`
- Test: `tests/test_bot_config.py`

**Interfaces:**
- Consumes: nothing (pure mapping over a row dict).
- Produces:
  - `MOTIVATION_SLUGS: dict[str,str]` (label → snake slug).
  - `clean(value: str) -> str` (drops None/Unknown/N/A).
  - `split_list(value: str) -> list[str]`.
  - `row_to_layers(row: dict) -> dict` → `{"persona": {...}, "scenario": {...}, "objection_card": {...}}`, each with `source_meeting_id`.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_bot_config.py`:

```python
from src import bot_extract

_REAL_ROW = {
    "Meeting ID": "rec123",
    "Client Name": "April Alvarado",
    "Business name": "April's Beauty Bar",
    "Indusrtry": "Wellness/Beauty",
    "Sub-industry": "Cosmetology / Nail & Beauty Services",
    "Objection/Friction": "Trust,Timing,Finances",
    "Buying Authority": "No",
    "Motivation": "Credibility/Authority,Brand Narrative,Growth/ROI",
    "Business Stage": "Solo home-based cosmetologist in Denver planning brick-and-mortar.",
    "Package Discussed": "Light,Standard,VIP",
    "Call Disposition": "Scheduled Follow-Up",
}


def test_clean_and_split():
    assert bot_extract.clean("None") == ""
    assert bot_extract.clean("Unknown") == ""
    assert bot_extract.clean("  Wellness ") == "Wellness"
    assert bot_extract.split_list("Trust, Timing ,Finances") == ["Trust", "Timing", "Finances"]
    assert bot_extract.split_list("None") == []


def test_row_to_layers_maps_real_fields():
    out = bot_extract.row_to_layers(_REAL_ROW)
    p, s, o = out["persona"], out["scenario"], out["objection_card"]
    assert p["character_name"] == "April Alvarado"
    assert p["business_name"] == "April's Beauty Bar"
    assert p["industry"] == "Wellness/Beauty"
    assert p["buying_authority"] is False
    assert p["motivations"] == ["credibility_authority", "brand_narrative", "growth_roi"]
    assert s["situation"].startswith("Solo home-based")
    assert s["offer_on_table"] == ["Light", "Standard", "VIP"]
    assert s["disposition_context"] == "Scheduled Follow-Up"
    assert o["objection_types"] == ["trust", "timing", "finances"]
    assert o["primary"] == "trust"
    assert p["source_meeting_id"] == "rec123"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_bot_config.py -k "clean_and_split or row_to_layers" -v`
Expected: FAIL — `ModuleNotFoundError: src.bot_extract`.

- [ ] **Step 3: Write minimal implementation**

Create `src/bot_extract.py`:

```python
"""Derive persona/scenario/objection_card layers from real Meeting-Transcripts rows.

Deterministic only — no LLM, no network. Voice/example-lines come later from the
enrichment tier (src/bot_enrich.py).
"""

from __future__ import annotations

_EMPTY = {"", "none", "unknown", "n/a"}

MOTIVATION_SLUGS: dict[str, str] = {}  # built by _slug; kept for reference/reverse


def clean(value: str) -> str:
    v = (value or "").strip()
    return "" if v.lower() in _EMPTY else v


def split_list(value: str) -> list[str]:
    return [p.strip() for p in clean(value).split(",") if p.strip()]


def _slug(label: str) -> str:
    return label.strip().lower().replace("/", "_").replace(" ", "_").replace("-", "_")


def row_to_layers(row: dict) -> dict:
    """Map one CSV row to persona/scenario/objection_card dicts (structured fields)."""
    mid = clean(row.get("Meeting ID"))
    objections = [t.lower() for t in split_list(row.get("Objection/Friction"))]
    persona = {
        "character_name": clean(row.get("Client Name")),
        "business_name": clean(row.get("Business name")),
        "industry": clean(row.get("Indusrtry")),
        "sub_industry": clean(row.get("Sub-industry")),
        "role": "owner",
        "buying_authority": clean(row.get("Buying Authority")).lower() == "yes",
        "motivations": [_slug(m) for m in split_list(row.get("Motivation"))],
        "source_meeting_id": mid,
    }
    scenario = {
        "call_type": "closing",
        "situation": clean(row.get("Business Stage")),
        "offer_on_table": split_list(row.get("Package Discussed")),
        "disposition_context": clean(row.get("Call Disposition")),
        "source_meeting_id": mid,
    }
    objection_card = {
        "objection_types": objections,
        "primary": objections[0] if objections else "",
        "source_meeting_id": mid,
    }
    return {"persona": persona, "scenario": scenario, "objection_card": objection_card}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_bot_config.py -k "clean_and_split or row_to_layers" -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/bot_extract.py tests/test_bot_config.py
git commit -m "feat: deterministic bot-layer extractor from real meeting rows"
```

---

## Task 5: Weighted scorecard layer + validator

**Files:**
- Create: `prompts/scorecards/closing_v1.yaml`
- Modify: `src/bot_config.py`
- Test: `tests/test_bot_config.py`

**Interfaces:**
- Consumes: `load_layer`.
- Produces: `REAL_SCORE_COLUMNS: frozenset[str]`; `load_scorecard(name: str, prompts_dir=PROMPTS_DIR) -> dict`; `validate_scorecard(sc: dict) -> None` (raises `ValueError` if weights don't sum to ~1.0 or a key isn't a real column).

- [ ] **Step 1: Write the failing test**

Append to `tests/test_bot_config.py`:

```python
def test_scorecard_loads_and_validates():
    sc = bot_config.load_scorecard("closing_v1")
    bot_config.validate_scorecard(sc)  # must not raise
    total = sum(c["weight"] for c in sc["criteria"])
    assert abs(total - 1.0) < 1e-6
    for c in sc["criteria"]:
        assert c["key"] in bot_config.REAL_SCORE_COLUMNS


def test_validate_scorecard_rejects_bad_weights_and_keys():
    import pytest
    with pytest.raises(ValueError):
        bot_config.validate_scorecard(
            {"criteria": [{"key": "objection_handling", "weight": 0.5}]})  # sums to 0.5
    with pytest.raises(ValueError):
        bot_config.validate_scorecard(
            {"criteria": [{"key": "not_a_real_column", "weight": 1.0}]})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_bot_config.py -k scorecard -v`
Expected: FAIL — scorecard file + functions missing.

- [ ] **Step 3: Create `prompts/scorecards/closing_v1.yaml`**

```yaml
name: closing_v1
# weights sum to 1.0; informed by corpus score distributions; objection sub-steps reuse rubric.md
criteria:
  - {key: objection_handling, weight: 0.30, scale: "0-10"}
  - {key: close_mechanics, weight: 0.25, scale: "0-10"}
  - {key: frame_and_control, weight: 0.15, scale: "0-10"}
  - {key: prospect_read, weight: 0.15, scale: "0-10"}
  - {key: did_rep_ask_for_close, weight: 0.10, scale: bool}
  - {key: self_assessment_accuracy, weight: 0.05, scale: "0-10"}
```

- [ ] **Step 4: Add loader + validator to `src/bot_config.py`**

```python
REAL_SCORE_COLUMNS: frozenset[str] = frozenset({
    "objection_handling", "close_mechanics", "frame_and_control",
    "prospect_read", "did_rep_ask_for_close", "self_assessment_accuracy",
})


def load_scorecard(name: str, prompts_dir: Path = PROMPTS_DIR) -> dict:
    return load_layer("scorecards", name, prompts_dir)


def validate_scorecard(sc: dict) -> None:
    criteria = sc.get("criteria", [])
    total = sum(c["weight"] for c in criteria)
    if abs(total - 1.0) > 1e-6:
        raise ValueError(f"scorecard weights sum to {total}, expected 1.0")
    for c in criteria:
        if c["key"] not in REAL_SCORE_COLUMNS:
            raise ValueError(f"scorecard key {c['key']!r} is not a real corpus column")
```

- [ ] **Step 5: Run test to verify it passes**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_bot_config.py -k scorecard -v`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add prompts/scorecards/closing_v1.yaml src/bot_config.py tests/test_bot_config.py
git commit -m "feat: weighted multi-criterion scorecard layer + validator"
```

---

## Task 6: LLM-enrichment tier (voice + example lines)

**Files:**
- Create: `src/bot_enrich.py`
- Test: `tests/test_bot_config.py`

**Interfaces:**
- Consumes: `cleaned_data.embeddings.make_client` (OpenRouter client), `cleaned_data.clustering` (chat+JSON pattern).
- Produces:
  - `ENRICH_KEYS = ("speech_style_description", "signature_phrases", "character_core_motivation", "baseline_tone", "shutdown_line", "character_backstory")`.
  - `parse_enrichment(content: str, objection_types: list[str]) -> dict` (pure; raises `ValueError` on missing keys or missing per-objection `example_lines`).
  - `enrich_persona(transcript: str, objection_types: list[str], client, model=None) -> dict` (calls LLM, retry once — NOT unit-tested; API-key-gated).

- [ ] **Step 1: Write the failing test** (validator is pure — test it directly)

Append to `tests/test_bot_config.py`:

```python
import json

from src import bot_enrich


def test_parse_enrichment_valid():
    content = json.dumps({
        "speech_style_description": "warm, direct",
        "signature_phrases": ["you know?"],
        "character_core_motivation": "prove she's legit",
        "baseline_tone": "guarded",
        "shutdown_line": "I'm done here.",
        "character_backstory": "solo cosmetologist for 6 years",
        "example_lines": {"trust": ["how do I know this works?"], "timing": ["not now"]},
    })
    out = bot_enrich.parse_enrichment(content, ["trust", "timing"])
    assert out["speech_style_description"] == "warm, direct"
    assert out["example_lines"]["trust"] == ["how do I know this works?"]


def test_parse_enrichment_missing_objection_lines_raises():
    import pytest
    content = json.dumps({k: "x" for k in bot_enrich.ENRICH_KEYS} |
                         {"signature_phrases": ["a"], "example_lines": {"trust": ["q"]}})
    with pytest.raises(ValueError):
        bot_enrich.parse_enrichment(content, ["trust", "timing"])  # 'timing' missing
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_bot_config.py -k parse_enrichment -v`
Expected: FAIL — `ModuleNotFoundError: src.bot_enrich`.

- [ ] **Step 3: Write minimal implementation**

Create `src/bot_enrich.py`:

```python
"""Enrich a data-derived persona with voice + objection example lines from the real
transcript, via OpenRouter. The generation call is API-key-gated; the JSON validator
is pure and unit-tested.
"""

from __future__ import annotations

import json
import os

ENRICH_KEYS = (
    "speech_style_description", "signature_phrases", "character_core_motivation",
    "baseline_tone", "shutdown_line", "character_backstory",
)


def parse_enrichment(content: str, objection_types: list[str]) -> dict:
    data = json.loads(content)
    missing = [k for k in ENRICH_KEYS if k not in data]
    if missing:
        raise ValueError(f"enrichment JSON missing keys: {missing}")
    lines = data.get("example_lines", {})
    missing_obj = [t for t in objection_types if not lines.get(t)]
    if missing_obj:
        raise ValueError(f"example_lines missing for objections: {missing_obj}")
    out = {k: data[k] for k in ENRICH_KEYS}
    out["example_lines"] = {t: lines[t] for t in objection_types}
    return out


def enrich_persona(transcript: str, objection_types: list[str], client,
                   model: str | None = None) -> dict:
    model = model or os.environ.get("REP_PROFILE_MODEL", "openai/gpt-4o-mini")
    prompt = (
        "From this real sales-call transcript, extract the PROSPECT's character for a "
        "roleplay. Return JSON with keys: speech_style_description, signature_phrases "
        "(list), character_core_motivation, baseline_tone, shutdown_line, "
        "character_backstory, and example_lines (object mapping each of these objection "
        f"types {objection_types} to a list of 1-3 real/paraphrased lines the prospect "
        "would say). Ground everything in the transcript; do not invent facts.\n\n"
        + transcript[:8000]
    )
    for attempt in range(2):
        try:
            resp = client.chat.completions.create(
                model=model, response_format={"type": "json_object"},
                messages=[{"role": "user", "content": prompt}])
            return parse_enrichment(resp.choices[0].message.content, objection_types)
        except ValueError:
            if attempt == 1:
                raise
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_bot_config.py -k parse_enrichment -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/bot_enrich.py tests/test_bot_config.py
git commit -m "feat: LLM enrichment tier for persona voice + objection example lines"
```

---

## Task 7: Demo bots from real calls + end-to-end render

**Files:**
- Create: `prompts/personas/*.yaml`, `prompts/scenarios/*.yaml`, `prompts/objection_cards/*.yaml`, `prompts/bots/*.yaml` (for 1–2 real calls)
- Create: `scripts/build_demo_bots.py`
- Test: `tests/test_bot_config.py`

**Interfaces:**
- Consumes: `bot_extract.row_to_layers`, `bot_config.build_bot_prompt`, `bot_config.load_scorecard`, `bot_config.validate_scorecard`.
- Produces: committed demo bot config + a repeatable builder script.

- [ ] **Step 1: Write the builder script**

Create `scripts/build_demo_bots.py` — selects real rows from the CSV, writes deterministic layers, and requires the human to add voice fields (from the transcript) for the demo:

```python
"""Build demo bot config from REAL Meeting-Transcripts rows (deterministic tier).

Voice/example-lines are left as TODO markers for a human to fill FROM the real
transcript (or via src/bot_enrich.enrich_persona when OPENROUTER_API_KEY is set).
Run: ./.venv/Scripts/python.exe scripts/build_demo_bots.py
"""

import csv
from pathlib import Path

import yaml

from src.bot_extract import clean, row_to_layers

CSV = Path("data/raw_data/Meeting Transcripts-Grid view.csv")
PROMPTS = Path("prompts")
csv.field_size_limit(10**9)


def _rich(row: dict) -> bool:
    return all(clean(row.get(c)) for c in
               ["Meeting ID", "Client Name", "Indusrtry", "Objection/Friction",
                "Motivation", "Business Stage", "Package Discussed"])


def main() -> None:
    with open(CSV, encoding="utf-8-sig", newline="") as f:
        rows = [r for r in csv.DictReader(f) if _rich(r)]
    for row in rows[:2]:
        layers = row_to_layers(row)
        slug = clean(row["Client Name"]).lower().replace(" ", "-")
        # voice placeholders a human/LLM fills FROM the real transcript
        layers["persona"].update({
            "character_age": "TODO-from-transcript",
            "character_background": f"owner of {layers['persona'].get('business_name') or 'their business'}",
            "character_backstory": "TODO-from-transcript",
            "character_core_motivation": "TODO-from-transcript",
            "speech_style_description": "TODO-from-transcript",
            "signature_phrases": ["TODO-from-transcript"],
            "baseline_tone": "guarded",
        })
        layers["scenario"]["shutdown_line"] = "TODO-from-transcript"
        layers["scenario"]["what_would_flip_them"] = "TODO-from-transcript"
        for kind, data in [("personas", layers["persona"]),
                           ("scenarios", layers["scenario"]),
                           ("objection_cards", layers["objection_card"])]:
            (PROMPTS / kind).mkdir(parents=True, exist_ok=True)
            (PROMPTS / kind / f"{slug}.yaml").write_text(
                yaml.safe_dump(data, sort_keys=False, allow_unicode=True),
                encoding="utf-8")
        bot = {"slug": f"{slug}-closing", "persona": slug, "scenario": slug,
               "objection_card": slug, "call_type": "closing",
               "difficulty": "medium", "scorecard": "closing_v1",
               "source_meeting_id": clean(row["Meeting ID"])}
        (PROMPTS / "bots").mkdir(parents=True, exist_ok=True)
        (PROMPTS / "bots" / f"{slug}-closing.yaml").write_text(
            yaml.safe_dump(bot, sort_keys=False, allow_unicode=True), encoding="utf-8")
        print("wrote bot", bot["slug"], "from meeting", bot["source_meeting_id"])


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the builder on real data**

Run: `./.venv/Scripts/python.exe scripts/build_demo_bots.py`
Expected: prints `wrote bot <slug>-closing from meeting <recId>` for 1–2 real calls; YAML files appear under `prompts/{personas,scenarios,objection_cards,bots}/`.

- [ ] **Step 3: Fill the voice fields from the real transcript**

For each demo bot, open the real transcript (`Meeting Transcript File` / transcript in the corpus for that `source_meeting_id`) and replace every `TODO-from-transcript` with real, grounded content (paraphrased from what the prospect actually said). Add `primary_objection_type`/`secondary_objection_type`/`tertiary_objection_type` + `*_example_lines` to the objection_card from real quotes. Do NOT invent facts not in the transcript. (If `OPENROUTER_API_KEY` is set, run `src/bot_enrich.enrich_persona` on the transcript instead and paste its validated output.)

- [ ] **Step 4: Write the end-to-end render test**

Append to `tests/test_bot_config.py` (uses the real committed demo bot — replace `DEMO_SLUG` with the actual slug the builder produced):

```python
DEMO_SLUG = "april-alvarado-closing"  # set to the real slug produced by the builder


def test_demo_bot_renders_end_to_end():
    prompt = bot_config.build_bot_prompt(DEMO_SLUG)
    assert "{{" not in prompt          # every placeholder filled
    assert "TODO-from-transcript" not in prompt  # voice fields really filled
    sc = bot_config.load_scorecard("closing_v1")
    bot_config.validate_scorecard(sc)
```

- [ ] **Step 5: Run test + full suite**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_bot_config.py -v`
Expected: PASS (all bot-config tests incl. the end-to-end demo render).

- [ ] **Step 6: Ruff + commit**

```bash
uv run ruff format src/bot_config.py src/bot_extract.py src/bot_enrich.py scripts/build_demo_bots.py tests/test_bot_config.py
uv run ruff check src/bot_config.py src/bot_extract.py src/bot_enrich.py scripts/build_demo_bots.py tests/test_bot_config.py
git add prompts/personas prompts/scenarios prompts/objection_cards prompts/bots scripts/build_demo_bots.py tests/test_bot_config.py
git commit -m "feat: demo bots assembled from real calls + end-to-end render test"
```

---

## Self-Review (completed)

- **Spec coverage:** layered architecture (Tasks 1–3), structured ICP persona (Task 4), scenario + call-type + difficulty (Tasks 2, 4), weighted scorecard (Task 5), LLM-enrichment tier (Task 6), deterministic tier + demo from real data (Tasks 4, 7), `build_bot_prompt` render with fail-on-unfilled (Task 3). All spec sections map to a task.
- **Placeholder scan:** the only `TODO-from-transcript` strings are *intentional data markers* the demo task (Task 7 Step 3) explicitly fills from the real transcript, and Task 7's test asserts none remain — they are not plan placeholders.
- **Type consistency:** `load_layer(kind, slug, prompts_dir)`, `build_bot_prompt(bot_slug, *, prompts_dir, template_name)`, `row_to_layers(row) -> {"persona","scenario","objection_card"}`, `load_scorecard`/`validate_scorecard`, `parse_enrichment(content, objection_types)` are used identically across tasks.

## Open items (implementation-time)
- Difficulty is fixed to `medium` in the demo; auto-inference from objection count/disposition is deferred (spec open item).
- Scorecard weights are the spec defaults — confirm with the team.
- LLM-enrichment tier (Task 6 `enrich_persona`) and any final review need `OPENROUTER_API_KEY` / restored API budget; the deterministic tier and demo (Tasks 1–5, 7 deterministic parts) do not.
