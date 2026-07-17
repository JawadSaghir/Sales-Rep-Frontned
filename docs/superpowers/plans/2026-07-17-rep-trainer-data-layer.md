# Rep Trainer Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean the scattered Performance-Bot scorecard CSV into a SQLite relational store, cluster objection/weakness taxonomies via OpenRouter embeddings under a human-approval gate, then export one YAML weakness profile per sales rep.

**Architecture:** Pure, unit-tested functions live in `cleaned_data/*.py`; two Jupyter notebooks orchestrate them. Stage 1 (`cleaning.ipynb`) cleans the CSV → SQLite → proposes taxonomies. A human reviews the draft taxonomy YAML. Stage 2 (`taxonomy_studio.ipynb`) classifies every call against the frozen taxonomy and exports profiles. SQLite is the source of truth; YAML files are regenerable views.

**Tech Stack:** Python ≥3.10, `uv`, stdlib `csv`/`sqlite3`, `pyyaml`, `openai` client pointed at OpenRouter, `umap-learn` + `hdbscan` + `scikit-learn` + `pandas` (offline notebook deps only), `pytest`.

## Global Constraints

- Python `>=3.10, <3.15`; run everything via `uv` (`uv run pytest`, `uv run ruff`).
- Ruff: line-length 88, double quotes, target py39; type-annotate all function signatures.
- OpenRouter is the only LLM/embedding provider: `base_url="https://openrouter.ai/api/v1"`, key `OPENROUTER_API_KEY`. Chat model env `REP_PROFILE_MODEL` (default `openai/gpt-4o-mini`); embed model env `REP_EMBED_MODEL` (default `openai/text-embedding-3-small`). **No `torch` / `sentence-transformers`.**
- SQLite (`cleaned_data/rep_trainer.db`) is the source of truth; YAML are exported views.
- **Keep** the ~1,628 older-rubric rows (no numeric grade but full free-text); exclude them only from numeric averages via a `has_numeric_score` flag. Never filter them out.
- Drop these corrupted/sparse columns entirely: `objection_handling`, `close_mechanics`, `frame_and_control`, `prospect_read`, `self_assessment_accuracy`, `coachability_signal`, `scoring_raw_json`, `grading_trace`, `call_status`.
- Notebook-only deps go in `[dependency-groups] data`, never in runtime `dependencies`.
- `min_scored_calls = 8` default for thin-data suppression.
- Grade bands (low→high): `weak < needs_improvement < developing < good < strong < elite`.
- Source CSV: `data/raw_data/Performance Bot Scorecards-Grid view.csv` (3,967 rows, 194 reps), read with `encoding="utf-8-sig"` and `csv.field_size_limit` raised.

---

## File Structure

- `pyproject.toml` — add `[dependency-groups] data`.
- `cleaned_data/__init__.py` — package marker + exported constants.
- `cleaned_data/cleaning_utils.py` — pure functions: grade/no-show/close-ask parsing, rep canonicalization, stats aggregation, phrase extraction.
- `cleaned_data/db.py` — schema, load, summary-table refresh, profile builder, exports, runtime drill query.
- `cleaned_data/embeddings.py` — OpenRouter embedding client + UMAP/HDBSCAN clustering.
- `cleaned_data/clustering.py` — LLM cluster-labelling + per-call classification (schema-validated).
- `cleaned_data/evaluate.py` — profile-quality rubric.
- `notebooks/cleaning.ipynb` — Stage 1 orchestrator.
- `notebooks/taxonomy_studio.ipynb` — Stage 2 orchestrator (post human review).
- `tests/test_cleaning.py` — pytest over pure functions, DB round-trips, schema validation.

---

## Task 1: Dependencies & package scaffold

**Files:**
- Modify: `pyproject.toml`
- Create: `cleaned_data/__init__.py`

**Interfaces:**
- Consumes: nothing.
- Produces: importable `cleaned_data` package; `cleaned_data.SCORECARD_CSV` (Path), `cleaned_data.DB_PATH` (Path), `cleaned_data.GRADE_BANDS` (list[str]).

- [ ] **Step 1: Add the offline dependency group to `pyproject.toml`**

Add this block after the existing `[dependency-groups]` `dev = [...]` list (keep `dev` as-is):

```toml
[dependency-groups]
dev = [
    "pytest",
    "pytest-asyncio",
    "ruff",
]
data = [
    "pandas>=2.2",
    "pyarrow>=16.0",
    "umap-learn>=0.5.6",
    "hdbscan>=0.8.38",
    "scikit-learn>=1.5",
]
```

- [ ] **Step 2: Create the package marker**

Create `cleaned_data/__init__.py`:

```python
"""Rep-trainer data layer: cleaning, SQLite store, taxonomy clustering, exports."""

from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
SCORECARD_CSV = _ROOT / "data" / "raw_data" / "Performance Bot Scorecards-Grid view.csv"
DB_PATH = Path(__file__).resolve().parent / "rep_trainer.db"
PROFILES_DIR = Path(__file__).resolve().parent / "rep_profiles"
TAXONOMY_DIR = Path(__file__).resolve().parent / "taxonomies"

# Grade bands, ordered low → high. Index doubles as the ordinal rank.
GRADE_BANDS = ["weak", "needs_improvement", "developing", "good", "strong", "elite"]
```

- [ ] **Step 3: Sync and verify the data group installs**

Run: `uv sync --group data`
Expected: resolves and installs pandas, pyarrow, umap-learn, hdbscan, scikit-learn with no error.

- [ ] **Step 4: Verify the package imports**

Run: `uv run python -c "import cleaned_data; print(cleaned_data.GRADE_BANDS)"`
Expected: `['weak', 'needs_improvement', 'developing', 'good', 'strong', 'elite']`

- [ ] **Step 5: Commit**

```bash
git add pyproject.toml cleaned_data/__init__.py
git commit -m "chore: scaffold cleaned_data package + offline data dep group"
```

---

## Task 2: Grade normalization

**Files:**
- Create: `cleaned_data/cleaning_utils.py`
- Test: `tests/test_cleaning.py`

**Interfaces:**
- Consumes: `cleaned_data.GRADE_BANDS`.
- Produces: `normalize_grade(raw: str) -> tuple[str | None, str]` → `(band_or_None, raw_trimmed)`. Junk/`N/A` → `(None, raw)`. Unicode-minus variants (`−`, `–`) normalized to ASCII `-`.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_cleaning.py`:

```python
from cleaned_data.cleaning_utils import normalize_grade


def test_normalize_grade_letters_and_labels():
    assert normalize_grade("A")[0] == "elite"
    assert normalize_grade("A-")[0] == "strong"
    assert normalize_grade("B")[0] == "good"
    assert normalize_grade("C+")[0] == "developing"
    assert normalize_grade("D")[0] == "weak"
    assert normalize_grade("F")[0] == "weak"
    assert normalize_grade("Elite")[0] == "elite"
    assert normalize_grade("Needs Improvement")[0] == "needs_improvement"


def test_normalize_grade_unicode_minus_variants():
    assert normalize_grade("A−")[0] == "strong"  # minus sign
    assert normalize_grade("B–")[0] == "developing"  # en dash


def test_normalize_grade_junk_is_quarantined():
    band, raw = normalize_grade("D (context-adjusted: technical disconnect)")
    assert band is None
    assert raw == "D (context-adjusted: technical disconnect)"
    assert normalize_grade("N/A")[0] is None
    assert normalize_grade("")[0] is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_cleaning.py -k normalize_grade -v`
Expected: FAIL with `ModuleNotFoundError` / `cannot import name 'normalize_grade'`.

- [ ] **Step 3: Write minimal implementation**

Create `cleaned_data/cleaning_utils.py`:

```python
"""Pure cleaning/aggregation helpers for the rep-trainer data layer.

No I/O here: every function takes plain values and returns plain values so the
whole module is trivially unit-testable.
"""

from __future__ import annotations

