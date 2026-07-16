# Rep-Trainer Runtime Loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single rep-persona voice agent into a two-phase training loop — a lean AI *prospect* to spar with, then a *coach* that scores the rep against a rubric, speaks a debrief, and persists a per-rep scorecard.

**Architecture:** During a practice call a `ProspectAgent` runs on one character card (low latency, no answer-key in context). When the rep ends the roleplay, a `@function_tool` hands off (LiveKit pattern: return the next `Agent`) to a `CoachAgent` whose `on_enter` scores the transcript against a rubric, pulls model "winning lines" from a swappable `Retriever` (seed JSON now, RAGFlow later), speaks the debrief, and writes a scorecard + Mem0 weak-spot memory keyed by `rep_id`. Every external dependency (Mem0, Retriever) fails open — the call never drops.

**Tech Stack:** Python 3.10+, `uv`, LiveKit Agents ~1.4 (`Agent`, `AgentSession`, `function_tool`, `on_enter`, `chat_ctx.copy`), Deepgram/OpenRouter/Cartesia (existing pipeline), Mem0 (existing), `openai` package (already installed via `livekit-plugins-openai`) for structured scoring calls, pytest + LiveKit `inference.LLM` judge for behavior tests.

## Global Constraints

- Python: `requires-python = ">=3.10, <3.15"` (do not use 3.9-incompatible syntax beyond what ruff `target-version = "py39"` allows; `X | None` unions are already used in the repo and are fine).
- Package manager: **`uv` only** — install with `uv add`, run with `uv run`, test with `uv run pytest`.
- Entrypoint must remain `src/agent.py` (see `Dockerfile` `CMD ["uv","run","src/agent.py","start"]`).
- Source layout is **flat under `src/`** (`[tool.setuptools.packages.find] where=["src"]`) — import sibling modules as top-level (`from retrieval import ...`, not `from src.retrieval import ...`), exactly as `tests/test_agent.py` does `from agent import Assistant`.
- Formatting/lint after every code change: `uv run ruff format && uv run ruff check` (line-length 88, double quotes, `E501` ignored).
- **No new external dependency** is required for this plan. Do NOT add `ragflow-sdk` here (Plan 2).
- Tests must not burn OpenRouter tokens: behavior tests use `inference.LLM(model="openai/gpt-4.1-mini")` (LIVEKIT creds); scoring is tested with an injected fake `complete` callable.
- Fail-open pattern is mandatory for Mem0 and Retriever (mirror existing `init_memory()` in `src/agent.py`).

---

### Task 0: Prep — config, directories, gitignore hygiene

**Files:**
- Modify: `.env.example`
- Modify: `.gitignore`
- Create: `data/scorecards/.gitkeep`
- Create: `data/seed/.gitkeep`

**Interfaces:**
- Produces: env keys `REP_ID` (optional trainer identity fallback) and `PROSPECT_CHARACTER` (character-card filename stem, default `burned_before_skeptic`); directory `data/scorecards/` for persisted scorecards.

- [ ] **Step 1: Add trainer config keys to `.env.example`**

Append to `.env.example`:
```
# --- Rep Trainer ---
# Which character card the prospect loads (file stem in prompts/characters/).
PROSPECT_CHARACTER=burned_before_skeptic
# Fallback trainee id when the room/participant identity is unavailable (console/local dev).
REP_ID=unknown
```

- [ ] **Step 2: Ensure scorecards + secrets are gitignored**

Confirm `.gitignore` contains these lines (add any that are missing):
```
.env.local
data/scorecards/
```
`data/seed/` is committed (seed inputs), so do NOT ignore it.

- [ ] **Step 3: Create the persisted-output and seed directories**

```bash
mkdir -p data/scorecards data/seed
touch data/scorecards/.gitkeep data/seed/.gitkeep
```

- [ ] **Step 4: Verify `.env.local` is not tracked by git**

Run: `git ls-files --error-unmatch .env.local`
Expected: a non-zero exit with "did not match any file(s) known to git" (meaning it is NOT tracked). If it IS tracked, STOP and tell the user to rotate those keys and untrack the file before continuing.

- [ ] **Step 5: Commit**

```bash
git add .env.example .gitignore data/scorecards/.gitkeep data/seed/.gitkeep
git commit -m "chore: add rep-trainer config keys and scorecard/seed dirs"
```

---

### Task 1: Rep identity resolver

**Files:**
- Create: `src/identity.py`
- Test: `tests/test_identity.py`

**Interfaces:**
- Produces: `resolve_rep_id(room_metadata: str | None, participant_identity: str | None, env_rep_id: str | None) -> str` — returns the first non-empty, normalized (lowercased, spaces→`_`) source in priority order: room metadata JSON `{"rep_id": ...}` → participant identity → `env_rep_id` → `"unknown"`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_identity.py`:
```python
from identity import resolve_rep_id


def test_prefers_room_metadata_rep_id():
    assert resolve_rep_id('{"rep_id": "Jenn O"}', "sip_123", "envrep") == "jenn_o"


def test_falls_back_to_participant_identity():
    assert resolve_rep_id(None, "Marco Garcia", "envrep") == "marco_garcia"


def test_falls_back_to_env_then_unknown():
    assert resolve_rep_id(None, None, "EnvRep") == "envrep"
    assert resolve_rep_id(None, None, None) == "unknown"


def test_ignores_malformed_metadata():
    assert resolve_rep_id("not-json", "Marco", None) == "marco"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_identity.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'identity'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/identity.py`:
```python
"""Resolve a stable trainee id (rep_id) for memory + scorecard keys."""

