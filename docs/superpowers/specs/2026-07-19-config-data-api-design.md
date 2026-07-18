# Config & Data API (Spec A) — Design

**Date:** 2026-07-19
**Status:** Approved design → ready for implementation plan
**Branch:** feat/rep-trainer-runtime-loop

## Goal

A FastAPI backend that serves the **real** rep-trainer data the Next.js frontend
currently hardcodes in `frontend/lib/data.ts` (fake personas, 126 procedurally
generated reps, a canned script), and hands off live roleplay calls to the existing
LiveKit voice agent. It is a thin, read-mostly layer over already-built modules —
it exposes data, it does not re-implement logic.

## Scope

**In scope (Spec A)**
- REST endpoints for call-types, personas, difficulties, rep profiles, team analytics.
- `POST /api/sessions`: create a roleplay session — mint a LiveKit room + join token,
  set room metadata, persist a session record. This is the only real-time touchpoint.
- Wire the Next.js frontend to the API (typed client replacing `lib/data.ts`).

**Out of scope (separate specs / existing runtime)**
- The live call itself: WebRTC media, live transcript, turn-taking, in-call scoring —
  owned by the existing LiveKit voice agent (`src/agent.py`).
- Post-call scoring computation (the agent/scorer writes scores; the API only reads them).
- Authentication beyond v1 (see Decisions).

## Decisions

- **Auth v1: none.** Internal tool; the rep is identified by their profile `slug` passed
  in requests. Real per-user auth is a deferred v2 spec, required before any external exposure.
- **Deps:** `fastapi`, `uvicorn[standard]` go in a new `[dependency-groups] api` group
  (keep the voice-agent image lean). `livekit-api` is already available via `livekit-agents`.
- **Data sources (pivot 2026-07-19):** the SQLite `cleaned_data/` package is intentionally
  removed. Catalog data (personas/call-types/difficulties) comes from `prompts/*.yaml` via the
  intact `src/bot_config.py`. Rep profiles & analytics are **aggregated from flat CSVs** in
  `data/cleaned_data/` (`Sale-Rep-Profile.csv`, `Objection_data.csv`) by a new lean reader in the
  `api/` package — no SQLite, no `cleaned_data.db`.
- **Repo reorg side-effect:** removing `cleaned_data/` breaks `tests/test_cleaning.py` and the
  `from cleaned_data import db` imports in `tests/test_bot_config.py`. Those must be dropped or
  relocated as part of this work (a plan task), or CI goes red.

## Architecture

FastAPI app in a new `api/` package, run beside Next.js (uvicorn :8000, Next :3000),
CORS restricted to the Next origin (env-configurable). Catalog reads come from `prompts/*.yaml`;
rep/analytics reads are aggregated from the `data/cleaned_data/*.csv` exports; the only new
persisted state is a small standalone sessions store.

```
api/
  __init__.py
  main.py             # app, CORS, routers, ApiResponse envelope, exception handlers
  settings.py         # env: CSV paths, LiveKit URL/key/secret, sessions DB path, CORS origins
  schemas.py          # Pydantic v2 request/response models
  rep_store.py        # read Sale-Rep-Profile.csv, aggregate per rep_name (grade norm, avg score)
  objection_store.py  # read Objection_data.csv → team objection/weakness ranking
  session_store.py    # tiny standalone sqlite (data/sessions.db): create/get session
  livekit_session.py  # build room metadata + mint join token
  routers/
    catalog.py        # /call-types, /personas, /difficulties  (from prompts/*.yaml via bot_config)
    reps.py           # /reps, /reps/{slug}, /reps/{slug}/drill-plan  (from rep_store)
    analytics.py      # /analytics/team-weaknesses  (from objection_store)
    sessions.py       # POST /sessions, GET /sessions/{id}
tests/
  test_api.py         # FastAPI TestClient over CSV/YAML fixtures; LiveKit mint mocked
frontend/
  lib/api.ts          # typed fetch client (replaces the static lib/data.ts exports)
```

## Data sources (no duplication)

| Data | Source | Access |
|------|--------|--------|
| call-types | `prompts/call_types/*.yaml` | `bot_config.load_layer("call_types", slug)` |
| personas | `prompts/bots/*.yaml` + `prompts/personas/*.yaml` | `load_layer` |
| difficulties | `prompts/difficulty/*.yaml` | `load_layer` |
| rep list / profile / drill-plan | `data/cleaned_data/Sale-Rep-Profile.csv` (row-per-call) | `api/rep_store.py` aggregates per `rep_name` |
| team analytics | `data/cleaned_data/Objection_data.csv` | `api/objection_store.py` ranks by `objection_type` |
| sessions | standalone `data/sessions.db` (tiny SQLite, API-owned) | `api/session_store.py` |

`Sale-Rep-Profile.csv` is one row per scored call; `rep_store` groups by `rep_name` to produce a
rep summary (calls, avg `total_score`, normalized `grade`) and profile (recent `coaching_tip` /
`what_to_improve` / `why_no_close` snippets, `objections_surfaced`). Reuse the grade-normalization
and no-show/`total_score` parsing *rules* learned earlier (mixed letter/label grades, junk `grade`
quarantine, non-numeric `total_score` guarded) — reimplemented lean in `rep_store` since the old
package is gone. **The CSVs already contain real data, so `/reps` and `/analytics` work
immediately** — no pipeline run required (unlike the old SQLite design).