_GRADE_MAP: dict[str, str] = {
    # letter grades
    "a+": "elite", "a": "elite", "a-": "strong",
    "b+": "strong", "b": "good", "b-": "developing",
    "c+": "developing", "c": "needs_improvement", "c-": "needs_improvement",
    "d+": "needs_improvement", "d": "weak", "d-": "weak", "f": "weak",
    # qualitative labels
    "elite": "elite", "strong": "strong", "good": "good",
    "developing": "developing", "needs improvement": "needs_improvement",
    "needs work": "needs_improvement", "weak": "weak",
}


def normalize_grade(raw: str) -> tuple[str | None, str]:
    """Map a raw grade to one band, or (None, raw) if it is junk/absent.

    Unicode minus (U+2212) and en/em dashes are folded to ASCII '-'.
    """
    raw = (raw or "").strip()
    key = raw.lower().replace("−", "-").replace("–", "-").replace("—", "-")
    return (_GRADE_MAP.get(key), raw)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_cleaning.py -k normalize_grade -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add cleaned_data/cleaning_utils.py tests/test_cleaning.py
git commit -m "feat: grade normalization with junk quarantine + unicode-minus fix"
```

---

## Task 3: No-show parsing & is_real_call

**Files:**
- Modify: `cleaned_data/cleaning_utils.py`
- Test: `tests/test_cleaning.py`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `parse_no_show(raw: str) -> bool` → True only for genuine no-shows.
  - `is_real_call(row: dict) -> bool` → False for genuine no-shows or rows with no free-text AND no scores; True otherwise (including older-rubric narrative-only rows).
  - `FREE_TEXT_FIELDS: tuple[str, ...]` — the columns treated as coaching narrative.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_cleaning.py`:

```python
from cleaned_data.cleaning_utils import parse_no_show, is_real_call


def test_parse_no_show_clean_values_are_attended():
    for v in ["no", "false", "No", "none", ""]:
        assert parse_no_show(v) is False


def test_parse_no_show_detects_genuine_no_shows():
    assert parse_no_show("yes") is True
    assert parse_no_show("Technical No-Show") is True
    assert parse_no_show("Yes — Rep did not appear. Prospect was present.") is True
    assert parse_no_show("Third-party no-show (Dr. O did not attend)") is True


def test_parse_no_show_attended_but_problematic_is_not_no_show():
    # "No — ..." narratives describe attended calls that had issues.
    assert parse_no_show("No — prospect joined but had only 5 minutes") is False


def test_is_real_call_keeps_older_rubric_narrative_rows():
    older = {"no_show": "no", "total_score": "", "grade": "",
             "what_to_improve": "Rep accepted the stall without probing."}
    assert is_real_call(older) is True


def test_is_real_call_drops_no_show_and_empty_rows():
    assert is_real_call({"no_show": "Technical No-Show", "what_to_improve": "x"}) is False
    assert is_real_call({"no_show": "no", "total_score": "", "grade": ""}) is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_cleaning.py -k "no_show or real_call" -v`
Expected: FAIL with import error.

- [ ] **Step 3: Write minimal implementation**

Append to `cleaned_data/cleaning_utils.py`:

```python
FREE_TEXT_FIELDS: tuple[str, ...] = (
    "what_to_improve", "why_no_close", "red_flags", "coaching_tip",
    "one_line_verdict", "rudys_note", "objections_surfaced",
)

_NO_SHOW_MARKERS = ("no-show", "no show", "did not appear", "did not attend")


def parse_no_show(raw: str) -> bool:
    """True only when the rep genuinely did not show.

    The column mixes clean values ('no'/'false'/'No'/'none') with free-text.
    'No — ...' narratives describe attended-but-problematic calls (not no-shows).
    """
    v = (raw or "").strip().lower()
    if v in {"", "no", "false", "none"}:
        return False
    if v in {"yes", "true"}:
        return True
    if v.startswith("no "):  # "no — prospect joined but ..." = attended
        return False
    if v.startswith("yes"):
        return True
    return any(m in v for m in _NO_SHOW_MARKERS)


def is_real_call(row: dict) -> bool:
    """Keep the row unless it is a genuine no-show or has no usable content."""
    if parse_no_show(row.get("no_show", "")):
        return False
    has_text = any((row.get(f) or "").strip() for f in FREE_TEXT_FIELDS)
    has_score = bool((row.get("total_score") or "").strip()) or bool(
        (row.get("grade") or "").strip()
    )
    return has_text or has_score
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_cleaning.py -k "no_show or real_call" -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add cleaned_data/cleaning_utils.py tests/test_cleaning.py
git commit -m "feat: robust no-show parsing + is_real_call keeps older-rubric rows"
```

---

## Task 4: Close-ask parsing & numeric-score flag

**Files:**
- Modify: `cleaned_data/cleaning_utils.py`
- Test: `tests/test_cleaning.py`

**Interfaces:**
- Consumes: `normalize_grade`.
- Produces:
  - `parse_close_ask(raw: str) -> bool | None` — `yes*`→True, `no*`→False, `unclear`/`partial*`/blank→None.
  - `has_numeric_score(row: dict) -> bool` — True if `total_score` present or `grade` maps to a band.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_cleaning.py`:

```python
from cleaned_data.cleaning_utils import parse_close_ask, has_numeric_score


def test_parse_close_ask():
    assert parse_close_ask("yes") is True
    assert parse_close_ask("Yes — $2,500 down today") is True
    assert parse_close_ask("no") is False
    assert parse_close_ask("No — not applicable") is False
    assert parse_close_ask("unclear") is None
    assert parse_close_ask("Partially — used 1-10 scale") is None
    assert parse_close_ask("") is None


def test_has_numeric_score():
    assert has_numeric_score({"total_score": "47", "grade": ""}) is True
    assert has_numeric_score({"total_score": "", "grade": "B+"}) is True
    assert has_numeric_score({"total_score": "", "grade": ""}) is False
    assert has_numeric_score({"total_score": "", "grade": "N/A"}) is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_cleaning.py -k "close_ask or numeric_score" -v`
Expected: FAIL with import error.

- [ ] **Step 3: Write minimal implementation**

Append to `cleaned_data/cleaning_utils.py`:

```python
def parse_close_ask(raw: str) -> bool | None:
    """yes*→True, no*→False, unclear/partial/blank→None."""
    v = (raw or "").strip().lower()
    if v.startswith("yes"):
        return True
    if v.startswith("no"):
        return False
    return None


def has_numeric_score(row: dict) -> bool:
    """True when the row carries a usable numeric grade (newer rubric)."""
    if (row.get("total_score") or "").strip():
        return True
    return normalize_grade(row.get("grade", ""))[0] is not None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_cleaning.py -k "close_ask or numeric_score" -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add cleaned_data/cleaning_utils.py tests/test_cleaning.py
git commit -m "feat: close-ask parsing + numeric-score flag"
```

---

## Task 5: Rep canonicalization

**Files:**
- Modify: `cleaned_data/cleaning_utils.py`
- Test: `tests/test_cleaning.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: `canonicalize_rep(name: str, email: str) -> tuple[str, str, str]` → `(canonical_name, email_lower, slug)`. Slug: lowercase name, collapse whitespace, non-alphanumeric → single hyphen, trimmed. Case/whitespace variants collapse to one slug.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_cleaning.py`:

```python
from cleaned_data.cleaning_utils import canonicalize_rep


def test_canonicalize_rep_collapses_variants():
    a = canonicalize_rep("Mike Zanardelli", "Mike.Z@Example.com")
    b = canonicalize_rep("  MIKE   ZANARDELLI ", "mike.z@example.com")
    assert a[2] == "mike-zanardelli"
    assert a[2] == b[2]  # same slug despite case/whitespace
    assert a[1] == "mike.z@example.com"  # email lowercased