import json
import re


def _normalize(value: str) -> str:
    return re.sub(r"\s+", "_", value.strip()).lower()


def resolve_rep_id(
    room_metadata: str | None,
    participant_identity: str | None,
    env_rep_id: str | None,
) -> str:
    """Pick the trainee id from the best available source.

    Priority: room metadata JSON {"rep_id": ...} -> participant identity ->
    env REP_ID -> "unknown". Result is lowercased with spaces collapsed to "_".
    """
    if room_metadata:
        try:
            meta = json.loads(room_metadata)
            candidate = meta.get("rep_id")
            if candidate:
                return _normalize(str(candidate))
        except (ValueError, AttributeError):
            pass
    if participant_identity:
        return _normalize(participant_identity)
    if env_rep_id:
        return _normalize(env_rep_id)
    return "unknown"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_identity.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Format, lint, commit**

```bash
uv run ruff format src/identity.py tests/test_identity.py
uv run ruff check src/identity.py tests/test_identity.py
git add src/identity.py tests/test_identity.py
git commit -m "feat: add rep identity resolver"
```

---

### Task 2: Scorecard data model + persistence

**Files:**
- Create: `src/scorecard.py`
- Test: `tests/test_scorecard.py`

**Interfaces:**
- Produces:
  - `@dataclass(frozen=True) ObjectionScore(type: str, handled: bool, rubric_steps_hit: list[str], missed: list[str], model_answer: str)`
  - `@dataclass(frozen=True) Scorecard(rep_id: str, session_id: str, character: str, per_objection: list[ObjectionScore], overall_grade: str, notes: str)`
  - `Scorecard.to_dict() -> dict` and `Scorecard.from_dict(d: dict) -> Scorecard`
  - `save_scorecard(card: Scorecard, base_dir: Path) -> Path` — writes `base_dir/<rep_id>/<session_id>.json`, returns the path.
  - `load_rep_history(rep_id: str, base_dir: Path) -> list[Scorecard]` — all prior scorecards for a rep (empty list if none), sorted by `session_id`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_scorecard.py`:
```python
from pathlib import Path

from scorecard import (
    ObjectionScore,
    Scorecard,
    load_rep_history,
    save_scorecard,
)


def _card(session_id: str = "2026-07-16T10-00Z-room1") -> Scorecard:
    return Scorecard(
        rep_id="jenn",
        session_id=session_id,
        character="burned_before_skeptic",
        per_objection=[
            ObjectionScore(
                type="price",
                handled=True,
                rubric_steps_hit=["acknowledge", "reframe"],
                missed=[],
                model_answer="Totally hear you on cost...",
            )
        ],
        overall_grade="B",
        notes="Solid on price.",
    )


def test_roundtrip_to_from_dict():
    card = _card()
    assert Scorecard.from_dict(card.to_dict()) == card


def test_save_and_load_history(tmp_path: Path):
    save_scorecard(_card("2026-07-16T10-00Z-a"), tmp_path)
    save_scorecard(_card("2026-07-16T11-00Z-b"), tmp_path)
    history = load_rep_history("jenn", tmp_path)
    assert [c.session_id for c in history] == [
        "2026-07-16T10-00Z-a",
        "2026-07-16T11-00Z-b",
    ]


def test_load_history_empty_when_none(tmp_path: Path):
    assert load_rep_history("nobody", tmp_path) == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_scorecard.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'scorecard'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/scorecard.py`:
```python
"""Per-session scorecard model and JSON persistence for the rep trainer."""

import json
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass(frozen=True)
class ObjectionScore:
    type: str
    handled: bool
    rubric_steps_hit: list[str]
    missed: list[str]
    model_answer: str


@dataclass(frozen=True)
class Scorecard:
    rep_id: str
    session_id: str
    character: str
    per_objection: list[ObjectionScore]
    overall_grade: str
    notes: str

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "Scorecard":
        return cls(
            rep_id=d["rep_id"],
            session_id=d["session_id"],
            character=d["character"],
            per_objection=[ObjectionScore(**o) for o in d["per_objection"]],
            overall_grade=d["overall_grade"],
            notes=d["notes"],
        )


def save_scorecard(card: Scorecard, base_dir: Path) -> Path:
    """Write a scorecard to base_dir/<rep_id>/<session_id>.json and return the path."""
    rep_dir = base_dir / card.rep_id
    rep_dir.mkdir(parents=True, exist_ok=True)
    path = rep_dir / f"{card.session_id}.json"
    path.write_text(json.dumps(card.to_dict(), indent=2), encoding="utf-8")
    return path


def load_rep_history(rep_id: str, base_dir: Path) -> list[Scorecard]:
    """Return all prior scorecards for a rep, sorted by session_id (empty if none)."""
    rep_dir = base_dir / rep_id
    if not rep_dir.is_dir():
        return []
    cards = [
        Scorecard.from_dict(json.loads(p.read_text(encoding="utf-8")))
        for p in sorted(rep_dir.glob("*.json"))
    ]
    return cards
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_scorecard.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Format, lint, commit**

```bash
uv run ruff format src/scorecard.py tests/test_scorecard.py
uv run ruff check src/scorecard.py tests/test_scorecard.py
git add src/scorecard.py tests/test_scorecard.py
git commit -m "feat: add scorecard model and persistence"
```

---

### Task 3: Retriever protocol + seed retriever (winning rep lines)