## Endpoints

All responses use `ApiResponse<T> = {success: bool, data: T | None, error: str | None}`.

- `GET /api/call-types` → `[{slug, label, locked, rep_objective}]`
- `GET /api/personas` → `[{slug, character_name, business_name, industry, primary_objection}]`
- `GET /api/difficulties` → `[{level, skepticism_baseline}]`
- `GET /api/reps` → `[{slug, name, calls, avg_total_score, grade_normalized}]` (aggregated per `rep_name` by `rep_store`)
- `GET /api/reps/{slug}` → profile: summary stats + recent `coaching_tip`/`what_to_improve`/`why_no_close`/`biggest_strength` snippets from that rep's calls; **404** if unknown slug
- `GET /api/reps/{slug}/drill-plan` → `[{focus, evidence, coaching_tip}]` — the rep's most frequent `what_to_improve` items with their `coaching_tip`
- `GET /api/analytics/team-weaknesses` → `[{objection_type, count}]` (from `Objection_data.csv` via `objection_store`)
- `POST /api/sessions` — body `{rep_slug, call_type, persona_slug, difficulty}`:
  validates each against the catalog (**400** on unknown value), mints LiveKit room+token,
  persists the session (`status="created"`), returns `{session_id, room, token, livekit_url}`.
  **502** if the LiveKit mint fails.
- `GET /api/sessions/{id}` → `{session_id, status, score}`; **404** if unknown.

## LiveKit handoff

`POST /api/sessions` builds room metadata `{"session_id","rep_slug","bot_slug","difficulty"}`
(JSON string), mints a join token with `livekit.api.AccessToken` scoped to that room, and
returns it. The existing agent already reads `ctx.room.metadata` (`src/agent.py:331`) to
resolve identity/persona, so it consumes `bot_slug`/`rep_slug` the same way — **no agent
change is required for this spec** (switching the agent from `build_prospect_prompt` to
`build_bot_prompt` is a later runtime task). Token TTL and grants (room-join only) set
server-side. Secrets come from env; never returned in errors.

## Frontend wiring

- New `frontend/lib/api.ts`: typed functions (`getCallTypes`, `getPersonas`, `getDifficulties`,
  `getReps`, `getRepProfile`, `getTeamWeaknesses`, `startSession`) hitting
  `process.env.NEXT_PUBLIC_API_BASE`, each returning the unwrapped `data` or throwing on `!success`.
- `app/page.tsx` (dashboard) fetches catalog + reps; `app/roleplay/page.tsx` "Start Call"
  calls `startSession(...)` then connects to LiveKit with the returned token.
- Delete the fake `PERSONA_DEFS`, `PROFILE_DEFS`, and `SCRIPT` from `lib/data.ts`
  (keep pure styling constants like `ACCENT`/`CARD_BG` if still used).
- Frontend shows loading / empty / error states around each fetch.

## Error handling

- Pydantic v2 models validate all POST bodies (422 on malformed input).
- A single FastAPI exception handler wraps responses in the `ApiResponse` envelope.
- Explicit status codes: 404 (unknown rep/persona/session), 400 (invalid session selection),
  502 (LiveKit mint failure). Error messages are user-safe; secrets/tracebacks never leak.
- CORS limited to configured Next origins.

## Testing

`pytest` + FastAPI `TestClient`, using small CSV/YAML **fixtures** (never the 78 MB real file):
- `rep_store`/`objection_store` aggregation unit-tested on a tiny fixture CSV (grade normalization,
  per-rep grouping, non-numeric `total_score` guarded, missing file → `[]`).
- Catalog endpoints return the expected shape from the real `prompts/*.yaml` (`closing` with
  `locked` flag; `april-alvarado` persona present).
- `/reps` over a fixture CSV; `/reps/{unknown}` → 404; empty/missing CSV → `[]` with `success: true`.
- `POST /sessions` with a bad `call_type` → 400.
- `POST /sessions` happy path with the LiveKit token mint **mocked** → returns `session_id` + token
  and persists a row in the standalone sessions store.

## Migration / compatibility

- No changes to `src/agent.py` or `src/bot_config.py` — the API imports `bot_config.load_layer`.
- **Removes the `cleaned_data/` package** (already deleted in the working tree, intentional). Its
  tests must go with it: delete `tests/test_cleaning.py`, and remove the `from cleaned_data import db`
  usages from `tests/test_bot_config.py` (its non-db bot-config tests stay green).
- Sessions live in a standalone `data/sessions.db` created by the API (`CREATE TABLE IF NOT EXISTS`);
  no shared schema.
- `lib/data.ts` static data is removed in favor of `lib/api.ts` (frontend behavior preserved, data now real).

## Open items (implementation-time)
- Exact LiveKit token TTL and whether the frontend participant identity = rep slug.
- Whether `/api/sessions` also triggers agent dispatch (LiveKit Cloud agent dispatch) or the
  agent is a standing worker that picks up the room — confirm against current deploy.
- `rep_name` → `slug` scheme for CSV reps (reuse `bot_extract`-style slugging or a local helper).