def test_canonicalize_rep_strips_punctuation():
    assert canonicalize_rep("O'Brien-Smith, Jr.", "")[2] == "o-brien-smith-jr"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_cleaning.py -k canonicalize_rep -v`
Expected: FAIL with import error.

- [ ] **Step 3: Write minimal implementation**

Append to `cleaned_data/cleaning_utils.py` (add `import re` at top of file):

```python
import re

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def canonicalize_rep(name: str, email: str) -> tuple[str, str, str]:
    """Return (canonical_name, email_lower, slug); variants collapse to one slug."""
    canonical_name = " ".join((name or "").split())
    email_lower = (email or "").strip().lower()
    slug = _SLUG_RE.sub("-", canonical_name.lower()).strip("-")
    return (canonical_name, email_lower, slug)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_cleaning.py -k canonicalize_rep -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add cleaned_data/cleaning_utils.py tests/test_cleaning.py
git commit -m "feat: rep name/email canonicalization to stable slug"
```

---

## Task 6: Phrase extraction

**Files:**
- Modify: `cleaned_data/cleaning_utils.py`
- Test: `tests/test_cleaning.py`

**Interfaces:**
- Consumes: `FREE_TEXT_FIELDS`.
- Produces:
  - `extract_objection_phrases(text: str) -> list[str]` — splits numbered lists (`1.`/`1)`/`2)`) into trimmed items, dropping fragments shorter than 4 chars.
  - `pool_weakness_text(row: dict) -> str` — joins `what_to_improve`, `why_no_close`, `red_flags` with " | ".

- [ ] **Step 1: Write the failing test**

Add to `tests/test_cleaning.py`:

```python
from cleaned_data.cleaning_utils import extract_objection_phrases, pool_weakness_text


def test_extract_objection_phrases_splits_numbered_lists():
    text = ("1. Budget/price too high for this year. 2) Wants to talk to advisors "
            "first. 3) Decision feels rushed.")
    phrases = extract_objection_phrases(text)
    assert len(phrases) == 3
    assert phrases[0].startswith("Budget/price")
    assert "advisors" in phrases[1]


def test_extract_objection_phrases_handles_empty_and_unnumbered():
    assert extract_objection_phrases("") == []
    assert extract_objection_phrases("Single objection, no numbering.") == [
        "Single objection, no numbering."
    ]


def test_pool_weakness_text_joins_fields():
    row = {"what_to_improve": "Probe stalls.", "why_no_close": "Accepted stall.",
           "red_flags": ""}
    assert pool_weakness_text(row) == "Probe stalls. | Accepted stall."
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_cleaning.py -k "phrases or weakness_text" -v`
Expected: FAIL with import error.

- [ ] **Step 3: Write minimal implementation**

Append to `cleaned_data/cleaning_utils.py`:

```python
_NUM_MARKER_RE = re.compile(r"\s*\d+[.)]\s*")


def extract_objection_phrases(text: str) -> list[str]:
    """Split a numbered-list narrative into individual phrases."""
    text = (text or "").strip()
    if not text:
        return []
    parts = _NUM_MARKER_RE.split(text)
    return [p.strip() for p in parts if len(p.strip()) >= 4]


def pool_weakness_text(row: dict) -> str:
    """Concatenate the weakness free-text fields into one blob for clustering."""
    fields = ("what_to_improve", "why_no_close", "red_flags")
    return " | ".join((row.get(f) or "").strip() for f in fields
                      if (row.get(f) or "").strip())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_cleaning.py -k "phrases or weakness_text" -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add cleaned_data/cleaning_utils.py tests/test_cleaning.py
git commit -m "feat: numbered-list phrase extraction + weakness text pooling"
```

---

## Task 7: Per-rep stats aggregation

**Files:**
- Modify: `cleaned_data/cleaning_utils.py`
- Test: `tests/test_cleaning.py`

**Interfaces:**
- Consumes: `normalize_grade`, `parse_close_ask`, `has_numeric_score`, `GRADE_BANDS`.
- Produces: `aggregate_stats(calls: list[dict], min_scored_calls: int = 8) -> dict`. Each call dict has keys `total_score`, `grade`, `did_rep_ask_for_close`, `call_date` (ISO-8601). Returns keys: `calls_with_narrative`, `calls_with_numeric_score`, `avg_total_score` (float|None), `grade_normalized` (str|None = modal band), `grade_trend` (`improving`/`flat`/`declining`/`unknown`), `close_ask_rate` (float|None), `data_confidence` (`high`/`thin`).

- [ ] **Step 1: Write the failing test**

Add to `tests/test_cleaning.py`:

```python
from cleaned_data.cleaning_utils import aggregate_stats


def _call(score, grade, ask, date):
    return {"total_score": score, "grade": grade,
            "did_rep_ask_for_close": ask, "call_date": date}


def test_aggregate_stats_high_confidence():
    calls = [_call(str(40 + i), "B", "yes" if i % 2 else "no",
                   f"2026-0{1 + i // 5}-0{1 + i % 5}T10:00:00.000Z")
             for i in range(10)]
    s = aggregate_stats(calls, min_scored_calls=8)
    assert s["calls_with_numeric_score"] == 10
    assert s["data_confidence"] == "high"
    assert s["grade_normalized"] == "good"
    assert 0.0 <= s["close_ask_rate"] <= 1.0
    assert s["avg_total_score"] is not None


def test_aggregate_stats_thin_suppresses_numbers():
    calls = [_call("50", "B", "yes", "2026-01-01T10:00:00.000Z")] * 3
    s = aggregate_stats(calls, min_scored_calls=8)
    assert s["data_confidence"] == "thin"
    assert s["avg_total_score"] is None
    assert s["calls_with_narrative"] == 3


def test_aggregate_stats_counts_narrative_only_rows():
    calls = [_call("", "", "", "2026-01-01T10:00:00.000Z"),
             _call("60", "A", "yes", "2026-02-01T10:00:00.000Z")]
    s = aggregate_stats(calls, min_scored_calls=1)
    assert s["calls_with_narrative"] == 2
    assert s["calls_with_numeric_score"] == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_cleaning.py -k aggregate_stats -v`
Expected: FAIL with import error.

- [ ] **Step 3: Write minimal implementation**

Append to `cleaned_data/cleaning_utils.py` (add `from statistics import mean` and `from collections import Counter` at top):

```python
from collections import Counter
from statistics import mean

from cleaned_data import GRADE_BANDS


def _trend(scored: list[dict]) -> str:
    """Compare mean total_score of the older vs newer half, by call_date."""
    dated = [c for c in scored if (c.get("call_date") or "").strip()]
    if len(dated) < 4:
        return "unknown"
    dated.sort(key=lambda c: c["call_date"])
    half = len(dated) // 2
    first = mean(float(c["total_score"]) for c in dated[:half])
    second = mean(float(c["total_score"]) for c in dated[half:])
    if second - first > 2:
        return "improving"
    if first - second > 2:
        return "declining"
    return "flat"