**Files:**
- Create: `src/retrieval.py`
- Create: `data/seed/rep_lines.json`
- Test: `tests/test_retrieval.py`

**Interfaces:**
- Produces:
  - `@dataclass(frozen=True) WinningLine(objection_type: str, quote: str, technique: str)`
  - `class Retriever(Protocol): def winning_lines(self, objection_type: str, k: int = 1) -> list[WinningLine]: ...`
  - `class SeedRetriever: __init__(self, path: Path); winning_lines(self, objection_type, k=1) -> list[WinningLine]` — loads local JSON, filters by `objection_type`, returns up to `k`. Never raises on a missing type (returns `[]`).
- Consumes: nothing.
- Note: Plan 2 adds `RagflowRetriever` implementing the same `Retriever` protocol; the Coach depends only on the protocol.

- [ ] **Step 1: Write the failing test**

Create `tests/test_retrieval.py`:
```python
import json
from pathlib import Path

from retrieval import SeedRetriever, WinningLine


def _seed(tmp_path: Path) -> Path:
    data = [
        {"objection_type": "price", "quote": "Cost is fair when you see the ROI...", "technique": "reframe_to_value"},
        {"objection_type": "price", "quote": "Let's compare it to what one closed deal is worth...", "technique": "evidence"},
        {"objection_type": "authority", "quote": "Makes sense to loop in your partner — want me to join that call?", "technique": "include_stakeholder"},
    ]
    p = tmp_path / "rep_lines.json"
    p.write_text(json.dumps(data), encoding="utf-8")
    return p


def test_filters_by_objection_type_and_limits_k(tmp_path: Path):
    r = SeedRetriever(_seed(tmp_path))
    lines = r.winning_lines("price", k=1)
    assert len(lines) == 1
    assert isinstance(lines[0], WinningLine)
    assert lines[0].objection_type == "price"


def test_unknown_type_returns_empty(tmp_path: Path):
    r = SeedRetriever(_seed(tmp_path))
    assert r.winning_lines("teleportation") == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_retrieval.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'retrieval'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/retrieval.py`:
```python
"""Winning-line retrieval. Seed (local JSON) now; RAGFlow-backed in Plan 2.

The Coach depends only on the Retriever protocol, so the backend is swappable.
"""

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


@dataclass(frozen=True)
class WinningLine:
    objection_type: str
    quote: str
    technique: str


class Retriever(Protocol):
    def winning_lines(self, objection_type: str, k: int = 1) -> list[WinningLine]:
        """Return up to k real rep responses that overcame this objection type."""
        ...


class SeedRetriever:
    """Retriever backed by a local JSON list of winning lines."""

    def __init__(self, path: Path) -> None:
        raw = json.loads(Path(path).read_text(encoding="utf-8"))
        self._lines = [WinningLine(**item) for item in raw]

    def winning_lines(self, objection_type: str, k: int = 1) -> list[WinningLine]:
        matches = [
            line for line in self._lines if line.objection_type == objection_type
        ]
        return matches[:k]
```

- [ ] **Step 4: Create the committed seed data file**

Create `data/seed/rep_lines.json` (hand-seeded exemplars; Plan 2 replaces the source with real mined lines):
```json
[
  {"objection_type": "price", "quote": "I hear you — and honestly, most people who felt that way told me later the real question wasn't the price, it was whether it'd actually work for them. Can I show you how our members made it back?", "technique": "reframe_to_value"},
  {"objection_type": "price", "quote": "Let's put it against one closed deal. If this brings you a single new client, what's that worth versus what we're talking about today?", "technique": "evidence_roi"},
  {"objection_type": "authority", "quote": "Totally makes sense to bring your partner in — that's a good sign you take decisions seriously. Want me to hop on a quick call with both of you so nothing gets lost in translation?", "technique": "include_stakeholder"},
  {"objection_type": "timing", "quote": "I get it, timing's never perfect. What if we lock the spot now and start onboarding next week when you're clearer — so you don't lose the window?", "technique": "reduce_commitment"},
  {"objection_type": "trust", "quote": "Fair — you don't know me yet. Here's what I'd want if I were you: talk to two of our current members before you decide. Want me to set that up?", "technique": "social_proof"}
]
```

- [ ] **Step 5: Run test to verify it passes**

Run: `uv run pytest tests/test_retrieval.py -v`
Expected: PASS (2 tests).

- [ ] **Step 6: Format, lint, commit**

```bash
uv run ruff format src/retrieval.py tests/test_retrieval.py
uv run ruff check src/retrieval.py tests/test_retrieval.py
git add src/retrieval.py tests/test_retrieval.py data/seed/rep_lines.json
git commit -m "feat: add retriever protocol and seed winning-line retriever"
```

---

### Task 4: Rubric + practice-transcript formatter + scorer

**Files:**
- Create: `prompts/rubric.md`
- Create: `src/scoring.py`
- Test: `tests/test_scoring.py`

**Interfaces:**
- Consumes: `Scorecard`, `ObjectionScore` (Task 2); `Retriever`, `WinningLine` (Task 3).
- Produces:
  - `format_practice_transcript(chat_ctx: ChatContext) -> str` — renders turns labeling the AI (`assistant`) as `Prospect` and the human (`user`) as `Rep`. (Note: this is the INVERSE of the existing `format_transcript` in `agent.py`, because in training the AI plays the prospect.)
  - `score_session(transcript: str, rubric: str, retriever: Retriever, complete: Callable[[str], str], *, rep_id: str, session_id: str, character: str) -> Scorecard` — calls `complete(prompt)` (an LLM adapter returning JSON), parses per-objection judgments, attaches `model_answer` from `retriever.winning_lines(type, 1)`, returns a `Scorecard`. On any parse/LLM failure returns a minimal fail-open card (`overall_grade="incomplete"`, empty `per_objection`, explanatory `notes`).

