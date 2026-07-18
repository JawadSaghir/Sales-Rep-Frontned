# Config & Data API (Spec A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A FastAPI backend that serves the real rep-trainer data (personas/call-types/difficulties from `prompts/*.yaml`; rep profiles/analytics aggregated from `data/cleaned_data/*.csv`) and hands off live roleplay to the existing LiveKit voice agent, plus a typed frontend client replacing the hardcoded `lib/data.ts`.

**Architecture:** New `api/` package: catalog routers read YAML via `src/bot_config.py`; `rep_store`/`objection_store` aggregate the CSV exports; `session_store` (standalone SQLite) + `livekit_session` create a room + mint a join token on session start. All responses use an `ApiResponse` envelope. The SQLite `cleaned_data/` package is removed.

**Tech Stack:** Python ≥3.10, `uv`, `fastapi`, `uvicorn[standard]`, stdlib `csv`/`sqlite3`, `pyyaml`, `livekit-api` (via `livekit-agents`), `pytest` + `TestClient`. Frontend: Next.js 14 + TypeScript.

## Global Constraints

- Python `>=3.10, <3.15`; run via `uv`. Ruff line-length 88, double quotes, type-annotate signatures.
- Run tests with `./.venv/Scripts/python.exe -m pytest` (system `python` shim is broken; `uv run` slow).
- `fastapi` + `uvicorn[standard]` go in a NEW `[dependency-groups] api` group — NOT runtime deps.
- **No auth v1** — rep identified by profile `slug` in requests.
- All HTTP responses use `ApiResponse = {success: bool, data: T | None, error: str | None}`.
- Data sources: `prompts/*.yaml` (catalog), `data/cleaned_data/Sale-Rep-Profile.csv` (reps),
  `data/cleaned_data/Objection_data.csv` (analytics), standalone `data/sessions.db` (sessions).
  No SQLite `cleaned_data/db.py`, no `rep_trainer.db`.
- Treat CSV values `"None"`, `"Unknown"`, `"N/A"`, `""`, `"[]"` (case-insensitive) as empty.
- Never read the 78 MB real CSV in tests — use tiny fixture CSVs.
- Secrets (LiveKit key/secret) only from env; never returned in responses/errors.
- Grade bands (low→high): `weak < needs_improvement < developing < good < strong < elite`.
- Real CSV columns — `Sale-Rep-Profile.csv`: `rep_name, grade, total_score, no_show, client_name,
  coaching_tip, what_to_improve, why_no_close, biggest_strength, objections_surfaced,
  one_line_verdict, meeting_title, show_name` (+ others). `Objection_data.csv`: `objection_type,
  objections_surfaced, why_no_close, what_to_improve, red_flags`.

---

## File Structure

- `pyproject.toml` — add `[dependency-groups] api`.
- `api/__init__.py`, `api/settings.py`, `api/schemas.py`, `api/main.py`
- `api/rep_store.py` — CSV read + per-rep aggregation (pure over row lists)
- `api/objection_store.py` — objection CSV → ranking
- `api/session_store.py` — standalone SQLite session persistence
- `api/livekit_session.py` — room-metadata builder + token mint + room create
- `api/routers/{catalog,reps,analytics,sessions}.py`
- `src/bot_config.py` — add `list_layer_slugs`
- `tests/test_api.py` — API + store tests (fixtures; LiveKit mocked)
- `frontend/lib/api.ts` (+ edits to `app/page.tsx`, `app/roleplay/page.tsx`, `lib/data.ts`)

---

## Task 1: Reorg cleanup — remove `cleaned_data/` and its tests

**Files:**
- Delete: `cleaned_data/` (whole package), `tests/test_cleaning.py`
- Modify: `tests/test_bot_config.py` (remove `cleaned_data.db` imports + tests)

**Interfaces:** none produced; unblocks a clean `pytest` collection (test_bot_config.py currently
fails to import because `cleaned_data` is gone from the working tree).

- [ ] **Step 1: Stage the intentional package deletion**

Run: `git rm -r cleaned_data && git rm tests/test_cleaning.py`
Expected: git stages deletion of `cleaned_data/*.py` and `tests/test_cleaning.py`.

- [ ] **Step 2: Trim `tests/test_bot_config.py`**

Remove the top-level `from cleaned_data import db` (and any `import` of it), and delete every test
function that references `db.` (the schema/roundtrip/summary/profile/export tests that came from the
old data layer). KEEP all tests that exercise `src.bot_config` and `src.bot_extract` /
`src.bot_enrich` only (load_layer, build_bot_prompt, difficulty_framing, scorecard, row_to_layers,
parse_enrichment, etc.). Also remove now-unused imports (`yaml`, `SimpleNamespace`) if nothing else
uses them.