def aggregate_stats(calls: list[dict], min_scored_calls: int = 8) -> dict:
    """Deterministic per-rep numeric rollup with thin-data suppression."""
    scored = [c for c in calls if has_numeric_score(c)]
    with_score = [c for c in scored if (c.get("total_score") or "").strip()]
    bands = [b for b in (normalize_grade(c.get("grade", ""))[0] for c in scored) if b]
    asks = [parse_close_ask(c.get("did_rep_ask_for_close", "")) for c in calls]
    clean_asks = [a for a in asks if a is not None]

    confidence = "high" if len(scored) >= min_scored_calls else "thin"
    modal_band = (
        max(Counter(bands), key=lambda b: (Counter(bands)[b], GRADE_BANDS.index(b)))
        if bands else None
    )
    avg = (
        round(mean(float(c["total_score"]) for c in with_score), 1)
        if with_score and confidence == "high" else None
    )
    return {
        "calls_with_narrative": len(calls),
        "calls_with_numeric_score": len(scored),
        "avg_total_score": avg,
        "grade_normalized": modal_band,
        "grade_trend": _trend(with_score) if confidence == "high" else "unknown",
        "close_ask_rate": (round(sum(clean_asks) / len(clean_asks), 2)
                           if clean_asks else None),
        "data_confidence": confidence,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_cleaning.py -k aggregate_stats -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add cleaned_data/cleaning_utils.py tests/test_cleaning.py
git commit -m "feat: per-rep stats aggregation with thin-data suppression + trend"
```

---

## Task 8: SQLite schema & load

**Files:**
- Create: `cleaned_data/db.py`
- Test: `tests/test_cleaning.py`

**Interfaces:**
- Consumes: nothing (takes an open connection).
- Produces:
  - `connect(path: str | Path = DB_PATH) -> sqlite3.Connection` (row_factory = `sqlite3.Row`, FKs on).
  - `create_schema(conn) -> None` — all tables from the spec (`reps`, `calls`, `objection_types`, `weakness_types`, `call_objections`, `call_weaknesses`, `export_meta`, `personas`, `persona_objections`, summary tables `rep_weakness_summary`, `team_weakness_ranking`, `rep_persona_match_scores`) + indexes on `reps.slug`, `rep_weakness_summary.rep_id`.
  - `upsert_rep(conn, name, email, slug) -> int` (returns `rep_id`).
  - `insert_call(conn, rep_id: int, fields: dict) -> int` (returns `call_id`).

- [ ] **Step 1: Write the failing test**

Add to `tests/test_cleaning.py`:

```python
from cleaned_data import db


def test_schema_and_load_roundtrip():
    conn = db.connect(":memory:")
    db.create_schema(conn)
    rid = db.upsert_rep(conn, "Mike Zanardelli", "mike.z@x.com", "mike-zanardelli")
    rid2 = db.upsert_rep(conn, "Mike Zanardelli", "mike.z@x.com", "mike-zanardelli")
    assert rid == rid2  # idempotent on slug
    cid = db.insert_call(conn, rid, {
        "total_score": 47, "grade_normalized": "developing", "grade_raw": "Developing",
        "close_ask": 1, "has_numeric_score": 1, "what_to_improve": "Probe stalls.",
        "objections_surfaced": "1. Price. 2. Timing.",
    })
    assert isinstance(cid, int)
    row = conn.execute("SELECT rep_id, total_score FROM calls WHERE call_id=?",
                       (cid,)).fetchone()
    assert row["rep_id"] == rid
    assert row["total_score"] == 47
    tables = {r["name"] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"reps", "calls", "objection_types", "weakness_types", "call_objections",
            "call_weaknesses", "export_meta", "personas", "persona_objections",
            "rep_weakness_summary", "team_weakness_ranking",
            "rep_persona_match_scores"} <= tables
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_cleaning.py -k roundtrip -v`
Expected: FAIL with `ModuleNotFoundError: cleaned_data.db`.

- [ ] **Step 3: Write minimal implementation**

Create `cleaned_data/db.py`:

```python
"""SQLite persistence for the rep-trainer data layer (source of truth)."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from cleaned_data import DB_PATH

_SCHEMA = """
CREATE TABLE IF NOT EXISTS reps(
  rep_id INTEGER PRIMARY KEY, name TEXT, email TEXT, slug TEXT UNIQUE);
CREATE TABLE IF NOT EXISTS calls(
  call_id INTEGER PRIMARY KEY, rep_id INTEGER REFERENCES reps(rep_id),
  client_name TEXT, call_date TEXT, show_name TEXT, meeting_id TEXT,
  total_score REAL, grade_normalized TEXT, grade_raw TEXT,
  close_ask INTEGER, has_numeric_score INTEGER,
  intended_outcome TEXT, deal_outcome_context TEXT, flagged_followup TEXT,
  one_line_verdict TEXT, biggest_strength TEXT, what_went_well TEXT,
  what_made_close_work TEXT, what_to_improve TEXT, why_no_close TEXT,
  red_flags TEXT, coaching_tip TEXT, rep_improvement TEXT, rudys_note TEXT,
  objections_surfaced TEXT);
CREATE TABLE IF NOT EXISTS objection_types(
  obj_id INTEGER PRIMARY KEY, label TEXT, definition TEXT, aliases TEXT);
CREATE TABLE IF NOT EXISTS weakness_types(
  weak_id INTEGER PRIMARY KEY, label TEXT, definition TEXT, coaching_fix TEXT);
CREATE TABLE IF NOT EXISTS call_objections(
  call_id INTEGER REFERENCES calls(call_id),
  obj_id INTEGER REFERENCES objection_types(obj_id), handled TEXT, quote TEXT);
CREATE TABLE IF NOT EXISTS call_weaknesses(
  call_id INTEGER REFERENCES calls(call_id),
  weak_id INTEGER REFERENCES weakness_types(weak_id), evidence_quote TEXT);
CREATE TABLE IF NOT EXISTS export_meta(
  export_id INTEGER PRIMARY KEY, generated_at TEXT, taxonomy_version TEXT,
  model_used TEXT, git_sha TEXT, row_counts_json TEXT);
CREATE TABLE IF NOT EXISTS personas(persona_id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE IF NOT EXISTS persona_objections(
  persona_id INTEGER REFERENCES personas(persona_id),
  obj_id INTEGER REFERENCES objection_types(obj_id));
CREATE TABLE IF NOT EXISTS rep_weakness_summary(
  rep_id INTEGER, weak_id INTEGER, frequency REAL, last_seen TEXT);
CREATE TABLE IF NOT EXISTS team_weakness_ranking(
  weak_id INTEGER, rep_count INTEGER, call_count INTEGER);
CREATE TABLE IF NOT EXISTS rep_persona_match_scores(
  rep_id INTEGER, persona_id INTEGER, score REAL);
CREATE INDEX IF NOT EXISTS ix_reps_slug ON reps(slug);
CREATE INDEX IF NOT EXISTS ix_rws_rep ON rep_weakness_summary(rep_id);
"""

_CALL_COLUMNS = [
    "client_name", "call_date", "show_name", "meeting_id", "total_score",
    "grade_normalized", "grade_raw", "close_ask", "has_numeric_score",
    "intended_outcome", "deal_outcome_context", "flagged_followup",
    "one_line_verdict", "biggest_strength", "what_went_well",
    "what_made_close_work", "what_to_improve", "why_no_close", "red_flags",
    "coaching_tip", "rep_improvement", "rudys_note", "objections_surfaced",
]


def connect(path: str | Path = DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(_SCHEMA)
    conn.commit()


def upsert_rep(conn: sqlite3.Connection, name: str, email: str, slug: str) -> int:
    conn.execute(
        "INSERT INTO reps(name, email, slug) VALUES(?,?,?) "
        "ON CONFLICT(slug) DO UPDATE SET name=excluded.name, email=excluded.email",
        (name, email, slug),
    )
    conn.commit()
    return conn.execute("SELECT rep_id FROM reps WHERE slug=?", (slug,)).fetchone()[0]


def insert_call(conn: sqlite3.Connection, rep_id: int, fields: dict) -> int:
    cols = ["rep_id"] + _CALL_COLUMNS
    vals = [rep_id] + [fields.get(c) for c in _CALL_COLUMNS]
    placeholders = ",".join("?" * len(cols))
    cur = conn.execute(
        f"INSERT INTO calls({','.join(cols)}) VALUES({placeholders})", vals
    )
    conn.commit()
    return cur.lastrowid
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_cleaning.py -k roundtrip -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cleaned_data/db.py tests/test_cleaning.py
git commit -m "feat: sqlite schema + idempotent rep/call load"
```

---

## Task 9: Summary tables, profile builder, drill query & export

**Files:**
- Modify: `cleaned_data/db.py`
- Test: `tests/test_cleaning.py`

**Interfaces:**
- Consumes: `create_schema`, `upsert_rep`, `insert_call`, `cleaning_utils.aggregate_stats`.
- Produces:
  - `refresh_summary_tables(conn) -> None` — rebuilds `rep_weakness_summary` and `team_weakness_ranking` from `call_weaknesses`.
  - `get_rep_drill_plan(conn, slug: str, top_n: int = 3) -> list[dict]` — top-N `{weak_id, label, frequency, coaching_fix}` for a rep.
  - `build_profile_dict(conn, slug: str, min_scored_calls: int = 8) -> dict` — the exported rep-profile shape.
  - `export_profiles(conn, out_dir: Path = PROFILES_DIR, min_scored_calls: int = 8) -> int` — writes `<slug>.yaml` per rep, returns count.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_cleaning.py`:

```python
import yaml


def _seed_two_weaknesses(conn):
    db.create_schema(conn)
    rid = db.upsert_rep(conn, "Mike Zanardelli", "m@x.com", "mike-zanardelli")
    conn.execute("INSERT INTO weakness_types(weak_id,label,definition,coaching_fix)"
                 " VALUES(1,'accepts-stalls','desc','Probe the stall.')")
    for i in range(9):
        cid = db.insert_call(conn, rid, {"total_score": 45 + i, "grade_normalized":
            "developing", "grade_raw": "Developing", "close_ask": i % 2,
            "has_numeric_score": 1, "call_date": f"2026-01-0{i + 1}T10:00:00.000Z",
            "biggest_strength": "Clean walkthrough.", "rudys_note": "Behavioral gap.",
            "what_to_improve": "Probe stalls."})
        conn.execute("INSERT INTO call_weaknesses(call_id,weak_id,evidence_quote)"
                     " VALUES(?,1,'stall accepted')", (cid,))
    conn.commit()
    return rid


def test_summary_and_drill_plan():
    conn = db.connect(":memory:")
    _seed_two_weaknesses(conn)
    db.refresh_summary_tables(conn)
    plan = db.get_rep_drill_plan(conn, "mike-zanardelli", top_n=3)
    assert plan and plan[0]["label"] == "accepts-stalls"
    assert plan[0]["coaching_fix"] == "Probe the stall."


def test_build_profile_dict_shape():
    conn = db.connect(":memory:")
    _seed_two_weaknesses(conn)
    db.refresh_summary_tables(conn)
    prof = db.build_profile_dict(conn, "mike-zanardelli")
    assert prof["rep_slug"] == "mike-zanardelli"
    assert prof["stats"]["data_confidence"] == "high"
    assert prof["recurring_weaknesses"][0]["weakness_type"] == "accepts-stalls"
    assert "strengths" in prof and "coach_notes" in prof
    # round-trips as YAML
    assert yaml.safe_load(yaml.safe_dump(prof))["rep_slug"] == "mike-zanardelli"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_cleaning.py -k "summary or profile_dict" -v`
Expected: FAIL (`refresh_summary_tables` undefined).

- [ ] **Step 3: Write minimal implementation**

Append to `cleaned_data/db.py` (add imports at top: `import json`, `from cleaned_data import PROFILES_DIR`, `from cleaned_data.cleaning_utils import aggregate_stats`, `import yaml`):

```python
import json

import yaml

from cleaned_data import PROFILES_DIR
from cleaned_data.cleaning_utils import aggregate_stats


def refresh_summary_tables(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM rep_weakness_summary")
    conn.execute("DELETE FROM team_weakness_ranking")
    conn.execute("""
      INSERT INTO rep_weakness_summary(rep_id, weak_id, frequency, last_seen)
      SELECT c.rep_id, cw.weak_id,
             CAST(COUNT(DISTINCT cw.call_id) AS REAL)
               / (SELECT COUNT(*) FROM calls c2 WHERE c2.rep_id = c.rep_id),
             MAX(c.call_date)
      FROM call_weaknesses cw JOIN calls c ON c.call_id = cw.call_id
      GROUP BY c.rep_id, cw.weak_id""")
    conn.execute("""
      INSERT INTO team_weakness_ranking(weak_id, rep_count, call_count)
      SELECT cw.weak_id, COUNT(DISTINCT c.rep_id), COUNT(DISTINCT cw.call_id)
      FROM call_weaknesses cw JOIN calls c ON c.call_id = cw.call_id
      GROUP BY cw.weak_id""")
    conn.commit()


def get_rep_drill_plan(conn: sqlite3.Connection, slug: str,
                       top_n: int = 3) -> list[dict]:
    rows = conn.execute("""
      SELECT wt.weak_id, wt.label, rws.frequency, wt.coaching_fix
      FROM rep_weakness_summary rws
      JOIN reps r ON r.rep_id = rws.rep_id
      JOIN weakness_types wt ON wt.weak_id = rws.weak_id
      WHERE r.slug = ? ORDER BY rws.frequency DESC LIMIT ?""", (slug, top_n))
    return [dict(r) for r in rows]


def _rep_calls(conn: sqlite3.Connection, rep_id: int) -> list[dict]:
    rows = conn.execute(
        "SELECT total_score, grade_normalized AS grade, close_ask, call_date "
        "FROM calls WHERE rep_id = ?", (rep_id,)).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["total_score"] = "" if d["total_score"] is None else str(d["total_score"])
        d["did_rep_ask_for_close"] = {1: "yes", 0: "no"}.get(d.pop("close_ask"), "")
        out.append(d)
    return out


def build_profile_dict(conn: sqlite3.Connection, slug: str,
                       min_scored_calls: int = 8) -> dict:
    rep = conn.execute("SELECT rep_id, name, email FROM reps WHERE slug=?",
                       (slug,)).fetchone()
    stats = aggregate_stats(_rep_calls(conn, rep["rep_id"]), min_scored_calls)
    weaknesses = [
        {"weakness_type": r["label"], "frequency": round(r["frequency"], 2),
         "coaching_fix": r["coaching_fix"],
         "evidence": [q["evidence_quote"] for q in conn.execute(
             "SELECT DISTINCT cw.evidence_quote FROM call_weaknesses cw "
             "JOIN calls c ON c.call_id=cw.call_id "
             "WHERE c.rep_id=? AND cw.weak_id=? AND cw.evidence_quote IS NOT NULL "
             "LIMIT 3", (rep["rep_id"], r["weak_id"]))]}
        for r in conn.execute("""
          SELECT wt.weak_id, wt.label, rws.frequency, wt.coaching_fix
          FROM rep_weakness_summary rws JOIN weakness_types wt USING(weak_id)
          WHERE rws.rep_id=? ORDER BY rws.frequency DESC""", (rep["rep_id"],))]
    strengths = [r[0] for r in conn.execute(
        "SELECT DISTINCT biggest_strength FROM calls WHERE rep_id=? AND "
        "biggest_strength IS NOT NULL AND biggest_strength != '' LIMIT 3",
        (rep["rep_id"],))]
    coach_notes = [r[0] for r in conn.execute(
        "SELECT DISTINCT rudys_note FROM calls WHERE rep_id=? AND "
        "rudys_note IS NOT NULL AND rudys_note != '' LIMIT 3", (rep["rep_id"],))]
    return {
        "rep_name": rep["name"], "rep_email": rep["email"], "rep_slug": slug,
        "stats": stats, "recurring_weaknesses": weaknesses,
        "strengths": strengths, "coach_notes": coach_notes,
    }


def export_profiles(conn: sqlite3.Connection, out_dir: Path = PROFILES_DIR,
                    min_scored_calls: int = 8) -> int:
    out_dir.mkdir(parents=True, exist_ok=True)
    slugs = [r[0] for r in conn.execute("SELECT slug FROM reps")]
    for slug in slugs:
        prof = build_profile_dict(conn, slug, min_scored_calls)
        (out_dir / f"{slug}.yaml").write_text(
            yaml.safe_dump(prof, sort_keys=False, allow_unicode=True),
            encoding="utf-8")
    return len(slugs)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_cleaning.py -k "summary or profile_dict" -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add cleaned_data/db.py tests/test_cleaning.py
git commit -m "feat: summary tables, profile builder, drill query, YAML export"
```

---

## Task 10: OpenRouter embeddings + clustering

**Files:**
- Create: `cleaned_data/embeddings.py`
- Test: `tests/test_cleaning.py`

**Interfaces:**
- Consumes: `openai` client.
- Produces:
  - `make_client() -> openai.OpenAI` — configured for OpenRouter from env.
  - `embed_texts(texts: list[str], client, model: str | None = None) -> list[list[float]]` — batched embeddings.
  - `cluster_vectors(vectors: list[list[float]], min_cluster_size: int = 5) -> list[int]` — UMAP+HDBSCAN cluster labels (`-1` = noise). Falls back to no-UMAP when sample count is tiny.
  - `group_by_cluster(items: list[str], labels: list[int]) -> dict[int, list[str]]` — drops the `-1` noise cluster.

- [ ] **Step 1: Write the failing test** (clustering + grouping are testable without network)

Add to `tests/test_cleaning.py`:

```python
from cleaned_data import embeddings


def test_cluster_vectors_separates_two_blobs():
    import numpy as np
    rng = np.random.default_rng(0)
    a = rng.normal(0, 0.02, size=(15, 8)) + 0.0
    b = rng.normal(0, 0.02, size=(15, 8)) + 5.0
    vectors = np.vstack([a, b]).tolist()
    labels = embeddings.cluster_vectors(vectors, min_cluster_size=5)
    non_noise = {l for l in labels if l != -1}
    assert len(non_noise) >= 2


def test_group_by_cluster_drops_noise():
    grouped = embeddings.group_by_cluster(["x", "y", "z"], [0, 0, -1])
    assert grouped == {0: ["x", "y"]}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_cleaning.py -k "cluster or group_by" -v`
Expected: FAIL with `ModuleNotFoundError: cleaned_data.embeddings`.

- [ ] **Step 3: Write minimal implementation**

Create `cleaned_data/embeddings.py`:

```python
"""OpenRouter embeddings + UMAP/HDBSCAN clustering (offline notebook use)."""

from __future__ import annotations

import os

import numpy as np


def make_client():
    import openai
    return openai.OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=os.environ["OPENROUTER_API_KEY"],
    )


def embed_texts(texts: list[str], client, model: str | None = None,
                batch_size: int = 128) -> list[list[float]]:
    model = model or os.environ.get("REP_EMBED_MODEL", "openai/text-embedding-3-small")
    out: list[list[float]] = []
    for i in range(0, len(texts), batch_size):
        chunk = texts[i:i + batch_size]
        resp = client.embeddings.create(model=model, input=chunk)
        out.extend(d.embedding for d in resp.data)
    return out


def cluster_vectors(vectors: list[list[float]], min_cluster_size: int = 5) -> list[int]:
    import hdbscan
    x = np.asarray(vectors, dtype="float32")
    if len(x) >= 4 * min_cluster_size and x.shape[1] > 5:
        import umap
        n_comp = min(5, x.shape[1] - 1)
        x = umap.UMAP(n_components=n_comp, random_state=42).fit_transform(x)
    labels = hdbscan.HDBSCAN(min_cluster_size=min_cluster_size).fit_predict(x)
    return [int(v) for v in labels]


def group_by_cluster(items: list[str], labels: list[int]) -> dict[int, list[str]]:
    grouped: dict[int, list[str]] = {}
    for item, label in zip(items, labels):
        if label == -1:
            continue
        grouped.setdefault(label, []).append(item)
    return grouped
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_cleaning.py -k "cluster or group_by" -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add cleaned_data/embeddings.py tests/test_cleaning.py
git commit -m "feat: openrouter embeddings + umap/hdbscan clustering"
```

---

## Task 11: LLM labelling & classification (schema-validated)

**Files:**
- Create: `cleaned_data/clustering.py`
- Test: `tests/test_cleaning.py`

**Interfaces:**
- Consumes: an OpenAI-compatible `client` (real or fake with `.chat.completions.create`).
- Produces:
  - `LABEL_KEYS = ("label", "definition", "aliases", "coaching_fix")`.
  - `parse_label(content: str) -> dict` — parse+validate a cluster-label JSON; raises `ValueError` on missing keys.
  - `parse_classification(content: str, valid_ids: set[int]) -> dict` — validate `{weakness_ids: [...], objections: [{obj_id, handled, quote}]}`; drops ids not in `valid_ids`; `handled` ∈ {well, poorly, unclear}.
  - `label_cluster(phrases, client, model=None) -> dict` and `classify_call(text, taxonomy, client, model=None) -> dict` — call the LLM with `response_format={"type": "json_object"}`, retry once on `ValueError`.

- [ ] **Step 1: Write the failing test** (validators are pure; test them directly)

Add to `tests/test_cleaning.py`:

```python
import pytest
from cleaned_data import clustering


def test_parse_label_valid_and_invalid():
    good = '{"label":"accepts-stalls","definition":"d","aliases":["stall"],' \
           '"coaching_fix":"probe"}'
    parsed = clustering.parse_label(good)
    assert parsed["label"] == "accepts-stalls"
    with pytest.raises(ValueError):
        clustering.parse_label('{"label":"x"}')  # missing keys


def test_parse_classification_drops_unknown_ids_and_bad_handled():
    content = ('{"weakness_ids":[1,99],"objections":['
               '{"obj_id":2,"handled":"poorly","quote":"q"},'
               '{"obj_id":88,"handled":"nope","quote":"q"}]}')
    out = clustering.parse_classification(content, valid_ids={1, 2})
    assert out["weakness_ids"] == [1]           # 99 dropped
    assert len(out["objections"]) == 1          # obj 88 dropped
    assert out["objections"][0]["handled"] == "poorly"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_cleaning.py -k "parse_label or parse_classification" -v`
Expected: FAIL with `ModuleNotFoundError: cleaned_data.clustering`.

- [ ] **Step 3: Write minimal implementation**

Create `cleaned_data/clustering.py`:

```python
"""LLM cluster-labelling + per-call classification against a frozen taxonomy."""

from __future__ import annotations

import json
import os

LABEL_KEYS = ("label", "definition", "aliases", "coaching_fix")
_HANDLED = {"well", "poorly", "unclear"}


def parse_label(content: str) -> dict:
    data = json.loads(content)
    missing = [k for k in LABEL_KEYS if k not in data]
    if missing:
        raise ValueError(f"label JSON missing keys: {missing}")
    if not isinstance(data["aliases"], list):
        raise ValueError("aliases must be a list")
    return {k: data[k] for k in LABEL_KEYS}


def parse_classification(content: str, valid_ids: set[int]) -> dict:
    data = json.loads(content)
    weak = [i for i in data.get("weakness_ids", []) if i in valid_ids]
    objs = [
        {"obj_id": o["obj_id"], "handled": o["handled"], "quote": o.get("quote", "")}
        for o in data.get("objections", [])
        if o.get("obj_id") in valid_ids and o.get("handled") in _HANDLED
    ]
    return {"weakness_ids": weak, "objections": objs}


def _chat_json(client, model: str, prompt: str) -> str:
    resp = client.chat.completions.create(
        model=model, response_format={"type": "json_object"},
        messages=[{"role": "user", "content": prompt}],
    )
    return resp.choices[0].message.content


def _model(model: str | None) -> str:
    return model or os.environ.get("REP_PROFILE_MODEL", "openai/gpt-4o-mini")


def label_cluster(phrases: list[str], client, model: str | None = None) -> dict:
    prompt = (
        "You are naming a cluster of sales-call weakness/objection phrases. "
        "Return JSON with keys label (kebab-case), definition, aliases (list), "
        "coaching_fix. Phrases:\n- " + "\n- ".join(phrases[:40])
    )
    for attempt in range(2):
        try:
            return parse_label(_chat_json(client, _model(model), prompt))
        except ValueError:
            if attempt == 1:
                raise


def classify_call(text: str, taxonomy: list[dict], client,
                  model: str | None = None) -> dict:
    valid_ids = {t["id"] for t in taxonomy}
    catalog = "\n".join(f'{t["id"]}: {t["label"]}' for t in taxonomy)
    prompt = (
        "Given this fixed taxonomy (id: label):\n" + catalog +
        "\n\nClassify the call notes below. Return JSON: "
        '{"weakness_ids":[ids], "objections":[{"obj_id":id,'
        '"handled":"well|poorly|unclear","quote":"short quote"}]}. '
        "Only use ids from the taxonomy.\n\nNotes:\n" + text[:4000]
    )
    for attempt in range(2):
        try:
            return parse_classification(
                _chat_json(client, _model(model), prompt), valid_ids)
        except ValueError:
            if attempt == 1:
                raise
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_cleaning.py -k "parse_label or parse_classification" -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add cleaned_data/clustering.py tests/test_cleaning.py
git commit -m "feat: schema-validated LLM cluster-labelling + call classification"
```

---

## Task 12: Profile-quality evaluation

**Files:**
- Create: `cleaned_data/evaluate.py`
- Test: `tests/test_cleaning.py`

**Interfaces:**
- Consumes: profile dicts from `db.build_profile_dict`.
- Produces: `evaluate_profiles(profiles: list[dict]) -> dict` → `{evidence_coverage, coaching_fix_completeness, classification_coverage, n_profiles}` (fractions rounded to 2dp).

- [ ] **Step 1: Write the failing test**

Add to `tests/test_cleaning.py`:

```python
from cleaned_data import evaluate


def test_evaluate_profiles_metrics():
    profiles = [
        {"recurring_weaknesses": [
            {"evidence": ["a", "b"], "coaching_fix": "probe"},
            {"evidence": ["a"], "coaching_fix": ""}]},
        {"recurring_weaknesses": []},
    ]
    m = evaluate.evaluate_profiles(profiles)
    assert m["n_profiles"] == 2
    # 2 weaknesses total; 1 has >=2 evidence → 0.5
    assert m["evidence_coverage"] == 0.5
    # 1 of 2 has a non-empty coaching_fix → 0.5
    assert m["coaching_fix_completeness"] == 0.5
    # 1 of 2 profiles has >=1 weakness → 0.5
    assert m["classification_coverage"] == 0.5
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_cleaning.py -k evaluate_profiles -v`
Expected: FAIL with `ModuleNotFoundError: cleaned_data.evaluate`.

- [ ] **Step 3: Write minimal implementation**

Create `cleaned_data/evaluate.py`:

```python
"""Profile-quality rubric so export quality is measurable, not vibes."""

from __future__ import annotations


def evaluate_profiles(profiles: list[dict]) -> dict:
    weaknesses = [w for p in profiles for w in p.get("recurring_weaknesses", [])]
    n_w = len(weaknesses) or 1
    n_p = len(profiles) or 1
    ge2_evidence = sum(1 for w in weaknesses if len(w.get("evidence", [])) >= 2)
    has_fix = sum(1 for w in weaknesses if (w.get("coaching_fix") or "").strip())
    classified = sum(1 for p in profiles if p.get("recurring_weaknesses"))
    return {
        "n_profiles": len(profiles),
        "evidence_coverage": round(ge2_evidence / n_w, 2),
        "coaching_fix_completeness": round(has_fix / n_w, 2),
        "classification_coverage": round(classified / n_p, 2),
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_cleaning.py -k evaluate_profiles -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cleaned_data/evaluate.py tests/test_cleaning.py
git commit -m "feat: profile-quality evaluation rubric"
```

---

## Task 13: Full test-suite gate + ruff

**Files:**
- Test: `tests/test_cleaning.py` (no new tests; verification task)

- [ ] **Step 1: Run the whole suite**

Run: `uv run pytest tests/test_cleaning.py -v`
Expected: all tests PASS (Tasks 2–12).

- [ ] **Step 2: Lint & format**

Run: `uv run ruff format cleaned_data tests && uv run ruff check cleaned_data tests`
Expected: formatting applied; `ruff check` reports "All checks passed!" (fix any reported issue, then re-run).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: ruff format + lint clean for cleaned_data module"
```

---

## Task 14: Stage-1 notebook — clean → SQLite → propose taxonomies

**Files:**
- Create: `notebooks/cleaning.ipynb`

**Interfaces:**
- Consumes: everything in `cleaned_data.cleaning_utils`, `cleaned_data.db`, `cleaned_data.embeddings`, `cleaned_data.clustering`.
- Produces: populated `cleaned_data/rep_trainer.db` (reps + calls, empty taxonomy/link tables) and draft `cleaned_data/taxonomies/objection_types.yaml` + `weakness_types.yaml`.

This is an integration deliverable: the notebook wires tested functions and is verified by running end-to-end on the real CSV. Build it cell-by-cell.

- [ ] **Step 1: Cell 1 — imports & config**

```python
import csv, sys
from pathlib import Path
sys.path.insert(0, str(Path.cwd().parent))  # repo root on path
import cleaned_data as cd
from cleaned_data import cleaning_utils as cu, db, embeddings, clustering
csv.field_size_limit(10**9)
```

- [ ] **Step 2: Cell 2 — load + filter + normalize rows**

```python
rows = []
with open(cd.SCORECARD_CSV, encoding="utf-8-sig", newline="") as f:
    for r in csv.DictReader(f):
        if not cu.is_real_call(r):
            continue
        band, raw = cu.normalize_grade(r.get("grade", ""))
        name, email, slug = cu.canonicalize_rep(r.get("rep_name", ""),
                                                r.get("Rep Email", ""))
        rows.append({"row": r, "band": band, "raw": raw, "name": name,
                     "email": email, "slug": slug,
                     "has_num": cu.has_numeric_score(r)})
print(f"kept {len(rows)} real calls; "
      f"narrative-only (no numeric score): {sum(1 for x in rows if not x['has_num'])}")
```
Run the cell. Expected: prints ~3,957 kept and ~1,628 narrative-only.

- [ ] **Step 3: Cell 3 — build DB, load reps + calls**

```python
conn = db.connect(cd.DB_PATH)
db.create_schema(conn)
for x in rows:
    r = x["row"]
    rid = db.upsert_rep(conn, x["name"], x["email"], x["slug"])
    ts = (r.get("total_score") or "").strip()
    db.insert_call(conn, rid, {
        "client_name": r.get("client_name"), "call_date": r.get("call_date"),
        "show_name": r.get("show_name"), "meeting_id": r.get("meeting_id"),
        "total_score": float(ts) if ts else None,
        "grade_normalized": x["band"], "grade_raw": x["raw"],
        "close_ask": {True: 1, False: 0, None: None}[
            cu.parse_close_ask(r.get("did_rep_ask_for_close", ""))],
        "has_numeric_score": 1 if x["has_num"] else 0,
        "intended_outcome": r.get("intended_outcome"),
        "deal_outcome_context": r.get("deal_outcome_context"),
        "flagged_followup": r.get("Flagged For Follow-Up (AI)"),
        "one_line_verdict": r.get("one_line_verdict"),
        "biggest_strength": r.get("biggest_strength"),
        "what_went_well": r.get("what_went_well"),
        "what_made_close_work": r.get("what_made_this_close_work"),
        "what_to_improve": r.get("what_to_improve"),
        "why_no_close": r.get("why_no_close"), "red_flags": r.get("red_flags"),
        "coaching_tip": r.get("coaching_tip"),
        "rep_improvement": r.get("Rep Improvement Suggestions (AI)"),
        "rudys_note": r.get("rudys_note"),
        "objections_surfaced": r.get("objections_surfaced")})
print("reps:", conn.execute("SELECT COUNT(*) FROM reps").fetchone()[0],
      "calls:", conn.execute("SELECT COUNT(*) FROM calls").fetchone()[0])
```
Run. Expected: ~194 reps, ~3,957 calls.

- [ ] **Step 4: Cell 4 — extract phrases, embed, cluster, label → draft taxonomy YAML**

```python
import yaml
client = embeddings.make_client()

def propose(phrases, kind):
    vecs = embeddings.embed_texts(phrases, client)
    labels = embeddings.cluster_vectors(vecs, min_cluster_size=8)
    groups = embeddings.group_by_cluster(phrases, labels)
    out = []
    for i, (_, members) in enumerate(sorted(groups.items()), start=1):
        lab = clustering.label_cluster(members, client)
        out.append({"id": i, **lab, "n_examples": len(members),
                    "example_quotes": members[:3]})
    cd.TAXONOMY_DIR.mkdir(parents=True, exist_ok=True)
    (cd.TAXONOMY_DIR / f"{kind}.yaml").write_text(
        yaml.safe_dump(out, sort_keys=False, allow_unicode=True), encoding="utf-8")
    print(f"{kind}: {len(out)} clusters from {len(phrases)} phrases")
    return out

obj_phrases, weak_phrases = [], []
for c in conn.execute("SELECT objections_surfaced, what_to_improve, why_no_close, "
                      "red_flags FROM calls"):
    obj_phrases += cu.extract_objection_phrases(c["objections_surfaced"] or "")
    blob = cu.pool_weakness_text(dict(c))
    if blob:
        weak_phrases.append(blob)

propose(obj_phrases, "objection_types")
propose(weak_phrases, "weakness_types")
```
Run (needs `OPENROUTER_API_KEY`). Expected: two YAML files written; prints cluster counts.

- [ ] **Step 5: Verify artifacts, then commit the notebook (NOT the DB or key)**

Run: `uv run python -c "import cleaned_data as cd, yaml; print(len(yaml.safe_load(open(cd.TAXONOMY_DIR/'weakness_types.yaml'))), 'weakness clusters')"`
Expected: prints a positive cluster count.

Ensure `.gitignore` excludes generated data and secrets:
```bash
printf '\ncleaned_data/rep_trainer.db\ncleaned_data/rep_profiles/\n.env\n' >> .gitignore
git add notebooks/cleaning.ipynb .gitignore cleaned_data/taxonomies/
git commit -m "feat: stage-1 cleaning notebook + draft taxonomies"
```

---

## Task 15: Stage-2 notebook — classify → export → evaluate

**Files:**
- Create: `notebooks/taxonomy_studio.ipynb`

**Interfaces:**
- Consumes: the human-reviewed `taxonomies/*.yaml`, `cleaned_data.db`, `cleaned_data.clustering`, `cleaned_data.evaluate`.
- Produces: populated `objection_types` / `weakness_types` / `call_objections` / `call_weaknesses` tables, refreshed summary tables, `export_meta` row, `cleaned_data/rep_profiles/*.yaml`, printed evaluation report + `team_weakness_ranking`.

This notebook runs **after a human has reviewed/edited** the taxonomy YAML.

- [ ] **Step 1: Cell 1 — load frozen taxonomy into DB**

```python
import sys, json, subprocess
from pathlib import Path
sys.path.insert(0, str(Path.cwd().parent))
import yaml
import cleaned_data as cd
from cleaned_data import db, clustering, evaluate, cleaning_utils as cu

conn = db.connect(cd.DB_PATH)
obj = yaml.safe_load((cd.TAXONOMY_DIR / "objection_types.yaml").read_text("utf-8"))
weak = yaml.safe_load((cd.TAXONOMY_DIR / "weakness_types.yaml").read_text("utf-8"))
conn.execute("DELETE FROM objection_types"); conn.execute("DELETE FROM weakness_types")
for o in obj:
    conn.execute("INSERT INTO objection_types(obj_id,label,definition,aliases) "
                 "VALUES(?,?,?,?)", (o["id"], o["label"], o["definition"],
                                     json.dumps(o.get("aliases", []))))
for w in weak:
    conn.execute("INSERT INTO weakness_types(weak_id,label,definition,coaching_fix) "
                 "VALUES(?,?,?,?)", (w["id"], w["label"], w["definition"],
                                     w["coaching_fix"]))
conn.commit()
print("taxonomy loaded:", len(obj), "objections,", len(weak), "weaknesses")
```

- [ ] **Step 2: Cell 2 — classify every call against the frozen taxonomy**

```python
from cleaned_data import embeddings
llm = embeddings.make_client()  # OpenRouter client, reused for classification
obj_tax = [{"id": o["id"], "label": o["label"]} for o in obj]
weak_tax = [{"id": w["id"], "label": w["label"]} for w in weak]

conn.execute("DELETE FROM call_objections"); conn.execute("DELETE FROM call_weaknesses")
for c in conn.execute("SELECT call_id, objections_surfaced, what_to_improve, "
                      "why_no_close, red_flags FROM calls").fetchall():
    text = " | ".join(filter(None, [c["objections_surfaced"],
        cu.pool_weakness_text(dict(c))]))
    if not text.strip():
        continue
    res = clustering.classify_call(text, obj_tax + weak_tax, llm)
    for wid in res["weakness_ids"]:
        if any(w["id"] == wid for w in weak):
            conn.execute("INSERT INTO call_weaknesses(call_id,weak_id,evidence_quote)"
                         " VALUES(?,?,?)", (c["call_id"], wid, text[:200]))
    for o_ in res["objections"]:
        if any(t["id"] == o_["obj_id"] for t in obj):
            conn.execute("INSERT INTO call_objections(call_id,obj_id,handled,quote)"
                         " VALUES(?,?,?,?)", (c["call_id"], o_["obj_id"],
                                              o_["handled"], o_["quote"]))
conn.commit()
print("classified:", conn.execute("SELECT COUNT(*) FROM call_weaknesses").fetchone()[0],
      "weakness links")
```

- [ ] **Step 3: Cell 3 — refresh summaries, export profiles, write export_meta**

```python
db.refresh_summary_tables(conn)
n = db.export_profiles(conn, cd.PROFILES_DIR)
sha = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True,
                     text=True).stdout.strip()
counts = {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
          for t in ["reps", "calls", "call_weaknesses", "call_objections"]}
conn.execute("INSERT INTO export_meta(generated_at,taxonomy_version,model_used,"
             "git_sha,row_counts_json) VALUES(datetime('now'),?,?,?,?)",
             ("v1", "openai/gpt-4o-mini", sha, json.dumps(counts)))
conn.commit()
print(f"exported {n} profiles")
```

- [ ] **Step 4: Cell 4 — evaluation report + team weakness ranking**

```python
profiles = [db.build_profile_dict(conn, r[0]) for r in
            conn.execute("SELECT slug FROM reps")]
print("QUALITY:", evaluate.evaluate_profiles(profiles))
print("\nTEAM WEAKNESS RANKING:")
for row in conn.execute("SELECT wt.label, twr.rep_count, twr.call_count "
                        "FROM team_weakness_ranking twr "
                        "JOIN weakness_types wt USING(weak_id) "
                        "ORDER BY twr.call_count DESC"):
    print(f"  {row['call_count']:5d} calls / {row['rep_count']:3d} reps  {row['label']}")
```

- [ ] **Step 5: Run end-to-end, verify a profile, commit the notebook**

Run: `uv run python -c "import cleaned_data as cd, yaml, os; p=sorted(os.listdir(cd.PROFILES_DIR))[0]; print(yaml.safe_load(open(cd.PROFILES_DIR/p, encoding='utf-8'))['rep_slug'])"`
Expected: prints a rep slug from an exported profile.

```bash
git add notebooks/taxonomy_studio.ipynb
git commit -m "feat: stage-2 taxonomy-studio notebook — classify, export, evaluate"
```

---

## Self-Review Notes (completed)

- **Spec coverage:** filtering fix (Task 3), grade normalization (Task 2), close-ask/numeric flag (Task 4), rep canonicalization (Task 5), phrase extraction (Task 6), stats (Task 7), schema incl. `export_meta` + summary + persona tables (Task 8), summary/profile/drill/export (Task 9), OpenRouter embeddings + clustering (Task 10), schema-validated LLM labelling/classification with `handled` field (Task 11), evaluation rubric (Task 12), two-notebook human-gate pipeline (Tasks 14–15), dependency group + no-torch (Task 1). All spec sections map to a task.
- **Type consistency:** `get_rep_drill_plan`, `build_profile_dict`, `refresh_summary_tables`, `export_profiles`, `classify_call(text, taxonomy, client)`, `label_cluster(phrases, client)`, `evaluate_profiles(profiles)` names are used identically across tasks and notebooks.
- **Grade-band ordering / `min_scored_calls`=8** are the two team-confirmable open items from the spec; defaults are hard-coded and overridable.