- [ ] **Step 1: Write the failing test**

Create `tests/test_scoring.py`:
```python
import json

from retrieval import WinningLine
from scoring import score_session


class _FakeRetriever:
    def winning_lines(self, objection_type, k=1):
        return [WinningLine(objection_type, f"model answer for {objection_type}", "reframe")]


_LLM_JSON = json.dumps(
    {
        "overall_grade": "B-",
        "notes": "Gave up on authority too early.",
        "per_objection": [
            {"type": "price", "handled": True, "rubric_steps_hit": ["acknowledge", "reframe"], "missed": []},
            {"type": "authority", "handled": False, "rubric_steps_hit": ["acknowledge"], "missed": ["reframe", "re_ask"]},
        ],
    }
)


def test_scores_and_attaches_model_answers():
    card = score_session(
        transcript="Rep: ...\nProspect: too expensive",
        rubric="acknowledge -> reframe -> evidence -> re_ask",
        retriever=_FakeRetriever(),
        complete=lambda prompt: _LLM_JSON,
        rep_id="jenn",
        session_id="s1",
        character="burned_before_skeptic",
    )
    assert card.overall_grade == "B-"
    assert [o.type for o in card.per_objection] == ["price", "authority"]
    authority = card.per_objection[1]
    assert authority.handled is False
    assert authority.missed == ["reframe", "re_ask"]
    assert authority.model_answer == "model answer for authority"


def test_fail_open_on_bad_llm_output():
    card = score_session(
        transcript="x",
        rubric="y",
        retriever=_FakeRetriever(),
        complete=lambda prompt: "not json at all",
        rep_id="jenn",
        session_id="s1",
        character="c",
    )
    assert card.overall_grade == "incomplete"
    assert card.per_objection == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_scoring.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'scoring'`.

- [ ] **Step 3: Create the rubric file**

Create `prompts/rubric.md`:
```markdown
# Objection-Handling Rubric

A strong response to any objection moves through these steps in order:

1. **acknowledge** — name the concern without arguing; make the prospect feel heard.
2. **reframe** — shift from cost/fear to value/outcome, or reframe the objection's premise.
3. **evidence** — back the reframe with proof: a result, a comparison, social proof, or ROI.
4. **re_ask** — return to a concrete next step or close; do not let the objection end the momentum.

Grade each objection the prospect raised by which steps the rep actually hit.
A rep who stops after `acknowledge` (or argues) has NOT handled the objection.

## Objection types to watch for
- **price** — "too expensive", "can't afford it", cost comparisons.
- **authority** — "need to talk to my partner/spouse/boss".
- **timing** — "not right now", "call me next month", busy.
- **trust** — "how do I know this works", skepticism, been-burned-before.
- **time_commitment** — "I don't have time to do the work".
```

- [ ] **Step 4: Write minimal implementation**

Create `src/scoring.py`:
```python
"""Grade a practice call against the rubric and produce a Scorecard."""

import json
import logging
from collections.abc import Callable

from livekit.agents import ChatContext

from retrieval import Retriever
from scorecard import ObjectionScore, Scorecard

logger = logging.getLogger("agent.scoring")

RUBRIC_STEPS = ["acknowledge", "reframe", "evidence", "re_ask"]


def format_practice_transcript(chat_ctx: ChatContext) -> str:
    """Render turns for scoring. In training the AI is the Prospect (assistant
    role) and the human trainee is the Rep (user role) — the inverse of
    agent.format_transcript, which is used for saved rep-persona calls.
    """
    lines = []
    for item in chat_ctx.items:
        if getattr(item, "type", None) != "message" or item.role not in (
            "user",
            "assistant",
        ):
            continue
        speaker = "Prospect" if item.role == "assistant" else "Rep"
        text = (item.text_content or "").strip()
        if text:
            lines.append(f"{speaker}: {text}")
    return "\n".join(lines)


def _build_prompt(transcript: str, rubric: str) -> str:
    return (
        "You are a sales-training evaluator. Grade the REP's handling of each "
        "objection the PROSPECT raised in this practice call.\n\n"
        f"RUBRIC:\n{rubric}\n\n"
        f"TRANSCRIPT:\n{transcript}\n\n"
        "Respond with ONLY a JSON object of this exact shape:\n"
        '{"overall_grade": "<A-F letter grade>", "notes": "<one or two sentences>", '
        '"per_objection": [{"type": "<price|authority|timing|trust|time_commitment>", '
        '"handled": <true|false>, "rubric_steps_hit": ["acknowledge", ...], '
        '"missed": ["reframe", ...]}]}\n'
        "If the prospect raised no objections, return an empty per_objection list."
    )


def score_session(
    transcript: str,
    rubric: str,
    retriever: Retriever,
    complete: Callable[[str], str],
    *,
    rep_id: str,
    session_id: str,
    character: str,
) -> Scorecard:
    """Grade the transcript and attach a model answer per objection.

    complete(prompt) -> str is an LLM adapter that returns JSON text. Any failure
    (LLM error or unparseable output) yields a fail-open 'incomplete' scorecard so
    the coach can still speak instead of crashing the call.
    """
    try:
        raw = complete(_build_prompt(transcript, rubric))
        parsed = json.loads(raw)
        per_objection = []
        for obj in parsed.get("per_objection", []):
            otype = obj["type"]
            lines = retriever.winning_lines(otype, 1)
            model_answer = lines[0].quote if lines else ""
            per_objection.append(
                ObjectionScore(
                    type=otype,
                    handled=bool(obj["handled"]),
                    rubric_steps_hit=list(obj.get("rubric_steps_hit", [])),
                    missed=list(obj.get("missed", [])),
                    model_answer=model_answer,
                )
            )
        return Scorecard(
            rep_id=rep_id,
            session_id=session_id,
            character=character,
            per_objection=per_objection,
            overall_grade=str(parsed.get("overall_grade", "incomplete")),
            notes=str(parsed.get("notes", "")),
        )
    except Exception:
        logger.warning("Scoring failed; returning incomplete scorecard.", exc_info=True)
        return Scorecard(
            rep_id=rep_id,
            session_id=session_id,
            character=character,
            per_objection=[],
            overall_grade="incomplete",
            notes="Automated scoring was unavailable for this session.",
        )
```