- [ ] **Step 3: Verify the trimmed suite collects and passes**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_bot_config.py -q`
Expected: collects with NO import error; all remaining bot-config/extract/enrich/scorecard tests PASS.

- [ ] **Step 4: Ruff + commit**

```bash
./.venv/Scripts/python.exe -m ruff check tests/test_bot_config.py
git add -A tests/test_bot_config.py
git commit -m "chore: remove cleaned_data package + its tests (pivot to CSV data layer)"
```

---

## Task 2: Deps, api scaffold, settings, ApiResponse, app + health

**Files:**
- Modify: `pyproject.toml`
- Create: `api/__init__.py`, `api/settings.py`, `api/schemas.py`, `api/main.py`
- Test: `tests/test_api.py`

**Interfaces:**
- Produces: `api.schemas.ApiResponse` (generic-ish dict builder `ok(data)` / `fail(error)`);
  `api.settings.Settings` with `rep_csv`, `objection_csv`, `sessions_db`, `prompts_dir`,
  `cors_origins`, `livekit_url/key/secret`; `api.main.app` (FastAPI); `GET /api/health`.

- [ ] **Step 1: Add the dependency group to `pyproject.toml`**

```toml
[dependency-groups]
api = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.30",
]
```
(Add alongside existing groups; leave `dev`/`data` untouched.) Then run `uv sync --group api`.

- [ ] **Step 2: Write the failing test**

Create `tests/test_api.py`:

```python
from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)


def test_health_ok():
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert body["data"]["status"] == "ok"
```

- [ ] **Step 3: Run test to verify it fails**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_api.py -k health -v`
Expected: FAIL — `ModuleNotFoundError: api.main`.

- [ ] **Step 4: Implement scaffold**

`api/__init__.py`: `"""FastAPI config & data API for the rep-trainer frontend."""`

`api/settings.py`:
```python
"""Runtime settings from environment, with repo-relative defaults."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Settings:
    rep_csv: Path
    objection_csv: Path
    sessions_db: Path
    prompts_dir: Path
    cors_origins: tuple[str, ...]
    livekit_url: str
    livekit_key: str
    livekit_secret: str


def load_settings() -> Settings:
    data = _ROOT / "data" / "cleaned_data"
    origins = os.environ.get("API_CORS_ORIGINS", "http://localhost:3000")
    return Settings(
        rep_csv=Path(os.environ.get("REP_CSV", data / "Sale-Rep-Profile.csv")),
        objection_csv=Path(os.environ.get("OBJECTION_CSV", data / "Objection_data.csv")),
        sessions_db=Path(os.environ.get("SESSIONS_DB", _ROOT / "data" / "sessions.db")),
        prompts_dir=Path(os.environ.get("PROMPTS_DIR", _ROOT / "prompts")),
        cors_origins=tuple(o.strip() for o in origins.split(",") if o.strip()),
        livekit_url=os.environ.get("LIVEKIT_URL", ""),
        livekit_key=os.environ.get("LIVEKIT_API_KEY", ""),
        livekit_secret=os.environ.get("LIVEKIT_API_SECRET", ""),
    )
```

`api/schemas.py`:
```python
"""Response envelope helpers."""

from __future__ import annotations

from typing import Any


def ok(data: Any) -> dict:
    return {"success": True, "data": data, "error": None}


def fail(error: str) -> dict:
    return {"success": False, "data": None, "error": error}
```

`api/main.py`:
```python
"""FastAPI app: CORS, routers, health, and a uniform error envelope."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.schemas import fail, ok
from api.settings import load_settings

settings = load_settings()
app = FastAPI(title="Rep Trainer Config & Data API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exc_handler(_: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content=fail(str(exc.detail)))


@app.get("/api/health")
def health() -> dict:
    return ok({"status": "ok"})
```

- [ ] **Step 5: Run test to verify it passes**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_api.py -k health -v`
Expected: PASS.

- [ ] **Step 6: Ruff + commit**

```bash
./.venv/Scripts/python.exe -m ruff check api tests/test_api.py
git add pyproject.toml uv.lock api tests/test_api.py
git commit -m "feat: api scaffold — settings, ApiResponse envelope, CORS, health"
```

---

## Task 3: `list_layer_slugs` + catalog router

**Files:**
- Modify: `src/bot_config.py`
- Create: `api/routers/catalog.py`
- Modify: `api/main.py` (include router)
- Test: `tests/test_api.py`

**Interfaces:**
- Consumes: `bot_config.load_layer`, `bot_config.LAYER_DIRS`, `PROMPTS_DIR`.
- Produces: `bot_config.list_layer_slugs(kind, prompts_dir=PROMPTS_DIR) -> list[str]`;
  routes `GET /api/call-types`, `/api/personas`, `/api/difficulties`.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_api.py`:

```python
def test_call_types_lists_real_yaml():
    r = client.get("/api/call-types")
    assert r.status_code == 200
    slugs = {c["slug"] for c in r.json()["data"]}
    assert {"closing", "discovery", "follow_up"} <= slugs
    closing = next(c for c in r.json()["data"] if c["slug"] == "closing")
    assert closing["locked"] is False and closing["label"]


def test_personas_and_difficulties():
    personas = client.get("/api/personas").json()["data"]
    assert any(p["slug"] == "april-alvarado-closing" for p in personas)
    diffs = {d["level"] for d in client.get("/api/difficulties").json()["data"]}
    assert {"easy", "medium", "hard"} <= diffs
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_api.py -k "call_types or personas_and" -v`
Expected: FAIL — 404 (routes not registered).