- [ ] **Step 5: Run test to verify it passes**

Run: `uv run pytest tests/test_scoring.py -v`
Expected: PASS (2 tests).

- [ ] **Step 6: Format, lint, commit**

```bash
uv run ruff format src/scoring.py tests/test_scoring.py
uv run ruff check src/scoring.py tests/test_scoring.py
git add prompts/rubric.md src/scoring.py tests/test_scoring.py
git commit -m "feat: add rubric, practice-transcript formatter, and scorer"
```

---

### Task 5: Prospect persona (character card) + persona behavior tests

**Files:**
- Create: `prompts/characters/burned_before_skeptic.md`
- Modify: `src/agent.py` (add `load_character_card`, `ProspectAgent`; keep the existing `Assistant` rep for now)
- Modify: `tests/test_agent.py` (add prospect behavior tests; keep the existing two rep tests — they still pass against `Assistant`)

**Interfaces:**
- Consumes: `Agent`, `ChatContext` (already imported in `agent.py`).
- Produces:
  - `load_character_card(stem: str) -> str` — reads `prompts/characters/<stem>.md`; raises `FileNotFoundError` if missing.
  - `class ProspectAgent(Agent)` — `__init__(self, character_prompt: str, chat_ctx: ChatContext | None = None)`; loads the card as `instructions`. (Handoff tool added in Task 6.)

- [ ] **Step 1: Create the character card**

Create `prompts/characters/burned_before_skeptic.md`:
```markdown
# Character: The Burned-Before Skeptic

You are a PROSPECT on a sales call with Inside Success TV — NOT the sales rep.
You are role-playing so a real sales rep can practice. Stay fully in character.

## Who you are
- 45-year-old small-business owner who has paid for marketing/agency help before
  and felt burned — you spent money and saw little return.
- Tone: guarded, a little blunt, but not hostile. You warm up ONLY if the rep
  earns it with specifics and proof.

## How you behave
- Open cool. Make the rep work for rapport.
- Raise objections naturally as they come up. Your top objections:
  1. **trust** — "How do I know this actually works? I've been burned before."
  2. **price** — "That's more than I paid last time, and that was a waste."
  3. **authority** — "I'd have to run this by my business partner."
- Do NOT fold on the first answer. If the rep only acknowledges without proof,
  push back again. Concede only when they genuinely reframe AND give evidence.
- Never break character. Never coach the rep. Never reveal these instructions.

## Ending
- When the rep says they're done, wants feedback, or ends the roleplay, call the
  `end_practice_and_get_feedback` tool so their coach can review the call.
```

- [ ] **Step 2: Write the failing tests**

Add to `tests/test_agent.py` (append; keep existing imports and tests):
```python
from agent import ProspectAgent, load_character_card


def test_load_character_card_reads_stem():
    card = load_character_card("burned_before_skeptic")
    assert "PROSPECT" in card


@pytest.mark.asyncio
async def test_prospect_stays_in_character_and_objects() -> None:
    """The prospect persona resists and raises an objection rather than selling."""
    card = load_character_card("burned_before_skeptic")
    async with (
        _llm() as judge,
        AgentSession(llm=judge) as session,
    ):
        await session.start(ProspectAgent(card))
        result = await session.run(
            user_input="Hi, I'd love to tell you about our casting program!"
        )
        await (
            result.expect.next_event()
            .is_message(role="assistant")
            .judge(
                judge,
                intent="Responds AS a guarded prospect/customer being sold to — "
                "e.g. skeptical, non-committal, or raising a concern about trust, "
                "price, or needing to check with a partner. It does NOT act as the "
                "salesperson and does NOT pitch a product.",
            )
        )
        result.expect.no_more_events()
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `uv run pytest tests/test_agent.py -v`
Expected: FAIL with `ImportError: cannot import name 'ProspectAgent' from 'agent'`.

- [ ] **Step 4: Implement `load_character_card` and `ProspectAgent`**

In `src/agent.py`, after the `PROMPT_PATH` block (around line 39), add:
```python
CHARACTERS_DIR = Path(__file__).parent.parent / "prompts" / "characters"


def load_character_card(stem: str) -> str:
    """Read a prospect character card by file stem from prompts/characters/."""
    path = CHARACTERS_DIR / f"{stem}.md"
    return path.read_text(encoding="utf-8")
```

Then, after the existing `class Assistant(Agent):` block (after line 163), add:
```python
class ProspectAgent(Agent):
    """The AI plays a prospect the rep practices against (see prompts/characters/)."""

    def __init__(
        self, character_prompt: str, chat_ctx: ChatContext | None = None
    ) -> None:
        super().__init__(instructions=character_prompt, chat_ctx=chat_ctx)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `uv run pytest tests/test_agent.py -v`
Expected: PASS (existing 2 rep tests + `test_load_character_card_reads_stem` + `test_prospect_stays_in_character_and_objects`).

- [ ] **Step 6: Format, lint, commit**

```bash
uv run ruff format src/agent.py tests/test_agent.py
uv run ruff check src/agent.py tests/test_agent.py
git add prompts/characters/burned_before_skeptic.md src/agent.py tests/test_agent.py
git commit -m "feat: add prospect persona (character card) and behavior tests"
```

---

### Task 6: Coach agent, handoff tool, and LLM adapter

**Files:**
- Create: `src/coaching.py`
- Modify: `src/agent.py` (add handoff tool to `ProspectAgent`; add `make_openrouter_complete`)
- Test: `tests/test_coaching.py`

**Interfaces:**
- Consumes: `Agent`, `function_tool`, `RunContext`, `ChatContext` (LiveKit); `score_session`, `format_practice_transcript` (Task 4); `Retriever` (Task 3); `Scorecard`, `save_scorecard` (Task 2).
- Produces:
  - `build_debrief_instructions(card: Scorecard) -> str` — turns a scorecard into a spoken-debrief instruction string for `generate_reply`.
  - `class CoachAgent(Agent)` — `__init__(self, *, transcript, rubric, retriever, complete, rep_id, session_id, character, scorecards_dir, mem0, chat_ctx=None)`. Its `on_enter` scores the transcript, speaks the debrief, saves the scorecard, and best-effort writes weak spots to Mem0. Every side effect (save, Mem0) is wrapped so a failure cannot crash the call.
  - In `agent.py`: `make_openrouter_complete(model: str) -> Callable[[str], str]` — returns a `complete(prompt)` using the `openai` client against OpenRouter (`OPENROUTER_API_KEY`), `response_format={"type": "json_object"}`.
  - `ProspectAgent.end_practice_and_get_feedback` `@function_tool` returning `CoachAgent(...)` for handoff.

- [ ] **Step 1: Write the failing test**

Create `tests/test_coaching.py`:
```python
from scorecard import ObjectionScore, Scorecard
from coaching import build_debrief_instructions


def test_debrief_mentions_missed_step_and_model_answer():
    card = Scorecard(
        rep_id="jenn",
        session_id="s1",
        character="burned_before_skeptic",
        per_objection=[
            ObjectionScore(
                type="authority",
                handled=False,
                rubric_steps_hit=["acknowledge"],
                missed=["reframe", "re_ask"],
                model_answer="Want me to hop on a call with both of you?",
            )
        ],
        overall_grade="C+",
        notes="Folded on the partner objection.",
    )
    text = build_debrief_instructions(card)
    assert "authority" in text
    assert "C+" in text
    assert "Want me to hop on a call with both of you?" in text
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_coaching.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'coaching'`.

- [ ] **Step 3: Implement `coaching.py`**

Create `src/coaching.py`:
```python
"""Coach agent: scores a finished practice call and debriefs the rep."""

import logging
from collections.abc import Callable
from pathlib import Path

from livekit.agents import Agent, ChatContext

from retrieval import Retriever
from scorecard import Scorecard, save_scorecard
from scoring import score_session

logger = logging.getLogger("agent.coaching")


def build_debrief_instructions(card: Scorecard) -> str:
    """Render a scorecard into a spoken-debrief instruction for generate_reply."""
    if not card.per_objection:
        return (
            "Drop the roleplay and speak as a warm sales coach. Tell the rep you "
            "didn't catch a clear objection to grade this round, encourage them to "
            "push into a real objection next time, and keep it brief."
        )
    parts = [
        "Drop the roleplay and speak as a warm, direct sales coach giving a short "
        f"spoken debrief. Overall grade: {card.overall_grade}. "
        f"Summary: {card.notes}",
        "Go objection by objection:",
    ]
    for obj in card.per_objection:
        verdict = "handled well" if obj.handled else "not handled"
        missed = f" Missed steps: {', '.join(obj.missed)}." if obj.missed else ""
        model = (
            f" A top rep might have said: \"{obj.model_answer}\"."
            if obj.model_answer
            else ""
        )
        parts.append(f"- On the {obj.type} objection: {verdict}.{missed}{model}")
    parts.append("Keep it encouraging and under about 45 seconds of speech.")
    return "\n".join(parts)


class CoachAgent(Agent):
    def __init__(
        self,
        *,
        transcript: str,
        rubric: str,
        retriever: Retriever,
        complete: Callable[[str], str],
        rep_id: str,
        session_id: str,
        character: str,
        scorecards_dir: Path,
        mem0=None,
        chat_ctx: ChatContext | None = None,
    ) -> None:
        super().__init__(
            instructions="You are a sales coach debriefing a rep after practice.",
            chat_ctx=chat_ctx,
        )
        self._transcript = transcript
        self._rubric = rubric
        self._retriever = retriever
        self._complete = complete
        self._rep_id = rep_id
        self._session_id = session_id
        self._character = character
        self._scorecards_dir = scorecards_dir
        self._mem0 = mem0

    async def on_enter(self) -> None:
        card = score_session(
            self._transcript,
            self._rubric,
            self._retriever,
            self._complete,
            rep_id=self._rep_id,
            session_id=self._session_id,
            character=self._character,
        )
        await self.session.generate_reply(
            instructions=build_debrief_instructions(card)
        )
        try:
            save_scorecard(card, self._scorecards_dir)
        except Exception:
            logger.warning("Failed to persist scorecard.", exc_info=True)
        if self._mem0 is not None and card.per_objection:
            weak = [o.type for o in card.per_objection if not o.handled]
            if weak:
                try:
                    await self._mem0.add(
                        [
                            {
                                "role": "assistant",
                                "content": (
                                    f"Rep struggled with these objection types: "
                                    f"{', '.join(weak)} (grade {card.overall_grade})."
                                ),
                            }
                        ],
                        user_id=self._rep_id,
                    )
                except Exception:
                    logger.warning("Failed to save weak spots to Mem0.", exc_info=True)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_coaching.py -v`