- [ ] **Step 3: Add `list_layer_slugs` to `src/bot_config.py`**

```python
def list_layer_slugs(kind: str, prompts_dir: Path = PROMPTS_DIR) -> list[str]:
    """List available slugs (YAML stems) for a layer kind, sorted."""
    if kind not in LAYER_DIRS:
        raise KeyError(f"unknown layer kind: {kind!r}")
    d = Path(prompts_dir) / LAYER_DIRS[kind]
    if not d.is_dir():
        return []
    return sorted(p.stem for p in d.glob("*.yaml"))
```

- [ ] **Step 4: Create `api/routers/catalog.py`**

```python
"""Catalog endpoints: call-types, buyer personas, difficulties (from prompts/*.yaml)."""

from __future__ import annotations

import sys
from pathlib import Path

from fastapi import APIRouter

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))  # repo root for `src`
from src import bot_config  # noqa: E402

from api.schemas import ok  # noqa: E402

router = APIRouter(prefix="/api")


def _label(slug: str) -> str:
    return slug.replace("_", " ").replace("-", " ").title()


@router.get("/call-types")
def call_types() -> dict:
    out = []
    for slug in bot_config.list_layer_slugs("call_types"):
        ct = bot_config.load_layer("call_types", slug)
        out.append({"slug": slug, "label": _label(slug), "locked": False,
                    "rep_objective": ct.get("rep_objective", "")})
    return ok(out)


@router.get("/difficulties")
def difficulties() -> dict:
    out = []
    for slug in bot_config.list_layer_slugs("difficulty"):
        d = bot_config.load_layer("difficulty", slug)
        out.append({"level": d.get("level", slug),
                    "skepticism_baseline": d.get("skepticism_baseline", "")})
    return ok(out)


@router.get("/personas")
def personas() -> dict:
    out = []
    for slug in bot_config.list_layer_slugs("bots"):
        bot = bot_config.load_layer("bots", slug)
        persona = bot_config.load_layer("personas", bot["persona"])
        obj = bot_config.load_layer("objection_cards", bot["objection_card"])
        out.append({
            "slug": slug,
            "character_name": persona.get("character_name", ""),
            "business_name": persona.get("business_name", ""),
            "industry": persona.get("industry", ""),
            "primary_objection": obj.get("primary", ""),
        })
    return ok(out)
```

- [ ] **Step 5: Register the router in `api/main.py`**

Add after the health route:
```python
from api.routers import catalog  # noqa: E402

app.include_router(catalog.router)
```

- [ ] **Step 6: Run tests + ruff + commit**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_api.py -k "call_types or personas_and" -v` → PASS.
```bash
./.venv/Scripts/python.exe -m ruff check src/bot_config.py api
git add src/bot_config.py api tests/test_api.py
git commit -m "feat: catalog endpoints (call-types, personas, difficulties) + list_layer_slugs"
```

---

## Task 4: `rep_store` — CSV aggregation (pure)

**Files:**
- Create: `api/rep_store.py`
- Test: `tests/test_api.py`

**Interfaces:**
- Produces: `clean(v)->str`, `slugify(name)->str`, `safe_float(v)->float|None`,
  `normalize_grade(raw)->str|None`, `rep_summaries(rows)->list[dict]`,
  `rep_profile(rows, slug)->dict|None`, `rep_drill_plan(rows, slug)->list[dict]`,
  `load_rows(csv_path)->list[dict]`. Rows are CSV dict rows keyed by the real columns.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_api.py`:

```python
from api import rep_store

_ROWS = [
    {"rep_name": "Adam Pellegrino", "grade": "B", "total_score": "70", "no_show": "no",
     "coaching_tip": "Introduce same-day savings.", "what_to_improve": "Anchor price sooner.",
     "why_no_close": "Logistics gap.", "biggest_strength": "Clear value walk.",
     "objections_surfaced": "Contract-review concern."},
    {"rep_name": "Adam Pellegrino", "grade": "A", "total_score": "90", "no_show": "no",
     "coaching_tip": "Lock the deposit.", "what_to_improve": "Ask for the close.",
     "why_no_close": "", "biggest_strength": "Strong rapport.", "objections_surfaced": "Price."},
    {"rep_name": "Bea Ortiz", "grade": "N/A", "total_score": "N/A", "no_show": "no",
     "what_to_improve": "Slow down.", "coaching_tip": "Breathe."},
]


def test_rep_summaries_group_and_normalize():
    s = {r["slug"]: r for r in rep_store.rep_summaries(_ROWS)}
    adam = s["adam-pellegrino"]
    assert adam["name"] == "Adam Pellegrino"
    assert adam["calls"] == 2
    assert adam["avg_total_score"] == 80.0
    assert adam["grade_normalized"] in {"good", "strong", "elite"}
    # Bea has only junk total_score → avg None, still listed
    assert s["bea-ortiz"]["avg_total_score"] is None


def test_rep_profile_and_drill_plan():
    prof = rep_store.rep_profile(_ROWS, "adam-pellegrino")
    assert prof["name"] == "Adam Pellegrino"
    assert "Anchor price sooner." in prof["what_to_improve"]
    assert rep_store.rep_profile(_ROWS, "nobody") is None
    plan = rep_store.rep_drill_plan(_ROWS, "adam-pellegrino")
    assert plan and "focus" in plan[0] and "coaching_tip" in plan[0]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_api.py -k "rep_summaries or rep_profile" -v`