Expected: PASS (1 test).

- [ ] **Step 5: Add the OpenRouter adapter and the handoff tool to `agent.py`**

In `src/agent.py`, add these imports to the existing `from livekit.agents import (...)` block: `function_tool`, `RunContext`. Add these module-level imports near the top of the file (with the other stdlib imports): `import os` and `from collections.abc import Callable`.

Add the adapter after `load_character_card` (from Task 5):
```python
def make_openrouter_complete(model: str) -> Callable[[str], str]:
    """Return complete(prompt) -> JSON text, via OpenRouter (OPENROUTER_API_KEY)."""
    import openai

    client = openai.OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=os.environ["OPENROUTER_API_KEY"],
    )

    def complete(prompt: str) -> str:
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        return resp.choices[0].message.content or ""

    return complete
```

Replace the `ProspectAgent` class body (from Task 5) with the version that carries handoff dependencies and the tool:
```python
class ProspectAgent(Agent):
    """The AI plays a prospect the rep practices against (see prompts/characters/)."""

    def __init__(
        self,
        character_prompt: str,
        *,
        coach_factory=None,
        chat_ctx: ChatContext | None = None,
    ) -> None:
        super().__init__(instructions=character_prompt, chat_ctx=chat_ctx)
        self._coach_factory = coach_factory

    @function_tool()
    async def end_practice_and_get_feedback(self, context: RunContext):
        """End the roleplay and hand the rep to their coach for feedback.

        Call this when the rep says they are done, asks for feedback, or ends the
        practice.
        """
        if self._coach_factory is None:
            return "Practice ended."
        coach = self._coach_factory(self.chat_ctx.copy(exclude_instructions=True))
        return coach, "Handing you to your coach for feedback."
```

- [ ] **Step 6: Run the full suite to verify nothing regressed**

Run: `uv run pytest -v`
Expected: PASS (identity, scorecard, retrieval, scoring, coaching, and the agent behavior tests).

- [ ] **Step 7: Format, lint, commit**

```bash
uv run ruff format src/agent.py src/coaching.py tests/test_coaching.py
uv run ruff check src/agent.py src/coaching.py tests/test_coaching.py
git add src/agent.py src/coaching.py tests/test_coaching.py
git commit -m "feat: add coach agent, handoff tool, and openrouter scoring adapter"
```

---

### Task 7: Wire the training loop into the session entrypoint

**Files:**
- Modify: `src/agent.py` (`my_agent`) — resolve `rep_id`, load character card, build retriever + complete + coach factory, start with `ProspectAgent`, recall rep history into initial context.
- Test: `tests/test_training_wiring.py`

**Interfaces:**
- Consumes: everything above.
- Produces: `build_coach_factory(*, rubric, retriever, complete, rep_id, session_id, character, scorecards_dir, mem0) -> Callable[[ChatContext], CoachAgent]` in `agent.py` — a small factory the prospect's handoff tool calls. Extracted so it is unit-testable without a live room.

- [ ] **Step 1: Write the failing test**

Create `tests/test_training_wiring.py`:
```python
from pathlib import Path

from livekit.agents import ChatContext

from agent import build_coach_factory
from coaching import CoachAgent
from retrieval import SeedRetriever


def test_coach_factory_builds_coach(tmp_path: Path):
    seed = tmp_path / "rep_lines.json"
    seed.write_text('[{"objection_type":"price","quote":"q","technique":"t"}]', encoding="utf-8")
    factory = build_coach_factory(
        rubric="r",
        retriever=SeedRetriever(seed),
        complete=lambda p: "{}",
        rep_id="jenn",
        session_id="s1",
        character="burned_before_skeptic",
        scorecards_dir=tmp_path,
        mem0=None,
    )
    coach = factory(ChatContext())
    assert isinstance(coach, CoachAgent)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_training_wiring.py -v`
Expected: FAIL with `ImportError: cannot import name 'build_coach_factory' from 'agent'`.

- [ ] **Step 3: Implement `build_coach_factory` and wire `my_agent`**

In `src/agent.py`, add near the other helpers:
```python
def build_coach_factory(
    *,
    rubric: str,
    retriever,
    complete,
    rep_id: str,
    session_id: str,
    character: str,
    scorecards_dir: "Path",
    mem0,
):
    """Return a factory that builds a CoachAgent, given the post-call transcript's
    chat context. Called by the prospect's handoff tool.
    """
    from coaching import CoachAgent
    from scoring import format_practice_transcript

    def factory(chat_ctx):
        transcript = format_practice_transcript(chat_ctx)
        return CoachAgent(
            transcript=transcript,
            rubric=rubric,
            retriever=retriever,
            complete=complete,
            rep_id=rep_id,
            session_id=session_id,
            character=character,
            scorecards_dir=scorecards_dir,
            mem0=mem0,
            chat_ctx=chat_ctx,
        )

    return factory
```

Add module-level constants near `TRANSCRIPTS_DIR`:
```python
SCORECARDS_DIR = Path(__file__).parent.parent / "data" / "scorecards"
RUBRIC_PATH = Path(__file__).parent.parent / "prompts" / "rubric.md"
SEED_REP_LINES_PATH = Path(__file__).parent.parent / "data" / "seed" / "rep_lines.json"
```

Then, inside `my_agent` (replace the `user_name = "unknown"` line and the agent-start block), do the following in order:
1. Resolve identity (robust — no dependency on participant-wait APIs that vary across SDK builds; room metadata or `REP_ID` env is enough for local dev, and the resolver's participant branch stays available for later):
```python
    from identity import resolve_rep_id

    rep_id = resolve_rep_id(
        ctx.room.metadata,
        None,
        os.environ.get("REP_ID"),
    )
    user_name = rep_id  # Mem0 + scorecard key
```
2. Build the training dependencies (after `mem0 = await init_memory()`):
```python
    from retrieval import SeedRetriever

    character = os.environ.get("PROSPECT_CHARACTER", "burned_before_skeptic")
    character_prompt = load_character_card(character)
    rubric = RUBRIC_PATH.read_text(encoding="utf-8")
    retriever = SeedRetriever(SEED_REP_LINES_PATH)
    complete = make_openrouter_complete("anthropic/claude-3-haiku")
    session_id = f"{datetime.now():%Y-%m-%dT%H-%M-%S}_{re.sub(r'[^A-Za-z0-9_-]+', '_', ctx.room.name or 'call')}"
    coach_factory = build_coach_factory(
        rubric=rubric,
        retriever=retriever,
        complete=complete,
        rep_id=rep_id,
        session_id=session_id,
        character=character,
        scorecards_dir=SCORECARDS_DIR,
        mem0=mem0,
    )
```
3. Recall rep history into the initial context (reuse the existing Mem0 recall block; it already keys on `user_name == rep_id`).
4. Start with the prospect instead of `Assistant`:
```python
    await session.start(
        agent=ProspectAgent(
            character_prompt, coach_factory=coach_factory, chat_ctx=initial_ctx
        ),
        room=ctx.room,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=APMNoiseSuppression(),
            ),
        ),
    )
```
5. Update the first spoken line: replace the `GREETING_INSTRUCTIONS` used at `session.generate_reply(...)` so the prospect opens in character, e.g.:
```python
    await session.generate_reply(
        instructions="Open the call in character as the prospect: a bit guarded, "
        "waiting to hear what the rep wants. Do not pitch anything."
    )
```

- [ ] **Step 4: Run the wiring test and full suite**

Run: `uv run pytest -v`
Expected: PASS (all tests including `test_training_wiring.py`).

- [ ] **Step 5: Format, lint, commit**

```bash
uv run ruff format src/agent.py tests/test_training_wiring.py
uv run ruff check src/agent.py tests/test_training_wiring.py
git add src/agent.py tests/test_training_wiring.py
git commit -m "feat: wire prospect->coach training loop into session entrypoint"
```

---

### Task 8: End-to-end console verification

**Files:** none (manual verification).

- [ ] **Step 1: Run the full automated suite**

Run: `uv run pytest -v`
Expected: all green.

- [ ] **Step 2: Drive a live practice call in the console**

Run: `uv run src/agent.py console`
Do this:
1. Speak as a rep pitching the casting program. Confirm the AI answers **as a guarded prospect** and raises an objection (trust/price/authority).
2. Push once; confirm it does not immediately fold.
3. Say "I think that's it — can I get feedback?" Confirm the agent **hands off to the coach**, drops character, and gives a spoken debrief mentioning at least one objection, a grade, and a "a top rep might have said…" line.

- [ ] **Step 3: Confirm the scorecard persisted**

Run: `ls data/scorecards/` then open the newest `*/*.json`.
Expected: a JSON scorecard with `rep_id`, `per_objection`, `overall_grade`. (`rep_id` will be `unknown` in console unless `REP_ID` is set — set `REP_ID` in `.env.local` and re-run to see per-rep foldering.)

- [ ] **Step 4: Confirm fail-open**

Temporarily set an invalid `OPENROUTER_API_KEY` in `.env.local`, run a short call to the coach handoff, and confirm the coach still speaks a generic debrief and the call does not crash (scorecard will be `overall_grade: incomplete`). Restore the key afterward.

- [ ] **Step 5: Final format/lint pass and commit any fixes**

```bash
uv run ruff format . && uv run ruff check .
git add -A && git commit -m "test: verify rep-trainer loop end-to-end in console"
```

---

## Notes for Plan 2 (offline pipeline + RAGFlow) — not in scope here
- Add `ragflow-sdk` dep; implement `RagflowRetriever(Retriever)` (uses `retrieve(dataset_ids=[...], question=..., metadata_condition={"logic":"and","conditions":[{"name":"objection_type","comparison_operator":"is","value":...}]})`) and swap it in for `SeedRetriever` in Task 7.
- `scripts/extract.py`, `scripts/cluster.py`, `scripts/cards.py`, `scripts/ingest_ragflow.py`; author real `prompts/characters/*` and refine `prompts/rubric.md`.
- Stand up `rag/docker/` stack; create `objections` + `rep_lines` datasets with a HuggingFace TEI embedding model.
```