Expected: FAIL — `ModuleNotFoundError: api.rep_store`.

- [ ] **Step 3: Implement `api/rep_store.py`**

```python
"""Read Sale-Rep-Profile.csv (row-per-call) and aggregate per rep_name. Pure over row lists."""

from __future__ import annotations

import csv
import re
from collections import Counter
from pathlib import Path
from statistics import mean

_EMPTY = {"", "none", "unknown", "n/a", "[]"}
GRADE_BANDS = ["weak", "needs_improvement", "developing", "good", "strong", "elite"]
_GRADE_MAP = {
    "a+": "elite", "a": "elite", "a-": "strong", "b+": "strong", "b": "good",
    "b-": "developing", "c+": "developing", "c": "needs_improvement",
    "c-": "needs_improvement", "d+": "needs_improvement", "d": "weak", "d-": "weak",
    "f": "weak", "elite": "elite", "strong": "strong", "good": "good",
    "developing": "developing", "needs improvement": "needs_improvement",
    "needs work": "needs_improvement", "weak": "weak",
}
_SLUG_RE = re.compile(r"[^a-z0-9]+")


def clean(v: str) -> str:
    v = (v or "").strip()
    return "" if v.lower() in _EMPTY else v


def slugify(name: str) -> str:
    return _SLUG_RE.sub("-", (name or "").lower()).strip("-")


def safe_float(v: str) -> float | None:
    try:
        return float(clean(v))
    except (TypeError, ValueError):
        return None


def normalize_grade(raw: str) -> str | None:
    key = clean(raw).lower().replace("−", "-").replace("–", "-").replace("—", "-")
    return _GRADE_MAP.get(key)


def load_rows(csv_path: str | Path) -> list[dict]:
    p = Path(csv_path)
    if not p.is_file():
        return []
    csv.field_size_limit(10**9)
    with open(p, encoding="utf-8-sig", newline="") as f:
        return [r for r in csv.DictReader(f)
                if clean(r.get("rep_name")) and clean(r.get("no_show")).lower()
                not in {"yes", "true"}]


def _by_rep(rows: list[dict], slug: str) -> list[dict]:
    return [r for r in rows if slugify(r.get("rep_name", "")) == slug]


def rep_summaries(rows: list[dict]) -> list[dict]:
    reps: dict[str, list[dict]] = {}
    for r in rows:
        reps.setdefault(slugify(r.get("rep_name", "")), []).append(r)
    out = []
    for slug, rs in sorted(reps.items()):
        scores = [safe_float(r.get("total_score")) for r in rs]
        scores = [s for s in scores if s is not None]
        bands = [b for b in (normalize_grade(r.get("grade", "")) for r in rs) if b]
        out.append({
            "slug": slug,
            "name": rs[0].get("rep_name", "").strip(),
            "calls": len(rs),
            "avg_total_score": round(mean(scores), 1) if scores else None,
            "grade_normalized": (
                max(Counter(bands), key=lambda b: (Counter(bands)[b], GRADE_BANDS.index(b)))
                if bands else None
            ),
        })
    return out


def _snippets(rs: list[dict], field: str, limit: int = 5) -> list[str]:
    seen, out = set(), []
    for r in rs:
        v = clean(r.get(field))
        if v and v not in seen:
            seen.add(v)
            out.append(v)
        if len(out) >= limit:
            break
    return out


def rep_profile(rows: list[dict], slug: str) -> dict | None:
    rs = _by_rep(rows, slug)
    if not rs:
        return None
    summary = next(s for s in rep_summaries(rs) if s["slug"] == slug)
    return {
        **summary,
        "what_to_improve": _snippets(rs, "what_to_improve"),
        "coaching_tip": _snippets(rs, "coaching_tip"),
        "why_no_close": _snippets(rs, "why_no_close"),
        "biggest_strength": _snippets(rs, "biggest_strength"),
        "objections_surfaced": _snippets(rs, "objections_surfaced"),
    }


def rep_drill_plan(rows: list[dict], slug: str) -> list[dict]:
    rs = _by_rep(rows, slug)
    plan = []
    for r in rs:
        focus = clean(r.get("what_to_improve"))
        if focus:
            plan.append({"focus": focus, "evidence": clean(r.get("why_no_close")),
                         "coaching_tip": clean(r.get("coaching_tip"))})
        if len(plan) >= 3:
            break
    return plan
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_api.py -k "rep_summaries or rep_profile" -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Ruff + commit**

```bash
./.venv/Scripts/python.exe -m ruff check api/rep_store.py tests/test_api.py
git add api/rep_store.py tests/test_api.py
git commit -m "feat: rep_store — per-rep aggregation from Sale-Rep-Profile.csv"
```

---

## Task 5: reps router

**Files:**
- Create: `api/routers/reps.py`
- Modify: `api/main.py`
- Test: `tests/test_api.py`

**Interfaces:**
- Consumes: `api.rep_store`, `api.settings`. Produces routes `/api/reps`, `/api/reps/{slug}`,
  `/api/reps/{slug}/drill-plan`. Reads `settings.rep_csv`; missing file → `[]`.

- [ ] **Step 1: Write the failing test** (uses a fixture CSV via env override)

Append to `tests/test_api.py`:

```python
import csv as _csv


def _write_rep_csv(path):
    cols = ["rep_name", "grade", "total_score", "no_show", "what_to_improve",
            "coaching_tip", "why_no_close", "biggest_strength", "objections_surfaced"]
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = _csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerow({"rep_name": "Adam Pellegrino", "grade": "B", "total_score": "70",
                    "no_show": "no", "what_to_improve": "Anchor price sooner.",
                    "coaching_tip": "Same-day savings.", "why_no_close": "Logistics.",
                    "biggest_strength": "Value walk.", "objections_surfaced": "Contract."})


def test_reps_endpoints(tmp_path, monkeypatch):
    csv_path = tmp_path / "rep.csv"
    _write_rep_csv(csv_path)
    monkeypatch.setenv("REP_CSV", str(csv_path))
    from importlib import reload
    from api import settings as s, main as m
    reload(s); reload(m)
    c = TestClient(m.app)
    reps = c.get("/api/reps").json()["data"]
    assert any(r["slug"] == "adam-pellegrino" for r in reps)
    assert c.get("/api/reps/adam-pellegrino").json()["data"]["name"] == "Adam Pellegrino"
    assert c.get("/api/reps/nobody").status_code == 404
    assert c.get("/api/reps/adam-pellegrino/drill-plan").json()["data"][0]["focus"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_api.py -k reps_endpoints -v`
Expected: FAIL — 404.

- [ ] **Step 3: Create `api/routers/reps.py`**

```python
"""Rep endpoints — aggregated from the Sale-Rep-Profile CSV."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from api import rep_store
from api.schemas import ok
from api.settings import load_settings

router = APIRouter(prefix="/api")


def _rows() -> list[dict]:
    return rep_store.load_rows(load_settings().rep_csv)


@router.get("/reps")
def reps() -> dict:
    return ok(rep_store.rep_summaries(_rows()))


@router.get("/reps/{slug}")
def rep_detail(slug: str) -> dict:
    prof = rep_store.rep_profile(_rows(), slug)
    if prof is None:
        raise HTTPException(status_code=404, detail=f"no rep {slug!r}")
    return ok(prof)


@router.get("/reps/{slug}/drill-plan")
def drill_plan(slug: str) -> dict:
    return ok(rep_store.rep_drill_plan(_rows(), slug))
```

- [ ] **Step 4: Register router in `api/main.py`**

```python
from api.routers import catalog, reps  # noqa: E402

app.include_router(catalog.router)
app.include_router(reps.router)
```

- [ ] **Step 5: Run test + ruff + commit**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_api.py -k reps_endpoints -v` → PASS.
```bash
./.venv/Scripts/python.exe -m ruff check api tests/test_api.py
git add api tests/test_api.py
git commit -m "feat: reps endpoints (list, profile, drill-plan) over CSV"
```

---

## Task 6: `objection_store` + analytics router

**Files:**
- Create: `api/objection_store.py`, `api/routers/analytics.py`
- Modify: `api/main.py`
- Test: `tests/test_api.py`

**Interfaces:**
- Produces: `objection_store.team_ranking(rows)->list[dict]` (`[{objection_type, count}]` desc),
  `objection_store.load_rows(csv_path)->list[dict]`; route `/api/analytics/team-weaknesses`.

- [ ] **Step 1: Write the failing test**

```python
from api import objection_store


def test_team_ranking():
    rows = [{"objection_type": "Legal/Contract"}, {"objection_type": "Price"},
            {"objection_type": "Price"}, {"objection_type": ""}]
    ranking = objection_store.team_ranking(rows)
    assert ranking[0] == {"objection_type": "Price", "count": 2}
    assert all(r["objection_type"] for r in ranking)  # blanks dropped
```

- [ ] **Step 2: Run to verify it fails**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_api.py -k team_ranking -v`
Expected: FAIL — `ModuleNotFoundError: api.objection_store`.

- [ ] **Step 3: Implement**

`api/objection_store.py`:
```python
"""Read Objection_data.csv → objection-type ranking. Pure over row lists."""

from __future__ import annotations

import csv
from collections import Counter
from pathlib import Path

from api.rep_store import clean


def load_rows(csv_path: str | Path) -> list[dict]:
    p = Path(csv_path)
    if not p.is_file():
        return []
    csv.field_size_limit(10**9)
    with open(p, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def team_ranking(rows: list[dict]) -> list[dict]:
    counts = Counter(clean(r.get("objection_type")) for r in rows)
    counts.pop("", None)
    return [{"objection_type": k, "count": n} for k, n in counts.most_common()]
```

`api/routers/analytics.py`:
```python
"""Analytics endpoints — team objection ranking from Objection_data.csv."""

from __future__ import annotations

from fastapi import APIRouter

from api import objection_store
from api.schemas import ok
from api.settings import load_settings

router = APIRouter(prefix="/api")


@router.get("/analytics/team-weaknesses")
def team_weaknesses() -> dict:
    rows = objection_store.load_rows(load_settings().objection_csv)
    return ok(objection_store.team_ranking(rows))
```

Register in `api/main.py`: `from api.routers import catalog, reps, analytics` and
`app.include_router(analytics.router)`.

- [ ] **Step 4: Run + ruff + commit**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_api.py -k team_ranking -v` → PASS.
```bash
./.venv/Scripts/python.exe -m ruff check api tests/test_api.py
git add api tests/test_api.py
git commit -m "feat: analytics endpoint — team objection ranking from CSV"
```

---

## Task 7: sessions — store, LiveKit handoff, router

**Files:**
- Create: `api/session_store.py`, `api/livekit_session.py`, `api/routers/sessions.py`
- Modify: `api/main.py`
- Test: `tests/test_api.py`

**Interfaces:**
- `session_store.connect(path)`, `create_session(conn, rec: dict)`, `get_session(conn, sid)->dict|None`.
- `livekit_session.build_room_metadata(session_id, rep_slug, bot_slug, difficulty)->str` (JSON, pure);
  `mint_token(room, identity, settings)->str`; `async create_room(room, metadata, settings)`.
- Routes: `POST /api/sessions` (validate against catalog; 400 on unknown), `GET /api/sessions/{id}` (404).

- [ ] **Step 1: Write the failing tests** (LiveKit mocked; deterministic session id via monkeypatch)

```python
def test_build_room_metadata_is_json():
    import json
    from api import livekit_session
    md = livekit_session.build_room_metadata("s1", "adam-pellegrino", "april-alvarado-closing", "medium")
    assert json.loads(md) == {"session_id": "s1", "rep_slug": "adam-pellegrino",
                              "bot_slug": "april-alvarado-closing", "difficulty": "medium"}


def test_post_session_happy_and_validation(tmp_path, monkeypatch):
    monkeypatch.setenv("SESSIONS_DB", str(tmp_path / "s.db"))
    from importlib import reload
    from api import settings as s, main as m
    from api import livekit_session
    reload(s); reload(m)
    monkeypatch.setattr(livekit_session, "mint_token", lambda *a, **k: "tok_123")

    async def _fake_create_room(*a, **k):
        return None
    monkeypatch.setattr(livekit_session, "create_room", _fake_create_room)
    c = TestClient(m.app)
    good = c.post("/api/sessions", json={"rep_slug": "adam-pellegrino",
        "call_type": "closing", "persona_slug": "april-alvarado-closing", "difficulty": "medium"})
    assert good.status_code == 200
    sid = good.json()["data"]["session_id"]
    assert good.json()["data"]["token"] == "tok_123"
    assert c.get(f"/api/sessions/{sid}").json()["data"]["status"] == "created"
    bad = c.post("/api/sessions", json={"rep_slug": "x", "call_type": "nope",
        "persona_slug": "april-alvarado-closing", "difficulty": "medium"})
    assert bad.status_code == 400
    assert c.get("/api/sessions/nonexistent").status_code == 404
```

- [ ] **Step 2: Run to verify it fails**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_api.py -k "room_metadata or post_session" -v`
Expected: FAIL — modules/routes missing.

- [ ] **Step 3: Implement `api/session_store.py`**

```python
"""Standalone SQLite persistence for roleplay sessions (API-owned)."""

from __future__ import annotations

import sqlite3
from pathlib import Path

_SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions(
  session_id TEXT PRIMARY KEY, rep_slug TEXT, bot_slug TEXT, call_type TEXT,
  difficulty TEXT, room TEXT, status TEXT, created_at TEXT, score_json TEXT);
"""


def connect(path: str | Path) -> sqlite3.Connection:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.executescript(_SCHEMA)
    return conn


def create_session(conn: sqlite3.Connection, rec: dict) -> None:
    conn.execute(
        "INSERT INTO sessions(session_id, rep_slug, bot_slug, call_type, difficulty, "
        "room, status, created_at, score_json) VALUES(:session_id,:rep_slug,:bot_slug,"
        ":call_type,:difficulty,:room,:status,:created_at,:score_json)", rec)
    conn.commit()


def get_session(conn: sqlite3.Connection, sid: str) -> dict | None:
    row = conn.execute("SELECT * FROM sessions WHERE session_id=?", (sid,)).fetchone()
    return dict(row) if row else None
```

- [ ] **Step 4: Implement `api/livekit_session.py`**

```python
"""LiveKit room metadata + join-token minting for the session handoff."""

from __future__ import annotations

import json
from datetime import timedelta

from api.settings import Settings


def build_room_metadata(session_id: str, rep_slug: str, bot_slug: str,
                        difficulty: str) -> str:
    return json.dumps({"session_id": session_id, "rep_slug": rep_slug,
                       "bot_slug": bot_slug, "difficulty": difficulty})


def mint_token(room: str, identity: str, settings: Settings) -> str:
    from livekit import api as lk

    return (lk.AccessToken(settings.livekit_key, settings.livekit_secret)
            .with_identity(identity).with_ttl(timedelta(hours=1))
            .with_grants(lk.VideoGrants(room_join=True, room=room)).to_jwt())


async def create_room(room: str, metadata: str, settings: Settings) -> None:
    from livekit import api as lk

    client = lk.LiveKitAPI(settings.livekit_url, settings.livekit_key,
                           settings.livekit_secret)
    try:
        await client.room.create_room(lk.CreateRoomRequest(name=room, metadata=metadata))
    finally:
        await client.aclose()
```

- [ ] **Step 5: Implement `api/routers/sessions.py`**

```python
"""Roleplay session endpoints — create (LiveKit handoff) + read."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api import livekit_session, session_store
from api.schemas import ok
from api.settings import load_settings
from api.routers.catalog import bot_config

router = APIRouter(prefix="/api")


class StartSession(BaseModel):
    rep_slug: str
    call_type: str
    persona_slug: str
    difficulty: str


def _uuid() -> str:
    import uuid
    return uuid.uuid4().hex


@router.post("/sessions")
async def start_session(body: StartSession) -> dict:
    if body.call_type not in bot_config.list_layer_slugs("call_types"):
        raise HTTPException(status_code=400, detail=f"unknown call_type {body.call_type!r}")
    if body.persona_slug not in bot_config.list_layer_slugs("bots"):
        raise HTTPException(status_code=400, detail=f"unknown persona {body.persona_slug!r}")
    if body.difficulty not in bot_config.list_layer_slugs("difficulty"):
        raise HTTPException(status_code=400, detail=f"unknown difficulty {body.difficulty!r}")
    settings = load_settings()
    sid = _uuid()
    room = f"roleplay_{sid}"
    metadata = livekit_session.build_room_metadata(
        sid, body.rep_slug, body.persona_slug, body.difficulty)
    try:
        await livekit_session.create_room(room, metadata, settings)
        token = livekit_session.mint_token(room, body.rep_slug or "rep", settings)
    except Exception as exc:  # noqa: BLE001 - surface as 502, no secret leak
        raise HTTPException(status_code=502, detail="livekit session start failed") from exc
    conn = session_store.connect(settings.sessions_db)
    session_store.create_session(conn, {
        "session_id": sid, "rep_slug": body.rep_slug, "bot_slug": body.persona_slug,
        "call_type": body.call_type, "difficulty": body.difficulty, "room": room,
        "status": "created", "created_at": datetime.now(timezone.utc).isoformat(),
        "score_json": None})
    return ok({"session_id": sid, "room": room, "token": token,
               "livekit_url": settings.livekit_url})


@router.get("/sessions/{sid}")
def get_session(sid: str) -> dict:
    conn = session_store.connect(load_settings().sessions_db)
    rec = session_store.get_session(conn, sid)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"no session {sid!r}")
    return ok({"session_id": rec["session_id"], "status": rec["status"],
               "score": rec["score_json"]})
```

Register in `api/main.py`: add `sessions` to the import and `app.include_router(sessions.router)`.

- [ ] **Step 6: Run tests + ruff + commit**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_api.py -v` → all PASS.
```bash
./.venv/Scripts/python.exe -m ruff check api tests/test_api.py
git add api tests/test_api.py
git commit -m "feat: sessions — standalone store + LiveKit handoff + POST/GET routes"
```

---

## Task 8: Frontend — typed API client + wire pages + delete fakes

**Files:**
- Create: `frontend/lib/api.ts`
- Modify: `frontend/lib/data.ts`, `frontend/app/page.tsx`, `frontend/app/roleplay/page.tsx`

**Interfaces:** consumes the REST endpoints above. Produces `getCallTypes`, `getPersonas`,
`getDifficulties`, `getReps`, `getRepProfile`, `getTeamWeaknesses`, `startSession`.

- [ ] **Step 1: Create `frontend/lib/api.ts`**

```typescript
const BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000'

interface ApiResponse<T> { success: boolean; data: T | null; error: string | null }

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  const body: ApiResponse<T> = await res.json()
  if (!res.ok || !body.success || body.data === null) {
    throw new Error(body.error ?? `Request failed: ${path}`)
  }
  return body.data
}

export interface CallType { slug: string; label: string; locked: boolean; rep_objective: string }
export interface Persona { slug: string; character_name: string; business_name: string; industry: string; primary_objection: string }
export interface Difficulty { level: string; skepticism_baseline: string }
export interface RepSummary { slug: string; name: string; calls: number; avg_total_score: number | null; grade_normalized: string | null }
export interface StartSessionResult { session_id: string; room: string; token: string; livekit_url: string }

export const getCallTypes = () => get<CallType[]>('/api/call-types')
export const getPersonas = () => get<Persona[]>('/api/personas')
export const getDifficulties = () => get<Difficulty[]>('/api/difficulties')
export const getReps = () => get<RepSummary[]>('/api/reps')
export const getRepProfile = (slug: string) => get<Record<string, unknown>>(`/api/reps/${slug}`)
export const getTeamWeaknesses = () => get<{ objection_type: string; count: number }[]>('/api/analytics/team-weaknesses')

export async function startSession(body: {
  rep_slug: string; call_type: string; persona_slug: string; difficulty: string
}): Promise<StartSessionResult> {
  const res = await fetch(`${BASE}/api/sessions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const parsed: ApiResponse<StartSessionResult> = await res.json()
  if (!res.ok || !parsed.success || !parsed.data) throw new Error(parsed.error ?? 'startSession failed')
  return parsed.data
}
```

- [ ] **Step 2: Delete the fake data from `frontend/lib/data.ts`**

Remove `PERSONA_DEFS`, `PROFILE_DEFS`, `SCRIPT`, and the `FIRST_NAMES`/`LAST_NAMES`/`TITLES`/`initialsOf`
helpers. Keep `ACCENT`, `CARD_BG`, `CTA_BG`, `NAV_ITEMS`, `ROLEPLAY_TYPES` only if still referenced;
otherwise remove `ROLEPLAY_TYPES`/`DIFFICULTIES`/`EMOTIONS` too (they now come from the API).

- [ ] **Step 3: Wire `app/page.tsx` (dashboard)**

Replace imports of the deleted constants with client-side fetches (Next 14 client component):
add `'use client'` if not present, and load data in `useEffect` with loading/error/empty states:
```typescript
import { useEffect, useState } from 'react'
import { getCallTypes, getPersonas, getDifficulties, getReps,
         type CallType, type Persona, type Difficulty, type RepSummary } from '../lib/api'
// inside the component:
const [callTypes, setCallTypes] = useState<CallType[]>([])
const [personas, setPersonas] = useState<Persona[]>([])
const [difficulties, setDifficulties] = useState<Difficulty[]>([])
const [reps, setReps] = useState<RepSummary[]>([])
const [error, setError] = useState<string | null>(null)
useEffect(() => {
  Promise.all([getCallTypes(), getPersonas(), getDifficulties(), getReps()])
    .then(([c, p, d, r]) => { setCallTypes(c); setPersonas(p); setDifficulties(d); setReps(r) })
    .catch((e: unknown) => setError(e instanceof Error ? e.message : 'load failed'))
}, [])
```
Render `callTypes`/`personas`/`difficulties`/`reps` where the static arrays were used; show a
loading placeholder until the first load resolves and an error banner if `error` is set.

- [ ] **Step 4: Wire `app/roleplay/page.tsx` (Start Call)**

On call start, call `startSession({rep_slug, call_type, persona_slug, difficulty})` (values from the
dashboard selection passed via query/state), then use the returned `{token, room, livekit_url}` to
connect. Keep the existing orb/transcript UI. If `startSession` throws, show the error and don't
navigate into the call.

- [ ] **Step 5: Typecheck (build) + commit**

Run: `cd frontend && npm run build`
Expected: compiles with no TypeScript errors (fix any type mismatches surfaced).
```bash
git add frontend/lib/api.ts frontend/lib/data.ts frontend/app/page.tsx frontend/app/roleplay/page.tsx
git commit -m "feat(frontend): typed API client, wire dashboard/roleplay, remove fake data"
```

---

## Self-Review (completed)

- **Spec coverage:** catalog (Task 3), reps/profile/drill-plan from CSV (Tasks 4–5), analytics from
  CSV (Task 6), sessions + LiveKit handoff (Task 7), frontend client + fake-data removal (Task 8),
  `[dependency-groups] api` + envelope + CORS (Task 2), `cleaned_data` removal + test fix (Task 1). All spec sections mapped.
- **Placeholder scan:** none. Every code step has complete code + exact commands.
- **Type consistency:** `list_layer_slugs`, `rep_store.{rep_summaries,rep_profile,rep_drill_plan,load_rows}`,
  `objection_store.{team_ranking,load_rows}`, `session_store.{connect,create_session,get_session}`,
  `livekit_session.{build_room_metadata,mint_token,create_room}`, and the `ok/fail` envelope are used
  identically across tasks and the frontend `ApiResponse<T>` matches the server envelope.

## Open items (implementation-time)
- LiveKit token TTL fixed at 1h; participant identity = `rep_slug` — confirm against deploy.
- Whether `/api/sessions` must also trigger LiveKit Cloud agent dispatch, or a standing worker
  picks up the room (spec open item).
- Rep `slug` scheme (`slugify`) must match however the frontend links reps to detail pages.
